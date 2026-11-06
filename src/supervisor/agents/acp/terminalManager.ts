/**
 * Per-session ACP terminal subsystem.
 *
 * Hosts the client-side command terminals that ACP agents (e.g.
 * Gemini's shell tool) ask us to create via `terminal/create`. Owns the
 * terminal-state maps and the request handlers that the ACP dispatch table
 * in `session.ts` forwards to. Extracted verbatim from `AcpStructuredSession`
 * to keep the session class focused on protocol/prompt lifecycle; the
 * canonical mapper still resolves terminal output through this manager.
 *
 * One-directional dependency: `session.ts` imports this module, never the
 * reverse. Anything the handlers need from the session (project location,
 * cwd, session-id assertion) is threaded in via `AcpTerminalManagerContext`.
 */
import { spawn as spawnChild } from "node:child_process";
import {
  RequestError,
  type CreateTerminalRequest,
  type CreateTerminalResponse,
  type KillTerminalRequest,
  type ReleaseTerminalRequest,
  type TerminalOutputRequest,
  type TerminalOutputResponse,
  type WaitForTerminalExitRequest,
  type WaitForTerminalExitResponse,
} from "@agentclientprotocol/sdk";
import type { ProjectLocation } from "@/shared/contracts";
import { terminateChildProcessTree } from "@/shared/processTree";
import {
  acpTerminalEnvEntries,
  buildAcpTerminalLaunch,
  buildTerminalCommandLine,
  childExitStatus,
  completeAcpTerminal,
  isSameTerminalCommand,
  normalizeTerminalCommandText,
  resolveAcpTerminalCwd,
  validateAcpTerminalCwd,
} from "./sessionTerminalLaunch";
import {
  appendTerminalOutput,
  MAX_ACP_TERMINALS_PER_SESSION,
  type AcpTerminalRecord,
} from "./sessionTerminal";

// Drain queued pipe output after the command exits, without waiting indefinitely
// for a background descendant that inherited stdout/stderr to close them.
const TERMINAL_EXIT_DRAIN_MS = 100;

/**
 * The slice of `AcpStructuredSession` the terminal manager needs. The session
 * constructs one of these and passes it in; the manager never reaches back
 * into the session object.
 */
export interface AcpTerminalManagerContext {
  readonly projectLocation: ProjectLocation;
  readonly cwd: string;
  /** Immutable user-approved scope; only constrains the terminal starting cwd. */
  readonly additionalDirectories?: readonly ProjectLocation[];
  /** Throws `RequestError` if `sessionId` is not the active ACP session. */
  assertRequestSession(sessionId: string): void;
  /** Fences an async cwd check across reopen, including reopening the same id. */
  getSessionGeneration?(): number;
}

export class AcpTerminalManager {
  private readonly acpTerminals = new Map<string, AcpTerminalRecord>();
  private acpTerminalSeq = 0;
  private cancellationGeneration = 0;
  /**
   * Final stdout/stderr snapshot kept around after `releaseTerminal` so the
   * canonical mapper can still surface output when the agent emits its
   * completed `tool_call_update` AFTER releasing the terminal. Without this
   * the live `acpTerminals` entry is gone and the chat row would render
   * without a body even though we have the bytes in hand.
   */
  private readonly releasedAcpTerminalOutput = new Map<string, string>();
  private readonly acpTerminalCommandById = new Map<string, string>();

  constructor(private readonly context: AcpTerminalManagerContext) {}

