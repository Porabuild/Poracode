import { isAbsolute, join, resolve } from "node:path";
import { writeSync, existsSync } from "node:fs";
import { z } from "zod";
import { hostBuildIdentitySchema, type HostBuildIdentity } from "@/shared/hostControlProtocol";
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
} from "./cliRuntime";
import { chromeNativeHostEnabled } from "@/host/browser/external/chromeNativeHost";
import type { HeadlessRemoteHost } from "./createHeadlessRemoteHost";
import { HeadlessCompositionShutdownError } from "./headlessRemoteCompositionSupport";
import { createHostDataBackup } from "./serverBackup";
import {
  defaultTlsSubjectNames,
  generateSelfSignedTlsMaterial,
} from "@/host/remote/server/tlsMaterial";
import {
  applyServeSettingsToEnv,
  parseServeCliOptions,
  resolveServeSettings,
  defaultServerConfigPath,
  type ServeCliOptions,
} from "./serverConfig";
import { serverLogFilePath, startServerLogFile } from "./serverLogFile";
import { collectServerDoctorReport } from "./serverDoctor";
import { resolveServerVersion } from "./serverVersion";
import {
  resolveRunningBuildIdentity,
  RunningOwnerRefusedError,
  RunningOwnerUnreachableError,
} from "./serverUpgradeIdentity";
import { resolveUpgradeStaging } from "./serverUpgradeJournal";
import {
  resolveServerInstallLayout,
  resolveServerResourceDirs,
  WSL_HELPERS_DIR_ENV,
  type ServerInstallLayout,
} from "./serverInstallLayout";
import {
  parseUpgradeCliOptions,
  upgradeServerPrefix,
  UpgradeInProgressError,
  UpgradeJournalUnreadableError,
  UpgradeRecoveryRefusedError,
  UpgradeRefusedError,
} from "./serverUpgrade";
import { abandonServerUpgrade, resumeServerUpgrade } from "./serverUpgradeRecovery";
import { stopRunningServer } from "./serverStop";
import { ServerUpgradeBusyError, ServerUpgradeLockUnreadableError } from "./serverUpgradeLock";
import { ServerUpgradeServiceTargetError } from "./serverUpgradeRestart";
import { requestPairingFromRunningServer } from "./pairingControl";
import { ensureCliOwner } from "./cliOwner";
import { runCliTui, TuiLaunchUnavailableError } from "./cliTui";
import {
  parseActivateCliOptions,
  assertTuiTerminal,
  parseBackupCliOptions,
  parseDoctorCliOptions,
  parseInitTlsCliOptions,
  parsePairCliOptions,
  parseServerCliCommand,
  parseStopCliOptions,
  parseTuiCliOptions,
  type ActivateCliOptions,
  type BackupCliOptions,
  type DoctorCliOptions,
  type InitTlsCliOptions,
  type PairCliOptions,
  type ServerCliCommand,
} from "./cliParse";
import { writeInitTlsMaterial } from "./initTlsWrite";
import { connectHostAdministration, runAdminCli, reportAdminError } from "./cliAdmin";
import { CLI_ADMIN_HELP, CLI_PROFILE_HELP, cliCommandHelp } from "./cliHelp";
import { extractBaseDir, runConfigure } from "./cliConfigure";
import {
  parseServiceCliOptions,
  runServerService,
  SERVICE_HELP,
  serviceCommandHelp,
} from "./serverService";
import { parseSetupCliOptions, runSetup, SETUP_HELP } from "./cliSetup";
import {
  CLI_COMPLETION_HELP,
  renderCompletion,
} from "../../packages/poracode-cli/lib/completion.mjs";
import { openServerWebApp } from "./cliWebApp";
import { parseStatusCliOptions, runServerStatus } from "./cliStatus";
import { CLI_LOGS_HELP, parseLogsCliOptions, runServerLogs } from "./cliLogs";
import { prepareRunCli, runRunCli } from "./cliRun";

// Mirrored by DESKTOP_CLI_BOOTSTRAP_VERSION: reject a mismatched packaged entry
// before dispatch, and retain the verified identity throughout this process.
export const DESKTOP_CLI_INTEGRATION_VERSION = 1;
const desktopCliEntrySchema = z.strictObject({
  formatVersion: z.literal(DESKTOP_CLI_INTEGRATION_VERSION),
  build: hostBuildIdentitySchema,
});

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

