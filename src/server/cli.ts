import { closeSync, openSync, unlinkSync, writeSync } from "node:fs";
import { join } from "node:path";
import { resolvePoracodeBaseDir } from "@/shared/poracodePaths";
import { normalizePairingEndpoint, parsePairingUrlParts } from "@/shared/remote/pairingUrl";
import { preparePoracodeDataRoot } from "@/main/poracodeData";
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
 * Standalone headless Poracode remote server.
 *
 * Runs the same {@link RemoteAccessServer} the desktop app exposes, but with no
 * Electron, no window and no renderer — usable as a CLI on any host. Devices
 * pair to it directly over the LAN (or a VPN / Tailscale address); see
 * docs/REMOTE_ARCHITECTURE.md.
 *
 * Configuration is environment-driven, matching `src/main/remote/config.ts`:
 *   PORACODE_BASE_DIR                       data dir (default: per-channel)
 *   PORACODE_APP_VERSION                    reported app version
 *   PORACODE_REMOTE_ACCESS_HOST             bind host (default 0.0.0.0)
 *   PORACODE_REMOTE_ACCESS_PORT             bind port (default: first available 49152-65535)
 *   PORACODE_REMOTE_ACCESS_ADVERTISED_HOST  host advertised in pairing URLs
 *   PORACODE_SECRET_STORAGE_KEY             base64 32-byte key (else file-backed)
 *   PORACODE_BETTER_SQLITE3_NATIVE_BINDING  optional Node-ABI better_sqlite3.node
 *   PORACODE_WSL_HELPERS_DIR                in-WSL helper assets dir
 *   PORACODE_REMOTE_RELAY_URL               relay /host control URL (cross-network)
 *   PORACODE_REMOTE_RELAY_SECRET            secret claiming the server id (else file-backed)
 */
function resolveWslHelpersDir(): string {
  const explicit = process.env.PORACODE_WSL_HELPERS_DIR?.trim();
  if (explicit) return explicit;
  // Mirror the dev layout in main.ts: <dist/main>/../../resources/wsl-helpers.
  return join(__dirname, "..", "..", "resources", "wsl-helpers");
}

function resolveBundledSkillsDir(): string {
  const explicit = process.env.PORACODE_BUNDLED_SKILLS_DIR?.trim();
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
 * Acquire an exclusive lock on a Poracode data dir so two supervisors never
 * run against the same threads/worktrees/DB (which corrupts rows AND causes a
 * crypto mismatch: the desktop's safeStorage-derived key vs. the headless
 * file-backed key can't decrypt each other's sealed settings). The default
 * data dir is the SAME `~/.poracode` the desktop uses, so this guards the
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
          `Poracode data dir ${baseDir} is in use by another Poracode process (pid ${holderPid}); ` +
            "set PORACODE_BASE_DIR to run a separate instance.",
          { cause: error },
        );
      }
      // Stale or unparseable lock (dead pid / partial write). Reclaim once to
      // avoid an unbounded loop if two starts race to reclaim simultaneously.
      if (reclaimed) {
        throw new Error(
          `Poracode data dir ${baseDir} lock at ${path} could not be reclaimed; ` +
            "another process may be racing to start. Retry, or set PORACODE_BASE_DIR.",
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
  process.env.PORACODE_HEADLESS_SERVER = "1";
  const baseDir = process.env.PORACODE_BASE_DIR?.trim() || resolvePoracodeBaseDir();
  // Ensure the data dir exists before the secret key is written into it.
  preparePoracodeDataRoot(baseDir);
  // Fail fast if another Poracode process (desktop or server) already owns this
  // data dir — two supervisors on one dir corrupt DB rows and mismatch crypto.
  const dataDirLock = acquireDataDirLock(baseDir);

  const appVersion = process.env.PORACODE_APP_VERSION?.trim() || "dev";
  const isDev = process.env.PORACODE_IS_DEV === "1" || Boolean(process.env.VITE_DEV_SERVER_URL);
  const secretStorageKey = readOrCreateHeadlessSecretKey(baseDir);
  const relayUrl = process.env.PORACODE_REMOTE_RELAY_URL?.trim();
  const relaySecret = relayUrl ? readOrCreateRelaySecret(baseDir) : undefined;

  let host: Awaited<ReturnType<typeof createHeadlessRemoteHost>>;
  let info;
  try {
    host = await createHeadlessRemoteHost({
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
        console.log("[poracode-server] reachable via relay: %s", publicUrl),
      reportError: (error) => {
        console.error("[poracode-server] supervisor error:", error);
      },
    });
    info = await host.start();
  } catch (error) {
    // Startup failed after the lock was acquired — release it so a retry (or a
    // desktop launch) isn't blocked by an orphaned lockfile from a dead pid.
    dataDirLock.release();
    throw error;
  }
  console.log("[poracode-server] data dir:        %s", baseDir);
  console.log("[poracode-server] listening at:    %s", info.httpBaseUrl);
  console.log("[poracode-server] websocket at:    %s", info.wsBaseUrl);
  console.log("[poracode-server] pair a device:   %s", info.pairingUrl);
  const pairingParts = parsePairingUrlParts(info.pairingUrl);
  if (pairingParts) {
    console.log("[poracode-server] endpoint:        %s", normalizePairingEndpoint(info.pairingUrl));
    console.log("[poracode-server] pair token:      %s", pairingParts.token);
  }
  console.log("[poracode-server] (send SIGUSR2 to mint a fresh pairing link)");

  // Release the data-dir lock in the SAME path that disposes the server/DB so
  // the next start (or a desktop launch) can reclaim the dir cleanly.
  installShutdown(
    "[poracode-server]",
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
        console.log("[poracode-server] pair a device:   %s", host.server.issuePairingUrl());
      }
    } catch (error) {
      console.error("[poracode-server] could not mint pairing link:", error);
    }
  });
}

export type ServerCliCommand = "serve" | "pair-json";

export function parseServerCliCommand(args: readonly string[]): ServerCliCommand {
  if (args.length === 0) return "serve";
  if (args.length === 2 && args[0] === "pair" && args[1] === "--json") return "pair-json";
  throw new Error("Usage: poracode-server [pair --json]");
}

async function printPairingJson(): Promise<void> {
  const baseDir = process.env.PORACODE_BASE_DIR?.trim() || resolvePoracodeBaseDir();
  const response = await requestPairingFromRunningServer(baseDir);
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

export function runCli(): void {
  let command: ServerCliCommand;
  try {
    command = parseServerCliCommand(process.argv.slice(2));
  } catch (error) {
    reportFatalStartupError("[poracode-server]", error);
  }
  const operation = command === "pair-json" ? printPairingJson() : serve();
  operation.catch((error) => reportFatalStartupError("[poracode-server]", error));
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
