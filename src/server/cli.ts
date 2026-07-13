import { closeSync, openSync, unlinkSync, writeSync } from "node:fs";
import { join } from "node:path";
import { resolveLightcodeBaseDir } from "@/shared/lightcodePaths";
import { prepareLightcodeDataRoot } from "@/main/lightcodeData";
import { installShutdown, reportFatalStartupError } from "./cliRuntime";
import { createHeadlessRemoteHost } from "./createHeadlessRemoteHost";
import { readOrCreateHeadlessSecretKey, readOrCreateRelaySecret } from "./headlessSecretKey";
import {
  fulfillPairingControlRequest,
  pidIsAlive,
  readPidFile,
  requestPairingFromRunningServer,
} from "./pairingControl";

/**
 * Standalone headless Lightcode remote server.
 *
 * Runs the same {@link RemoteAccessServer} the desktop app exposes, but with no
 * Electron, no window and no renderer — usable as a CLI on any host. Devices
 * pair to it directly over the LAN (or a VPN / Tailscale address); see
 * docs/REMOTE_ARCHITECTURE.md.
 *
 * Configuration is environment-driven, matching `src/main/remote/config.ts`:
 *   LIGHTCODE_BASE_DIR                       data dir (default: per-channel)
 *   LIGHTCODE_APP_VERSION                    reported app version
 *   LIGHTCODE_REMOTE_ACCESS_HOST             bind host (default 0.0.0.0)
 *   LIGHTCODE_REMOTE_ACCESS_PORT             bind port (default 38987)
 *   LIGHTCODE_REMOTE_ACCESS_ADVERTISED_HOST  host advertised in pairing URLs
 *   LIGHTCODE_SECRET_STORAGE_KEY             base64 32-byte key (else file-backed)
 *   LIGHTCODE_BETTER_SQLITE3_NATIVE_BINDING  optional Node-ABI better_sqlite3.node
 *   LIGHTCODE_WSL_HELPERS_DIR                in-WSL helper assets dir
 *   LIGHTCODE_REMOTE_RELAY_URL               relay /host control URL (cross-network)
 *   LIGHTCODE_REMOTE_RELAY_SECRET            secret claiming the server id (else file-backed)
 */
function resolveWslHelpersDir(): string {
  const explicit = process.env.LIGHTCODE_WSL_HELPERS_DIR?.trim();
  if (explicit) return explicit;
  // Mirror the dev layout in main.ts: <dist/main>/../../resources/wsl-helpers.
  return join(__dirname, "..", "..", "resources", "wsl-helpers");
}

function resolveBundledSkillsDir(): string {
  const explicit = process.env.LIGHTCODE_BUNDLED_SKILLS_DIR?.trim();
  if (explicit) return explicit;
  // Mirror the dev layout in main.ts: <dist/main>/../../resources/skills.
  return join(__dirname, "..", "..", "resources", "skills");
}

const LOCK_FILE = "server.lock";

/** Release handle returned by {@link acquireDataDirLock}; unlinks the lockfile. */
export interface DataDirLock {
  readonly path: string;
  release(): void;
}

/**
 * Acquire an exclusive lock on a Lightcode data dir so two supervisors never
 * run against the same threads/worktrees/DB (which corrupts rows AND causes a
 * crypto mismatch: the desktop's safeStorage-derived key vs. the headless
 * file-backed key can't decrypt each other's sealed settings). The default
 * data dir is the SAME `~/.lightcode` the desktop uses, so this guards the
 * common "run the server while the app is open" footgun.
 *
 * Writes `<baseDir>/server.lock` with `openSync(path, "wx")` (exclusive
 * create). On EEXIST, the holder's pid is read: a live pid fails fast with a
 * clear message; a dead (or unparseable) pid is reclaimed and the lock retried
 * once.
 *
 * `isAlive` and `now` are injectable for tests.
 */
export function acquireDataDirLock(
  baseDir: string,
  isAlive: (pid: number) => boolean = pidIsAlive,
): DataDirLock {
  const path = join(baseDir, LOCK_FILE);
  let reclaimed = false;

  for (;;) {
    let fd: number;
    try {
      fd = openSync(path, "wx");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;

      const holderPid = readPidFile(path);
      if (holderPid !== null && isAlive(holderPid)) {
        throw new Error(
          `Lightcode data dir ${baseDir} is in use by another Lightcode process (pid ${holderPid}); ` +
            "set LIGHTCODE_BASE_DIR to run a separate instance.",
          { cause: error },
        );
      }
      // Stale or unparseable lock (dead pid / partial write). Reclaim once to
      // avoid an unbounded loop if two starts race to reclaim simultaneously.
      if (reclaimed) {
        throw new Error(
          `Lightcode data dir ${baseDir} lock at ${path} could not be reclaimed; ` +
            "another process may be racing to start. Retry, or set LIGHTCODE_BASE_DIR.",
          { cause: error },
        );
      }
      reclaimed = true;
      try {
        unlinkSync(path);
      } catch (unlinkError) {
        // Someone else already reclaimed it: fine, just retry the open.
        if ((unlinkError as NodeJS.ErrnoException).code !== "ENOENT") throw unlinkError;
      }
      continue;
    }

    try {
      writeSync(fd, String(process.pid));
    } finally {
      closeSync(fd);
    }
    let released = false;
    return {
      path,
      release() {
        if (released) return;
        released = true;
        try {
          unlinkSync(path);
        } catch {
          // Already gone (reclaimed elsewhere / dir removed) — nothing to do.
        }
      },
    };
  }
}

