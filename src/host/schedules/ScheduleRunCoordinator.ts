import { resolveProjectLocation } from "@/shared/worktree";
import { isDeepStrictEqual } from "node:util";
import { isThreadSessionAbsenceRefusal } from "@/shared/threadSessionRefusal";
import { resolveHostThreadLaunchConfig } from "../threads/threadLaunchConfig";
import { randomUUID } from "node:crypto";
import type {
  AgentStatusesResponse,
  Project,
  ProjectLocation,
  RemoteThreadCommand,
  RuntimeEvent,
  ScheduleCompletionPolicy,
  ScheduleCompletionEvaluationInput,
  ScheduleCompletionEvaluationResult,
  ScheduleRunResult,
  ScheduleRunStatus,
  ScheduledTask,
  ScheduledTaskRun,
  SendThreadInputPayload,
  StartThreadPayload,
  Thread,
  ThreadConfig,
  ThreadStatus,
} from "@/shared/contracts";
import {
  DEFAULT_TERMINAL_SIZE,
  isThreadTurnActive,
  resolveMcpLaunchSnapshot,
  resolveScheduleAutomation,
} from "@/shared/contracts";
import type { SharedSettings } from "@/shared/settings";
import { toErrorMessage } from "@/shared/errorMessage";
import { msg } from "@/shared/messages";
import type { SupervisorEvent } from "@/shared/ipc";
import type { PersistedRuntimeItem } from "../db/runtimeItems";
import type { ScheduleRunPatch } from "../db/scheduleRuns";
import { buildScheduleRunResult, collectScheduleRunItems } from "./scheduleRunResults";
import {
  ScheduleRunPersistenceError,
  type ScheduleRunContext,
  type ScheduleTaskExecutionOutcome,
} from "./types";

const TERMINAL_STATUSES: ReadonlySet<ThreadStatus> = new Set<ThreadStatus>([
  "idle",
  "finished",
  "inactive",
  "error",
]);
export interface ScheduleRunCoordinatorDeps {
  admitScheduleExecution(task: ScheduledTask): void;
  publishThreadsChanged?(threadIds: readonly string[]): void;
  onError?(error: unknown): void;
  onRunStatus?(
    scheduleId: string,
    status: "running" | "waiting-for-approval",
    error: string | null,
  ): void;
  cancelCompletionEvaluation?(runId: string): Promise<void>;
  startThread(payload: StartThreadPayload): Promise<unknown>;
  sendThreadInput?(payload: SendThreadInputPayload): Promise<void>;
  interruptThread?(threadId: string): Promise<void>;
  evaluateCompletion?(
    payload: ScheduleCompletionEvaluationInput,
  ): Promise<ScheduleCompletionEvaluationResult>;
  getAgentStatuses(wslDistros: string[]): Promise<AgentStatusesResponse>;
  sendThreadCommand(command: RemoteThreadCommand): boolean;
  ensureHomeProject(): Project;
  getProject(projectId: string): Project | null;
  getThread?(threadId: string): Thread | null;
  getThreadRuntimeItemCursor(threadId: string): number | Promise<number>;
  getThreadRuntimeItemsAfter(
    threadId: string,
    cursor: number,
  ): PersistedRuntimeItem[] | Promise<PersistedRuntimeItem[]>;
  getSharedSettings(): SharedSettings;
  upsertThread(thread: Thread, sortOrder: number): void;
  deleteThread(threadId: string): void;
  threadExists(threadId: string): boolean;
  insertRun(run: ScheduledTaskRun): void;
  updateRun(id: string, patch: ScheduleRunPatch): void;
  now?: () => number;
  newId?: () => string;
}

interface PendingRun {
  runId: string;
  runRecord: ScheduledTaskRun;
  persisted: boolean;
  signal: AbortSignal | undefined;
  threadId: string;
  task: ScheduledTask;
  projectLocation: ProjectLocation;
  runtimeItemCursor: number;
  sawActive: boolean;
  turnId: string | null;
  phase: "preparing" | "resuming" | "dispatching" | "collecting" | "evaluating";
  reject: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
  settling: boolean;
  completionOverride: CompletionInput | null;
  waiting: boolean;
  resolveSettlementOverride: ((completion: CompletionInput) => void) | null;
  resolve: (outcome: ScheduleTaskExecutionOutcome) => void;
}

