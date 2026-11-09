/**
 * Build the concrete `{ command, args, cwd, env }` launch spec for an ACP
 * `terminal/create` request, per host shell (Windows PowerShell/cmd, WSL,
 * POSIX login environment with Bash scripts), plus the text-matching helpers
 * used to correlate a launched terminal's command line back to its ACP request.
 */
import { stat } from "node:fs/promises";
import { wslLinuxToHostFsPath } from "@/shared/wsl";
import { RequestError, type TerminalExitStatus } from "@agentclientprotocol/sdk";
import type { ProjectLocation } from "@/shared/contracts";
import { processEnvRecord } from "@/supervisor/processEnv";
import {
  buildPosixExportPrefix,
  buildPowerShellInvocationScript,
  buildWslLoginShellCommand,
  type DetectedPowerShell,
  detectShell,
  getPosixLoginShellArgs,
  getProjectShellEnv,
  getWindowsSystemCommand,
  getWindowsPathOverrideEnv,
  quotePosixShellArg,
} from "../base";
import {
  assertAcpCanonicalHostFsPath,
  isAcpHomeScopeLocation,
  resolveAcpHostFsPath,
  resolveAcpProjectPath,
  resolveAcpResourcePath,
} from "./sessionPaths";
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

function buildWindowsTerminalScript(
  shell: DetectedPowerShell,
  command: string,
  args: string[],
): string {
  // With no args the command is an entire shell line by contract — run it as
  // PowerShell source. With args it is a native command + argv, so route
  // through the host-appropriate faithful arg-passing strategy.
  const body =
    args.length === 0
      ? `$ErrorActionPreference = 'Stop'; ${command}`
      : buildPowerShellInvocationScript(shell, command, args);
  // -EncodedCommand otherwise reports 1 for any failing native command.
  return `${body}\nif (-not $?) { if ($LASTEXITCODE) { exit $LASTEXITCODE }; exit 1 }`;
}

function buildPosixTerminalScript(command: string, args: string[]): string {
  // A shell line is agent-authored script, not input for the user's preferred
  // interactive shell. Load that shell's environment, then let Bash interpret
  // the script (fish, for example, cannot parse heredocs). Keep it one quoted
  // argument so the outer shell cannot expand substitutions or redirections.
  // Fish also decodes backslash pairs inside single quotes: keep backslashes
  // outside the quoted chunks, escaped in both fish and POSIX shells.
  // No wire or persisted shape changes are needed.
  return args.length === 0
    ? `exec /bin/bash -c ${command.split("\\").map(quotePosixShellArg).join("\\\\")}`
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

export function resolveAcpTerminalCwd(
  location: ProjectLocation,
  cwd: string,
  additionalDirectories: readonly ProjectLocation[] = [],
): string {
  if (isAcpHomeScopeLocation(location)) {
    return resolveAcpResourcePath(location, cwd);
  }
  return location.kind === "wsl"
    ? resolveAcpProjectPath(location, cwd, additionalDirectories)
    : resolveAcpHostFsPath(location, cwd, additionalDirectories);
}

/** Starting-directory authorization only; spawned commands are not sandboxed. */
export async function validateAcpTerminalCwd(
  location: ProjectLocation,
  cwd: string,
  additionalDirectories: readonly ProjectLocation[] = [],
): Promise<void> {
  const hostPath = location.kind === "wsl" ? wslLinuxToHostFsPath(location.distro, cwd) : cwd;
  await assertAcpCanonicalHostFsPath(location, hostPath, "terminal", [], additionalDirectories);
  if (!(await stat(hostPath)).isDirectory()) {
    throw RequestError.invalidParams({ message: "ACP terminal cwd is not a directory." });
  }
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
    if (shell) {
      return {
        command: shell.path,
        args: [
          "-NoLogo",
          "-NoProfile",
          "-EncodedCommand",
          encodePowerShellCommand(buildWindowsTerminalScript(shell, command, args)),
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
      ...buildWslLoginShellCommand(location.distro, cwd, script),
      env: processEnvRecord(),
    };
  }

  if (args.length === 0) {
    return {
      command: process.env.SHELL || "/bin/bash",
      args: getPosixLoginShellArgs(buildPosixTerminalScript(command, args)),
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
