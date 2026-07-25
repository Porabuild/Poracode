import { execFile, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import {
  getPosixLoginShellArgs,
  getWindowsSystemCommand,
  getWslCommand,
  quotePowerShellLiteral,
  quotePosixShellArg,
} from "./shellBasics";
import type { WslBridgeClient, WslLocation, WslProcessExecResult } from "../../wsl/bridge/client";

const execFileAsync = promisify(execFile);

/** Default exec timeout for agent CLI probes and commands without an explicit `timeout`. */
export const DEFAULT_COMMAND_OUTPUT_TIMEOUT_MS = 30_000;

let cachedWindowsSearchPath: string | undefined | null = null;

function getWindowsEnvValue(name: string): string | undefined {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(process.env)) {
    if (key.toLowerCase() !== target) continue;
    return typeof value === "string" && value.length > 0 ? value : undefined;
  }
  return undefined;
}

function expandWindowsEnvVariables(value: string): string {
  return value.replaceAll(/%([^%]+)%/g, (match, rawName: string) => {
    const resolved = getWindowsEnvValue(rawName);
    return resolved ?? match;
  });
}

function parseWindowsRegistryPath(stdout: string): string | undefined {
  const match = stdout.match(/^\s*Path\s+REG_\w+\s+(.*)$/im);
  const raw = match?.[1]?.trim();
  if (!raw) return undefined;
  return expandWindowsEnvVariables(raw);
}