interface CompletionInput {
  status: Exclude<ScheduleRunStatus, "running">;
  error: string | null;
  stopReason: string | null;
}

/** Executes scheduled turns as persisted GUI conversations and records typed results. */
export class ScheduleRunCoordinator {
  private readonly pendingByThread = new Map<string, PendingRun>();
  private readonly pendingByRunId = new Map<string, PendingRun>();

  private readonly launches = new Set<Promise<void>>();
  private readonly settlements = new Set<Promise<void>>();
  private readonly failedSettlements = new Map<
    string,
    { pending: PendingRun; patch: ScheduleRunPatch; outcome: ScheduleTaskExecutionOutcome }
  >();
  private disposed = false;
  private disposal: Promise<void> | null = null;

  constructor(private readonly deps: ScheduleRunCoordinatorDeps) {}

  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.disposed = true;
    for (const pending of this.pendingByThread.values()) {
      if (this.failedSettlements.has(pending.runId)) continue;
      this.interruptPending(pending);
      this.complete(pending.threadId, {
        status: "interrupted",
        error: "Scheduled run interrupted because the host is shutting down.",
        stopReason: "host-shutdown",
      });
    }
    this.disposal = Promise.allSettled([...this.launches, ...this.settlements])
      .then(() => {
        this.retryFailedSettlements();
      })
      .catch((error: unknown) => {
        // Keep custody, but let the data owner retry shutdown after a failed write.
        this.disposal = null;
        throw error;
      });
    return this.disposal;
  }

  observeSupervisorEvent(event: SupervisorEvent): void {
    if (this.disposed) return;
    if (event.type === "thread-runtime-event") {
      this.observeRuntimeEvent(event.event);
      return;
    }
    if (event.type === "thread-runtime-events") {
      for (const runtimeEvent of event.events) this.observeRuntimeEvent(runtimeEvent);
      return;
    }
    if (event.type === "thread-runtime-events-multi") {
      for (const batch of event.batches) {
        for (const runtimeEvent of batch.events) this.observeRuntimeEvent(runtimeEvent);
      }
      return;
    }
    if (event.type === "thread-exited") {
      if (!this.pendingByThread.has(event.threadId)) return;
      this.complete(event.threadId, {
        status: "interrupted",
        error: msg("automation.run.exited"),
        stopReason: "thread-exited",
      });
      return;
    }
    if (event.type !== "thread-state") return;

    const pending = this.pendingByThread.get(event.threadId);
    if (
      !pending ||
      pending.settling ||
      pending.phase === "preparing" ||
      pending.phase === "resuming"
    )
      return;
    if (event.status === "launching" || event.status === "working") {
      pending.sawActive = true;
      if (pending.waiting) {
        pending.waiting = false;
        this.deps.updateRun(pending.runId, { status: "running", error: null, result: null });
        this.deps.onRunStatus?.(pending.task.id, "running", null);
      }
      return;
    }
    if (event.status === "needs_approval" || event.status === "needs_reply") {
      pending.sawActive = true;
      pending.waiting = true;
      const replyRequired = event.status === "needs_reply";
      const error = msg(
        replyRequired ? "automation.run.replyRequired" : "automation.run.approvalRequired",
      );
      this.deps.updateRun(pending.runId, {
        status: "waiting-for-approval",
        error,
        result: buildScheduleRunResult({
          status: "waiting-for-approval",
          summary: null,
          changedFiles: [],
          completedAt: this.nowIso(),
          stopReason: replyRequired ? "reply-required" : "approval-required",
        }),
      });
      this.deps.onRunStatus?.(pending.task.id, "waiting-for-approval", error);
      return;
    }
    if (!TERMINAL_STATUSES.has(event.status)) return;
    if (event.status !== "error" && !pending.sawActive) return;
    if (event.status === "error") {
      this.complete(event.threadId, {
        status: "failed",
        error: event.errorMessage ?? msg("automation.run.failed"),
        stopReason: "runtime-error",
      });
      return;
    }
    this.complete(event.threadId, {
      status: "succeeded",
      error: null,
      stopReason: null,
    });
  }

  handleSupervisorReset(): void {
    for (const threadId of [...this.pendingByThread.keys()]) {
      this.complete(threadId, {
        status: "interrupted",
        error: msg("automation.run.exited"),
        stopReason: "supervisor-reset",
      });
    }
  }

  async runScheduleAsThread(
    task: ScheduledTask,
    context: ScheduleRunContext = {
      scheduledFor: this.nowIso(),
      trigger: "manual",
      attempt: 1,
      iteration: (task.iterationCount ?? 0) + 1,
    },
  ): Promise<ScheduleTaskExecutionOutcome> {
    this.assertOpen();
    this.retryFailedSettlements();
    // Current-master admission runs before even Home-project creation.
    this.deps.admitScheduleExecution(task);
    const automation = resolveScheduleAutomation(task.automation);
    const threadId =
      automation.mode.kind === "heartbeat"
        ? automation.mode.targetThreadId
        : (this.deps.newId ?? randomUUID)();
    const runId = (this.deps.newId ?? randomUUID)();
    const startedAt = this.nowIso();
    const runRecord: ScheduledTaskRun = {
      id: runId,
      scheduleId: task.id,
      threadId,
      scheduledFor: context.scheduledFor,
      trigger: context.trigger,
      attempt: context.attempt,
      iteration: context.iteration,
      startedAt,
      completedAt: null,
      status: "running",
      summary: null,
      error: null,
      result: null,
      automationSnapshot: automation,
    };
    if (this.pendingByThread.has(threadId)) {
      this.deps.insertRun(runRecord);
      return this.finishUnstarted(
        runId,
        { status: "failed", error: msg("automation.run.targetInUse"), stopReason: "target-busy" },
        automation.completionPolicy,
      );
    }
    let project: Project;
    try {
      project = this.resolveProject(task);
    } catch (error) {
      this.deps.insertRun(runRecord);
      return this.finishUnstarted(
        runId,
        { status: "failed", error: toErrorMessage(error), stopReason: "configuration-error" },
        automation.completionPolicy,
      );
    }
    if (automation.mode.kind === "heartbeat") {
      try {
        this.requireHeartbeatTarget(task, project, threadId);
      } catch (error) {
        this.deps.insertRun(runRecord);
        return this.finishUnstarted(
          runId,
          { status: "failed", error: toErrorMessage(error), stopReason: "configuration-error" },
          automation.completionPolicy,
        );
      }
    }
    const completion = Promise.withResolvers<ScheduleTaskExecutionOutcome>();
    const pending: PendingRun = {
      runId,
      runRecord,
      persisted: false,
      signal: context.signal,
      threadId,
      task,
      projectLocation: project.location,
      runtimeItemCursor: -1,
      sawActive: false,
      turnId: null,
      phase: "preparing",
      settling: false,
      resolveSettlementOverride: null,
      completionOverride: null,
      waiting: false,
      resolve: completion.resolve,
      reject: completion.reject,
      timer: setTimeout(() => {
        if (this.pendingByRunId.get(runId) !== pending) return;
        this.interruptPending(pending);
        this.complete(
          threadId,
          { status: "failed", error: msg("automation.run.timeLimit"), stopReason: "time-limit" },
          pending,
        );
      }, automation.maxRuntimeSeconds * 1_000),
    };
    pending.timer.unref?.();
    // Reserve synchronously: other schedules cannot claim the target during admission awaits.
    this.pendingByThread.set(threadId, pending);
    this.pendingByRunId.set(runId, pending);
    const abortPreparation = () => {
      if (pending.phase === "preparing" || pending.phase === "resuming") this.cancelRun(runId);
    };
    context.signal?.addEventListener("abort", abortPreparation, { once: true });
    if (context.signal?.aborted) abortPreparation();
    void completion.promise.then(
      () => context.signal?.removeEventListener("abort", abortPreparation),
      () => context.signal?.removeEventListener("abort", abortPreparation),
    );
    const launch = this.launchPending(pending, project).catch((error: unknown) => {
      if (!pending.persisted) {
        clearTimeout(pending.timer);
        if (this.pendingByThread.get(threadId) === pending) this.pendingByThread.delete(threadId);
        this.pendingByRunId.delete(runId);
        pending.reject(error);
        return;
      }
      this.complete(
        threadId,
        { status: "failed", error: toErrorMessage(error), stopReason: "launch-error" },
        pending,
      );
    });
    this.launches.add(launch);
    void launch.finally(() => this.launches.delete(launch));
    return completion.promise;
  }

  private async launchPending(pending: PendingRun, project: Project): Promise<void> {
    const { task, threadId } = pending;
    const automation = resolveScheduleAutomation(task.automation);
    if (automation.mode.kind === "heartbeat") {
      const target = this.requireHeartbeatTarget(task, project, threadId);
      pending.projectLocation = resolveProjectLocation(project.location, target.worktreePath);
    }
    const config = await this.buildThreadConfig(task, pending.projectLocation);
    if (!this.canDispatch(pending)) return;
    if (automation.mode.kind === "heartbeat") {
      this.requireHeartbeatTarget(task, project, threadId, pending.projectLocation);
      pending.runtimeItemCursor = await this.deps.getThreadRuntimeItemCursor(threadId);
      if (!this.canDispatch(pending)) return;
      this.requireHeartbeatTarget(task, project, threadId, pending.projectLocation);
    }
    // Re-read execution-defining fields immediately before any thread write or launch.
    this.deps.admitScheduleExecution(task);
    const currentProject = this.deps.getProject(project.id);
    if (
      !currentProject ||
      !isDeepStrictEqual(currentProject.location, project.location) ||
      currentProject.remoteServerId !== project.remoteServerId
    ) {
      throw new Error(msg("schedule.executionStale"));
    }
    this.deps.insertRun(pending.runRecord);
    pending.persisted = true;
    let freshThread = false;
    try {
      pending.phase = "dispatching";
      if (automation.mode.kind === "heartbeat") {
        await this.dispatchHeartbeat(pending, project, config);
      } else {
        freshThread = !this.deps.threadExists(threadId);
        this.persistFreshThread(task, project, threadId, config, this.nowIso());
        await this.deps.startThread(this.startPayload(task, project, threadId, config));
      }
    } catch (error) {
      if (this.disposed || !this.canDispatch(pending)) return;
      if (freshThread) {
        this.deps.deleteThread(threadId);
        this.deps.publishThreadsChanged?.([threadId]);
        this.deps.sendThreadCommand({ kind: "delete", threadId });
      }
      throw error;
    }
  }

  private canDispatch(pending: PendingRun): boolean {
    return (
      !this.disposed &&
      !pending.settling &&
      this.pendingByRunId.get(pending.runId) === pending &&
      !(pending.signal?.aborted && (pending.phase === "preparing" || pending.phase === "resuming"))
    );
  }

  private interruptPending(pending: PendingRun): void {
    // An evaluator runs after the turn; interrupting then could stop a user's newer turn.
    if (pending.phase === "evaluating") {
      void this.deps.cancelCompletionEvaluation?.(pending.runId).catch((error: unknown) => {
        try {
          this.deps.onError?.(error);
        } catch {
          /* Reporting does not change ownership. */
        }
      });
    } else if (pending.phase === "dispatching" || pending.phase === "resuming") {
      void this.deps.interruptThread?.(pending.threadId).catch((error: unknown) => {
        try {
          this.deps.onError?.(error);
        } catch {
          /* Reporting does not change ownership. */
        }
      });
    }
  }

  cancelRun(runId: string): boolean {
    const pending = this.pendingByRunId.get(runId);
    if (!pending) return false;
    this.interruptPending(pending);
    this.complete(pending.threadId, {
      status: "cancelled",
      error: null,
      stopReason: "cancelled",
    });
    return true;
  }

  recordSkippedRun(task: ScheduledTask, context: ScheduleRunContext): ScheduledTaskRun {
    const automation = resolveScheduleAutomation(task.automation);
    const now = this.nowIso();
    const result = buildScheduleRunResult({
      status: "skipped",
      summary: null,
      changedFiles: [],
      completedAt: now,
      stopReason: "misfire-policy",
    });
    const run: ScheduledTaskRun = {
      id: (this.deps.newId ?? randomUUID)(),
      scheduleId: task.id,
      threadId:
        automation.mode.kind === "heartbeat"
          ? automation.mode.targetThreadId
          : `schedule:${task.id}`,
      scheduledFor: context.scheduledFor,
      trigger: context.trigger,
      attempt: context.attempt,
      iteration: context.iteration,
      startedAt: now,
      completedAt: now,
      status: "skipped",
      summary: null,
      error: null,
      result,
      automationSnapshot: automation,
    };
    this.deps.insertRun(run);
    return run;
  }

  private observeRuntimeEvent(event: RuntimeEvent): void {
    const pending = this.pendingByThread.get(event.threadId);
    if (
      !pending ||
      pending.settling ||
      pending.phase === "preparing" ||
      pending.phase === "resuming"
    )
      return;
    if (event.type === "turn.started") {
      pending.turnId ??= event.turnId;
      pending.sawActive = true;
      if (pending.waiting) {
        pending.waiting = false;
        this.deps.updateRun(pending.runId, { status: "running", error: null, result: null });
        this.deps.onRunStatus?.(pending.task.id, "running", null);
      }
      return;
    }
    if (event.type === "error") {
      this.complete(event.threadId, {
        status: "failed",
        error: event.message,
        stopReason: "runtime-error",
      });
      return;
    }
    if (
      event.type !== "turn.completed" ||
      !pending.sawActive ||
      (pending.turnId !== null && pending.turnId !== event.turnId)
    )
      return;
    if (event.state === "completed") {
      this.complete(event.threadId, {
        status: "succeeded",
        error: null,
        stopReason: null,
      });
      return;
    }
    this.complete(event.threadId, {
      status:
        event.state === "cancelled"
          ? "cancelled"
          : event.state === "interrupted"
            ? "interrupted"
            : "failed",
      error: event.state === "failed" ? msg("automation.run.failed") : null,
      stopReason: event.state,
    });
  }

  private complete(threadId: string, completion: CompletionInput, expected?: PendingRun): void {
    const pending = this.pendingByThread.get(threadId);
    if (!pending || (expected && expected !== pending)) return;
    const settlement = this.finishPending(pending, completion).catch((error: unknown) => {
      clearTimeout(pending.timer);
      if (!this.failedSettlements.has(pending.runId)) this.releasePending(pending);
      pending.reject(new ScheduleRunPersistenceError(toErrorMessage(error), { cause: error }));
      try {
        this.deps.onError?.(error);
      } catch {
        /* Reporting never changes run ownership. */
      }
    });
    this.settlements.add(settlement);
    void settlement.finally(() => this.settlements.delete(settlement));
  }

  private async finishPending(pending: PendingRun, completion: CompletionInput): Promise<void> {
    const { threadId } = pending;
    if (this.pendingByThread.get(threadId) !== pending) return;
    if (pending.settling) {
      if (completion.status === "cancelled" || completion.status === "interrupted") {
        pending.completionOverride = completion;
        pending.resolveSettlementOverride?.(completion);
      }
      return;
    }
    pending.settling = true;
    pending.phase = "collecting";
    clearTimeout(pending.timer);

    let items: PersistedRuntimeItem[] = [];
    try {
      if (pending.persisted)
        items = await this.deps.getThreadRuntimeItemsAfter(
          pending.threadId,
          pending.runtimeItemCursor,
        );
    } catch (error) {
      if (completion.status === "succeeded")
        completion = {
          status: "failed",
          error: toErrorMessage(error),
          stopReason: "result-unavailable",
        };
    }
    const { summary, changedFiles } = collectScheduleRunItems(items);
    completion = pending.completionOverride ?? completion;
    let status = completion.status;
    let error = completion.error;
    let stopReason = completion.stopReason;
    let completionEvaluation: ScheduleRunResult["completionEvaluation"];
    let stopMatched = false;
    const completionPolicy = resolveScheduleAutomation(pending.task.automation).completionPolicy;
    if (status === "succeeded" && completionPolicy.kind === "ai-evaluated") {
      pending.phase = "evaluating";
      try {
        if (!this.deps.evaluateCompletion) {
          throw new Error(msg("automation.run.completionUnavailable"));
        }
        const override = new Promise<{ kind: "override"; completion: CompletionInput }>(
          (resolve) => {
            pending.resolveSettlementOverride = (nextCompletion) =>
              resolve({ kind: "override", completion: nextCompletion });
          },
        );
        const evaluation = this.deps
          .evaluateCompletion({
            evaluationId: pending.runId,
            projectLocation: pending.projectLocation,
            agentKind: pending.task.agentKind,
            config: pending.task.config,
            condition: completionPolicy.stopWhen,
            summary,
            changedFiles,
          })
          .then((result) => ({ kind: "evaluation" as const, result }));
        const settled = await Promise.race([evaluation, override]);
        pending.resolveSettlementOverride = null;
        if (settled.kind === "override") {
          status = settled.completion.status;
          error = settled.completion.error;
          stopReason = settled.completion.stopReason;
        } else {
          completionEvaluation = {
            ...settled.result,
            condition: completionPolicy.stopWhen,
            evaluatedAt: this.nowIso(),
          };
          stopMatched =
            settled.result.stopMatched &&
            settled.result.confidence >= completionPolicy.confidenceThreshold;
          if (stopMatched) stopReason = "completion-condition";
        }
      } catch (evaluationError) {
        pending.resolveSettlementOverride = null;
        status = "failed";
        error = msg("automation.run.completionFailed", {
          detail: toErrorMessage(evaluationError),
        });
        stopReason = "completion-evaluation-error";
      }
    }

    const completedAt = this.nowIso();
    const result = buildScheduleRunResult({
      status,
      summary,
      changedFiles,
      completedAt,
      stopReason,
      ...(completionEvaluation ? { completionEvaluation } : {}),
    });
    const outcome: ScheduleTaskExecutionOutcome = {
      runId: pending.runId,
      status,
      summary,
      error,
      result,
      stopMatched,
      completionPolicySnapshot: completionPolicy,
    };
    const patch = { completedAt, status, summary, error, result };
    if (pending.persisted) {
      this.failedSettlements.set(pending.runId, { pending, patch, outcome });
      this.deps.updateRun(pending.runId, patch);
      this.failedSettlements.delete(pending.runId);
    }
    this.resolveFinished(pending, outcome);
  }

  private releasePending(pending: PendingRun): void {
    if (this.pendingByThread.get(pending.threadId) === pending)
      this.pendingByThread.delete(pending.threadId);
    this.pendingByRunId.delete(pending.runId);
  }

  private resolveFinished(pending: PendingRun, outcome: ScheduleTaskExecutionOutcome): void {
    this.releasePending(pending);
    if (this.disposed)
      pending.reject(new Error("Scheduled run interrupted because the host is shutting down."));
    else pending.resolve(outcome);
  }

  private retryFailedSettlements(): void {
    const failures: unknown[] = [];
    for (const [runId, settlement] of this.failedSettlements) {
      try {
        this.deps.updateRun(runId, settlement.patch);
        this.failedSettlements.delete(runId);
        this.resolveFinished(settlement.pending, settlement.outcome);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length)
      throw new ScheduleRunPersistenceError("Unable to persist scheduled run results.", {
        cause: new AggregateError(failures),
      });
  }

  private finishUnstarted(
    runId: string,
    completion: CompletionInput,
    completionPolicySnapshot: ScheduleCompletionPolicy,
  ): ScheduleTaskExecutionOutcome {
    const completedAt = this.nowIso();
    const result = buildScheduleRunResult({
      status: completion.status,
      summary: null,
      changedFiles: [],
      completedAt,
      stopReason: completion.stopReason,
    });
    this.deps.updateRun(runId, {
      completedAt,
      status: completion.status,
      error: completion.error,
      result,
    });
    return {
      runId,
      status: completion.status,
      summary: null,
      error: completion.error,
      result,
      stopMatched: false,
      completionPolicySnapshot,
    };
  }

  private requireHeartbeatTarget(
    task: ScheduledTask,
    project: Project,
    threadId: string,
    expectedLocation?: ProjectLocation,
  ): Thread {
    const target = this.deps.getThread?.(threadId);
    if (!target) throw new Error(msg("automation.heartbeat.missing"));
    if (target.archived) throw new Error(msg("automation.heartbeat.archived"));
    if (target.presentationMode !== "gui") {
      throw new Error(msg("automation.heartbeat.nativeChatRequired"));
    }
    if (target.projectId !== project.id) {
      throw new Error(msg("automation.heartbeat.differentProject"));
    }
    if (target.agentKind !== task.agentKind) {
      throw new Error(msg("automation.heartbeat.differentAgent"));
    }
    if (isThreadTurnActive(target.status)) {
      throw new Error(msg("automation.heartbeat.busy"));
    }
    const currentProject = this.deps.getProject(project.id);
    if (
      !currentProject ||
      !isDeepStrictEqual(currentProject.location, project.location) ||
      currentProject.remoteServerId !== project.remoteServerId ||
      (expectedLocation &&
        !isDeepStrictEqual(
          resolveProjectLocation(project.location, target.worktreePath),
          expectedLocation,
        ))
    ) {
      throw new Error(msg("schedule.executionStale"));
    }
    return target;
  }

  private async dispatchHeartbeat(
    pending: PendingRun,
    project: Project,
    config: ThreadConfig,
  ): Promise<void> {
    const { task, threadId } = pending;
    if (!this.deps.sendThreadInput) {
      throw new Error(msg("automation.heartbeat.unavailable"));
    }
    try {
      await this.deps.sendThreadInput({ threadId, prompt: task.prompt, config });
      return;
    } catch (error) {
      if (!isThreadSessionAbsenceRefusal(error)) throw error;
    }

    if (!this.canDispatch(pending)) return;
    const target = this.requireHeartbeatTarget(task, project, threadId, pending.projectLocation);
    if (!target.sessionRef) {
      throw new Error(msg("automation.heartbeat.cannotResume"));
    }
    pending.phase = "resuming";
    await this.deps.startThread({
      ...this.startPayload(
        task,
        { ...project, location: pending.projectLocation },
        threadId,
        config,
      ),
      prompt: "",
      ...(target.worktreePath ? { worktreePath: target.worktreePath } : {}),
      sessionRef: target.sessionRef,
    });
    if (!this.canDispatch(pending)) return;
    this.deps.admitScheduleExecution(task);
    this.requireHeartbeatTarget(task, project, threadId, pending.projectLocation);
    pending.phase = "dispatching";
    await this.deps.sendThreadInput({ threadId, prompt: task.prompt, config });
  }

  private persistFreshThread(
    task: ScheduledTask,
    project: Project,
    threadId: string,
    config: ThreadConfig,
    nowIso: string,
  ): void {
    const thread: Thread = {
      id: threadId,
      projectId: project.id,
      title: task.name,
      agentKind: task.agentKind,
      config,
      status: "launching",
      attention: "none",
      canResumeWithConfig: false,
      archived: false,
      done: false,
      starred: false,
      presentationMode: "gui",
      threadStatusSource: "server",
      createdAt: nowIso,
      updatedAt: nowIso,
      activeTurnStartedAt: nowIso,
    };
    this.deps.upsertThread(thread, -Date.now());
    this.deps.publishThreadsChanged?.([threadId]);
    this.deps.sendThreadCommand({
      kind: "start",
      threadId,
      projectId: project.id,
      agentKind: task.agentKind,
      config,
      prompt: task.prompt,
      title: task.name,
      presentationMode: "gui",
      launchRuntime: false,
      focus: false,
    });
  }

  private startPayload(
    task: ScheduledTask,
    project: Project,
    threadId: string,
    config: ThreadConfig,
  ): StartThreadPayload {
    return {
      threadId,
      projectLocation: project.location,
      agentKind: task.agentKind,
      config,
      prompt: task.prompt,
      initialSize: DEFAULT_TERMINAL_SIZE,
      presentationMode: "gui",
      ...resolveMcpLaunchSnapshot(
        this.deps.getSharedSettings(),
        project.mcpServers ?? [],
        config.mcpServerOverrides,
      ),
    };
  }

  private resolveProject(task: ScheduledTask): Project {
    if (task.projectId == null) return this.deps.ensureHomeProject();
    const project = this.deps.getProject(task.projectId);
    if (!project) throw new Error(msg("automation.run.projectMissing"));
    return project;
  }

  private async buildThreadConfig(
    task: ScheduledTask,
    location: ProjectLocation,
  ): Promise<ThreadConfig> {
    return {
      ...task.config,
      ...(await resolveHostThreadLaunchConfig(
        this.deps.getAgentStatuses,
        task.agentKind,
        location,
      )),
    };
  }

  private assertOpen(): void {
    if (this.disposed) throw new Error("Schedule run coordinator is shutting down.");
  }

  private nowIso(): string {
    return new Date((this.deps.now ?? Date.now)()).toISOString();
  }
}