async function serve(
  options: ServeCliOptions = {},
  defaultOpen = false,
  capturedBuild?: HostBuildIdentity,
): Promise<AbortSignal | undefined> {
  // Published layout contract (docs/STANDALONE_SERVER.md §3.1): explicit asset
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
  // D4: the identity this process publishes on the authenticated status call,
  // and whether an interrupted upgrade staged this exact release. A staged
  // candidate holds remote admission until the upgrader proves its build.
  const buildIdentity =
    capturedBuild ??
    resolveRunningBuildIdentity(layout !== undefined ? { libDir: layout.libDir } : {});
  const staging = resolveUpgradeStaging({
    ...(layout !== undefined ? { layout } : {}),
    env: process.env,
  });
  const version =
    capturedBuild?.version ?? resolveServerVersion(layout !== undefined ? { layout } : {}).version;
  let runtimePersistence: typeof import("@/host/db/runtimePersistenceRuntime") | undefined;
  performanceDiagnostics = startNodePerformanceDiagnostics("server", process.env, {
    // B1: additive bounded-persistence evidence on the existing sample lines.
    sampleRuntimePersistence: () => runtimePersistence?.getRuntimePersistenceSample() ?? null,
  });
  process.env.PORACODE_HEADLESS_SERVER = "1";
  // Operability configuration (plan item 4.9): optional JSON config file +
  // --host/--port/--config CLI flags, resolved with the documented precedence
  // (flag > environment > config file > built-in default) and mapped onto the
  // environment contract the composed host already reads.
  const settings = resolveServeSettings({
    flags: options,
    env: process.env,
    defaultConfigPath: defaultServerConfigPath(profileNamespace()),
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
  let host: HeadlessRemoteHost | undefined;
  let openingWebApp: Promise<string | undefined> | undefined;
  let closingHost: Promise<void> | undefined;
  const cancellation = new AbortController();
  const startup = Promise.withResolvers<void>();
  // A failed startup may keep its owner alive without receiving a signal yet.
  void startup.promise.catch(() => undefined);
  const closeHost = (): Promise<void> => {
    if (!host) return Promise.resolve();
    if (closingHost) return closingHost;
    const ownedHost = host;
    const barrier = Promise.withResolvers<void>();
    closingHost = barrier.promise;
    void (async () => {
      await openingWebApp?.catch(() => undefined);
      await ownedHost.dispose();
    })().then(barrier.resolve, barrier.reject);
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
  const shutdownControl = installShutdown(
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
  const isDev = process.env.PORACODE_IS_DEV === "1" || Boolean(process.env.VITE_DEV_SERVER_URL);
  try {
    runtimePersistence = await import("@/host/db/runtimePersistenceRuntime");
    cancellation.signal.throwIfAborted();
    const { createHeadlessRemoteHost } = await import("./createHeadlessRemoteHost");
    cancellation.signal.throwIfAborted();
    host = await createHeadlessRemoteHost({
      // Immutable artifact metadata first; `unknown` never masquerades as a
      // version, and the `dev` placeholder is never trusted for identity.
      appVersion: version,
      isDev,
      baseDir: profileNamespace(),
      supervisorPath: join(__dirname, "supervisor.cjs"),
      databaseReadWorkerPath: join(__dirname, "databaseReadWorker.cjs"),
      sessionExportWorkerPath: join(__dirname, "sessionExportWorker.cjs"),
      wslHelpersDir: resources.wslHelpersDir,
      buildIdentity,
      staging,
      requestShutdown: () => shutdownControl.requestShutdown("host-control shutdown request"),
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
      // Every production profile registers; dev servers only when opted in.
      registerChromeNativeHost: chromeNativeHostEnabled(!isDev, process.env),
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
    if (options.open ?? (defaultOpen && !!process.stdout.isTTY)) {
      openingWebApp = openServerWebApp({
        server: host.server,
        info,
        signal: cancellation.signal,
        explicit: options.open === true,
      });
      const warning = await openingWebApp;
      if (warning) console.warn("[poracode-server] %s", warning);
      cancellation.signal.throwIfAborted();
    }
  } catch (error) {
    let failure = error;
    // A failed startup already attempted cleanup. Bound that join before
    // awaiting it: a cleanup that hangs or refuses cannot hold the owner lease
    // indefinitely without a signal. The bound is disarmed below only when the
    // join confirms; exit status is already fatal either way.
    shutdownControl.armFatalStartup();
    try {
      await closeHost();
    } catch (shutdownError) {
      failure = new HeadlessCompositionShutdownError([error, shutdownError]);
    }
    if (failure instanceof HeadlessCompositionShutdownError) {
      startup.reject(failure);
      // The signal handler owns error reporting during an intentional stop.
      if (cancellation.signal.aborted) return;
      // Cleanup could not confirm. Report the bounded unconfirmed diagnostic
      // once; the already-armed deadline owns the exit, and the forced exit
      // releases the lease's kernel lock. Nothing is announced or released here.
      shutdownControl.failStartup(failure);
      throw failure;
    }
    startup.resolve();
    if (cancellation.signal.aborted) return;
    shutdownControl.uninstall();
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
  return cancellation.signal;
}

async function printPairingJson(options: PairCliOptions): Promise<void> {
  const response = await requestPairingFromRunningServer(profileNamespace(), {
    ...(options.scope ? { preset: options.scope } : {}),
  });
  process.stdout.write(
    options.json
      ? `${JSON.stringify(response)}\n`
      : `${response.pairingUrl}\n\nOpen this one-time link on the additional client, or paste it into Add server.\nA loopback address reaches only this host; use a reachable, secured endpoint or an SSH tunnel.\nRun clients list to inspect paired access; clients revoke <id> removes it.\n`,
  );
}

async function runStop(options: { expectedPid?: number }): Promise<void> {
  const result = await stopRunningServer(profileNamespace(), options);
  process.stdout.write(
    result.outcome === "not-running"
      ? "[poracode-server] no running owner for this profile\n"
      : `[poracode-server] owner ${result.pid} stopped\n`,
  );
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
  writeInitTlsMaterial({
    certPath,
    keyPath,
    cert: material.cert,
    key: material.key,
    restrictKeyDirectory: options.keyPath === undefined,
  });
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
 * Read-only diagnostics (docs/STANDALONE_SERVER.md §8.1): the doctor never
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
 * Verified backup (docs/STANDALONE_SERVER.md §8.2): one consistent copy of the
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
  const result = options.abandonJournal
    ? await abandonServerUpgrade(options)
    : options.resume
      ? await resumeServerUpgrade(options)
      : await upgradeServerPrefix(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    process.stdout.write(
      `[poracode-server] upgrade ${result.ok ? "ok" : "failed"}: ${result.detail}\n`,
    );
  }
  if (!result.ok) process.exitCode = 1;
}

/**
 * Print the immutable artifact version (plan D1/D3). A layout whose metadata
 * cannot be read reports `unknown` and fails; it never invents a version.
 */
function runVersion(capturedBuild?: HostBuildIdentity): void {
  if (capturedBuild) {
    process.stdout.write(`${capturedBuild.version}\n`);
    return;
  }
  const info = resolveServerVersion();
  process.stdout.write(`${info.version}\n`);
  if (info.source === "unknown") {
    process.stderr.write(
      "[poracode-server] could not read the installed artifact version " +
        "(<layout>/package.json); set PORACODE_APP_VERSION to declare one explicitly.\n",
    );
    process.exitCode = 1;
  }
}

function printHelp(args: readonly string[]): void {
  if (args[0] === "setup") {
    process.stdout.write(SETUP_HELP + CLI_PROFILE_HELP);
    return;
  }
  if (args[0] === "service") {
    process.stdout.write(serviceCommandHelp(args[1]) + CLI_PROFILE_HELP);
    return;
  }
  const focused = cliCommandHelp(args[0] ?? "", args[1]);
  if (focused) {
    process.stdout.write(focused);
    return;
  }
  process.stdout.write(
    "Poracode CLI commands:\n" +
      CLI_ADMIN_HELP +
      SETUP_HELP +
      SERVICE_HELP +
      CLI_COMPLETION_HELP +
      "\n" +
      "Usage: poracode [tui [--continue|-c] [--session ID] [--prompt TEXT] [--auto] [DIRECTORY] | " +
      "-p|--print PROMPT [--provider K] [--model M] [--effort E] [--format text|json] [--directory PATH] | " +
      "serve [--open|--no-open] [--config <path>] [--host <host>] [--port <port>] [--trusted-proxies <list>] | " +
      "setup [--start|--no-start] [--skip-auth] | activate [--json] [--sign-in-again] | doctor [--json] [--log-file <path>] | logs [--follow] [--lines N] [--json] | backup --to <directory> [--json] | init-tls [--json] [--cert <path>] [--key <path>] | upgrade --from <tarball> [--prefix <path>] [--json] | pair --json [--scope viewer|operator] | status [--details] [--json] | stop [--if-pid PID] | --version | --help]\n" +
      "\nPORACODE_BASE_DIR selects a profile namespace. The server owns its .host-v1 sibling.\n" +
      "Bare invocation opens the TUI when stdin and stdout are terminals; otherwise it serves the current profile without opening a browser.\n" +
      "Use serve --open (or --open) for the web app; --no-open means server only.\n" +
      "The TUI and one-shot -p start a detached background server when no owner is running.\n" +
      "Server invocations read an optional JSON config file -\n" +
      "  <profile>.server.json, an existing <profile>/poracode-server.json (takes precedence),\n" +
      "  or the path given with --config — with fields:\n" +
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
      CLI_LOGS_HELP +
      "Run backup --to <directory> [--json] to capture a verified copy of the owned root.\n" +
      "Run init-tls [--json] [--cert <path>] [--key <path>] to generate self-signed TLS material\n" +
      "  (defaults to <profile>/tls/server.crt + server.key, key 0600); point\n" +
      "  PORACODE_REMOTE_TLS_CERT/KEY (or the config file's tlsCert/tlsKey) at the files.\n" +
      "Set PORACODE_SECRET_STORAGE_KEY for an explicit 32-byte base64 key, or use the owned key file.\n" +
      "Set PORACODE_REMOTE_ACCESS_HOST/PORT (or the config file's host/port) to configure the remote listener.\n" +
      "Run pair --json [--scope viewer|operator] with the same profile to request a pairing URL from its running owner.\n" +
      "Run upgrade --from <tarball> [--prefix <path>] to stage a distinct release, drain the authenticated owner,\n" +
      "  capture a pre-migration backup when a forward-only migration is pending, swap the current symlink, then\n" +
      "  qualify the candidate through its authenticated build identity before admission. A failed candidate is\n" +
      "  rolled back only when the pending migrations are rollback-compatible and the schema is known; otherwise\n" +
      "  the result is explicit recovery and the data plus backup are preserved.\n" +
      "Run upgrade --resume [--from <tarball>] [--confirm] to continue an interrupted upgrade after the\n" +
      "  authenticated owner/build evidence is re-verified; phases past the drain boundary require --confirm.\n" +
      "Run upgrade --abandon-journal --confirm to remove an interrupted journal without touching data or\n" +
      "  the current release; it refuses while the staged candidate is the active current release and was\n" +
      "  not admitted.\n" +
      "Run status --details with the same profile to inspect the authenticated running build and admission; basic status supports older owners.\n" +
      "Run stop with the same profile to ask its authenticated owner to drain and exit (the graceful\n" +
      "  stop on every platform, and the only one on Windows); it waits for the owner to report stopped\n" +
      "  and exits non-zero on refusal or timeout.\n" +
      "Pairing credentials are printed only by pair; browser opening uses a separate short-lived grant.\n" +
      "PID signaling is unsupported.\n",
  );
}

export function runCli(): void {
  dispatchCli();
}

/** Local packaged-bootstrap entry; this context never travels through env or IPC. */
export function runDesktopCli(input: unknown): void {
  const { build } = desktopCliEntrySchema.parse(input);
  const sameRoot =
    process.platform === "win32"
      ? resolve(build.root).toLowerCase() === resolve(__dirname, "..").toLowerCase()
      : resolve(build.root) === resolve(__dirname, "..");
  if (
    !isAbsolute(build.root) ||
    !sameRoot ||
    build.layoutKind !== "prefix" ||
    build.entrypointSha256 === null
  )
    throw new Error(
      "The desktop bootstrap supplied a different or incomplete captured build identity.",
    );
  dispatchCli(build);
}

function dispatchCli(capturedBuild?: HostBuildIdentity): void {
  let command: ReturnType<typeof parseServerCliCommand>;
  let args: string[];
  let baseDirArgument: string | undefined;
  try {
    const raw = process.argv.slice(2);
    // Completion words are data, including any --base-dir being completed.
    if (raw[0] === "completion") {
      process.stdout.write(renderCompletion(raw.slice(1)));
      return;
    }
    const parsed = extractBaseDir(raw);
    args = parsed.args;
    baseDirArgument = parsed.baseDir;
    if (baseDirArgument) process.env.PORACODE_BASE_DIR = baseDirArgument;
    command = parseServerCliCommand(
      args,
      process.stdin.isTTY === true && process.stdout.isTTY === true,
    );
  } catch (error) {
    reportAdminError(error, process.argv.includes("--json"));
    return;
  }
  if (command === "help") {
    try {
      printHelp(args);
      if (capturedBuild)
        process.stdout.write(
          "Desktop-provided CLI: use native Node.js for standalone upgrades and managed-service installation. Update the desktop through its own updater.\n",
        );
    } catch (error) {
      reportAdminError(error, false);
    }
    return;
  }
  if (command === "version") {
    runVersion(capturedBuild);
    return;
  }
  if (command === "completion") {
    try {
      process.stdout.write(renderCompletion(args.slice(1)));
    } catch (error) {
      reportAdminError(error, args.includes("--json"));
    }
    return;
  }
  if (capturedBuild && command === "upgrade") {
    reportAdminError(
      new Error(
        "Use the standalone CLI under supported native Node.js to upgrade a service prefix. Update the desktop installation through its own updater; this Electron CLI will not swap or restart a native runtime.",
      ),
      args.includes("--json"),
    );
    return;
  }
  const operation =
    command === "service"
      ? runServerService(profileNamespace(), parseServiceCliOptions(args.slice(1))).then(
          (result) => {
            if (args.includes("--json")) process.stdout.write(`${JSON.stringify(result)}\n`);
            else {
              process.stdout.write(`Service: ${result.state}\n`);
              if ("registration" in result && result.registration) {
                const registration = result.registration;
                process.stdout.write(
                  `Prefix: ${registration.installPrefix}\nProfile: ${registration.profileNamespace}\nManager: ${registration.manager} (${registration.account.id})\nConfig: ${registration.configPath ?? "default namespace precedence"}\n`,
                );
              }
              if ("ownerGeneration" in result)
                process.stdout.write(
                  `Owner generation: ${result.ownerGeneration ?? "not running"}\n`,
                );
              if ("native" in result && result.native)
                process.stdout.write(
                  `Native state: ${result.native.ActiveState ?? result.native.LoadState}\n`,
                );
              if ("ownerManaged" in result && result.ownerGeneration)
                process.stdout.write(
                  `Registered owner: ${result.ownerManaged ? "yes" : "no; standalone owner was not adopted"}\n`,
                );
              if ("detail" in result) process.stdout.write(`${result.detail}\n`);
              process.stdout.write(
                "One registration per explicit prefix; run service status --prefix <same-prefix> or doctor with the same --base-dir.\n",
              );
            }
          },
        )
      : command === "logs"
        ? runServerLogs(profileNamespace(), parseLogsCliOptions(args.slice(1)))
        : command === "admin"
          ? runAdministration(args, capturedBuild, {
              ...(baseDirArgument !== undefined ? { baseDir: baseDirArgument } : {}),
            })
          : command === "print"
            ? runAdministration(["run", ...args.slice(1)], capturedBuild, {
                ...(baseDirArgument !== undefined ? { baseDir: baseDirArgument } : {}),
                oneShot: true,
              })
            : command === "tui"
              ? args.length === 0
                ? // Bare interactive `poracode` predates the TUI: an install
                  // with no TUI binary keeps the old behavior instead of
                  // failing. Explicit `poracode tui` still reports the error.
                  runTuiCommand(args.slice(1), capturedBuild, baseDirArgument).catch((error) => {
                    if (!(error instanceof TuiLaunchUnavailableError)) throw error;
                    writeSync(2, `${error.message}\n`);
                    return serve(parseServeCliOptions([]), true, capturedBuild);
                  })
                : runTuiCommand(args.slice(1), capturedBuild, baseDirArgument)
              : command === "configure"
                ? runConfigure(profileNamespace(), args.slice(1))
                : command === "setup"
                  ? runSetup(
                      profileNamespace(),
                      parseSetupCliOptions(args.slice(1)),
                      (config, open) => serve({ config, open }, false, capturedBuild),
                    )
                  : command === "pair-json"
                    ? printPairingJson(parsePairCliOptions(args.slice(1)))
                    : command === "status-json"
                      ? runServerStatus(profileNamespace(), parseStatusCliOptions(args.slice(1)))
                      : command === "stop"
                        ? runStop(parseStopCliOptions(args.slice(1)))
                        : command === "activate"
                          ? activateStagedImport(parseActivateCliOptions(args.slice(1)))
                          : command === "doctor"
                            ? runDoctor(parseDoctorCliOptions(args.slice(1)))
                            : command === "backup"
                              ? runBackup(parseBackupCliOptions(args.slice(1)))
                              : command === "init-tls"
                                ? runInitTls(parseInitTlsCliOptions(args.slice(1)))
                                : command === "upgrade"
                                  ? runUpgrade(parseUpgradeCliOptions(args.slice(1)))
                                  : serve(
                                      parseServeCliOptions(args),
                                      args[0] !== "serve",
                                      capturedBuild,
                                    );
  operation.catch(async (error) => {
    await performanceDiagnostics?.stop();
    if (error instanceof HeadlessCompositionShutdownError) {
      // serve() already reported the unconfirmed cleanup and armed the bounded
      // fatal-startup deadline through the installed shutdown control. Exiting
      // here would release the owner while cleanup is unconfirmed.
      return;
    }
    if (
      [
        "admin",
        "print",
        "tui",
        "configure",
        "setup",
        "pair-json",
        "status-json",
        "service",
        "logs",
      ].includes(command)
    ) {
      reportAdminError(error, command !== "logs" && args.includes("--json"));
      return;
    }
    if (
      error instanceof HostActivationCooperationRequiredError ||
      error instanceof HostStagedImportMissingError ||
      error instanceof HostRootInUseError ||
      error instanceof UpgradeInProgressError ||
      error instanceof UpgradeJournalUnreadableError ||
      error instanceof UpgradeRecoveryRefusedError ||
      error instanceof UpgradeRefusedError ||
      error instanceof ServerUpgradeBusyError ||
      error instanceof ServerUpgradeLockUnreadableError ||
      error instanceof ServerUpgradeServiceTargetError ||
      error instanceof RunningOwnerRefusedError ||
      error instanceof RunningOwnerUnreachableError
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

async function runTuiCommand(
  args: readonly string[],
  capturedBuild: HostBuildIdentity | undefined,
  baseDir: string | undefined,
) {
  assertTuiTerminal(process.stdin.isTTY === true, process.stdout.isTTY === true);
  const options = parseTuiCliOptions(args);
  const code = await runCliTui(options, {
    profileNamespace: profileNamespace(),
    ...(baseDir !== undefined ? { baseDir } : {}),
    ...(capturedBuild !== undefined ? { capturedBuild } : {}),
  });
  if (code !== 0) process.exitCode = code;
}

async function runAdministration(
  args: string[],
  capturedBuild?: HostBuildIdentity,
  options: { readonly baseDir?: string; readonly oneShot?: boolean } = {},
) {
  const profile = profileNamespace();
  const run = await prepareRunCli(args, profile, {
    ...(options.oneShot ? { oneShot: true } : {}),
    defaultDirectory: process.cwd(),
  });
  if (run?.standalone) {
    const { runStandaloneCli } = await import("./cliStandaloneRun");
    return runStandaloneCli(profile, run, __dirname, capturedBuild);
  }
  if (run && "defaultSelection" in run && run.defaultSelection)
    await ensureCliOwner(profile, {
      ...(options.baseDir !== undefined ? { baseDir: options.baseDir } : {}),
      ...(capturedBuild !== undefined ? { capturedBuild } : {}),
    });
  if (run) return runRunCli(run, (signal) => connectHostAdministration(profile, signal));
  return runAdminCli(profile, args);
}

// Importing CLI helpers under the test runner never boots a listener.
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  runCli();
}