function readWindowsRegistryPath(scope: "user" | "machine"): string | undefined {
  const key =
    scope === "user"
      ? "HKCU\\Environment"
      : "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment";
  const result = spawnSync(getWindowsSystemCommand("reg.exe"), ["query", key, "/v", "Path"], {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    return undefined;
  }
  return parseWindowsRegistryPath(`${result.stdout ?? ""}`);
}

function splitWindowsPathSegments(pathValue: string | undefined): string[] {
  return (pathValue ?? "")
    .split(";")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function normalizeWindowsPathSegment(segment: string): string {
  return segment.replace(/[\\/]+$/g, "").toLowerCase();
}

function normalizeWindowsPathValue(pathValue: string | undefined): string {
  return splitWindowsPathSegments(pathValue).map(normalizeWindowsPathSegment).join(";");
}

function buildWindowsFallbackPath(): string | undefined {
  if (cachedWindowsSearchPath !== null) {
    return cachedWindowsSearchPath ?? undefined;
  }

  const merged: string[] = [];
  const seen = new Set<string>();
  for (const segment of [
    ...splitWindowsPathSegments(getWindowsEnvValue("Path")),
    ...splitWindowsPathSegments(readWindowsRegistryPath("user")),
    ...splitWindowsPathSegments(readWindowsRegistryPath("machine")),
  ]) {
    const key = normalizeWindowsPathSegment(segment);
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    merged.push(segment);
  }

  cachedWindowsSearchPath = merged.length > 0 ? merged.join(";") : undefined;
  return cachedWindowsSearchPath ?? undefined;
}

/**
 * The fresh merged Windows search PATH (current process `Path` + registry user +
 * machine PATH), or `undefined` when it already matches the live process PATH or
 * we're not on Windows. Read this at spawn time so a PTY launched after an
 * installer updated the registry PATH picks up the new entries without an app
 * restart. Honors {@link invalidateExecutablePathCache} (called on explicit
 * refresh), so a post-install refresh re-reads the registry before the value is
 * served here.
 */
export function getRefreshedWindowsPath(): string | undefined {
  if (process.platform !== "win32") return undefined;
  const fallbackPath = buildWindowsFallbackPath();
  if (!fallbackPath) return undefined;
  if (
    normalizeWindowsPathValue(fallbackPath) ===
    normalizeWindowsPathValue(getWindowsEnvValue("Path"))
  ) {
    return undefined;
  }
  return fallbackPath;
}

function buildWindowsPathOverride(): NodeJS.ProcessEnv | undefined {
  const fallbackPath = getRefreshedWindowsPath();
  if (!fallbackPath) return undefined;
  return {
    ...process.env,
    Path: fallbackPath,
    PATH: fallbackPath,
  };
}

function toStringEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

function normalizeWindowsPathAliases(env: Record<string, string>): Record<string, string> {
  const pathValue = Object.entries(env).find(([key, value]) => {
    return key.toLowerCase() === "path" && value.length > 0;
  })?.[1];
  if (!pathValue) return env;
  return { ...env, Path: pathValue, PATH: pathValue };
}

export function getWindowsPathOverrideEnv(): Record<string, string> | undefined {
  const override = buildWindowsPathOverride();
  return override ? toStringEnv(override) : undefined;
}

function resolveWindowsExecutablePath(
  command: string,
  env?: NodeJS.ProcessEnv,
): string | undefined {
  const result = spawnSync(getWindowsSystemCommand("where.exe"), [command], {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    ...(env ? { env } : {}),
  });
  if (result.error || result.status !== 0) {
    return undefined;
  }
  return parseWindowsExecutablePath(`${result.stdout ?? ""}`);
}

/**
 * The common POSIX user-bin directories an agent binary might live in, in
 * priority order, for {@link findPosixExecutableInWellKnownDirs}.
 *
 * Includes the installer convention `~/.<binary>/bin` (OpenCode's installer
 * drops the binary in `~/.opencode/bin`). Many installers only append their bin
 * dir to the *current* shell's rc — if the user's terminal runs fish, the line
 * lands in fish config (`fish_add_path`) and never reaches the login `$SHELL`
 * (zsh) PATH that detection probes, so `command -v` misses a binary the user
 * can happily run in their terminal.
 */
function posixWellKnownBinaryDirs(binary: string): string[] {
  const home = homedir();
  return [
    join(home, ".local", "bin"),
    join(home, `.${binary}`, "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    join(home, ".bun", "bin"),
    join(home, ".cargo", "bin"),
    join(home, "go", "bin"),
    join(home, "bin"),
  ];
}

/**
 * True when `path` is a regular file with at least one execute bit set — i.e.
 * something node-pty / spawn can actually launch. Returns false (rather than
 * throwing) when the path is missing, so callers can probe candidates directly.
 */
export function isExecutableRegularFile(path: string): boolean {
  try {
    const stats = statSync(path);
    return stats.isFile() && (stats.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

/**
 * Locate an agent binary in the well-known POSIX install directories when the
 * login-shell `command -v` lookup comes up empty. The POSIX analogue of the
 * Windows registry-PATH fallback ({@link getRefreshedWindowsPath}): it makes
 * detection and launch independent of *which* interactive shell the user runs
 * (zsh, fish, nushell, …), since an installer may only have wired the binary's
 * dir into a shell other than the login `$SHELL`. Returns the absolute path of
 * the first executable regular file found, or undefined (always undefined on
 * Windows — the registry fallback covers that there).
 */
export function findPosixExecutableInWellKnownDirs(binary: string): string | undefined {
  if (process.platform === "win32") return undefined;
  for (const dir of posixWellKnownBinaryDirs(binary)) {
    const candidate = join(dir, binary);
    if (isExecutableRegularFile(candidate)) return candidate;
  }
  return undefined;
}

export function resolveExecutablePath(command: string): string | undefined {
  if (process.platform === "win32") {
    return (
      resolveWindowsExecutablePath(command) ??
      resolveWindowsExecutablePath(command, buildWindowsPathOverride())
    );
  }

  const result = spawnSync(
    process.env.SHELL || "/bin/bash",
    getPosixLoginShellArgs(`command -v ${quotePosixShellArg(command)}`),
    {
      cwd: homedir(),
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    },
  );
  const resolved =
    result.error || result.status !== 0
      ? undefined
      : parseCommandOutputLine(`${result.stdout ?? ""}`);
  return resolved ?? findPosixExecutableInWellKnownDirs(command);
}

export function readCommandOutput(
  command: string,
  args: string[],
): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    windowsHide: true,
  });
  return {
    ok: result.status === 0,
    stdout: `${result.stdout ?? ""}`.trim(),
    stderr: `${result.stderr ?? ""}`.trim(),
  };
}

const wslShellPathCache = new Map<string, string>();
let wslProcessBridgeClient: WslBridgeClient | undefined;

export function setWslProcessBridgeClient(client: WslBridgeClient | undefined): void {
  wslProcessBridgeClient = client;
}

function parseCommandOutputLine(stdout: string): string | undefined {
  return stdout
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .findLast((line) => line.length > 0);
}

function parseWindowsExecutablePath(stdout: string): string | undefined {
  const lines = stdout
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const resolved =
    lines.findLast((line) => /\.(?:bat|cmd|com|exe|ps1)$/i.test(line)) ?? lines.at(-1);
  return (
    resolveWindowsScoopShimTarget(resolved) ?? resolveWindowsCmdExeTarget(resolved) ?? resolved
  );
}

function resolveWindowsScoopShimTarget(path: string | undefined): string | undefined {
  if (!path || !/\.exe$/i.test(path)) return undefined;
  const shimPath = path.replace(/\.exe$/i, ".shim");
  if (!existsSync(shimPath)) return undefined;
  try {
    const body = readFileSync(shimPath, "utf8");
    if (/^\s*args\s*=/im.test(body)) return undefined;
    const target = /^\s*path\s*=\s*"([^"]+)"\s*$/im.exec(body)?.[1];
    return target && /\.(?:com|exe)$/i.test(target) && existsSync(target) ? target : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Extract the `%dp0%`-relative Node script entry from an npm-style `.cmd`
 * shim body. Matches explicit `.js/.cjs/.mjs` entries as well as the
 * extensionless bin scripts npm's cmd-shim writes for packages whose bin file
 * has no extension (e.g. @xai-official/grok:
 * `"%_prog%"  "%dp0%\node_modules\@xai-official\grok\bin\grok" %*`).
 * Returns undefined for exe-wrapping shims.
 */
export function extractWindowsCmdShimScript(body: string): string | undefined {
  const js = /["']?%dp0%\\([^"']+?\.[cm]?js)["']?\s+%\*/i.exec(body)?.[1];
  if (js) return js;
  const prog = /"%_prog%"\s+["']?%dp0%\\([^"']+?)["']?\s+%\*/i.exec(body)?.[1];
  if (prog && !/\.(?:exe|cmd|bat|com|ps1)$/i.test(prog)) return prog;
  return undefined;
}

function resolveWindowsCmdExeTarget(path: string | undefined): string | undefined {
  if (!path || !/\.cmd$/i.test(path)) return undefined;
  try {
    const body = readFileSync(path, "utf8");
    // npm's standard Node-script shim wraps `"%dp0%\node.exe" "%dp0%\…\entry.mjs" %*`
    // (or `"%_prog%" "%dp0%\node_modules\…\bin\<name>" %*` for extensionless bins).
    // Leave those alone so the downstream resolveWindowsNodeCmdShim (in base/index.ts)
    // can extract the script entry and invoke node with it directly. Substituting to
    // node.exe here would strip the script arg and pass agent flags straight to
    // node, which rejects them ("bad option: --model", etc.) and exits — breaking
    // every npm-installed agent (codex, commandcode, gemini, …) on Windows.
    if (extractWindowsCmdShimScript(body) !== undefined) return undefined;
    const match = /"%dp0%\\([^"]+?\.exe)"/i.exec(body);
    if (!match?.[1]) return undefined;
    const target = join(dirname(path), match[1]);
    return existsSync(target) ? target : undefined;
  } catch {
    return undefined;
  }
}

const wslHomeCache = new Map<string, string>();

function makeWslBridgeLocation(distro: string, cwd = "/"): WslLocation {
  return {
    kind: "wsl",
    distro,
    linuxPath: cwd,
    uncPath: `\\\\wsl.localhost\\${distro}\\`,
  };
}

function bridgeProcessOutput(result: WslProcessExecResult): {
  ok: boolean;
  stdout: string;
  stderr: string;
} {
  return {
    ok: result.ok,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function bridgeBatchFallback(count: number): { ok: boolean; stdout: string }[] {
  return Array.from({ length: count }, () => ({ ok: false, stdout: "" }));
}

export function resolveWslShellPath(distro: string): string {
  const cached = wslShellPathCache.get(distro);
  if (cached) {
    return cached;
  }

  try {
    const result = spawnSync(
      getWslCommand(),
      ["-d", distro, "--", "sh", "-lc", 'getent passwd "$(id -un)" | cut -d: -f7'],
      {
        encoding: "utf8",
        shell: false,
        windowsHide: true,
        timeout: 3_000,
      },
    );
    if (!result.error && result.status === 0) {
      const shellPath = parseCommandOutputLine(`${result.stdout ?? ""}`);
      if (shellPath) {
        wslShellPathCache.set(distro, shellPath);
        return shellPath;
      }
    }
  } catch {
    // Fall through to bash so rc files (nvm/fnm/asdf) still get sourced.
  }

  const fallback = "/bin/bash";
  wslShellPathCache.set(distro, fallback);
  return fallback;
}

export function getCachedWslHomeDirectory(distro: string): string | undefined {
  return wslHomeCache.get(distro);
}

export function resolveWslHomeDirectory(distro: string): string | undefined {
  const cached = wslHomeCache.get(distro);
  if (cached) {
    return cached;
  }

  const result = spawnSync(
    getWslCommand(),
    ["-d", distro, "--", "sh", "-lc", 'printf %s "$HOME"'],
    {
      encoding: "utf8",
      shell: false,
      windowsHide: true,
      timeout: 5_000,
    },
  );
  if (result.error || result.status !== 0) {
    return undefined;
  }
  const home = parseCommandOutputLine(`${result.stdout ?? ""}`);
  if (home) {
    wslHomeCache.set(distro, home);
  }
  return home;
}

/**
 * A WSL `command -v` result under `/mnt` is a Windows binary surfaced inside the
 * distro via PATH interop, not a real Linux install — running it would launch a
 * Windows process against a Linux cwd. Detection and launch-time resolution both
 * reject it via this predicate so they agree regardless of binary-path cache.
 */
export function isWslInteropBinaryPath(path: string): boolean {
  return path.startsWith("/mnt/");
}

const execPathCache = new Map<string, { path: string | undefined; ts: number }>();
const EXEC_CACHE_TTL_MS = 60_000;
let primedPosixEnv: Record<string, string> | undefined;
const projectShellEnvCache = new Map<string, Promise<Record<string, string> | undefined>>();
const PRIMED_ENV_SKIP = new Set([
  "PWD",
  "OLDPWD",
  "SHLVL",
  "_",
  "OPTIND",
  "LINENO",
  "PS1",
  "PS2",
  "PROMPT",
]);
const projectShellEnvResolved = new Map<string, Record<string, string> | undefined>();
const wslProjectShellEnvCache = new Map<string, Promise<Record<string, string> | undefined>>();
const wslProjectShellEnvResolved = new Map<string, Record<string, string> | undefined>();

function wslProjectShellEnvKey(distro: string, cwd: string): string {
  return `${distro}\u0000${cwd}`;
}

/**
 * Drops only the resolved-binary-path caches: the per-command `where.exe` /
 * `command -v` results and the merged Windows search PATH (which includes the
 * registry-backed user/machine PATH). Call this before an explicit, user-driven
 * re-detection (e.g. after installing an agent) so a binary added to PATH by an
 * installer is found immediately rather than after the 60s TTL or an app
 * restart. Leaves the login-shell env primes intact — those are unrelated to
 * "is this binary installed" and are expensive to rebuild.
 */
export function invalidateExecutablePathCache(): void {
  execPathCache.clear();
  cachedWindowsSearchPath = null;
}

export function clearExecutablePathCache(): void {
  invalidateExecutablePathCache();
  wslShellPathCache.clear();
  wslHomeCache.clear();
  primedPosixEnv = undefined;
  projectShellEnvCache.clear();
  projectShellEnvResolved.clear();
  wslProjectShellEnvCache.clear();
  wslProjectShellEnvResolved.clear();
}

/** Sync read of the cached binary path. Returns undefined if absent or stale. */
export function getCachedExecutablePath(command: string): string | undefined {
  const cached = execPathCache.get(command);
  if (!cached) return undefined;
  if (Date.now() - cached.ts > EXEC_CACHE_TTL_MS) return undefined;
  return cached.path;
}

/** Env captured from the user's login shell during prime; undefined until then. */
export function getPrimedPosixEnv(): Record<string, string> | undefined {
  return primedPosixEnv;
}

export function getProjectShellEnv(cwd: string): Record<string, string> | undefined {
  return projectShellEnvResolved.get(cwd);
}

export function getWslProjectShellEnv(
  distro: string,
  cwd: string,
): Record<string, string> | undefined {
  return wslProjectShellEnvResolved.get(wslProjectShellEnvKey(distro, cwd));
}

export function primeProjectShellEnv(cwd: string): Promise<Record<string, string> | undefined> {
  if (process.platform === "win32") {
    return primeWindowsProjectShellEnv(cwd);
  }
  const key = `${process.env.SHELL || "/bin/bash"}\0${cwd}`;
  const existing = projectShellEnvCache.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const parsed = await runPrimedEnvProbe(
      process.env.SHELL || "/bin/bash",
      getPosixLoginShellArgs(buildPrimedEnvProbe()),
      { cwd },
    );
    if (parsed) projectShellEnvResolved.set(cwd, parsed);
    return parsed;
  })();
  projectShellEnvCache.set(key, promise);
  return promise;
}

function encodePowerShellCommand(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

function resolveWindowsProfileShellPath(): string {
  return (
    resolveWindowsExecutablePath("pwsh.exe") ??
    resolveWindowsExecutablePath("pwsh", buildWindowsPathOverride()) ??
    resolveWindowsExecutablePath("powershell.exe") ??
    resolveWindowsExecutablePath("powershell", buildWindowsPathOverride()) ??
    getWindowsSystemCommand("WindowsPowerShell\\v1.0\\powershell.exe")
  );
}

function buildWindowsEnvProbeScript(cwd: string): string {
  return [
    "$ErrorActionPreference = 'SilentlyContinue'",
    `Set-Location -LiteralPath ${quotePowerShellLiteral(cwd)}`,
    "$envMap = [ordered]@{}",
    "[System.Environment]::GetEnvironmentVariables('Process').GetEnumerator() | ForEach-Object { $envMap[[string]$_.Key] = [string]$_.Value }",
    `[Console]::Out.WriteLine(${quotePowerShellLiteral(PRIMED_ENV_MARKER)})`,
    "[Console]::Out.WriteLine(($envMap | ConvertTo-Json -Compress))",
  ].join("; ");
}

function parseWindowsEnvProbe(stdout: string): Record<string, string> | undefined {
  const lines = stdout.split(/\r?\n/g);
  const markerIdx = lines.indexOf(PRIMED_ENV_MARKER);
  if (markerIdx < 0) return undefined;
  const rawJson = lines
    .slice(markerIdx + 1)
    .join("\n")
    .trim();
  if (!rawJson) return undefined;
  try {
    const parsed = JSON.parse(rawJson) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (PRIMED_ENV_SKIP.has(key)) continue;
      if (typeof value === "string") env[key] = value;
    }
    if (Object.keys(env).length === 0) return undefined;
    return normalizeWindowsPathAliases(env);
  } catch {
    return undefined;
  }
}

function primeWindowsProjectShellEnv(cwd: string): Promise<Record<string, string> | undefined> {
  const key = `windows\0${cwd}`;
  const existing = projectShellEnvCache.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const env = getWindowsPathOverrideEnv();
    const shell = resolveWindowsProfileShellPath();
    try {
      const { stdout } = await execFileAsync(
        shell,
        [
          "-NoLogo",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-EncodedCommand",
          encodePowerShellCommand(buildWindowsEnvProbeScript(cwd)),
        ],
        {
          ...(env ? { env } : {}),
          windowsHide: true,
          timeout: 15_000,
        },
      );
      const parsed = parseWindowsEnvProbe(stdout ?? "");
      const fallback = getWindowsPathOverrideEnv();
      const merged = parsed ?? fallback;
      if (merged) projectShellEnvResolved.set(cwd, normalizeWindowsPathAliases(merged));
      return merged;
    } catch {
      const fallback = getWindowsPathOverrideEnv();
      if (fallback) projectShellEnvResolved.set(cwd, fallback);
      return fallback;
    }
  })();
  projectShellEnvCache.set(key, promise);
  return promise;
}

