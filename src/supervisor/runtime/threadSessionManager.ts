import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { spawn } from "node-pty";
import type { McpThreadIdentity } from "@/shared/browserMcpThread";
import {
  type ClearPendingSteerPayload,
  type ControlThreadGoalPayload,
  type AgentEventEnvelope,
  type AgentKind,
  type CloseThreadPayload,
  type PromptSegment,
  type ProjectLocation,
  type ResizeTerminalPayload,
  type ReloadAgentMcpServersPayload,
  type ResolveThreadServerRequestPayload,
  type RollbackThreadConversationPayload,
  type SendThreadInputPayload,
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
  type McpLaunchSnapshot,
  type ResolvedMcpServer,
} from "@/shared/contracts";
import {
  type AgentAdapter,
  createKnownSessionRef,
  defaultFormatPromptSegments,
  getRefreshedWindowsPath,
  primeProjectShellEnv,
  resolveLaunchSpec,
} from "../agents/base";
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
import { resolveTerminalColorEnv } from "./threadSession/terminalEnv";
import { requireSessionPty, shouldPrimeNativeProjectShellEnv } from "./threadSession/helpers";
import { RuntimeEventRouter } from "./threadSession/runtimeEventRouter";
import { SessionRuntimeLifecycle } from "./threadSession/sessionRuntimeLifecycle";
import type { ThreadSessionManagerOptions } from "./threadSession/managerOptions";
import { PtyLifecycle } from "./threadSession/ptyLifecycle";
import { describeSpawnFailure, sanitizedProcessEnv } from "./threadSession/spawnDiagnostics";
import { CliHookSessionCoordinator } from "./threadSession/cliHookPlugin";
import { InvalidSessionRecoveryCoordinator } from "./threadSession/invalidSessionRecovery";
import { StructuredInterruptWatchdog } from "./threadSession/structuredInterruptWatchdog";
import { SteerCoordinator, clearPendingSteerSlot } from "./threadSession/steerCoordinator";
import { buildShellCommand } from "./threadSession/shellCommand";
import {
  SpawnPipeline,
  effectiveLaunchConfig,
  type SpawnThreadInput,
} from "./threadSession/spawnPipeline";
import { StructuredTurnQueue } from "./threadSession/structuredTurnQueue";
import { StructuredFailureReporter } from "./threadSession/structuredFailureReporter";
import { readSupervisorSharedSettings } from "./supervisorSharedSettings";

export { isUserInterruptKeystroke, USER_INTERRUPT_RECOVERY_GRACE_MS, writeSubmittedPrompt };
export type { ThreadSessionManagerOptions };

