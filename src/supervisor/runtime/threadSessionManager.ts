import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { spawn } from "node-pty";
import { defaultSharedSettings, normalizeSharedSettings } from "@/shared/settings";
import {
  type AgentKind,
  type ClearPendingSteerPayload,
  type AgentEventEnvelope,
  type CloseThreadPayload,
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
  type WriteTerminalPayload,
  type RuntimeEvent,
  areAgentSlashCommandsEqual,
  isThreadConfigEqual,
} from "@/shared/contracts";
import { buildPromptContentBlocks } from "@/shared/promptContent";
import {
  resolveBrowserMcpHttpConfigForLaunch,
  type BrowserMcpHttpConfig,
} from "@/supervisor/agents/browserMcp";
import {
  resolveSubagentMcpHttpConfigForLaunch,
  type SubagentMcpHttpConfig,
} from "@/supervisor/agents/subagentMcp";
import {
  type AgentAdapter,
  type AgentLaunchOptions,
  type CommandSpec,
  type StructuredSessionHandle,
  type ThreadHistory,
  createKnownSessionRef,
  defaultFormatPromptSegments,
  getRefreshedWindowsPath,
  injectWslEnv,
  primeProjectShellEnv,
  resolveLaunchSpec,
} from "../agents/base";
import { captureSupervisorException } from "../diagnostics/sentry";
import { ensureNodePtySpawnHelperExecutable } from "../nodePty";
import { BufferedLogWriter } from "./bufferedLogWriter";
import type { QueuedStructuredTurn, SessionRuntime, ShellSessionRuntime } from "./sessionTypes";
import { ThreadOutputPipeline, resolveThreadStatusSource } from "./threadOutputPipeline";
import { rewriteSegmentsForWorkspace, rewriteSegmentsForWsl } from "./threadAttachments";

import {
  isInterruptibleBusyStatus,
  isUserInterruptKeystroke,
  USER_INTERRUPT_RECOVERY_GRACE_MS,
} from "./threadSession/userInterrupt";
import { writeSubmittedPrompt } from "./threadSession/promptWrite";
import { getIterm2StatusL2TerminalEnv, resolveTerminalColorEnv } from "./threadSession/terminalEnv";
import {
  requireSessionPty,
  shouldPrimeNativeProjectShellEnv,
  shouldReleaseInitialStructuredIdleSuppression,
} from "./threadSession/helpers";
import { RuntimeEventRouter } from "./threadSession/runtimeEventRouter";
import type { ThreadSessionManagerOptions } from "./threadSession/managerOptions";
import { PtyLifecycle } from "./threadSession/ptyLifecycle";
import {
  describeSpawnFailure,
  sanitizeEnv,
  sanitizedProcessEnv,
} from "./threadSession/spawnDiagnostics";
import {
  applyClaudeMergedSettingsRewrite,
  mergeCliHookExtraArgs,
} from "./threadSession/cliHookArgs";
import { CliHookSessionCoordinator } from "./threadSession/cliHookPlugin";
import { StructuredInterruptWatchdog } from "./threadSession/structuredInterruptWatchdog";
import {
  SteerCoordinator,
  clearPendingSteerSlot,
  isSteerDrainableStatus,
} from "./threadSession/steerCoordinator";
import { buildShellCommand } from "./threadSession/shellCommand";

export { isUserInterruptKeystroke, USER_INTERRUPT_RECOVERY_GRACE_MS, writeSubmittedPrompt };
export type { ThreadSessionManagerOptions };

