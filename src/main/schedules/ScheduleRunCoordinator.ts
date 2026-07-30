import { randomUUID } from "node:crypto";
import type {
  AgentKind,
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
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import {
  resolveUnrestrictedPermissionConfig,
  type UnrestrictedPermissionConfig,
} from "@/shared/agents/unrestrictedPermissions";
import type { SharedSettings } from "@/shared/settings";
import { toErrorMessage } from "@/shared/errorMessage";
import { msg } from "@/shared/messages";
import type { SupervisorEvent } from "@/shared/ipc";
import type { PersistedRuntimeItem } from "../db/runtimeItems";
import type { ScheduleRunPatch } from "../db/scheduleRuns";
import { buildScheduleRunResult, collectScheduleRunItems } from "./scheduleRunResults";
import type { ScheduleRunContext, ScheduleTaskExecutionOutcome } from "./types";

const TERMINAL_STATUSES: ReadonlySet<ThreadStatus> = new Set<ThreadStatus>([
  "idle",
  "finished",
  "inactive",
  "error",
]);
export interface ScheduleRunCoordinatorDeps {
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
  getThreadRuntimeItemCursor(threadId: string): number;
  getThreadRuntimeItemsAfter(threadId: string, cursor: number): PersistedRuntimeItem[];
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
  threadId: string;
  task: ScheduledTask;
  projectLocation: ProjectLocation;
  runtimeItemCursor: number;
  sawActive: boolean;
  timer: ReturnType<typeof setTimeout>;
  settling: boolean;
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

  constructor(private readonly deps: ScheduleRunCoordinatorDeps) {}

  observeSupervisorEvent(event: SupervisorEvent): void {
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
      void this.finishPending(event.threadId, {
        status: "interrupted",
        error: msg("automation.run.exited"),
        stopReason: "thread-exited",
      });
      return;
    }
    if (event.type !== "thread-state") return;

    const pending = this.pendingByThread.get(event.threadId);
    if (!pending) return;
    if (event.status === "launching" || event.status === "working") {
      pending.sawActive = true;
      return;
    }
    if (event.status === "needs_approval" || event.status === "needs_reply") {
      const replyRequired = event.status === "needs_reply";
      void this.finishPending(event.threadId, {
        status: "waiting-for-approval",
        error: replyRequired
          ? msg("automation.run.replyRequired")
          : msg("automation.run.approvalRequired"),
        stopReason: replyRequired ? "reply-required" : "approval-required",
      });
      return;
    }
    if (!TERMINAL_STATUSES.has(event.status)) return;
    if (event.status === "inactive" && !pending.sawActive) return;
    if (event.status === "error") {
      void this.finishPending(event.threadId, {
        status: "failed",
        error: event.errorMessage ?? msg("automation.run.failed"),
        stopReason: "runtime-error",
      });
      return;
    }
    void this.finishPending(event.threadId, {
      status: "succeeded",
      error: null,
      stopReason: null,
    });
  }

  handleSupervisorReset(): void {
    for (const threadId of [...this.pendingByThread.keys()]) {
      void this.finishPending(threadId, {
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
    const automation = resolveScheduleAutomation(task.automation);
    const threadId =
      automation.mode.kind === "heartbeat"
        ? automation.mode.targetThreadId
        : (this.deps.newId ?? randomUUID)();
    const runId = (this.deps.newId ?? randomUUID)();
    const startedAt = this.nowIso();
    this.deps.insertRun({
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
    });

    if (this.pendingByThread.has(threadId)) {
      return this.finishUnstarted(
        runId,
        {
          status: "failed",
          error: msg("automation.run.targetInUse"),
          stopReason: "target-busy",
        },
        automation.completionPolicy,
      );
    }

    let project: Project;
    let config: ThreadConfig;
    let runtimeItemCursor = -1;
    let freshThread = false;
    try {
      project = this.resolveProject(task);
      config = await this.buildThreadConfig(task, project.location);
      if (automation.mode.kind === "heartbeat") {
        const target = this.requireHeartbeatTarget(task, project, automation.mode.targetThreadId);
        runtimeItemCursor = this.deps.getThreadRuntimeItemCursor(target.id);
      } else {
        freshThread = !this.deps.threadExists(threadId);
        this.persistFreshThread(task, project, threadId, config, startedAt);
      }
    } catch (error) {
      return this.finishUnstarted(
        runId,
        {
          status: "failed",
          error: toErrorMessage(error),
          stopReason: "configuration-error",
        },
        automation.completionPolicy,
      );
    }

    let resolveRun!: (outcome: ScheduleTaskExecutionOutcome) => void;
    const settled = new Promise<ScheduleTaskExecutionOutcome>((resolve) => {
      resolveRun = resolve;
    });
    const timer = setTimeout(() => {
      void this.finishPending(threadId, {
        status: "failed",
        error: msg("automation.run.timeLimit"),
        stopReason: "time-limit",
      });
      void this.deps.interruptThread?.(threadId).catch(() => undefined);
    }, automation.maxRuntimeSeconds * 1_000);
    timer.unref?.();
    const pending: PendingRun = {
      runId,
      threadId,
      task,
      projectLocation: project.location,
      runtimeItemCursor,
      sawActive: false,
      timer,
      settling: false,
      resolveSettlementOverride: null,
      resolve: resolveRun,
    };
    this.pendingByThread.set(threadId, pending);
    this.pendingByRunId.set(runId, pending);

    try {
      if (automation.mode.kind === "heartbeat") {
        await this.dispatchHeartbeat(task, project, threadId, config);
      } else {
        await this.deps.startThread(this.startPayload(task, project, threadId, config));
      }
    } catch (error) {
      if (freshThread) {
        this.deps.deleteThread(threadId);
        this.deps.sendThreadCommand({ kind: "delete", threadId });
      }
      if (this.pendingByRunId.has(runId)) {
        await this.finishPending(threadId, {
          status: "failed",
          error: toErrorMessage(error),
          stopReason: "launch-error",
        });
      }
    }

    return settled;
  }

  cancelRun(runId: string): boolean {
    const pending = this.pendingByRunId.get(runId);
    if (!pending) return false;
    void this.finishPending(pending.threadId, {
      status: "cancelled",
      error: null,
      stopReason: "cancelled",
    });
    void this.deps.interruptThread?.(pending.threadId).catch(() => undefined);
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
    if (!pending) return;
    if (event.type === "turn.started") {
      pending.sawActive = true;
      return;
    }
    if (event.type === "error") {
      void this.finishPending(event.threadId, {
        status: "failed",
        error: event.message,
        stopReason: "runtime-error",
      });
      return;
    }
    if (event.type !== "turn.completed") return;
    if (event.state === "completed") {
      void this.finishPending(event.threadId, {
        status: "succeeded",
        error: null,
        stopReason: null,
      });
      return;
    }
    void this.finishPending(event.threadId, {
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

  private async finishPending(threadId: string, completion: CompletionInput): Promise<void> {
    const pending = this.pendingByThread.get(threadId);
    if (!pending) return;
    if (pending.settling) {
      if (completion.status === "cancelled" || completion.status === "interrupted") {
        pending.resolveSettlementOverride?.(completion);
      }
      return;
    }
    pending.settling = true;
    clearTimeout(pending.timer);

    let items: PersistedRuntimeItem[] = [];
    try {
      items = this.deps.getThreadRuntimeItemsAfter(pending.threadId, pending.runtimeItemCursor);
    } catch {
      // Settlement remains durable even if transcript hydration fails.
    }
    const { summary, changedFiles } = collectScheduleRunItems(items);
    let status = completion.status;
    let error = completion.error;
    let stopReason = completion.stopReason;
    let completionEvaluation: ScheduleRunResult["completionEvaluation"];
    let stopMatched = false;
    const completionPolicy = resolveScheduleAutomation(pending.task.automation).completionPolicy;
    if (status === "succeeded" && completionPolicy.kind === "ai-evaluated") {
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
    this.pendingByThread.delete(threadId);
    this.pendingByRunId.delete(pending.runId);
    this.deps.updateRun(pending.runId, {
      completedAt,
      status,
      summary,
      error,
      result,
    });
    pending.resolve({
      runId: pending.runId,
      status,
      summary,
      error,
      result,
      stopMatched,
      completionPolicySnapshot: completionPolicy,
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

  private requireHeartbeatTarget(task: ScheduledTask, project: Project, threadId: string): Thread {
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
    return target;
  }

  private async dispatchHeartbeat(
    task: ScheduledTask,
    project: Project,
    threadId: string,
    config: ThreadConfig,
  ): Promise<void> {
    if (!this.deps.sendThreadInput) {
      throw new Error(msg("automation.heartbeat.unavailable"));
    }
    try {
      await this.deps.sendThreadInput({ threadId, prompt: task.prompt, config });
      return;
    } catch (error) {
      if (!/unknown thread session|session.*not found/iu.test(toErrorMessage(error))) throw error;
    }

    const target = this.deps.getThread?.(threadId);
    if (!target?.sessionRef) {
      throw new Error(msg("automation.heartbeat.cannotResume"));
    }
    await this.deps.startThread({
      ...this.startPayload(task, project, threadId, config),
      prompt: "",
      sessionRef: target.sessionRef,
    });
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
      ...resolveMcpLaunchSnapshot(this.deps.getSharedSettings(), project.mcpServers ?? []),
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
      model: task.config.model,
      ...(task.config.effort !== undefined ? { effort: task.config.effort } : {}),
      ...(task.config.fast !== undefined ? { fast: task.config.fast } : {}),
      ...(await this.resolveUnrestrictedPermissions(task.agentKind, location)),
    };
  }

  private async resolveUnrestrictedPermissions(
    agentKind: AgentKind,
    location: ProjectLocation,
  ): Promise<UnrestrictedPermissionConfig> {
    try {
      const statuses = await this.deps.getAgentStatuses(
        location.kind === "wsl" ? [location.distro] : [],
      );
      const agents = getProjectAgentStatuses(location, statuses.windows, statuses.wsl);
      const agent = agents.find((status) => status.kind === agentKind);
      return agent ? resolveUnrestrictedPermissionConfig(agent.capabilities) : {};
    } catch {
      return {};
    }
  }

  private nowIso(): string {
    return new Date((this.deps.now ?? Date.now)()).toISOString();
  }
}
