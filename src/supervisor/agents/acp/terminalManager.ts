/**
 * Per-session ACP terminal subsystem.
 *
 * Hosts the client-side PTY/child-process terminals that ACP agents (e.g.
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
import { spawn as spawnPty } from "node-pty";
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
import { ensureNodePtySpawnHelperExecutable } from "@/supervisor/nodePty";
import {
  acpTerminalEnvEntries,
  buildAcpTerminalLaunch,
  buildTerminalCommandLine,
  childExitStatus,
  completeAcpTerminal,
  isSameTerminalCommand,
  normalizeTerminalCommandText,
  resolveAcpTerminalCwd,
} from "./sessionTerminalLaunch";
import {
  appendTerminalOutput,
  MAX_ACP_TERMINALS_PER_SESSION,
  type AcpTerminalRecord,
} from "./sessionTerminal";

/**
 * The slice of `AcpStructuredSession` the terminal manager needs. The session
 * constructs one of these and passes it in; the manager never reaches back
 * into the session object.
 */
export interface AcpTerminalManagerContext {
  readonly projectLocation: ProjectLocation;
  readonly cwd: string;
  /** Throws `RequestError` if `sessionId` is not the active ACP session. */
  assertRequestSession(sessionId: string): void;
}

export class AcpTerminalManager {
  private readonly acpTerminals = new Map<string, AcpTerminalRecord>();
  private acpTerminalSeq = 0;
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

  handleCreateTerminal(params: CreateTerminalRequest): CreateTerminalResponse {
    this.context.assertRequestSession(params.sessionId);
    if (this.acpTerminals.size >= MAX_ACP_TERMINALS_PER_SESSION) {
      throw RequestError.invalidParams({
        message: `ACP terminal limit reached (${MAX_ACP_TERMINALS_PER_SESSION}); release existing terminals before creating more.`,
      });
    }
    const terminalId = `acp-terminal-${this.acpTerminalSeq++}`;
    const cwd = params.cwd
      ? resolveAcpTerminalCwd(this.context.projectLocation, params.cwd)
      : resolveAcpTerminalCwd(this.context.projectLocation, this.context.cwd);
    const launch = buildAcpTerminalLaunch(
      this.context.projectLocation,
      cwd,
      params.command,
      params.args ?? [],
      acpTerminalEnvEntries(params.env),
    );
    const outputByteLimit =
      typeof params.outputByteLimit === "number" ? params.outputByteLimit : undefined;

    if (process.platform === "win32") {
      const child = spawnChild(launch.command, launch.args, {
        ...(launch.cwd ? { cwd: launch.cwd } : {}),
        env: launch.env,
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
        windowsHide: true,
      });
      const record: AcpTerminalRecord = {
        kill: () => terminateChildProcessTree(child),
        commandLine: buildTerminalCommandLine(params.command, params.args ?? []),
        output: "",
        outputByteLimit,
        truncated: false,
        exitStatus: undefined,
        waiters: [],
        subscriptions: [],
      };
      this.acpTerminals.set(terminalId, record);
      this.acpTerminalCommandById.set(terminalId, record.commandLine);
      child.stdout?.on("data", (chunk) => appendTerminalOutput(record, String(chunk)));
      child.stderr?.on("data", (chunk) => appendTerminalOutput(record, String(chunk)));
      child.once("error", (error) => {
        appendTerminalOutput(record, `${error.message}\n`);
        completeAcpTerminal(record, { exitCode: 1 });
      });
      child.once("exit", (code, signal) => {
        completeAcpTerminal(record, childExitStatus(code, signal));
      });
      return { terminalId };
    }

    ensureNodePtySpawnHelperExecutable();
    const pty = spawnPty(launch.command, launch.args, {
      ...(launch.cwd ? { cwd: launch.cwd } : {}),
      env: launch.env,
      cols: 80,
      rows: 24,
    });
    const record: AcpTerminalRecord = {
      kill: () => pty.kill(),
      commandLine: buildTerminalCommandLine(params.command, params.args ?? []),
      output: "",
      outputByteLimit,
      truncated: false,
      exitStatus: undefined,
      waiters: [],
      subscriptions: [],
    };
    this.acpTerminals.set(terminalId, record);
    this.acpTerminalCommandById.set(terminalId, record.commandLine);
    record.subscriptions.push(pty.onData((data) => appendTerminalOutput(record, data)));
    record.subscriptions.push(
      pty.onExit((event) => {
        completeAcpTerminal(record, {
          exitCode: event.exitCode,
          ...(event.signal ? { signal: String(event.signal) } : {}),
        });
      }),
    );
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
    if (!record.exitStatus) {
      record.kill();
    }
  }

  releaseAllAcpTerminals(): void {
    for (const [terminalId, record] of [...this.acpTerminals]) {
      this.disposeAcpTerminal(terminalId, record);
    }
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
    for (const subscription of record.subscriptions.splice(0)) {
      subscription.dispose();
    }
    if (!record.exitStatus) {
      record.kill();
    }
    completeAcpTerminal(record, record.exitStatus ?? { signal: "SIGTERM" });
  }
}
