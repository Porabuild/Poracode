import { randomUUID } from "node:crypto";
import { claudeContextWindowEnv, resolveClaudeContextWindowTokens } from "./contextWindow";
import { spawn as spawnChild, type ChildProcess } from "node:child_process";
import type {
  CanUseTool,
  ElicitationResult,
  OnElicitation,
  Options as ClaudeQueryOptions,
  PermissionMode,
  PermissionResult,
  PermissionUpdate,
  Query,
  SDKMessage,
  SlashCommand,
  SpawnOptions,
  SpawnedProcess,
} from "@anthropic-ai/claude-agent-sdk";
import type {
  AgentSlashCommand,
  BackgroundTask,
  PromptSegment,
  ProviderRevertAnchor,
  RuntimeEvent,
  SessionRef,
  ThreadAttention,
  ThreadConfig,
  ThreadServerRequestId,
  ThreadStatus,
  TurnState,
} from "@/shared/contracts";
import { areAgentSlashCommandsEqual, isThreadConfigEqual } from "@/shared/contracts";
import { awaitProcessTermination } from "@/shared/awaitProcessTermination";
import { msg } from "@/shared/messages";
import { buildClaudeMcpServers } from "../userMcp";
import {
  createKnownSessionRef,
  getPrimedPosixEnv,
  getProjectShellEnv,
  primeWslProjectShellEnv,
  resolveExecutablePathAsync,
  type AgentLaunchOptions,
  type CreateStructuredSessionInput,
  type StartTurnOptions,
  type StructuredSessionHandle,
  type StructuredSessionListener,
  type StructuredSessionUpdate,
  type ThreadHistory,
} from "../base";
import { captureSupervisorException } from "../../diagnostics/sentry";
import { resolveAgentBinaryPath } from "../binaryResolver";
import { DeferredTurnCompletion } from "./deferredTurnCompletion";
import { clearBackgroundTasks, hasAwaitedBackgroundWork } from "./canonicalMapping/backgroundTasks";
import { ClaudeBackgroundTaskControls } from "./backgroundTaskControls";
import {
  isExitPlanModeToolName,
  isSubAgentParentTool,
} from "./canonicalMapping/toolClassification";
import { applyClaudeContextSuffix } from "./argv";
import {
  buildClaudeQuestionAnswerEvents,
  ClaudeUsageScopeTracker,
  closeClaudeOpenItems,
  closeClaudeGenerationItems,
  completeActiveGoalOnTaskDrainEvents,
  createClaudeMapperState,
  emitActiveGoalTick,
  extractResultErrorMessage,
  isApiErrorResult,
  mapClaudePermissionRequest,
  mapClaudeQuestionRequest,
  mapClaudeContextUsageResponse,
  mapClaudeSdkMessage,
  nonDiagnosticErrors,
  parseClaudeQuestions,
  readParentToolUseId,
  startClaudeTurn,
  steerClaudeTurn,
  type ClaudeMapperState,
} from "./sdkCanonicalMapping";
import { mapClaudeSlashCommands } from "./probe";
import { AsyncPromptQueue } from "./promptQueue";
import {
  ClaudeSteerDelivery,
  interruptClaudeQuery,
  isGoalMutationPrompt,
  type ClaudeForegroundSteerState,
} from "./steerDelivery";
import {
  claudeSdkPermissionArgs,
  projectCwd,
  spawnClaudeInWsl,
  spawnClaudeNative,
} from "./sdkSpawn";
import { canDeferClaudeMcpConnections, ClaudeSdkMcpServers } from "./sdkMcp";
import { claudeSdkNativeChromeArgs } from "./nativeChrome";
import { mapClaudeElicitationRequest, normalizeClaudeElicitationResponse } from "./sdkElicitation";
import { claudeSdkSettingsEnv } from "./sdkSettings";
import { buildSdkUserMessage } from "./sdkPrompt";
import {
  basePermissionModeForConfig,
  buildDenyMessage,
  canBypassPlanPermission,
  exitPlanApprovalMode,
  isQuestionCancelResponse,
  normalizeQuestionAnswersForSdk,
  permissionDecision,
  permissionModeForConfig,
  rawQuestionAnswers,
  type PendingPermission,
  type PendingRequest,
} from "./sdkResponses";

type CompletedClaudeTurn = {
  resumeSessionAt: string | undefined;
};

interface ClaudeRevertAnchorData {
  resumeSessionAt: string;
}

/** Validates the opaque anchor payload for this provider. */
function parseClaudeRevertAnchor(anchor: ProviderRevertAnchor): ClaudeRevertAnchorData {
  const data = anchor.data as Partial<ClaudeRevertAnchorData> | null | undefined;
  if (anchor.version !== 1 || typeof data?.resumeSessionAt !== "string") {
    throw new Error("Claude SDK revert anchor payload is invalid or from an incompatible version.");
  }
  return { resumeSessionAt: data.resumeSessionAt };
}

/**
 * How long a drained deferred completion waits before settling the thread.
 * Sized to cover the SDK's task_notification → model-wake gap (a
 * session_state "running" restarts it, so it only needs to reach the wake
 * signal, not the first streamed token).
 */
const DEFERRED_FLUSH_RESUME_GRACE_MS = 5000;

export class ClaudeSdkSession implements StructuredSessionHandle {
  launchOptions: AgentLaunchOptions = { suppressResumeConfigOverrides: true };
  /** Inline instructions mean "skill not native" here, and a slash command must stay last. */
  readonly placesTurnContext = true;

  private readonly input: CreateStructuredSessionInput;
  private listener: StructuredSessionListener | undefined;
  private mapperState: ClaudeMapperState;
  private promptQueue = new AsyncPromptQueue();
  private pendingPromptAdmission: { generation: number; acknowledge: () => void } | undefined;
  private queryRuntime: Query | undefined;
  private queryReady: Promise<Query> | undefined;
  // Query.close() initiates shutdown; captured children prove it has finished.
  private readonly spawnedProcesses = new Set<ChildProcess>();
  private readonly ownedProcessGroups = new WeakSet<ChildProcess>();
  private readonly processTerminations = new Map<ChildProcess, Promise<void>>();
  private disposal: Promise<void> | undefined;
  private streamStarted = false;
  private disposed = false;
  private sessionId: string | undefined;
  private openedResumeSessionId: string | undefined;
  private currentConfig: ThreadConfig;
  private appliedModel: string | undefined;
  private appliedContextWindow: number | undefined;
  // Launch-time size: a relaunch deferred behind background work keeps this model variant.
  private appliedContextSize: string | undefined;
  private sessionHasHistory = false;
  private appliedPermissionMode: PermissionMode | undefined;
  private bypassPlanPermissions = false;
  private appliedSandboxDisabled = false;
  private readonly mcpServers: ClaudeSdkMcpServers;
  private appliedUltracode = false;
  private appliedFast = false;
  private currentStatus: ThreadStatus = "idle";
  private currentAttention: ThreadAttention = "none";
  private currentSlashCommands: AgentSlashCommand[] | undefined;
  /** Raw SDK command list, kept so a later skill-name update can re-flavor it. */
  private lastSdkCommands: readonly SlashCommand[] | undefined;
  /** Skill names last reported by the CLI (`skills` on the `system` init message). */
  private lastSkillNames: ReadonlySet<string> | undefined;
  private pendingRequests = new Map<ThreadServerRequestId, PendingRequest>();
  private completedTurns: CompletedClaudeTurn[] = [];
  private currentTurnAssistantUuid: string | undefined;
  private currentTurnInFlight = false;
  /** Resume point the live query was opened at (revert-anchor idempotence). */
  private activeResumeAt: string | undefined;
  private pendingSteers: Parameters<ClaudeSdkSession["startTurn"]>[] = [];
  private submissionGeneration = 0;
  private steerError: string | undefined;
  private readonly steerDelivery = new ClaudeSteerDelivery();
  // A turn's `result` settles its status immediately, but flipping the thread
  // to idle while a background subagent task is still live would mark a GUI
  // thread finished mid-work. Hold the completion status here until the
  // live-task registry drains; flush it if the stream stops first.
  private readonly deferredCompletion = new DeferredTurnCompletion();
  private readonly backgroundTaskControls: ClaudeBackgroundTaskControls;
  // Grace timer between the last task_notification draining the registry and
  // the deferred completion actually flushing. The SDK usually wakes the model
  // right after that notification to consume the results; flushing idle in
  // that gap resets the thread's "Working for" timer and fires a premature
  // done-notification. See flushDeferredCompletionIfDrained.
  private deferredFlushTimer: ReturnType<typeof setTimeout> | undefined;
  // openThread() fires `startQuery` as a fire-and-forget IIFE and returns
  // synchronously, but the runtime calls `setListener` only afterwards from
  // `spawnThread`. Anything emitted in that window — early SDK system/stream
  // messages, or the catch-block error from a failed spawn/import — would be
  // dropped by `?.` chaining. Buffer here and drain on attach.
  private bufferedRuntimeEvents: RuntimeEvent[] = [];
  private pendingError: string | undefined;
  // Set when `interruptTurn()` runs; cleared when the next `result` arrives.
  // Lets us classify the post-interrupt result as interrupted even when
  // claude.exe emits subtype "error_during_execution" without "abort"/"interrupt"
  // in the errors array — otherwise the supervisor's drain-on-idle hook would
  // miss the steer and the staged prompt would never flush.
  private interruptInFlight = false;
  /**
   * Set while Poracode itself interrupts a turn to deliver a goal set/clear
   * steer: the interrupted-result cleanup must then keep every staged steer
   * (not only goal ones) because the user never asked to cancel them.
   */
  private goalSteerInterruptInFlight = false;
  private goalTrackingTimer: ReturnType<typeof setInterval> | undefined;