export function primeWslProjectShellEnv(
  distro: string,
  cwd: string,
): Promise<Record<string, string> | undefined> {
  const key = wslProjectShellEnvKey(distro, cwd);
  const existing = wslProjectShellEnvCache.get(key);
  if (existing) return existing;

  const promise = (async () => {
    if (!wslProcessBridgeClient) return undefined;
    const result = await wslProcessBridgeClient.processExec(makeWslBridgeLocation(distro, cwd), {
      command: "sh",
      cwd,
      args: ["-lc", buildPrimedEnvProbe()],
      loginEnv: true,
      timeoutMs: 15_000,
    });
    const parsed = result.ok ? parsePrimedEnvProbeOutput(result.stdout) : undefined;
    if (parsed) wslProjectShellEnvResolved.set(key, parsed);
    return parsed;
  })();
  wslProjectShellEnvCache.set(key, promise);
  return promise;
}

function buildPrimedEnvProbe(): string {
  return [`printf '%s\\n' ${quotePosixShellArg(PRIMED_ENV_MARKER)}`, `env`].join("; ");
}

async function runPrimedEnvProbe(
  command: string,
  args: string[],
  options: { cwd?: string } = {},
): Promise<Record<string, string> | undefined> {
  try {
    const { stdout } = await execFileAsync(command, args, {
      ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
      windowsHide: true,
      timeout: 15_000,
    });
    return parsePrimedEnvProbeOutput(stdout ?? "");
  } catch {
    return undefined;
  }
}

