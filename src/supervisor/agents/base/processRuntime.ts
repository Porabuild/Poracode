import { execFile, spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { promisify } from "node:util";
import {
  getPosixLoginShellArgs,
  getWindowsSystemCommand,
  quotePowerShellLiteral,
  quotePosixShellArg,
} from "./shellBasics";
import type { WslBridgeClient, WslLocation, WslProcessExecResult } from "../../wsl/bridge/client";

const execFileAsync = promisify(execFile);

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

function buildWindowsPathOverride(): NodeJS.ProcessEnv | undefined {
  const fallbackPath = buildWindowsFallbackPath();
  if (!fallbackPath) return undefined;
  if (
    normalizeWindowsPathValue(fallbackPath) ===
    normalizeWindowsPathValue(getWindowsEnvValue("Path"))
  ) {
    return undefined;
  }
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
  return lines.findLast((line) => /\.(?:bat|cmd|com|exe|ps1)$/i.test(line)) ?? lines.at(-1);
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

  const fallback = "/bin/bash";
  wslShellPathCache.set(distro, fallback);
  return fallback;
}

export function getCachedWslHomeDirectory(distro: string): string | undefined {
  return wslHomeCache.get(distro);
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

export function clearExecutablePathCache(): void {
  execPathCache.clear();
  cachedWindowsSearchPath = null;
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
  options?: { cwd?: string; env?: Record<string, string> },
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      windowsHide: true,
      timeout: 10_000,
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