  private constructor(input: CreateStructuredSessionInput) {
    this.input = input;
    this.mcpServers = new ClaudeSdkMcpServers(input.resolveMcpServersForTurn);
    this.currentConfig = input.config;
    this.mapperState = createClaudeMapperState(input.threadId);
    this.backgroundTaskControls = new ClaudeBackgroundTaskControls(this.mapperState, () =>
      this.disposed ? undefined : this.queryRuntime,
    );
  }

  static create(input: CreateStructuredSessionInput): Promise<ClaudeSdkSession> {
    return Promise.resolve(new ClaudeSdkSession(input));
  }

  setListener(listener: StructuredSessionListener): void {
    this.listener = listener;
    if (this.bufferedRuntimeEvents.length > 0 && listener.onRuntimeEvent) {
      const drain = this.bufferedRuntimeEvents;
      this.bufferedRuntimeEvents = [];
      for (const ev of drain) listener.onRuntimeEvent(ev);
    }
    if (this.currentSlashCommands !== undefined) {
      listener.onUpdate({
        status: this.currentStatus,
        attention: this.currentAttention,
        slashCommands: this.currentSlashCommands,
        ...(this.sessionId ? { sessionRef: createKnownSessionRef(this.sessionId) } : {}),
      });
    }
    if (this.pendingError !== undefined) {
      const message = this.pendingError;
      this.pendingError = undefined;
      listener.onError(message);
    }
  }

  getBackgroundTasks(): readonly BackgroundTask[] {
    return this.backgroundTaskControls.decorate(this.mapperState.reportedBackgroundTasks ?? []);
  }

  listSessionActions() {
    return this.backgroundTaskControls.listActions();
  }

  invokeSessionAction(actionId: string, payload: unknown): Promise<Record<string, unknown>> {
    return this.backgroundTaskControls.invoke(actionId, payload);
  }

  private emitUpdate(update: StructuredSessionUpdate): void {
    this.currentStatus = update.status;
    this.currentAttention = update.attention;
    this.listener?.onUpdate({
      ...update,
      ...(this.currentSlashCommands !== undefined && update.slashCommands === undefined
        ? { slashCommands: this.currentSlashCommands }
        : {}),
    });
  }

  private updateSlashCommands(commands: AgentSlashCommand[]): void {
    if (areAgentSlashCommandsEqual(this.currentSlashCommands, commands)) {
      return;
    }
    this.currentSlashCommands = commands;
    this.listener?.onUpdate({
      status: this.currentStatus,
      attention: this.currentAttention,
      slashCommands: commands,
      ...(this.sessionId ? { sessionRef: createKnownSessionRef(this.sessionId) } : {}),
    });
  }

  /**
   * Re-maps the last raw SDK command list against the last-seen skill names.
   * Commands and skill names arrive on independent paths (control response vs.
   * the `system` init stream message), so either side re-applies on arrival and
   * `updateSlashCommands` swallows the no-op.
   */
  private applySdkSlashCommands(commands?: readonly SlashCommand[]): void {
    if (commands) this.lastSdkCommands = commands;
    const raw = this.lastSdkCommands;
    if (!raw || raw.length === 0) return;
    this.updateSlashCommands(mapClaudeSlashCommands(raw, this.lastSkillNames));
  }

  /** Skill names from the CLI's `system` init message; ignored on older CLIs. */
  private captureSkillNames(names: unknown): void {
    if (!Array.isArray(names)) return;
    const skillNames = new Set(names.filter((name): name is string => typeof name === "string"));
    if (
      this.lastSkillNames &&
      this.lastSkillNames.size === skillNames.size &&
      [...skillNames].every((name) => this.lastSkillNames?.has(name))
    ) {
      return;
    }
    this.lastSkillNames = skillNames;
    this.applySdkSlashCommands();
  }

  private async refreshSlashCommands(runtime: Query): Promise<void> {
    try {
      const init = await runtime.initializationResult();
      if (init.commands.length > 0) {
        this.applySdkSlashCommands(init.commands);
        return;
      }
    } catch {
      // Fall back to the narrower command-list control request below.
    }

    try {
      const supported = await runtime.supportedCommands();
      if (supported.length > 0) {
        // Reuses the last-seen skill set, so the fallback list is split the
        // same way as the init list.
        this.applySdkSlashCommands(supported);
      }
    } catch {
      // Install-time/default capabilities still provide the static fallback.
    }
  }

  async activate(): Promise<void> {
    if (this.disposed) throw new Error("ClaudeSdkSession was disposed before activation.");
  }

  async openThread(config: ThreadConfig, sessionRef?: SessionRef): Promise<string> {
    this.currentConfig = config;
    this.sessionId = sessionRef?.providerSessionId ?? randomUUID();
    this.openedResumeSessionId = sessionRef?.providerSessionId;
    this.sessionHasHistory = this.openedResumeSessionId !== undefined;
    // Usage scope for per-call spend events: fresh only when the SDK session
    // starts brand-new (a resumed session's history is not new spend).
    this.mapperState.usageScope = new ClaudeUsageScopeTracker(
      this.sessionId,
      this.openedResumeSessionId === undefined,
    );
    this.startQuery(sessionRef?.providerSessionId);
    await this.requireQuery();
    return this.sessionId ?? "";
  }

  async startTurn(
    prompt: string,
    config: ThreadConfig,
    segments?: PromptSegment[],
    options?: StartTurnOptions,
  ): Promise<void> {
    if (this.disposed) return;
    this.bypassPlanPermissions = false;
    // The CLI reads its auto-compact window at launch: applyFlagSettings does
    // not change the effective window (verified with SDK/CLI 0.3.296/2.1.296).
    // A relaunch would end the CLI's background tasks, so while any are live
    // the turn runs on the current process and the first turn after they
    // drain applies the new window.
    if (
      this.queryRuntime &&
      resolveClaudeContextWindowTokens(config.contextSize) !== this.appliedContextWindow &&
      !this.hasLiveBackgroundWork()
    ) {
      this.currentConfig = config;
      this.reopenQuery(this.sessionHasHistory ? this.sessionId : undefined, this.activeResumeAt);
      void this.requireQuery().then(
        () => this.refreshContextUsage(),
        () => {},
      );
    }
    const generation = ++this.submissionGeneration;
    this.steerError = undefined;
    this.beginTurn(prompt, config, segments, options);

    const query = await this.requireQuery();
    const isCurrent = () =>
      !this.disposed && generation === this.submissionGeneration && query === this.queryRuntime;
    if (!isCurrent()) return;
    await this.mcpServers.sync(query, config, isCurrent);
    if (!isCurrent()) return;
    await this.syncModel(query, config);
    if (!isCurrent()) return;
    const permissionMode = permissionModeForConfig(config);
    const basePermissionMode = basePermissionModeForConfig(config);
    const bypassPlan = config.mode === "plan" && basePermissionMode === "bypassPermissions";
    if (config.mode === "plan" && (bypassPlan || basePermissionMode === "auto")) {
      // Native Plan entry remembers the preceding mode. Re-enter Auto so its
      // classifier survives a policy/model change while already planning.
      // Confirm Bypass is permitted before honoring it in canUseTool; the
      // SDK's allowDangerouslySkipPermissions only makes it selectable.
      await query.setPermissionMode(basePermissionMode);
      this.appliedPermissionMode = basePermissionMode;
      if (!isCurrent()) return;
    }
    if (permissionMode !== this.appliedPermissionMode || config.mode === "plan") {
      await query.setPermissionMode(permissionMode);
      this.appliedPermissionMode = permissionMode;
    }

    if (!isCurrent()) return;
    this.bypassPlanPermissions = bypassPlan;
    await this.syncSandbox(query, config);
    if (!isCurrent()) return;
    await this.syncUltracodeFlag(query);
    await this.syncFastMode(query);

    const message = await buildSdkUserMessage(
      prompt,
      segments,
      options?.inlineInstructions,
      options?.turnContext,
    );
    if (this.disposed || generation !== this.submissionGeneration) return;
    this.pendingPromptAdmission = options?.onPromptSubmitted
      ? { generation, acknowledge: options.onPromptSubmitted }
      : undefined;
    this.promptQueue.push(message);
  }

  private beginTurn(
    prompt: string,
    config: ThreadConfig,
    segments?: PromptSegment[],
    options?: StartTurnOptions,
  ): void {
    this.currentConfig = config;
    const turnId = `turn-${randomUUID()}`;
    this.currentTurnAssistantUuid = undefined;
    this.currentTurnInFlight = true;
    this.deferredCompletion.clear();
    this.clearDeferredFlushTimer();
    this.emitRuntimeEvents(
      startClaudeTurn(this.mapperState, turnId, prompt, segments, options?.userMessageItemId),
    );
    this.emitUpdate({ status: "working", attention: "working" });
    this.startGoalTracking();
  }

