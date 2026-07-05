import { spawn } from "node:child_process";
import type { SpawnOptions, SpawnedProcess } from "@anthropic-ai/claude-agent-sdk";
import type { ProjectLocation } from "@/shared/contracts";
import {
  buildAgentCommand,
  definedEnv,
  getWslCommand,
  getWslProjectShellEnv,
  quotePosixShellArg,
} from "../base";
import { resolveAgentBinaryPath } from "../binaryResolver";

type WindowsProjectLocation = Extract<ProjectLocation, { kind: "windows" }>;

export function projectCwd(location: ProjectLocation): string {
  switch (location.kind) {
    case "wsl":
      return location.linuxPath;
    case "windows":
    case "posix":
      return location.path;
  }
}

// SDK-provided env is layered on top of the WSL login-shell env we primed,
// so these Windows-host vars must be dropped — otherwise they overwrite the
// Linux PATH (and friends) inside the distro.
const WINDOWS_HOST_ENV_KEYS = new Set([
  "path",
  "pathext",
  "systemroot",
  "windir",
  "comspec",
  "appdata",
  "localappdata",
  "userprofile",
  "homedrive",
  "homepath",
  "programdata",
  "programfiles",
  "programfiles(x86)",
  "commonprogramfiles",
  "commonprogramfiles(x86)",
]);
export const POSIX_ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function filteredEnv(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (WINDOWS_HOST_ENV_KEYS.has(key.toLowerCase())) continue;
    out[key] = value;
  }
  return out;
}

function buildDirectWslEnvCommandArgs(
  command: string,
  args: string[],
  env: Record<string, string>,
): string[] {
  const exports = Object.entries(env)
    .filter(([key]) => POSIX_ENV_NAME_RE.test(key))
    .map(([key, value]) => `export ${key}=${quotePosixShellArg(value)}`)
    .join("; ");
  const exec = `exec ${[command, ...args].map(quotePosixShellArg).join(" ")}`;
  return ["/bin/sh", "-c", exports ? `${exports}; ${exec}` : exec];
}

export function spawnClaudeInWsl(location: ProjectLocation, options: SpawnOptions): SpawnedProcess {
  if (location.kind !== "wsl") {
    throw new Error("spawnClaudeInWsl called for a non-WSL project.");
  }
  const command = options.command || resolveAgentBinaryPath(location, "claude") || "claude";
  const cwd = options.cwd ?? location.linuxPath;
  const capturedEnv =
    getWslProjectShellEnv(location.distro, cwd) ??
    getWslProjectShellEnv(location.distro, location.linuxPath);
  const env = capturedEnv
    ? { ...capturedEnv, ...filteredEnv(options.env) }
    : filteredEnv(options.env);
  const args = [
    "-d",
    location.distro,
    "--cd",
    cwd,
    "--",
    ...buildDirectWslEnvCommandArgs(command, options.args, env),
  ];
  return spawn(getWslCommand(), args, {
    env: process.env,
    signal: options.signal,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  }) as unknown as SpawnedProcess;
}

export function spawnClaudeNative(
  location: WindowsProjectLocation,
  options: SpawnOptions,
): SpawnedProcess {
  const command = options.command || resolveAgentBinaryPath(location, "claude") || "claude";
  const cwd = options.cwd ?? location.path;
  if (process.platform === "win32") {
    const env = definedEnv(options.env);
    const spec = buildAgentCommand(
      { ...location, path: cwd },
      command,
      options.args,
      undefined,
      env,
    );
    return spawn(spec.command, spec.args, {
      ...(spec.env ? { env: spec.env } : Object.keys(env).length > 0 ? { env } : {}),
      signal: options.signal,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      cwd: spec.cwd,
    }) as unknown as SpawnedProcess;
  }
  return spawn(command, options.args, {
    env: options.env,
    signal: options.signal,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    cwd,
  }) as unknown as SpawnedProcess;
}
