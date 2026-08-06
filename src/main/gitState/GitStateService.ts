import type {
  GhGetPrDetailsResult,
  GhGetPrDiffResult,
  GhGetPrFilesResult,
  GhGetPrReviewThreadsResult,
  GhListPullRequestsResult,
  GitGetWorktreeSourceBranchResult,
  GitProjectSnapshotResult,
  GitStatusResult,
  GitWorktreeStatusBatchResult,
  PrDetails,
  Project,
  ProjectLocation,
} from "@/shared/contracts";
import {
  applyGitStatePatch,
  emptyGitStateSnapshot,
  gitProjectKey,
  gitTargetKey,
  pullRequestBranchKey,
  pullRequestKey,
  type GitStateInterest,
  type GitStatePatch,
  type GitStateSnapshot,
  type GitTargetRef,
  type PullRequestState,
} from "@/shared/gitState";
import type { SupervisorEvent } from "@/shared/ipc";
import { buildWorktreeLocation } from "@/shared/worktree";

const DEFAULT_POLL_INTERVAL_MS = 30_000;
const DEFAULT_REMOTE_FETCH_INTERVAL_MS = 3 * 60_000;

/**
 * One PR reading folded into its snapshot entry. `existing` is spread first so a
 * core/details publish keeps the review-bundle fields (`files`, `diff`,
 * `reviewThreads`) and their freshness stamps, which only
 * {@link GitStateService.refreshPullRequestReviewBundle} fetches.
 */
function mergePullRequestState(input: {
  readonly existing: PullRequestState | undefined;
  readonly ref: PullRequestState["ref"];
  readonly data: PullRequestState["data"];
  readonly details: PrDetails | undefined;
  readonly at: string;
}): PullRequestState {
  return {
    ...input.existing,
    ref: input.ref,
    data: input.data,
    ...(input.details ? { details: input.details } : {}),
    freshness: {
      ...input.existing?.freshness,
      core: input.at,
      ...(input.details ? { details: input.at } : {}),
    },
  };
}

export interface GitStateExecutor {
  gitFetch(input: {
    projectLocation: ProjectLocation;
    remote: string;
    prune: boolean;
  }): Promise<void>;
  gitProjectSnapshot(input: {
    projectLocation: ProjectLocation;
    includeGhCheck: boolean;
  }): Promise<GitProjectSnapshotResult>;
  getGitStatus(input: { projectLocation: ProjectLocation }): Promise<GitStatusResult>;
  gitWorktreeStatusBatch(input: {
    projectLocation: ProjectLocation;
    worktreePaths: string[];
    detail?: "summary" | "full";
  }): Promise<GitWorktreeStatusBatchResult>;
  gitGetWorktreeSourceBranch(input: {
    projectLocation: ProjectLocation;
    branch: string;
  }): Promise<GitGetWorktreeSourceBranchResult>;
  ghGetPrForBranch(input: {
    projectLocation: ProjectLocation;
    branch: string;
  }): Promise<PullRequestState["data"] | null>;
  ghGetPrDetails(input: {
    projectLocation: ProjectLocation;
    prNumber: number;
  }): Promise<GhGetPrDetailsResult>;
  ghGetPrFiles(input: {
    projectLocation: ProjectLocation;
    prNumber: number;
  }): Promise<GhGetPrFilesResult>;
  ghGetPrDiff(input: {
    projectLocation: ProjectLocation;
    prNumber: number;
  }): Promise<GhGetPrDiffResult>;
  ghGetPrReviewComments(input: {
    projectLocation: ProjectLocation;
    prNumber: number;
  }): Promise<GhGetPrReviewThreadsResult>;
  ghListPullRequests(input: {
    projectLocation: ProjectLocation;
  }): Promise<GhListPullRequestsResult>;
}

