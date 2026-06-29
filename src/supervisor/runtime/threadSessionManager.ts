import { accessSync, constants as fsConstants, existsSync, readFileSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { spawn } from "node-pty";
import type { SupervisorEvent } from "@/shared/ipc";
import { defaultSharedSettings, normalizeSharedSettings } from "@/shared/settings";
import {
  type AgentKind,
  type ClearPendingSteerPayload,
  type AgentEventEnvelope,
  type CloseThreadPayload,
  type PendingSteerState,
  type PromptSegment,
  type ProjectLocation,
  type ResizeTerminalPayload,
  type ResolveThreadServerRequestPayload,
  type RollbackThreadConversationPayload,
  type SendThreadInputPayload,
  type SessionRef,
  type SetPendingSteerPayload,
  type StageThreadInputPayload,
  type StartShellPayload,
  type StartThreadPayload,
  type StartThreadResult,
  type TerminalSize,
  type ThreadConfig,
  type ThreadRuntimeSnapshot,
  type ThreadStatus,
  type WriteTerminalPayload,
  type RuntimeEvent,
  areAgentSlashCommandsEqual,
  isClaudeProfileKind,
  isThreadConfigEqual,
  resolveMcpServersForAgent,
  type McpServer,
} from "@/shared/contracts";
import { buildPromptContentBlocks } from "@/shared/promptContent";
import { terminateProcessTree } from "@/shared/processTree";
import {
  BROWSER_MCP_SERVER_NAME,
  resolveBrowserMcpHttpConfigForLaunch,
  type BrowserMcpHttpConfig,
} from "@/supervisor/agents/browserMcp";
import {
  type AgentAdapter,
  type AgentLaunchOptions,
  type CommandSpec,
  type StructuredSessionHandle,
  createKnownSessionRef,
  defaultFormatPromptSegments,
  getRefreshedWindowsPath,
  getWslCommand,
  injectWslEnv,
  primeProjectShellEnv,
  resolveLaunchSpec,
} from "../agents/base";
import { prepareClaudeMergedSettingsFile } from "../agents/claude/mergedSettings";
import { captureSupervisorException } from "../diagnostics/sentry";
import { ensureNodePtySpawnHelperExecutable } from "../nodePty";
import type { WindowsShellPreference } from "../shellPreference";
import { BufferedLogWriter } from "./bufferedLogWriter";
import { hookDebugSpawn } from "./hookDebug";
import type {
  PendingSteerSlot,
  QueuedStructuredTurn,
  SessionRuntime,
  ShellSessionRuntime,
} from "./sessionTypes";
import { ThreadOutputPipeline, resolveThreadStatusSource } from "./threadOutputPipeline";
import { rewriteSegmentsForWorkspace, rewriteSegmentsForWsl } from "./threadAttachments";

import {
  isInterruptibleBusyStatus,
  isUserInterruptKeystroke,
  STRUCTURED_INTERRUPT_STALE_KILL_MS,
  USER_INTERRUPT_RECOVERY_GRACE_MS,
} from "./threadSession/userInterrupt";
import { writeSubmittedPrompt } from "./threadSession/promptWrite";
import { getIterm2StatusL2TerminalEnv, resolveTerminalColorEnv } from "./threadSession/terminalEnv";
import {
  hookDebugProjectLabel,
  requireSessionPty,
  shouldReleaseInitialStructuredIdleSuppression,
} from "./threadSession/helpers";
import { RuntimeEventRouter } from "./threadSession/runtimeEventRouter";

export { isUserInterruptKeystroke, USER_INTERRUPT_RECOVERY_GRACE_MS, writeSubmittedPrompt };

export interface ThreadSessionManagerOptions {
  emit(event: SupervisorEvent): void;
  isDev: boolean;
  logsDir: string;
  settingsPath: string;
  readDisableCliHookPlugin(): boolean;
  adapters: Map<AgentKind, AgentAdapter>;
  windowsShell: WindowsShellPreference;
  /**
   * Optional: provides CLI hook plugin ingress env vars + extra CLI args injected
   * into every agent PTY spawn. The supervisor boots a single
   * `HookIngress` and exposes this hook so the manager doesn't depend on
   * `node:http` itself.
   */
  resolvePluginEnvForSpawn?(input: {
    threadId: string;
    agentKind: AgentKind;
    projectLocation: ProjectLocation;
    browserMcpEnabled?: boolean;
    browserMcp?: BrowserMcpHttpConfig;
  }): Promise<{ env: Record<string, string>; extraArgs: string[] } | undefined>;
  wslBridge?: {
    ensureBridge(distro: string): Promise<{ baseUrl: string; secret: string } | undefined>;
  };
}

function shouldPrimeNativeProjectShellEnv(
  location: ProjectLocation,
): location is Extract<ProjectLocation, { kind: "windows" | "posix" }> {
  return location.kind === "posix" || (process.platform === "win32" && location.kind === "windows");
}

function isClaudeAdapterKind(kind: string): boolean {
  return kind === "claude" || isClaudeProfileKind(kind);
}

export class ThreadSessionManager {
  private static readonly PTY_CLOSE_TIMEOUT_MS = 2_000;
  readonly sessions = new Map<string, SessionRuntime>();
  readonly shellSessions = new Map<string, ShellSessionRuntime>();
  /** Reverse index: agent-native session id → SessionRuntime, for CLI hook routing fallback. */
  readonly sessionsBySessionId = new Map<string, SessionRuntime>();
  private readonly startLocks = new Map<string, Promise<void>>();
  private readonly pendingStartInterrupts = new Set<string>();
  private readonly pendingStartAborts = new Set<string>();
  private readonly ptyExitPromises = new WeakMap<object, Promise<void>>();
  private readonly ptyExitResolvers = new WeakMap<object, () => void>();
  private readonly logWriter = new BufferedLogWriter();
  private readonly outputPipeline: ThreadOutputPipeline;
  private readonly runtimeEventRouter: RuntimeEventRouter;
  private disposed = false;

  constructor(private readonly options: ThreadSessionManagerOptions) {
    this.runtimeEventRouter = new RuntimeEventRouter(options.emit);
    this.outputPipeline = new ThreadOutputPipeline({
      emit: options.emit,
      isDev: options.isDev,
      logWriter: this.logWriter,
      resolveLogPath: (threadId) => this.resolveLogPath(threadId),
      resolveHintLogPath: (threadId) => this.resolveHintLogPath(threadId),
      readDisableCliHookPlugin: this.options.readDisableCliHookPlugin,
      onRecoverInvalidSessionRef: (session) => this.recoverInvalidSessionRef(session),
      onStartQueuedLaunchPrompt: (session) => this.startQueuedLaunchPrompt(session),
      onStartSessionRefDiscovery: (session) => this.pollSessionRefDiscovery(session),
    });
  }

  private readDisableCliHookPlugin(): boolean {
    return this.options.readDisableCliHookPlugin();
  }

  getThreadSnapshots(): ThreadRuntimeSnapshot[] {
    return [...this.sessions.values()].map((session) => ({
      threadId: session.threadId,
      status: session.status,
      attention: session.attention,
      config: session.config,
      ...(session.sessionRef ? { sessionRef: session.sessionRef } : {}),
      ...(session.slashCommands ? { slashCommands: session.slashCommands } : {}),
      canResumeWithConfig: session.canResumeWithConfig,
      threadStatusSource: resolveThreadStatusSource(session, this.readDisableCliHookPlugin()),
    }));
  }

  /**
   * Surface a structured-session failure on both axes: status (so the icon
   * goes red) and a runtime `error` event (so `ThreadErrorDock` and the chat
   * stream actually render the message). The supervisor stores `errorMessage`
   * on the thread state, but no renderer surface reads `thread.errorMessage`
   * — only the runtime error item drives `ThreadErrorDock` — so without the
   * event the user sees a red icon and nothing else.
   */
  private failStructuredSession(session: SessionRuntime, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.outputPipeline.updateState(session, "error", "error", message);
    this.enqueueRuntimeEvent(session.threadId, {
      type: "error",
      threadId: session.threadId,
      message,
    });
  }

  private enqueueRuntimeEvent(threadId: string, event: RuntimeEvent): void {
    this.runtimeEventRouter.append(threadId, event);
  }

  /**
   * Renderer-facing: subscribe a sub-agent overlay. Returns the buffered
   * child-event history so the renderer can hydrate the overlay; subsequent
   * child events stream live via the regular runtime-event channels.
   */
  subagentSubscribe(payload: { threadId: string; parentItemId: string }): {
    history: RuntimeEvent[];
  } {
    return { history: this.runtimeEventRouter.subscribe(payload.threadId, payload.parentItemId) };
  }

  /**
   * Renderer-facing: unsubscribe a sub-agent overlay. Subsequent child events
   * are buffered again until the parent completes, at which point the buffer
   * is flushed to the renderer so the overlay can replay every turn even if
   * it was closed while the sub-agent ran.
   */
  subagentUnsubscribe(payload: { threadId: string; parentItemId: string }): void {
    this.runtimeEventRouter.unsubscribe(payload.threadId, payload.parentItemId);
  }

  private clearAllSubAgentStateForThread(threadId: string): void {
    this.runtimeEventRouter.clearAllForThread(threadId);
  }

  private flushRuntimeEvents(): void {
    this.runtimeEventRouter.flush();
  }

  /**
   * Look up the live `SessionRuntime` for a CLI hook plugin envelope. Routing
   * precedence is `threadId` (PTY env, primary) → `sessionId`
   * (`providerSessionId` discovered after spawn, fallback for nested shells).
   */
  findSessionForCliHookPlugin(input: {
    threadId?: string;
    sessionId?: string;
  }): SessionRuntime | undefined {
    if (input.threadId) {
      const direct = this.sessions.get(input.threadId);
      if (direct) return direct;
    }
    if (input.sessionId) {
      const indexed = this.sessionsBySessionId.get(input.sessionId);
      if (indexed) return indexed;
      // Fallback: scan for late-arriving `sessionRef`s that haven't been
      // indexed yet (race between hook SessionStart and provider sessionRef
      // discovery). Sessions count is small; linear scan is fine.
      for (const session of this.sessions.values()) {
        if (session.sessionRef?.providerSessionId === input.sessionId) {
          this.sessionsBySessionId.set(input.sessionId, session);
          return session;
        }
      }
    }
    return undefined;
  }

  /** Apply a CLI hook plugin state change resolved by the dispatcher. */
  applyCliHookPluginState(
    session: SessionRuntime,
    change: {
      status: import("@/shared/contracts").ThreadStatus;
      attention: import("@/shared/contracts").ThreadAttention;
    },
  ): void {
    this.outputPipeline.applyCliHookPluginState(session, change);
  }

  /** Mark hook ownership for routed bookkeeping events that do not carry state. */
  noteCliHookPluginActivity(session: SessionRuntime, envelope?: AgentEventEnvelope): void {
    const nextId = envelope?.sessionId;
    if (nextId && !session.sessionRef) {
      session.sessionRef = createKnownSessionRef(nextId);
      session.canResumeWithConfig = true;
      this.indexSessionRef(session, undefined);
      session.stopSessionRefWatcher?.();
      session.stopSessionRefWatcher = undefined;
      this.outputPipeline.emitState(session);
    }
    this.outputPipeline.noteCliHookPluginActivity(session);
  }

  /**
   * Update the `sessionsBySessionId` index when a session's `sessionRef`
   * changes. Idempotent — clears any stale id mapping before writing the new
   * one. Call from anywhere that mutates `session.sessionRef`.
   */
  private indexSessionRef(session: SessionRuntime, prevId: string | undefined): void {
    if (prevId && this.sessionsBySessionId.get(prevId) === session) {
      this.sessionsBySessionId.delete(prevId);
    }
    const nextId = session.sessionRef?.providerSessionId;
    if (nextId) {
      this.sessionsBySessionId.set(nextId, session);
    }
  }

  async startThread(payload: StartThreadPayload): Promise<StartThreadResult> {
    if (this.disposed) {
      throw new Error("ThreadSessionManager is disposed.");
    }
    const threadId = payload.threadId ?? randomUUID();
    const pending = this.startLocks.get(threadId);
    if (pending) {
      return { threadId };
    }

    const run = this.startThreadInner({ ...payload, threadId });
    this.startLocks.set(
      threadId,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    try {
      return await run;
    } finally {
      this.startLocks.delete(threadId);
      if (!this.sessions.has(threadId)) {
        this.pendingStartInterrupts.delete(threadId);
        this.pendingStartAborts.delete(threadId);
      }
    }
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

    const usesStructuredFlow =
      session.adapter.capabilities.liveInputMode === "server" || session.presentationMode === "gui";
    const effectiveSegments = payload.segments
      ? await rewriteSegmentsForWsl(payload.segments, session.projectLocation, {
          preserveImageAttachments: usesStructuredFlow,
        })
      : undefined;
    const prompt = this.formatSegmentsForPrompt(session, effectiveSegments, payload.prompt);

    const effectiveConfig =
      session.presentationMode !== "gui" &&
      payload.config.mode === "plan" &&
      session.config.mode === undefined
        ? { ...payload.config, mode: undefined }
        : payload.config;

    session.config = effectiveConfig;
    if (
      usesStructuredFlow &&
      !session.structuredSession &&
      session.status === "error" &&
      session.sessionRef
    ) {
      await this.restartThread(session, prompt, effectiveConfig);
      return;
    }
    // Route through the structured session when either the adapter is
    // server-controlled OR this thread was launched in chat mode (the
    // structured session owns input/output instead of the PTY).
    if (usesStructuredFlow && session.structuredSession?.startTurn) {
      const turn: QueuedStructuredTurn = {
        prompt,
        config: effectiveConfig,
        ...(effectiveSegments ? { segments: effectiveSegments } : {}),
        ...(payload.userMessageItemId ? { userMessageItemId: payload.userMessageItemId } : {}),
      };
      // GUI threads route submit-while-working through the pending-steer
      // path. Renderers should call `setPendingSteer` directly for that case;
      // any `sendThreadInput` that lands here while working is treated as a
      // steer (replace-latest) for backwards compatibility.
      if (session.presentationMode === "gui" && session.status === "working") {
        this.stagePendingSteer(session, turn);
        this.fireSteerInterrupt(session);
        return;
      }
      if (session.presentationMode === "gui" && session.pendingSteer !== undefined) {
        // Drain in progress (cancel acked, slot still set). Replace it; the
        // existing drain-on-idle hook will pick up the new content.
        this.stagePendingSteer(session, turn);
        this.maybeDrainPendingSteer(session);
        return;
      }
      this.startStructuredTurn(session, turn);
      return;
    }

    const pty = requireSessionPty(session);
    // Workspace-sandboxed agents (e.g. Command Code) can't read attachments that
    // live outside the project, so copy them in and re-format with the new paths.
    // localizeWorkspaceAttachments returns the same array when it's a no-op, so
    // reuse the already-formatted prompt unless paths actually changed.
    const ptySegments = await this.localizeWorkspaceAttachments(session, effectiveSegments);
    const ptyPrompt =
      ptySegments === effectiveSegments
        ? prompt
        : this.formatSegmentsForPrompt(session, ptySegments, payload.prompt);
    await writeSubmittedPrompt(
      pty,
      session.adapter.buildDirectInput?.(
        ptyPrompt,
        ptySegments,
        session.config,
        session.projectLocation,
      ) ?? [ptyPrompt, "\r"],
      session.projectLocation,
    );

    // Optimistic working edge for CLI-hook agents with no turn-START event
    // (Command Code): show `working` the instant the prompt is sent. Gated on
    // `cliHookEnvInjected` so the authoritative `Stop` hook is guaranteed wired
    // to return the thread to idle — never strands it in `working`.
    if (session.adapter.optimisticWorkingOnSubmit && session.cliHookEnvInjected) {
      this.outputPipeline.updateState(session, "working", "working");
    }

    await sleep(300);
    if (session.prevChunk.includes("[Pasted text")) {
      pty.write("\r");
    }
  }

  async interruptThread(payload: { threadId: string }): Promise<void> {
    const session = this.sessions.get(payload.threadId);
    if (!session) {
      if (this.startLocks.has(payload.threadId)) {
        this.pendingStartInterrupts.add(payload.threadId);
        this.pendingStartAborts.add(payload.threadId);
        this.options.emit({
          type: "thread-state",
          threadId: payload.threadId,
          status: "idle",
          attention: "none",
          canResumeWithConfig: false,
          forceCloseActiveTurn: true,
        });
        return;
      }
      throw new Error(`Unknown thread session: ${payload.threadId}`);
    }
    await this.interruptStructuredTurn(session);
  }

  async rollbackThreadConversation(payload: RollbackThreadConversationPayload): Promise<void> {
    if (payload.numTurns === 0) return;
    const session = this.requireSession(payload.threadId);
    if (session.status === "working") {
      throw new Error("Cannot roll back a thread while the agent is working.");
    }
    if (!session.structuredSession?.rollbackThread) {
      throw new Error(`${session.adapter.label} does not support checkpoint rollback.`);
    }

    const previousSessionId = session.sessionRef?.providerSessionId;
    const history = await session.structuredSession.rollbackThread(payload.numTurns);
    if (
      history.providerSessionId &&
      history.providerSessionId !== session.sessionRef?.providerSessionId
    ) {
      session.sessionRef = createKnownSessionRef(history.providerSessionId);
      session.canResumeWithConfig = true;
      this.indexSessionRef(session, previousSessionId);
      this.outputPipeline.emitState(session);
    }
  }

  async writeTerminal(payload: WriteTerminalPayload): Promise<void> {
    const shell = this.shellSessions.get(payload.threadId);
    if (shell) {
      shell.pty.write(payload.data);
      return;
    }
    const session = this.requireSession(payload.threadId);
    requireSessionPty(session).write(payload.data);
    this.maybeArmUserInterruptRecovery(session, payload.data);
  }

  /**
   * Type a prompt into a terminal-native thread's PTY input line WITHOUT
   * submitting it. Mirrors the segment formatting of {@link sendThreadInput}'s
   * PTY path (WSL rewrite + adapter `formatPromptSegments`) but collapses the
   * result to a single line and omits the trailing carriage return, so the text
   * lands in the agent's input line for the user to review/extend before they
   * press Enter. Used to route a browser element-picker selection straight to a
   * CLI agent. Rejects for structured (server / GUI) threads, which own input
   * through their session rather than a PTY input line.
   */
  async stageThreadInput(payload: StageThreadInputPayload): Promise<void> {
    const session = this.requireSession(payload.threadId);
    if (session.status === "inactive" || session.status === "launching") {
      throw new Error("This thread is not ready to receive terminal input yet.");
    }
    const usesStructuredFlow =
      session.adapter.capabilities.liveInputMode === "server" || session.presentationMode === "gui";
    if (usesStructuredFlow) {
      throw new Error("stageThreadInput is only supported for terminal-native threads.");
    }
    const wslSegments = payload.segments
      ? await rewriteSegmentsForWsl(payload.segments, session.projectLocation, {
          preserveImageAttachments: false,
        })
      : undefined;
    const effectiveSegments = await this.localizeWorkspaceAttachments(session, wslSegments);
    const formatted = this.formatSegmentsForPrompt(session, effectiveSegments, payload.prompt);
    // Collapse newlines so a raw PTY write cannot accidentally submit the line
    // (a bare \n reads as Enter to most shells/TUIs); the user submits manually.
    const singleLine = formatted.replace(/\s*\r?\n\s*/g, " ").trim();
    if (!singleLine) return;
    requireSessionPty(session).write(singleLine);
  }

  /** Renders prompt segments to text via the adapter (or the default), falling
   * back to `fallbackPrompt` when there are no segments. */
  private formatSegmentsForPrompt(
    session: SessionRuntime,
    segments: PromptSegment[] | undefined,
    fallbackPrompt: string,
  ): string {
    return segments && segments.length > 0
      ? (session.adapter.formatPromptSegments?.(segments) ?? defaultFormatPromptSegments(segments))
      : fallbackPrompt;
  }

  /**
   * Copies attachments into the workspace for adapters that can only read files
   * inside their working directory (`requiresWorkspaceLocalAttachments`, e.g.
   * Command Code). No-op for other adapters and for WSL sessions (whose
   * attachments are handled by {@link rewriteSegmentsForWsl}).
   */
  private async localizeWorkspaceAttachments(
    session: SessionRuntime,
    segments: PromptSegment[] | undefined,
  ): Promise<PromptSegment[] | undefined> {
    if (!segments || segments.length === 0) return segments;
    if (!session.adapter.capabilities.requiresWorkspaceLocalAttachments) return segments;
    if (session.projectLocation.kind === "wsl") return segments;
    return rewriteSegmentsForWorkspace(segments, session.projectLocation.path);
  }

  /**
   * Fallback for Claude's hook-gap around user interrupts: arm a grace timer
   * when the user presses Esc / Ctrl+C while hooks are active and the session
   * is in a busy status. If no hook event flips state within the grace window
   * (it won't, for plain-text interrupts or permission-dialog dismiss), treat
   * it as a local idle transition. Hook-driven state changes cancel the timer
   * from `applyCliHookPluginState`.
   */
  private maybeArmUserInterruptRecovery(session: SessionRuntime, data: string): void {
    if (!session.hasCliHookPluginActivity) return;
    if (!isInterruptibleBusyStatus(session.status)) return;
    if (!isUserInterruptKeystroke(data)) return;

    if (session.userInterruptRecoveryTimer) {
      clearTimeout(session.userInterruptRecoveryTimer);
    }
    session.userInterruptRecoveryTimer = setTimeout(() => {
      session.userInterruptRecoveryTimer = undefined;
      if (!session.hasCliHookPluginActivity) return;
      if (!isInterruptibleBusyStatus(session.status)) return;
      this.outputPipeline.applyCliHookPluginState(session, {
        status: "idle",
        attention: "none",
      });
    }, USER_INTERRUPT_RECOVERY_GRACE_MS);
  }

  async resizeTerminal(payload: ResizeTerminalPayload): Promise<void> {
    const shell = this.shellSessions.get(payload.threadId);
    if (shell) {
      shell.pty.resize(payload.cols, payload.rows);
      return;
    }
    const session = this.sessions.get(payload.threadId);
    if (!session) {
      return;
    }
    session.terminalSize = { cols: payload.cols, rows: payload.rows };
    session.pty?.resize(payload.cols, payload.rows);
  }

  /**
   * Stage (or replace) the pending steer slot. Allocates a stable id on the
   * first stage and emits a `thread-pending-steer` event so the renderer can
   * paint the strip. Replace-latest semantics — a second submit-while-working
   * overwrites the existing slot rather than queueing.
   */
  private stagePendingSteer(session: SessionRuntime, turn: QueuedStructuredTurn): void {
    const id = session.pendingSteer?.id ?? `steer-${randomUUID()}`;
    const slot: PendingSteerSlot = {
      id,
      stagedAt: Date.now(),
      ...turn,
    };
    session.pendingSteer = slot;
    this.emitPendingSteer(session);
  }

  private clearPendingSteerSlot(session: SessionRuntime): void {
    if (session.pendingSteer === undefined) return;
    session.pendingSteer = undefined;
    this.emitPendingSteer(session);
  }

  private emitPendingSteer(session: SessionRuntime): void {
    const slot = session.pendingSteer;
    const pending: PendingSteerState | null = slot
      ? {
          id: slot.id,
          prompt: slot.prompt,
          stagedAt: slot.stagedAt,
          ...(slot.segments ? { segments: slot.segments } : {}),
        }
      : null;
    this.options.emit({
      type: "thread-pending-steer",
      threadId: session.threadId,
      pending,
    });
  }

  private fireSteerInterrupt(session: SessionRuntime): void {
    void this.interruptStructuredTurn(session).catch((error) => {
      if (this.sessions.get(session.threadId)?.instanceId !== session.instanceId) {
        return;
      }
      console.error("[supervisor] failed to interrupt structured turn:", error);
      captureSupervisorException(error, {
        "lightcode.feature_area": "supervisor-runtime",
        "lightcode.provider": session.agentKind,
      });
    });
  }

  /**
   * Stopped states a staged steer can drain from. A failed turn ("error") still
   * leaves the structured session alive and ready for a new turn, so the steer
   * must flush there too — a turn that errors never reaches "idle"/"needs_reply",
   * so without this the strip sticks on "waiting for agent to stop" forever.
   */
  private static isSteerDrainableStatus(status: ThreadStatus): boolean {
    return status === "idle" || status === "needs_reply" || status === "error";
  }

  private maybeDrainPendingSteer(session: SessionRuntime): void {
    if (session.presentationMode !== "gui") {
      return;
    }
    if (!ThreadSessionManager.isSteerDrainableStatus(session.status)) {
      return;
    }
    const slot = session.pendingSteer;
    if (!slot) return;
    session.pendingSteer = undefined;
    this.emitPendingSteer(session);
    const turn: QueuedStructuredTurn = {
      prompt: slot.prompt,
      config: slot.config,
      ...(slot.segments ? { segments: slot.segments } : {}),
      ...(slot.userMessageItemId ? { userMessageItemId: slot.userMessageItemId } : {}),
    };
    this.startStructuredTurn(session, turn);
  }

  private async interruptStructuredTurn(session: SessionRuntime): Promise<void> {
    if (session.presentationMode !== "gui") {
      return;
    }
    if (!session.structuredSession?.interruptTurn || session.structuredTurnInterruptRequested) {
      return;
    }
    session.structuredTurnInterruptRequested = true;
    this.armStructuredInterruptWatchdog(session);
    try {
      await session.structuredSession.interruptTurn();
    } catch (error) {
      session.structuredTurnInterruptRequested = false;
      this.clearStructuredInterruptWatchdog(session);
      throw error;
    }
  }

  private clearStructuredInterruptWatchdog(session: SessionRuntime): void {
    if (session.structuredInterruptWatchdog) {
      clearTimeout(session.structuredInterruptWatchdog);
      session.structuredInterruptWatchdog = undefined;
    }
  }

  /**
   * Arm (or reset) the force-stop watchdog for a structured turn. Reset on any
   * inbound sign of life so a healthy-but-slow cancel is never force-killed; it
   * only fires after the agent has gone fully silent for the grace window with
   * the interrupt still pending — i.e. the session is stale/disconnected.
   */
  private armStructuredInterruptWatchdog(session: SessionRuntime): void {
    this.clearStructuredInterruptWatchdog(session);
    const instanceId = session.instanceId;
    session.structuredInterruptWatchdog = setTimeout(() => {
      session.structuredInterruptWatchdog = undefined;
      this.forceStopStaleStructuredTurn(session.threadId, instanceId);
    }, STRUCTURED_INTERRUPT_STALE_KILL_MS);
  }

  /**
   * Re-arm the watchdog if a stop is still pending — called on inbound activity
   * (status updates / runtime events) so the silence clock restarts whenever
   * the session proves it is still alive.
   */
  private touchStructuredInterruptWatchdog(session: SessionRuntime): void {
    if (!session.structuredTurnInterruptRequested) return;
    if (session.status !== "working") return;
    this.armStructuredInterruptWatchdog(session);
  }

  /**
   * The agent never acknowledged a stop request and has gone silent: the
   * structured session is stale/disconnected. Dispose it best-effort and force
   * the thread into a stopped `error` state so the UI stops waiting forever.
   */
  private forceStopStaleStructuredTurn(threadId: string, instanceId: string): void {
    const session = this.sessions.get(threadId);
    if (!session || session.instanceId !== instanceId) {
      return;
    }
    if (this.disposed || session.ignoreExit) {
      return;
    }
    if (session.status !== "working" || !session.structuredTurnInterruptRequested) {
      return;
    }
    this.clearStructuredInterruptWatchdog(session);
    session.structuredTurnInterruptRequested = false;
    this.clearPendingSteerSlot(session);
    const staleSession = session.structuredSession;
    session.structuredSession = undefined;
    void Promise.resolve(staleSession?.dispose()).catch((error) => {
      console.error("[supervisor] failed to dispose stale structured session:", error);
    });
    this.failStructuredSession(
      session,
      new Error("Agent stopped responding to the stop request and was force-stopped."),
    );
  }

  /**
   * Stage the user's steer message and fire the cancel notification. The
   * renderer calls this when submit-while-working happens on a GUI thread.
   * Drain is automatic on cancelled-stopReason via `maybeDrainPendingSteer`.
   */
  async setPendingSteer(payload: SetPendingSteerPayload): Promise<void> {
    const session = this.requireSession(payload.threadId);
    if (session.presentationMode !== "gui") {
      throw new Error("Pending steer is only supported for GUI-presentation threads.");
    }
    const usesStructuredFlow =
      session.adapter.capabilities.liveInputMode === "server" || session.presentationMode === "gui";
    if (!usesStructuredFlow || !session.structuredSession?.startTurn) {
      throw new Error("Thread does not support structured turns.");
    }
    const effectiveSegments = payload.segments
      ? await rewriteSegmentsForWsl(payload.segments, session.projectLocation, {
          preserveImageAttachments: true,
        })
      : undefined;
    const prompt =
      effectiveSegments && effectiveSegments.length > 0
        ? (session.adapter.formatPromptSegments?.(effectiveSegments) ??
          defaultFormatPromptSegments(effectiveSegments))
        : payload.prompt;
    const turn: QueuedStructuredTurn = {
      prompt,
      config: payload.config,
      ...(effectiveSegments ? { segments: effectiveSegments } : {}),
    };
    this.stagePendingSteer(session, turn);
    if (session.status === "working") {
      this.fireSteerInterrupt(session);
    } else {
      // Status was already idle/needs_reply by the time we staged. Drain now
      // so the message doesn't sit unflushed.
      this.maybeDrainPendingSteer(session);
    }
  }

  /**
   * User aborted the steer (clicked the X on the strip). Clear the slot
   * without firing a new prompt. The cancel notification we already sent
   * still completes — the agent just stops without a replacement.
   */
  async clearPendingSteer(payload: ClearPendingSteerPayload): Promise<void> {
    const session = this.requireSession(payload.threadId);
    this.clearPendingSteerSlot(session);
  }

  private startStructuredTurn(session: SessionRuntime, turn: QueuedStructuredTurn): void {
    if (!session.structuredSession?.startTurn) {
      return;
    }
    // Optimistic user_message: paint the user's prompt in the chat pane
    // before the structured session's `prompt()` round-trip resolves so the
    // chat doesn't visually stall waiting on the agent. Only meaningful for
    // GUI threads — terminal threads render user input via PTY echo.
    // Prefer the renderer-supplied id when present (the chat pane has
    // already painted the message); otherwise emit one from the supervisor.
    const optimisticItemId =
      session.presentationMode === "gui" && turn.prompt.length > 0
        ? (turn.userMessageItemId ??
          this.emitOptimisticUserMessage(session.threadId, turn.prompt, turn.segments))
        : undefined;
    const startTurn = session.structuredSession.startTurn(
      turn.prompt,
      turn.config,
      turn.segments,
      optimisticItemId ? { userMessageItemId: optimisticItemId } : undefined,
    );
    void startTurn.catch((error) => {
      if (this.sessions.get(session.threadId)?.instanceId !== session.instanceId) {
        return;
      }
      this.failStructuredSession(session, error);
    });
  }

  async closeThread(payload: CloseThreadPayload): Promise<void> {
    const shell = this.shellSessions.get(payload.threadId);
    if (shell) {
      shell.ignoreExit = true;
      this.shellSessions.delete(payload.threadId);
      this.safeShellPtyKill(shell);
      await this.waitForPtyExit(shell);
      return;
    }

    const existing = this.sessions.get(payload.threadId);
    if (!existing) {
      if (this.startLocks.has(payload.threadId)) {
        this.pendingStartAborts.add(payload.threadId);
      }
      return;
    }

    existing.ignoreExit = true;
    this.outputPipeline.clearSessionTimers(existing);
    existing.stopSessionRefWatcher?.();
    existing.stopSessionRefWatcher = undefined;
    this.sessions.delete(payload.threadId);
    if (existing.sessionRef?.providerSessionId) {
      this.sessionsBySessionId.delete(existing.sessionRef.providerSessionId);
    }
    this.clearAllSubAgentStateForThread(payload.threadId);
    await existing.structuredSession?.dispose();
    if (existing.structuredSession) {
      await sleep(150);
    }
    this.safePtyKill(existing);
    await this.waitForPtyExit(existing);
  }

  async startShell(payload: StartShellPayload): Promise<void> {
    ensureNodePtySpawnHelperExecutable();
    const existing = this.shellSessions.get(payload.shellId);
    if (existing) {
      existing.ignoreExit = true;
      this.shellSessions.delete(payload.shellId);
      this.safeShellPtyKill(existing);
    }

    // Capture project-scoped shell env (fnm / nvm / asdf / mise cd-hooks
    // fire when the prime probe runs inside the project root) so the
    // user's pinned Node/Python/Ruby are on PATH before the PTY spawns.
    if (shouldPrimeNativeProjectShellEnv(payload.projectLocation)) {
      await primeProjectShellEnv(payload.projectLocation.path);
    }

    const shellCommand = this.buildShellCommand(payload.projectLocation, {
      startInHome: payload.startInHome === true,
    });
    this.options.emit({ type: "thread-reset", threadId: payload.shellId });
    const terminalEnv = resolveTerminalColorEnv(payload.projectLocation);

    // node-pty's C binding expects every env value to be a string. process.env
    // is typed `Record<string, string | undefined>` and spreading can carry
    // undefined holes that surface as opaque "posix_spawnp failed" errors.
    const shellEnv: Record<string, string> = {
      ...sanitizedProcessEnv,
      ...terminalEnv,
    };
    if (payload.projectLocation.kind === "wsl") {
      const existingWslEnv = process.env.WSLENV ?? "";
      const wslEnvNames = new Set(
        existingWslEnv.split(":").map((value) => value.replace(/\/.*/, "")),
      );
      const missingNames = Object.keys(terminalEnv).filter((name) => !wslEnvNames.has(name));
      if (missingNames.length > 0) {
        shellEnv.WSLENV = [...(existingWslEnv ? [existingWslEnv] : []), ...missingNames].join(":");
      }
    } else {
      // A new native shell (terminal tab or the login/install overlay) should
      // see the same PATH a freshly-opened PowerShell would, not the
      // supervisor's launch-time snapshot. Re-read the registry-backed PATH at
      // spawn time so a CLI installed after launch (e.g. just-installed `grok`)
      // is on PATH without an app restart. Only `Path`/`PATH` are touched to
      // avoid reintroducing the undefined-value holes a raw process.env spread
      // would carry.
      const refreshedPath = getRefreshedWindowsPath();
      if (refreshedPath) {
        shellEnv.Path = refreshedPath;
        shellEnv.PATH = refreshedPath;
      }
    }

    // Start the PTY at the renderer-reported xterm size so the shell's first
    // output (Node deprecation warnings, dev server banners, etc.) wraps to
    // the actual viewport — those lines are emitted before any resize IPC
    // can land, and xterm never reflows pre-wrapped scrollback. Fall back to
    // 120×30 only if the renderer hasn't measured yet.
    let pty;
    try {
      pty = spawn(shellCommand.command, shellCommand.args, {
        name: process.platform === "win32" ? "xterm-color" : terminalEnv.TERM,
        cols: payload.initialSize?.cols ?? 120,
        rows: payload.initialSize?.rows ?? 30,
        ...(shellCommand.cwd ? { cwd: shellCommand.cwd } : {}),
        env: shellEnv,
      });
    } catch (error) {
      throw new Error(describeSpawnFailure("shell", shellCommand, shellEnv, error), {
        cause: error,
      });
    }

    const session: ShellSessionRuntime = {
      instanceId: randomUUID(),
      shellId: payload.shellId,
      pty,
      outputLength: 0,
      ...(payload.worktreePath ? { worktreePath: payload.worktreePath } : {}),
    };

    this.shellSessions.set(payload.shellId, session);
    this.trackPtyExit(session);
    pty.onData((data) => {
      if (this.shellSessions.get(payload.shellId)?.instanceId !== session.instanceId) {
        return;
      }
      session.outputLength += data.length;
      if (this.options.isDev) {
        this.logWriter.append(this.resolveLogPath(payload.shellId.replace(/:/g, "_")), data);
      }
      this.options.emit({
        type: "thread-output",
        threadId: payload.shellId,
        data,
        outputLength: session.outputLength,
      });
    });

    pty.onExit(({ exitCode }) => {
      this.resolvePtyExit(session);
      if (session.ignoreExit) {
        return;
      }
      this.shellSessions.delete(payload.shellId);
      this.options.emit({
        type: "thread-exited",
        threadId: payload.shellId,
        exitCode: exitCode ?? null,
      });
    });
  }

  async resolveThreadServerRequest(payload: ResolveThreadServerRequestPayload): Promise<void> {
    const session = this.requireSession(payload.threadId);
    if (!session.structuredSession?.resolveServerRequest) {
      throw new Error(`Thread ${payload.threadId} does not support server request resolution.`);
    }
    await session.structuredSession.resolveServerRequest(payload.requestId, payload.response);
  }

  readTerminalScrollback(threadId: string): string {
    return this.outputPipeline.readTerminalScrollback(this.sessions.get(threadId));
  }

  handlePtyDataForTests(session: SessionRuntime, data: string): void {
    this.outputPipeline.handlePtyData(session, data);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    for (const threadId of this.startLocks.keys()) {
      this.pendingStartAborts.add(threadId);
    }

    this.flushRuntimeEvents();
    await Promise.allSettled(
      [...this.sessions.values()].map(async (session) => {
        session.ignoreExit = true;
        this.outputPipeline.clearSessionTimers(session);
        await session.structuredSession?.dispose();
        this.safePtyKill(session);
      }),
    );
    this.sessions.clear();
    this.sessionsBySessionId.clear();

    for (const shell of this.shellSessions.values()) {
      shell.ignoreExit = true;
      this.safeShellPtyKill(shell);
    }
    this.shellSessions.clear();
    this.logWriter.dispose();
  }

  private requireAdapter(kind: AgentKind): AgentAdapter {
    const adapter = this.options.adapters.get(kind);
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

  private isCurrentSession(session: SessionRuntime): boolean {
    return this.sessions.get(session.threadId)?.instanceId === session.instanceId;
  }

  /**
   * Hook-launch flags must stay in the option section of the argv. Appending
   * them after positional session ids / prompts makes Codex treat
   * `--enable <hooks-feature>` as trailing user input instead of a real flag.
   */
  /**
   * Swap the hook plugin's `--settings <path>` for a sibling file with the
   * session flags merged in (ultracode and/or fast mode). Claude's CLI keeps
   * only the first `--settings` it sees and silently drops the rest, so the
   * inline flags and the plugin's hooks file can't coexist as separate flags —
   * they have to be one file.
   */
  private async applyClaudeMergedSettingsRewrite(
    adapter: AgentAdapter,
    args: string[],
    config: ThreadConfig,
    projectLocation: ProjectLocation,
  ): Promise<string[]> {
    if (!isClaudeAdapterKind(adapter.kind)) return args;
    const flags: Record<string, unknown> = {};
    if (config.effort === "ultracode") flags.ultracode = true;
    if (config.fast === true) flags.fastMode = true;
    if (Object.keys(flags).length === 0) return args;
    const idx = args.findIndex((arg, i) => arg === "--settings" && i + 1 < args.length);
    if (idx < 0) return args;
    const originalPath = args[idx + 1];
    if (!originalPath) return args;
    const rewritten = await prepareClaudeMergedSettingsFile(originalPath, projectLocation, flags);
    if (!rewritten) return args;
    const out = [...args];
    out[idx + 1] = rewritten;
    return out;
  }

  private mergeCliHookExtraArgs(
    adapter: AgentAdapter,
    args: string[],
    extraArgs: string[],
    prompt: string,
    sessionRef?: SessionRef,
  ): string[] {
    if (extraArgs.length === 0) {
      return args;
    }

    if (adapter.kind === "codex") {
      let trailingPositionals = 0;
      if (args[0] === "resume" || sessionRef) {
        trailingPositionals += 1;
      }
      if (prompt.trim().length > 0) {
        trailingPositionals += 1;
      }
      const insertAt = Math.max(args.length - trailingPositionals, args[0] === "resume" ? 1 : 0);
      return [...args.slice(0, insertAt), ...extraArgs, ...args.slice(insertAt)];
    }

    if (isClaudeAdapterKind(adapter.kind)) {
      const insertAt = prompt.trim().length > 0 ? args.length - 1 : args.length;
      return [...args.slice(0, insertAt), ...extraArgs, ...args.slice(insertAt)];
    }

    return [...args, ...extraArgs];
  }

  /**
   * Resolve the CLI hook plugin env + extra agent args that should be injected for
   * the given thread. Always returns a value so callers can splat
   * unconditionally; missing config produces an empty record/array.
   */
  private async resolveCliHookPluginExtras(
    threadId: string,
    agentKind: AgentKind,
    projectLocation: ProjectLocation,
    config: ThreadConfig,
    browserMcp: BrowserMcpHttpConfig | undefined,
    userMcpServers: McpServer[],
  ): Promise<{ env: Record<string, string>; extraArgs: string[] }> {
    const adapter = this.options.adapters.get(agentKind);
    const liveInputMode = adapter?.capabilities.liveInputMode ?? "terminal";

    if (!this.options.resolvePluginEnvForSpawn) {
      hookDebugSpawn({
        threadId,
        agentKind,
        project: hookDebugProjectLabel(projectLocation),
        mode: "L2",
        label: "terminal TUI parse only (no hook coordinator wired)",
        liveInputMode,
      });
      return { env: {}, extraArgs: [] };
    }
    try {
      const resolved = await this.options.resolvePluginEnvForSpawn({
        threadId,
        agentKind,
        projectLocation,
        browserMcpEnabled: this.isBrowserMcpEnabledForLaunch(adapter, config),
        ...(browserMcp !== undefined ? { browserMcp } : {}),
        ...(userMcpServers.length > 0 ? { userMcpServers } : {}),
      });
      const merged = resolved ?? { env: {}, extraArgs: [] };
      const hookUrl = merged.env.LIGHTCODE_HOOK_URL;
      const hasHookEnv = Boolean(hookUrl);

      if (liveInputMode === "server") {
        hookDebugSpawn({
          threadId,
          agentKind,
          project: hookDebugProjectLabel(projectLocation),
          mode: "L2",
          label: "structured / ACP–style agent (status from control channel, not CLI hook plugin)",
          liveInputMode,
          hookEnvInjected: hasHookEnv,
        });
      } else if (hasHookEnv) {
        const viaWslBridge = projectLocation.kind === "wsl";
        hookDebugSpawn({
          threadId,
          agentKind,
          project: hookDebugProjectLabel(projectLocation),
          mode: "L1",
          label: viaWslBridge
            ? "CLI hook plugin → in-distro HTTP bridge (WSL) → supervisor"
            : "CLI hook plugin → host HookIngress → supervisor",
          liveInputMode,
          hookUrl,
          extraCliArgs: merged.extraArgs.length,
        });
      } else {
        hookDebugSpawn({
          threadId,
          agentKind,
          project: hookDebugProjectLabel(projectLocation),
          mode: "L2",
          label:
            "CLI hook plugin inactive for this spawn (install/cache/transport/node in WSL, or not a hook-capable agent)",
          liveInputMode,
          extraCliArgs: merged.extraArgs.length,
        });
      }

      return merged;
    } catch (error) {
      console.warn("[supervisor] CLI hook plugin env resolution failed:", error);
      hookDebugSpawn({
        threadId,
        agentKind,
        project: hookDebugProjectLabel(projectLocation),
        mode: "L2",
        label: "resolvePluginEnvForSpawn threw; falling back to terminal parse only",
        liveInputMode,
        error: error instanceof Error ? error.message : String(error),
      });
      return { env: {}, extraArgs: [] };
    }
  }

  /**
   * Synchronously paint the user's typed prompt into the chat pane as a
   * canonical user_message item, ahead of the structured session's own
   * `prompt()` round-trip. The structured session below reuses this item id
   * via {@link StartTurnOptions} so its eventual emit is no-op'd by the
   * renderer's per-id dedupe, and the supervisor still drives the rest of the
   * canonical event stream.
   */
  private emitOptimisticUserMessage(
    threadId: string,
    prompt: string,
    segments?: PromptSegment[],
  ): string {
    const turnId = `turn-${randomUUID()}`;
    const itemId = `user-${randomUUID()}`;
    this.options.emit({
      type: "thread-runtime-event",
      threadId,
      event: { type: "turn.started", threadId, turnId },
    });
    this.options.emit({
      type: "thread-runtime-event",
      threadId,
      event: {
        type: "item.started",
        threadId,
        itemId,
        itemType: "user_message",
        payload: { content: buildPromptContentBlocks(prompt, segments) },
      },
    });
    this.options.emit({
      type: "thread-runtime-event",
      threadId,
      event: { type: "item.completed", threadId, itemId },
    });
    return itemId;
  }

  private emitOptimisticWorkingState(threadId: string, config: ThreadConfig): void {
    this.options.emit({
      type: "thread-state",
      threadId,
      status: "working",
      attention: "working",
      config,
      canResumeWithConfig: false,
      threadStatusSource: "server",
    });
  }

  private async startThreadInner(
    payload: StartThreadPayload & { threadId: string },
  ): Promise<StartThreadResult> {
    await this.closeThread({ threadId: payload.threadId });
    if (this.pendingStartAborts.delete(payload.threadId)) {
      this.pendingStartInterrupts.delete(payload.threadId);
      return { threadId: payload.threadId };
    }

    const adapter = this.requireAdapter(payload.agentKind);
    const isServerControlled = adapter.capabilities.liveInputMode === "server";
    // Per-thread mode wins over the adapter default. Chat-mode threads route
    // input/output through the structured session even for adapters whose
    // `liveInputMode` is "terminal".
    const requestedPresentation = payload.presentationMode ?? adapter.capabilities.presentationMode;
    const usesTerminalPresentation = requestedPresentation === "terminal";
    const useStructuredFlow = isServerControlled || !usesTerminalPresentation;
    const effectiveSegments = payload.segments
      ? await rewriteSegmentsForWsl(payload.segments, payload.projectLocation, {
          preserveImageAttachments: useStructuredFlow,
        })
      : undefined;
    const initialPrompt =
      effectiveSegments && effectiveSegments.length > 0
        ? (adapter.formatPromptSegments?.(effectiveSegments) ??
          defaultFormatPromptSegments(effectiveSegments))
        : payload.prompt.trim();
    const shouldQueueInitialPrompt =
      !payload.sessionRef &&
      isServerControlled &&
      usesTerminalPresentation &&
      initialPrompt.length > 0 &&
      adapter.isReadyForInitialPrompt !== undefined;

    // Optimistic user_message: for GUI threads with a fresh prompt, surface
    // the user's typed text in the chat pane immediately — before the slow
    // structured-session work (process spawn + ACP handshake +
    // newSession/loadSession) runs. When the renderer has already painted an
    // optimistic message and shipped its id with the payload, we reuse that
    // id end-to-end so the chat pane never sees a duplicate.
    const optimisticUserMessageItemId =
      !usesTerminalPresentation && initialPrompt.length > 0 && !payload.sessionRef
        ? (payload.userMessageItemId ??
          this.emitOptimisticUserMessage(payload.threadId, initialPrompt, effectiveSegments))
        : undefined;
    if (optimisticUserMessageItemId) {
      this.emitOptimisticWorkingState(payload.threadId, payload.config);
    }

    // Prime the user's interactive-shell env (fnm / nvm / asdf / mise cd-hooks
    // applied at the project root) before any agent process — structured or
    // PTY — is spawned. Electron-from-Finder inherits launchd's skeleton PATH,
    // so without this the spawned CLI picks up homebrew node instead of the
    // project-pinned version. Memoized per cwd; the later prime before the PTY
    // launch is a no-op after this.
    if (shouldPrimeNativeProjectShellEnv(payload.projectLocation)) {
      await primeProjectShellEnv(payload.projectLocation.path);
    }

    const browserMcp = await this.resolveBrowserMcpForLaunch(
      adapter,
      payload.projectLocation,
      payload.config,
    );
    const userMcpServers = resolveMcpServersForAgent(
      payload.userMcpServers ?? [],
      payload.agentKind,
    ).filter(
      (server) =>
        !browserMcp || server.name.toLowerCase() !== BROWSER_MCP_SERVER_NAME.toLowerCase(),
    );
    const structuredSession = await this.createStructuredSession(
      adapter,
      payload.threadId,
      payload.agentKind,
      payload.projectLocation,
      payload.config,
      browserMcp,
      userMcpServers,
      payload.sessionRef,
      requestedPresentation,
    );
    if (await this.abortPendingStart(payload.threadId, structuredSession)) {
      return { threadId: payload.threadId };
    }

    if (structuredSession?.activate) {
      try {
        await structuredSession.activate();
      } catch (error) {
        await structuredSession.dispose();
        if (this.pendingStartInterrupts.delete(payload.threadId)) {
          return { threadId: payload.threadId };
        }
        throw error;
      }
    }
    if (await this.abortPendingStart(payload.threadId, structuredSession)) {
      return { threadId: payload.threadId };
    }

    let openedStructuredThreadId: string | undefined;
    if (structuredSession?.openThread) {
      try {
        openedStructuredThreadId = await structuredSession.openThread(
          payload.config,
          payload.sessionRef,
        );
      } catch (error) {
        await structuredSession.dispose();
        if (this.pendingStartInterrupts.delete(payload.threadId)) {
          return { threadId: payload.threadId };
        }
        throw error;
      }
    }
    if (await this.abortPendingStart(payload.threadId, structuredSession)) {
      return { threadId: payload.threadId };
    }

    if (!usesTerminalPresentation) {
      if (!structuredSession) {
        throw new Error(
          `Agent ${payload.agentKind} does not support ${requestedPresentation} presentation.`,
        );
      }
      const resolvedSessionRef =
        payload.sessionRef ??
        (openedStructuredThreadId ? createKnownSessionRef(openedStructuredThreadId) : undefined);
      const startInterrupted = this.pendingStartInterrupts.delete(payload.threadId);
      const session = this.spawnThread({
        threadId: payload.threadId,
        adapter,
        agentKind: payload.agentKind,
        projectLocation: payload.projectLocation,
        config: payload.config,
        initialSize: payload.initialSize,
        launchPrompt: "",
        ...(userMcpServers.length > 0 ? { userMcpServers } : {}),
        structuredSession,
        ...(resolvedSessionRef ? { sessionRef: resolvedSessionRef } : {}),
        presentationMode: requestedPresentation,
        initialStatus: optimisticUserMessageItemId && !startInterrupted ? "working" : "idle",
        initialAttention: optimisticUserMessageItemId && !startInterrupted ? "working" : "none",
        suppressInitialStructuredIdle:
          optimisticUserMessageItemId !== undefined && !startInterrupted,
      });
      if (
        !startInterrupted &&
        !payload.sessionRef &&
        initialPrompt.length > 0 &&
        structuredSession.startTurn
      ) {
        void structuredSession
          .startTurn(
            initialPrompt,
            payload.config,
            effectiveSegments,
            optimisticUserMessageItemId
              ? { userMessageItemId: optimisticUserMessageItemId }
              : undefined,
          )
          .catch((error) => {
            if (this.sessions.get(session.threadId)?.instanceId !== session.instanceId) {
              return;
            }
            this.failStructuredSession(session, error);
          });
      }
      return { threadId: payload.threadId };
    }

    if (
      !payload.sessionRef &&
      useStructuredFlow &&
      initialPrompt.length > 0 &&
      !shouldQueueInitialPrompt &&
      structuredSession?.startTurn
    ) {
      void structuredSession
        .startTurn(initialPrompt, payload.config, effectiveSegments)
        .catch((error) => {
          console.error("[supervisor] initial turn failed:", error);
          captureSupervisorException(error, {
            "lightcode.feature_area": "supervisor-runtime",
            "lightcode.provider": payload.agentKind,
          });
          const activeSession = this.sessions.get(payload.threadId);
          if (!activeSession) {
            return;
          }
          this.failStructuredSession(activeSession, error);
        });
    }

    if (shouldQueueInitialPrompt) {
      await structuredSession?.ensureResumeArtifacts?.();
    }

    const deferToTerminal = adapter.shouldDeferPromptToTerminal?.(payload.config) ?? false;
    // Use `initialPrompt` (the adapter-formatted version with `~/` shortening
    // and WSL path rewriting) so attachments hand off cleanly as the launch
    // arg instead of being staged for a deferred PTY-write.
    const launchPrompt = useStructuredFlow || deferToTerminal ? "" : initialPrompt;
    const launchOptions = this.launchOptionsWithAgentSettings(
      adapter,
      structuredSession?.launchOptions,
    );
    const launchOptionsResolved: AgentLaunchOptions = {
      ...this.launchOptionsWithBrowserMcp(launchOptions, browserMcp),
      ...(userMcpServers.length > 0 ? { userMcpServers } : {}),
    };
    const argv = payload.sessionRef
      ? adapter.buildResumeArgv(
          payload.projectLocation,
          payload.config,
          launchPrompt,
          payload.sessionRef,
          launchOptionsResolved,
        )
      : adapter.buildLaunchArgv(
          payload.projectLocation,
          payload.config,
          launchPrompt,
          payload.sessionRef,
          launchOptionsResolved,
        );

    // Append CLI hook plugin args (e.g. Claude `--settings <path>`); env vars
    // (`LIGHTCODE_HOOK_URL`, `LIGHTCODE_HOOK_SECRET`, `LIGHTCODE_THREAD_ID`,
    // `LIGHTCODE_AGENT_KIND`, `LIGHTCODE_HOOK_PROTOCOL_VERSION`) flow through
    // `spawnThread` → `agentEnv` so they end up in the PTY env on every
    // platform (WSL, win32, posix). Failure to resolve plugin extras silently
    // degrades to L2 — the supervisor must never block thread creation on
    // the hook-plugin plumbing.
    const cliHookExtras = await this.resolveCliHookPluginExtras(
      payload.threadId,
      payload.agentKind,
      payload.projectLocation,
      payload.config,
      browserMcp,
      userMcpServers,
    );
    if (cliHookExtras.extraArgs.length > 0) {
      argv.args = this.mergeCliHookExtraArgs(
        adapter,
        argv.args,
        cliHookExtras.extraArgs,
        launchPrompt,
        payload.sessionRef,
      );
    }
    argv.args = await this.applyClaudeMergedSettingsRewrite(
      adapter,
      argv.args,
      payload.config,
      payload.projectLocation,
    );
    if (shouldPrimeNativeProjectShellEnv(payload.projectLocation)) {
      await primeProjectShellEnv(payload.projectLocation.path);
    }
    const command = resolveLaunchSpec(payload.projectLocation, argv);

    const keepStructuredSession = structuredSession && useStructuredFlow;
    if (structuredSession && !keepStructuredSession) {
      await structuredSession.dispose();
    }
    if (this.pendingStartAborts.delete(payload.threadId)) {
      this.pendingStartInterrupts.delete(payload.threadId);
      if (structuredSession && keepStructuredSession) {
        await structuredSession.dispose();
      }
      return { threadId: payload.threadId };
    }

    const resolvedSessionRef = payload.sessionRef ?? command.sessionRef;
    this.spawnThread({
      threadId: payload.threadId,
      adapter,
      agentKind: payload.agentKind,
      projectLocation: payload.projectLocation,
      config: payload.config,
      initialSize: payload.initialSize,
      launchPrompt,
      ...(userMcpServers.length > 0 ? { userMcpServers } : {}),
      command,
      ...(Object.keys(cliHookExtras.env).length > 0 ? { extraEnv: cliHookExtras.env } : {}),
      ...(keepStructuredSession ? { structuredSession } : {}),
      ...(resolvedSessionRef ? { sessionRef: resolvedSessionRef } : {}),
      ...(shouldQueueInitialPrompt ? { pendingLaunchPrompt: initialPrompt } : {}),
      presentationMode: requestedPresentation,
      ...(deferToTerminal && !useStructuredFlow
        ? (() => {
            const preInputs = adapter.buildTerminalPreInputs?.(payload.config);
            return {
              ...(preInputs ? { pendingTerminalPreInputs: preInputs } : {}),
              pendingTerminalPrompt: initialPrompt,
              ...(effectiveSegments ? { pendingTerminalSegments: effectiveSegments } : {}),
            };
          })()
        : {}),
    });

    return { threadId: payload.threadId };
  }

  private async createStructuredSession(
    adapter: AgentAdapter,
    threadId: string,
    agentKind: AgentKind,
    projectLocation: ProjectLocation,
    config: ThreadConfig,
    browserMcp: BrowserMcpHttpConfig | undefined,
    userMcpServers: McpServer[],
    sessionRef?: SessionRef,
    presentationMode?: import("@/shared/contracts").ThreadPresentationMode,
  ): Promise<StructuredSessionHandle | undefined> {
    if (!adapter.createStructuredSession) {
      return undefined;
    }
    try {
      return await adapter.createStructuredSession({
        threadId,
        projectLocation,
        config,
        agentSettings: this.resolveAgentSettings(adapter),
        ...(browserMcp ? { browserMcp } : {}),
        ...(userMcpServers.length > 0 ? { userMcpServers } : {}),
        ...(sessionRef ? { sessionRef } : {}),
        ...(presentationMode ? { presentationMode } : {}),
      });
    } catch (error) {
      console.error("[supervisor] structured session creation failed:", error);
      captureSupervisorException(error, {
        "lightcode.feature_area": "supervisor-runtime",
        "lightcode.provider": agentKind,
      });
      return undefined;
    }
  }

  private async abortPendingStart(
    threadId: string,
    structuredSession: StructuredSessionHandle | undefined,
  ): Promise<boolean> {
    if (!this.pendingStartAborts.delete(threadId)) {
      return false;
    }
    this.pendingStartInterrupts.delete(threadId);
    await structuredSession?.dispose();
    return true;
  }

  private spawnThread(input: {
    threadId: string;
    agentKind: AgentKind;
    adapter: AgentAdapter;
    projectLocation: ProjectLocation;
    config: ThreadConfig;
    initialSize: TerminalSize;
    launchPrompt: string;
    command?: CommandSpec;
    /**
     * Extra env injected into the agent PTY (merged on top of agentEnv +
     * provider spawnEnv). Currently used by the CLI hook ingress to ferry
     * `LIGHTCODE_HOOK_URL` / `LIGHTCODE_HOOK_SECRET` / `LIGHTCODE_THREAD_ID` etc.
     */
    extraEnv?: Record<string, string>;
    structuredSession?: StructuredSessionHandle;
    sessionRef?: SessionRef;
    userMcpServers?: McpServer[];
    pendingLaunchPrompt?: string;
    pendingTerminalPreInputs?: string[][];
    pendingTerminalPrompt?: string;
    pendingTerminalSegments?: PromptSegment[];
    presentationMode?: import("@/shared/contracts").ThreadPresentationMode;
    initialStatus?: import("@/shared/contracts").ThreadStatus;
    initialAttention?: import("@/shared/contracts").ThreadAttention;
    suppressInitialStructuredIdle?: boolean;
  }): SessionRuntime {
    // `thread-reset` is only consumed by the terminal panel (renderer scrollback
    // reset) and the renderer-side runtime-event/server-request slice clear.
    // GUI threads have no terminal scrollback, and clearing the slice would
    // wipe the optimistic user_message we may have already painted ahead of
    // structured-session setup. Skip the reset for any GUI-presentation
    // thread (initial launch, resume, restart all run through here).
    const isGuiPresentation =
      input.presentationMode !== undefined && input.presentationMode !== "terminal";
    if (!isGuiPresentation) {
      this.options.emit({ type: "thread-reset", threadId: input.threadId });
    }

    const agentEnv = this.resolveAgentProcessEnv(input.adapter);
    const cliHookEnvInjected = Boolean(input.extraEnv?.LIGHTCODE_HOOK_URL);
    const providerEnv =
      input.projectLocation.kind === "wsl"
        ? input.adapter.spawnEnv?.wsl
        : input.adapter.spawnEnv?.native;
    if (providerEnv) {
      Object.assign(agentEnv, providerEnv);
    }
    if (input.extraEnv) {
      Object.assign(agentEnv, input.extraEnv);
    }
    Object.assign(
      agentEnv,
      getIterm2StatusL2TerminalEnv({
        agentKind: input.agentKind,
        projectLocation: input.projectLocation,
        disableCliHookPlugin: this.readDisableCliHookPlugin(),
        cliHookEnvInjected,
      }),
    );
    const terminalEnv = resolveTerminalColorEnv(input.projectLocation);
    const terminalAgentEnv = { ...agentEnv, ...terminalEnv };
    const command = input.command
      ? injectWslEnv(input.command, input.projectLocation, terminalAgentEnv)
      : undefined;
    let pty;
    if (command) {
      ensureNodePtySpawnHelperExecutable();
      const ptyEnv = {
        ...sanitizedProcessEnv,
        ...(command.env ?? {}),
        ...agentEnv,
        ...terminalEnv,
      };
      try {
        pty = spawn(command.command, command.args, {
          name: process.platform === "win32" ? "xterm-color" : terminalEnv.TERM,
          cols: input.initialSize.cols,
          rows: input.initialSize.rows,
          cwd: command.cwd ?? process.cwd(),
          env: ptyEnv,
        });
      } catch (error) {
        throw new Error(
          describeSpawnFailure(
            "agent",
            {
              command: command.command,
              args: command.args,
              ...(command.cwd ? { cwd: command.cwd } : {}),
            },
            sanitizeEnv(ptyEnv),
            error,
          ),
          { cause: error },
        );
      }
    }
    const session: SessionRuntime = {
      instanceId: randomUUID(),
      threadId: input.threadId,
      agentKind: input.agentKind,
      adapter: input.adapter,
      ...(pty ? { pty } : {}),
      projectLocation: input.projectLocation,
      config: input.config,
      terminalSize: input.initialSize,
      launchPrompt: input.launchPrompt,
      ...(input.sessionRef ? { sessionRef: input.sessionRef } : {}),
      status: input.initialStatus ?? "launching",
      attention: input.initialAttention ?? "none",
      canResumeWithConfig: input.sessionRef !== undefined,
      outputLength: 0,
      // On restart/reopen the call sites don't re-resolve servers; fall back to
      // the prior session (still in the map until we replace it below).
      userMcpServers:
        input.userMcpServers ?? this.sessions.get(input.threadId)?.userMcpServers ?? [],
      pendingLaunchPrompt: input.pendingLaunchPrompt,
      pendingTerminalPreInputs: input.pendingTerminalPreInputs,
      pendingTerminalPrompt: input.pendingTerminalPrompt,
      pendingTerminalSegments: input.pendingTerminalSegments,
      ...(input.presentationMode ? { presentationMode: input.presentationMode } : {}),
      ...(input.suppressInitialStructuredIdle ? { suppressInitialStructuredIdle: true } : {}),
      prevChunk: "",
      lastStrippedPtyChunk: "",
      ptyOscCarry: "",
      ...(cliHookEnvInjected ? { cliHookEnvInjected: true } : {}),
      ...(input.structuredSession ? { structuredSession: input.structuredSession } : {}),
    };

    this.sessions.set(input.threadId, session);
    if (session.pty) {
      this.trackPtyExit(session);
    }
    if (session.sessionRef?.providerSessionId) {
      this.sessionsBySessionId.set(session.sessionRef.providerSessionId, session);
    }
    this.outputPipeline.emitState(session);
    if (
      pty &&
      !session.sessionRef &&
      !session.sessionRefDiscoveryStarted &&
      input.adapter.discoverSessionRef
    ) {
      session.sessionRefDiscoveryStarted = true;
      this.pollSessionRefDiscovery(session);
    }

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
        this.failStructuredSession(session, errorMessage);
      },
      onUpdate: (update) => {
        if (
          this.sessions.get(session.threadId)?.instanceId !== session.instanceId ||
          session.ignoreExit
        ) {
          return;
        }
        const wasWorking = session.status === "working";
        const hadInterruptRequest = session.structuredTurnInterruptRequested === true;
        if (update.sessionRef) {
          const prevId = session.sessionRef?.providerSessionId;
          session.sessionRef = update.sessionRef;
          session.canResumeWithConfig = true;
          this.indexSessionRef(session, prevId);
        }

        const configChanged =
          update.config !== undefined && !isThreadConfigEqual(session.config, update.config);
        const slashCommandsChanged =
          update.slashCommands !== undefined &&
          !areAgentSlashCommandsEqual(session.slashCommands, update.slashCommands);
        const stateChanged =
          session.status !== update.status ||
          session.attention !== update.attention ||
          update.errorMessage !== undefined;
        if (update.config) {
          session.config = update.config;
        }
        if (update.slashCommands !== undefined) {
          session.slashCommands = update.slashCommands;
        }

        if (
          session.suppressInitialStructuredIdle === true &&
          update.status === "idle" &&
          session.status === "working" &&
          session.structuredTurnInterruptRequested !== true
        ) {
          if (update.sessionRef || configChanged || slashCommandsChanged) {
            this.outputPipeline.emitState(session);
          }
          return;
        }
        if (session.suppressInitialStructuredIdle === true && update.status !== "idle") {
          session.suppressInitialStructuredIdle = undefined;
        }

        // Wire-ordering: `thread-state` (status) events are emitted to the
        // renderer immediately, but this session's runtime events are batched
        // (RuntimeEventBuffer, ~16ms). Without flushing here, a turn-end `idle`
        // can overtake the turn's final runtime events on the IPC wire; those
        // trailing events then land after `idle` in the renderer and re-open the
        // GUI turn to "working" via reopenGuiTurnForLiveRuntimeActivity, leaving a
        // stale "working" until the next snapshot reconcile (on thread switch).
        // Flushing first guarantees the renderer applies the final events before
        // the status change, mirroring its own flushPendingRuntimeEventsSync.
        this.flushRuntimeEvents();

        this.outputPipeline.updateState(
          session,
          update.status,
          update.attention,
          update.errorMessage,
          {
            forceCloseActiveTurn:
              hadInterruptRequest && (update.status === "idle" || update.status === "needs_reply"),
          },
        );
        if (update.status !== "working") {
          session.structuredTurnInterruptRequested = false;
          this.clearStructuredInterruptWatchdog(session);
        } else {
          // Still working but the agent showed a sign of life — restart the
          // stale-kill clock so a healthy long-running cancel is not killed.
          this.touchStructuredInterruptWatchdog(session);
        }
        if (
          session.presentationMode === "gui" &&
          (wasWorking || hadInterruptRequest) &&
          ThreadSessionManager.isSteerDrainableStatus(update.status)
        ) {
          this.maybeDrainPendingSteer(session);
        }
        if (
          (configChanged || slashCommandsChanged) &&
          !stateChanged &&
          update.errorMessage === undefined
        ) {
          this.outputPipeline.emitState(session);
        }
      },
      onRuntimeEvent: (event) => {
        if (
          this.sessions.get(session.threadId)?.instanceId !== session.instanceId ||
          session.ignoreExit
        ) {
          return;
        }
        if (
          session.suppressInitialStructuredIdle === true &&
          shouldReleaseInitialStructuredIdleSuppression(event)
        ) {
          session.suppressInitialStructuredIdle = undefined;
        }
        // Streaming output is a sign of life — restart the stale-kill clock so a
        // healthy agent still emitting tool/text deltas after a stop request is
        // never force-stopped while it works toward honoring the cancel.
        this.touchStructuredInterruptWatchdog(session);
        this.enqueueRuntimeEvent(session.threadId, event);
      },
    });

    pty?.onData((data) => {
      if (this.sessions.get(session.threadId)?.instanceId !== session.instanceId) {
        return;
      }
      try {
        this.outputPipeline.handlePtyData(session, data);
      } catch (error) {
        console.error(
          `[supervisor] uncaught error in onData for thread ${session.threadId}:`,
          error,
        );
        captureSupervisorException(error, {
          "lightcode.feature_area": "supervisor-runtime",
          "lightcode.provider": session.agentKind,
        });
      }
    });

    pty?.onExit((event) => {
      this.resolvePtyExit(session);
      if (session.ignoreExit) {
        return;
      }
      if (this.sessions.get(session.threadId)?.instanceId !== session.instanceId) {
        return;
      }
      void session.structuredSession?.dispose();
      this.outputPipeline.clearSessionTimers(session);
      this.outputPipeline.updateState(session, "inactive", "none");
      session.hasCliHookPluginActivity = false;
      session.cliHookEnvInjected = false;
      if (session.sessionRef?.providerSessionId) {
        this.sessionsBySessionId.delete(session.sessionRef.providerSessionId);
      }
      this.options.emit({
        type: "thread-exited",
        threadId: session.threadId,
        exitCode: event.exitCode,
      });
    });

    return session;
  }

  private pollSessionRefDiscovery(session: SessionRuntime): void {
    let attempt = 0;
    let polling = false;
    const existingIds = new Set<string>();
    for (const activeSession of this.sessions.values()) {
      if (activeSession.sessionRef && activeSession.threadId !== session.threadId) {
        existingIds.add(activeSession.sessionRef.providerSessionId);
      }
    }

    const poll = async (force = false) => {
      if (polling || session.sessionRef || session.status === "inactive") {
        return;
      }
      if (!force && attempt >= 5) {
        return;
      }
      polling = true;
      if (!force) {
        attempt += 1;
      }
      try {
        const ref = await session.adapter.discoverSessionRef?.(session.projectLocation);
        if (ref && !session.sessionRef && !existingIds.has(ref.providerSessionId)) {
          session.sessionRef = ref;
          session.canResumeWithConfig = true;
          this.indexSessionRef(session, undefined);
          session.stopSessionRefWatcher?.();
          session.stopSessionRefWatcher = undefined;
          this.outputPipeline.emitState(session);
          return;
        }
      } catch {
        // retry later
      } finally {
        polling = false;
      }
      if (!force && attempt < 5) {
        setTimeout(() => void poll(), 3000);
      }
    };

    session.stopSessionRefWatcher = session.adapter.watchSessionRef?.(
      session.projectLocation,
      () => void poll(true),
    );
    const initialDelay = session.adapter.initialSessionRefDiscoveryDelayMs ?? 0;
    if (initialDelay > 0) {
      setTimeout(() => void poll(), initialDelay);
      return;
    }
    void poll();
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
    const usesTerminalPresentation =
      (session.presentationMode ?? session.adapter.capabilities.presentationMode) === "terminal";
    const useStructuredFlow = isServerControlled || !usesTerminalPresentation;
    session.ignoreExit = true;
    this.outputPipeline.clearSessionTimers(session);
    // Subagent maps from the prior session would otherwise leak across resume:
    // any unsubscribed buffers, lingering child→parent entries, and overlay
    // subscriptions from the dead session are stale once the structured
    // session is replaced. `closeThread` already does this on full teardown.
    this.clearAllSubAgentStateForThread(session.threadId);
    await session.structuredSession?.dispose();
    if (session.structuredSession) {
      await sleep(150);
    }
    this.safePtyKill(session);
    if (!this.isCurrentSession(session)) {
      return;
    }

    // Prime the user's interactive-shell env before respawning. See the same
    // call in `startThreadInner` — must run before the structured-session
    // spawn so the child inherits the project-pinned PATH, not launchd's.
    if (shouldPrimeNativeProjectShellEnv(session.projectLocation)) {
      await primeProjectShellEnv(session.projectLocation.path);
    }
    if (!this.isCurrentSession(session)) {
      return;
    }

    const browserMcp = await this.resolveBrowserMcpForLaunch(
      session.adapter,
      session.projectLocation,
      config,
    );
    const structuredSession = await this.createStructuredSession(
      session.adapter,
      session.threadId,
      session.agentKind,
      session.projectLocation,
      config,
      browserMcp,
      session.userMcpServers ?? [],
      session.sessionRef,
      session.presentationMode,
    );
    if (!this.isCurrentSession(session)) {
      await structuredSession?.dispose();
      return;
    }

    if (structuredSession?.activate) {
      try {
        await structuredSession.activate();
      } catch (error) {
        await structuredSession.dispose();
        throw error;
      }
    }
    if (!this.isCurrentSession(session)) {
      await structuredSession?.dispose();
      return;
    }

    if (structuredSession?.openThread) {
      try {
        await structuredSession.openThread(config, session.sessionRef);
      } catch (error) {
        await structuredSession.dispose();
        throw error;
      }
    }
    if (!this.isCurrentSession(session)) {
      await structuredSession?.dispose();
      return;
    }

    if (!usesTerminalPresentation) {
      if (!structuredSession) {
        throw new Error(`Thread ${session.threadId} cannot restart without a structured session.`);
      }
      const restarted = this.spawnThread({
        threadId: session.threadId,
        agentKind: session.agentKind,
        adapter: session.adapter,
        projectLocation: session.projectLocation,
        config,
        initialSize: session.terminalSize,
        launchPrompt: "",
        structuredSession,
        sessionRef: session.sessionRef,
        ...(session.presentationMode ? { presentationMode: session.presentationMode } : {}),
      });
      if (prompt.trim().length > 0 && structuredSession.startTurn) {
        const optimisticItemId = this.emitOptimisticUserMessage(session.threadId, prompt);
        void structuredSession
          .startTurn(prompt, config, undefined, { userMessageItemId: optimisticItemId })
          .catch((error) => {
            if (this.sessions.get(restarted.threadId)?.instanceId !== restarted.instanceId) {
              return;
            }
            this.failStructuredSession(restarted, error);
          });
      }
      return;
    }

    const launchPrompt = useStructuredFlow ? "" : prompt;
    const cliHookExtras = await this.resolveCliHookPluginExtras(
      session.threadId,
      session.agentKind,
      session.projectLocation,
      config,
      browserMcp,
      session.userMcpServers ?? [],
    );
    if (!this.isCurrentSession(session)) {
      await structuredSession?.dispose();
      return;
    }
    const argv = session.adapter.buildResumeArgv(
      session.projectLocation,
      config,
      launchPrompt,
      session.sessionRef,
      this.launchOptionsWithBrowserMcp(
        this.launchOptionsWithAgentSettings(session.adapter, structuredSession?.launchOptions),
        browserMcp,
      ),
    );
    if (cliHookExtras.extraArgs.length > 0) {
      argv.args = this.mergeCliHookExtraArgs(
        session.adapter,
        argv.args,
        cliHookExtras.extraArgs,
        launchPrompt,
        session.sessionRef,
      );
    }
    argv.args = await this.applyClaudeMergedSettingsRewrite(
      session.adapter,
      argv.args,
      config,
      session.projectLocation,
    );
    if (shouldPrimeNativeProjectShellEnv(session.projectLocation)) {
      await primeProjectShellEnv(session.projectLocation.path);
    }
    if (!this.isCurrentSession(session)) {
      await structuredSession?.dispose();
      return;
    }
    const command = resolveLaunchSpec(session.projectLocation, argv);

    const keepStructuredSession = structuredSession && useStructuredFlow;
    if (structuredSession && !keepStructuredSession) {
      await structuredSession.dispose();
    }
    if (!this.isCurrentSession(session)) {
      if (structuredSession && keepStructuredSession) {
        await structuredSession.dispose();
      }
      return;
    }

    this.spawnThread({
      threadId: session.threadId,
      agentKind: session.agentKind,
      adapter: session.adapter,
      projectLocation: session.projectLocation,
      config,
      initialSize: session.terminalSize,
      launchPrompt,
      command,
      ...(Object.keys(cliHookExtras.env).length > 0 ? { extraEnv: cliHookExtras.env } : {}),
      ...(keepStructuredSession ? { structuredSession } : {}),
      sessionRef: session.sessionRef,
      ...(session.presentationMode ? { presentationMode: session.presentationMode } : {}),
    });
  }

  private recoverInvalidSessionRef(session: SessionRuntime): void {
    if (session.invalidSessionRecoveryStarted || !session.sessionRef) {
      return;
    }
    session.invalidSessionRecoveryStarted = true;
    void (async () => {
      if (this.sessions.get(session.threadId)?.instanceId !== session.instanceId) {
        return;
      }

      session.ignoreExit = true;
      this.outputPipeline.clearSessionTimers(session);
      session.stopSessionRefWatcher?.();
      session.stopSessionRefWatcher = undefined;
      await session.structuredSession?.dispose();
      if (session.structuredSession) {
        await sleep(150);
      }
      this.safePtyKill(session);

      if (this.sessions.get(session.threadId)?.instanceId !== session.instanceId) {
        return;
      }

      const browserMcp = await this.resolveBrowserMcpForLaunch(
        session.adapter,
        session.projectLocation,
        session.config,
      );
      const cliHookExtras = await this.resolveCliHookPluginExtras(
        session.threadId,
        session.agentKind,
        session.projectLocation,
        session.config,
        browserMcp,
        session.userMcpServers ?? [],
      );
      if (!this.isCurrentSession(session)) {
        return;
      }
      const argv = session.adapter.buildLaunchArgv(
        session.projectLocation,
        session.config,
        session.launchPrompt,
        undefined,
        this.launchOptionsWithBrowserMcp(
          this.launchOptionsWithAgentSettings(session.adapter),
          browserMcp,
        ),
      );
      if (cliHookExtras.extraArgs.length > 0) {
        argv.args = this.mergeCliHookExtraArgs(
          session.adapter,
          argv.args,
          cliHookExtras.extraArgs,
          session.launchPrompt,
        );
      }
      argv.args = await this.applyClaudeMergedSettingsRewrite(
        session.adapter,
        argv.args,
        session.config,
        session.projectLocation,
      );
      if (shouldPrimeNativeProjectShellEnv(session.projectLocation)) {
        await primeProjectShellEnv(session.projectLocation.path);
      }
      if (!this.isCurrentSession(session)) {
        return;
      }
      const command = resolveLaunchSpec(session.projectLocation, argv);

      this.spawnThread({
        threadId: session.threadId,
        agentKind: session.agentKind,
        adapter: session.adapter,
        projectLocation: session.projectLocation,
        config: session.config,
        initialSize: session.terminalSize,
        launchPrompt: session.launchPrompt,
        command,
        ...(Object.keys(cliHookExtras.env).length > 0 ? { extraEnv: cliHookExtras.env } : {}),
      });
    })();
  }

  private handleStructuredSessionClosed(session: SessionRuntime): void {
    if (session.status === "inactive") {
      return;
    }
    this.outputPipeline.updateState(session, "inactive", "none");
    this.options.emit({
      type: "thread-exited",
      threadId: session.threadId,
      exitCode: null,
    });
    session.ignoreExit = true;
    session.stopSessionRefWatcher?.();
    session.stopSessionRefWatcher = undefined;
    setTimeout(() => this.safePtyKill(session), 150);
  }

  private startQueuedLaunchPrompt(session: SessionRuntime): void {
    if (!session.pendingLaunchPrompt || !session.structuredSession?.startTurn) {
      return;
    }
    const prompt = session.pendingLaunchPrompt;
    session.pendingLaunchPrompt = undefined;
    void session.structuredSession.startTurn(prompt, session.config).catch((error) => {
      if (this.sessions.get(session.threadId)?.instanceId !== session.instanceId) {
        return;
      }
      this.failStructuredSession(session, error);
    });
  }

  private trackPtyExit(session: SessionRuntime | ShellSessionRuntime): void {
    if (session.ptyExited || this.ptyExitPromises.has(session)) {
      return;
    }
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    this.ptyExitPromises.set(session, promise);
    this.ptyExitResolvers.set(session, resolve);
  }

  private resolvePtyExit(session: SessionRuntime | ShellSessionRuntime): void {
    session.ptyExited = true;
    this.ptyExitResolvers.get(session)?.();
    this.ptyExitResolvers.delete(session);
    this.ptyExitPromises.delete(session);
  }

  private async waitForPtyExit(session: SessionRuntime | ShellSessionRuntime): Promise<void> {
    if (session.ptyExited) {
      return;
    }
    const exitPromise = this.ptyExitPromises.get(session);
    if (!exitPromise) {
      return;
    }
    await Promise.race([
      exitPromise,
      sleep(ThreadSessionManager.PTY_CLOSE_TIMEOUT_MS).then(() => undefined),
    ]);
  }

  private safePtyKill(session: SessionRuntime): void {
    if (!session.pty) {
      return;
    }
    if (session.ptyExited) {
      return;
    }
    if (process.platform === "win32") {
      terminateProcessTree(session.pty.pid);
      return;
    }
    try {
      process.kill(session.pty.pid, 0);
    } catch {
      return;
    }
    session.pty.kill();
  }

  private safeShellPtyKill(session: ShellSessionRuntime): void {
    if (session.ptyExited) {
      return;
    }
    if (process.platform === "win32") {
      terminateProcessTree(session.pty.pid);
      return;
    }
    try {
      process.kill(session.pty.pid, 0);
    } catch {
      return;
    }
    session.pty.kill();
  }

  private buildShellCommand(
    location: ProjectLocation,
    options?: { startInHome?: boolean },
  ): {
    command: string;
    args: string[];
    cwd?: string;
  } {
    const startInHome = options?.startInHome === true;
    if (location.kind === "wsl") {
      // `wsl --cd ~` lands in the distro's Linux home; otherwise the worktree.
      return {
        command: getWslCommand(),
        args: ["-d", location.distro, "--cd", startInHome ? "~" : location.linuxPath],
      };
    }

    if (process.platform === "win32") {
      return {
        command: this.options.windowsShell.shell,
        args: [...this.options.windowsShell.args],
        cwd: startInHome ? homedir() : location.path,
      };
    }

    const shell = process.env.SHELL || "/bin/bash";
    return {
      command: shell,
      args: ["-l"],
      cwd: startInHome ? homedir() : location.path,
    };
  }

  private resolveLogPath(threadId: string): string {
    return join(this.options.logsDir, `${threadId}.log`);
  }

  private resolveHintLogPath(threadId: string): string {
    return join(this.options.logsDir, `${threadId}.hints.log`);
  }

  private resolveAgentSettings(adapter: AgentAdapter): Record<string, boolean | string> {
    let settings = defaultSharedSettings;
    try {
      const raw = readFileSync(this.options.settingsPath, "utf8");
      settings = normalizeSharedSettings(JSON.parse(raw));
    } catch {
      // use defaults
    }
    return settings.agentSettings[adapter.kind] ?? {};
  }

  private launchOptionsWithAgentSettings(
    adapter: AgentAdapter,
    launchOptions?: AgentLaunchOptions,
  ): AgentLaunchOptions {
    return {
      ...(launchOptions ?? {}),
      agentSettings: this.resolveAgentSettings(adapter),
    };
  }

  private launchOptionsWithBrowserMcp(
    launchOptions: AgentLaunchOptions,
    browserMcp: BrowserMcpHttpConfig | undefined,
  ): AgentLaunchOptions {
    return {
      ...launchOptions,
      ...(browserMcp !== undefined ? { browserMcp } : {}),
    };
  }

  private isBrowserMcpEnabledForLaunch(
    adapter: AgentAdapter | undefined,
    config: ThreadConfig,
  ): boolean {
    if (config.browserMcp === true) return true;
    if (!adapter) return false;
    return this.resolveAgentSettings(adapter).browserMcp === true;
  }

  private async resolveBrowserMcpForLaunch(
    adapter: AgentAdapter,
    location: ProjectLocation,
    config: ThreadConfig,
  ): Promise<BrowserMcpHttpConfig | undefined> {
    const enabled = this.isBrowserMcpEnabledForLaunch(adapter, config);
    if (!enabled) return undefined;
    const cfg = await resolveBrowserMcpHttpConfigForLaunch(
      location,
      enabled,
      this.options.wslBridge,
    );
    return cfg;
  }

  private resolveAgentProcessEnv(adapter: AgentAdapter): Record<string, string> {
    const settingDefs = adapter.capabilities.settingDefs ?? [];
    if (settingDefs.length === 0) {
      return {};
    }

    const agentValues = this.resolveAgentSettings(adapter);
    const env: Record<string, string> = {};
    for (const definition of settingDefs) {
      if (definition.platforms && !definition.platforms.includes(process.platform)) {
        continue;
      }
      const value = agentValues[definition.key] ?? definition.default;
      if (definition.type === "toggle") {
        if (value) {
          Object.assign(env, definition.env);
        }
      } else if (definition.type === "select") {
        env[definition.envVar] = String(value);
      }
    }
    return env;
  }
}

