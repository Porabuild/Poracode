import { randomUUID } from "node:crypto";
import { toError } from "@/shared/errorMessage";
import { msg } from "@/shared/messages";
import type {
  ConnectThreadVoicePayload,
  ConnectThreadVoiceResult,
  DisconnectThreadVoicePayload,
} from "@/shared/contracts/liveVoice";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { spawn } from "node-pty";
import type { McpThreadIdentity } from "@/shared/browserMcpThread";
import {
  type ClearPendingSteerPayload,
  type ControlThreadGoalPayload,
  type AgentEventEnvelope,
  type AgentKind,
  type BackgroundTask,
  type CloseThreadConfirmedResult,
  type CloseThreadPayload,
  type CreateRevertAnchorPayload,
  type PromptSegment,
  type ProjectLocation,
  type ProviderRevertAnchor,
  type ResizeTerminalPayload,
  type ReloadAgentMcpServersPayload,
  type ResolveThreadServerRequestPayload,
  type RestoreToRevertAnchorPayload,
  type RollbackThreadConversationPayload,
  type SendThreadInputPayload,
  type SetPendingSteerPayload,
  type StageThreadInputPayload,
  type StartShellPayload,
  type StartThreadPayload,
  type StartThreadResult,
  type TerminalSize,
  type TerminalShellSnapshot,
  type TerminalSnapshot,
  type ThreadConfig,
  type ThreadRuntimeSnapshot,
  type WriteTerminalPayload,
  type RuntimeEvent,
  type McpLaunchSnapshot,
  type ResolvedMcpServer,
} from "@/shared/contracts";
import { effectiveAgentSettings } from "@/shared/machineSettings";
import { agentEnvForLocation, localMachineKey } from "@/shared/machines";
import { applyHomeScopePermissions } from "@/shared/agents/unrestrictedPermissions";
import { TranscriptBuffer } from "@/shared/transcriptBuffer";
import {
  type AgentAdapter,
  createKnownSessionRef,
  defaultFormatPromptSegments,
  getRefreshedWindowsPath,
  isCompletedWithoutTurn,
  primeProjectShellEnv,
  resolveLaunchSpec,
  type StructuredTurnResult,
} from "../agents/base";
import { ensureNodePtySpawnHelperExecutable } from "../nodePty";
import { BufferedLogWriter } from "./bufferedLogWriter";
import {
  acquireOrHandoff,
  HostResourceAdmissionOwner,
  UNLIMITED_HOST_RESOURCE_ADMISSION_POLICY,
  type HostResourceAdmission,
} from "./hostResourceAdmission";
import { canonicalThreadIdsOf } from "../supervisorIpcMessagePolicy";
import type { QueuedStructuredTurn, SessionRuntime, ShellSessionRuntime } from "./sessionTypes";
import { effectiveProjectLocation } from "./sessionTypes";
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
import { resolveThreadMentionSegments } from "./threadMentionResolver";
import { RuntimeEventRouter } from "./threadSession/runtimeEventRouter";
import type { RuntimeEventBufferOverflow } from "./threadSession/runtimeEventBuffer";
import type { SupervisorEvent } from "@/shared/ipc";
import { SessionRuntimeLifecycle } from "./threadSession/sessionRuntimeLifecycle";
import type { ThreadSessionManagerOptions } from "./threadSession/managerOptions";
import { PtyLifecycle } from "./threadSession/ptyLifecycle";
import { describeSpawnFailure, sanitizedProcessEnv } from "./threadSession/spawnDiagnostics";
import { CliHookSessionCoordinator } from "./threadSession/cliHookPlugin";
import { InvalidSessionRecoveryCoordinator } from "./threadSession/invalidSessionRecovery";
import { StructuredInterruptWatchdog } from "./threadSession/structuredInterruptWatchdog";
import { SteerCoordinator, type SteerSubmissionOptions } from "./threadSession/steerCoordinator";
import { FollowUpQueueCoordinator } from "./threadSession/followUpQueueCoordinator";
import { buildShellCommand } from "./threadSession/shellCommand";
import {
  SpawnPipeline,
  workspaceLaunchConfig,
  type SpawnThreadInput,
} from "./threadSession/spawnPipeline";
import { StructuredTurnQueue } from "./threadSession/structuredTurnQueue";
import { StructuredFailureReporter } from "./threadSession/structuredFailureReporter";
import {
  SessionRetirement,
  STRUCTURED_DISPOSAL_SETTLE_MS,
} from "./threadSession/sessionRetirement";
import { assertAdapterSupportsPresentation } from "./threadSession/presentationSupport";
import { readSupervisorSharedSettings } from "./supervisorSharedSettings";
import {
  buildRetainedShellSnapshot,
  isRetainedShellExpired,
  putRetainedShellSnapshot,
  snapshotFromLiveSession,
  snapshotFromLiveShell,
  type RetainedShellSnapshot,
} from "./retainedShellSnapshots";

export { isUserInterruptKeystroke, USER_INTERRUPT_RECOVERY_GRACE_MS, writeSubmittedPrompt };
export type { ThreadSessionManagerOptions };

const RECENTLY_REMOVED_THREAD_LIMIT = 256;

function requireThreadMentionTools(
  session: SessionRuntime,
  segments: readonly PromptSegment[] | undefined,
): void {
  if (
    segments?.some((segment) => segment.kind === "thread") &&
    session.threadMentionToolsAvailable !== true
  ) {
    throw new Error(
      "Thread mentions require the Poracode read_thread tool, but it is unavailable for this session.",
    );
  }
}

export class ThreadSessionManager {
  readonly sessions = new Map<string, SessionRuntime>();
  readonly shellSessions = new Map<string, ShellSessionRuntime>();
  /**
   * The one host execution-slot owner for this supervisor. Every counted
   * launch funnel (threads, shells, subagents, generation helpers) acquires
   * through this instance; capacity decisions never read map sizes.
   */
  readonly hostResourceAdmission: HostResourceAdmission;
  /** Reverse index: agent-native session id → SessionRuntime, for CLI hook routing fallback. */
  readonly sessionsBySessionId = new Map<string, SessionRuntime>();
  /**
   * Naturally-exited dev shells keep a bounded in-memory snapshot so remote
   * cursor-sync clients can still hydrate after the PTY goes away. Shells are
   * not written to SQLite scrollback; agent threads use the DB fallback path.
   */
  private readonly exitedShellSnapshots = new Map<string, RetainedShellSnapshot>();
  private readonly startLocks = new Map<string, Promise<void>>();
  private readonly pendingStartInterrupts = new Set<string>();
  private readonly pendingStartAborts = new Set<string>();
  /**
   * Custody for sessions/shells whose retirement was not confirmed after they
   * left the live maps (close, replacement failure). Entries are bounded by
   * the admission owner — one per unreleased reservation — and pruned as soon
   * as the lease is released or a retry confirms cleanup.
   */
  private readonly retiringSessions = new Map<string, SessionRuntime>();
  private readonly retiringShells = new Map<string, ShellSessionRuntime>();
  private readonly ptyLifecycle = new PtyLifecycle();
  private readonly sessionRetirement: SessionRetirement;
  private readonly logWriter = new BufferedLogWriter();
  private readonly outputPipeline: ThreadOutputPipeline;
  private readonly runtimeEventRouter: RuntimeEventRouter;
  private readonly steerCoordinator: SteerCoordinator;
  private readonly structuredInterruptWatchdog: StructuredInterruptWatchdog;
  private readonly cliHookPlugin: CliHookSessionCoordinator;
  private readonly spawnPipeline: SpawnPipeline;
  private readonly invalidSessionRecovery: InvalidSessionRecoveryCoordinator;
  private readonly structuredTurnQueue: StructuredTurnQueue;
  private readonly followUpQueue: FollowUpQueueCoordinator;
  private readonly structuredFailureReporter = new StructuredFailureReporter();
  private readonly recentlyRemovedThreadIds = new Set<string>();
  /**
   * Sessions already stopped because their bounded canonical-event buffer hit
   * its cap while host persistence was backpressured. Prevents a stop loop.
   */
  private readonly canonicalOverflowStopped = new Set<string>();
  private disposed = false;