export class ThreadSessionManager {
  readonly sessions = new Map<string, SessionRuntime>();
  readonly shellSessions = new Map<string, ShellSessionRuntime>();
  /** Reverse index: agent-native session id → SessionRuntime, for CLI hook routing fallback. */
  readonly sessionsBySessionId = new Map<string, SessionRuntime>();
  private readonly startLocks = new Map<string, Promise<void>>();
  private readonly pendingStartInterrupts = new Set<string>();
  private readonly pendingStartAborts = new Set<string>();
  private readonly ptyLifecycle = new PtyLifecycle();
  private readonly logWriter = new BufferedLogWriter();
  private readonly outputPipeline: ThreadOutputPipeline;
  private readonly runtimeEventRouter: RuntimeEventRouter;
  private readonly steerCoordinator: SteerCoordinator;
  private readonly structuredInterruptWatchdog: StructuredInterruptWatchdog;
  private readonly cliHookPlugin: CliHookSessionCoordinator;
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
    // Construct the watchdog first: it drains the pending-steer slot via the
    // free `clearPendingSteerSlot` (no back-reference to SteerCoordinator), so
    // SteerCoordinator can then take the concrete watchdog instance without a
    // mutual lazy dependency or construction-order fragility.
    this.structuredInterruptWatchdog = new StructuredInterruptWatchdog({
      sessions: this.sessions,
      isDisposed: () => this.disposed,
      clearPendingSteerSlot: (session) => clearPendingSteerSlot(session, options.emit),
      failStructuredSession: (session, error) => this.failStructuredSession(session, error),
    });
    this.steerCoordinator = new SteerCoordinator({
      emit: options.emit,
      sessions: this.sessions,
      interruptStructuredTurn: (session) =>
        this.structuredInterruptWatchdog.interruptStructuredTurn(session),
      startStructuredTurn: (session, turn) => this.startStructuredTurn(session, turn),
      failStructuredSession: (session, error) => this.failStructuredSession(session, error),
    });
    this.cliHookPlugin = new CliHookSessionCoordinator({
      sessions: this.sessions,
      sessionsBySessionId: this.sessionsBySessionId,
      options: this.options,
      outputPipeline: this.outputPipeline,
      indexSessionRef: (session, prevId) => this.indexSessionRef(session, prevId),
      isBrowserMcpEnabledForLaunch: (adapter, config) =>
        this.isBrowserMcpEnabledForLaunch(adapter, config),
    });
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
      threadStatusSource: resolveThreadStatusSource(
        session,
        this.options.readDisableCliHookPlugin(),
      ),
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
   * Subagent host hook: resolve a live parent thread's project location + config
   * so a spawned child can inherit them. Returns undefined once the thread is
   * gone. Consumed by {@link SubagentRunManager}.
   */
  getSubagentParentContext(
    threadId: string,
  ): { projectLocation: ProjectLocation; config: ThreadConfig } | undefined {
    const session = this.sessions.get(threadId);
    if (!session) return undefined;
    return { projectLocation: session.projectLocation, config: session.config };
  }

  /**
   * Subagent host hook: append a (already re-tagged) child runtime event into a
   * parent thread's event stream. Dropped if the parent thread is no longer
   * live. Consumed by {@link SubagentRunManager}.
   */
  appendSubagentRuntimeEvent(parentThreadId: string, event: RuntimeEvent): void {
    if (!this.sessions.has(parentThreadId)) return;
    this.runtimeEventRouter.append(parentThreadId, event);
  }

  /**
   * Orchestrator host hook: a thread's live runtime state plus whether its
   * session supports non-interrupting steer. `undefined` once the session is
   * gone. Consumed by the subagents MCP orchestrator lane.
   */
  getOrchestratorThreadState(threadId: string):
    | {
        status: import("@/shared/contracts").ThreadStatus;
        attention: import("@/shared/contracts").ThreadAttention;
        config: ThreadConfig;
        supportsSteer: boolean;
      }
    | undefined {
    const session = this.sessions.get(threadId);
    if (!session) return undefined;
    return {
      status: session.status,
      attention: session.attention,
      config: session.config,
      supportsSteer: Boolean(session.structuredSession?.steerTurn),
    };
  }

  /**
   * Orchestrator host hook: read a thread's provider transcript when its
   * session's adapter supports `readThread`; `undefined` otherwise.
   */
  async readThreadHistory(threadId: string): Promise<ThreadHistory | undefined> {
    const session = this.sessions.get(threadId);
    if (!session?.structuredSession?.readThread) return undefined;
    return await session.structuredSession.readThread();
  }

