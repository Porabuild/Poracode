import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
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
  envKind: "windows" | "wsl";
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
  ensureResumeArtifacts?(): Promise<void>;
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
  /** Detect PTY startup prompts that should be surfaced in the composer UI. */
  detectStartupPrompt?(text: string): TerminalPrompt | null;
  /** Detect when the PTY is ready to accept an initial queued launch prompt. */
  isReadyForInitialPrompt?(text: string): boolean;
  detectTerminalStatus?(text: string): TerminalStatusHint | null;
  detectInvalidSessionRef?(text: string): boolean;
  /** Detect TUI prompts that should be auto-dismissed and return the key to send, or null. */
  detectAutoResponse?(text: string): string | null;
  /** Discover the session ID after PTY spawn (e.g. by querying the CLI). */
  discoverSessionRef?(location: ProjectLocation): Promise<SessionRef | undefined>;
  /** Allow the adapter to reconcile config from TUI-derived state transitions it owns. */
  syncConfigFromTerminalState?(input: SyncConfigFromTerminalStateInput): ThreadConfig | undefined;
  /** Default model for lightweight one-shot tasks like commit message generation. */
  defaultOneShotModel?: string;
  /**
   * Build a command for one-shot prompt→response (e.g. commit-msg gen).
   * Prompt is piped via stdin.
   */
  buildOneShotCommand?(
    model: string,
    effort?: string,
  ): { command: string; args: string[] } | undefined;
}

export interface TerminalStatusHint {
  status: ThreadStatus;
  attention: ThreadAttention;
  prompt?: TerminalPrompt | undefined;
  planMode?: boolean | undefined;
}

export interface SyncConfigFromTerminalStateInput {
  config: ThreadConfig;
  previousStatus: ThreadStatus;
  previousAttention: ThreadAttention;
  hint: TerminalStatusHint;
}

export function buildWindowsCmdCommand(cwd: string, command: string, args: string[]): CommandSpec {
  return {
    command: "C:\\Windows\\System32\\cmd.exe",
    args: ["/d", "/s", "/c", command, ...args],
    cwd,
  };
}

export function getWslCommand(): string {
  const systemRoot = process.env.SystemRoot ?? process.env.windir ?? "C:\\Windows";
  return join(systemRoot, "System32", "wsl.exe");
}

function quotePowerShellLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function quotePosixShellArg(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function encodePowerShellCommand(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

/** Detect the best available shell. Returns a shell path on Windows (pwsh > powershell > cmd), or `true` on Unix (default shell). */
export function detectShell(
  resolvePath: ResolveExecutablePath = resolveExecutablePath,
): string | true {
  if (process.platform !== "win32") return true;
  return (
    resolvePath("pwsh.exe") ??
    resolvePath("pwsh") ??
    resolvePath("powershell.exe") ??
    resolvePath("powershell") ??
    true
  );
}

export function buildWindowsCommand(
  cwd: string,
  command: string,
  args: string[],
  resolvePath: ResolveExecutablePath = resolveExecutablePath,
): CommandSpec {
  const shell = detectShell(resolvePath);
  if (typeof shell === "string") {
    const script = [
      "$ErrorActionPreference = 'Stop'",
      `$cmd = ${quotePowerShellLiteral(command)}`,
      `$args = @(${args.map(quotePowerShellLiteral).join(", ")})`,
      "& $cmd @args",
    ].join("; ");

    return {
      command: shell,
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
  if (location.kind !== "wsl") {
    const cwd = location.path;
    return buildWindowsCommand(cwd, command, args);
  }

  if (!wslExecPath) {
    const shellPath = resolveWslShellPath(location.distro);
    const script = `exec ${[command, ...args].map(quotePosixShellArg).join(" ")}`;
    return {
      command: getWslCommand(),
      args: [
        "-d",
        location.distro,
        "--cd",
        location.linuxPath,
        "--",
        shellPath,
        "-l",
        "-i",
        "-c",
        script,
      ],
    };
  }

  return {
    command: getWslCommand(),
    args: [
      "-d",
      location.distro,
      "--cd",
      location.linuxPath,
      "--",
      ...buildDirectWslCommandArgs(wslExecPath, args),
    ],
  };
}

export function resolveExecutablePath(command: string): string | undefined {
  const locator = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(locator, [command], {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
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
        timeout: 5_000,
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
    // Fall through to POSIX sh.
  }

  const fallback = "/bin/sh";
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
        timeout: 5_000,
      },
    );
    const shellPath = parseCommandOutputLine(stdout ?? "");
    if (shellPath) {
      wslShellPathCache.set(distro, shellPath);
      return shellPath;
    }
  } catch {
    // Fall through to POSIX sh.
  }

  const fallback = "/bin/sh";
  wslShellPathCache.set(distro, fallback);
  return fallback;
}

export function buildBatchWslScript(commands: string[], sep = WSL_BATCH_DELIMITER): string {
  return commands.map((cmd) => `(${cmd}) 2>/dev/null; echo "${sep}"`).join("\n");
}

/**
 * Run multiple commands in a single `wsl.exe` invocation, splitting output
 * by a known delimiter.  This avoids the ~800-1000ms per-invocation overhead
 * of spawning separate `wsl.exe` processes.
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

export function resolveWslExecutablePath(distro: string, command: string): string | undefined {
  const result = spawnSync(
    getWslCommand(),
    ["-d", distro, "--", resolveWslShellPath(distro), "-l", "-i", "-c", `command -v ${command}`],
    {
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

// ── Async (non-blocking) variants for agent detection ──────────────
// These use execFile instead of spawnSync so the event loop stays free
// for IPC messages (git status, thread snapshots, etc.) during detection.

export async function resolveExecutablePathAsync(command: string): Promise<string | undefined> {
  const locator = process.platform === "win32" ? "where.exe" : "which";
  try {
    const { stdout } = await execFileAsync(locator, [command], {
      windowsHide: true,
      timeout: 5_000,
    });
    return stdout
      .split(/\r?\n/g)
      .find((line) => line.trim().length > 0)
      ?.trim();
  } catch {
    return undefined;
  }
}

export async function readCommandOutputAsync(
  command: string,
  args: string[],
  options?: { cwd?: string },
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      windowsHide: true,
      timeout: 10_000,
      ...(options?.cwd ? { cwd: options.cwd } : {}),
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
      { windowsHide: true, timeout: 15_000 },
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
        timeout: 10_000,
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

export function detectAuthFile(filePath: string): AuthState {
  return existsSync(filePath) ? "authenticated" : "missing";
}

export function createKnownSessionRef(sessionId?: string): SessionRef {
  return {
    providerSessionId: sessionId ?? randomUUID(),
    discoveredAt: new Date().toISOString(),
  };
}