  /**
   * Deliver ordinary follow-ups immediately through the SDK without
   * resetting the running mapper. Commands and config changes need a fresh
   * turn; older CLIs also keep local admission because Stop cannot cancel
   * their queued input atomically.
   */
  async steerTurn(
    prompt: string,
    config: ThreadConfig,
    segments?: PromptSegment[],
    options?: StartTurnOptions,
  ): Promise<void> {
    if (this.disposed) return;
    if (!this.currentTurnInFlight && !this.steerDelivery.hasPending) {
      return this.startTurn(prompt, config, segments, options);
    }
    const userMessageItemId = options?.userMessageItemId ?? `user-${randomUUID()}`;
    const steerOptions = { ...options, userMessageItemId };
    if (
      !this.steerDelivery.supported ||
      this.pendingSteers.length > 0 ||
      prompt.trimStart().startsWith("/") ||
      !isThreadConfigEqual(this.currentConfig, config)
    ) {
      this.pendingSteers.push([prompt, config, segments, steerOptions]);
      this.emitRuntimeEvents(
        steerClaudeTurn(this.mapperState, prompt, segments, userMessageItemId),
      );
      if (this.currentTurnInFlight && isGoalMutationPrompt(prompt)) this.interruptForGoalSteer();
      return;
    }
    const uuid = randomUUID();
    const generation = this.submissionGeneration;
    this.steerDelivery.add(uuid, [prompt, config, segments, steerOptions]);
    this.emitRuntimeEvents(steerClaudeTurn(this.mapperState, prompt, segments, userMessageItemId));
    try {
      await this.steerDelivery.serialize(async () => {
        if (this.disposed || generation !== this.submissionGeneration) return;
        const query = await this.requireQuery();
        await this.mcpServers.sync(
          query,
          config,
          () =>
            !this.disposed &&
            generation === this.submissionGeneration &&
            query === this.queryRuntime,
        );
        if (this.disposed || generation !== this.submissionGeneration) return;
        const message = await buildSdkUserMessage(
          prompt,
          segments,
          options?.inlineInstructions,
          options?.turnContext,
        );
        if (this.disposed || generation !== this.submissionGeneration) return;
        // A child may execute before the CLI registers its task. Wait for
        // that readiness edge instead of interrupting and killing it.
        let foreground: ClaudeForegroundSteerState = "none";
        if (this.pendingRequests.size === 0 && this.queryRuntime) {
          foreground = await this.steerDelivery.backgroundForegroundTools(
            this.queryRuntime,
            () =>
              [...this.mapperState.toolItemsById.values()].filter(
                (tool) =>
                  !tool.inputStreaming &&
                  !this.mapperState.subAgentChildToolItemIds?.has(tool.itemId) &&
                  (tool.itemType === "command_execution" || isSubAgentParentTool(tool)),
              ),
            () =>
              !this.disposed &&
              generation === this.submissionGeneration &&
              this.pendingRequests.size === 0,
          );
        }
        if (this.disposed || generation !== this.submissionGeneration) return;
        if (
          this.queryRuntime &&
          foreground === "none" &&
          !this.steerDelivery.canSendNow(this.queryRuntime) &&
          !this.steerDelivery.hasBackgroundedTools &&
          !this.hasLiveBackgroundWork() &&
          this.pendingRequests.size === 0
        ) {
          // Interrupt BEFORE sending new input so the old abort cannot catch
          // the replacement cycle. Leave earlier SDK-queued input runnable.
          await interruptClaudeQuery(this.queryRuntime, false).catch(() => {});
        }
        if (this.disposed || generation !== this.submissionGeneration) return;
        // Keep an open question/permission callback intact until it is answered.
        const priority = this.pendingRequests.size > 0 ? "later" : "now";
        this.promptQueue.push({ ...message, uuid, priority });
        if (priority === "now" && foreground !== "blocked" && this.queryRuntime) {
          await this.steerDelivery.sendNow(
            this.queryRuntime,
            uuid,
            () =>
              !this.disposed &&
              generation === this.submissionGeneration &&
              this.pendingRequests.size === 0,
          );
        }
      });
    } catch (error) {
      if (this.disposed || generation !== this.submissionGeneration) return;
      this.steerError = error instanceof Error ? error.message : String(error);
      this.submissionGeneration++;
      this.pendingSteers = [];
      this.steerDelivery.clear();
      this.promptQueue.clear();
      this.deferredCompletion.clear();
      this.clearDeferredFlushTimer();
      if (this.queryRuntime) {
        void interruptClaudeQuery(this.queryRuntime, true).catch(() => {});
      }
      this.emitUpdate({ status: "error", attention: "error", errorMessage: this.steerError });
      throw error;
    }
  }

  /**
   * A goal set/clear cannot wait for the running turn: the CLI's goal Stop hook
   * may keep it open forever. Interrupt it (after backgrounding live work),
   * re-stage any SDK-queued steers ahead of the goal command (the interrupt
   * cancels their SDK copies so they cannot run inside the dying turn), and let the interrupted result open the goal
   * command as a fresh turn via startPendingSteer. The user row was already
   * painted by steerTurn; startClaudeTurn re-emits it under the same item id,
   * which the stores treat as a no-op.
   */
  private interruptForGoalSteer(): void {
    if (this.interruptInFlight || !this.queryRuntime) return;
    this.submissionGeneration++;
    this.pendingSteers = [...this.steerDelivery.takePending(), ...this.pendingSteers];
    this.promptQueue.clear();
    this.interruptInFlight = true;
    this.goalSteerInterruptInFlight = true;
    const runtime = this.queryRuntime;
    const cancelQueued = this.steerDelivery.supported;
    // Same rule as prepareSteerInterrupt: foreground Bash and subagents become
    // background tasks instead of dying with the replaced goal's turn.
    void (async () => {
      try {
        await runtime.backgroundTasks();
      } catch {
        // Older CLIs lack the control request; the interrupt still applies.
      }
      await interruptClaudeQuery(runtime, cancelQueued);
    })().catch(() => {});
  }

  /**
   * Staged steers that outlive an interrupted turn. A Poracode goal-steer
   * interrupt keeps all of them. Any other interrupt (user Stop, in-CLI Esc)
   * drops ordinary follow-ups but still delivers a queued goal set/clear as
   * the next turn: the user explicitly replaced or cleared the goal, and
   * silently dropping it would leave the dock on the goal they abandoned.
   */
  private steersSurvivingInterrupt(goalSteerInterrupt: boolean): typeof this.pendingSteers {
    if (goalSteerInterrupt) return this.pendingSteers;
    return this.pendingSteers.filter(([prompt]) => isGoalMutationPrompt(prompt));
  }

  private startPendingSteer(): boolean {
    const next = this.pendingSteers.shift();
    if (!next) return false;
    // startTurn opens the next lifecycle synchronously, before any idle update
    // can release the supervisor's FIFO queue. It also applies all live config.
    const submission = this.startTurn(...next);
    const generation = this.submissionGeneration;
    void submission.catch((error: unknown) => {
      if (this.disposed || generation !== this.submissionGeneration) return;
      this.pendingSteers = [];
      this.steerDelivery.clear();
      this.promptQueue.clear();
      const message = error instanceof Error ? error.message : String(error);
      this.reportError(message);
      this.emitRuntimeEvents([{ type: "error", threadId: this.input.threadId, message }]);
      this.emitUpdate({ status: "error", attention: "error", errorMessage: message });
    });
    return true;
  }

  /**
   * Preserve Claude's foreground Bash commands and subagents before the shared
   * steer lifecycle interrupts the main turn. The SDK turns them into
   * background tasks, while Poracode stages the replacement prompt and opens it
   * as a fresh turn after the interrupted result settles.
   */
  async prepareSteerInterrupt(): Promise<void> {
    await this.queryRuntime?.backgroundTasks();
  }

  /**
   * Apply the configured model via a live control request when it differs from
   * the last applied one. setModel takes effect at the next turn boundary; it
   * never affects an in-flight turn.
   */
  private async syncModel(runtime: Query, config: ThreadConfig): Promise<void> {
    const model = applyClaudeContextSuffix(config.model, this.appliedContextSize);
    if (model === this.appliedModel) return;
    try {
      await runtime.setModel(model);
      this.appliedModel = model;
    } catch {
      // Older SDK transports can reject live model updates; the launch model still applies.
    }
  }

  private async syncSandbox(runtime: Query, config: ThreadConfig): Promise<void> {
    const disabled = basePermissionModeForConfig(config) === "bypassPermissions";
    if (disabled === this.appliedSandboxDisabled) return;
    // Bypass is Poracode's full-access choice. Inheriting a project's Bash
    // sandbox here prevents native browser launches even after tool approval.
    // Clearing our flag on exit restores the user's saved sandbox settings.
    await runtime.applyFlagSettings({ sandbox: disabled ? { enabled: false } : null });
    this.appliedSandboxDisabled = disabled;
  }

  /**
   * `ultracode` is not a model-level effort: it's a Claude Code session flag
   * that sends `xhigh` to the model and enables dynamic-workflow orchestration.
   * It lives in the flag-settings layer (CLI: `--settings '{"ultracode":true}'`;
   * SDK: applyFlagSettings).
   */
  private async syncUltracodeFlag(runtime: Query): Promise<void> {
    const wantUltracode = this.currentConfig.effort === "ultracode";
    if (wantUltracode === this.appliedUltracode) return;
    try {
      await runtime.applyFlagSettings({
        ultracode: wantUltracode ? true : null,
      });
      this.appliedUltracode = wantUltracode;
    } catch {
      // Older CLIs ignore the unknown flag; effort still degrades to xhigh.
    }
  }

  /**
   * Fast mode is a session flag (`fastMode`), not a model-level setting. Apply
   * it through the flag-settings layer when the user enabled the Fast toggle.
   * When the account can't use fast mode the toggle is gated off upstream, so
   * `config.fast` is never true here in that case.
   */
  private async syncFastMode(runtime: Query): Promise<void> {
    const wantFast = this.currentConfig.fast === true;
    if (wantFast === this.appliedFast) return;
    try {
      await runtime.applyFlagSettings({ fastMode: wantFast ? true : null });
      this.appliedFast = wantFast;
    } catch {
      // Older CLIs ignore the flag; fast mode simply stays off.
    }
  }

  /**
   * WS2 stage 3: freeze the absolute resume point for a `numTurns` rollback
   * without touching session or provider state. The backend journals this
   * anchor and later restores from it, so a retried revert never recomputes
   * the target against an already-rolled-back conversation.
   */
  async createRevertAnchor(numTurns: number): Promise<ProviderRevertAnchor> {
    const resumeSessionAt = this.planResumeAnchor(numTurns);
    return {
      version: 1,
      data: {
        resumeSessionAt,
        remainingTurns: this.completedTurns.length - numTurns,
      },
    };
  }

