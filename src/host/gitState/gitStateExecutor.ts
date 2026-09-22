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
  Project,
  ProjectLocation,
} from "@/shared/contracts";
import type { GitStatePatch, PullRequestState } from "@/shared/gitState";

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
