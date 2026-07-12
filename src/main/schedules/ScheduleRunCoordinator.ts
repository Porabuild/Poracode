import { randomUUID } from "node:crypto";
import type {
  AgentKind,
  AgentStatusesResponse,
  Project,
  ProjectLocation,
  RemoteThreadCommand,
  ScheduledTask,
  ScheduledTaskRun,
  StartThreadPayload,
  Thread,
  ThreadConfig,
  ThreadStatus,
} from "@/shared/contracts";
import type { SharedSettings } from "@/shared/settings";
import { DEFAULT_TERMINAL_SIZE, resolveMcpLaunchSnapshot } from "@/shared/contracts";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import {
  resolveUnrestrictedPermissionConfig,
  type UnrestrictedPermissionConfig,
} from "@/shared/agents/unrestrictedPermissions";
import type { SupervisorEvent } from "@/shared/ipc";
import type { ScheduleRunPatch } from "../db/scheduleRuns";

/**
 * A `thread-state` transition ends the run only once the turn fully settles.
 * `needs_approval`/`needs_reply` are mid-turn pauses (they can resume under
 * auto-approval), so — matching {@link isThreadTurnActive} — they are NOT
 * treated as terminal here; that avoids settling a run while its thread keeps
 * working.
 */
const TERMINAL_STATUSES: ReadonlySet<ThreadStatus> = new Set<ThreadStatus>([
  "idle",
  "finished",
  "inactive",
  "error",
]);

export interface ScheduleRunCoordinatorDeps {
  /** Launch the child session in the supervisor (main → supervisor request). */
  startThread(payload: StartThreadPayload): Promise<unknown>;
  /** Cached agent detection for the given WSL distros (supervisor request). */
  getAgentStatuses(wslDistros: string[]): Promise<AgentStatusesResponse>;
  /** Mirror a thread command to the renderer store; false when no window is up. */
  sendThreadCommand(command: RemoteThreadCommand): boolean;
  /** Resolve (creating if absent) the persisted home-scope project row. */
  ensureHomeProject(): Project;
  /** Resolve a persisted project row by id, or null when it no longer exists. */
  getProject(projectId: string): Project | null;
  /** Current global MCP settings; optional for isolated tests/embedders. */
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
  sawActive: boolean;
  resolve: (summary: string) => void;
  reject: (error: Error) => void;
}

/**
 * Runs a scheduled task as a REAL GUI thread (persisted, sidebar-visible)
 * instead of a headless one-shot prompt, and records a run-history row linked
 * to that thread.
 *
 * Start ordering mirrors {@link handleOrchestratorThreadCreated}: persist the
 * thread row first, mirror it to the renderer (`launchRuntime: false`,
 * `focus: false`), then call the supervisor's `startThread`. The returned
 * promise settles when the thread's turn ends (observed via `thread-state`),
 * so the caller's `ScheduleService.settle` keeps working unchanged.
 */
export class ScheduleRunCoordinator {
  private readonly pending = new Map<string, PendingRun>();

  constructor(private readonly deps: ScheduleRunCoordinatorDeps) {}

  /** Wire into the supervisor event tap (main.ts `onEvent`). */
  observeSupervisorEvent(event: SupervisorEvent): void {
    if (event.type !== "thread-state") return;
    const run = this.pending.get(event.threadId);
    if (!run) return;

    if (event.status === "launching" || event.status === "working") {
      run.sawActive = true;
      return;
    }
    if (event.status === "needs_approval" || event.status === "needs_reply") {
      // Mid-turn pause — the turn is still active; wait for a terminal state.
      return;
    }
    if (!TERMINAL_STATUSES.has(event.status)) return;
    // "inactive" before the run ever became active is a stale pre-launch echo.
    if (event.status === "inactive" && !run.sawActive) return;

    this.pending.delete(event.threadId);
    const completedAt = this.nowIso();
    if (event.status === "error") {
      const error = event.errorMessage ?? "Scheduled run failed.";
      this.deps.updateRun(run.runId, { completedAt, status: "failed", error });
      run.reject(new Error(error));
      return;
    }
    this.deps.updateRun(run.runId, { completedAt, status: "succeeded" });
    // Final assistant text is not captured in main without heavy runtime-event
    // plumbing, so the summary stays null and the schedule's quick-glance
    // lastResult resolves to an empty string.
    run.resolve("");
  }

  async runScheduleAsThread(task: ScheduledTask): Promise<string> {
    const project = this.resolveProject(task);
    const threadId = (this.deps.newId ?? randomUUID)();
    const nowIso = this.nowIso();

    const config = await this.buildThreadConfig(task, project.location);
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

    const existed = this.deps.threadExists(threadId);
    // New rows sort to the top via a descending timestamp (same convention as
    // the orchestrator bridge and the remote-access server).
    this.deps.upsertThread(thread, -Date.now());

    // Mirror to the renderer; a forwarded title is authoritative and disables
    // AI title generation (the schedule name is the thread title). `false` from
    // sendThreadCommand (no window) is expected and must not fail the run.
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

    const run: ScheduledTaskRun = {
      id: (this.deps.newId ?? randomUUID)(),
      scheduleId: task.id,
      threadId,
      startedAt: nowIso,
      completedAt: null,
      status: "running",
      summary: null,
      error: null,
    };
    this.deps.insertRun(run);

    const settled = new Promise<string>((resolve, reject) => {
      this.pending.set(threadId, { runId: run.id, sawActive: false, resolve, reject });
    });

    const startPayload: StartThreadPayload = {
      threadId,
      projectLocation: project.location,
      agentKind: task.agentKind,
      config,
      prompt: task.prompt,
      initialSize: DEFAULT_TERMINAL_SIZE,
      presentationMode: "gui",
      ...resolveMcpLaunchSnapshot(this.deps.getSharedSettings(), project.mcpServers ?? []),
    };

    try {
      await this.deps.startThread(startPayload);
    } catch (error) {
      this.pending.delete(threadId);
      const message = error instanceof Error ? error.message : String(error);
      this.deps.updateRun(run.id, {
        completedAt: this.nowIso(),
        status: "failed",
        error: message,
      });
      // Roll back the fresh row (follow the orchestrator bridge): drop it from
      // the DB and tell the renderer to forget it, but keep a pre-existing row.
      if (!existed) {
        this.deps.deleteThread(threadId);
        this.deps.sendThreadCommand({ kind: "delete", threadId });
      }
      throw error instanceof Error ? error : new Error(message);
    }

    return settled;
  }

  /**
   * Resolve the project the run's thread lives in. A null/absent `projectId`
   * uses the built-in Home scope; a set id must still reference an existing
   * project row — if the user deleted it, fail the run with a clear message so
   * they notice and can edit the schedule (rather than silently reverting to
   * Home).
   */
  private resolveProject(task: ScheduledTask): Project {
    if (task.projectId == null) return this.deps.ensureHomeProject();
    const project = this.deps.getProject(task.projectId);
    if (!project) throw new Error("Project no longer exists.");
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

  /**
   * Scheduled runs execute unattended — nobody is around to answer approval
   * prompts — so every run launches with the provider's most-permissive
   * advertised policy (same capabilities-driven resolution the subagent lane
   * uses; no provider-specific branching here). If the capability lookup
   * fails or the agent is unknown, fall back to provider defaults rather
   * than failing the run.
   */
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
      if (!agent) return {};
      return resolveUnrestrictedPermissionConfig(agent.capabilities);
    } catch {
      return {};
    }
  }

  private nowIso(): string {
    return new Date((this.deps.now ?? Date.now)()).toISOString();
  }
}