  /**
   * Reopens the SDK query at the anchor's absolute resume point. Idempotent:
   * re-issuing an applied anchor with an unchanged ledger is a no-op, and a
   * ledger that grew past the anchor truncates back to the anchor's turn.
   */
  async restoreToRevertAnchor(anchor: ProviderRevertAnchor): Promise<ThreadHistory> {
    const data = parseClaudeRevertAnchor(anchor);
    const sessionId = this.assertRollbackReady();
    const resumeSessionAt = data.resumeSessionAt;
    // Absolute ledger truncation: anchor on the recorded turn's resume point,
    // not a relative count. An unknown anchor (fresh process resume with an
    // empty/partial ledger) leaves the ledger alone — the provider-side
    // reopen below still lands on the anchor position.
    const anchorIndex = this.completedTurns.findLastIndex(
      (turn) => turn.resumeSessionAt === resumeSessionAt,
    );
    if (this.activeResumeAt === resumeSessionAt && anchorIndex === this.completedTurns.length - 1) {
      // Already restored to this exact position.
      return { providerSessionId: sessionId, messages: [] };
    }
    if (anchorIndex >= 0) {
      this.completedTurns = this.completedTurns.slice(0, anchorIndex + 1);
    }
    this.reopenQuery(sessionId, resumeSessionAt);
    await this.requireQuery();
    return { providerSessionId: sessionId, messages: [] };
  }

  async rollbackThread(numTurns: number): Promise<ThreadHistory> {
    const sessionId = this.assertRollbackReady();
    const resumeSessionAt = this.planResumeAnchor(numTurns);
    this.completedTurns = this.completedTurns.slice(0, this.completedTurns.length - numTurns);
    this.reopenQuery(sessionId, resumeSessionAt);
    await this.requireQuery();
    return { providerSessionId: sessionId, messages: [] };
  }

  /** Shared rollback guards + absolute target computation (no mutation). */
  private planResumeAnchor(numTurns: number): string {
    this.assertRollbackReady();
    if (!Number.isInteger(numTurns) || numTurns <= 0) {
      throw new Error(`rollbackThread: numTurns must be a positive integer (got ${numTurns}).`);
    }
    if (numTurns > this.completedTurns.length) {
      throw new Error("Claude SDK rollback only supports turns completed in this runtime.");
    }
    const nextTurns = this.completedTurns.slice(0, this.completedTurns.length - numTurns);
    const resumeSessionAt = nextTurns.at(-1)?.resumeSessionAt;
    if (!resumeSessionAt) {
      throw new Error("Claude SDK rollback requires an assistant resume point.");
    }
    return resumeSessionAt;
  }

  private assertRollbackReady(): string {
    if (this.currentStatus === "working" || this.currentAttention === "working") {
      throw new Error("Claude SDK rollback is unavailable while a turn is running.");
    }
    if (this.pendingRequests.size > 0) {
      throw new Error("Claude SDK rollback is unavailable while a request is pending.");
    }
    // The CLI owns its background tasks: a relaunch would silently end them.
    if (this.hasLiveBackgroundWork()) {
      throw new Error(
        "Claude SDK rollback restarts Claude, which would end running background tasks. Stop the background tasks first, then try again.",
      );
    }
    if (!this.sessionId) {
      throw new Error("Claude SDK rollback requires an open session.");
    }
    return this.sessionId;
  }

  /** Restart with launch-only controls, optionally retaining a rollback anchor. */
  private reopenQuery(resumeSessionId: string | undefined, resumeSessionAt?: string): void {
    this.deferredCompletion.clear();
    this.clearDeferredFlushTimer();
    this.stopGoalTracking();
    this.cancelPendingRequests();
    this.emitRuntimeEvents(
      closeClaudeOpenItems(this.mapperState, { closePlan: true, abandonTools: true }),
    );
    this.mapperState.activeSubAgentTaskToTool?.clear();
    this.mapperState.activeSubAgentToolToTask?.clear();
    this.submissionGeneration++;
    this.steerDelivery.reset();
    this.currentTurnAssistantUuid = undefined;
    this.currentTurnInFlight = false;
    this.openedResumeSessionId = resumeSessionId;
    this.interruptInFlight = false;
    this.goalSteerInterruptInFlight = false;
    this.activeResumeAt = resumeSessionAt;
    this.promptQueue.close();
    const retiringQuery = this.queryRuntime;
    const retiringProcesses = [...this.spawnedProcesses];
    const retirement = this.retireQuery(retiringQuery, retiringProcesses);
    this.promptQueue = new AsyncPromptQueue();
    this.queryRuntime = undefined;
    this.queryReady = undefined;
    this.streamStarted = false;
    this.appliedModel = undefined;
    this.appliedPermissionMode = undefined;
    this.bypassPlanPermissions = false;
    this.appliedUltracode = false;
    this.appliedFast = false;
    this.startQuery(resumeSessionId, resumeSessionAt, retirement);
  }

  /** Drain the transcript and confirm descendant exit before resuming its session. */
  private async retireQuery(runtime: Query | undefined, children: ChildProcess[]): Promise<void> {
    try {
      runtime?.close();
      await runtime?.return();
    } finally {
      await Promise.all(children.map((child) => this.terminateSpawnedProcess(child)));
    }
  }

  async interruptTurn(): Promise<void> {
    // A user Stop cancels ordinary follow-ups but not a queued goal set/clear
    // (see steersSurvivingInterrupt); the interrupted result delivers it.
    this.goalSteerInterruptInFlight = false;
    this.pendingSteers = this.steersSurvivingInterrupt(false);
    this.steerDelivery.reset();
    this.promptQueue.clear();
    this.submissionGeneration++;
    this.interruptInFlight = true;
    this.cancelPendingRequests("User cancelled tool execution.");
    try {
      if (this.queryRuntime) {
        await interruptClaudeQuery(this.queryRuntime, this.steerDelivery.supported);
      }
    } catch {
      // Best-effort; stream/result handling will settle state if the SDK already stopped.
    }
  }

  forceCompleteTurn(): void {
    this.cancelPendingRequests("User cancelled tool execution.");
    this.backgroundTaskControls.reset();
    if (this.steerDelivery.hasPending && this.queryRuntime) {
      void interruptClaudeQuery(this.queryRuntime, true).catch(() => {});
    }
    this.pendingSteers = [];
    this.steerDelivery.reset();
    this.promptQueue.clear();
    this.submissionGeneration++;
    this.deferredCompletion.clear();
    this.clearDeferredFlushTimer();
    this.stopGoalTracking();
    this.mapperState.activeSubAgentTaskToTool?.clear();
    this.mapperState.activeSubAgentToolToTask?.clear();
    const events = clearBackgroundTasks(this.mapperState);
    events.push(...closeClaudeOpenItems(this.mapperState, { closePlan: true }));
    if (this.mapperState.currentTurnId) {
      events.push({
        type: "turn.completed",
        threadId: this.input.threadId,
        turnId: this.mapperState.currentTurnId,
        state: "interrupted",
      });
      delete this.mapperState.currentTurnId;
    }
    this.currentTurnAssistantUuid = undefined;
    this.currentTurnInFlight = false;
    this.emitRuntimeEvents(events);
  }

  async resolveServerRequest(requestId: ThreadServerRequestId, response: unknown): Promise<void> {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return;
    if (pending.kind === "elicitation") {
      const result = normalizeClaudeElicitationResponse(pending.request, response);
      this.settleElicitation(requestId, result);
      return;
    }
    if (pending.kind === "question") {
      this.pendingRequests.delete(requestId);
      if (isQuestionCancelResponse(response)) {
        pending.resolve({ behavior: "deny", message: "User cancelled tool execution." });
        this.emitRuntimeEvents([
          {
            type: "request.resolved",
            threadId: this.input.threadId,
            requestId: String(requestId),
            outcome: "cancelled",
          },
        ]);
        this.updatePendingRequestStatus();
        return;
      }
      const rawAnswers = rawQuestionAnswers(response, pending);
      const answers = normalizeQuestionAnswersForSdk(rawAnswers, pending);
      pending.resolve({
        behavior: "allow",
        updatedInput: {
          questions: pending.originalQuestions,
          answers,
        },
      });
      this.emitRuntimeEvents([
        {
          type: "request.resolved",
          threadId: this.input.threadId,
          requestId: String(requestId),
          outcome: "answered",
        },
        ...buildClaudeQuestionAnswerEvents({
          threadId: this.input.threadId,
          itemId: `question-answer-${randomUUID()}`,
          questions: pending.questions,
          answers: rawAnswers,
        }),
      ]);
      this.updatePendingRequestStatus();
      return;
    }

    if (pending.resolving) return pending.resolving;
    const resolving = this.resolvePermissionRequest(requestId, pending, response);
    pending.resolving = resolving;
    try {
      await resolving;
    } finally {
      delete pending.resolving;
    }
  }

