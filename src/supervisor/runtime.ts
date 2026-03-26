import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn, type IPty } from "node-pty";
import type {
  AgentKind,
  AgentStatus,
  CloseThreadPayload,
  GetAgentStatusesPayload,
  ProjectLocation,
  ResizeTerminalPayload,
  ResolveThreadServerRequestPayload,
  SendThreadInputPayload,
  SessionRef,
  StartThreadPayload,
  StartThreadResult,
  TerminalPrompt,
  ThreadAttention,
  ThreadConfig,
  ThreadHistorySnapshot,
  ThreadRuntimeSnapshot,
  ThreadStatus,
  WriteTerminalPayload,
} from "../shared/contracts";
import type { SupervisorEvent } from "../shared/ipc";
import { stripAnsiPreservingLayout } from "../shared/ansi";
import { detectRateLimitPrompt } from "../shared/rateLimitPrompt";
import { stripInternalHistoryMarkers } from "../shared/terminalHistory";
import { normalizeWslListOutput } from "../shared/wsl";
import { createAgentRegistry } from "./agents/registry";
import {
  type AgentAdapter,
  type AgentEnvContext,
  type CommandSpec,
  type StructuredSessionHandle,
} from "./agents/base";
import { resetTerminalLogFile, resetTerminalLogsDir } from "./terminalLogs";

interface SessionRuntime {
  instanceId: string;
  threadId: string;
  agentKind: AgentKind;
  adapter: AgentAdapter;
  pty: IPty;
  projectLocation: ProjectLocation;
  config: ThreadConfig;
  sessionRef?: SessionRef;
  status: ThreadStatus;
  attention: ThreadAttention;
  canResumeWithConfig: boolean;
  logPath: string;
  outputLength: number;
  structuredSession?: StructuredSessionHandle;
  ignoreExit?: boolean;
  ptyExited?: boolean;
  rateLimitPromptEmitted?: boolean;
  terminalPrompt?: TerminalPrompt | undefined;
  prevChunk: string;
}

export async function writeSubmittedPrompt(
  pty: Pick<IPty, "write">,
  chunks: readonly string[],
): Promise<void> {
  for (const [index, chunk] of chunks.entries()) {
    pty.write(chunk);
    if (index < chunks.length - 1) {
      await sleep(8);
    }
  }
}

export class SupervisorRuntime {
  private readonly isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
  private readonly logsDir: string;
  private readonly adapters = new Map(
    createAgentRegistry().map((adapter) => [adapter.kind, adapter]),
  );
  private readonly sessions = new Map<string, SessionRuntime>();
  private readonly startLocks = new Map<string, Promise<void>>();

  constructor(private readonly emit: (event: SupervisorEvent) => void) {
    const baseDir = process.env.LIGHTCODE_DATA_DIR?.trim() || join(homedir(), ".lightcode");
    this.logsDir = join(baseDir, "terminal-logs");
    resetTerminalLogsDir(this.logsDir);
  }