function describeSpawnFailure(
  kind: "shell" | "agent",
  cmd: { command: string; args: string[]; cwd?: string },
  env: Record<string, string>,
  error: unknown,
): string {
  const base = error instanceof Error ? error.message : String(error);
  const prefix = `Failed to spawn ${kind} (${cmd.command})`;

  if (cmd.cwd) {
    const cwdDiagnosis = diagnoseCwd(cmd.cwd);
    if (cwdDiagnosis) return cwdDiagnosis;
  }

  if (cmd.command.startsWith("/")) {
    const binaryDiagnosis = diagnoseShellBinary(cmd.command);
    if (binaryDiagnosis) return binaryDiagnosis;
  } else {
    // node-pty surfaces a bare "posix_spawnp failed." for PATH-lookup misses.
    // Do the lookup ourselves against the env actually handed to the child so
    // the user sees whether the binary was missing vs found-but-unspawnable.
    const lookup = diagnoseRelativeBinary(cmd.command, env);
    if (lookup) return `${prefix}: ${lookup}`;
  }

  // posix_spawn returns E2BIG when env+argv exceed ARG_MAX (~256KB on macOS).
  const envBytes = measureEnvBytes(env);
  const argvBytes = measureArgvBytes(cmd.command, cmd.args);
  // Leave headroom — ARG_MAX includes pointer overhead and string terminators.
  if (envBytes + argvBytes > 200_000) {
    return `${prefix}: environment is too large (${Math.round((envBytes + argvBytes) / 1024)} KB). This usually means a parent process leaked variables into the launch env.`;
  }

  return `${prefix}: ${base}`;
}