  private async resolvePermissionRequest(
    requestId: ThreadServerRequestId,
    pending: PendingPermission,
    response: unknown,
  ): Promise<void> {
    const decision = permissionDecision(response);
    if (
      decision.kind === "acceptForSession" &&
      (!pending.suggestions?.length ||
        (decision.suggestionIndex !== undefined && !pending.suggestions[decision.suggestionIndex]))
    ) {
      // An older client may still display the former synthetic Always allow
      // option. Keep the request open rather than silently treating it as once.
      throw new Error(msg("thread.permission.persistentUnavailable"));
    }
    if (decision.kind === "accept" || decision.kind === "acceptForSession") {
      let approvedPlanMode: PermissionMode | undefined;
      if (isExitPlanModeToolName(pending.toolName)) {
        // Approval resumes this same turn, before the saved client config
        // reaches startTurn. Leave native Plan active until the response's
        // permission update atomically applies the selected policy.
        this.bypassPlanPermissions = false;
        approvedPlanMode =
          exitPlanApprovalMode(response) ?? basePermissionModeForConfig(this.currentConfig);
        const runtime = await this.requireQuery();
        if (this.pendingRequests.get(requestId) !== pending) return;
        const config: ThreadConfig = {
          ...this.currentConfig,
          mode: "agent",
          approvalPolicy: approvedPlanMode,
        };
        await this.syncSandbox(runtime, config);
        if (this.pendingRequests.get(requestId) !== pending) return;
        this.currentConfig = config;
        this.appliedPermissionMode = approvedPlanMode;
      }
      this.pendingRequests.delete(requestId);
      const pickedSuggestion =
        decision.suggestionIndex !== undefined
          ? pending.suggestions?.[decision.suggestionIndex]
          : undefined;
      const updatedPermissions: PermissionUpdate[] | undefined = approvedPlanMode
        ? [{ type: "setMode", mode: approvedPlanMode, destination: "session" }]
        : decision.kind === "acceptForSession" && pending.suggestions
          ? pickedSuggestion
            ? [pickedSuggestion]
            : pending.suggestions
          : undefined;
      pending.resolve({
        behavior: "allow",
        updatedInput: pending.toolInput,
        ...(updatedPermissions ? { updatedPermissions } : {}),
      });
      this.emitRuntimeEvents([
        {
          type: "request.resolved",
          threadId: this.input.threadId,
          requestId: String(requestId),
          outcome: "accepted",
        },
      ]);
      this.updatePendingRequestStatus();
      return;
    }

    this.pendingRequests.delete(requestId);
    pending.resolve({
      behavior: "deny",
      message: buildDenyMessage(decision.kind, pending),
    });
    this.emitRuntimeEvents([
      {
        type: "request.resolved",
        threadId: this.input.threadId,
        requestId: String(requestId),
        outcome: "declined",
      },
    ]);
    this.updatePendingRequestStatus();
  }

  private hasPendingTurn(): boolean {
    return (
      this.currentTurnInFlight ||
      this.deferredCompletion.hasPending ||
      this.pendingSteers.length > 0 ||
      this.steerDelivery.hasPending
    );
  }

  private updatePendingRequestStatus(): void {
    if (this.disposed) return;
    const pending = this.pendingRequests.values().next().value;
    const status = !pending
      ? this.hasPendingTurn()
        ? "working"
        : "idle"
      : pending.kind === "permission"
        ? "needs_approval"
        : "needs_reply";
    this.emitUpdate({ status, attention: status === "idle" ? "none" : status });
  }

  private settleElicitation(requestId: ThreadServerRequestId, result: ElicitationResult): void {
    const pending = this.pendingRequests.get(requestId);
    if (!pending || pending.kind !== "elicitation") return;
    this.pendingRequests.delete(requestId);
    pending.cleanup();
    pending.resolve(result);
    this.emitRuntimeEvents([
      {
        type: "request.resolved",
        threadId: this.input.threadId,
        requestId: String(requestId),
        outcome:
          result.action === "accept"
            ? "answered"
            : result.action === "decline"
              ? "declined"
              : "cancelled",
      },
    ]);
    this.updatePendingRequestStatus();
  }

  private cancelToolRequest(requestId: ThreadServerRequestId): void {
    const pending = this.pendingRequests.get(requestId);
    if (!pending || pending.kind === "elicitation") return;
    this.pendingRequests.delete(requestId);
    pending.resolve({ behavior: "deny", message: "User cancelled tool execution." });
    this.emitRuntimeEvents([
      {
        type: "request.resolved",
        threadId: this.input.threadId,
        requestId: String(requestId),
        outcome: "cancelled",
      },
    ]);
    this.updatePendingRequestStatus();
  }

  private startGoalTracking(): void {
    this.stopGoalTracking();
    if (!this.mapperState.activeGoalItemId) return;
    this.goalTrackingTimer = setInterval(() => {
      if (this.disposed || !this.mapperState.activeGoalItemId) {
        this.stopGoalTracking();
        return;
      }
      void this.refreshContextUsage();
    }, 15_000);
  }

  private stopGoalTracking(): void {
    if (this.goalTrackingTimer !== undefined) {
      clearInterval(this.goalTrackingTimer);
      this.goalTrackingTimer = undefined;
    }
  }

  dispose(): Promise<void> {
    this.backgroundTaskControls.reset();
    if (this.disposal) return this.disposal;
    const firstDisposal = !this.disposed;
    this.disposed = true;
    const disposal = Promise.resolve()
      .then(async () => {
        if (firstDisposal) this.closeSessionResources();
        // Query creation can still be resolving the executable or spawning its child.
        await this.queryReady?.catch(() => undefined);
        let closeFailure: { error: unknown } | undefined;
        try {
          this.queryRuntime?.close();
        } catch (error) {
          closeFailure = { error };
        }
        while (this.spawnedProcesses.size > 0 || this.processTerminations.size > 0) {
          const pending = new Set(this.processTerminations.values());
          for (const child of this.spawnedProcesses)
            pending.add(this.terminateSpawnedProcess(child));
          const outcomes = await Promise.allSettled(pending);
          const failure = outcomes.find((outcome) => outcome.status === "rejected");
          if (failure?.status === "rejected") throw failure.reason;
        }
        if (closeFailure) throw closeFailure.error;
        this.queryRuntime = undefined;
        this.queryReady = undefined;
        this.listener?.onClose();
      })
      .catch((error: unknown) => {
        this.disposal = undefined;
        throw error;
      });
    this.disposal = disposal;
    return disposal;
  }

  private closeSessionResources(): void {
    this.pendingSteers = [];
    this.steerDelivery.reset();
    this.promptQueue.clear();
    this.submissionGeneration++;
    this.stopGoalTracking();
    this.flushDeferredCompletion();
    this.cancelPendingRequests();
    this.emitRuntimeEvents(closeClaudeOpenItems(this.mapperState, { closePlan: true }));
    this.promptQueue.close();
  }

  private cancelPendingRequests(message = "Session closed."): void {
    for (const [requestId, pending] of this.pendingRequests) {
      if (pending.kind === "elicitation") {
        pending.cleanup();
        pending.resolve({ action: "cancel" });
      } else {
        pending.resolve({ behavior: "deny", message });
      }
      this.emitRuntimeEvents([
        {
          type: "request.resolved",
          threadId: this.input.threadId,
          requestId: String(requestId),
          outcome: "cancelled",
        },
      ]);
    }
    this.pendingRequests.clear();
  }

  /**
   * Prevent new SDK children after shutdown begins, and retain raced children
   * until their process termination has been confirmed.
   */
  private spawnTrackedProcess(
    spawn: () => SpawnedProcess,
    ownedProcessGroup = false,
  ): SpawnedProcess {
    if (this.disposed) throw new Error("ClaudeSdkSession cannot spawn after disposal.");
    const proc = spawn();
    const child = proc as unknown as ChildProcess;
    if (ownedProcessGroup) this.ownedProcessGroups.add(child);
    this.spawnedProcesses.add(child);
    const forget = (): void => {
      // A detached leader can exit while its descendants still own the process group.
      if (!ownedProcessGroup) this.spawnedProcesses.delete(child);
    };
    child.once("exit", forget);
    if (this.disposed) {
      // Disposal observes the same promise; keep failed children available for retry.
      void this.terminateSpawnedProcess(child).catch(() => {});
    }
    return proc;
  }

  private terminateSpawnedProcess(child: ChildProcess): Promise<void> {
    const pending = this.processTerminations.get(child);
    if (pending) return pending;
    const termination = Promise.resolve()
      .then(() =>
        awaitProcessTermination(child, {
          ownedProcessGroup: this.ownedProcessGroups.has(child),
        }),
      )
      .then(() => {
        this.spawnedProcesses.delete(child);
      })
      .finally(() => {
        this.processTerminations.delete(child);
      });
    this.processTerminations.set(child, termination);
    return termination;
  }

  private requireQuery(): Promise<Query> {
    if (!this.queryReady) throw new Error("ClaudeSdkSession.openThread has not completed.");
    return this.queryReady;
  }

