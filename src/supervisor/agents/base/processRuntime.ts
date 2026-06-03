import { execFile, spawn, spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { promisify } from "node:util";
import {
  buildPosixExportPrefix,
  getPosixLoginShellArgs,
  getWindowsSystemCommand,
  quotePowerShellLiteral,
  getWslCommand,
  quotePosixShellArg,
} from "./shellBasics";

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
  if (result.error || result.status !== 0) {
    return undefined;
  }
  return parseCommandOutputLine(`${result.stdout ?? ""}`);
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

const WSL_BATCH_DELIMITER = "---LIGHTCODE_BATCH_SEP---";
const DEFAULT_WSL_EXEC_PATH = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
const wslShellPathCache = new Map<string, string>();

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
  return lines.findLast((line) => /\.(?:bat|cmd|com|exe|ps1)$/i.test(line)) ?? lines.at(-1);
}

const wslHomeCache = new Map<string, string>();

function buildDirectWslCommandArgs(command: string, args: string[]): string[] {
  if (!command.startsWith("/")) {
    return [command, ...args];
  }

  const slashIndex = command.lastIndexOf("/");
  const binDir = slashIndex > 0 ? command.slice(0, slashIndex) : undefined;
  const pathSegments = [binDir, DEFAULT_WSL_EXEC_PATH].filter((segment): segment is string =>
    Boolean(segment),
  );

  return ["/usr/bin/env", `PATH=${pathSegments.join(":")}`, command, ...args];
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

export async function resolveWslShellPathAsync(distro: string): Promise<string> {
  const cached = wslShellPathCache.get(distro);
  if (cached) {
    return cached;
  }

  try {
    const { stdout } = await execFileAsync(
      getWslCommand(),
      ["-d", distro, "--", "sh", "-lc", 'getent passwd "$(id -un)" | cut -d: -f7'],
      {
        windowsHide: true,
        timeout: 3_000,
      },
    );
    const shellPath = parseCommandOutputLine(stdout ?? "");
    if (shellPath) {
      wslShellPathCache.set(distro, shellPath);
      return shellPath;
    }
  } catch {
    // Fall through to bash so rc files (nvm/fnm/asdf) still get sourced.
  }

  const fallback = "/bin/bash";
  wslShellPathCache.set(distro, fallback);
  return fallback;
}

export function buildBatchWslScript(commands: string[], sep = WSL_BATCH_DELIMITER): string {
  return commands.map((cmd) => `(${cmd}) 2>/dev/null; echo "${sep}"`).join("\n");
}

/**
 * Run multiple commands in a single `wsl.exe` invocation, splitting output
 * by a known delimiter. This avoids the per-invocation overhead of spawning
 * separate `wsl.exe` processes.
 */
export function batchWslCommands(
  distro: string,
  commands: string[],
): { ok: boolean; stdout: string }[] {
  const sep = WSL_BATCH_DELIMITER;
  const script = buildBatchWslScript(commands, sep);
  const result = spawnSync(
    getWslCommand(),
    ["-d", distro, "--", resolveWslShellPath(distro), "-l", "-i", "-c", script],
    {
      encoding: "utf8",
      shell: false,
      windowsHide: true,
      timeout: 15_000,
    },
  );
  if (result.error || result.status !== 0) {
    return commands.map(() => ({ ok: false, stdout: "" }));
  }
  const parts = (result.stdout ?? "").split(sep);
  return commands.map((_, i) => {
    const raw = (parts[i] ?? "").trim();
    return { ok: raw.length > 0, stdout: raw };
  });
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

export function resolveWslExecutablePath(distro: string, command: string): string | undefined {
  const result = spawnSync(
    getWslCommand(),
    ["-d", distro, "--", resolveWslShellPath(distro), "-l", "-i", "-c", `command -v ${command}`],
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
  const resolved = parseCommandOutputLine(`${result.stdout ?? ""}`);
  if (!resolved || isWslInteropBinaryPath(resolved)) {
    return undefined;
  }
  return resolved;
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

export function readWslCommandOutput(
  distro: string,
  command: string,
  args: string[],
): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync(
    getWslCommand(),
    ["-d", distro, "--", ...buildDirectWslCommandArgs(command, args)],
    {
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    },
  );
  return {
    ok: result.status === 0,
    stdout: `${result.stdout ?? ""}`.trim(),
    stderr: `${result.stderr ?? ""}`.trim(),
  };
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
    let shellPath: string;
    try {
      shellPath = await resolveWslShellPathAsync(distro);
    } catch {
      return undefined;
    }
    const parsed = await runPrimedEnvProbe(getWslCommand(), [
      "-d",
      distro,
      "--cd",
      cwd,
      "--",
      shellPath,
      "-l",
      "-i",
      "-c",
      buildPrimedEnvProbe(),
    ]);
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
    const lines = (stdout ?? "").split(/\r?\n/g);
    const markerIdx = lines.indexOf(PRIMED_ENV_MARKER);
    if (markerIdx < 0) return undefined;
    const parsed = parsePrimedEnvDump(lines.slice(markerIdx + 1));
    if (Object.keys(parsed).length === 0) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

const PRIMED_ENV_MARKER = "__LIGHTCODE_ENV_BEGIN__";
/** Matches a line that opens a new exported var: `NAME=value`. */
const PRIMED_ENV_VAR_RE = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;

function parsePrimedEnvDump(lines: string[]): Record<string, string> {
  const env: Record<string, string> = {};
  let currentKey: string | undefined;
  for (const line of lines) {
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
      execPathCache.set(cmd, { path: resolved.get(cmd), ts });
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

  try {
    const resolved =
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
    execPathCache.set(command, { path: resolved, ts: Date.now() });
    return resolved;
  } catch {
    execPathCache.set(command, { path: undefined, ts: Date.now() });
    return undefined;
  }
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
  const sep = WSL_BATCH_DELIMITER;
  const script = buildBatchWslScript(commands, sep);
  try {
    const shellPath = await resolveWslShellPathAsync(distro);
    const { stdout } = await execFileAsync(
      getWslCommand(),
      ["-d", distro, "--", shellPath, "-l", "-i", "-c", script],
      {
        windowsHide: true,
        timeout: 15_000,
      },
    );
    const parts = (stdout ?? "").split(sep);
    return commands.map((_, i) => {
      const raw = (parts[i] ?? "").trim();
      return { ok: raw.length > 0, stdout: raw };
    });
  } catch {
    return commands.map(() => ({ ok: false, stdout: "" }));
  }
}

export async function parallelWslCommandsAsync(
  distro: string,
  commands: { cwd?: string; cmd: string }[],
  options?: { timeoutMs?: number },
): Promise<{ ok: boolean; stdout: string; exitCode: number }[]> {
  const sep = WSL_BATCH_DELIMITER;
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const script = buildParallelWslScript(commands, sep);
  try {
    const shellPath = await resolveWslShellPathAsync(distro);
    const wslArgs = ["-d", distro, "--", shellPath, "-l"];
    const stdout = await runWslScriptViaStdin(wslArgs, script, timeoutMs);
    return parseParallelWslOutput(stdout, commands.length, sep);
  } catch {
    return commands.map(() => ({ ok: false, stdout: "", exitCode: 1 }));
  }
}

function runWslScriptViaStdin(
  wslArgs: string[],
  script: string,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(getWslCommand(), wslArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > 50 * 1024 * 1024) child.kill();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error("wsl batch timed out"));
      if (code !== 0 && stdout.length === 0) {
        return reject(new Error(`wsl batch exited ${code}: ${stderr.trim()}`));
      }
      resolve(stdout);
    });
    child.stdin.write(script);
    child.stdin.end();
  });
}