async function serve(): Promise<void> {
  process.env.LIGHTCODE_HEADLESS_SERVER = "1";
  const baseDir = process.env.LIGHTCODE_BASE_DIR?.trim() || resolveLightcodeBaseDir();
  // Ensure the data dir exists before the secret key is written into it.
  prepareLightcodeDataRoot(baseDir);
  // Fail fast if another Lightcode process (desktop or server) already owns this
  // data dir — two supervisors on one dir corrupt DB rows and mismatch crypto.
  const dataDirLock = acquireDataDirLock(baseDir);

  const appVersion = process.env.LIGHTCODE_APP_VERSION?.trim() || "dev";
  const isDev = process.env.LIGHTCODE_IS_DEV === "1" || Boolean(process.env.VITE_DEV_SERVER_URL);
  const secretStorageKey = readOrCreateHeadlessSecretKey(baseDir);
  const relayUrl = process.env.LIGHTCODE_REMOTE_RELAY_URL?.trim();
  const relaySecret = relayUrl ? readOrCreateRelaySecret(baseDir) : undefined;

  const host = createHeadlessRemoteHost({
    appVersion,
    isDev,
    baseDir,
    supervisorPath: join(__dirname, "supervisor.cjs"),
    wslHelpersDir: resolveWslHelpersDir(),
    bundledSkillsDir: resolveBundledSkillsDir(),
    secretStorageKey,
    ...(relayUrl ? { relayUrl } : {}),
    ...(relaySecret ? { relaySecret } : {}),
    onRelayRegistered: (publicUrl) =>
      console.log("[lightcode-server] reachable via relay: %s", publicUrl),
    reportError: (error) => {
      console.error("[lightcode-server] supervisor error:", error);
    },
  });

  let info;
  try {
    info = await host.start();
  } catch (error) {
    // Startup failed after the lock was acquired — release it so a retry (or a
    // desktop launch) isn't blocked by an orphaned lockfile from a dead pid.
    dataDirLock.release();
    throw error;
  }
  console.log("[lightcode-server] data dir:        %s", baseDir);
  console.log("[lightcode-server] listening at:    %s", info.httpBaseUrl);
  console.log("[lightcode-server] websocket at:    %s", info.wsBaseUrl);
  console.log("[lightcode-server] pair a device:   %s", info.pairingUrl);
  console.log("[lightcode-server] (send SIGUSR2 to mint a fresh pairing link)");

  // Release the data-dir lock in the SAME path that disposes the server/DB so
  // the next start (or a desktop launch) can reclaim the dir cleanly.
  installShutdown(
    "[lightcode-server]",
    () => host.dispose(),
    () => dataDirLock.release(),
  );
  // Last-resort release on any normal/abrupt process exit (unlinkSync is sync,
  // so it runs even from the 'exit' handler). Idempotent with shutdown().
  process.on("exit", () => dataDirLock.release());
  // POSIX-only: print a new pairing link without restarting the server.
  process.on("SIGUSR2", () => {
    try {
      const handled = fulfillPairingControlRequest(baseDir, () =>
        host.server.issuePairingUrl("SSH bootstrap"),
      );
      if (!handled) {
        console.log("[lightcode-server] pair a device:   %s", host.server.issuePairingUrl());
      }
    } catch (error) {
      console.error("[lightcode-server] could not mint pairing link:", error);
    }
  });
}

export type ServerCliCommand = "serve" | "pair-json";

export function parseServerCliCommand(args: readonly string[]): ServerCliCommand {
  if (args.length === 0) return "serve";
  if (args.length === 2 && args[0] === "pair" && args[1] === "--json") return "pair-json";
  throw new Error("Usage: lightcode-server [pair --json]");
}

async function printPairingJson(): Promise<void> {
  const baseDir = process.env.LIGHTCODE_BASE_DIR?.trim() || resolveLightcodeBaseDir();
  const response = await requestPairingFromRunningServer(baseDir);
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

function runCli(): void {
  let command: ServerCliCommand;
  try {
    command = parseServerCliCommand(process.argv.slice(2));
  } catch (error) {
    reportFatalStartupError("[lightcode-server]", error);
  }
  const operation = command === "pair-json" ? printPairingJson() : serve();
  operation.catch((error) => reportFatalStartupError("[lightcode-server]", error));
}

// Only boot when run as the CLI entrypoint (node dist/main/server.cjs). Guarded
// so importing this module for its exported helpers (tests) doesn't start a
// server. tsdown bundles to CJS, where `require`/`module` are the module-wrapper
// args and `require.main === module` holds for the entrypoint. Under the vitest
// ESM module runner these CJS bindings are absent, so main() is not invoked on
// import. `typeof` guards keep both references safe when undeclared at runtime.
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  runCli();
}