function parsePrimedEnvProbeOutput(stdout: string): Record<string, string> | undefined {
  const lines = stdout.split(/\r?\n/g);
  const markerIdx = lines.indexOf(PRIMED_ENV_MARKER);
  if (markerIdx < 0) return undefined;
  const parsed = parsePrimedEnvDump(lines.slice(markerIdx + 1));
  if (Object.keys(parsed).length === 0) return undefined;
  return parsed;
}

const PRIMED_ENV_MARKER = "__PORACODE_ENV_BEGIN__";
/** Matches a line that opens a new exported var: `NAME=value`. */
const PRIMED_ENV_VAR_RE = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;

export function parsePrimedEnvDump(lines: string[]): Record<string, string> {
  const env: Record<string, string> = {};
  let currentKey: string | undefined;
  // `env` output ends with a newline, so splitting yields trailing empty
  // strings. Without trimming them, the continuation branch below would append
  // "\n" to whichever variable happens to be last in the dump (e.g. GH_HOST →
  // "github.com\n", which breaks gh's URL building in every spawned process).
  const end = lines.findLastIndex((line) => line.length > 0) + 1;
  for (const line of lines.slice(0, end)) {
    const match = PRIMED_ENV_VAR_RE.exec(line);
    if (match) {
      const [, key, value] = match;
      if (PRIMED_ENV_SKIP.has(key!)) {
        currentKey = undefined;
        continue;
      }
      env[key!] = value!;
      currentKey = key;
    } else if (currentKey !== undefined) {
      env[currentKey] = `${env[currentKey] ?? ""}\n${line}`;
    }
  }
  return env;
}

