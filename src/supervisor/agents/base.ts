import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import type {
  AgentCapability,
  AgentKind,
  AgentStatus,
  AuthState,
  ProjectLocation,
  SessionRef,
  TerminalPrompt,
  ThreadServerRequestId,
  ThreadAttention,
  ThreadConfig,
  ThreadStatus,
} from "../../shared/contracts";

export interface CommandSpec {
  command: string;
  args: string[];
  cwd?: string;
  sessionRef?: SessionRef;
}

export interface AgentEnvContext {
  environmentMode: "windows" | "wsl";
  wslDistro?: string;
}

export interface AgentLaunchOptions {
  enabledFeatures?: string[];
  remoteUrl?: string;
  suppressResumeConfigOverrides?: boolean;
  resumeThreadId?: string;
}

export interface StructuredSessionUpdate {
  status: ThreadStatus;
  attention: ThreadAttention;
  config?: ThreadConfig;
  sessionRef?: SessionRef;
  errorMessage?: string;
}

export interface StructuredSessionListener {
  onClose(): void;
  onError(errorMessage: string): void;
  onServerRequest(request: {
    requestId: ThreadServerRequestId;
    method: string;
    params: unknown;
  }): void;
  onUpdate(update: StructuredSessionUpdate): void;
}

export interface StructuredSessionHandle {
  launchOptions: AgentLaunchOptions;
  activate?(): Promise<void>;
  openThread?(config: ThreadConfig, sessionRef?: SessionRef): Promise<string>;
  waitForRolloutFile?(timeoutMs?: number): Promise<void>;
  startTurn?(prompt: string, config: ThreadConfig): Promise<void>;
  resolveServerRequest?(requestId: ThreadServerRequestId, response: unknown): Promise<void>;
  setListener(listener: StructuredSessionListener): void;
  dispose(): Promise<void>;
}

type ResolveExecutablePath = (command: string) => string | undefined;

export interface CreateStructuredSessionInput {
  threadId: string;
  projectLocation: ProjectLocation;
  config: ThreadConfig;
  sessionRef?: SessionRef;
}

export interface AgentAdapter {
  kind: AgentKind;
  label: string;
  capabilities: AgentCapability;
  detectInstall(ctx?: AgentEnvContext): Promise<AgentStatus>;
  buildLaunchCommand(
    location: ProjectLocation,
    config: ThreadConfig,
    prompt: string,
    sessionRef?: SessionRef,
    launchOptions?: AgentLaunchOptions,
  ): CommandSpec;
  buildResumeCommand(
    location: ProjectLocation,
    config: ThreadConfig,
    prompt: string,
    sessionRef: SessionRef,
    launchOptions?: AgentLaunchOptions,
  ): CommandSpec;
  createInitialSessionRef(): SessionRef | undefined;
  createStructuredSession?(input: CreateStructuredSessionInput): Promise<StructuredSessionHandle>;
  buildDirectInput?(prompt: string): string[];
  detectTerminalStatus?(text: string): TerminalStatusHint | null;
}

export interface TerminalStatusHint {
  status: ThreadStatus;
  attention: ThreadAttention;
  prompt?: TerminalPrompt | undefined;
  planMode?: boolean | undefined;
}

export function buildWindowsCmdCommand(cwd: string, command: string, args: string[]): CommandSpec {
  return {
    command: "C:\\Windows\\System32\\cmd.exe",
    args: ["/d", "/s", "/c", command, ...args],
    cwd,
  };
}

function quotePowerShellLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function encodePowerShellCommand(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

export function buildWindowsCommand(
  cwd: string,
  command: string,
  args: string[],
  resolvePath: ResolveExecutablePath = resolveExecutablePath,
): CommandSpec {
  const pwshPath = resolvePath("pwsh.exe") ?? resolvePath("pwsh");
  if (pwshPath) {
    const script = [
      "$ErrorActionPreference = 'Stop'",
      `$cmd = ${quotePowerShellLiteral(command)}`,
      `$args = @(${args.map(quotePowerShellLiteral).join(", ")})`,
      "& $cmd @args",
    ].join("; ");

    return {
      command: pwshPath,
      args: ["-NoLogo", "-NoProfile", "-EncodedCommand", encodePowerShellCommand(script)],
      cwd,
    };
  }

  const powershellPath = resolvePath("powershell.exe") ?? resolvePath("powershell");
  if (powershellPath) {
    const script = [
      "$ErrorActionPreference = 'Stop'",
      `$cmd = ${quotePowerShellLiteral(command)}`,
      `$args = @(${args.map(quotePowerShellLiteral).join(", ")})`,
      "& $cmd @args",
    ].join("; ");

    return {
      command: powershellPath,
      args: ["-NoLogo", "-NoProfile", "-EncodedCommand", encodePowerShellCommand(script)],
      cwd,
    };
  }

  return buildWindowsCmdCommand(cwd, command, args);
}

export function wrapWslCommand(
  location: ProjectLocation,
  command: string,
  args: string[],
  wslExecPath?: string,
): CommandSpec {
  if (location.kind === "windows") {
    return buildWindowsCommand(location.path, command, args);
  }

  const quoted = [command, ...args].map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ");

  // When the resolved executable path is known, prepend its directory to PATH
  // and use a fast non-interactive login shell. This avoids the ~1s overhead
  // of bash -lic while still ensuring node/npm binaries are reachable.
  if (wslExecPath) {
    const binDir = wslExecPath.replace(/\/[^/]+$/, "");
    const script = `export PATH='${binDir}':\"\\$PATH\"; ${quoted}`;
    return {
      command: "wsl.exe",
      args: ["-d", location.distro, "--cd", location.linuxPath, "--", "bash", "-lc", script],
    };
  }

  return {
    command: "wsl.exe",
    args: ["-d", location.distro, "--cd", location.linuxPath, "--", "bash", "-lic", quoted],
  };
}

export function resolveExecutablePath(command: string): string | undefined {
  const locator = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(locator, [command], {
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0) {
    return undefined;
  }
  const output = `${result.stdout}`.split(/\r?\n/g).find((line) => line.trim().length > 0);
  return output?.trim();
}

export function readCommandOutput(
  command: string,
  args: string[],
): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return {
    ok: result.status === 0,
    stdout: `${result.stdout ?? ""}`.trim(),
    stderr: `${result.stderr ?? ""}`.trim(),
  };
}

export function resolveWslExecutablePath(distro: string, command: string): string | undefined {
  const result = spawnSync("wsl.exe", ["-d", distro, "--", "bash", "-lic", `which ${command}`], {
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0) {
    return undefined;
  }
  return result.stdout
    ?.split(/\r?\n/g)
    .find((line) => line.trim().length > 0)
    ?.trim();
}

export function readWslCommandOutput(
  distro: string,
  command: string,
  args: string[],
): { ok: boolean; stdout: string; stderr: string } {
  const quoted = [command, ...args].map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ");
  const result = spawnSync("wsl.exe", ["-d", distro, "--", "bash", "-lic", quoted], {
    encoding: "utf8",
    shell: false,
  });
  return {
    ok: result.status === 0,
    stdout: `${result.stdout ?? ""}`.trim(),
    stderr: `${result.stderr ?? ""}`.trim(),
  };
}

export function detectAuthFile(filePath: string): AuthState {
  return existsSync(filePath) ? "authenticated" : "missing";
}

export function createKnownSessionRef(sessionId?: string): SessionRef {
  return {
    providerSessionId: sessionId ?? randomUUID(),
    discoveredAt: new Date().toISOString(),
  };
}

export function readCodexSessionIndex(): Array<{
  id: string;
  updatedAt: number;
  threadName: string;
}> {
  const sessionIndexPath = join(homedir(), ".codex", "session_index.jsonl");
  if (!existsSync(sessionIndexPath)) {
    return [];
  }

  const content = readFileSync(sessionIndexPath, "utf8");
  return content
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as {
          id?: string;
          updated_at?: string;
          thread_name?: string;
        };
        if (!parsed.id || !parsed.updated_at) {
          return [];
        }
        return [
          {
            id: parsed.id,
            updatedAt: Date.parse(parsed.updated_at),
            threadName: parsed.thread_name?.trim() ?? "",
          },
        ];
      } catch {
        return [];
      }
    });
}

export function codexAuthPath(): string {
  return join(homedir(), ".codex", "auth.json");
}