function buildParallelWslScript(commands: { cwd?: string; cmd: string }[], sep: string): string {
  const launchers = commands
    .map((c, i) => {
      const cwdPrefix = c.cwd ? `cd ${quotePosixShellArg(c.cwd)} && ` : "";
      return `(${cwdPrefix}${c.cmd}) >"$T/${i}.out" 2>/dev/null; echo $? >"$T/${i}.rc" &`;
    })
    .join("\n");
  const emitters = commands
    .map(
      (_, i) =>
        `printf '%s\\n' "$(cat "$T/${i}.out")"; printf '\\n${sep}\\n%s\\n${sep}\\n' "$(cat "$T/${i}.rc")"`,
    )
    .join("\n");
  return [
    `export GIT_OPTIONAL_LOCKS=0`,
    `T=$(mktemp -d)`,
    `trap 'rm -rf "$T"' EXIT`,
    launchers,
    `wait`,
    emitters,
  ].join("\n");
}

function parseParallelWslOutput(
  stdout: string,
  count: number,
  sep: string,
): { ok: boolean; stdout: string; exitCode: number }[] {
  const parts = stdout.split(sep);
  const result: { ok: boolean; stdout: string; exitCode: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const out = (parts[i * 2] ?? "").replace(/^\n+|\n+$/g, "");
    const rcStr = (parts[i * 2 + 1] ?? "").trim();
    const exitCode = parseInt(rcStr, 10);
    result.push({
      ok: Number.isFinite(exitCode) && exitCode === 0,
      stdout: out,
      exitCode: Number.isFinite(exitCode) ? exitCode : 1,
    });
  }
  return result;
}

export async function readWslCommandOutputAsync(
  distro: string,
  command: string,
  args: string[],
  options?: { cwd?: string },
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(
      getWslCommand(),
      [
        "-d",
        distro,
        ...(options?.cwd ? ["--cd", options.cwd] : []),
        "--",
        ...buildDirectWslCommandArgs(command, args),
      ],
      {
        windowsHide: true,
        timeout: DEFAULT_COMMAND_OUTPUT_TIMEOUT_MS,
      },
    );
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

export async function readWslLoginShellCommandOutputAsync(
  distro: string,
  linuxCwd: string,
  command: string,
  args: string[],
  options?: { timeout?: number; maxBuffer?: number; env?: Record<string, string> },
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const shellPath = resolveWslShellPath(distro);
  const exports = buildPosixExportPrefix(options?.env);
  const script = `${exports}exec ${[command, ...args].map(quotePosixShellArg).join(" ")}`;

  try {
    const { stdout, stderr } = await execFileAsync(
      getWslCommand(),
      ["-d", distro, "--cd", linuxCwd, "--", shellPath, "-l", "-i", "-c", script],
      {
        windowsHide: true,
        timeout: options?.timeout ?? DEFAULT_COMMAND_OUTPUT_TIMEOUT_MS,
        ...(options?.maxBuffer ? { maxBuffer: options.maxBuffer } : {}),
      },
    );
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

export async function execInWsl(
  distro: string,
  linuxCwd: string,
  command: string,
  args: string[],
  options?: { timeout?: number; maxBuffer?: number; env?: NodeJS.ProcessEnv },
): Promise<string> {
  const { stdout } = await execFileAsync(
    getWslCommand(),
    ["-d", distro, "--cd", linuxCwd, "--", command, ...args],
    {
      windowsHide: true,
      timeout: options?.timeout ?? DEFAULT_COMMAND_OUTPUT_TIMEOUT_MS,
      ...(options?.maxBuffer ? { maxBuffer: options.maxBuffer } : {}),
      ...(options?.env ? { env: options.env } : {}),
    },
  );
  return stdout;
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