  constructor(private readonly options: ThreadSessionManagerOptions) {
    this.hostResourceAdmission =
      options.admission ??
      new HostResourceAdmissionOwner(() => UNLIMITED_HOST_RESOURCE_ADMISSION_POLICY);
    // The production settle pause lives here so every teardown funnel
    // (close, restart, recovery, shutdown) shares one retirement path.
    this.sessionRetirement = new SessionRetirement(
      this.ptyLifecycle,
      () => sleep(STRUCTURED_DISPOSAL_SETTLE_MS),
      options.structuredDisposalTimeoutMs,
      // A lease released by retirement itself cannot be protected by a
      // retained generation, so its custody entry is pruned on the same
      // observation that freed capacity.
      (lease) => {
        if (lease.resourceClass === "agent-session") {
          this.retiringSessions.delete(lease.key);
        } else if (lease.resourceClass === "terminal-shell") {
          this.retiringShells.delete(lease.key);
        }
      },
    );
    this.runtimeEventRouter = new RuntimeEventRouter(options.emit, {
      onOverflow: (info) => this.handleCanonicalBufferOverflow(info),
      ...(options.canonicalCapacity ? { canonicalCapacity: options.canonicalCapacity } : {}),
    });
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
      disposeForceStoppedSession: (session, handle) => {
        // One shared cleanup path (not a bespoke fire-and-forget): the handle
        // and its single disposal operation stay retained on the session until
        // the disposal actually settles, so a later close/restart joins it
        // instead of reading the cleared handle as "retired".
        this.sessionRetirement.startForceStoppedDisposal(session, handle);
      },
    });
    this.structuredTurnQueue = new StructuredTurnQueue({
      emit: options.emit,
      sessions: this.sessions,
      beginFailureEpisode: (session) => this.structuredFailureReporter.beginEpisode(session),
      failStructuredSession: (session, error) => this.failStructuredSession(session, error),
    });
    this.followUpQueue = new FollowUpQueueCoordinator({
      emit: options.emit,
      sessions: this.sessions,
      waitForPendingStart: (threadId) => this.waitForPendingStart(threadId),
      isCurrentSession: (session) => this.isCurrentSession(session),
      prepareTurn: (session, payload) => this.prepareQueuedFollowUp(session, payload),
      startStructuredTurn: (session, turn) => this.startQueuedStructuredTurn(session, turn),
      restartStructuredTurn: (session, turn) => this.restartThreadSettlingFailure(session, turn),
      steer: (payload, steerOptions) => this.setPendingSteer(payload, steerOptions),
    });
    this.steerCoordinator = new SteerCoordinator({
      emit: options.emit,
      sessions: this.sessions,
      interruptStructuredTurn: (session) =>
        this.structuredInterruptWatchdog.interruptStructuredTurn(session),
      startStructuredTurn: (session, turn) => {
        return this.startDirectStructuredTurn(session, turn);
      },
      failStructuredSession: (session, error) => this.failStructuredSession(session, error),
      emitOptimisticUserMessage: (threadId, prompt, segments, requestedItemId, emitOptions) =>
        this.structuredTurnQueue.emitOptimisticUserMessage(
          threadId,
          prompt,
          segments,
          requestedItemId,
          emitOptions,
        ),
      resolveSkillTurnInjection: (session, segments) =>
        this.resolveSkillTurnInjection(session, segments),
      noteDirectSteerSubmitted: (session) => this.followUpQueue.noteDirectSteerSubmitted(session),
      noteDirectSteerCompletedWithoutTurn: (session) =>
        this.followUpQueue.onDirectTurnCompletedWithoutTurn(session),
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
      followUpQueue: this.followUpQueue,
      structuredInterruptWatchdog: this.structuredInterruptWatchdog,
      emit: this.options.emit,
      isCurrentSession: (session) => this.isCurrentSession(session),
      failStructuredSession: (session, error) => this.failStructuredSession(session, error),
      indexSessionRef: (session, prevId) => this.indexSessionRef(session, prevId),
      pollSessionRefDiscovery: (session) => this.pollSessionRefDiscovery(session),
      // A newly published generation is genuinely new: the overflow stop that
      // retired a predecessor must not make this session unstoppable. A later
      // explicit relaunch that overflows again is stopped again.
      onSessionAttached: (threadId) => {
        this.canonicalOverflowStopped.delete(threadId);
      },
      // A released lease cannot be protected by a retired generation, so its
      // retained custody entry is dropped on the same observation that freed
      // capacity (the retention stays bounded by live reservations).
      onResourceLeaseRelease: (session) => {
        this.retiringSessions.delete(session.threadId);
      },
    });
    this.spawnPipeline = new SpawnPipeline({
      options: this.options,
      sessions: this.sessions,
      pendingStartInterrupts: this.pendingStartInterrupts,
      pendingStartAborts: this.pendingStartAborts,
      ptyLifecycle: this.ptyLifecycle,
      admission: this.hostResourceAdmission,
      retirement: this.sessionRetirement,
      outputPipeline: this.outputPipeline,
      runtimeEventRouter: this.runtimeEventRouter,
      sessionRuntimeLifecycle,
      cliHookPlugin: this.cliHookPlugin,
      closeThread: (payload) => this.closeThread(payload),
      failStructuredSession: (session, error) => this.failStructuredSession(session, error),
      isCurrentSession: (session) => this.isCurrentSession(session),
      resolveAgentSettings: (adapter, location) => this.resolveAgentSettings(adapter, location),
      emitOptimisticUserMessage: (threadId, prompt, segments, requestedItemId) =>
        this.structuredTurnQueue.emitOptimisticUserMessage(
          threadId,
          prompt,
          segments,
          requestedItemId,
        ),
      emitProviderHandoff: (threadId, fromAgentKind, toAgentKind, requestedItemId) =>
        this.structuredTurnQueue.emitProviderHandoff(
          threadId,
          fromAgentKind,
          toAgentKind,
          requestedItemId,
        ),
    });
    this.invalidSessionRecovery = new InvalidSessionRecoveryCoordinator({
      spawnPipeline: this.spawnPipeline,
      cliHookPlugin: this.cliHookPlugin,
      outputPipeline: this.outputPipeline,
      ptyLifecycle: this.ptyLifecycle,
      admission: this.hostResourceAdmission,
      retirement: this.sessionRetirement,
      isCurrentSession: (session) => this.isCurrentSession(session),
      failStructuredSession: (session, error) => this.failStructuredSession(session, error),
      settleAfterStructuredDispose: () => sleep(STRUCTURED_DISPOSAL_SETTLE_MS),
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
      threadMentionToolsAvailable: session.threadMentionToolsAvailable === true,
      ...(session.sessionRef ? { sessionRef: session.sessionRef } : {}),
      ...(session.slashCommands ? { slashCommands: session.slashCommands } : {}),
      canResumeWithConfig: session.canResumeWithConfig,
      threadStatusSource: resolveThreadStatusSource(
        session,
        this.options.readDisableCliHookPlugin(),
      ),
    }));
  }

  getTerminalShellSnapshots(): TerminalShellSnapshot[] {
    return [...this.shellSessions.values()].map((session) => ({
      terminalId: session.shellId,
      projectLocation: session.projectLocation,
      ...(session.worktreePath ? { worktreePath: session.worktreePath } : {}),
      outputLength: session.outputLength,
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
    this.followUpQueue.onStructuredUpdate(session, "error");
    this.enqueueRuntimeEvent(session.threadId, {
      type: "error",
      threadId: session.threadId,
      message,
    });
  }

  private completeForcedStructuredInterrupt(session: SessionRuntime): void {
    this.followUpQueue.onForcedInterrupt(session);
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
      pending.displaySegments ?? pending.segments,
      pending.userMessageItemId,
    );
    const turn: QueuedStructuredTurn = { ...pending, userMessageItemId };
    const admission = this.steerCoordinator.takePendingSteerAdmission(session);
    void this.spawnPipeline.restartThread(session, turn).then(
      () => {
        // The restart promise is the provider's admission boundary. A queued
        // steer owns its FIFO row until this resolves; the normal turn-
        // completion barrier remains event-driven.
        admission?.resolve();
      },
      (error) => {
        admission?.reject(error);
        if (!this.isCurrentSession(session)) return;
        this.failStructuredSession(session, error);
      },
    );
  }

  private enqueueRuntimeEvent(threadId: string, event: RuntimeEvent): void {
    this.runtimeEventRouter.append(threadId, event);
  }

  /**
   * Host persistence control (B1). While paused, canonical runtime envelopes
   * are held in the bounded per-thread buffer; control/state traffic and
   * rebuildable terminal output keep flowing. `threadIds` restricts a stop to
   * the refused threads so one thread's overflow never stops unrelated
   * sessions. A resume never clears an explicit overflow stop: the refused
   * output stays refused until the thread is explicitly relaunched.
   */
  setCanonicalEventBackpressure(paused: boolean, threadIds?: readonly string[]): void {
    if (paused && threadIds && threadIds.length > 0) {
      for (const threadId of threadIds) {
        this.stopSessionForCanonicalOverflow(
          threadId,
          "host persistence explicitly refused canonical events for this thread",
        );
      }
      return;
    }
    this.runtimeEventRouter.setPaused(paused);
  }

  /** Host canonical credit window changed; flush what now fits. */
  setCanonicalCreditCapacity(remainingBytes: number): void {
    this.runtimeEventRouter.setCanonicalCapacity(remainingBytes);
  }

  getCanonicalEventBufferStats(): {
    events: number;
    bytes: number;
    threads: number;
    paused: boolean;
  } {
    return {
      ...this.runtimeEventRouter.pendingStats(),
      paused: this.runtimeEventRouter.isPaused(),
    };
  }

  /**
   * Stop one session whose canonical output cannot be held any longer. The
   * provider capability model has no implemented pause for these runtimes, so
   * the bounded buffer's cap is a hard stop: an explicit `error` state plus a
   * control-path error event, then teardown. Only the affected session is
   * stopped; unrelated sessions (including PTY shells) are untouched.
   *
   * Non-reentrancy (F3): this runs from the sender's DEFERRED overflow hook, so
   * it never re-enters a saturated bulk queue synchronously. Post-batch
   * ordering (F9): the retained canonical batch for the thread is released
   * first, and the stop marker is queued behind whatever remains, so it can
   * never be published ahead of content the thread already produced.
   */
  stopSessionForCanonicalOverflow(threadId: string, detail: string): void {
    if (this.canonicalOverflowStopped.has(threadId)) return;
    const session = this.sessions.get(threadId);
    if (!session) return;
    this.canonicalOverflowStopped.add(threadId);
    const message = `Agent output stopped: ${detail}.`;
    console.error(`[supervisor] ${message} (thread ${threadId})`);
    this.outputPipeline.updateState(session, "error", "error", message);
    this.followUpQueue.onStructuredUpdate(session, "error");
    // Release the retained batch first (capacity-aware), then queue the stop
    // marker behind it: the marker goes out as its own control-class envelope
    // once the content ahead of it is fully out.
    this.runtimeEventRouter.releaseThread(threadId);
    this.runtimeEventRouter.queueStopMarker(threadId, {
      type: "thread-runtime-event",
      threadId,
      event: { type: "error", threadId, message },
    });
    // One retirement path: a rejecting dispose never skips PTY termination,
    // and an unconfirmed exit retains the slot instead of freeing it.
    void this.sessionRetirement.retireAgentSession(session);
  }

  /**
   * IPC-sender overflow hook: the outbound channel filled with canonical
   * envelopes while the host was not draining and the buffer pause could not
   * prevent it. Stop exactly the affected sessions instead of failing the
   * whole supervisor process.
   */
  handleCanonicalSenderOverflow(message: SupervisorEvent): void {
    for (const threadId of canonicalThreadIdsOf(message)) {
      this.stopSessionForCanonicalOverflow(
        threadId,
        "supervisor IPC queue overflow while the host was not draining",
      );
    }
  }

  private handleCanonicalBufferOverflow(info: RuntimeEventBufferOverflow): void {
    const detail =
      info.reason === "oversize"
        ? `a single canonical event exceeded the hard event bound (${info.pendingBytes} estimated bytes)`
        : `host persistence backpressure (${info.reason} buffer limit: ${info.pendingEvents} events, ${info.pendingBytes} estimated bytes${info.creditBound ? ", canonical credit exhausted" : ""})`;
    this.stopSessionForCanonicalOverflow(info.threadId, detail);
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
    const projectLocation = effectiveProjectLocation(session);
    // Children inherit the effective launch config with built-in disables applied.
    const disabledIds = session.mcpLaunchSnapshot.disabledBuiltInMcpServerIds;
    const effectiveConfig = workspaceLaunchConfig(
      projectLocation,
      session.config,
      session.adapter,
      disabledIds,
      session.mcpLaunchSnapshot.pluginBuiltInMcpServerIds,
    );
    return {
      projectLocation,
      config: effectiveConfig,
      mcpLaunchSnapshot: session.mcpLaunchSnapshot,
    };
  }

  /** Resolve the parent's enabled MCP access for an ephemeral structured child. */
  async resolveSubagentParentMcpAccess(
    threadId: string,
    identity: McpThreadIdentity,
    targetAgentKind: AgentKind,
    projectLocation: ProjectLocation,
  ): Promise<{ mcpServers?: ResolvedMcpServer[] }> {
    const session = this.sessions.get(threadId);
    if (!session) return {};
    const targetAdapter = this.options.adapters.get(targetAgentKind);
    if (!targetAdapter) return {};
    const mcpLaunchSnapshot = session.mcpLaunchSnapshot;
    const launchConfig = workspaceLaunchConfig(
      projectLocation,
      session.config,
      targetAdapter,
      mcpLaunchSnapshot.disabledBuiltInMcpServerIds,
      mcpLaunchSnapshot.pluginBuiltInMcpServerIds,
      effectiveProjectLocation(session),
    );
    const mcpServers = await this.spawnPipeline.resolveMcpServersForLaunch({
      location: projectLocation,
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
            const launchConfig = this.spawnPipeline.resolveMcpLaunchConfig(
              workspaceLaunchConfig(
                session.projectLocation,
                session.config,
                session.adapter,
                session.mcpLaunchSnapshot.disabledBuiltInMcpServerIds,
                session.mcpLaunchSnapshot.pluginBuiltInMcpServerIds,
                effectiveProjectLocation(session),
              ),
              session.mcpLaunchSnapshot,
              session.adapter,
              session.threadId,
              session.projectLocation,
            );
            const mcpServers = await this.spawnPipeline.resolveMcpServersForLaunch({
              location: session.projectLocation,
              config: launchConfig,
              mcpLaunchSnapshot: session.mcpLaunchSnapshot,
              crossagentThreadId: session.threadId,
              adapter: session.adapter,
              ...(session.presentationMode ? { presentationMode: session.presentationMode } : {}),
            });
            if (!this.isCurrentSession(session)) return;
            await update(mcpServers);
            if (!this.isCurrentSession(session)) return;
            session.launchConfig = launchConfig;
            this.outputPipeline.emitState(session);
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

  /** Reopen is desired state, not permission to replace another client's runtime. */
  async ensureThreadRunning(payload: StartThreadPayload): Promise<StartThreadResult> {
    if (this.disposed) throw new Error("ThreadSessionManager is disposed.");
    const threadId = payload.threadId;
    if (
      !threadId ||
      payload.prompt.length > 0 ||
      payload.segments?.length ||
      payload.providerSwitch
    ) {
      throw new Error("Thread reopen requires an existing id and no new input or provider switch.");
    }
    // Inspect and acquire the same start lock synchronously: two clients must
    // not both observe an absent session and replace each other's new runtime.
    const pending = this.startLocks.get(threadId);
    if (pending) {
      await pending;
    } else {
      const current = this.sessions.get(threadId);
      if (!current || current.status === "inactive") await this.startThread(payload);
    }
    const current = this.sessions.get(threadId);
    if (!current || current.status === "inactive") {
      throw new Error("Thread reopen did not leave a running session.");
    }
    return { threadId };
  }

  private async waitForPendingStart(threadId: string): Promise<void> {
    // A provider switch can replace the map entry while its start lock is
    // still settling. Follow the lock that was present at each observation so
    // queued receipt handling never binds to the old SessionRuntime.
    for (;;) {
      const pending = this.startLocks.get(threadId);
      if (!pending) return;
      await pending;
      if (this.startLocks.get(threadId) === pending) return;
    }
  }

  /** Prepare a queued GUI turn without changing the live session config. */
  private async prepareQueuedFollowUp(
    session: SessionRuntime,
    payload: SetPendingSteerPayload,
  ): Promise<QueuedStructuredTurn> {
    requireThreadMentionTools(session, payload.segments);
    const mentionSegments = payload.segments
      ? resolveThreadMentionSegments(payload.segments)
      : undefined;
    const effectiveSegments = mentionSegments
      ? await rewriteSegmentsForWsl(mentionSegments, session.projectLocation, {
          preserveImageAttachments:
            session.adapter.capabilities.readsImageAttachmentsFromHost !== false,
          preservePdfAttachments: session.adapter.capabilities.readsPdfAttachmentsFromHost === true,
        })
      : undefined;
    const policySegments = await this.filterPluginSkillSegments(session, effectiveSegments);
    const prompt = this.formatSegmentsForPrompt(session, policySegments, payload.prompt);
    const effectiveConfig = applyHomeScopePermissions(
      effectiveProjectLocation(session),
      payload.config,
      session.adapter.capabilities,
    );
    const inlineInstructions = await this.resolveSkillTurnInjection(session, policySegments);
    return {
      prompt,
      config: effectiveConfig,
      ...(policySegments ? { segments: policySegments } : {}),
      ...(payload.segments ? { displaySegments: payload.segments } : {}),
      ...(inlineInstructions ? { inlineInstructions } : {}),
    };
  }

  /** Queue delivery uses ordinary startTurn only and applies config on admission. */
  private startQueuedStructuredTurn(
    session: SessionRuntime,
    turn: QueuedStructuredTurn,
  ): Promise<void | StructuredTurnResult> | undefined {
    // Match direct submission: apply the snapshot when dispatching. Some
    // providers resolve startTurn only at completion, after a newer steer or
    // model selection may already have changed the live config.
    session.config = turn.config;
    const start = this.structuredTurnQueue.start(session, turn);
    if (start) this.outputPipeline.emitState(session);
    return start;
  }

  /** Direct composer starts share the queue barrier but never queue. */
  private startDirectStructuredTurn(
    session: SessionRuntime,
    turn: QueuedStructuredTurn,
  ): Promise<void | StructuredTurnResult> | undefined {
    // Same snapshot rule as queued dispatch: steer/follow-up startTurn reads
    // `turn.config`, and later thread-state echoes must not revive the old
    // model / effort / Fast from `session.config`.
    session.config = turn.config;
    this.followUpQueue.noteDirectTurnSubmitted(session);
    const start = this.structuredTurnQueue.start(session, turn);
    if (start) {
      void start.then(
        (result) => {
          if (isCompletedWithoutTurn(result)) {
            this.followUpQueue.onDirectTurnCompletedWithoutTurn(session);
          }
        },
        () => undefined,
      );
    }
    return start;
  }

  async queueThreadFollowUp(payload: SetPendingSteerPayload): Promise<void> {
    return this.followUpQueue.queueThreadFollowUp(payload);
  }

  reorderQueuedThreadFollowUp(
    input: Parameters<FollowUpQueueCoordinator["reorderQueuedThreadFollowUp"]>[0],
  ) {
    return this.followUpQueue.reorderQueuedThreadFollowUp(input);
  }

  editQueuedThreadFollowUp(
    input: Parameters<FollowUpQueueCoordinator["editQueuedThreadFollowUp"]>[0],
  ) {
    return this.followUpQueue.editQueuedThreadFollowUp(input);
  }

  steerQueuedThreadFollowUp(input: { threadId: string; id: string }) {
    return this.followUpQueue.steerQueuedThreadFollowUp(input);
  }

  async removeQueuedThreadFollowUp(input: { threadId: string; id: string }): Promise<void> {
    return this.followUpQueue.removeQueuedThreadFollowUp(input);
  }

  pauseThreadFollowUps(input: { threadId: string; id: string }) {
    return this.followUpQueue.pauseThreadFollowUps(input);
  }

  resumeThreadFollowUps(threadId: string): Promise<void> {
    return this.followUpQueue.resumeThreadFollowUps(threadId);
  }

  getThreadFollowUpQueue(threadId: string) {
    return this.followUpQueue.getThreadFollowUpQueue(threadId);
  }

  async startThread(payload: StartThreadPayload): Promise<StartThreadResult> {
    if (this.disposed) {
      throw new Error("ThreadSessionManager is disposed.");
    }
    // A requested presentation must be one the adapter declares. This runs
    // before coalescing, admission, teardown or any process effect so a
    // nonstandard client can never co-produce an undeclared runtime surface.
    assertAdapterSupportsPresentation(
      this.options.adapters.get(payload.agentKind),
      payload.presentationMode,
    );
    const threadId = payload.threadId ?? randomUUID();
    const pending = this.startLocks.get(threadId);
    if (pending) {
      if (payload.providerSwitch) {
        await pending;
        return this.startThread(payload);
      }
      return { threadId };
    }
    // A retained failed cleanup for this key is joined/retried before a new
    // reservation, so the same thread can start again without a supervisor
    // restart and no cleanable effect is left behind. The sync guards keep the
    // common path free of an await before the start lock is published.
    if (this.sessionRetirement.hasAbandoned("agent-session", threadId)) {
      await this.sessionRetirement.retryAbandoned("agent-session", threadId);
    }
    if (this.retiringSessions.has(threadId)) {
      await this.retryRetainedSession(threadId);
    }
    const currentSession = this.sessions.get(threadId);
    if (
      payload.providerSwitch &&
      currentSession &&
      currentSession.agentKind !== payload.providerSwitch.fromAgentKind
    ) {
      throw new Error(
        `Provider switch is stale: thread ${threadId} now belongs to ${currentSession.agentKind}.`,
      );
    }
    // Admit before any teardown or queue mutation. A capacity refusal here
    // leaves the current runtime untouched; a same-logical-execution
    // replacement hands the single slot over instead of needing a second one.
    const resourceLease = acquireOrHandoff(
      this.hostResourceAdmission,
      currentSession?.resourceLease,
      { resourceClass: "agent-session", key: threadId },
    );
    const predecessorLease = currentSession?.resourceLease;
    const isSessionReplacement = currentSession !== undefined;
    if (isSessionReplacement) {
      this.followUpQueue.beginSessionReplacement(threadId);
    }
    this.recentlyRemovedThreadIds.delete(threadId);

    const run = this.spawnPipeline.startThreadInner({
      ...payload,
      threadId,
      resourceLease,
      ...(predecessorLease ? { predecessorLease } : {}),
    });
    this.startLocks.set(
      threadId,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    try {
      const result = await run;
      // A settled start that never published a runtime must not leak a slot
      // (normally the abort/failure paths already settled it).
      if (resourceLease.state === "pending" && !this.sessions.has(threadId)) {
        resourceLease.cancel();
      }
      if (isSessionReplacement && !this.sessions.has(threadId)) {
        this.followUpQueue.sessionReplacementFailed(threadId);
      }
      return result;
    } catch (error) {
      if (resourceLease.state === "pending") {
        resourceLease.cancel();
      }
      if (isSessionReplacement) {
        this.followUpQueue.sessionReplacementFailed(threadId);
      }
      throw error;
    } finally {
      this.startLocks.delete(threadId);
      if (!this.sessions.has(threadId)) {
        this.pendingStartInterrupts.delete(threadId);
        this.pendingStartAborts.delete(threadId);
      }
    }
  }

  /**
   * Join/retry the retirement of a session that already left the live map.
   * Bounded by the shared structured-disposal deadline; throws the truthful
   * cleanup failure (or an unconfirmed notice) while the slot stays counted.
   */
  private async retryRetainedSession(threadId: string): Promise<void> {
    const session = this.retiringSessions.get(threadId);
    if (!session) return;
    const lease = session.resourceLease;
    if (!lease || lease.state === "released") {
      this.retiringSessions.delete(threadId);
      return;
    }
    const outcome = await this.sessionRetirement.retireAgentSession(session);
    if (outcome.confirmed) {
      this.retiringSessions.delete(threadId);
      return;
    }
    if (outcome.error !== undefined) throw toError(outcome.error);
    throw new Error(
      `Thread ${threadId} retirement is still unconfirmed; its execution slot stays counted.`,
    );
  }

  /** Join/retry a shell that already left the live map (close retry/shutdown). */
  private async retryRetainedShell(shellId: string): Promise<boolean> {
    const shell = this.retiringShells.get(shellId);
    if (!shell) return true;
    const lease = shell.resourceLease;
    if (!lease || lease.state === "released") {
      this.retiringShells.delete(shellId);
      return true;
    }
    const confirmed = await this.sessionRetirement.retireShellSession(shell);
    if (confirmed) {
      this.retiringShells.delete(shellId);
      return true;
    }
    return false;
  }

  async sendThreadInput(payload: SendThreadInputPayload): Promise<void> {
    const directInput = this.followUpQueue.beginDirectInput(payload.threadId);
    try {
      // A queued dispatch can still leave the provider-reported status at idle
      // while its async admission is in flight. Wait for that admission edge
      // before deciding whether this direct submit is a fresh turn or a steer.
      await this.followUpQueue.waitForQueuedTurnAdmission(payload.threadId);
      // A queued steer uses the same admission barrier, but it is not a queue
      // record dispatch: it remains a FIFO row until fallback startTurn has
      // emitted canonical admission. Do not start a second direct turn in
      // that narrow setup window.
      await this.steerCoordinator.waitForPendingSteerAdmission(payload.threadId);
      const session = await this.findSessionAfterPendingStart(payload.threadId);
      if (!session) {
        // Never swallow a full user prompt, even for a just-removed thread —
        // callers (renderer composer, `send_to_thread`) resume on this error.
        throw new Error(`Unknown thread session: ${payload.threadId}`);
      }
      if (session.status === "inactive" && !session.sessionRef) {
        throw new Error("This thread exited before a resumable session id was discovered.");
      }
      const usesStructuredFlow =
        session.adapter.capabilities.liveInputMode === "server" ||
        session.presentationMode === "gui";
      requireThreadMentionTools(session, payload.segments);
      const mentionSegments = payload.segments
        ? resolveThreadMentionSegments(payload.segments)
        : undefined;
      const wslSegments = mentionSegments
        ? await rewriteSegmentsForWsl(mentionSegments, session.projectLocation, {
            preserveImageAttachments:
              usesStructuredFlow &&
              session.adapter.capabilities.readsImageAttachmentsFromHost !== false,
            preservePdfAttachments:
              usesStructuredFlow &&
              session.adapter.capabilities.readsPdfAttachmentsFromHost === true,
          })
        : undefined;
      const effectiveSegments = await this.filterPluginSkillSegments(session, wslSegments);
      const prompt = this.formatSegmentsForPrompt(session, effectiveSegments, payload.prompt);

      const turnConfig =
        session.presentationMode !== "gui" &&
        payload.config.mode === "plan" &&
        session.config.mode === undefined
          ? { ...payload.config, mode: undefined }
          : payload.config;
      const effectiveConfig = applyHomeScopePermissions(
        effectiveProjectLocation(session),
        turnConfig,
        session.adapter.capabilities,
      );

      const inlineInstructions = usesStructuredFlow
        ? await this.resolveSkillTurnInjection(session, effectiveSegments)
        : undefined;
      if (!this.isCurrentSession(session)) {
        return this.sendThreadInput(payload);
      }
      session.config = effectiveConfig;
      const turn: QueuedStructuredTurn = {
        prompt,
        config: effectiveConfig,
        ...(effectiveSegments ? { segments: effectiveSegments } : {}),
        ...(payload.segments ? { displaySegments: payload.segments } : {}),
        ...(payload.userMessageItemId ? { userMessageItemId: payload.userMessageItemId } : {}),
        ...(inlineInstructions ? { inlineInstructions } : {}),
      };
      if (session.status === "inactive") {
        // Guaranteed to have a sessionRef here — the no-ref case threw above.
        directInput.markStarted(session);
        this.followUpQueue.noteDirectTurnSubmitted(session);
        await this.restartThreadSettlingFailure(session, turn);
        return;
      }
      if (
        usesStructuredFlow &&
        !session.structuredSession &&
        (session.status === "error" || session.status === "idle") &&
        session.sessionRef
      ) {
        directInput.markStarted(session);
        this.followUpQueue.noteDirectTurnSubmitted(session);
        await this.restartThreadSettlingFailure(session, turn);
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
          directInput.markStarted(session);
          if (session.structuredSession.steerTurn) {
            await this.steerCoordinator.steerStructuredTurn(session, turn);
            return;
          }
          this.steerCoordinator.stagePendingSteer(session, turn);
          this.steerCoordinator.fireSteerInterrupt(session);
          return;
        }
        if (session.presentationMode === "gui" && session.pendingSteer !== undefined) {
          // Drain in progress (cancel acked, slot still set). Replace it; the
          // existing drain-on-idle hook will pick up the new content.
          directInput.markStarted(session);
          this.steerCoordinator.stagePendingSteer(session, turn);
          void this.steerCoordinator.maybeDrainPendingSteer(session);
          return;
        }
        directInput.markStarted(session);
        void this.startDirectStructuredTurn(session, turn);
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
    } catch (error) {
      this.followUpQueue.directInputFailed(payload.threadId);
      throw error;
    } finally {
      directInput.release();
    }
  }

  async interruptThread(payload: { threadId: string }): Promise<void> {
    // Stop is an explicit queue pause, not an implicit drain trigger. Set the
    // gate before looking up the session so a Stop racing startup or a queued
    // receipt cannot slip through.
    this.followUpQueue.pauseThread(payload.threadId);
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
      // Interrupt is idempotent "ensure this thread is not running". With no
      // session there is nothing to stop, so emit the settled state instead of
      // failing — this is the lever that unsticks a row whose session died
      // while its persisted status still says `working`.
      this.options.emit({
        type: "thread-state",
        threadId: payload.threadId,
        status: "inactive",
        attention: "none",
        canResumeWithConfig: false,
        forceCloseActiveTurn: true,
      });
      return;
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

  async connectThreadVoice(payload: ConnectThreadVoicePayload): Promise<ConnectThreadVoiceResult> {
    const session = this.requireSession(payload.threadId);
    if (
      session.status !== "idle" ||
      session.presentationMode !== "gui" ||
      !session.structuredSession?.connectVoice
    ) {
      throw new Error(msg("voice.unavailable"));
    }
    const config = applyHomeScopePermissions(
      effectiveProjectLocation(session),
      payload.config,
      session.adapter.capabilities,
    );
    session.config = config;
    return session.structuredSession.connectVoice({
      connectionId: payload.connectionId,
      offerSdp: payload.offerSdp,
      config,
    });
  }

  async disconnectThreadVoice(payload: DisconnectThreadVoicePayload): Promise<void> {
    await this.sessions
      .get(payload.threadId)
      ?.structuredSession?.disconnectVoice?.(payload.connectionId);
  }

  async rollbackThreadConversation(payload: RollbackThreadConversationPayload): Promise<void> {
    if (payload.numTurns === 0) return;
    const session = this.requireSession(payload.threadId);
    this.assertRevertIdle(session);
    if (!session.structuredSession?.rollbackThread) {
      throw new Error(`${session.adapter.label} does not support checkpoint rollback.`);
    }

    const history = payload.config
      ? await session.structuredSession.rollbackThread(payload.numTurns, payload.config)
      : await session.structuredSession.rollbackThread(payload.numTurns);
    this.adoptRevertedSession(session, history);
  }

  /**
   * WS2 stage 3: freeze an absolute provider revert target without mutating
   * anything. The backend journals the returned anchor before its restore
   * side effect; sessions whose structured provider lacks the hook reject
   * here, which the backend treats as the anchor-unsupported fallback path.
   */
  async createRevertAnchor(
    payload: CreateRevertAnchorPayload,
  ): Promise<{ anchor: ProviderRevertAnchor }> {
    const session = this.requireSession(payload.threadId);
    this.assertRevertIdle(session);
    const structured = session.structuredSession;
    if (!structured?.createRevertAnchor) {
      throw new Error(`${session.adapter.label} does not support revert anchors.`);
    }
    const anchor = payload.config
      ? await structured.createRevertAnchor(payload.numTurns, payload.config)
      : await structured.createRevertAnchor(payload.numTurns);
    return { anchor };
  }

  /** Restores to a previously journaled anchor; idempotent by contract. */
  async restoreToRevertAnchor(payload: RestoreToRevertAnchorPayload): Promise<void> {
    const session = this.requireSession(payload.threadId);
    this.assertRevertIdle(session);
    const structured = session.structuredSession;
    if (!structured?.restoreToRevertAnchor) {
      throw new Error(`${session.adapter.label} does not support revert anchors.`);
    }
    const history = payload.config
      ? await structured.restoreToRevertAnchor(payload.anchor, payload.config)
      : await structured.restoreToRevertAnchor(payload.anchor);
    this.adoptRevertedSession(session, history);
  }

  private assertRevertIdle(session: SessionRuntime): void {
    if (session.status === "working") {
      throw new Error("Cannot roll back a thread while the agent is working.");
    }
  }

  /** Mirrors a provider-side fork/rewind into the session's resume metadata. */
  private adoptRevertedSession(
    session: SessionRuntime,
    history: { providerSessionId?: string },
  ): void {
    const previousSessionId = session.sessionRef?.providerSessionId;
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
    requireThreadMentionTools(session, payload.segments);
    const mentionSegments = payload.segments
      ? resolveThreadMentionSegments(payload.segments)
      : undefined;
    const wslSegments = mentionSegments
      ? await rewriteSegmentsForWsl(mentionSegments, session.projectLocation, {
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
  async setPendingSteer(
    payload: SetPendingSteerPayload,
    options?: SteerSubmissionOptions,
  ): Promise<void> {
    const directInput = this.followUpQueue.beginDirectInput(payload.threadId);
    let targetSession: SessionRuntime | undefined;
    let admittedSession: SessionRuntime | undefined;
    try {
      // A provider switch/reconnect can leave the old SessionRuntime in the
      // map while its replacement owns the serialized start lock. Wait before
      // preparing or admitting input so a late rejection cannot reset the new
      // session's direct barrier.
      await this.waitForPendingStart(payload.threadId);
      // A queued turn can have invoked startTurn while the provider still
      // reports idle. Steer must join that admission edge before it selects a
      // submission path, otherwise it can evict the active queue owner and
      // overlap the provider setup.
      await this.followUpQueue.waitForQueuedTurnAdmission(payload.threadId);
      // A fallback steer has the same asynchronous admission window after its
      // startTurn is invoked. Wait for its canonical start before replacing or
      // steering the session again.
      await this.steerCoordinator.waitForPendingSteerAdmission(payload.threadId);
      const session = await this.findSessionAfterPendingStart(payload.threadId);
      if (!session) {
        throw new Error(`Unknown thread session: ${payload.threadId}`);
      }
      targetSession = session;

      let segments: PromptSegment[] | undefined;
      if (payload.segments !== undefined) {
        requireThreadMentionTools(session, payload.segments);
        const mentionSegments = resolveThreadMentionSegments(payload.segments);
        segments = await this.filterPluginSkillSegments(session, mentionSegments);
      }

      // Preparation above may have crossed a provider replacement. Re-check
      // both the map identity and the lock before touching the old session.
      await this.waitForPendingStart(payload.threadId);
      if (!this.isCurrentSession(session) || this.startLocks.has(payload.threadId)) {
        return this.setPendingSteer(payload, options);
      }

      const effectiveConfig = applyHomeScopePermissions(
        effectiveProjectLocation(session),
        payload.config,
        session.adapter.capabilities,
      );
      session.config = effectiveConfig;
      admittedSession = session;
      directInput.markStarted(session);
      await this.steerCoordinator.setPendingSteer(
        session,
        {
          ...payload,
          config: effectiveConfig,
          ...(segments ? { segments } : {}),
          ...(payload.segments ? { displaySegments: payload.segments } : {}),
        },
        options,
      );
    } catch (error) {
      // An old session can reject after a replacement is already current.
      // Never clear/pause the replacement's direct lifecycle in that case.
      if (!targetSession || this.isCurrentSession(admittedSession ?? targetSession)) {
        this.followUpQueue.directInputFailed(payload.threadId);
      }
      throw error;
    } finally {
      directInput.release();
    }
  }

  /**
   * User aborted the steer (clicked the X on the strip). Clear the slot
   * without firing a new prompt. The cancel notification we already sent
   * still completes — the agent just stops without a replacement.
   */
  async clearPendingSteer(payload: ClearPendingSteerPayload): Promise<void> {
    const session = this.requireSession(payload.threadId);
    this.steerCoordinator.clearPendingSteerSlot(session);
    this.followUpQueue.cancelDirectInput(session);
  }

  async closeThread(payload: CloseThreadPayload): Promise<void> {
    await this.retireThreadRuntime(payload);
  }

  /**
   * Confirmed-retirement close: `confirmed` is true only when a live runtime
   * existed and every owned process effect was observed retired (or when there
   * was nothing live to retire). A retained/unconfirmed retirement reports
   * false and keeps its execution slot counted — destructive host policy must
   * not delete the row in that case.
   */
  async closeThreadConfirmed(payload: CloseThreadPayload): Promise<CloseThreadConfirmedResult> {
    return this.retireThreadRuntime(payload);
  }

  private async retireThreadRuntime(
    payload: CloseThreadPayload,
  ): Promise<CloseThreadConfirmedResult> {
    const shell = this.shellSessions.get(payload.threadId);
    if (shell) {
      shell.ignoreExit = true;
      this.shellSessions.delete(payload.threadId);
      this.clearRetainedShellSnapshot(payload.threadId);
      this.rememberRemovedThread(payload.threadId);
      const confirmed = await this.sessionRetirement.retireShellSession(shell);
      if (confirmed) {
        this.retiringShells.delete(payload.threadId);
      } else {
        // Reachable custody plus a truthful failure: capacity is retained and
        // a later close/start/shutdown retry can finish the kill.
        this.retiringShells.set(payload.threadId, shell);
        console.warn(
          `[supervisor] shell ${payload.threadId} retirement was not confirmed; its execution slot stays counted.`,
        );
      }
      return { confirmed };
    }

    const existing = this.sessions.get(payload.threadId);
    if (!existing) {
      let confirmed = true;
      if (this.startLocks.has(payload.threadId)) {
        this.pendingStartAborts.add(payload.threadId);
        this.rememberRemovedThread(payload.threadId);
        return { confirmed };
      }
      // Custody retained by an earlier failed retirement/abandonment: a close
      // retry joins and retries it instead of silently giving up. The sync
      // guards keep the common no-session close free of an await.
      if (this.sessionRetirement.hasAbandoned("agent-session", payload.threadId)) {
        try {
          await this.sessionRetirement.retryAbandoned("agent-session", payload.threadId);
        } catch (error) {
          console.warn(`[supervisor] thread ${payload.threadId} cleanup retry failed:`, error);
          confirmed = false;
        }
      }
      if (this.retiringSessions.has(payload.threadId)) {
        try {
          await this.retryRetainedSession(payload.threadId);
        } catch (error) {
          console.warn(`[supervisor] thread ${payload.threadId} retirement retry failed:`, error);
          confirmed = false;
        }
      }
      return { confirmed };
    }

    existing.ignoreExit = true;
    this.rememberRemovedThread(payload.threadId);
    this.outputPipeline.clearSessionTimers(existing);
    this.followUpQueue.onSessionClosing(payload.threadId, existing);
    existing.stopSessionRefWatcher?.();
    existing.stopSessionRefWatcher = undefined;
    // Final state before the session disappears: without it a working thread
    // freezes at `working` in the DB and in every renderer, with nothing left
    // running to ever move it.
    this.outputPipeline.updateState(existing, "inactive", "none", undefined, {
      forceCloseActiveTurn: true,
    });
    this.sessions.delete(payload.threadId);
    this.canonicalOverflowStopped.delete(payload.threadId);
    if (existing.sessionRef?.providerSessionId) {
      this.sessionsBySessionId.delete(existing.sessionRef.providerSessionId);
    }
    this.runtimeEventRouter.clearAllForThread(payload.threadId);
    this.options.crossagentMcp?.cancelAll(payload.threadId);
    this.options.crossagentMcp?.unregister(payload.threadId);
    const outcome = await this.sessionRetirement.retireAgentSession(existing);
    if (outcome.confirmed) {
      this.retiringSessions.delete(payload.threadId);
    } else {
      // Keep the session (handle/lease/pending disposal) reachable so a later
      // close/start/shutdown retry can join it; capacity stays counted.
      this.retiringSessions.set(payload.threadId, existing);
      console.warn(
        `[supervisor] thread ${payload.threadId} retirement was not confirmed; its execution slot stays counted.`,
      );
    }
    if (outcome.error) {
      throw toError(outcome.error);
    }
    return { confirmed: outcome.confirmed };
  }

  async startShell(payload: StartShellPayload): Promise<void> {
    ensureNodePtySpawnHelperExecutable();
    this.recentlyRemovedThreadIds.delete(payload.shellId);
    // Id reuse must not append old retained bytes to a new generation.
    this.clearRetainedShellSnapshot(payload.shellId);
    // A same-id shell whose close was never confirmed is joined/retried
    // before a new reservation: a later start retry finishes the old kill.
    if (
      this.retiringShells.has(payload.shellId) &&
      !(await this.retryRetainedShell(payload.shellId))
    ) {
      throw new Error(
        `Shell ${payload.shellId} did not confirm exit; refusing to start a replacement.`,
      );
    }
    const existing = this.shellSessions.get(payload.shellId);
    // Admit before touching a same-id predecessor. A full class refuses here,
    // leaving a live shell untouched.
    const resourceLease = acquireOrHandoff(this.hostResourceAdmission, existing?.resourceLease, {
      resourceClass: "terminal-shell",
      key: payload.shellId,
    });
    if (existing) {
      // Replacement gate: the successor must not start until the predecessor's
      // exit is observed. An unconfirmed kill retains the slot and refuses the
      // replacement instead of running two shells under one id.
      existing.ignoreExit = true;
      const confirmed = await this.sessionRetirement.retireShellSession(existing);
      if (!confirmed) {
        resourceLease.cancel();
        throw new Error(
          `Shell ${payload.shellId} did not confirm exit; refusing to start a replacement.`,
        );
      }
      if (this.shellSessions.get(payload.shellId) === existing) {
        this.shellSessions.delete(payload.shellId);
      }
    }

    // Capture project-scoped shell env (fnm / nvm / asdf / mise cd-hooks
    // fire when the prime probe runs inside the project root) so the
    // user's pinned Node/Python/Ruby are on PATH before the PTY spawns.
    if (shouldPrimeNativeProjectShellEnv(payload.projectLocation)) {
      await primeProjectShellEnv(payload.projectLocation.path);
    }

    const windowsShell =
      process.platform === "win32" && payload.projectLocation.kind === "windows"
        ? this.options.resolveWindowsShell(
            payload.windowsShellRuntime === "powershell" ? "powershell" : "preferred",
          )
        : { shell: "", kind: "cmd" as const, args: [] };
    const shellCommand = buildShellCommand(payload.projectLocation, windowsShell, {
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
      resourceLease.cancel();
      throw new Error(describeSpawnFailure("shell", shellCommand, shellEnv, error), {
        cause: error,
      });
    }

    const session: ShellSessionRuntime = {
      instanceId: randomUUID(),
      shellId: payload.shellId,
      pty,
      resourceLease,
      projectLocation: payload.projectLocation,
      outputLength: 0,
      outputTranscript: new TranscriptBuffer(200_000),
      ...(payload.worktreePath ? { worktreePath: payload.worktreePath } : {}),
    };

    this.shellSessions.set(payload.shellId, session);
    this.ptyLifecycle.track(session);
    pty.onData((data) => {
      if (this.shellSessions.get(payload.shellId)?.instanceId !== session.instanceId) {
        return;
      }
      session.outputLength += data.length;
      session.outputTranscript.append(data);
      if (this.options.isDev) {
        this.logWriter.append(this.resolveLogPath(payload.shellId.replace(/:/g, "_")), data);
      }
      this.options.emit({
        type: "thread-output",
        threadId: payload.shellId,
        data,
        outputLength: session.outputLength,
        terminalInstanceId: session.instanceId,
      });
    });

    pty.onExit(({ exitCode }) => {
      this.ptyLifecycle.resolveExit(session);
      // Exit is the only release signal; a late predecessor exit is
      // instance-keyed, so it can neither free nor evict its successor.
      session.resourceLease?.confirmExit();
      if (this.retiringShells.get(payload.shellId) === session) {
        this.retiringShells.delete(payload.shellId);
      }
      if (session.ignoreExit) {
        return;
      }
      if (this.shellSessions.get(payload.shellId)?.instanceId !== session.instanceId) {
        return;
      }
      this.retainExitedShellSnapshot(session);
      this.shellSessions.delete(payload.shellId);
      this.rememberRemovedThread(payload.shellId);
      this.options.emit({
        type: "thread-exited",
        threadId: payload.shellId,
        exitCode: exitCode ?? null,
      });
    });

    resourceLease.activate();
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
    return this.outputPipeline.readTerminalScrollback(
      this.sessions.get(threadId) ?? this.shellSessions.get(threadId),
    );
  }

  readTerminalSize(threadId: string): TerminalSize | null {
    return this.sessions.get(threadId)?.terminalSize ?? null;
  }

  /**
   * Snapshot for remote terminal cursor-sync. Returns live or retained-exited
   * state only — the remote server falls back to persisted SQLite scrollback
   * when this is null.
   *
   * Live agent sessions require an actual PTY **and** effective terminal
   * presentation (`session.presentationMode ?? adapter.capabilities.presentationMode`).
   * GUI/structured SessionRuntime entries often have `pty`/`ptyExited` unset;
   * returning an empty "running" snapshot for those would shadow the SQLite
   * fallback. A helper `structuredSession` on a terminal PTY does **not**
   * disqualify the live path. `processState` follows `ptyExited`.
   */
  readTerminalSnapshot(threadId: string): TerminalSnapshot | null {
    const session = this.sessions.get(threadId);
    if (session && isTerminalPtySession(session)) {
      return snapshotFromLiveSession(session, session.ptyExited ? "exited" : "running");
    }
    const shell = this.shellSessions.get(threadId);
    if (shell) {
      return snapshotFromLiveShell(shell, shell.ptyExited ? "exited" : "running");
    }
    const retained = this.exitedShellSnapshots.get(threadId);
    if (retained && !isRetainedShellExpired(retained)) {
      return {
        generation: retained.generation,
        fromCursor: retained.fromCursor,
        toCursor: retained.toCursor,
        data: retained.data,
        processState: "exited",
        terminalSize: retained.terminalSize,
      };
    }
    if (retained) this.exitedShellSnapshots.delete(threadId);
    return null;
  }

  private retainExitedShellSnapshot(shell: ShellSessionRuntime): void {
    putRetainedShellSnapshot(this.exitedShellSnapshots, buildRetainedShellSnapshot(shell));
  }

  private clearRetainedShellSnapshot(threadId: string): void {
    this.exitedShellSnapshots.delete(threadId);
  }

  readThreadBackgroundTasks(threadId: string): readonly BackgroundTask[] {
    return this.sessions.get(threadId)?.structuredSession?.getBackgroundTasks?.() ?? [];
  }

  handlePtyDataForTests(session: SessionRuntime, data: string): void {
    this.outputPipeline.handlePtyData(session, data);
  }

  spawnThreadForTests(input: SpawnThreadInput): SessionRuntime {
    return this.spawnPipeline.spawnThread(input);
  }

  async dispose(): Promise<boolean> {
    this.disposed = true;
    this.followUpQueue.dispose();
    for (const threadId of this.startLocks.keys()) {
      this.pendingStartAborts.add(threadId);
    }

    this.runtimeEventRouter.flush();
    await Promise.allSettled(
      [...this.sessions.values()].map(async (session) => {
        session.ignoreExit = true;
        this.rememberRemovedThread(session.threadId);
        this.outputPipeline.clearSessionTimers(session);
        await this.sessionRetirement.retireAgentSession(session);
      }),
    );
    this.sessions.clear();
    this.sessionsBySessionId.clear();

    for (const shell of this.shellSessions.values()) {
      shell.ignoreExit = true;
      this.rememberRemovedThread(shell.shellId);
      void this.sessionRetirement.retireShellSession(shell);
    }
    // Retained custody from earlier unconfirmed retirements joins this
    // shutdown retry (each join is bounded). A released lease prunes; a
    // still-unconfirmed record keeps its custody for diagnostics.
    await Promise.allSettled(
      [...this.retiringSessions.keys()].map((threadId) => this.retryRetainedSession(threadId)),
    );
    await Promise.allSettled(
      [...this.retiringShells.keys()].map((shellId) => this.retryRetainedShell(shellId)),
    );
    await this.sessionRetirement.retryAllAbandoned();
    // Do not report supervisor shutdown complete while a killed PTY can still
    // emit bytes or mutate its session. The lifecycle helper bounds each wait
    // so a broken native exit callback cannot hold the owner forever.
    const ptysExited = await this.ptyLifecycle.waitForAllExits();
    this.shellSessions.clear();
    this.logWriter.dispose();
    return ptysExited;
  }

  private requireSession(threadId: string): SessionRuntime {
    const session = this.sessions.get(threadId);
    if (!session) {
      throw new Error(`Unknown thread session: ${threadId}`);
    }
    return session;
  }

  /**
   * Input can race an in-progress reconnect before `spawnPipeline` publishes
   * the new SessionRuntime. Wait for that thread's serialized start instead of
   * surfacing a false "Unknown thread session" error. Callers still decide
   * normal-turn vs steer from the authoritative session status after startup.
   */
  private async findSessionAfterPendingStart(
    threadId: string,
  ): Promise<SessionRuntime | undefined> {
    const live = this.sessions.get(threadId);
    if (live) return live;
    const pendingStart = this.startLocks.get(threadId);
    if (!pendingStart) return undefined;
    await pendingStart;
    return this.sessions.get(threadId);
  }

  /**
   * A failed restart must never strand the submitted turn: the renderer has
   * already painted the user message and an optimistic working state, so a
   * bare rejection leaves the thread "working" forever with the send lost.
   * Settle it with a visible error item and an errored thread state, then
   * rethrow so the caller still learns the launch failed.
   */
  private async restartThreadSettlingFailure(
    session: SessionRuntime,
    turn: QueuedStructuredTurn,
  ): Promise<void | StructuredTurnResult> {
    try {
      return await this.spawnPipeline.restartThread(session, turn);
    } catch (error) {
      if (this.isCurrentSession(session)) {
        const message = error instanceof Error ? error.message : String(error);
        this.structuredFailureReporter.capture(session, error);
        this.enqueueRuntimeEvent(session.threadId, {
          type: "error",
          threadId: session.threadId,
          message,
        });
        this.outputPipeline.updateState(session, "error", "none", message, {
          forceCloseActiveTurn: true,
        });
      }
      throw error;
    }
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

  private resolveAgentSettings(
    adapter: AgentAdapter,
    location?: ProjectLocation,
  ): Record<string, boolean | string> {
    const settings = readSupervisorSharedSettings(this.options.settingsPath);
    const env = location ? agentEnvForLocation(location) : { kind: "native" as const };
    return {
      ...(adapter.capabilities.agentSettingsDefaults ?? {}),
      ...effectiveAgentSettings(settings, localMachineKey(env), adapter.kind),
    };
  }
}

/** True when the session backs a real terminal-presentation PTY (not GUI/structured-only). */
function isTerminalPtySession(session: SessionRuntime): boolean {
  if (!session.pty) return false;
  const presentationMode =
    session.presentationMode ?? session.adapter.capabilities.presentationMode;
  return presentationMode === "terminal";
}