const RECENTLY_REMOVED_THREAD_LIMIT = 256;

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
  private readonly spawnPipeline: SpawnPipeline;
  private readonly invalidSessionRecovery: InvalidSessionRecoveryCoordinator;
  private readonly structuredTurnQueue: StructuredTurnQueue;
  private readonly structuredFailureReporter = new StructuredFailureReporter();
  private readonly recentlyRemovedThreadIds = new Set<string>();
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
      onStartQueuedLaunchPrompt: (session) =>
        this.structuredTurnQueue.startQueuedLaunchPrompt(session),
      onStartSessionRefDiscovery: (session) => this.pollSessionRefDiscovery(session),
    });
    // Construct the watchdog first: it drains the pending-steer slot via the
    // free `clearPendingSteerSlot` (no back-reference to SteerCoordinator), so
    // SteerCoordinator can then take the concrete watchdog instance without a
    // mutual lazy dependency or construction-order fragility.
    this.structuredInterruptWatchdog = new StructuredInterruptWatchdog({
      sessions: this.sessions,
      isDisposed: () => this.disposed,
      completeForcedInterrupt: (session) => this.completeForcedStructuredInterrupt(session),
    });
    this.structuredTurnQueue = new StructuredTurnQueue({
      emit: options.emit,
      sessions: this.sessions,
      beginFailureEpisode: (session) => this.structuredFailureReporter.beginEpisode(session),
      failStructuredSession: (session, error) => this.failStructuredSession(session, error),
    });
    this.steerCoordinator = new SteerCoordinator({
      emit: options.emit,
      sessions: this.sessions,
      interruptStructuredTurn: (session) =>
        this.structuredInterruptWatchdog.interruptStructuredTurn(session),
      startStructuredTurn: (session, turn) => this.structuredTurnQueue.start(session, turn),
      failStructuredSession: (session, error) => this.failStructuredSession(session, error),
      resolveSkillTurnInjection: (session, segments) =>
        this.resolveSkillTurnInjection(session, segments),
    });
    this.cliHookPlugin = new CliHookSessionCoordinator({
      sessions: this.sessions,
      sessionsBySessionId: this.sessionsBySessionId,
      options: this.options,
      outputPipeline: this.outputPipeline,
      indexSessionRef: (session, prevId) => this.indexSessionRef(session, prevId),
    });
    const sessionRuntimeLifecycle = new SessionRuntimeLifecycle({
      sessions: this.sessions,
      sessionsBySessionId: this.sessionsBySessionId,
      ptyLifecycle: this.ptyLifecycle,
      outputPipeline: this.outputPipeline,
      runtimeEventRouter: this.runtimeEventRouter,
      steerCoordinator: this.steerCoordinator,
      structuredInterruptWatchdog: this.structuredInterruptWatchdog,
      emit: this.options.emit,
      isCurrentSession: (session) => this.isCurrentSession(session),
      failStructuredSession: (session, error) => this.failStructuredSession(session, error),
      indexSessionRef: (session, prevId) => this.indexSessionRef(session, prevId),
      pollSessionRefDiscovery: (session) => this.pollSessionRefDiscovery(session),
    });
    this.spawnPipeline = new SpawnPipeline({
      options: this.options,
      sessions: this.sessions,
      pendingStartInterrupts: this.pendingStartInterrupts,
      pendingStartAborts: this.pendingStartAborts,
      ptyLifecycle: this.ptyLifecycle,
      outputPipeline: this.outputPipeline,
      runtimeEventRouter: this.runtimeEventRouter,
      sessionRuntimeLifecycle,
      cliHookPlugin: this.cliHookPlugin,
      closeThread: (payload) => this.closeThread(payload),
      failStructuredSession: (session, error) => this.failStructuredSession(session, error),
      isCurrentSession: (session) => this.isCurrentSession(session),
      resolveAgentSettings: (adapter) => this.resolveAgentSettings(adapter),
      emitOptimisticUserMessage: (threadId, prompt, segments, requestedItemId) =>
        this.structuredTurnQueue.emitOptimisticUserMessage(
          threadId,
          prompt,
          segments,
          requestedItemId,
        ),
    });
    this.invalidSessionRecovery = new InvalidSessionRecoveryCoordinator({
      spawnPipeline: this.spawnPipeline,
      cliHookPlugin: this.cliHookPlugin,
      outputPipeline: this.outputPipeline,
      ptyLifecycle: this.ptyLifecycle,
      isCurrentSession: (session) => this.isCurrentSession(session),
      failStructuredSession: (session, error) => this.failStructuredSession(session, error),
      settleAfterStructuredDispose: () => sleep(150),
      primeProjectShellEnv,
      resolveLaunchSpec,
    });
  }

  /**
   * Resolve a provider-native root or child session to its live Poracode
   * thread. Root ids use the reverse index; provider-owned child sessions can
   * opt into the fallback through `ownsProviderSession`.
   */
  getThreadIdByProviderSessionId(providerSessionId: string): string | undefined {
    const indexed = this.sessionsBySessionId.get(providerSessionId);
    if (indexed?.adapter.capabilities.crossagentMcpRouting === "provider-session") {
      return indexed.threadId;
    }

    for (const session of this.sessions.values()) {
      if (session.adapter.capabilities.crossagentMcpRouting !== "provider-session") continue;
      if (session.sessionRef?.providerSessionId === providerSessionId) {
        this.sessionsBySessionId.set(providerSessionId, session);
        return session.threadId;
      }
      if (session.structuredSession?.ownsProviderSession?.(providerSessionId)) {
        return session.threadId;
      }
    }
    return undefined;
  }

  getThreadSnapshots(): ThreadRuntimeSnapshot[] {
    return [...this.sessions.values()].map((session) => ({
      threadId: session.threadId,
      status: session.status,
      attention: session.attention,
      config: session.config,
      ...(session.launchConfig ? { launchConfig: session.launchConfig } : {}),
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
    this.structuredFailureReporter.capture(session, error);
    const message = error instanceof Error ? error.message : String(error);
    this.outputPipeline.updateState(session, "error", "error", message);
    this.enqueueRuntimeEvent(session.threadId, {
      type: "error",
      threadId: session.threadId,
      message,
    });
  }

  private completeForcedStructuredInterrupt(session: SessionRuntime): void {
    this.runtimeEventRouter.flush();
    this.outputPipeline.updateState(session, "idle", "none", undefined, {
      forceCloseActiveTurn: true,
    });

    // A force-stopped explicit Stop stays idle until the user's next submit.
    // A force-stopped steer is different: the submitted message is still an
    // accepted user action and must survive the dead provider process. Paint
    // it before clearing the strip, then resume the session and send it with
    // the same item id so the replacement session cannot duplicate it.
    const pending = session.pendingSteer;
    if (!pending) return;
    const userMessageItemId = this.structuredTurnQueue.emitOptimisticUserMessage(
      session.threadId,
      pending.prompt,
      pending.segments,
      pending.userMessageItemId,
    );
    const turn: QueuedStructuredTurn = { ...pending, userMessageItemId };
    clearPendingSteerSlot(session, this.options.emit);
    void this.spawnPipeline.restartThread(session, turn).catch((error) => {
      if (!this.isCurrentSession(session)) return;
      this.failStructuredSession(session, error);
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
  getSubagentParentContext(threadId: string):
    | {
        projectLocation: ProjectLocation;
        config: ThreadConfig;
        mcpLaunchSnapshot: McpLaunchSnapshot;
      }
    | undefined {
    const session = this.sessions.get(threadId);
    if (!session) return undefined;
    // Children inherit the effective launch config with built-in disables applied.
    const disabledIds = session.mcpLaunchSnapshot.disabledBuiltInMcpServerIds;
    const effectiveConfig = effectiveLaunchConfig(
      session.config,
      disabledIds,
      session.mcpLaunchSnapshot.pluginBuiltInMcpServerIds,
    );
    return {
      projectLocation: session.projectLocation,
      config: effectiveConfig,
      mcpLaunchSnapshot: session.mcpLaunchSnapshot,
    };
  }

  /** Resolve the parent's enabled MCP access for an ephemeral structured child. */
  async resolveSubagentParentMcpAccess(
    threadId: string,
    identity: McpThreadIdentity,
    targetAgentKind: AgentKind,
  ): Promise<{ mcpServers?: ResolvedMcpServer[] }> {
    const session = this.sessions.get(threadId);
    if (!session) return {};
    const targetAdapter = this.options.adapters.get(targetAgentKind);
    if (!targetAdapter) return {};
    const mcpLaunchSnapshot = session.mcpLaunchSnapshot;
    const launchConfig = effectiveLaunchConfig(
      session.config,
      mcpLaunchSnapshot.disabledBuiltInMcpServerIds,
      mcpLaunchSnapshot.pluginBuiltInMcpServerIds,
    );
    const mcpServers = await this.spawnPipeline.resolveMcpServersForLaunch({
      location: session.projectLocation,
      config: launchConfig,
      mcpLaunchSnapshot,
      identity,
      adapter: targetAdapter,
    });
    return mcpServers.length > 0 || targetAdapter.capabilities.mcpConfigSource === "agentSettings"
      ? { mcpServers }
      : {};
  }

  /**
   * Apply a provider-level MCP settings change (the provider settings page's
   * Save) to the provider's live sessions. Only meaningful for adapters that
   * declare `mcpConfigSource: "agentSettings"` — their MCP set is re-resolved
   * from the freshly saved settings and each structured session that exposes
   * `updateMcpServers` applies the new set to its directory instance. Terminal
   * threads and sessions without the hook pick the change up on next launch.
   * Per-session failures are logged, never fatal: one broken directory update
   * must not strand the remaining sessions on the old set.
   */
  async reloadAgentMcpServers(payload: ReloadAgentMcpServersPayload): Promise<void> {
    const reloads: Promise<void>[] = [];
    for (const session of this.sessions.values()) {
      if (session.agentKind !== payload.agentKind) continue;
      if (session.adapter.capabilities.mcpConfigSource !== "agentSettings") continue;
      const update = session.structuredSession?.updateMcpServers?.bind(session.structuredSession);
      if (!update) continue;
      reloads.push(
        (async () => {
          try {
            const launchConfig = effectiveLaunchConfig(
              session.config,
              session.mcpLaunchSnapshot.disabledBuiltInMcpServerIds,
              session.mcpLaunchSnapshot.pluginBuiltInMcpServerIds,
            );
            const mcpServers = await this.spawnPipeline.resolveMcpServersForLaunch({
              location: session.projectLocation,
              config: launchConfig,
              mcpLaunchSnapshot: session.mcpLaunchSnapshot,
              crossagentThreadId: session.threadId,
              adapter: session.adapter,
            });
            await update(mcpServers);
          } catch (error) {
            console.warn(
              `[supervisor] failed to reload MCP servers for thread ${session.threadId}:`,
              error,
            );
          }
        })(),
      );
    }
    await Promise.all(reloads);
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
   * Renderer-facing: subscribe a sub-agent overlay. Buffered child history is
   * replayed onto the normal runtime event stream (persisted + broadcast to WS
   * clients); subsequent child events continue on that same stream. The RPC
   * returns `history: []` — the field remains for backward compatibility with
   * older clients/hosts that still deliver drained buffer events in the body.
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
    this.recentlyRemovedThreadIds.delete(threadId);

    const run = this.spawnPipeline.startThreadInner({ ...payload, threadId });
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
    const session = this.sessions.get(payload.threadId);
    if (!session) {
      if (this.recentlyRemovedThreadIds.has(payload.threadId)) return;
      throw new Error(`Unknown thread session: ${payload.threadId}`);
    }
    if (session.status === "inactive" && !session.sessionRef) {
      throw new Error("This thread exited before a resumable session id was discovered.");
    }
    const usesStructuredFlow =
      session.adapter.capabilities.liveInputMode === "server" || session.presentationMode === "gui";
    const wslSegments = payload.segments
      ? await rewriteSegmentsForWsl(payload.segments, session.projectLocation, {
          preserveImageAttachments: usesStructuredFlow,
          preservePdfAttachments:
            usesStructuredFlow && session.adapter.capabilities.readsPdfAttachmentsFromHost === true,
        })
      : undefined;
    const effectiveSegments = await this.filterPluginSkillSegments(session, wslSegments);
    const prompt = this.formatSegmentsForPrompt(session, effectiveSegments, payload.prompt);

    const effectiveConfig =
      session.presentationMode !== "gui" &&
      payload.config.mode === "plan" &&
      session.config.mode === undefined
        ? { ...payload.config, mode: undefined }
        : payload.config;

    session.config = effectiveConfig;
    const inlineInstructions = usesStructuredFlow
      ? await this.resolveSkillTurnInjection(session, effectiveSegments)
      : undefined;
    const turn: QueuedStructuredTurn = {
      prompt,
      config: effectiveConfig,
      ...(effectiveSegments ? { segments: effectiveSegments } : {}),
      ...(payload.userMessageItemId ? { userMessageItemId: payload.userMessageItemId } : {}),
      ...(inlineInstructions ? { inlineInstructions } : {}),
    };
    if (session.status === "inactive") {
      // Guaranteed to have a sessionRef here — the no-ref case threw above.
      await this.spawnPipeline.restartThread(session, turn);
      return;
    }
    if (
      usesStructuredFlow &&
      !session.structuredSession &&
      (session.status === "error" || session.status === "idle") &&
      session.sessionRef
    ) {
      await this.spawnPipeline.restartThread(session, turn);
      return;
    }
    // Route through the structured session when either the adapter is
    // server-controlled OR this thread was launched in chat mode (the
    // structured session owns input/output instead of the PTY).
    if (usesStructuredFlow && session.structuredSession?.startTurn) {
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
      this.structuredTurnQueue.start(session, turn);
      return;
    }

    const pty = requireSessionPty(session);
    // Terminal skills fallback: skill segments the CLI can't resolve natively
    // become short path-hint text before the prompt is typed into the PTY.
    const terminalSegments = await this.resolveTerminalSkillSegments(session, effectiveSegments);
    // Workspace-sandboxed agents (e.g. Command Code) can't read attachments that
    // live outside the project, so copy them in and re-format with the new paths.
    // localizeWorkspaceAttachments returns the same array when it's a no-op, so
    // reuse the already-formatted prompt unless paths actually changed.
    const ptySegments = await this.localizeWorkspaceAttachments(session, terminalSegments);
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
        this.rememberRemovedThread(payload.threadId);
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
      if (this.recentlyRemovedThreadIds.has(payload.threadId)) return;
      throw new Error(`Unknown thread session: ${payload.threadId}`);
    }
    this.options.crossagentMcp?.cancelForeground(payload.threadId);
    await this.structuredInterruptWatchdog.interruptStructuredTurn(session);
  }

  async controlThreadGoal(payload: ControlThreadGoalPayload): Promise<void> {
    const { threadId, ...control } = payload;
    const session = this.requireSession(threadId);
    if (session.structuredSession?.controlGoal) {
      await session.structuredSession.controlGoal(control);
      return;
    }
    const prompt = session.adapter.buildGoalControlPrompt?.(control);
    if (!prompt) throw new Error(`${session.adapter.label} does not support this goal control.`);
    await this.sendThreadInput({ threadId, prompt, config: session.config });
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
    const history = payload.config
      ? await session.structuredSession.rollbackThread(payload.numTurns, payload.config)
      : await session.structuredSession.rollbackThread(payload.numTurns);
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
    const session = this.sessions.get(payload.threadId);
    if (!session) {
      if (this.recentlyRemovedThreadIds.has(payload.threadId)) return;
      throw new Error(`Unknown thread session: ${payload.threadId}`);
    }
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
    const policySegments = await this.filterPluginSkillSegments(session, wslSegments);
    const effectiveSegments = await this.localizeWorkspaceAttachments(session, policySegments);
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

  /** Enforce current plugin skill policy before a segment reaches a provider. */
  private async filterPluginSkillSegments(
    session: SessionRuntime,
    segments: PromptSegment[] | undefined,
  ): Promise<PromptSegment[] | undefined> {
    if (!segments?.some((segment) => segment.kind === "skill")) return segments;
    return (
      (await this.options.filterPluginSkillSegments?.({
        agentKind: session.agentKind,
        projectLocation: session.projectLocation,
        ...(session.presentationMode
          ? { presentationMode: session.presentationMode }
          : { presentationMode: session.adapter.capabilities.presentationMode }),
        ...(session.nativePlugins ? { nativePlugins: session.nativePlugins } : {}),
        segments,
      })) ?? segments
    );
  }

  /** Portable-skills fallback for a structured turn (see managerOptions). */
  private async resolveSkillTurnInjection(
    session: SessionRuntime,
    segments: readonly PromptSegment[] | undefined,
  ): Promise<string | undefined> {
    if (!segments?.some((segment) => segment.kind === "skill")) return undefined;
    return this.options.buildSkillTurnInjection?.({
      agentKind: session.agentKind,
      projectLocation: session.projectLocation,
      ...(session.nativePlugins ? { nativePlugins: session.nativePlugins } : {}),
      segments,
    });
  }

  /** Portable-skills fallback for a terminal (PTY) prompt (see managerOptions).
   * Returns the input array unchanged when no rewrite applies, so callers can
   * cheaply detect "nothing changed" by identity. */
  private async resolveTerminalSkillSegments(
    session: SessionRuntime,
    segments: PromptSegment[] | undefined,
  ): Promise<PromptSegment[] | undefined> {
    if (!segments?.some((segment) => segment.kind === "skill")) return segments;
    return (
      (await this.options.rewriteTerminalSkillSegments?.({
        agentKind: session.agentKind,
        projectLocation: session.projectLocation,
        ...(session.nativePlugins ? { nativePlugins: session.nativePlugins } : {}),
        segments,
      })) ?? segments
    );
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
      this.ptyLifecycle.resize(shell, payload.cols, payload.rows);
      return;
    }
    const session = this.sessions.get(payload.threadId);
    if (!session) {
      return;
    }
    session.terminalSize = { cols: payload.cols, rows: payload.rows };
    this.ptyLifecycle.resize(session, payload.cols, payload.rows);
  }

  /**
   * Stage the user's steer message and fire the cancel notification. The
   * renderer calls this when submit-while-working happens on a GUI thread.
   * Drain is automatic on cancelled-stopReason via `maybeDrainPendingSteer`.
   */
  async setPendingSteer(payload: SetPendingSteerPayload): Promise<void> {
    const session = this.requireSession(payload.threadId);
    if (payload.segments === undefined) {
      await this.steerCoordinator.setPendingSteer(session, payload);
      return;
    }
    const segments = await this.filterPluginSkillSegments(session, payload.segments);
    await this.steerCoordinator.setPendingSteer(session, { ...payload, segments });
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

  async closeThread(payload: CloseThreadPayload): Promise<void> {
    const shell = this.shellSessions.get(payload.threadId);
    if (shell) {
      shell.ignoreExit = true;
      this.shellSessions.delete(payload.threadId);
      this.rememberRemovedThread(payload.threadId);
      this.ptyLifecycle.killShell(shell);
      await this.ptyLifecycle.waitForExit(shell);
      return;
    }

    const existing = this.sessions.get(payload.threadId);
    if (!existing) {
      if (this.startLocks.has(payload.threadId)) {
        this.pendingStartAborts.add(payload.threadId);
        this.rememberRemovedThread(payload.threadId);
      }
      return;
    }

    existing.ignoreExit = true;
    this.rememberRemovedThread(payload.threadId);
    this.outputPipeline.clearSessionTimers(existing);
    existing.stopSessionRefWatcher?.();
    existing.stopSessionRefWatcher = undefined;
    this.sessions.delete(payload.threadId);
    if (existing.sessionRef?.providerSessionId) {
      this.sessionsBySessionId.delete(existing.sessionRef.providerSessionId);
    }
    this.runtimeEventRouter.clearAllForThread(payload.threadId);
    this.options.crossagentMcp?.cancelAll(payload.threadId);
    this.options.crossagentMcp?.unregister(payload.threadId);
    await existing.structuredSession?.dispose();
    if (existing.structuredSession) {
      await sleep(150);
    }
    this.ptyLifecycle.kill(existing);
    await this.ptyLifecycle.waitForExit(existing);
  }

  async startShell(payload: StartShellPayload): Promise<void> {
    ensureNodePtySpawnHelperExecutable();
    this.recentlyRemovedThreadIds.delete(payload.shellId);
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
      this.rememberRemovedThread(payload.shellId);
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
    if (this.options.crossagentMcp?.resolveChildRequest(payload.requestId, payload.response)) {
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

  spawnThreadForTests(input: SpawnThreadInput): SessionRuntime {
    return this.spawnPipeline.spawnThread(input);
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
        this.rememberRemovedThread(session.threadId);
        this.outputPipeline.clearSessionTimers(session);
        await session.structuredSession?.dispose();
        this.ptyLifecycle.kill(session);
      }),
    );
    this.sessions.clear();
    this.sessionsBySessionId.clear();

    for (const shell of this.shellSessions.values()) {
      shell.ignoreExit = true;
      this.rememberRemovedThread(shell.shellId);
      this.ptyLifecycle.killShell(shell);
    }
    this.shellSessions.clear();
    this.logWriter.dispose();
  }

  private requireSession(threadId: string): SessionRuntime {
    const session = this.sessions.get(threadId);
    if (!session) {
      throw new Error(`Unknown thread session: ${threadId}`);
    }
    return session;
  }

  private rememberRemovedThread(threadId: string): void {
    this.recentlyRemovedThreadIds.delete(threadId);
    this.recentlyRemovedThreadIds.add(threadId);
    if (this.recentlyRemovedThreadIds.size <= RECENTLY_REMOVED_THREAD_LIMIT) return;
    const oldest = this.recentlyRemovedThreadIds.values().next().value;
    if (oldest !== undefined) {
      this.recentlyRemovedThreadIds.delete(oldest);
    }
  }

  private isCurrentSession(session: SessionRuntime): boolean {
    return this.sessions.get(session.threadId)?.instanceId === session.instanceId;
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

  private recoverInvalidSessionRef(session: SessionRuntime): void {
    void this.invalidSessionRecovery.recover(session);
  }

  private resolveLogPath(threadId: string): string {
    return join(this.options.logsDir, `${threadId}.log`);
  }

  private resolveHintLogPath(threadId: string): string {
    return join(this.options.logsDir, `${threadId}.hints.log`);
  }

  private resolveAgentSettings(adapter: AgentAdapter): Record<string, boolean | string> {
    const settings = readSupervisorSharedSettings(this.options.settingsPath);
    return {
      ...(adapter.capabilities.agentSettingsDefaults ?? {}),
      ...(settings.agentSettings[adapter.kind] ?? {}),
    };
  }
}
