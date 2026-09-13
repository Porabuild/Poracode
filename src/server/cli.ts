import { join } from "node:path";
import {
  startNodePerformanceDiagnostics,
  type NodePerformanceDiagnostics,
} from "@/shared/diagnostics/nodePerformanceDiagnostics";
import { resolvePoracodeBaseDir } from "@/shared/poracodePaths";
import { joinRuntimeShutdown } from "@/backend/joinRuntimeShutdown";
import { installShutdown, reportFatalStartupError, reportUnconfirmedShutdown } from "./cliRuntime";
import { createHeadlessRemoteHost } from "./createHeadlessRemoteHost";
import { HeadlessCompositionShutdownError } from "./headlessRemoteComposition";
import { requestPairingFromRunningServer } from "./pairingControl";

/**
 * Standalone owner of one Poracode profile. PORACODE_BASE_DIR names the profile
 * namespace; the factory resolves and reports its separate owned server root.
 * No migration, credential initialization or persistent write precedes ownership.
 */
function resolveWslHelpersDir(): string {
  return (
    process.env.PORACODE_WSL_HELPERS_DIR?.trim() ||
    join(__dirname, "..", "..", "resources", "wsl-helpers")
  );
}

function resolveBundledSkillsDir(): string {
  return (
    process.env.PORACODE_BUNDLED_SKILLS_DIR?.trim() ||
    join(__dirname, "..", "..", "resources", "skills")
  );
}

function resolveBundledPluginsDir(): string {
  return (
    process.env.PORACODE_BUNDLED_PLUGINS_DIR?.trim() ||
    join(__dirname, "..", "..", "resources", "plugins")
  );
}

function profileNamespace(): string {
  return process.env.PORACODE_BASE_DIR?.trim() || resolvePoracodeBaseDir();
}

let performanceDiagnostics: NodePerformanceDiagnostics | undefined;

async function serve(): Promise<void> {
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
      wslHelpersDir: resolveWslHelpersDir(),
      bundledSkillsDir: resolveBundledSkillsDir(),
      bundledPluginsDir: resolveBundledPluginsDir(),
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

export type ServerCliCommand = "serve" | "pair-json" | "help";

export function parseServerCliCommand(args: readonly string[]): ServerCliCommand {
  if (args.length === 0) return "serve";
  if (args.length === 1 && ["--help", "-h", "help"].includes(args[0]!)) return "help";
  if (args.length === 2 && args[0] === "pair" && args[1] === "--json") return "pair-json";
  throw new Error("Usage: poracode-server [pair --json | --help]");
}

async function printPairingJson(): Promise<void> {
  const response = await requestPairingFromRunningServer(profileNamespace());
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

function printHelp(): void {
  process.stdout.write(
    "Usage: poracode-server [pair --json | --help]\n" +
      "\nPORACODE_BASE_DIR selects a profile namespace. The server owns its .host-v1 sibling.\n" +
      "Set PORACODE_SECRET_STORAGE_KEY for an explicit 32-byte base64 key, or use the owned key file.\n" +
      "Set PORACODE_REMOTE_ACCESS_HOST/PORT to configure the remote listener.\n" +
      "Run pair --json with the same profile to request a pairing URL from its running owner.\n" +
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
  const operation = command === "pair-json" ? printPairingJson() : serve();
  operation.catch(async (error) => {
    await performanceDiagnostics?.stop();
    if (error instanceof HeadlessCompositionShutdownError) {
      reportUnconfirmedShutdown("[poracode-server]", error);
      return;
    }
    reportFatalStartupError("[poracode-server]", error);
  });
}

// Importing CLI helpers under the test runner never boots a listener.
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  runCli();
}
