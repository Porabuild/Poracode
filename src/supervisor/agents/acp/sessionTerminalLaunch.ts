/**
 * Build the concrete `{ command, args, cwd, env }` launch spec for an ACP
 * `terminal/create` request, per host shell (Windows PowerShell/cmd, WSL,
 * POSIX login shell), plus the small text-matching helpers used to correlate
 * a launched terminal's command line back to its ACP request.
 */
import type { TerminalExitStatus } from "@agentclientprotocol/sdk";
import type { ProjectLocation } from "@/shared/contracts";
import { processEnvRecord } from "@/supervisor/processEnv";
import {
  buildPosixExportPrefix,
  detectShell,
  getPosixLoginShellArgs,
  getProjectShellEnv,
  getWindowsSystemCommand,
  getWindowsPathOverrideEnv,
  getWslCommand,
  quotePosixShellArg,
  quotePowerShellLiteral,
  resolveWslShellPath,
} from "../base";
import { resolveAcpHostFsPath, resolveAcpProjectPath } from "./sessionPaths";
import type { AcpTerminalRecord } from "./sessionTerminal";

export function buildTerminalCommandLine(command: string, args: string[]): string {
  return [command, ...args].join(" ");
}

export function normalizeTerminalCommandText(command: string | undefined): string | undefined {
  const normalized = command
    ?.trim()
    .replace(/^cmd(?:\.exe)?\s+\/d\s+\/s\s+\/c\s+/i, "")
    .replace(/^cmd(?:\.exe)?\s+\/c\s+/i, "")
    .replace(/^powershell(?:\.exe)?\s+.*?-command\s+/i, "")
    .replace(/^pwsh(?:\.exe)?\s+.*?-command\s+/i, "")
    .replace(/\s+/g, " ");
  return normalized && normalized.length > 0 ? normalized : undefined;
}

export function isSameTerminalCommand(expectedNormalized: string, actual: string): boolean {
  const actualNormalized = normalizeTerminalCommandText(actual);
  if (!actualNormalized) return false;
  return (
    actualNormalized === expectedNormalized || actualNormalized.endsWith(` ${expectedNormalized}`)
  );
}

function buildAcpTerminalEnv(location: ProjectLocation): Record<string, string> {
  const env = processEnvRecord();
  if (location.kind === "windows") {
    return {
      ...env,
      ...(getProjectShellEnv(location.path) ?? getWindowsPathOverrideEnv() ?? {}),
    };
  }
  if (location.kind === "posix") {
    return { ...env, ...(getProjectShellEnv(location.path) ?? {}) };
  }
  return env;
}

function encodePowerShellCommand(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

function buildWindowsTerminalScript(command: string, args: string[]): string {
  if (args.length === 0) return `$ErrorActionPreference = 'Stop'; ${command}`;
  return [
    "$ErrorActionPreference = 'Stop'",
    `$cmd = ${quotePowerShellLiteral(command)}`,
    `$args = @(${args.map(quotePowerShellLiteral).join(", ")})`,
    "& $cmd @args",
  ].join("; ");
}

function buildPosixTerminalScript(command: string, args: string[]): string {
  return args.length === 0
    ? command
    : `exec ${[command, ...args].map(quotePosixShellArg).join(" ")}`;
}

export function acpTerminalEnvEntries(
  entries: ReadonlyArray<{ name: string; value: string }> | null | undefined,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const entry of entries ?? []) {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(entry.name)) {
      env[entry.name] = entry.value;
    }
  }
  return env;
}

export function resolveAcpTerminalCwd(location: ProjectLocation, cwd: string): string {
  return location.kind === "wsl"
    ? resolveAcpProjectPath(location, cwd)
    : resolveAcpHostFsPath(location, cwd);
}

export function buildAcpTerminalLaunch(
  location: ProjectLocation,
  cwd: string,
  command: string,
  args: string[],
  requestEnv: Record<string, string>,
): { command: string; args: string[]; cwd?: string; env: Record<string, string> } {
  if (location.kind === "windows") {
    const env = { ...buildAcpTerminalEnv(location), ...requestEnv };
    const shell = detectShell();
    if (typeof shell === "string") {
      return {
        command: shell,
        args: [
          "-NoLogo",
          "-NoProfile",
          "-EncodedCommand",
          encodePowerShellCommand(buildWindowsTerminalScript(command, args)),
        ],
        cwd,
        env,
      };
    }
    return {
      command: getWindowsSystemCommand("cmd.exe"),
      args: ["/d", "/s", "/c", args.length === 0 ? command : [command, ...args].join(" ")],
      cwd,
      env,
    };
  }

  if (location.kind === "wsl") {
    const exports = buildPosixExportPrefix({ TERM: "xterm-256color", ...requestEnv });
    const script = `${exports}${buildPosixTerminalScript(command, args)}`;
    return {
      command: getWslCommand(),
      args: [
        "-d",
        location.distro,
        "--cd",
        cwd,
        "--",
        resolveWslShellPath(location.distro),
        "-l",
        "-i",
        "-c",
        script,
      ],
      env: processEnvRecord(),
    };
  }

  if (args.length === 0) {
    return {
      command: process.env.SHELL || "/bin/bash",
      args: getPosixLoginShellArgs(command),
      cwd,
      env: { ...buildAcpTerminalEnv(location), ...requestEnv },
    };
  }

  return {
    command,
    args,
    cwd,
    env: { ...buildAcpTerminalEnv(location), ...requestEnv },
  };
}

export function completeAcpTerminal(record: AcpTerminalRecord, status: TerminalExitStatus): void {
  if (record.exitStatus) return;
  record.exitStatus = status;
  const waiters = record.waiters.splice(0);
  for (const resolve of waiters) {
    resolve(record.exitStatus);
  }
}

export function childExitStatus(
  code: number | null,
  signal: NodeJS.Signals | null,
): TerminalExitStatus {
  return {
    ...(typeof code === "number" ? { exitCode: code } : {}),
    ...(signal ? { signal: String(signal) } : {}),
    ...(code === null && !signal ? { exitCode: 0 } : {}),
  };
}