  async handleCreateTerminal(params: CreateTerminalRequest): Promise<CreateTerminalResponse> {
    this.context.assertRequestSession(params.sessionId);
    if (this.acpTerminals.size >= MAX_ACP_TERMINALS_PER_SESSION) {
      throw RequestError.invalidParams({
        message: `ACP terminal limit reached (${MAX_ACP_TERMINALS_PER_SESSION}); release existing terminals before creating more.`,
      });
    }
    const generation = this.context.getSessionGeneration?.();
    const cancellationGeneration = this.cancellationGeneration;
    const cwd = resolveAcpTerminalCwd(
      this.context.projectLocation,
      params.cwd || this.context.cwd,
      this.context.additionalDirectories,
    );
    await validateAcpTerminalCwd(
      this.context.projectLocation,
      cwd,
      this.context.additionalDirectories,
    );
    this.context.assertRequestSession(params.sessionId);
    if (
      this.context.getSessionGeneration?.() !== generation ||
      cancellationGeneration !== this.cancellationGeneration
    ) {
      throw RequestError.invalidParams({
        message: "ACP terminal request belongs to a retired session.",
      });
    }
    // Concurrent creates may have consumed the budget while validation awaited IO.
    if (this.acpTerminals.size >= MAX_ACP_TERMINALS_PER_SESSION) {
      throw RequestError.invalidParams({
        message: "ACP terminal limit reached during cwd validation.",
      });
    }
    const terminalId = `acp-terminal-${this.acpTerminalSeq++}`;
    const launch = buildAcpTerminalLaunch(
      this.context.projectLocation,
      cwd,
      params.command,
      params.args ?? [],
      acpTerminalEnvEntries(params.env),
    );
    const outputByteLimit =
      typeof params.outputByteLimit === "number" ? params.outputByteLimit : undefined;

    // ACP exposes output/wait/kill/release, with no terminal-input operation.
    // Pipes preserve that contract without spending a host PTY per command.
    // In particular, node-pty 1.1.0 leaks an extra PTY master on macOS spawn,
    // eventually exhausting the machine's PTY pool even after commands exit.
    // Interactive terminal presentation remains owned by the PTY runtime.
    const ownedProcessGroup = process.platform !== "win32";
    const child = spawnChild(launch.command, launch.args, {
      ...(launch.cwd ? { cwd: launch.cwd } : {}),
      env: launch.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
      detached: ownedProcessGroup,
    });
    let processExited = false;
    let stdioClosed = false;
    let exitDrainTimer: ReturnType<typeof setTimeout> | undefined;
    const kill = () => {
      if (stdioClosed) return;
      if (!processExited) {
        terminateChildProcessTree(child, { ownedProcessGroup });
      } else if (ownedProcessGroup && child.pid) {
        // The leader is reaped; only its still-owned group may be signaled.
        // Falling back to its positive PID could target a reused PID.
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          // The group may already be gone.
        }
      }
    };
    const record: AcpTerminalRecord = {
      kill,
      dispose: () => {
        clearTimeout(exitDrainTimer);
        kill();
        child.stdout?.destroy();
        child.stderr?.destroy();
      },
      commandLine: buildTerminalCommandLine(params.command, params.args ?? []),
      output: "",
      outputByteLimit,
      truncated: false,
      exitStatus: undefined,
      waiters: [],
    };
    this.acpTerminals.set(terminalId, record);
    this.acpTerminalCommandById.set(terminalId, record.commandLine);
    child.stdout
      ?.setEncoding("utf8")
      .on("data", (data: string) => appendTerminalOutput(record, data));
    child.stderr
      ?.setEncoding("utf8")
      .on("data", (data: string) => appendTerminalOutput(record, data));
    child.once("error", (error) => {
      clearTimeout(exitDrainTimer);
      appendTerminalOutput(record, `${error.message}\n`);
      completeAcpTerminal(record, { exitCode: 1 });
    });
    child.once("exit", (code, signal) => {
      processExited = true;
      if (record.exitStatus) return;
      exitDrainTimer = setTimeout(() => {
        completeAcpTerminal(record, childExitStatus(code, signal));
      }, TERMINAL_EXIT_DRAIN_MS);
    });
    // close follows normal stdio drain; inherited pipes use the deadline above.
    child.once("close", (code, signal) => {
      stdioClosed = true;
      clearTimeout(exitDrainTimer);
      completeAcpTerminal(record, childExitStatus(code, signal));
    });
    return { terminalId };
  }

  handleTerminalOutput(params: TerminalOutputRequest): TerminalOutputResponse {
    this.context.assertRequestSession(params.sessionId);
    const record = this.getAcpTerminal(params.terminalId);
    return {
      output: record.output,
      truncated: record.truncated,
      ...(record.exitStatus ? { exitStatus: record.exitStatus } : {}),
    };
  }

  handleReleaseTerminal(params: ReleaseTerminalRequest): void {
    this.context.assertRequestSession(params.sessionId);
    const record = this.getAcpTerminal(params.terminalId);
    this.disposeAcpTerminal(params.terminalId, record);
  }

  async handleWaitForTerminalExit(
    params: WaitForTerminalExitRequest,
  ): Promise<WaitForTerminalExitResponse> {
    this.context.assertRequestSession(params.sessionId);
    const record = this.getAcpTerminal(params.terminalId);
    if (record.exitStatus) return record.exitStatus;
    return new Promise((resolve) => {
      record.waiters.push(resolve);
    });
  }

  handleKillTerminal(params: KillTerminalRequest): void {
    this.context.assertRequestSession(params.sessionId);
    const record = this.getAcpTerminal(params.terminalId);
    record.kill();
  }

  releaseAllAcpTerminals(): void {
    this.cancellationGeneration++;
    for (const [terminalId, record] of [...this.acpTerminals]) {
      this.disposeAcpTerminal(terminalId, record);
    }
  }

  /** Stop host-owned commands even when the provider omits terminal/kill. */
  killAllAcpTerminals(): void {
    this.cancellationGeneration++;
    for (const record of this.acpTerminals.values()) record.kill();
  }

  /**
   * Drop the per-turn cache of released-terminal output snapshots. Called by
   * the session at the end of each turn so the cache can't grow across a
   * long-lived session.
   */
  clearReleasedTerminalOutput(): void {
    this.releasedAcpTerminalOutput.clear();
  }

  /**
   * Resolve live terminal output by terminal id. Bridges the client-hosted
   * ACP terminal store into the canonical mapper so `ToolCallContent` entries
   * of type `"terminal"` (Gemini's shell tool) get inlined as the canonical
   * `result` payload.
   */
  getTerminalOutput(terminalId: string): string | undefined {
    const record = this.acpTerminals.get(terminalId);
    if (record) return record.output;
    return this.releasedAcpTerminalOutput.get(terminalId);
  }

  /**
   * Resolve terminal output by matching the executed command line, searching
   * live terminals first then released-output snapshots. Wired into the
   * canonical mapper alongside `getTerminalOutput`.
   */
  resolveAcpTerminalOutputByCommand(command: string): string | undefined {
    const target = normalizeTerminalCommandText(command);
    if (!target) return undefined;

    for (const [_terminalId, record] of [...this.acpTerminals].reverse()) {
      if (!record.output || !isSameTerminalCommand(target, record.commandLine)) continue;
      return record.output;
    }
    for (const [terminalId, output] of [...this.releasedAcpTerminalOutput].reverse()) {
      const commandLine = this.acpTerminalCommandById.get(terminalId);
      if (!output || !commandLine || !isSameTerminalCommand(target, commandLine)) continue;
      return output;
    }
    return undefined;
  }

  private getAcpTerminal(terminalId: string): AcpTerminalRecord {
    const record = this.acpTerminals.get(terminalId);
    if (!record) {
      throw RequestError.invalidParams({ message: `Unknown ACP terminal: ${terminalId}` });
    }
    return record;
  }

  private disposeAcpTerminal(terminalId: string, record: AcpTerminalRecord): void {
    this.acpTerminals.delete(terminalId);
    if (record.output.length > 0) {
      this.releasedAcpTerminalOutput.set(terminalId, record.output);
    }
    record.dispose();
    completeAcpTerminal(record, record.exitStatus ?? { signal: "SIGTERM" });
  }
}