function diagnoseRelativeBinary(command: string, env: Record<string, string>): string | undefined {
  const pathValue = env.PATH ?? "";
  const entries = pathValue.split(":").filter((entry) => entry.length > 0);
  for (const entry of entries) {
    const candidate = resolvePath(entry, command);
    try {
      const stat = statSync(candidate);
      if (stat.isFile() && (stat.mode & 0o111) !== 0) return undefined;
    } catch {
      // continue
    }
  }
  if (entries.length === 0) {
    return `'${command}' could not be resolved — PATH is empty.`;
  }
  return `'${command}' was not found on PATH (${entries.length} entries searched). Check that the binary is installed and visible to the app's environment.`;
}

function sanitizeEnv(source: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== "string") continue;
    // posix_spawn treats embedded NULs as terminators and rejects the env.
    if (value.indexOf("\0") !== -1) continue;
    out[key] = value;
  }
  return out;
}

// process.env is effectively static after supervisor boot — sanitize once
// instead of re-scanning ~150–300 entries on every startShell call.
const sanitizedProcessEnv = sanitizeEnv(process.env);

function measureEnvBytes(env: Record<string, string>): number {
  let total = 0;
  for (const [key, value] of Object.entries(env)) {
    total += Buffer.byteLength(key) + Buffer.byteLength(value) + 2; // '=' and NUL
  }
  return total;
}

