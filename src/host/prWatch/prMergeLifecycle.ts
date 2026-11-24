import {
  isThreadTurnActive,
  type GitStatusResult,
  type PrData,
  type PrWatch,
  type Project,
  type ProjectLocation,
  type RemoteThreadCommand,
  type Thread,
} from "@/shared/contracts";
import {
  mergedPrBasePullRemote,
  pullRequestBranchKey,
  pullRequestKey,
  type GitStatePatch,
  type GitStateSnapshot,
} from "@/shared/gitState";
import type { SupervisorEvent } from "@/shared/ipc";
import type { SharedSettings } from "@/shared/settings";

const MAX_TRACKED_PR_STATES = 10_000;

export interface PrMergeLifecycleServiceOptions {
  readonly hostId: string;
  getProject(projectId: string): Project | null;
  getThread(threadId: string): Thread | null;
  getThreads(): readonly Thread[];
  getGitSnapshot(): GitStateSnapshot;
  getSharedSettings(): Pick<SharedSettings, "autoMarkDoneOnPrMerge">;
  getGitStatus(payload: {
    projectLocation: ProjectLocation;
    detail?: "summary";
  }): Promise<GitStatusResult>;
  gitPull(payload: { projectLocation: ProjectLocation; remote: string }): Promise<unknown>;
  refreshProjectAfterSync(projectId: string): Promise<void>;
  isExperimentThread?(threadId: string): boolean;
  closeThreadConfirmed(threadId: string): Promise<boolean>;
  markThreadDoneInDb(threadId: string, doneAt: string): boolean;
  publishThreadsChanged(threadIds: readonly string[]): void;
  sendThreadCommand(command: RemoteThreadCommand): boolean;
  reportError?(error: unknown): void;
  now?(): string;
}

/**
 * Host-owned PR merge lifecycle shared by both desktop (open or zero-window
 * tray) and standalone headless hosts:
 *
 * 1. Fast-forward pulls a merged PR's base branch when the project checkout is
 *    cleanly on that branch with no unpushed commits, serialized per project.
 * 2. When `autoMarkDoneOnPrMerge` is enabled, marks matching worktree threads
 *    done on observed non-merged → merged transitions and PR Watch merge
 *    events, closing their supervisor sessions, updating SQLite, broadcasting
 *    `remote-threads-changed`, and mirroring `set-done` to any mounted
 *    renderer for UI cleanup.
 * 3. Defers threads that are mid-turn when their PR merges and settles them
 *    once the turn finishes via supervisor lifecycle events.
 */
export class PrMergeLifecycleService {
  private readonly lastPrStateByKey = new Map<string, PrData["state"]>();
  private readonly baseBranchByPr = new Map<string, string>();
  private readonly pendingPrSyncs = new Map<string, Promise<void>>();
  private readonly projectSyncTails = new Map<string, Promise<void>>();
  private readonly syncedPrKeys = new Set<string>();
  private readonly pendingThreadIds = new Set<string>();
  private readonly settlingThreadIds = new Set<string>();
  private readonly pendingWork = new Set<Promise<void>>();
  private disposed = false;

  constructor(private readonly options: PrMergeLifecycleServiceOptions) {}

  handlePrObserved(watch: PrWatch, pr: PrData): void {
    if (this.disposed) return;
    this.rememberBaseBranch(watch.projectId, watch.prNumber, pr.baseBranch);
    if (pr.state === "merged") {
      void this.syncMergedPrBase(watch.projectId, watch.prNumber, pr.baseBranch);
    }
  }

  handlePrMerged(watch: PrWatch): void {
    if (this.disposed) return;
    const baseBranch = this.resolveBaseBranch(watch.projectId, watch.prNumber);
    if (baseBranch) {
      void this.syncMergedPrBase(watch.projectId, watch.prNumber, baseBranch);
    }
    if (!this.options.getSharedSettings().autoMarkDoneOnPrMerge) return;

    for (const thread of this.options.getThreads()) {
      if (thread.done || thread.archived) continue;
      const matchesWatch =
        (watch.worktreePath !== undefined && thread.worktreePath === watch.worktreePath) ||
        (thread.projectId === watch.projectId && thread.prNumber === watch.prNumber);
      if (matchesWatch) {
        this.settleThread(thread);
      }
    }
  }

