import { join } from "node:path";
import { writeSync } from "node:fs";
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
import { installShutdown, reportFatalStartupError, reportUnconfirmedShutdown } from "./cliRuntime";
import { createHeadlessRemoteHost } from "./createHeadlessRemoteHost";
import { HeadlessCompositionShutdownError } from "./headlessRemoteComposition";
import { createHostDataBackup } from "./serverBackup";
import { collectServerDoctorReport } from "./serverDoctor";
import {
  resolveServerInstallLayout,
  resolveServerResourceDirs,
  WSL_HELPERS_DIR_ENV,
  type ServerInstallLayout,
} from "./serverInstallLayout";
import {
  requestHostStatusFromRunningServer,
  requestPairingFromRunningServer,
} from "./pairingControl";

/**
 * Standalone owner of one Poracode profile. PORACODE_BASE_DIR names the profile
 * namespace; the factory resolves and reports its separate owned server root.
 * No migration, credential initialization or persistent write precedes ownership.
 */
function profileNamespace(): string {
  return process.env.PORACODE_BASE_DIR?.trim() || resolvePoracodeBaseDir();
}

let performanceDiagnostics: NodePerformanceDiagnostics | undefined;

async function serve(): Promise<void> {
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
  const uninstallShutdown = installShutdown("[poracode-server]", async () => {
    cancellation.abort(new Error("Headless startup was cancelled by shutdown."));
    try {
      // Initiate cancellation while joining startup. Waiting for startup first
      // would leave a held listener's own cancellation path unreachable.
      await joinRuntimeShutdown([closeHost, () => startup.promise]);
    } finally {
      await performanceDiagnostics?.stop();
    }
  });
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
      signal: cancellation.signal,
      ...(environmentKey !== undefined ? { environmentKey } : {}),
      ...(relayUrl ? { relayUrl } : {}),
      ...(relaySecret !== undefined ? { relaySecret } : {}),
      onRelayRegistered: () => console.log("[poracode-server] relay connected"),
      reportError: (error) => console.error("[poracode-server] supervisor error:", error),
    });
    cancellation.signal.throwIfAborted();
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

export type ServerCliCommand =
  | "serve"
  | "pair-json"
  | "status-json"
  | "activate"
  | "doctor"
  | "backup"
  | "help";

export interface ActivateCliOptions {
  readonly json: boolean;
  readonly signInAgain: boolean;
}

export interface DoctorCliOptions {
  readonly json: boolean;
  /** Optional log file for the redacted recent-errors tail. */
  readonly logFile?: string;
}

export interface BackupCliOptions {
  readonly json: boolean;
  /** Backup destination directory; must not exist and must not overlap the root. */
  readonly to: string;
}

export function parseServerCliCommand(args: readonly string[]): ServerCliCommand {
  if (args.length === 0) return "serve";
  if (args.length === 1 && ["--help", "-h", "help"].includes(args[0]!)) return "help";
  if (args.length === 2 && args[0] === "pair" && args[1] === "--json") return "pair-json";
  if (args.length === 2 && args[0] === "status" && args[1] === "--json") return "status-json";
  if (args[0] === "activate") {
    parseActivateCliOptions(args.slice(1));
    return "activate";
  }
  if (args[0] === "doctor") {
    parseDoctorCliOptions(args.slice(1));
    return "doctor";
  }
  if (args[0] === "backup") {
    parseBackupCliOptions(args.slice(1));
    return "backup";
  }
  throw new Error(
    "Usage: poracode-server [activate [--json] [--sign-in-again] | doctor [--json] [--log-file <path>] | " +
      "backup --to <directory> [--json] | pair --json | status --json | --help]",
  );
}

/** Deliberate activation flags; anything unknown is a usage error. */
export function parseActivateCliOptions(args: readonly string[]): ActivateCliOptions {
  let json = false;
  let signInAgain = false;
  for (const argument of args) {
    if (argument === "--json") json = true;
    else if (argument === "--sign-in-again") signInAgain = true;
    else throw new Error("Usage: poracode-server activate [--json] [--sign-in-again]");
  }
  return { json, signInAgain };
}

/** Read-only diagnostics flags; anything unknown is a usage error. */
export function parseDoctorCliOptions(args: readonly string[]): DoctorCliOptions {
  let json = false;
  let logFile: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--json") {
      json = true;
    } else if (argument === "--log-file") {
      const value = args[index + 1];
      if (value === undefined) {
        throw new Error("Usage: poracode-server doctor [--json] [--log-file <path>]");
      }
      logFile = value;
      index += 1;
    } else {
      throw new Error("Usage: poracode-server doctor [--json] [--log-file <path>]");
    }
  }
  return { json, ...(logFile !== undefined ? { logFile } : {}) };
}

/** Verified-backup flags; the destination is required, anything else is a usage error. */
export function parseBackupCliOptions(args: readonly string[]): BackupCliOptions {
  let json = false;
  let to: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--json") {
      json = true;
    } else if (argument === "--to") {
      const value = args[index + 1];
      if (value === undefined) {
        throw new Error("Usage: poracode-server backup --to <directory> [--json]");
      }
      to = value;
      index += 1;
    } else {
      throw new Error("Usage: poracode-server backup --to <directory> [--json]");
    }
  }
  if (to === undefined) {
    throw new Error("Usage: poracode-server backup --to <directory> [--json]");
  }
  return { json, to };
}

async function printPairingJson(): Promise<void> {
  const response = await requestPairingFromRunningServer(profileNamespace());
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

async function printStatusJson(): Promise<void> {
  const response = await requestHostStatusFromRunningServer(profileNamespace());
  process.stdout.write(`${JSON.stringify(response)}\n`);
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

function printHelp(): void {
  process.stdout.write(
    "Usage: poracode-server [activate [--json] [--sign-in-again] | doctor [--json] [--log-file <path>] | backup --to <directory> [--json] | pair --json | status --json | --help]\n" +
      "\nPORACODE_BASE_DIR selects a profile namespace. The server owns its .host-v1 sibling.\n" +
      "Run activate with the same profile to complete a staged offline import; credentials\n" +
      "  sealed by the desktop app are adopted via one-time desktop cooperation, or\n" +
      "  --sign-in-again starts fresh without migrating stored credentials.\n" +
      "Run doctor [--json] [--log-file <path>] for read-only diagnostics of this profile.\n" +
      "Run backup --to <directory> [--json] to capture a verified copy of the owned root.\n" +
      "Set PORACODE_SECRET_STORAGE_KEY for an explicit 32-byte base64 key, or use the owned key file.\n" +
      "Set PORACODE_REMOTE_ACCESS_HOST/PORT to configure the remote listener.\n" +
      "Run pair --json with the same profile to request a pairing URL from its running owner.\n" +
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
              : serve();
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