export async function primeExecutablePathCache(commands: readonly string[]): Promise<void> {
  if (process.platform === "win32" || commands.length === 0) {
    return;
  }
  const unique = [...new Set(commands)];
  const probeLines = [
    ...unique.map(
      (cmd) =>
        `printf '%s\\t' ${quotePosixShellArg(cmd)}; command -v ${quotePosixShellArg(cmd)} 2>/dev/null || true; printf '\\n'`,
    ),
    `printf '%s\\n' ${quotePosixShellArg(PRIMED_ENV_MARKER)}`,
    `env`,
  ];
  const script = probeLines.join("; ");
  try {
    const { stdout } = await execFileAsync(
      process.env.SHELL || "/bin/bash",
      getPosixLoginShellArgs(script),
      {
        cwd: homedir(),
        windowsHide: true,
        timeout: 15_000,
      },
    );
    const ts = Date.now();
    const allLines = (stdout ?? "").split(/\r?\n/g);
    const markerIdx = allLines.indexOf(PRIMED_ENV_MARKER);
    const lookupLines = markerIdx >= 0 ? allLines.slice(0, markerIdx) : allLines;
    const envLines = markerIdx >= 0 ? allLines.slice(markerIdx + 1) : [];

    const resolved = new Map<string, string | undefined>();
    for (const line of lookupLines) {
      const tab = line.indexOf("\t");
      if (tab < 0) continue;
      const name = line.slice(0, tab);
      const value = line.slice(tab + 1).trim();
      resolved.set(name, value.length > 0 ? value : undefined);
    }
    for (const cmd of unique) {
      const path = resolved.get(cmd) ?? findPosixExecutableInWellKnownDirs(cmd);
      execPathCache.set(cmd, { path, ts });
    }

    if (envLines.length > 0) {
      const parsed = parsePrimedEnvDump(envLines);
      if (Object.keys(parsed).length > 0) {
        primedPosixEnv = parsed;
      }
    }
  } catch {
    // Leave cache untouched on failure; per-binary fallback paths still run.
  }
}