export interface GitStateServiceOptions {
  readonly hostId: string;
  readonly executor: GitStateExecutor;
  readonly getProject: (projectId: string) => Project | null;
  readonly onPatch?: ((patch: GitStatePatch) => void) | undefined;
  readonly now?: (() => Date) | undefined;
  readonly pollIntervalMs?: number | undefined;
  readonly remoteFetchIntervalMs?: number | undefined;
}

export class GitStateService {
  private snapshot: GitStateSnapshot = emptyGitStateSnapshot();
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly interestsByOwner = new Map<string, readonly GitStateInterest[]>();
  private readonly lastRemoteFetchAt = new Map<string, number>();
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private disposed = false;

  constructor(private readonly options: GitStateServiceOptions) {}

  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.schedulePollIfNeeded();
  }

  dispose(): void {
    this.disposed = true;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
    this.interestsByOwner.clear();
    this.lastRemoteFetchAt.clear();
  }

  getSnapshot(): GitStateSnapshot {
    return this.snapshot;
  }

  setInterests(ownerId: string, interests: readonly GitStateInterest[]): void {
    if (interests.length === 0) {
      this.clearInterests(ownerId);
      return;
    }
    const previous = this.interestsByOwner.get(ownerId);
    if (previous && this.interestsEqual(previous, interests)) return;
    this.interestsByOwner.set(ownerId, interests);
    this.schedulePollIfNeeded();
    void this.refreshInterests(interests, { fetchRemote: true });
  }

  clearInterests(ownerId: string): void {
    this.interestsByOwner.delete(ownerId);
    if (this.interestsByOwner.size === 0 && this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  observeSupervisorEvent(event: SupervisorEvent): void {
    if (event.type !== "git-changed" && event.type !== "project-tree-changed") return;
    void this.refreshInterestedProject(event.projectId);
  }

  async refreshProject(projectId: string): Promise<void> {
    const project = this.requireProject(projectId);
    await this.dedupe(`project:${projectId}`, async () => {
      const result = await this.options.executor.gitProjectSnapshot({
        projectLocation: project.location,
        includeGhCheck: true,
      });
      const refreshedAt = this.timestamp();
      const projectRef = { hostId: this.options.hostId, projectId };
      const projectKey = gitProjectKey(projectRef);
      const targetRef: GitTargetRef = projectRef;
      const targetKey = gitTargetKey(targetRef);
      this.publish({
        projects: {
          [projectKey]: {
            ref: projectRef,
            ...(result.status ? { status: result.status } : {}),
            ...(result.branches ? { branches: result.branches } : {}),
            ...(result.worktrees ? { worktrees: result.worktrees } : {}),
            ...(result.ghAvailable !== null ? { ghAvailable: result.ghAvailable } : {}),
            refreshedAt,
          },
        },
        targets: {
          [targetKey]: {
            ...this.snapshot.targets[targetKey],
            ref: targetRef,
            ...(result.status ? { status: result.status } : {}),
            refreshedAt,
          },
        },
      });

      if (result.status?.branch && result.ghAvailable !== false) {
        await this.refreshPullRequestForBranch(projectId, result.status.branch);
      }
    });
  }

  async refreshTarget(input: {
    readonly projectId: string;
    readonly worktreePath?: string | undefined;
    readonly branch?: string | undefined;
    readonly includePrDetails?: boolean | undefined;
  }): Promise<void> {
    if (!input.worktreePath) {
      await this.refreshProject(input.projectId);
      return;
    }
    const project = this.requireProject(input.projectId);
    const targetRef: GitTargetRef = {
      hostId: this.options.hostId,
      projectId: input.projectId,
      worktreePath: input.worktreePath,
    };
    const targetKey = gitTargetKey(targetRef);
    await this.dedupe(`target:${targetKey}`, async () => {
      const projectLocation = buildWorktreeLocation(project.location, input.worktreePath!);
      const status = await this.options.executor.getGitStatus({ projectLocation });
      const branch = input.branch ?? status.branch;
      const sourceInfo = branch
        ? await this.options.executor
            .gitGetWorktreeSourceBranch({
              projectLocation: project.location,
              branch,
            })
            .catch(() => undefined)
        : undefined;
      this.publish({
        targets: {
          [targetKey]: {
            ...this.snapshot.targets[targetKey],
            ref: targetRef,
            status,
            ...(sourceInfo ? { sourceInfo } : {}),
            refreshedAt: this.timestamp(),
          },
        },
      });
      if (branch) {
        await this.refreshPullRequestForBranch(input.projectId, branch, {
          includeDetails: input.includePrDetails,
        });
      }
    });
  }

  async refreshPullRequestForBranch(
    projectId: string,
    branch: string,
    options: { readonly includeDetails?: boolean | undefined } = {},
  ): Promise<PullRequestState["data"] | null> {
    const project = this.requireProject(projectId);
    const projectRef = { hostId: this.options.hostId, projectId };
    const branchKey = pullRequestBranchKey(projectRef, branch);
    return this.dedupe(`pr-branch:${branchKey}:${Boolean(options.includeDetails)}`, async () => {
      const data = await this.options.executor.ghGetPrForBranch({
        projectLocation: project.location,
        branch,
      });
      if (!data) {
        this.publish({
          pullRequestKeyByBranch: { [branchKey]: null },
          targets: this.targetsForBranch(projectId, branch, null),
        });
        return null;
      }

      const ref = { ...projectRef, prNumber: data.number };
      const key = pullRequestKey(ref);
      const existing = this.snapshot.pullRequests[key];
      const fetchedAt = this.timestamp();
      const details = options.includeDetails
        ? await this.options.executor
            .ghGetPrDetails({
              projectLocation: project.location,
              prNumber: data.number,
            })
            .then((result) => result.details)
            .catch(() => undefined)
        : undefined;
      this.publish({
        pullRequests: {
          [key]: mergePullRequestState({ existing, ref, data, details, at: fetchedAt }),
        },
        pullRequestKeyByBranch: { [branchKey]: key },
        targets: this.targetsForBranch(projectId, branch, key),
      });
      return data;
    });
  }

  /**
   * Fold a PR reading taken outside this service — the PR-watch loop, which
   * polls its own watches — into the snapshot so remote clients see it on the
   * next patch instead of waiting for their own poll to come around. Publishes
   * only; it never spawns `gh`. `watch` is structural so callers can hand over
   * their `PrWatch` row as-is.
   *
   * The branch alias is left alone when it already points at a different PR:
   * that means a newer PR for the same head branch was discovered elsewhere,
   * and the watched PR must not steal the branch back.
   */
  applyObservedPullRequest(
    watch: { readonly projectId: string; readonly headBranch: string },
    data: PullRequestState["data"],
    details?: PrDetails,
  ): void {
    const projectRef = { hostId: this.options.hostId, projectId: watch.projectId };
    const ref = { ...projectRef, prNumber: data.number };
    const key = pullRequestKey(ref);
    const branchKey = pullRequestBranchKey(projectRef, watch.headBranch);
    const existingBranchKey = this.snapshot.pullRequestKeyByBranch[branchKey];
    const ownsBranch = existingBranchKey === undefined || existingBranchKey === key;
    this.publish({
      pullRequests: {
        [key]: mergePullRequestState({
          existing: this.snapshot.pullRequests[key],
          ref,
          data,
          details,
          at: this.timestamp(),
        }),
      },
      ...(ownsBranch
        ? {
            pullRequestKeyByBranch: { [branchKey]: key },
            targets: this.targetsForBranch(watch.projectId, watch.headBranch, key),
          }
        : {}),
    });
  }

  async refreshPullRequestReviewBundle(input: {
    readonly projectId: string;
    readonly prNumber: number;
    readonly branch?: string | undefined;
  }): Promise<void> {
    const project = this.requireProject(input.projectId);
    const ref = {
      hostId: this.options.hostId,
      projectId: input.projectId,
      prNumber: input.prNumber,
    };
    const key = pullRequestKey(ref);
    await this.dedupe(`pr-bundle:${key}`, async () => {
      if (input.branch) {
        await this.refreshPullRequestForBranch(input.projectId, input.branch);
      } else if (!this.snapshot.pullRequests[key]) {
        await this.refreshProjectPullRequests(input.projectId);
      }
      const [detailsResult, filesResult, diffResult, reviewResult] = await Promise.all([
        this.options.executor.ghGetPrDetails({
          projectLocation: project.location,
          prNumber: input.prNumber,
        }),
        this.options.executor.ghGetPrFiles({
          projectLocation: project.location,
          prNumber: input.prNumber,
        }),
        this.options.executor.ghGetPrDiff({
          projectLocation: project.location,
          prNumber: input.prNumber,
        }),
        this.options.executor.ghGetPrReviewComments({
          projectLocation: project.location,
          prNumber: input.prNumber,
        }),
      ]);
      const existing = this.snapshot.pullRequests[key];
      if (!existing) {
        throw new Error(
          `Pull request ${input.projectId}#${input.prNumber} has no core state; refresh its branch or project list first.`,
        );
      }
      const fetchedAt = this.timestamp();
      this.publish({
        pullRequests: {
          [key]: {
            ...existing,
            details: detailsResult.details,
            files: filesResult.files,
            diff: diffResult.diff,
            reviewThreads: reviewResult.threads,
            freshness: {
              ...existing.freshness,
              details: fetchedAt,
              files: fetchedAt,
              diff: fetchedAt,
              reviewThreads: fetchedAt,
            },
          },
        },
      });
    });
  }

  async refreshProjectPullRequests(projectId: string): Promise<void> {
    const project = this.requireProject(projectId);
    const projectRef = { hostId: this.options.hostId, projectId };
    const projectKey = gitProjectKey(projectRef);
    await this.dedupe(`pr-list:${projectKey}`, async () => {
      const result = await this.options.executor.ghListPullRequests({
        projectLocation: project.location,
      });
      const refreshedAt = this.timestamp();
      const pullRequests: Record<string, PullRequestState> = {};
      const aliases: Record<string, string> = {};
      const keys: string[] = [];
      for (const summary of result.pullRequests) {
        const ref = { ...projectRef, prNumber: summary.pr.number };
        const key = pullRequestKey(ref);
        const existing = this.snapshot.pullRequests[key];
        keys.push(key);
        pullRequests[key] = {
          ...existing,
          ref,
          data: summary.pr,
          freshness: { ...existing?.freshness, core: refreshedAt },
        };
        aliases[pullRequestBranchKey(projectRef, summary.headBranch)] = key;
      }
      this.publish({
        pullRequests,
        pullRequestKeyByBranch: aliases,
        projectPullRequestLists: {
          [projectKey]: {
            project: projectRef,
            pullRequestKeys: keys,
            ...(result.viewerLogin ? { viewerLogin: result.viewerLogin } : {}),
            refreshedAt,
          },
        },
      });
    });
  }

  async refreshInterests(
    explicitInterests?: readonly GitStateInterest[],
    options: { readonly fetchRemote?: boolean } = {},
  ): Promise<void> {
    if (this.disposed) return;
    const interests =
      explicitInterests ??
      [...this.interestsByOwner.values()].flatMap((ownerInterests) => ownerInterests);
    if (options.fetchRemote) {
      await this.refreshRemoteRefs(interests);
    }
    const tasks = new Map<string, Promise<void>>();
    for (const interest of interests) {
      if (interest.kind === "target") {
        const key = JSON.stringify(interest);
        tasks.set(key, this.refreshTarget(interest));
        continue;
      }
      if (interest.kind === "project-pull-requests") {
        tasks.set(
          `list:${interest.projectId}`,
          this.refreshProjectPullRequests(interest.projectId),
        );
        continue;
      }
      const key = `pr:${interest.projectId}:${interest.prNumber}:${interest.branch ?? ""}`;
      const task = interest.includeReviewBundle
        ? this.refreshPullRequestReviewBundle(interest)
        : interest.branch
          ? this.refreshPullRequestForBranch(interest.projectId, interest.branch).then(
              () => undefined,
            )
          : Promise.resolve();
      tasks.set(key, task);
    }
    await Promise.allSettled(tasks.values());
  }

  private schedulePollIfNeeded(): void {
    if (!this.started || this.disposed || this.pollTimer || this.interestsByOwner.size === 0) {
      return;
    }
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      void this.refreshInterests(undefined, { fetchRemote: true }).finally(() => {
        this.schedulePollIfNeeded();
      });
    }, this.options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
    this.pollTimer.unref?.();
  }

  private async refreshRemoteRefs(interests: readonly GitStateInterest[]): Promise<void> {
    const projectIds = new Set(
      interests
        .filter((interest) => interest.kind === "target")
        .map((interest) => interest.projectId),
    );
    const now = (this.options.now?.() ?? new Date()).getTime();
    const interval = this.options.remoteFetchIntervalMs ?? DEFAULT_REMOTE_FETCH_INTERVAL_MS;
    await Promise.allSettled(
      [...projectIds].map(async (projectId) => {
        const lastFetchedAt = this.lastRemoteFetchAt.get(projectId) ?? 0;
        if (now - lastFetchedAt < interval) return;
        this.lastRemoteFetchAt.set(projectId, now);
        const project = this.requireProject(projectId);
        await this.dedupe(`remote-fetch:${projectId}`, () =>
          this.options.executor.gitFetch({
            projectLocation: project.location,
            remote: "origin",
            prune: true,
          }),
        );
      }),
    );
  }

  private async refreshInterestedProject(projectId: string): Promise<void> {
    const interests = [...this.interestsByOwner.values()]
      .flat()
      .filter((interest) => interest.projectId === projectId);
    if (interests.length === 0) return;
    await this.refreshInterests(interests);
  }

  private targetsForBranch(
    projectId: string,
    branch: string,
    prKey: string | null,
  ): Record<string, GitStateSnapshot["targets"][string]> {
    const targets: Record<string, GitStateSnapshot["targets"][string]> = {};
    for (const [key, target] of Object.entries(this.snapshot.targets)) {
      if (
        target.ref.projectId !== projectId ||
        target.ref.hostId !== this.options.hostId ||
        target.status?.branch !== branch
      ) {
        continue;
      }
      targets[key] = {
        ...target,
        pullRequestKey: prKey,
      };
    }
    return targets;
  }

  private publish(patch: Omit<GitStatePatch, "revision">): void {
    const revision = this.snapshot.revision + 1;
    const revisioned = { ...patch, revision };
    this.snapshot = applyGitStatePatch(this.snapshot, revisioned);
    this.options.onPatch?.(revisioned);
  }

  private interestsEqual(
    left: readonly GitStateInterest[],
    right: readonly GitStateInterest[],
  ): boolean {
    if (left.length !== right.length) return false;
    return left.every(
      (interest, index) => JSON.stringify(interest) === JSON.stringify(right[index]),
    );
  }

  private dedupe<T>(key: string, task: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T>;
    const pending = task().finally(() => {
      if (this.inFlight.get(key) === pending) this.inFlight.delete(key);
    });
    this.inFlight.set(key, pending);
    return pending;
  }

  private requireProject(projectId: string): Project {
    const project = this.options.getProject(projectId);
    if (!project) throw new Error(`Project "${projectId}" was not found.`);
    return project;
  }

  private timestamp(): string {
    return (this.options.now?.() ?? new Date()).toISOString();
  }
}