  handleGitPatch(patch: GitStatePatch): void {
    if (this.disposed || !patch.pullRequests) return;
    const freshlyMerged: Array<{
      prKey: string;
      hostId: string;
      projectId: string;
      prNumber: number;
      baseBranch: string;
    }> = [];

    for (const [prKey, prState] of Object.entries(patch.pullRequests)) {
      const previousState = this.lastPrStateByKey.get(prKey);
      this.rememberPrState(prKey, prState.data.state);
      this.rememberBaseBranch(prState.ref.projectId, prState.ref.prNumber, prState.data.baseBranch);
      if (
        previousState !== undefined &&
        previousState !== "merged" &&
        prState.data.state === "merged"
      ) {
        freshlyMerged.push({
          prKey,
          hostId: prState.ref.hostId,
          projectId: prState.ref.projectId,
          prNumber: prState.ref.prNumber,
          baseBranch: prState.data.baseBranch,
        });
      }
    }

    if (freshlyMerged.length === 0) return;

    for (const item of freshlyMerged) {
      void this.syncMergedPrBase(item.projectId, item.prNumber, item.baseBranch);
    }

    if (!this.options.getSharedSettings().autoMarkDoneOnPrMerge) return;

    const snapshot = this.options.getGitSnapshot();
    const threads = this.options.getThreads();
    for (const item of freshlyMerged) {
      const linkedWorktrees = new Set<string>();
      for (const target of Object.values(snapshot.targets)) {
        if (target.pullRequestKey === item.prKey && target.ref.worktreePath) {
          linkedWorktrees.add(target.ref.worktreePath);
        }
      }
      for (const thread of threads) {
        if (!thread.worktreePath || thread.done || thread.archived) continue;
        const matchesWorktree = linkedWorktrees.has(thread.worktreePath);
        const branchKey = thread.worktreeBranch
          ? pullRequestBranchKey(
              { hostId: item.hostId, projectId: item.projectId },
              thread.worktreeBranch,
            )
          : undefined;
        const matchesBranch =
          branchKey !== undefined && snapshot.pullRequestKeyByBranch[branchKey] === item.prKey;
        const matchesNumber =
          thread.projectId === item.projectId && thread.prNumber === item.prNumber;
        if (matchesWorktree || matchesBranch || matchesNumber) {
          this.settleThread(thread);
        }
      }
    }
  }

  observeSupervisorEvent(event: SupervisorEvent): void {
    if (this.disposed || this.pendingThreadIds.size === 0) return;
    if (event.type !== "thread-state" && event.type !== "thread-exited") return;
    if (!this.pendingThreadIds.has(event.threadId)) return;

    if (!this.options.getSharedSettings().autoMarkDoneOnPrMerge) {
      this.pendingThreadIds.clear();
      return;
    }

    if (event.type === "thread-state" && isThreadTurnActive(event.status)) return;

    const thread = this.options.getThread(event.threadId);
    if (!thread) {
      this.pendingThreadIds.delete(event.threadId);
      return;
    }

    const settledStatus = event.type === "thread-state" ? event.status : "idle";
    this.settleThread({ ...thread, status: settledStatus });
  }

  /** Safely sync one merged PR's base checkout, serialized per project. */
  syncMergedPrBase(projectId: string, prNumber: number, baseBranch: string): Promise<void> {
    if (this.disposed || !baseBranch) return Promise.resolve();
    const prKey = `${projectId}#${prNumber}`;
    if (this.syncedPrKeys.has(prKey)) return Promise.resolve();
    const pending = this.pendingPrSyncs.get(prKey);
    if (pending) return pending;

    const previous = this.projectSyncTails.get(projectId) ?? Promise.resolve();
    const sync = this.track(
      previous
        .catch(() => undefined)
        .then(async () => {
          if (this.disposed || this.syncedPrKeys.has(prKey)) return;
          if (this.syncedPrKeys.size >= MAX_TRACKED_PR_STATES) this.syncedPrKeys.clear();
          this.syncedPrKeys.add(prKey);
          const project = this.options.getProject(projectId);
          if (!project) return;
          await this.pullMergedPrBaseIfPossible(project.location, baseBranch, projectId);
        }),
    );

    this.pendingPrSyncs.set(prKey, sync);
    this.projectSyncTails.set(projectId, sync);
    void sync.finally(() => {
      this.pendingPrSyncs.delete(prKey);
      if (this.projectSyncTails.get(projectId) === sync) this.projectSyncTails.delete(projectId);
    });
    return sync;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.pendingThreadIds.clear();
    await Promise.allSettled([...this.pendingWork]);
  }