  private startQuery(
    resumeSessionId: string | undefined,
    resumeSessionAt?: string,
    retirement?: Promise<void>,
  ): void {
    if (this.disposed) throw new Error("ClaudeSdkSession cannot open a disposed session.");
    if (this.streamStarted) return;
    this.streamStarted = true;
    this.steerDelivery.supported = false;
    this.backgroundTaskControls.reset();
    this.activeResumeAt = resumeSessionAt;
    // The `background_tasks_changed` level is per CLI process: it is not
    // emitted at startup, so a restarted query (rollback re-spawns the CLI)
    // must reset to the empty set and let the next membership change
    // repopulate it — stale ids would hold goal completion forever.
    this.emitRuntimeEvents(clearBackgroundTasks(this.mapperState));

    this.queryReady = (async () => {
      if (retirement) await retirement;
      if (this.disposed) throw new Error("ClaudeSdkSession was disposed during query retirement.");
      const wslPrime =
        this.input.projectLocation.kind === "wsl"
          ? primeWslProjectShellEnv(
              this.input.projectLocation.distro,
              this.input.projectLocation.linuxPath,
            )
          : undefined;
      const sdk = await import("@anthropic-ai/claude-agent-sdk");
      const { query } = sdk;
      if (wslPrime) {
        await wslPrime;
      }
      const permissionMode = basePermissionModeForConfig(this.currentConfig);
      const contextSize = this.currentConfig.contextSize;
      const contextWindow = resolveClaudeContextWindowTokens(contextSize);
      const model = applyClaudeContextSuffix(this.currentConfig.model, contextSize);
      // The SDK's spawn options determine PATH for the child. Prefer the project-scoped shell env
      // captured by `primeProjectShellEnv` (fnm / asdf / mise / volta cd-hooks
      // applied at the project root) over Electron's `process.env`, which on
      // macOS-from-Finder is launchd's skeleton PATH and pins the CLI to
      // homebrew node regardless of `.nvmrc`. Falls back to the homedir-scoped
      // primed env, then to bare `process.env`.
      const posixCwd = projectCwd(this.input.projectLocation);
      const posixEnv =
        this.input.projectLocation.kind === "posix"
          ? (getProjectShellEnv(posixCwd) ??
            getPrimedPosixEnv() ??
            (process.env as Record<string, string>))
          : undefined;
      const env =
        this.input.projectLocation.kind === "wsl"
          ? {
              CLAUDE_AGENT_SDK_CLIENT_APP: "poracode",
              BROWSER: "/bin/true",
              ...claudeSdkSettingsEnv(this.input.projectLocation, this.input.agentSettings),
              ...(this.input.env ?? {}),
            }
          : {
              ...(posixEnv ?? process.env),
              CLAUDE_AGENT_SDK_CLIENT_APP: "poracode",
              ...claudeSdkSettingsEnv(this.input.projectLocation, this.input.agentSettings),
              ...(this.input.env ?? {}),
            };
      // Posix builds ship without the SDK's bundled `claude` SEA binary
      // (electron-builder strips `@anthropic-ai/claude-agent-sdk-*` from the
      // asar). The SDK falls back to that binary when `pathToClaudeCodeExecutable`
      // is missing, so unresolved on posix is a hard error — surface it
      // explicitly instead of letting the SDK throw its "Native CLI binary
      // for darwin-arm64 not found" message.
      let claudeExecutablePath: string | undefined;
      switch (this.input.projectLocation.kind) {
        case "posix": {
          claudeExecutablePath =
            resolveAgentBinaryPath(this.input.projectLocation, "claude") ??
            (await resolveExecutablePathAsync("claude"));
          if (!claudeExecutablePath) {
            throw new Error(
              "Claude Code CLI not found on PATH. Install Claude Code (`npm i -g @anthropic-ai/claude-code` or via Homebrew) and restart Poracode.",
            );
          }
          break;
        }
        case "windows": {
          claudeExecutablePath = resolveAgentBinaryPath(this.input.projectLocation, "claude");
          break;
        }
        case "wsl":
          // WSL spawns through wsl.exe (see spawnClaudeInWsl), but the SDK
          // still resolves `pathToClaudeCodeExecutable` eagerly — if unset,
          // it tries to load its bundled win32-x64 SEA binary and throws
          // "Native CLI binary for win32-x64 not found" even though our
          // custom `spawnClaudeCodeProcess` will override the actual spawn.
          // Pass the in-distro path as a placeholder; fall back to `claude`
          // so the SDK's truthy check passes when detection hasn't primed
          // the binary cache yet.
          claudeExecutablePath =
            resolveAgentBinaryPath(this.input.projectLocation, "claude") ?? "claude";
          break;
        default: {
          const _exhaustive: never = this.input.projectLocation;
          void _exhaustive;
        }
      }
      const mcpServers = buildClaudeMcpServers(this.input.mcpServers ?? []);
      const deferMcp =
        Object.keys(mcpServers).length > 0 &&
        (await canDeferClaudeMcpConnections(this.input.projectLocation, model, env, (options) =>
          sdk.resolveSettings(options),
        ));
      let spawnClaudeCodeProcess: ((spawnOptions: SpawnOptions) => SpawnedProcess) | undefined;
      switch (this.input.projectLocation.kind) {
        case "wsl": {
          const location = this.input.projectLocation;
          spawnClaudeCodeProcess = (spawnOptions) =>
            this.spawnTrackedProcess(() => spawnClaudeInWsl(location, spawnOptions));
          break;
        }
        case "windows": {
          const location = this.input.projectLocation;
          spawnClaudeCodeProcess = (spawnOptions) =>
            this.spawnTrackedProcess(() => spawnClaudeNative(location, spawnOptions));
          break;
        }
        case "posix": {
          spawnClaudeCodeProcess = (spawnOptions) =>
            this.spawnTrackedProcess(
              () =>
                spawnChild(
                  spawnOptions.command,
                  claudeSdkPermissionArgs(
                    spawnOptions.args,
                    process.getuid?.(),
                    spawnOptions.env.IS_SANDBOX === "1" ||
                      Boolean(spawnOptions.env.CLAUDE_CODE_BUBBLEWRAP),
                  ),
                  {
                    cwd: spawnOptions.cwd,
                    env: spawnOptions.env,
                    signal: spawnOptions.signal,
                    stdio: ["pipe", "pipe", "pipe"],
                    detached: true,
                  },
                ) as unknown as SpawnedProcess,
              true,
            );
          break;
        }
      }
      const options: ClaudeQueryOptions = {
        cwd: projectCwd(this.input.projectLocation),
        model,
        systemPrompt: { type: "preset", preset: "claude_code" },
        settingSources: ["user", "project", "local"],
        permissionMode,
        // Like the terminal launch, allow the user to select Bypass later;
        // the selected permission mode and native policy checks still apply.
        allowDangerouslySkipPermissions: true,
        ...(resumeSessionId ? { resume: resumeSessionId } : {}),
        ...(resumeSessionAt ? { resumeSessionAt } : {}),
        ...(!resumeSessionId && this.sessionId ? { sessionId: this.sessionId } : {}),
        includePartialMessages: true,
        extraArgs: {
          "replay-user-messages": null,
          ...claudeSdkNativeChromeArgs(this.input.projectLocation, this.input.agentSettings),
        },
        forwardSubagentText: true,
        canUseTool: this.canUseTool,
        onElicitation: this.onElicitation,
        env: { ...env, ...claudeContextWindowEnv(contextSize) },
        ...(this.currentConfig.effort
          ? {
              // `ultracode` is not a model-level effort value — the CLI rejects
              // it on `--effort`. It maps to `xhigh` reasoning + dynamic
              // workflows, where the workflows toggle is sent below via
              // applyFlagSettings after the query starts.
              effort: (this.currentConfig.effort === "ultracode"
                ? "xhigh"
                : this.currentConfig.effort) as NonNullable<ClaudeQueryOptions["effort"]>,
            }
          : {}),
        ...(claudeExecutablePath ? { pathToClaudeCodeExecutable: claudeExecutablePath } : {}),
        ...(!deferMcp && Object.keys(mcpServers).length > 0
          ? ({ mcpServers } as Partial<ClaudeQueryOptions>)
          : {}),
        spawnClaudeCodeProcess,
      };

      if (this.disposed) throw new Error("ClaudeSdkSession was disposed during query creation.");
      this.queryRuntime = query({ prompt: this.promptQueue, options });
      if (deferMcp) this.mcpServers.deferUntilReady(this.queryRuntime, mcpServers);
      else this.mcpServers.initialize(this.queryRuntime, mcpServers);
      this.appliedModel = model;
      this.appliedContextWindow = contextWindow;
      this.appliedContextSize = contextSize;
      // The CLI can silently fall back when settings forbid Bypass. Confirm
      // that mode through the control API before disabling the saved sandbox.
      this.appliedPermissionMode =
        permissionMode === "bypassPermissions" ? undefined : permissionMode;
      this.appliedSandboxDisabled = false;
      void this.refreshSlashCommands(this.queryRuntime);
      void this.syncUltracodeFlag(this.queryRuntime);
      void this.syncFastMode(this.queryRuntime);
      return this.queryRuntime;
    })();

    void this.queryReady
      .then(async (runtime) => {
        try {
          for await (const message of runtime) {
            if (this.disposed || runtime !== this.queryRuntime) break;
            this.handleSdkMessage(message);
          }
          if (runtime !== this.queryRuntime) return;
          this.submissionGeneration++;
          this.pendingSteers = [];
          this.steerDelivery.reset();
          this.promptQueue.clear();
          if (!this.disposed) {
            if (this.currentTurnInFlight) {
              this.forceCompleteTurn();
              this.emitUpdate({ status: "idle", attention: "none" });
            }
            this.flushDeferredCompletion();
            this.releaseEndedProcessTasks();
          }
        } catch (error) {
          if (runtime !== this.queryRuntime) return;
          this.submissionGeneration++;
          this.pendingSteers = [];
          this.steerDelivery.reset();
          this.promptQueue.clear();
          if (!this.disposed) {
            captureSupervisorException(error, {
              "poracode.feature_area": "provider-sdk",
              "poracode.provider": "claude",
            });
            const message = error instanceof Error ? error.message : String(error);
            this.reportError(message);
            this.emitRuntimeEvents([{ type: "error", threadId: this.input.threadId, message }]);
            this.flushDeferredCompletion();
            this.releaseEndedProcessTasks();
          }
        }
      })
      .catch((error) => {
        if (this.disposed) return;
        captureSupervisorException(error, {
          "poracode.feature_area": "provider-sdk",
          "poracode.provider": "claude",
        });
        const message = error instanceof Error ? error.message : String(error);
        this.reportError(message);
        this.emitRuntimeEvents([{ type: "error", threadId: this.input.threadId, message }]);
      });
  }

  private readonly onElicitation: OnElicitation = async (request, { signal }) => {
    if (this.disposed || signal.aborted) return { action: "cancel" };
    const requestId = `claude-elicitation-${randomUUID()}` as ThreadServerRequestId;
    const event = mapClaudeElicitationRequest(this.input.threadId, String(requestId), request);
    if (!event) return { action: "cancel" };
    return await new Promise<ElicitationResult>((resolve) => {
      const cancel = () => {
        this.settleElicitation(requestId, { action: "cancel" });
      };
      this.pendingRequests.set(requestId, {
        kind: "elicitation",
        request,
        resolve,
        cleanup: () => signal.removeEventListener("abort", cancel),
      });
      signal.addEventListener("abort", cancel, { once: true });
      this.updatePendingRequestStatus();
      this.emitRuntimeEvents([event]);
    });
  };

