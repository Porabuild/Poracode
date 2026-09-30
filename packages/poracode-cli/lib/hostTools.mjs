/**
 * Launcher twin of `scripts/server-host-tools.mjs`. The published `poracode`
 * package cannot import from the repository `scripts/` directory, so the
 * host-tool helpers the launcher needs (tar resolution with Windows bsdtar,
 * transient-lock retry, scratch ids, default prefix) live here as a
 * byte-identical shared section. `test/hostTools.parity.test.mjs` fails when
 * the two diverge; edit both together.
 */
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, renameSync, rmSync, rmdirSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, relative, win32 } from "node:path";

// --- shared:begin (must stay identical to packages/poracode-cli/lib/hostTools.mjs)

const NPM_CLI_PATH = /(?:^|[\\/])npm-cli\.js$/iu;
/** Arguments the `npm.cmd` shell fallback may carry; anything else is refused. */
const SHELL_SAFE_ARGUMENT = /^[A-Za-z0-9@_.:=+~/\\-]+$/u;
const TRANSIENT_FS_CODES = new Set(["EBUSY", "EPERM", "EACCES"]);

function envValue(env, name) {
  return env[name] ?? env[name.toUpperCase()] ?? env[name.toLowerCase()];
}

function probeTarVersion(command, args, options) {
  return execFileSync(command, args, { stdio: "pipe", ...options });
}

/**
 * Pick the tar executable. Returns `{ command, baseArgs }`; put `baseArgs`
 * before the operation arguments (see `tarCommand`). POSIX always uses PATH
 * `tar` untouched.
 */
export function resolveTar(options = {}) {
  const platform = options.platform ?? process.platform;
  if (platform !== "win32") return { command: "tar", baseArgs: [] };
  const env = options.env ?? process.env;
  const exists = options.exists ?? existsSync;
  const systemRoot = envValue(env, "SystemRoot") || envValue(env, "windir") || "C:\\Windows";
  const bsdtar = win32.join(systemRoot, "System32", "tar.exe");
  if (exists(bsdtar)) return { command: bsdtar, baseArgs: [] };
  const probe = options.run ?? probeTarVersion;
  let gnu = false;
  try {
    gnu = /GNU tar/iu.test(String(probe("tar", ["--version"], { encoding: "utf8" })));
  } catch {
    // No probe result means no tar we can reason about; use it as-is.
  }
  return { command: "tar", baseArgs: gnu ? ["--force-local"] : [] };
}

/** `[command, args]` for one tar operation with the resolved base arguments. */
export function tarCommand(tool, args) {
  return [tool.command, [...tool.baseArgs, ...args]];
}

/**
 * npm invocation that works without a shell on Windows. Returns
 * `{ command, args, shell }`; pass `shell: true` through to the spawner.
 */
export function npmInvocation(args, options = {}) {
  const platform = options.platform ?? process.platform;
  if (platform !== "win32") return { command: "npm", args: [...args], shell: false };
  const env = options.env ?? process.env;
  const exists = options.exists ?? existsSync;
  const execPath = options.execPath ?? process.execPath;
  const candidates = [];
  const fromEnv = envValue(env, "npm_execpath");
  // `npm_execpath` is the *running* package manager; under pnpm it is pnpm's
  // entry, so only an npm-cli.js path is trusted.
  if (typeof fromEnv === "string" && NPM_CLI_PATH.test(fromEnv)) candidates.push(fromEnv);
  candidates.push(win32.join(win32.dirname(execPath), "node_modules", "npm", "bin", "npm-cli.js"));
  for (const cli of candidates) {
    if (exists(cli)) return { command: execPath, args: [cli, ...args], shell: false };
  }
  for (const argument of args) {
    if (!SHELL_SAFE_ARGUMENT.test(argument)) {
      throw new Error(
        `Refusing to pass an unsafe argument to npm.cmd through a shell: ${argument}`,
      );
    }
  }
  return { command: "npm.cmd", args: [...args], shell: true };
}

/** Default install prefix: `/opt/poracode`, or `%LOCALAPPDATA%\Poracode\server` on Windows. */
export function defaultServerPrefix(platform = process.platform, env = process.env) {
  if (platform !== "win32") return "/opt/poracode";
  const localAppData =
    envValue(env, "LOCALAPPDATA") ||
    win32.join(envValue(env, "USERPROFILE") || homedir(), "AppData", "Local");
  return win32.join(localAppData, "Poracode", "server");
}

/**
 * Unique suffix for private scratch names. Windows keeps it to 8 hex chars so
 * cache/staging paths stay well inside MAX_PATH; elsewhere a full UUID.
 */
export function scratchId(platform = process.platform) {
  return platform === "win32" ? randomBytes(4).toString("hex") : randomUUID();
}

export function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

/**
 * Run `operation`, retrying transient Windows file-lock failures with bounded
 * exponential backoff (about 2.5s worst case by default). `shouldRetry` can
 * veto a retry for a specific error (for example when the destination now
 * exists and retrying can never succeed).
 */
export function retryTransientFsSync(operation, options = {}) {
  const retries = options.retries ?? 8;
  const baseDelayMs = options.baseDelayMs ?? 25;
  const sleep = options.sleep ?? sleepSync;
  const shouldRetry = options.shouldRetry ?? (() => true);
  for (let attempt = 0; ; attempt += 1) {
    try {
      return operation();
    } catch (error) {
      const code = error?.code;
      if (attempt >= retries || !TRANSIENT_FS_CODES.has(code) || !shouldRetry(error)) throw error;
      sleep(Math.min(baseDelayMs * 2 ** attempt, 500));
    }
  }
}

/** `renameSync` that rides out transient locks while the destination is absent. */
export function renameWithRetry(source, destination, options = {}) {
  const rename = options.rename ?? renameSync;
  const exists = options.exists ?? existsSync;
  return retryTransientFsSync(() => rename(source, destination), {
    ...options,
    shouldRetry: () => !exists(destination),
  });
}

/**
 * Create `linkPath` pointing at the directory `targetDir`: a junction on
 * Windows (absolute target, no symlink privilege), a relative directory
 * symlink elsewhere.
 */
export function writeDirectoryLink(linkPath, targetDir, options = {}) {
  const platform = options.platform ?? process.platform;
  const symlink = options.symlink ?? symlinkSync;
  if (platform === "win32") {
    symlink(win32.resolve(targetDir), linkPath, "junction");
    return;
  }
  symlink(relative(dirname(linkPath), targetDir) || ".", linkPath, "dir");
}

/** Remove a directory link (symlink or junction) without touching its target. */
export function removeDirectoryLink(linkPath, options = {}) {
  const platform = options.platform ?? process.platform;
  const remove = options.rm ?? rmSync;
  const removeDirectory = options.rmdir ?? rmdirSync;
  try {
    remove(linkPath, { force: true });
  } catch (error) {
    if (platform !== "win32" || !["EPERM", "EISDIR", "ERR_FS_EISDIR"].includes(error?.code)) {
      throw error;
    }
    // A junction can surface as a directory to rm; rmdir removes only the link.
    removeDirectory(linkPath);
  }
}

// --- shared:end