function measureArgvBytes(command: string, args: readonly string[]): number {
  let total = Buffer.byteLength(command) + 1;
  for (const arg of args) {
    total += Buffer.byteLength(arg) + 1;
  }
  return total;
}

function diagnoseCwd(cwd: string): string | undefined {
  let stat;
  try {
    stat = statSync(cwd);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return `Cannot start shell: working directory does not exist (${cwd}).`;
    }
    if (code === "EACCES") {
      return `Cannot start shell: working directory is not accessible (${cwd}).`;
    }
    return `Cannot start shell: working directory (${cwd}) error: ${(err as Error).message}`;
  }
  if (!stat.isDirectory()) {
    return `Cannot start shell: working directory path is not a directory (${cwd}).`;
  }
  try {
    accessSync(cwd, fsConstants.X_OK | fsConstants.R_OK);
  } catch {
    return `Cannot start shell: working directory lacks read/execute permission (${cwd}).`;
  }
  return undefined;
}

function diagnoseShellBinary(command: string): string | undefined {
  if (!existsSync(command)) {
    return `Cannot start shell: ${command} not found. Check $SHELL.`;
  }
  let stat;
  try {
    stat = statSync(command);
  } catch {
    return undefined;
  }
  if (!stat.isFile()) {
    return `Cannot start shell: ${command} is not an executable file.`;
  }
  try {
    accessSync(command, fsConstants.X_OK);
  } catch {
    return `Cannot start shell: ${command} is not executable (no +x permission).`;
  }
  return undefined;
}