export async function resolveExecutablePathAsync(command: string): Promise<string | undefined> {
  const cached = execPathCache.get(command);
  if (cached && Date.now() - cached.ts < EXEC_CACHE_TTL_MS) {
    return cached.path;
  }

  let resolved: string | undefined;
  try {
    resolved =
      process.platform === "win32"
        ? ((await (async () => {
            try {
              const ambient = parseWindowsExecutablePath(
                (
                  await execFileAsync(getWindowsSystemCommand("where.exe"), [command], {
                    windowsHide: true,
                    timeout: 5_000,
                  })
                ).stdout ?? "",
              );
              if (ambient) return ambient;
            } catch {
              // Fall through to the registry-backed PATH override below.
            }
            const env = buildWindowsPathOverride();
            if (!env) return undefined;
            try {
              return parseWindowsExecutablePath(
                (
                  await execFileAsync(getWindowsSystemCommand("where.exe"), [command], {
                    env,
                    windowsHide: true,
                    timeout: 5_000,
                  })
                ).stdout ?? "",
              );
            } catch {
              return undefined;
            }
          })()) ?? undefined)
        : parseCommandOutputLine(
            (
              await execFileAsync(
                process.env.SHELL || "/bin/bash",
                getPosixLoginShellArgs(`command -v ${quotePosixShellArg(command)}`),
                {
                  cwd: homedir(),
                  windowsHide: true,
                  timeout: 5_000,
                },
              )
            ).stdout ?? "",
          );
  } catch {
    resolved = undefined;
  }
  const finalPath = resolved ?? findPosixExecutableInWellKnownDirs(command);
  execPathCache.set(command, { path: finalPath, ts: Date.now() });
  return finalPath;
}