  private readonly canUseTool: CanUseTool = async (toolName, toolInput, callbackOptions) => {
    if (this.disposed) return { behavior: "deny", message: "Session closed." };
    if (callbackOptions.signal.aborted)
      return { behavior: "deny", message: "User cancelled tool execution." };
    if (this.bypassPlanPermissions && canBypassPlanPermission(toolName, callbackOptions)) {
      return { behavior: "allow", updatedInput: toolInput };
    }
    if (toolName === "AskUserQuestion") {
      const requestId = `claude-question-${randomUUID()}` as ThreadServerRequestId;
      const questions = parseClaudeQuestions(toolInput);
      return await new Promise<PermissionResult>((resolve) => {
        this.pendingRequests.set(requestId, {
          kind: "question",
          questions,
          originalQuestions: toolInput.questions,
          resolve,
        });
        callbackOptions.signal.addEventListener(
          "abort",
          () => {
            this.cancelToolRequest(requestId);
          },
          { once: true },
        );
        this.emitRuntimeEvents([
          mapClaudeQuestionRequest({
            threadId: this.input.threadId,
            requestId: String(requestId),
            questions,
          }),
        ]);
        this.updatePendingRequestStatus();
      });
    }

    const requestId = `claude-perm-${randomUUID()}` as ThreadServerRequestId;
    const suggestions = callbackOptions.suppressAlwaysAllowRule
      ? undefined
      : callbackOptions.suggestions;
    return await new Promise<PermissionResult>((resolve) => {
      this.pendingRequests.set(requestId, {
        kind: "permission",
        toolName,
        toolInput,
        ...(suggestions ? { suggestions: [...suggestions] } : {}),
        resolve,
      });
      callbackOptions.signal.addEventListener(
        "abort",
        () => {
          this.cancelToolRequest(requestId);
        },
        { once: true },
      );
      this.emitRuntimeEvents([
        mapClaudePermissionRequest({
          threadId: this.input.threadId,
          requestId: String(requestId),
          toolName,
          toolInput,
          ...(callbackOptions.title ? { title: callbackOptions.title } : {}),
          ...(callbackOptions.description ? { description: callbackOptions.description } : {}),
          ...(callbackOptions.displayName ? { displayName: callbackOptions.displayName } : {}),
          ...(callbackOptions.blockedPath ? { blockedPath: callbackOptions.blockedPath } : {}),
          ...(callbackOptions.decisionReason
            ? { decisionReason: callbackOptions.decisionReason }
            : {}),
          ...(callbackOptions.toolUseID ? { toolUseID: callbackOptions.toolUseID } : {}),
          ...(suggestions ? { suggestions } : {}),
        }),
      ]);
      this.updatePendingRequestStatus();
    });
  };

  /**
   * The SDK can resume the model after a turn has already settled to `idle` —
   * a `ScheduleWakeup`, a `/loop` tick, or a backgrounded Bash task finishing
   * all re-invoke it WITHOUT a user prompt, so none of them flow through
   * `startTurn`. Such a resume streams assistant content (`item.started` /
   * `content.delta`) with neither a fresh `turn.started` nor a `working`
   * status, which leaves the GUI thread stuck on `idle` while answers stream
   * in: the renderer's reopen safety-net is gated off by the prior
   * `turn.completed`, and the SDK does not reliably emit
   * `session_state_changed: "running"` on these resumes. Detect the first
   * assistant activity after a settled turn and open a new runtime turn so both
   * the status channel and the renderer's turn-open gate reflect that the model
   * is working again. The eventual `result` then closes this turn normally.
   */
  private beginResumedTurnIfNeeded(message: SDKMessage): void {
    if (this.disposed || this.currentTurnInFlight) return;
    if (!isResumedAssistantActivity(message)) return;
    const turnId = `turn-${randomUUID()}`;
    this.currentTurnInFlight = true;
    this.currentTurnAssistantUuid = undefined;
    this.deferredCompletion.clear();
    this.clearDeferredFlushTimer();
    delete this.mapperState.pendingGoalCompletionOnTaskDrain;
    // Seed the mapper's turn id so the eventual `result` emits the matching
    // `turn.completed`, re-closing the renderer's turn-open gate.
    this.mapperState.currentTurnId = turnId;
    this.emitRuntimeEvents([{ type: "turn.started", threadId: this.input.threadId, turnId }]);
    this.emitUpdate({ status: "working", attention: "working" });
    this.startGoalTracking();
  }

  private handleSdkMessage(message: SDKMessage): void {
    if (this.backgroundTaskControls.shouldIgnore(message)) return;
    // Locally queued input is not provider history: Stop can clear it before
    // the SDK consumes it. A main-thread echo/reply confirms it was admitted.
    if (
      (message.type === "user" || message.type === "assistant") &&
      !readParentToolUseId(message)
    ) {
      this.sessionHasHistory = true;
      this.activeResumeAt = undefined;
      const admission = this.pendingPromptAdmission;
      if (admission?.generation === this.submissionGeneration) {
        this.pendingPromptAdmission = undefined;
        admission.acknowledge();
      }
    }
    const sessionId =
      "session_id" in message && typeof message.session_id === "string"
        ? message.session_id
        : undefined;
    if (sessionId && sessionId !== this.sessionId && this.shouldAdoptSessionId(message)) {
      this.sessionId = sessionId;
      // Same conversation under a new provider session id: new usage scope epoch.
      this.mapperState.usageScope?.adoptScope(sessionId);
      this.emitUpdate({
        status: this.currentStatus,
        attention: this.currentAttention,
        sessionRef: createKnownSessionRef(sessionId),
      });
    }

    const consumedSteer = this.steerDelivery.observe(message);
    if (consumedSteer && !this.currentTurnInFlight) this.beginTurn(...consumedSteer);
    this.beginResumedTurnIfNeeded(message);

    if (message.type === "system" && message.subtype === "init") {
      // Connecting before init makes the CLI wait for every MCP before replying.
      const runtime = this.queryRuntime;
      if (runtime) {
        void this.mcpServers.connectDeferred(
          runtime,
          () => !this.disposed && runtime === this.queryRuntime,
        );
      }
      // Bundled skills are reported both here and in the slash-command list;
      // this set is what splits them out as model-invoked (streaming) skills.
      this.captureSkillNames(message.skills);
    }

    if (message.type === "system" && message.subtype === "elicitation_complete") {
      for (const [requestId, pending] of this.pendingRequests) {
        if (
          pending.kind === "elicitation" &&
          pending.request.mode === "url" &&
          pending.request.serverName === message.mcp_server_name &&
          pending.request.elicitationId === message.elicitation_id
        ) {
          this.settleElicitation(requestId, { action: "accept" });
        }
      }
    }

    if (message.type === "system" && message.subtype === "session_state_changed") {
      const mapped = mapSessionState(message.state);
      // While a turn completion is deferred behind live background tasks, a
      // session-state idle must not settle the thread — the deferred update
      // owns the settling status (and preserves an error outcome). Non-settling
      // states (working, needs_approval) still pass through.
      if (mapped.status !== "idle" || (!this.hasPendingTurn() && this.currentStatus !== "error")) {
        this.emitUpdate(mapped);
      }
      // A running state while a drained completion sits in its grace window
      // means the model is waking to consume the task results — restart the
      // grace so the first assistant activity (beginResumedTurnIfNeeded) can
      // clear the stale completion instead of it flushing mid-resume.
      if (
        mapped.status === "working" &&
        this.deferredCompletion.hasPending &&
        this.deferredFlushTimer !== undefined
      ) {
        this.clearDeferredFlushTimer();
        this.scheduleDeferredFlush();
      }
    }

    if (message.type === "assistant" && !readParentToolUseId(message)) {
      // Only main-thread assistant uuids are valid resume anchors; a sub-agent
      // uuid (parent_tool_use_id set) must never become a rollback resume point.
      this.currentTurnAssistantUuid = message.uuid;
    }

    let wasInterrupted = false;
    let failed = false;
    let resultState: TurnState | undefined;
    if (message.type === "result") {
      wasInterrupted =
        this.interruptInFlight || (message.subtype !== "success" && isInterruptedResult(message));
      if (this.steerError) resultState = "failed";
      else if (wasInterrupted) resultState = "interrupted";
      const remaining = nonDiagnosticErrors(message);
      // claude.exe surfaces upstream API failures (e.g. 401 auth, 429 rate
      // limit) as subtype "success" with `is_error: true` / `api_error_status`
      // set — the failure text lives in `result`, not `errors[]`.
      const apiErrored = isApiErrorResult(message);
      // An interrupt always wins. A steered/aborted turn comes back as
      // `error_during_execution` with `is_error: true` and only
      // `[ede_diagnostic]` lines — that would otherwise trip both the API-error
      // and non-success checks below and surface a spurious "Claude turn
      // failed." every time the user steers. Genuine API failures (401/429)
      // arrive with `wasInterrupted` false, so they still surface. The
      // diagnostic-only case is itself treated as an interrupt via
      // `isInterruptedResult`, covering external (in-CLI) Esc interrupts where
      // `interruptInFlight` is false.
      failed =
        this.steerError !== undefined ||
        (!wasInterrupted &&
          (apiErrored || (message.subtype !== "success" && remaining.length > 0)));
      if (!failed) this.steerDelivery.settleResult(message, wasInterrupted);
      if (!failed && !this.interruptInFlight && this.steerDelivery.hasPending) {
        // `now` can end the old generation before the replacement is echoed,
        // or echo it before the old result arrives. Neither ends the user's
        // logical turn: preserve live tools, goals, and submission ownership.
        this.emitRuntimeEvents(closeClaudeGenerationItems(this.mapperState));
        void this.refreshContextUsage();
        return;
      }
    }
    const backgroundTaskDetailsChanged = this.backgroundTaskControls.observe(message);
    const events = mapClaudeSdkMessage(
      message,
      this.mapperState,
      resultState ? { resultState } : undefined,
    );
    if (
      backgroundTaskDetailsChanged &&
      !events.some((event) => event.type === "background_tasks.changed")
    ) {
      const tasks = this.mapperState.reportedBackgroundTasks ?? [];
      if (tasks.length > 0)
        events.push({
          type: "background_tasks.changed",
          threadId: this.input.threadId,
          tasks: [...tasks],
        });
    }
    this.emitRuntimeEvents(events);
    if (message.type === "result") {
      void this.refreshContextUsage();
      this.interruptInFlight = false;
      const errorMessage = failed
        ? (this.steerError ?? extractResultErrorMessage(message) ?? "Claude turn failed.")
        : undefined;
      if (this.currentTurnInFlight && !failed && !wasInterrupted) {
        this.completedTurns.push({ resumeSessionAt: this.currentTurnAssistantUuid });
      }
      this.currentTurnAssistantUuid = undefined;
      this.currentTurnInFlight = false;
      const goalSteerInterrupt = this.goalSteerInterruptInFlight;
      this.goalSteerInterruptInFlight = false;
      // Stop the 15s goal-tracking poller on every turn end — including
      // interrupts and steers — so it does not keep firing context-usage
      // round-trips while the thread sits idle. The goal itself is NOT cleared
      // here: completion is driven by the SDK's `active_goal` Stop-hook
      // verdict (see applyActiveGoalMessage; clean turn end is only a
      // fallback for CLIs that never emit it), and the next turn restarts
      // tracking via startGoalTracking().
      this.stopGoalTracking();
      const completion: StructuredSessionUpdate = {
        status: failed ? "error" : "idle",
        attention: failed ? "error" : "none",
        ...(errorMessage ? { errorMessage } : {}),
        ...(this.sessionId ? { sessionRef: createKnownSessionRef(this.sessionId) } : {}),
      };
      if (failed || wasInterrupted) {
        const hadPendingDelivery = this.steerDelivery.hasPending;
        this.submissionGeneration++;
        this.pendingSteers = failed ? [] : this.steersSurvivingInterrupt(goalSteerInterrupt);
        this.steerDelivery.clear();
        this.promptQueue.clear();
        if (failed && hadPendingDelivery && this.queryRuntime && this.steerDelivery.supported) {
          void interruptClaudeQuery(this.queryRuntime, true).catch(() => {});
        }
      }
      if (this.startPendingSteer()) return;
      if (!failed && !wasInterrupted && hasAwaitedBackgroundWork(this.mapperState)) {
        this.deferredCompletion.defer(completion);
      } else {
        this.emitUpdate(completion);
      }
    }
    this.flushDeferredCompletionIfDrained();
  }

