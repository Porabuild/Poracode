import type { PrData, Thread } from "@/shared/contracts";
import {
  gitProjectKey,
  gitTargetKey,
  pullRequestBranchKey,
  type GitStateSnapshot,
} from "@/shared/gitState";
import type { RemoteGitSummaries } from "@/shared/remote";
import { toRemoteThreadGitSummary } from "@/shared/remote/gitSummaries";

const DEFAULT_DEBOUNCE_MS = 500;

/**
 * Projects the host's authoritative `GitStateSnapshot` plus persisted threads
 * into compact per-thread git/PR summaries for remote snapshots and live
 * `remote-git-summaries` broadcasts. Works identically on headless servers and
 * zero-window desktop hosts.
 */
export function buildRemoteGitSummaries(
  hostId: string,
  snapshot: GitStateSnapshot,
  threads: readonly Thread[],
): RemoteGitSummaries {
  const summaries: RemoteGitSummaries = {};
  for (const thread of threads) {
    if (thread.archived) continue;
    const targetRef = {
      hostId,
      projectId: thread.projectId,
      ...(thread.worktreePath ? { worktreePath: thread.worktreePath } : {}),
    };
    const target = snapshot.targets[gitTargetKey(targetRef)];
    const status =
      target?.status ??
      (!thread.worktreePath
        ? snapshot.projects[gitProjectKey({ hostId, projectId: thread.projectId })]?.status
        : undefined);
    if (!status) continue;

    let prData: PrData | null = null;
    if (target?.pullRequestKey !== undefined) {
      prData = target.pullRequestKey
        ? (snapshot.pullRequests[target.pullRequestKey]?.data ?? null)
        : null;
    } else if (status.branch) {
      const branchPrKey =
        snapshot.pullRequestKeyByBranch[
          pullRequestBranchKey({ hostId, projectId: thread.projectId }, status.branch)
        ];
      if (branchPrKey) {
        prData = snapshot.pullRequests[branchPrKey]?.data ?? null;
      }
    }

    summaries[thread.id] = toRemoteThreadGitSummary(status, prData);
  }
  return summaries;
}

export interface HostGitSummariesControllerOptions {
  readonly hostId: string;
  getSnapshot(): GitStateSnapshot;
  getThreads(): readonly Thread[];
  onPublish(summaries: RemoteGitSummaries): void;
  readonly debounceMs?: number;
}

/**
 * Host-owned per-thread git-summary projection with debounced, deduplicated
 * broadcast. Combines the authoritative `GitStateService` snapshot with any
 * supplemental renderer-pushed summaries (while a desktop window is open and
 * polling projects that do not yet have `GitStateService` interests), giving
 * host `GitStateService` entries precedence and pruning deleted/archived
 * threads automatically.
 */
export class HostGitSummariesController {
  private supplementalSummaries: RemoteGitSummaries = {};
  private cachedSummaries: RemoteGitSummaries | null = null;
  private lastPublishedSerialized = "";
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(private readonly options: HostGitSummariesControllerOptions) {}

  /**
   * The current projection. Cached until a git-state, thread, or supplemental
   * change invalidates it: remote catalog pages read this on every page, and a
   * full thread read plus projection per page is unbounded work.
   */
  getSummaries(): RemoteGitSummaries {
    this.cachedSummaries ??= this.buildSummaries();
    return this.cachedSummaries;
  }

  private buildSummaries(): RemoteGitSummaries {
    const threads = this.options.getThreads();
    const hostSummaries = buildRemoteGitSummaries(
      this.options.hostId,
      this.options.getSnapshot(),
      threads,
    );
    const hasSupplemental = Object.keys(this.supplementalSummaries).length > 0;
    if (!hasSupplemental) return hostSummaries;

    const merged: RemoteGitSummaries = {};
    for (const thread of threads) {
      if (thread.archived) continue;
      const summary = hostSummaries[thread.id] ?? this.supplementalSummaries[thread.id];
      if (summary) merged[thread.id] = summary;
    }
    return merged;
  }

  /**
   * Accepts a supplemental renderer push (already debounced by the renderer)
   * and broadcasts immediately if the merged projection changed.
   */
  setSupplementalSummaries(summaries: RemoteGitSummaries): void {
    if (this.disposed) return;
    this.supplementalSummaries = summaries;
    this.cachedSummaries = null;
    this.publishNow();
  }

  /** Schedules a debounced projection refresh after a `GitStateService` or thread change. */
  notifyChanged(): void {
    if (this.disposed) return;
    // Invalidate now: a catalog read between this change and the debounced
    // broadcast must not serve the previous projection.
    this.cachedSummaries = null;
    if (this.timer !== null) return;
    const delay = this.options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.disposed) return;
      this.publishNow();
    }, delay);
    this.timer.unref?.();
  }

  /**
   * Drop renderer-pushed summaries when no desktop window is mounted. They are
   * refreshed only while a window polls, so retaining them would serve stale
   * branch/PR data for threads the host `GitStateService` does not cover.
   */
  clearSupplementalSummaries(): void {
    if (this.disposed || Object.keys(this.supplementalSummaries).length === 0) return;
    this.supplementalSummaries = {};
    this.cachedSummaries = null;
    this.publishNow();
  }

  dispose(): void {
    this.disposed = true;
    this.cachedSummaries = null;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private publishNow(): void {
    if (this.disposed) return;
    const summaries = this.getSummaries();
    const serialized = JSON.stringify(summaries);
    if (serialized === this.lastPublishedSerialized) return;
    this.lastPublishedSerialized = serialized;
    this.options.onPublish(summaries);
  }
}