export async function readCommandOutputAsync(
  command: string,
  args: string[],
  options?: { cwd?: string; env?: Record<string, string>; timeout?: number },
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      windowsHide: true,
      timeout: options?.timeout ?? DEFAULT_COMMAND_OUTPUT_TIMEOUT_MS,
      ...(options?.cwd ? { cwd: options.cwd } : {}),
      ...(options?.env ? { env: { ...process.env, ...options.env } } : {}),
    });
    return { ok: true, stdout: (stdout ?? "").trim(), stderr: (stderr ?? "").trim() };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string } | undefined;
    return {
      ok: false,
      stdout: (err?.stdout ?? "").trim(),
      stderr: (err?.stderr ?? "").trim(),
    };
  }
}

export async function batchWslCommandsAsync(
  distro: string,
  commands: string[],
): Promise<{ ok: boolean; stdout: string }[]> {
  if (!wslProcessBridgeClient) return bridgeBatchFallback(commands.length);
  try {
    const result = await wslProcessBridgeClient.processBatch(makeWslBridgeLocation(distro), {
      timeoutMs: 15_000,
      commands: commands.map((cmd) => ({
        command: "sh",
        cwd: "/",
        args: ["-lc", cmd],
        loginEnv: true,
      })),
    });
    return result.results.map((entry) => ({
      ok: entry.ok,
      stdout: entry.stdout.trim(),
    }));
  } catch {
    return bridgeBatchFallback(commands.length);
  }
}