  /**
   * Whether the CLI still owns live work, for process reuse and goal tracking:
   * sub-agent runs (edge-tracked, closed by `task_notification`) or any task in
   * the CLI's `background_tasks_changed` level set — plain backgrounded Bash
   * and watchers included. Independent commands may outlive a completed response.
   */
  private hasLiveBackgroundWork(): boolean {
    return (
      (this.mapperState.activeSubAgentTaskToTool?.size ?? 0) > 0 ||
      (this.mapperState.liveBackgroundTaskIds?.size ?? 0) > 0
    );
  }

  /**
   * Release a deferred turn-completion status once the live background-task
   * registry has drained. Called after every SDK message so the authoritative
   * `task_notification` that closes the last subagent task flips the thread to
   * its held idle/error state.
   *
   * The release is not immediate: the SDK typically wakes the model right
   * after that notification to consume the task's results. Settling idle in
   * that gap resets the renderer's "Working for" timer to zero and fires a
   * premature done-notification, only for the thread to flip back to working
   * a moment later. A short grace window lets the resume win: assistant
   * activity clears the held completion (beginResumedTurnIfNeeded) and the
   * thread stays continuously live. If nothing resumes, the held status
   * flushes when the grace expires.
   */
  private flushDeferredCompletionIfDrained(): void {
    if (hasAwaitedBackgroundWork(this.mapperState)) return;
    // A goal held open across a clean turn end also drains here, so the
    // pending goal alone is enough to arm the flush, or the dock would sit
    // active until the session ends.
    if (this.steerDelivery.hasPending) return;
    if (
      !this.deferredCompletion.hasPending &&
      (!this.mapperState.pendingGoalCompletionOnTaskDrain || this.hasLiveBackgroundWork())
    ) {
      return;
    }
    this.scheduleDeferredFlush();
  }

  private scheduleDeferredFlush(): void {
    if (this.deferredFlushTimer !== undefined) return;
    this.deferredFlushTimer = setTimeout(() => {
      this.deferredFlushTimer = undefined;
      if (
        this.disposed ||
        hasAwaitedBackgroundWork(this.mapperState) ||
        this.steerDelivery.hasPending
      )
        return;
      this.emitRuntimeEvents(completeActiveGoalOnTaskDrainEvents(this.mapperState));
      const update = this.deferredCompletion.take();
      if (update) this.emitUpdate(update);
    }, DEFERRED_FLUSH_RESUME_GRACE_MS);
  }

  private clearDeferredFlushTimer(): void {
    if (this.deferredFlushTimer !== undefined) {
      clearTimeout(this.deferredFlushTimer);
      this.deferredFlushTimer = undefined;
    }
  }

  /** The level set is per process; an ended stream must not leave restarts blocked. */
  private releaseEndedProcessTasks(): void {
    this.backgroundTaskControls.reset();
    this.mapperState.activeSubAgentTaskToTool?.clear();
    this.mapperState.activeSubAgentToolToTask?.clear();
    this.emitRuntimeEvents(clearBackgroundTasks(this.mapperState));
  }

  /**
   * Emit any held turn-completion status unconditionally — used when the stream
   * ends, errors, or the session is disposed while background tasks were still
   * live, so the thread never stays stuck `working`.
   */
  private flushDeferredCompletion(): void {
    this.clearDeferredFlushTimer();
    this.emitRuntimeEvents(completeActiveGoalOnTaskDrainEvents(this.mapperState));
    const update = this.deferredCompletion.take();
    if (update) this.emitUpdate(update);
  }

  private shouldAdoptSessionId(message: SDKMessage): boolean {
    if (this.openedResumeSessionId) {
      return false;
    }
    if (message.type !== "system") {
      return true;
    }
    return (
      message.subtype !== "hook_started" &&
      message.subtype !== "hook_progress" &&
      message.subtype !== "hook_response"
    );
  }

  private async refreshContextUsage(): Promise<void> {
    try {
      const runtime = this.queryRuntime;
      if (!runtime) return;
      // This refresh runs after every result and on the goal tick. `summary`
      // answers from the last response's usage instead of issuing a
      // token-count API call per category; CLIs that predate it ignore it.
      const usage = await runtime.getContextUsage({ detail: "summary" });
      if (this.disposed || runtime !== this.queryRuntime) return;
      const event = mapClaudeContextUsageResponse(this.input.threadId, usage);
      if (event) this.emitRuntimeEvents([event]);
      // Goal token spend accumulates from per-call assistant-message usage
      // (see accumulateActiveGoalAssistantSpend); the `apiUsage` snapshot on
      // this response is the LAST call's usage, not spend, so it must not feed
      // the goal total. The tick just rolls the dock's elapsed time forward.
      if (this.mapperState.activeGoalItemId) {
        const tick = emitActiveGoalTick(this.mapperState);
        if (tick) this.emitRuntimeEvents([tick]);
      }
    } catch {
      // Older transports can reject this control call. In that case, keep the
      // existing context snapshot; assistant messages still update goal spend.
    }
  }

  private emitRuntimeEvents(events: RuntimeEvent[]): void {
    if (events.length === 0) return;
    events = events.map((event) => {
      if (event.type !== "background_tasks.changed") return event;
      const tasks = this.backgroundTaskControls.decorate(event.tasks);
      this.backgroundTaskControls.reconcile(tasks);
      return { ...event, tasks };
    });
    if (!this.listener?.onRuntimeEvent) {
      this.bufferedRuntimeEvents.push(...events);
      return;
    }
    for (const event of events) this.listener.onRuntimeEvent(event);
  }

  private reportError(message: string): void {
    if (this.listener) {
      this.listener.onError(message);
      return;
    }
    // Surface in supervisor stderr so silent listener-not-yet-attached
    // failures still leave a trail; the message is also queued for replay
    // when `setListener` runs.
    console.error(`[claude-sdk-session] ${this.input.threadId} pre-listener error: ${message}`);
    this.pendingError = message;
  }
}

/**
 * Whether an SDK message represents the model starting to produce fresh
 * assistant output. A streamed message opens with a `message_start` stream
 * event; non-streaming transports deliver a whole `assistant` message instead.
 * Sub-agent output also arrives as assistant messages / stream events, but it
 * carries a `parent_tool_use_id` and keeps arriving AFTER the main turn's
 * `result` — it must never open a resumed turn (that would flip the thread back
 * to working on background subagent chatter). Exclude anything parent-attributed
 * here. Used to detect a wakeup/background resume that bypassed `startTurn`.
 */
function isResumedAssistantActivity(message: SDKMessage): boolean {
  if (readParentToolUseId(message)) return false;
  if (message.type === "assistant") return true;
  if (message.type === "stream_event") {
    return message.event.type === "message_start";
  }
  return false;
}

function isInterruptedResult(message: Extract<SDKMessage, { type: "result" }>): boolean {
  const filtered = nonDiagnosticErrors(message);
  // claude.exe emits an `error_during_execution` result whose only error is
  // an `[ede_diagnostic]` line when a turn was interrupted before producing
  // assistant content. Treat that as an interrupt — the SDK itself filters
  // those lines out as informational.
  if (filtered.length === 0) return true;
  const joined = filtered.join(" ").toLowerCase();
  return joined.includes("abort") || joined.includes("interrupt");
}

function mapSessionState(messageState: string): {
  status: ThreadStatus;
  attention: ThreadAttention;
} {
  switch (messageState) {
    case "running":
      return { status: "working", attention: "working" };
    case "requires_action":
      return { status: "needs_approval", attention: "needs_approval" };
    case "idle":
    default:
      return { status: "idle", attention: "none" };
  }
}
