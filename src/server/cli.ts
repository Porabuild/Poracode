import { join, dirname } from "node:path";
import { writeSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import {
  startNodePerformanceDiagnostics,
  type NodePerformanceDiagnostics,
} from "@/shared/diagnostics/nodePerformanceDiagnostics";
import { resolvePoracodeBaseDir } from "@/shared/poracodePaths";
import { joinRuntimeShutdown } from "@/backend/joinRuntimeShutdown";
import {
  activateStagedHostRoot,
  HostActivationCooperationRequiredError,
  HostStagedImportMissingError,
} from "@/backend/ownership/activationHostRoot";
import { requestNativeKeyAdoption } from "@/backend/ownership/nativeSecretKey";
import { resolveDesktopHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { HostRootInUseError } from "@/backend/ownership/hostOwnerLease";
import {
  DEFAULT_SHUTDOWN_DRAIN_DEADLINE_MS,
  installFatalErrorHandlers,
  installShutdown,
  reportFatalStartupError,
  reportUnconfirmedShutdown,
} from "./cliRuntime";
import { createHeadlessRemoteHost } from "./createHeadlessRemoteHost";
import { HeadlessCompositionShutdownError } from "./headlessRemoteComposition";
import { createHostDataBackup } from "./serverBackup";
import {
  defaultTlsSubjectNames,
  generateSelfSignedTlsMaterial,
} from "@/host/remote/server/tlsMaterial";
import {
  applyServeSettingsToEnv,
  parseServeCliOptions,
  resolveServeSettings,
  SERVER_CONFIG_FILE_NAME,
  type ServeCliOptions,
} from "./serverConfig";
import { serverLogFilePath, startServerLogFile } from "./serverLogFile";
import { collectServerDoctorReport } from "./serverDoctor";
import {
  resolveServerInstallLayout,
  resolveServerResourceDirs,
  WSL_HELPERS_DIR_ENV,
  type ServerInstallLayout,
} from "./serverInstallLayout";
import { parseUpgradeCliOptions, upgradeServerPrefix } from "./serverUpgrade";
import {
  requestHostStatusFromRunningServer,
  requestPairingFromRunningServer,
} from "./pairingControl";
import {
  parseActivateCliOptions,
  parseBackupCliOptions,
  parseDoctorCliOptions,
  parseInitTlsCliOptions,
  parsePairCliOptions,
  parseServerCliCommand,
  type ActivateCliOptions,
  type BackupCliOptions,
  type DoctorCliOptions,
  type InitTlsCliOptions,
  type PairCliOptions,
  type ServerCliCommand,
} from "./cliParse";

export type {
  ActivateCliOptions,
  BackupCliOptions,
  DoctorCliOptions,
  InitTlsCliOptions,
  PairCliOptions,
  ServerCliCommand,
};
export {
  parseActivateCliOptions,
  parseBackupCliOptions,
  parseDoctorCliOptions,
  parseInitTlsCliOptions,
  parsePairCliOptions,
  parseServerCliCommand,
};

/**
 * Standalone owner of one Poracode profile. PORACODE_BASE_DIR names the profile
 * namespace; the factory resolves and reports its separate owned server root.
 * No migration, credential initialization or persistent write precedes ownership.
 */
function profileNamespace(): string {
  return process.env.PORACODE_BASE_DIR?.trim() || resolvePoracodeBaseDir();
}

let performanceDiagnostics: NodePerformanceDiagnostics | undefined;

/** The log-file sink, started once the owned root exists and joined into the
 * shutdown drain. Module-level so the fatal-error handlers can mirror their
 * final report into it. */
let logFileSink: ReturnType<typeof startServerLogFile> | undefined;

async function serve(options: ServeCliOptions = {}): Promise<void> {
  // Published layout contract (docs/STANDALONE_SERVER.md §1): explicit asset
  // declarations win; otherwise the layout is inferred from the running
  // bundle's directory. An arrangement outside the supported shapes fails
  // loudly here instead of silently misresolving resources — the one escape
  // hatch is declaring the required assets explicitly (the SSH-runtime shape).
  let layout: ServerInstallLayout | undefined;
  try {
    layout = resolveServerInstallLayout({ libDir: __dirname });
  } catch (error) {
    if (process.env[WSL_HELPERS_DIR_ENV]?.trim() === undefined) throw error;
    layout = undefined;
  }
  const resources = resolveServerResourceDirs({
    env: process.env,
    ...(layout !== undefined ? { layout } : {}),
  });
  performanceDiagnostics = startNodePerformanceDiagnostics("server");
  process.env.PORACODE_HEADLESS_SERVER = "1";
  // Operability configuration (plan item 4.9): optional JSON config file +
  // --host/--port/--config CLI flags, resolved with the documented precedence
  // (flag > environment > config file > built-in default) and mapped onto the
  // environment contract the composed host already reads.
  const settings = resolveServeSettings({
    flags: options,
    env: process.env,
    defaultConfigPath: join(profileNamespace(), SERVER_CONFIG_FILE_NAME),
  });
  for (const warning of settings.warnings) {
    console.warn("[poracode-server] %s", warning);
  }
  const appliedEnv = applyServeSettingsToEnv(settings);
  if (settings.configPath !== undefined) {
    console.log("[poracode-server] config file: %s", settings.configPath);
  }
  if (appliedEnv.length > 0) {
    console.log("[poracode-server] configured via CLI/config: %s", appliedEnv.join(", "));
  }
  const relayUrl = process.env.PORACODE_REMOTE_RELAY_URL?.trim();
  const environmentKey = process.env.PORACODE_SECRET_STORAGE_KEY;
  const relaySecret = process.env.PORACODE_REMOTE_RELAY_SECRET;
  let host: Awaited<ReturnType<typeof createHeadlessRemoteHost>> | undefined;
  let closingHost: Promise<void> | undefined;
  const cancellation = new AbortController();
  const startup = Promise.withResolvers<void>();
  // A failed startup may keep its owner alive without receiving a signal yet.
  void startup.promise.catch(() => undefined);
  const closeHost = (): Promise<void> => {
    if (!host) return Promise.resolve();
    if (closingHost) return closingHost;
    const barrier = Promise.withResolvers<void>();
    closingHost = barrier.promise;
    try {
      void host.dispose().then(barrier.resolve, barrier.reject);
    } catch (error) {
      barrier.reject(error);
    }
    return closingHost;
  };
  const closeLogFile = (): Promise<void> => {
    logFileSink?.stop();
    logFileSink = undefined;
    return Promise.resolve();
  };
  installFatalErrorHandlers("[poracode-server]", {
    onFatal: (level, message, error) => {
      // Routed through console.error so an installed log sink captures the
      // final report synchronously before the forced exit.
      console.error("%s [%s]:", message, level, error);
    },
    flushSync: () => {
      host?.server.flushAuditSync();
    },
  });
  const uninstallShutdown = installShutdown(
    "[poracode-server]",
    async () => {
      cancellation.abort(new Error("Headless startup was cancelled by shutdown."));
      try {
        // Initiate cancellation while joining startup. Waiting for startup first
        // would leave a held listener's own cancellation path unreachable.
        await joinRuntimeShutdown([closeHost, () => startup.promise, closeLogFile]);
      } finally {
        await performanceDiagnostics?.stop();
      }
    },
    { drainDeadlineMs: settings.shutdownDrainDeadlineMs },
  );
  let info;
  try {
    host = await createHeadlessRemoteHost({
      appVersion: process.env.PORACODE_APP_VERSION?.trim() || "dev",
      isDev: process.env.PORACODE_IS_DEV === "1" || Boolean(process.env.VITE_DEV_SERVER_URL),
      baseDir: profileNamespace(),
      supervisorPath: join(__dirname, "supervisor.cjs"),
      wslHelpersDir: resources.wslHelpersDir,
      ...(resources.bundledSkillsDir !== undefined
        ? { bundledSkillsDir: resources.bundledSkillsDir }
        : {}),
      ...(resources.bundledPluginsDir !== undefined
        ? { bundledPluginsDir: resources.bundledPluginsDir }
        : {}),
      ...(resources.agentPluginsDir !== undefined
        ? { agentPluginsDir: resources.agentPluginsDir }
        : {}),
      ...(resources.computerUseHelperRoot !== undefined
        ? { computerUseHelperRoot: resources.computerUseHelperRoot }
        : {}),
      signal: cancellation.signal,
      ...(environmentKey !== undefined ? { environmentKey } : {}),
      ...(relayUrl ? { relayUrl } : {}),
      ...(relaySecret !== undefined ? { relaySecret } : {}),
      onRelayRegistered: () => console.log("[poracode-server] relay connected"),
      reportError: (error) => console.error("[poracode-server] supervisor error:", error),
    });
    cancellation.signal.throwIfAborted();
    // The lease is held and the owned root exists from here on: start the
    // leveled, size-rotated log file before anything else logs startup state.
    // Output before this point (and any startup failure) stays on stderr,
    // where the service manager journals it.
    logFileSink = startServerLogFile({
      path: serverLogFilePath(host.dataRoot),
      level: settings.logLevel,
      maxBytes: settings.logMaxBytes,
      maxFiles: settings.logMaxFiles,
      env: process.env,
    });
    console.log(
      "[poracode-server] log file: %s (level %s, rotation %d bytes x %d)",
      serverLogFilePath(host.dataRoot),
      logFileSink.level,
      settings.logMaxBytes,
      settings.logMaxFiles,
    );
    console.log(
      "[poracode-server] shutdown drain deadline: %dms",
      settings.shutdownDrainDeadlineMs,
    );
    info = await host.start();
    cancellation.signal.throwIfAborted();
  } catch (error) {
    let failure = error;
    try {
      await closeHost();
    } catch (shutdownError) {
      failure = new HeadlessCompositionShutdownError([error, shutdownError]);
    }
    if (failure instanceof HeadlessCompositionShutdownError) {
      startup.reject(failure);
      // The signal handler owns error reporting during an intentional stop.
      if (cancellation.signal.aborted) return;
      throw failure;
    }
    startup.resolve();
    if (cancellation.signal.aborted) return;
    uninstallShutdown();
    throw error;
  }
  startup.resolve();
  const runningHost = host;
  console.log("[poracode-server] profile namespace: %s", runningHost.profileNamespace);
  console.log("[poracode-server] server data root:  %s", runningHost.dataRoot);
  console.log("[poracode-server] listening at:      %s", info.httpBaseUrl);
  console.log("[poracode-server] websocket at:      %s", info.wsBaseUrl);
  console.log(
    "[poracode-server] request pairing: poracode-server pair --json (same PORACODE_BASE_DIR)",
  );
}

async function printPairingJson(): Promise<void> {
  const options = parsePairCliOptions(process.argv.slice(3));
  const response = await requestPairingFromRunningServer(profileNamespace(), {
    ...(options.scope ? { preset: options.scope } : {}),
  });
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

async function printStatusJson(): Promise<void> {
  const response = await requestHostStatusFromRunningServer(profileNamespace());
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

/**
 * Generate self-signed TLS material for direct connections (V5 plan 4.2).
 * Writes cert/key files (key 0600), prints the SHA-256 fingerprint clients
 * pin at first pair, and echoes the env/config wiring for `serve`. Refuses
 * to overwrite existing files — re-running with the same paths is a user
 * decision, not a default.
 */
async function runInitTls(options: InitTlsCliOptions): Promise<void> {
  const dir = join(profileNamespace(), "tls");
  const certPath = options.certPath ?? join(dir, "server.crt");
  const keyPath = options.keyPath ?? join(dir, "server.key");
  const material = generateSelfSignedTlsMaterial(defaultTlsSubjectNames());
  for (const path of [certPath, keyPath]) {
    if (existsSync(path)) {
      throw new Error(`Refusing to overwrite existing file: ${path}`);
    }
  }
  mkdirSync(dirname(certPath), { recursive: true });
  if (dirname(keyPath) !== dirname(certPath)) mkdirSync(dirname(keyPath), { recursive: true });
  writeFileSync(certPath, material.cert, { encoding: "utf8", mode: 0o644 });
  writeFileSync(keyPath, material.key, { encoding: "utf8", mode: 0o600 });
  if (options.json) {
    process.stdout.write(
      `${JSON.stringify({
        certPath,
        keyPath,
        fingerprint: material.fingerprint,
        expiresAt: material.expiresAt,
      })}\n`,
    );
    return;
  }
  process.stdout.write(`[poracode-server] TLS material written:\n`);
  process.stdout.write(`[poracode-server] cert: ${certPath}\n`);
  process.stdout.write(`[poracode-server] key:  ${keyPath} (0600)\n`);
  process.stdout.write(`[poracode-server] fingerprint (sha256): ${material.fingerprint}\n`);
  process.stdout.write(`[poracode-server] expires: ${material.expiresAt}\n`);
  process.stdout.write(
    "[poracode-server] serve with: PORACODE_REMOTE_TLS_CERT=" +
      `${certPath} PORACODE_REMOTE_TLS_KEY=${keyPath}\n` +
      "  (or the config file's tlsCert/tlsKey fields)\n",
  );
}

/**
 * Complete a staged offline import (Gate 2.5 S5.1). This is the production
 * activation entry: revalidate the staged evidence, deliberately settle
 * credential custody, and leave the owned root ready for a normal start.
 */
async function activateStagedImport(options: ActivateCliOptions): Promise<void> {
  const namespace = profileNamespace();
  const result = await activateStagedHostRoot({
    profileNamespace: namespace,
    ...(options.signInAgain ? { fallback: "sign-in-again" as const } : {}),
    // One-time Electron cooperation: the running desktop owner for this
    // profile unseals the staged OS-sealed key over the loopback adoption
    // protocol; its key material is adopted as the owned headless key.
    // --sign-in-again deliberately skips cooperation and starts fresh.
    ...(options.signInAgain
      ? {}
      : {
          unsealCooperation: (sealedKey: string) =>
            requestNativeKeyAdoption(resolveDesktopHostRootPaths(namespace), sealedKey),
        }),
    onOwnerWait: () =>
      process.stdout.write(
        "[poracode-server] cooperation succeeded; quit the running Poracode app for this " +
          "profile to complete activation…\n",
      ),
  });
  if (options.json) {
    process.stdout.write(
      `${JSON.stringify({
        profileNamespace: result.profileNamespace,
        dataRoot: result.dataRoot,
        credentialOutcome: result.credentialOutcome,
        keyFingerprint: result.keyFingerprint,
        activatedAt: result.record.activatedAt,
      })}\n`,
    );
    return;
  }
  process.stdout.write(
    `[poracode-server] activated staged import for ${result.profileNamespace}\n`,
  );
  process.stdout.write(`[poracode-server] server data root:  ${result.dataRoot}\n`);
  if (result.credentialOutcome === "fresh-key-sign-in-again") {
    process.stdout.write(
      "[poracode-server] credentials:     fresh key; stored credentials from the imported " +
        "profile can no longer be decrypted and must be signed in again on each surface\n",
    );
  } else {
    process.stdout.write(
      `[poracode-server] credentials:     adopted from the staged key ` +
        `(fingerprint ${result.keyFingerprint.slice(0, 16)})\n`,
    );
  }
  process.stdout.write("[poracode-server] start the server with: poracode-server\n");
}

/**
 * Read-only diagnostics (docs/STANDALONE_SERVER.md §5): the doctor never
 * acquires the owner lease and never writes. Named checks are printed and the
 * command fails when any check is an error.
 */
async function runDoctor(options: DoctorCliOptions): Promise<void> {
  const report = await collectServerDoctorReport(
    options.logFile === undefined ? {} : { logFile: options.logFile },
  );
  if (options.json) {
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } else {
    process.stdout.write(
      `[poracode-server] doctor report for ${report.profile.profileNamespace}\n`,
    );
    process.stdout.write(`[poracode-server] server data root:  ${report.profile.dataRoot}\n`);
    for (const check of report.checks) {
      process.stdout.write(
        `[poracode-server] ${check.status.toUpperCase()} ${check.name}: ${check.detail}\n`,
      );
    }
    process.stdout.write("[poracode-server] --json emits the full machine-readable report.\n");
  }
  if (report.checks.some((check) => check.status === "error")) process.exitCode = 1;
}

/**
 * Verified backup (docs/STANDALONE_SERVER.md §6): one consistent copy of the
 * owned root, refused loudly instead of written partially; the receipt is the
 * disclosure of what was captured.
 */
async function runBackup(options: BackupCliOptions): Promise<void> {
  const receipt = await createHostDataBackup({ destination: options.to });
  if (options.json) {
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
    return;
  }
  process.stdout.write(`[poracode-server] backup captured at ${receipt.sourceDataRoot}\n`);
  process.stdout.write(`[poracode-server] destination:   ${options.to}\n`);
  process.stdout.write(
    `[poracode-server] database:     online snapshot, schema version ` +
      `${receipt.databaseSchemaVersion}, sha256 ${receipt.databaseSha256.slice(0, 16)}…\n`,
  );
  process.stdout.write(
    `[poracode-server] files:        ${receipt.files} files / ${receipt.fileBytes} bytes ` +
      `(inventory sha256 ${receipt.fileInventorySha256.slice(0, 16)}…)\n`,
  );
  process.stdout.write(`[poracode-server] credentials:  ${receipt.credentialMode}\n`);
  process.stdout.write(
    "[poracode-server] restore by staging this directory and running poracode-server activate\n",
  );
}

async function runUpgrade(options: ReturnType<typeof parseUpgradeCliOptions>): Promise<void> {
  const result = await upgradeServerPrefix(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    process.stdout.write(
      `[poracode-server] upgrade ${result.ok ? "ok" : "failed"}: ${result.detail}\n`,
    );
  }
  if (!result.ok) process.exitCode = 1;
}

function printHelp(): void {
  process.stdout.write(
    "Usage: poracode-server [serve [--config <path>] [--host <host>] [--port <port>] [--trusted-proxies <list>] | activate [--json] [--sign-in-again] | doctor [--json] [--log-file <path>] | backup --to <directory> [--json] | init-tls [--json] [--cert <path>] [--key <path>] | upgrade --from <tarball> [--prefix <path>] [--json] | pair --json [--scope viewer|operator] | status --json | --help]\n" +
      "\nPORACODE_BASE_DIR selects a profile namespace. The server owns its .host-v1 sibling.\n" +
      "Running `serve` (the default) reads an optional JSON config file —\n" +
      "  <profile>/poracode-server.json, or the path given with --config — with fields:\n" +
      "  host, port, bindMode, relayUrl, tlsCert, tlsKey, trustedProxies, logLevel, logMaxBytes,\n" +
      "  logMaxFiles, shutdownDrainDeadlineMs. CLI flags and the environment take\n" +
      "  precedence over the file, field by field; logs land in\n" +
      "  <dataRoot>/logs/server.log and rotate by size; SIGTERM drains within\n" +
      "  shutdownDrainDeadlineMs (default " +
      `${DEFAULT_SHUTDOWN_DRAIN_DEADLINE_MS}ms) and then releases the owner lease.\n` +
      "Run activate with the same profile to complete a staged offline import; credentials\n" +
      "  sealed by the desktop app are adopted via one-time desktop cooperation, or\n" +
      "  --sign-in-again starts fresh without migrating stored credentials.\n" +
      "Run doctor [--json] [--log-file <path>] for read-only diagnostics of this profile.\n" +
      "Run backup --to <directory> [--json] to capture a verified copy of the owned root.\n" +
      "Run init-tls [--json] [--cert <path>] [--key <path>] to generate self-signed TLS material\n" +
      "  (defaults to <profile>/tls/server.crt + server.key, key 0600); point\n" +
      "  PORACODE_REMOTE_TLS_CERT/KEY (or the config file's tlsCert/tlsKey) at the files.\n" +
      "Set PORACODE_SECRET_STORAGE_KEY for an explicit 32-byte base64 key, or use the owned key file.\n" +
      "Set PORACODE_REMOTE_ACCESS_HOST/PORT (or the config file's host/port) to configure the remote listener.\n" +
      "Run pair --json [--scope viewer|operator] with the same profile to request a pairing URL from its running owner.\n" +
      "Run upgrade --from <tarball> [--prefix <path>] to stage, doctor, swap the current symlink, and roll back on failed health.\n" +
      "Run status --json with the same profile to inspect the authenticated running owner.\n" +
      "Pairing credentials are printed only by that explicit command; PID signaling is unsupported.\n",
  );
}

export function runCli(): void {
  let command: ServerCliCommand;
  try {
    command = parseServerCliCommand(process.argv.slice(2));
  } catch (error) {
    reportFatalStartupError("[poracode-server]", error);
  }
  if (command === "help") {
    printHelp();
    return;
  }
  const operation =
    command === "pair-json"
      ? printPairingJson()
      : command === "status-json"
        ? printStatusJson()
        : command === "activate"
          ? activateStagedImport(parseActivateCliOptions(process.argv.slice(3)))
          : command === "doctor"
            ? runDoctor(parseDoctorCliOptions(process.argv.slice(3)))
            : command === "backup"
              ? runBackup(parseBackupCliOptions(process.argv.slice(3)))
              : command === "init-tls"
                ? runInitTls(parseInitTlsCliOptions(process.argv.slice(3)))
                : command === "upgrade"
                  ? runUpgrade(parseUpgradeCliOptions(process.argv.slice(3)))
                  : serve(parseServeCliOptions(process.argv.slice(2)));
  operation.catch(async (error) => {
    await performanceDiagnostics?.stop();
    if (error instanceof HeadlessCompositionShutdownError) {
      reportUnconfirmedShutdown("[poracode-server]", error);
      return;
    }
    if (
      error instanceof HostActivationCooperationRequiredError ||
      error instanceof HostStagedImportMissingError ||
      error instanceof HostRootInUseError
    ) {
      // A deliberate refusal, not a crash: no resources remain held (the
      // activation lease is released by its own entry), so report the
      // disclosure alone and fail without a stack trace.
      process.exitCode = 1;
      writeSync(2, `[poracode-server] ${error.message}\n`);
      return;
    }
    reportFatalStartupError("[poracode-server]", error);
  });
}

// Importing CLI helpers under the test runner never boots a listener.
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  runCli();
}