export async function parallelWslCommandsAsync(
  distro: string,
  commands: { cwd?: string; cmd: string }[],
  options?: { timeoutMs?: number },
): Promise<{ ok: boolean; stdout: string; exitCode: number }[]> {
  if (!wslProcessBridgeClient) {
    return commands.map(() => ({ ok: false, stdout: "", exitCode: 1 }));
  }
  try {
    const result = await wslProcessBridgeClient.processBatch(makeWslBridgeLocation(distro), {
      timeoutMs: options?.timeoutMs ?? 30_000,
      commands: commands.map((entry) => ({
        command: "sh",
        cwd: entry.cwd ?? "/",
        args: ["-lc", entry.cmd],
        loginEnv: true,
      })),
    });
    return result.results.map((entry) => ({
      ok: entry.ok,
      stdout: entry.stdout.replace(/^\n+|\n+$/g, ""),
      exitCode: entry.exitCode,
    }));
  } catch {
    return commands.map(() => ({ ok: false, stdout: "", exitCode: 1 }));
  }
}

export async function readWslCommandOutputAsync(
  distro: string,
  command: string,
  args: string[],
  options?: { cwd?: string },
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  if (!wslProcessBridgeClient) return { ok: false, stdout: "", stderr: "" };
  try {
    const result = await wslProcessBridgeClient.processExec(
      makeWslBridgeLocation(distro, options?.cwd ?? "/"),
      {
        command,
        cwd: options?.cwd ?? "/",
        args,
        loginEnv: true,
        timeoutMs: 10_000,
      },
    );
    return bridgeProcessOutput(result);
  } catch {
    return { ok: false, stdout: "", stderr: "" };
  }
}

export async function readWslLoginShellCommandOutputAsync(
  distro: string,
  linuxCwd: string,
  command: string,
  args: string[],
  options?: { timeout?: number; maxBuffer?: number; env?: Record<string, string> },
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  if (!wslProcessBridgeClient) return { ok: false, stdout: "", stderr: "" };
  try {
    const result = await wslProcessBridgeClient.processExec(
      makeWslBridgeLocation(distro, linuxCwd),
      {
        command,
        cwd: linuxCwd,
        args,
        loginEnv: true,
        timeoutMs: options?.timeout ?? 10_000,
        ...(options?.env ? { env: options.env } : {}),
      },
    );
    return bridgeProcessOutput(result);
  } catch {
    return { ok: false, stdout: "", stderr: "" };
  }
}

export async function execInWsl(
  distro: string,
  linuxCwd: string,
  command: string,
  args: string[],
  options?: { timeout?: number; maxBuffer?: number; env?: NodeJS.ProcessEnv },
): Promise<string> {
  if (!wslProcessBridgeClient) {
    throw new Error(`WSL bridge unavailable for distro ${distro}`);
  }
  const result = await wslProcessBridgeClient.processExec(makeWslBridgeLocation(distro, linuxCwd), {
    command,
    cwd: linuxCwd,
    args,
    loginEnv: true,
    timeoutMs: options?.timeout ?? 10_000,
    ...(options?.env ? { env: toStringEnv(options.env) } : {}),
  });
  if (result.ok) return result.stdout;
  const error = new Error(
    result.error || result.stderr || `process exited ${result.exitCode}`,
  ) as Error & { stdout?: string; stderr?: string; code?: number };
  error.stdout = result.stdout;
  error.stderr = result.stderr;
  error.code = result.exitCode;
  throw error;
}

export async function resolveWslHomeDirectoryAsync(distro: string): Promise<string | undefined> {
  const cached = wslHomeCache.get(distro);
  if (cached) {
    return cached;
  }

  const result = await readWslCommandOutputAsync(distro, "sh", ["-lc", 'printf %s "$HOME"']);
  const home = result.ok ? result.stdout.trim() : "";
  if (!home) {
    return undefined;
  }
  wslHomeCache.set(distro, home);
  return home;
}
