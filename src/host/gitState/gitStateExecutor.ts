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
  GitWorktreeInfo,
  GitWorktreeListResult,
  Project,
  ProjectLocation,
  GhPollPullRequestsPayload,
  GhPollPullRequestsResult,
} from "@/shared/contracts";
import type { GitStatePatch, PullRequestState } from "@/shared/gitState";

export interface GitStateExecutor {
  ghPollPullRequests(input: GhPollPullRequestsPayload): Promise<GhPollPullRequestsResult>;
  gitFetch(input: {
    projectLocation: ProjectLocation;
    remote: string;
    prune: boolean;
  }): Promise<void>;
  gitProjectSnapshot(input: {
    projectLocation: ProjectLocation;
    includeGhCheck: boolean;
  }): Promise<GitProjectSnapshotResult>;
  gitListWorktrees(input: { projectLocation: ProjectLocation }): Promise<GitWorktreeListResult>;
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
  readonly getProjects: () => readonly Project[];
  readonly onPatch?: ((patch: GitStatePatch) => void) | undefined;
  /** Start before the Git await; false rejects an older cross-client observation. */
  readonly beginWorktreeObservation?:
    | ((projectId: string) => (worktrees: readonly GitWorktreeInfo[]) => boolean)
    | undefined;
  readonly now?: (() => Date) | undefined;
  readonly pollIntervalMs?: number | undefined;
  readonly remoteFetchIntervalMs?: number | undefined;
}