  async listWslDistros(): Promise<string[]> {
    const result = spawnSync("wsl.exe", ["-l", "-q"], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (result.error) {
      return [];
    }
    return normalizeWslListOutput(result.stdout ?? "");
  }

  async getAgentStatuses(payload: GetAgentStatusesPayload): Promise<AgentStatus[]> {
    let ctx: AgentEnvContext | undefined;
    if (payload.environmentMode === "wsl") {
      const distros = await this.listWslDistros();
      const defaultDistro = distros[0];
      if (defaultDistro) {
        ctx = { environmentMode: "wsl", wslDistro: defaultDistro };
      }
    }
    return Promise.all([...this.adapters.values()].map((adapter) => adapter.detectInstall(ctx)));
  }

  getThreadSnapshots(): ThreadRuntimeSnapshot[] {
    return [...this.sessions.values()].map((session) => ({
      threadId: session.threadId,
      status: session.status,
      attention: session.attention,
      config: session.config,
      ...(session.sessionRef ? { sessionRef: session.sessionRef } : {}),
      canResumeWithConfig: session.canResumeWithConfig,
    }));
  }

  getThreadHistory(threadId: string): ThreadHistorySnapshot {
    const logPath = this.resolveLogPath(threadId);
    if (!existsSync(logPath)) {
      return {
        history: "",
        length: 0,
      };
    }
    const history = stripInternalHistoryMarkers(readFileSync(logPath, "utf8"));
    return {
      history,
      length: history.length,
    };
  }

  async startThread(payload: StartThreadPayload): Promise<StartThreadResult> {
    const threadId = payload.threadId ?? randomUUID();
    console.log("[supervisor] startThread", threadId, payload.agentKind);

    // Serialize starts for the same thread to prevent double app-server spawns.
    const pending = this.startLocks.get(threadId);
    if (pending) {
      console.log("[supervisor] startThread skipped (already starting)", threadId);
      return { threadId };
    }

    const resolvedPayload = { ...payload, threadId };
    const run = this.startThreadInner(resolvedPayload);
    this.startLocks.set(
      threadId,
      run.then(
        () => {},
        () => {},
      ),
    );
    try {
      return await run;
    } finally {
      this.startLocks.delete(threadId);
    }
  }

  private async startThreadInner(
    payload: StartThreadPayload & { threadId: string },
  ): Promise<StartThreadResult> {
    const t0 = Date.now();
    const elapsed = () => `${Date.now() - t0}ms`;

    await this.closeThread({ threadId: payload.threadId });
    console.log(`[supervisor] [${elapsed()}] closeThread done`);

    const adapter = this.requireAdapter(payload.agentKind);
    const isServerControlled = adapter.capabilities.liveInputMode === "server";
    const effectiveConfig = payload.config;
    const effectiveSessionRef = payload.sessionRef;
    const structuredSession = await this.createStructuredSession(
      adapter,
      payload.threadId,
      payload.projectLocation,
      effectiveConfig,
      effectiveSessionRef,
    );
    console.log(`[supervisor] [${elapsed()}] createStructuredSession done`);

    // Phase 1: initialize + create thread + send initial message on the server.
    if (structuredSession?.activate) {
      try {
        await structuredSession.activate();
        console.log(`[supervisor] [${elapsed()}] activate done`);
      } catch (error) {
        await structuredSession.dispose();
        throw error;
      }
    }

    if (structuredSession?.openThread) {
      try {
        await structuredSession.openThread(effectiveConfig, effectiveSessionRef);
        console.log(`[supervisor] [${elapsed()}] openThread done`);
      } catch (error) {
        await structuredSession.dispose();
        throw error;
      }
    }

    // For new threads: fire turn/start so the rollout file gets created.
    // For resumed threads: rollout file already exists, skip this.
    // The rollout file wait is non-blocking — the TUI is spawned immediately
    // with resumeThreadId and picks up output as it arrives.
    if (
      !effectiveSessionRef &&
      isServerControlled &&
      payload.prompt.trim().length > 0 &&
      structuredSession?.startTurn
    ) {
      void structuredSession.startTurn(payload.prompt, effectiveConfig).catch((error) => {
        console.error("[supervisor] initial turn failed:", error);
      });
    }

    // Phase 2: spawn TUI with resume.
    const launchPrompt = isServerControlled ? "" : payload.prompt;
    const command = effectiveSessionRef
      ? adapter.buildResumeCommand(
          payload.projectLocation,
          effectiveConfig,
          launchPrompt,
          effectiveSessionRef,
          structuredSession?.launchOptions,
        )
      : adapter.buildLaunchCommand(
          payload.projectLocation,
          effectiveConfig,
          launchPrompt,
          effectiveSessionRef,
          structuredSession?.launchOptions,
        );
    console.log(`[supervisor] [${elapsed()}] command built, spawning PTY…`);

    const resolvedSessionRef = effectiveSessionRef ?? command.sessionRef;
    this.spawnThread({
      threadId: payload.threadId,
      adapter,
      agentKind: payload.agentKind,
      projectLocation: payload.projectLocation,
      config: effectiveConfig,
      command,
      ...(structuredSession ? { structuredSession } : {}),
      ...(resolvedSessionRef ? { sessionRef: resolvedSessionRef } : {}),
    });
    console.log(`[supervisor] [${elapsed()}] PTY spawned`);

    return { threadId: payload.threadId };
  }

  async sendThreadInput(payload: SendThreadInputPayload): Promise<void> {
    const session = this.requireSession(payload.threadId);
    if (session.status === "inactive") {
      if (session.sessionRef) {
        await this.restartThread(session, payload.prompt, payload.config);
        return;
      }
      throw new Error("This thread exited before a resumable session id was discovered.");
    }

    const isServerControlled = session.adapter.capabilities.liveInputMode === "server";

    // If the supervisor auto-cleared plan mode from terminal detection but the renderer
    // hasn't caught up yet, adopt the session's mode to avoid a spurious relaunch.
    const effectiveConfig =
      payload.config.mode === "plan" && session.config.mode === undefined
        ? { ...payload.config, mode: undefined }
        : payload.config;

    const shouldRelaunch =
      !isServerControlled &&
      session.canResumeWithConfig &&
      JSON.stringify(session.config) !== JSON.stringify(effectiveConfig);

    if (shouldRelaunch && session.sessionRef) {
      await this.restartThread(session, payload.prompt, effectiveConfig);
      return;
    }

    session.config = effectiveConfig;
    if (
      session.adapter.capabilities.liveInputMode === "server" &&
      session.structuredSession?.startTurn
    ) {
      this.updateState(session, "working", "working");
      void session.structuredSession.startTurn(payload.prompt, payload.config).catch((error) => {
        if (this.sessions.get(session.threadId)?.instanceId !== session.instanceId) {
          return;
        }

        this.updateState(
          session,
          "error",
          "error",
          error instanceof Error ? error.message : String(error),
        );
      });
      return;
    }

    this.updateState(session, "working", "working");
    await writeSubmittedPrompt(
      session.pty,
      session.adapter.buildDirectInput?.(payload.prompt) ?? [payload.prompt, "\r"],
    );
  }

  async writeTerminal(payload: WriteTerminalPayload): Promise<void> {
    this.requireSession(payload.threadId).pty.write(payload.data);
  }

  async resizeTerminal(payload: ResizeTerminalPayload): Promise<void> {
    const session = this.sessions.get(payload.threadId);
    if (!session) {
      return;
    }
    session.pty.resize(payload.cols, payload.rows);
  }

  async closeThread(payload: CloseThreadPayload): Promise<void> {
    const existing = this.sessions.get(payload.threadId);
    if (!existing) {
      return;
    }

    existing.ignoreExit = true;
    this.sessions.delete(payload.threadId);
    await existing.structuredSession?.dispose();
    // Yield so the PTY exit event can fire before we force-kill.
    if (existing.structuredSession) {
      await sleep(150);
    }
    this.safePtyKill(existing);
  }

  async resolveThreadServerRequest(payload: ResolveThreadServerRequestPayload): Promise<void> {
    const session = this.requireSession(payload.threadId);
    if (!session.structuredSession?.resolveServerRequest) {
      throw new Error(`Thread ${payload.threadId} does not support server request resolution.`);
    }

    await session.structuredSession.resolveServerRequest(payload.requestId, payload.response);
  }

  dispose(): void {
    for (const session of this.sessions.values()) {
      session.ignoreExit = true;
      void session.structuredSession?.dispose();
      this.safePtyKill(session);
    }
    this.sessions.clear();
  }

  private safePtyKill(session: SessionRuntime): void {
    if (session.ptyExited) {
      return;
    }
    try {
      process.kill(session.pty.pid, 0);
    } catch {
      // Shell process already exited — skip pty.kill() to avoid
      // ConPTY's AttachConsole failure in its forked agent process.
      return;
    }
    session.pty.kill();
  }

  private resolveLogPath(threadId: string): string {
    return join(this.logsDir, `${threadId}.log`);
  }

  private resolveHintLogPath(threadId: string): string {
    return join(this.logsDir, `${threadId}.hints.log`);
  }

  private writeHintLog(
    session: SessionRuntime,
    stripped: string,
    hint: { status: string; attention: string } | null,
  ): void {
    const tail = stripped.slice(-300);
    const ts = new Date().toISOString();
    const entry = [
      `--- ${ts} status=${session.status} hint=${hint?.status ?? "null"} ---`,
      tail,
      "",
    ].join("\n");
    try {
      appendFileSync(this.resolveHintLogPath(session.threadId), entry);
    } catch {
      // best-effort
    }
  }

  private requireAdapter(kind: AgentKind): AgentAdapter {
    const adapter = this.adapters.get(kind);
    if (!adapter) {
      throw new Error(`Unsupported agent adapter: ${kind}`);
    }
    return adapter;
  }

  private requireSession(threadId: string): SessionRuntime {
    const session = this.sessions.get(threadId);
    if (!session) {
      throw new Error(`Unknown thread session: ${threadId}`);
    }
    return session;
  }

  private async createStructuredSession(
    adapter: AgentAdapter,
    threadId: string,
    projectLocation: ProjectLocation,
    config: ThreadConfig,
    sessionRef?: SessionRef,
  ): Promise<StructuredSessionHandle | undefined> {
    if (!adapter.createStructuredSession) {
      return undefined;
    }

    try {
      return await adapter.createStructuredSession({
        threadId,
        projectLocation,
        config,
        ...(sessionRef ? { sessionRef } : {}),
      });
    } catch (error) {
      console.error("[supervisor] structured session creation failed:", error);
      return undefined;
    }
  }

  private spawnThread(input: {
    threadId: string;
    agentKind: AgentKind;
    adapter: AgentAdapter;
    projectLocation: ProjectLocation;
    config: ThreadConfig;
    command: CommandSpec;
    structuredSession?: StructuredSessionHandle;
    sessionRef?: SessionRef;
  }): SessionRuntime {
    const logPath = this.resolveLogPath(input.threadId);
    resetTerminalLogFile(logPath);
    this.emit({
      type: "thread-reset",
      threadId: input.threadId,
    });

    console.log(
      `[supervisor] spawning PTY: ${input.command.command} ${input.command.args.join(" ")}`,
    );
    const pty = spawn(input.command.command, input.command.args, {
      name: process.platform === "win32" ? "xterm-color" : "xterm-256color",
      cols: 120,
      rows: 30,
      cwd: input.command.cwd ?? process.cwd(),
      env: {
        ...process.env,
        TERM: "xterm-256color",
      },
    });

    const session: SessionRuntime = {
      instanceId: randomUUID(),
      threadId: input.threadId,
      agentKind: input.agentKind,
      adapter: input.adapter,
      pty,
      projectLocation: input.projectLocation,
      config: input.config,
      ...(input.sessionRef ? { sessionRef: input.sessionRef } : {}),
      status: "launching",
      attention: "none",
      canResumeWithConfig: input.sessionRef !== undefined,
      logPath,
      outputLength: 0,
      prevChunk: "",
      ...(input.structuredSession ? { structuredSession: input.structuredSession } : {}),
    };

    // Register the session before attaching the listener so that the
    // setListener re-emit (for already-activated structured sessions)
    // passes the instanceId guard.
    this.sessions.set(input.threadId, session);
    this.emitState(session);

    input.structuredSession?.setListener({
      onClose: () => {
        if (
          this.sessions.get(session.threadId)?.instanceId !== session.instanceId ||
          session.ignoreExit
        ) {
          return;
        }
        this.handleStructuredSessionClosed(session);
      },
      onError: (errorMessage) => {
        if (
          this.sessions.get(session.threadId)?.instanceId !== session.instanceId ||
          session.ignoreExit
        ) {
          return;
        }
        this.updateState(session, "error", "error", errorMessage);
      },
      onServerRequest: (request) => {
        if (
          this.sessions.get(session.threadId)?.instanceId !== session.instanceId ||
          session.ignoreExit
        ) {
          return;
        }

        this.emit({
          type: "thread-server-request",
          threadId: session.threadId,
          requestId: request.requestId,
          method: request.method,
          params: request.params,
        });
      },
      onUpdate: (update) => {
        if (
          this.sessions.get(session.threadId)?.instanceId !== session.instanceId ||
          session.ignoreExit
        ) {
          return;
        }

        if (update.sessionRef) {
          session.sessionRef = update.sessionRef;
          session.canResumeWithConfig = true;
        }

        const configChanged =
          update.config !== undefined &&
          JSON.stringify(session.config) !== JSON.stringify(update.config);
        const stateChanged =
          session.status !== update.status ||
          session.attention !== update.attention ||
          update.errorMessage !== undefined;
        if (update.config) {
          session.config = update.config;
        }

        this.updateState(session, update.status, update.attention, update.errorMessage);
        if (configChanged && !stateChanged && update.errorMessage === undefined) {
          this.emitState(session);
        }
      },
    });

    pty.onData((data) => {
      if (this.sessions.get(session.threadId)?.instanceId !== session.instanceId) {
        return;
      }

      appendFileSync(logPath, data);
      session.outputLength += data.length;
      this.emit({
        type: "thread-output",
        threadId: session.threadId,
        data,
        outputLength: session.outputLength,
      });

      if (session.status === "launching") {
        this.updateState(session, "idle", "none");
      }

      // Auto-dismiss the TUI "Approaching rate limits" prompt by selecting
      // "Keep current model".  Model switching is handled via the GUI control
      // bar and the structured session, not the TUI menu.
      if (
        session.adapter.capabilities.liveInputMode === "server" &&
        !session.rateLimitPromptEmitted
      ) {
        const stripped = stripAnsiPreservingLayout(data);
        if (detectRateLimitPrompt(stripped)) {
          session.rateLimitPromptEmitted = true;
          session.pty.write("2");
        }
      }

      if (session.adapter.detectTerminalStatus) {
        const combined = session.prevChunk + data;
        session.prevChunk = data;
        const stripped = stripAnsiPreservingLayout(combined);
        const hint = session.adapter.detectTerminalStatus(stripped);
        const promptChanged =
          JSON.stringify(hint?.prompt) !== JSON.stringify(session.terminalPrompt);
        // Auto-switch mode when Claude exits plan mode.
        // Case 1: idle without "plan mode on" — plan mode indicator would be visible if still active.
        // Case 2: approval prompt → working — plan was accepted and is now executing.
        const planModeExited =
          hint != null &&
          !hint.planMode &&
          session.config.mode === "plan" &&
          (hint.status === "idle" ||
            (hint.status === "working" &&
              (session.status === "needs_reply" || session.status === "needs_approval")));

        if (planModeExited) {
          session.config = { ...session.config, mode: undefined };
        }

        if (hint && (session.status !== hint.status || session.attention !== hint.attention)) {
          session.terminalPrompt = hint.prompt;
          this.updateState(session, hint.status, hint.attention);
        } else if (promptChanged && hint) {
          session.terminalPrompt = hint.prompt;
          this.emitState(session);
        } else if (planModeExited) {
          // Config changed but status/prompt didn't — force emit so renderer picks up the mode switch.
          this.emitState(session);
        }
        if (this.isDev) {
          this.writeHintLog(session, stripped, hint);
        }
      }
    });

    pty.onExit((event) => {
      session.ptyExited = true;
      if (session.ignoreExit) {
        return;
      }
      if (this.sessions.get(session.threadId)?.instanceId !== session.instanceId) {
        return;
      }

      void session.structuredSession?.dispose();
      this.updateState(session, "inactive", "none");
      this.emit({
        type: "thread-exited",
        threadId: session.threadId,
        exitCode: event.exitCode,
      });
    });

    return session;
  }

  private async restartThread(
    session: SessionRuntime,
    prompt: string,
    config: ThreadConfig,
  ): Promise<void> {
    if (!session.sessionRef) {
      throw new Error("Session cannot be restarted without a known session reference.");
    }

    const isServerControlled = session.adapter.capabilities.liveInputMode === "server";

    session.ignoreExit = true;
    await session.structuredSession?.dispose();
    if (session.structuredSession) {
      await sleep(150);
    }
    this.safePtyKill(session);

    const effectiveConfig = config;
    const effectiveSessionRef = session.sessionRef;
    const structuredSession = await this.createStructuredSession(
      session.adapter,
      session.threadId,
      session.projectLocation,
      effectiveConfig,
      effectiveSessionRef,
    );

    // Initialize + resume thread on the server.
    if (structuredSession?.activate) {
      try {
        await structuredSession.activate();
      } catch (error) {
        await structuredSession.dispose();
        throw error;
      }
    }

    if (structuredSession?.openThread) {
      try {
        await structuredSession.openThread(effectiveConfig, effectiveSessionRef);
      } catch (error) {
        await structuredSession.dispose();
        throw error;
      }
    }

    // Spawn TUI with resume — rollout file already exists for saved threads.
    const launchPrompt = isServerControlled ? "" : prompt;
    const command = session.adapter.buildResumeCommand(
      session.projectLocation,
      effectiveConfig,
      launchPrompt,
      session.sessionRef,
      structuredSession?.launchOptions,
    );

    this.spawnThread({
      threadId: session.threadId,
      agentKind: session.agentKind,
      adapter: session.adapter,
      projectLocation: session.projectLocation,
      config: effectiveConfig,
      command,
      ...(structuredSession ? { structuredSession } : {}),
      sessionRef: effectiveSessionRef,
    });
  }

  private handleStructuredSessionClosed(session: SessionRuntime): void {
    if (session.status === "inactive") {
      return;
    }

    this.updateState(session, "inactive", "none");
    this.emit({
      type: "thread-exited",
      threadId: session.threadId,
      exitCode: null,
    });

    session.ignoreExit = true;
    // Defer the kill so the PTY has time to exit naturally after the
    // structured session closes.  safePtyKill checks process liveness
    // before invoking node-pty's kill.
    setTimeout(() => this.safePtyKill(session), 150);
  }

  private updateState(
    session: SessionRuntime,
    status: ThreadStatus,
    attention: ThreadAttention,
    errorMessage?: string,
  ): void {
    if (
      session.status === status &&
      session.attention === attention &&
      errorMessage === undefined
    ) {
      return;
    }

    session.status = status;
    session.attention = attention;
    this.emitState(session, errorMessage);
  }

  private emitState(session: SessionRuntime, errorMessage?: string): void {
    this.emit({
      type: "thread-state",
      threadId: session.threadId,
      status: session.status,
      attention: session.attention,
      config: session.config,
      ...(session.sessionRef ? { sessionRef: session.sessionRef } : {}),
      canResumeWithConfig: session.canResumeWithConfig,
      ...(errorMessage ? { errorMessage } : {}),
      ...(session.terminalPrompt ? { terminalPrompt: session.terminalPrompt } : {}),
    });
  }
}