  private async pullMergedPrBaseIfPossible(
    projectLocation: ProjectLocation,
    baseBranch: string,
    projectId: string,
  ): Promise<void> {
    try {
      const status = await this.options.getGitStatus({ projectLocation, detail: "summary" });
      if (this.disposed) return;
      const remote = mergedPrBasePullRemote(status, baseBranch);
      if (!remote) return;

      await this.options.gitPull({
        projectLocation,
        remote,
      });
    } catch (error) {
      console.warn("[git] post-merge pull skipped", error);
      return;
    }

    if (this.disposed) return;
    try {
      await this.options.refreshProjectAfterSync(projectId);
    } catch (error) {
      console.warn("[git] post-merge status refresh failed", error);
    }
  }

  private settleThread(thread: Thread): void {
    if (this.disposed) return;
    if (thread.done || thread.archived || this.isExperimentThreadSafe(thread.id)) {
      this.pendingThreadIds.delete(thread.id);
      return;
    }
    if (isThreadTurnActive(thread.status)) {
      this.pendingThreadIds.add(thread.id);
      return;
    }
    this.pendingThreadIds.delete(thread.id);
    if (this.settlingThreadIds.has(thread.id)) return;
    this.settlingThreadIds.add(thread.id);

    void this.track(
      (async () => {
        try {
          let closedConfirmed = false;
          try {
            closedConfirmed = await this.options.closeThreadConfirmed(thread.id);
          } catch (error) {
            this.options.reportError?.(error);
          }
          if (this.disposed) return;

          const latest = this.options.getThread(thread.id);
          if (!latest || latest.done || latest.archived || this.isExperimentThreadSafe(latest.id)) {
            return;
          }
          if (!closedConfirmed && isThreadTurnActive(latest.status)) {
            this.pendingThreadIds.add(latest.id);
            return;
          }

          const doneAt = this.options.now?.() ?? new Date().toISOString();
          const changed = this.options.markThreadDoneInDb(latest.id, doneAt);
          if (!changed) return;

          this.options.publishThreadsChanged([latest.id]);
          this.options.sendThreadCommand({ kind: "set-done", threadId: latest.id, done: true });
        } catch (error) {
          this.options.reportError?.(error);
        } finally {
          this.settlingThreadIds.delete(thread.id);
        }
      })(),
    );
  }

  private isExperimentThreadSafe(threadId: string): boolean {
    try {
      return this.options.isExperimentThread?.(threadId) === true;
    } catch {
      return false;
    }
  }

  private resolveBaseBranch(projectId: string, prNumber: number): string | undefined {
    const cached = this.baseBranchByPr.get(`${projectId}#${prNumber}`);
    if (cached) return cached;
    const key = pullRequestKey({ hostId: this.options.hostId, projectId, prNumber });
    return this.options.getGitSnapshot().pullRequests[key]?.data.baseBranch;
  }

  private rememberPrState(prKey: string, state: PrData["state"]): void {
    if (this.lastPrStateByKey.size >= MAX_TRACKED_PR_STATES && !this.lastPrStateByKey.has(prKey)) {
      this.lastPrStateByKey.clear();
    }
    this.lastPrStateByKey.set(prKey, state);
  }

  private rememberBaseBranch(projectId: string, prNumber: number, baseBranch: string): void {
    if (!baseBranch) return;
    const key = `${projectId}#${prNumber}`;
    if (this.baseBranchByPr.size >= MAX_TRACKED_PR_STATES && !this.baseBranchByPr.has(key)) {
      this.baseBranchByPr.clear();
    }
    this.baseBranchByPr.set(key, baseBranch);
  }

  private track(promise: Promise<void>): Promise<void> {
    this.pendingWork.add(promise);
    void promise.finally(() => {
      this.pendingWork.delete(promise);
    });
    return promise;
  }
}