  /**
   * Renderer-facing: subscribe a sub-agent overlay. Returns the buffered
   * child-event history so the renderer can hydrate the overlay; subsequent
   * child events stream live via the regular runtime-event channels.
   */
  subagentSubscribe(payload: { threadId: string; parentItemId: string }): {
    history: RuntimeEvent[];
  } {
    return {
      history: this.runtimeEventRouter.subscribe(payload.threadId, payload.parentItemId),
    };
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

  /**
   * Look up the live `SessionRuntime` for a CLI hook plugin envelope. Routing
   * precedence is `threadId` (PTY env, primary) → `sessionId`
   * (`providerSessionId` discovered after spawn, fallback for nested shells).
   */
  findSessionForCliHookPlugin(input: {
    threadId?: string;
    sessionId?: string;
  }): SessionRuntime | undefined {
    return this.cliHookPlugin.findSessionForCliHookPlugin(input);
  }

  /** Apply a CLI hook plugin state change resolved by the dispatcher. */
  applyCliHookPluginState(
    session: SessionRuntime,
    change: {
      status: import("@/shared/contracts").ThreadStatus;
      attention: import("@/shared/contracts").ThreadAttention;
    },
  ): void {
    this.cliHookPlugin.applyCliHookPluginState(session, change);
  }

  /** Mark hook ownership for routed bookkeeping events that do not carry state. */
  noteCliHookPluginActivity(session: SessionRuntime, envelope?: AgentEventEnvelope): void {
    this.cliHookPlugin.noteCliHookPluginActivity(session, envelope);
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
        // Capability-based: sessions that support non-interrupting steer enqueue
        // the message onto the running turn (subagents survive); others fall
        // back to the interrupt-drain pending-steer path.
        if (session.structuredSession.steerTurn) {
          this.steerCoordinator.steerStructuredTurn(session, turn);
          return;
        }
        this.steerCoordinator.stagePendingSteer(session, turn);
        this.steerCoordinator.fireSteerInterrupt(session);
        return;
      }
      if (session.presentationMode === "gui" && session.pendingSteer !== undefined) {
        // Drain in progress (cancel acked, slot still set). Replace it; the
        // existing drain-on-idle hook will pick up the new content.
        this.steerCoordinator.stagePendingSteer(session, turn);
        this.steerCoordinator.maybeDrainPendingSteer(session);
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
    this.options.subagentMcp?.cancelAll(payload.threadId);
    await this.structuredInterruptWatchdog.interruptStructuredTurn(session);
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
   * Stage the user's steer message and fire the cancel notification. The
   * renderer calls this when submit-while-working happens on a GUI thread.
   * Drain is automatic on cancelled-stopReason via `maybeDrainPendingSteer`.
   */
  async setPendingSteer(payload: SetPendingSteerPayload): Promise<void> {
    const session = this.requireSession(payload.threadId);
    await this.steerCoordinator.setPendingSteer(session, payload);
  }

  /**
   * User aborted the steer (clicked the X on the strip). Clear the slot
   * without firing a new prompt. The cancel notification we already sent
   * still completes — the agent just stops without a replacement.
   */
  async clearPendingSteer(payload: ClearPendingSteerPayload): Promise<void> {
    const session = this.requireSession(payload.threadId);
    this.steerCoordinator.clearPendingSteerSlot(session);
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
      this.ptyLifecycle.killShell(shell);
      await this.ptyLifecycle.waitForExit(shell);
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
    this.runtimeEventRouter.clearAllForThread(payload.threadId);
    this.options.subagentMcp?.cancelAll(payload.threadId);
    this.options.subagentMcp?.unregister(payload.threadId);
    await existing.structuredSession?.dispose();
    if (existing.structuredSession) {
      await sleep(150);
    }
    this.ptyLifecycle.kill(existing);
    await this.ptyLifecycle.waitForExit(existing);
  }

  async startShell(payload: StartShellPayload): Promise<void> {
    ensureNodePtySpawnHelperExecutable();
    const existing = this.shellSessions.get(payload.shellId);
    if (existing) {
      existing.ignoreExit = true;
      this.shellSessions.delete(payload.shellId);
      this.ptyLifecycle.killShell(existing);
    }

    // Capture project-scoped shell env (fnm / nvm / asdf / mise cd-hooks
    // fire when the prime probe runs inside the project root) so the
    // user's pinned Node/Python/Ruby are on PATH before the PTY spawns.
    if (shouldPrimeNativeProjectShellEnv(payload.projectLocation)) {
      await primeProjectShellEnv(payload.projectLocation.path);
    }

    const shellCommand = buildShellCommand(payload.projectLocation, this.options.windowsShell, {
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
    this.ptyLifecycle.track(session);
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
      this.ptyLifecycle.resolveExit(session);
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
    // Forwarded subagent requests carry a run-namespaced id; route them to the
    // owning child handle first and only fall through to the parent session
    // when the id isn't a subagent request.
    if (this.options.subagentMcp?.resolveChildRequest(payload.requestId, payload.response)) {
      return;
    }
    const session = this.requireSession(payload.threadId);
    if (!session.structuredSession?.resolveServerRequest) {
      throw new Error(`Thread ${payload.threadId} does not support server request resolution.`);
    }
    await session.structuredSession.resolveServerRequest(payload.requestId, payload.response);
  }

  readTerminalScrollback(threadId: string): string {
    return this.outputPipeline.readTerminalScrollback(this.sessions.get(threadId));
  }

  readTerminalSize(threadId: string): TerminalSize | null {
    return this.sessions.get(threadId)?.terminalSize ?? null;
  }

  handlePtyDataForTests(session: SessionRuntime, data: string): void {
    this.outputPipeline.handlePtyData(session, data);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    for (const threadId of this.startLocks.keys()) {
      this.pendingStartAborts.add(threadId);
    }

    this.runtimeEventRouter.flush();
    await Promise.allSettled(
      [...this.sessions.values()].map(async (session) => {
        session.ignoreExit = true;
        this.outputPipeline.clearSessionTimers(session);
        await session.structuredSession?.dispose();
        this.ptyLifecycle.kill(session);
      }),
    );
    this.sessions.clear();
    this.sessionsBySessionId.clear();

    for (const shell of this.shellSessions.values()) {
      shell.ignoreExit = true;
      this.ptyLifecycle.killShell(shell);
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
    const subagentMcp = await this.resolveSubagentMcpForLaunch(
      payload.threadId,
      payload.projectLocation,
      payload.config,
    );
    const structuredSession = await this.createStructuredSession(
      adapter,
      payload.threadId,
      payload.agentKind,
      payload.projectLocation,
      payload.config,
      browserMcp,
      subagentMcp,
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
    const launchOptionsWithMcp = this.launchOptionsWithSubagentMcp(
      this.launchOptionsWithBrowserMcp(launchOptions, browserMcp),
      subagentMcp,
    );
    const argv = payload.sessionRef
      ? adapter.buildResumeArgv(
          payload.projectLocation,
          payload.config,
          launchPrompt,
          payload.sessionRef,
          launchOptionsWithMcp,
        )
      : adapter.buildLaunchArgv(
          payload.projectLocation,
          payload.config,
          launchPrompt,
          payload.sessionRef,
          launchOptionsWithMcp,
        );

    // Append CLI hook plugin args (e.g. Claude `--settings <path>`); env vars
    // (`LIGHTCODE_HOOK_URL`, `LIGHTCODE_HOOK_SECRET`, `LIGHTCODE_THREAD_ID`,
    // `LIGHTCODE_AGENT_KIND`, `LIGHTCODE_HOOK_PROTOCOL_VERSION`) flow through
    // `spawnThread` → `agentEnv` so they end up in the PTY env on every
    // platform (WSL, win32, posix). Failure to resolve plugin extras silently
    // degrades to L2 — the supervisor must never block thread creation on
    // the hook-plugin plumbing.
    const cliHookExtras = await this.cliHookPlugin.resolveCliHookPluginExtras(
      payload.threadId,
      payload.agentKind,
      payload.projectLocation,
      payload.config,
      browserMcp,
    );
    if (cliHookExtras.extraArgs.length > 0) {
      argv.args = mergeCliHookExtraArgs(
        adapter,
        argv.args,
        cliHookExtras.extraArgs,
        launchPrompt,
        payload.sessionRef,
      );
    }
    argv.args = await applyClaudeMergedSettingsRewrite(
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
    subagentMcp: SubagentMcpHttpConfig | undefined,
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
        ...(subagentMcp ? { subagentMcp } : {}),
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
        disableCliHookPlugin: this.options.readDisableCliHookPlugin(),
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
      this.ptyLifecycle.track(session);
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
        this.runtimeEventRouter.flush();

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
          this.structuredInterruptWatchdog.clearStructuredInterruptWatchdog(session);
        } else {
          // Still working but the agent showed a sign of life — restart the
          // stale-kill clock so a healthy long-running cancel is not killed.
          this.structuredInterruptWatchdog.touchStructuredInterruptWatchdog(session);
        }
        if (
          session.presentationMode === "gui" &&
          (wasWorking || hadInterruptRequest) &&
          isSteerDrainableStatus(update.status)
        ) {
          this.steerCoordinator.maybeDrainPendingSteer(session);
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
        this.structuredInterruptWatchdog.touchStructuredInterruptWatchdog(session);
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
      this.ptyLifecycle.resolveExit(session);
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
    this.runtimeEventRouter.clearAllForThread(session.threadId);
    await session.structuredSession?.dispose();
    if (session.structuredSession) {
      await sleep(150);
    }
    this.ptyLifecycle.kill(session);
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
    const subagentMcp = await this.resolveSubagentMcpForLaunch(
      session.threadId,
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
      subagentMcp,
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
    const cliHookExtras = await this.cliHookPlugin.resolveCliHookPluginExtras(
      session.threadId,
      session.agentKind,
      session.projectLocation,
      config,
      browserMcp,
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
      this.launchOptionsWithSubagentMcp(
        this.launchOptionsWithBrowserMcp(
          this.launchOptionsWithAgentSettings(session.adapter, structuredSession?.launchOptions),
          browserMcp,
        ),
        subagentMcp,
      ),
    );
    if (cliHookExtras.extraArgs.length > 0) {
      argv.args = mergeCliHookExtraArgs(
        session.adapter,
        argv.args,
        cliHookExtras.extraArgs,
        launchPrompt,
        session.sessionRef,
      );
    }
    argv.args = await applyClaudeMergedSettingsRewrite(
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
      this.ptyLifecycle.kill(session);

      if (this.sessions.get(session.threadId)?.instanceId !== session.instanceId) {
        return;
      }

      const browserMcp = await this.resolveBrowserMcpForLaunch(
        session.adapter,
        session.projectLocation,
        session.config,
      );
      const subagentMcp = await this.resolveSubagentMcpForLaunch(
        session.threadId,
        session.projectLocation,
        session.config,
      );
      const cliHookExtras = await this.cliHookPlugin.resolveCliHookPluginExtras(
        session.threadId,
        session.agentKind,
        session.projectLocation,
        session.config,
        browserMcp,
      );
      if (!this.isCurrentSession(session)) {
        return;
      }
      const argv = session.adapter.buildLaunchArgv(
        session.projectLocation,
        session.config,
        session.launchPrompt,
        undefined,
        this.launchOptionsWithSubagentMcp(
          this.launchOptionsWithBrowserMcp(
            this.launchOptionsWithAgentSettings(session.adapter),
            browserMcp,
          ),
          subagentMcp,
        ),
      );
      if (cliHookExtras.extraArgs.length > 0) {
        argv.args = mergeCliHookExtraArgs(
          session.adapter,
          argv.args,
          cliHookExtras.extraArgs,
          session.launchPrompt,
        );
      }
      argv.args = await applyClaudeMergedSettingsRewrite(
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
    setTimeout(() => this.ptyLifecycle.kill(session), 150);
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

  private launchOptionsWithSubagentMcp(
    launchOptions: AgentLaunchOptions,
    subagentMcp: SubagentMcpHttpConfig | undefined,
  ): AgentLaunchOptions {
    return {
      ...launchOptions,
      ...(subagentMcp !== undefined ? { subagentMcp } : {}),
    };
  }

  /**
   * Resolve the subagents MCP http config for a launch when the thread opted
   * in (`config.subagentMcp === true`). Registers the thread with the ingress
   * (idempotent — reuses an existing token), then rewrites the loopback URL to
   * the WSL → host gateway IP for NAT-mode WSL projects (mirrored-mode WSL and
   * native projects pass through unchanged). Parallel to
   * `resolveBrowserMcpForLaunch`.
   */
  private async resolveSubagentMcpForLaunch(
    threadId: string,
    location: ProjectLocation,
    config: ThreadConfig,
  ): Promise<SubagentMcpHttpConfig | undefined> {
    if (config.subagentMcp !== true) return undefined;
    const native = this.options.subagentMcp?.register(threadId);
    return resolveSubagentMcpHttpConfigForLaunch(
      native,
      location,
      this.options.subagentMcpHostAccess,
    );
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
