import { z } from "zod";
import { agentKindSchema, projectLocationSchema, sessionRefSchema } from "./common";

export type RemoteHostPlatform = "github" | "gitlab" | "bitbucket" | "unknown";

export interface GitRemoteInfo {
  url: string;
  platform: RemoteHostPlatform;
  owner: string;
  repo: string;
}

export interface GitFileChange {
  path: string;
  oldPath?: string;
  status: string;
  staged: boolean;
  insertions: number;
  deletions: number;
}

export const gitStatusDetailSchema = z.enum(["summary", "full"]);
export type GitStatusDetail = z.infer<typeof gitStatusDetailSchema>;

export interface GitStatusResult {
  detail?: GitStatusDetail;
  isRepo: boolean;
  branch: string;
  /** Commit currently checked out at HEAD. */
  headSha?: string;
  tracking: string;
  hasRemote: boolean;
  remoteInfo: GitRemoteInfo | null;
  ahead: number;
  behind: number;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  totalInsertions: number;
  totalDeletions: number;
  mergeInProgress?: boolean;
  mergeMessage?: string;
  conflictFiles?: GitFileChange[];
}

export interface GitDiffResult {
  diff: string;
}

export interface GitDiffBatchResult {
  staged: Record<string, string>;
  unstaged: Record<string, string>;
}

export interface GitFileContentResult {
  oldContent: string;
  newContent: string;
}

export const fileCheckpointChangedFileSchema = z.object({
  path: z.string().min(1),
  oldPath: z.string().min(1).optional(),
  status: z.string().min(1),
});
export type FileCheckpointChangedFile = z.infer<typeof fileCheckpointChangedFileSchema>;

export const fileCheckpointRecordSchema = z.object({
  threadId: z.string().min(1),
  checkpointItemId: z.string().min(1),
  ref: z.string().min(1),
  commit: z.string().min(1),
  capturedAt: z.string().min(1),
});
export type FileCheckpointRecord = z.infer<typeof fileCheckpointRecordSchema>;

export const fileCheckpointTurnSchema = fileCheckpointRecordSchema.extend({
  baseCheckpointItemId: z.string().min(1),
  baseRef: z.string().min(1),
  changedFiles: z.array(fileCheckpointChangedFileSchema),
});
export type FileCheckpointTurn = z.infer<typeof fileCheckpointTurnSchema>;

export const getGitStatusPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  detail: gitStatusDetailSchema.optional(),
});
export type GetGitStatusPayload = z.infer<typeof getGitStatusPayloadSchema>;

export const createFileCheckpointPayloadSchema = z.object({
  threadId: z.string().min(1),
  checkpointItemId: z.string().min(1),
  projectLocation: projectLocationSchema,
});
export type CreateFileCheckpointPayload = z.infer<typeof createFileCheckpointPayloadSchema>;

export interface CreateFileCheckpointResult {
  checkpoint: FileCheckpointRecord;
}

export const finalizeFileCheckpointPayloadSchema = z.object({
  threadId: z.string().min(1),
  checkpointItemId: z.string().min(1),
  baseCheckpointItemId: z.string().min(1),
  projectLocation: projectLocationSchema,
});
export type FinalizeFileCheckpointPayload = z.infer<typeof finalizeFileCheckpointPayloadSchema>;

export interface FinalizeFileCheckpointResult {
  checkpoint: FileCheckpointTurn;
}

export const listFileCheckpointsPayloadSchema = z.object({
  threadId: z.string().min(1),
  projectLocation: projectLocationSchema,
});
export type ListFileCheckpointsPayload = z.infer<typeof listFileCheckpointsPayloadSchema>;

export interface ListFileCheckpointsResult {
  checkpoints: FileCheckpointRecord[];
  turns: FileCheckpointTurn[];
}

export const restoreFileCheckpointPayloadSchema = z.object({
  threadId: z.string().min(1),
  checkpointItemId: z.string().min(1),
  projectLocation: projectLocationSchema,
});
export type RestoreFileCheckpointPayload = z.infer<typeof restoreFileCheckpointPayloadSchema>;

export const gitWorktreeStatusBatchPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  worktreePaths: z.array(z.string().min(1)),
  detail: gitStatusDetailSchema.optional(),
});
export type GitWorktreeStatusBatchPayload = z.infer<typeof gitWorktreeStatusBatchPayloadSchema>;

export interface GitWorktreeStatusBatchResult {
  /** Map worktree filesystem path → status. Worktrees whose status fetch failed are omitted. */
  statuses: Record<string, GitStatusResult>;
}

export const getGitDiffPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  filePath: z.string().optional(),
  staged: z.boolean().default(false),
});
export type GetGitDiffPayload = z.infer<typeof getGitDiffPayloadSchema>;

export const getGitDiffBatchPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  untrackedPaths: z.array(z.string()).default([]),
});
export type GetGitDiffBatchPayload = z.infer<typeof getGitDiffBatchPayloadSchema>;

export const getGitFileContentPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  filePath: z.string().min(1),
  staged: z.boolean(),
});
export type GetGitFileContentPayload = z.infer<typeof getGitFileContentPayloadSchema>;

export const gitStagePayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  filePath: z.string().min(1),
});
export type GitStagePayload = z.infer<typeof gitStagePayloadSchema>;

export const gitUnstagePayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  filePath: z.string().min(1),
});
export type GitUnstagePayload = z.infer<typeof gitUnstagePayloadSchema>;

export const gitRevertPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  filePath: z.string().min(1),
});
export type GitRevertPayload = z.infer<typeof gitRevertPayloadSchema>;

export const gitStageAllPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
});
export type GitStageAllPayload = z.infer<typeof gitStageAllPayloadSchema>;

export const gitUnstageAllPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
});
export type GitUnstageAllPayload = z.infer<typeof gitUnstageAllPayloadSchema>;

export const gitRevertAllPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
});
export type GitRevertAllPayload = z.infer<typeof gitRevertAllPayloadSchema>;

export const fullCommitOidSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i);

export const gitCommitPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  message: z.string().min(1),
  addAll: z.boolean().default(false),
  /**
   * Poracode pull stash to re-apply (and drop) after the commit succeeds. Used
   * when the commit completes a conflicted pull-from-source merge.
   */
  reapplyStashCommit: fullCommitOidSchema.optional(),
});
export type GitCommitPayload = z.infer<typeof gitCommitPayloadSchema>;

export const gitInitPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
});
export type GitInitPayload = z.infer<typeof gitInitPayloadSchema>;

export const gitAddRemotePayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  remote: z.string().min(1),
  url: z.string().min(1),
});
export type GitAddRemotePayload = z.infer<typeof gitAddRemotePayloadSchema>;

export interface GitCommitResult {
  hash: string;
  message: string;
  /** The pull stash was found, re-applied cleanly, and dropped. */
  stashReapplied?: boolean;
  /** Re-applying the pull stash hit conflicts; the stash entry is kept. */
  reapplyConflicting?: boolean;
  /** A stash was requested but remains preserved (re-apply conflicted or stash missing). */
  stashPreserved?: boolean;
  conflictFiles?: string[];
}

export const generateCommitMessagePayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  agentKind: agentKindSchema,
  model: z.string().min(1).optional(),
  effort: z.string().min(1).optional(),
  /** Run generation in fast mode (Opus-only session flag; ignored by other models). */
  fast: z.boolean().optional(),
  /** English name of the language to write the commit message in (e.g. "German"). Omitted = English. */
  language: z.string().min(1).optional(),
});
export type GenerateCommitMessagePayload = z.infer<typeof generateCommitMessagePayloadSchema>;

export interface GenerateCommitMessageResult {
  message: string;
}

export const generateTitlePayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  agentKind: agentKindSchema,
  prompt: z.string().min(1),
  model: z.string().min(1).optional(),
  effort: z.string().min(1).optional(),
  /** Run generation in fast mode (Opus-only session flag; ignored by other models). */
  fast: z.boolean().optional(),
  /** English name of the language to write the title in (e.g. "German"). Omitted = match the user's message. */
  language: z.string().min(1).optional(),
});
export type GenerateTitlePayload = z.infer<typeof generateTitlePayloadSchema>;

export interface GenerateTitleResult {
  title: string;
}

export const generatePrSummaryPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  agentKind: agentKindSchema,
  branch: z.string().min(1),
  baseBranch: z.string().min(1),
  model: z.string().min(1).optional(),
  effort: z.string().min(1).optional(),
  /** English name of the language to write the PR title/description in (e.g. "German"). Omitted = English. */
  language: z.string().min(1).optional(),
});
export type GeneratePrSummaryPayload = z.infer<typeof generatePrSummaryPayloadSchema>;

export interface GeneratePrSummaryResult {
  title: string;
  description: string;
}

export const extractContextPayloadSchema = z.object({
  threadId: z.string().min(1),
  agentKind: agentKindSchema,
  sessionRef: sessionRefSchema,
  projectLocation: projectLocationSchema,
  worktreePath: z.string().optional(),
  model: z.string().optional(),
  effort: z.string().optional(),
});
export type ExtractContextPayload = z.infer<typeof extractContextPayloadSchema>;

export interface ExtractContextResult {
  summary: string;
  sourceProvider: string;
  sourceSessionId: string;
  worktreePath?: string;
  extractedAt: string;
}

export interface GitBranchInfo {
  name: string;
  current: boolean;
  commit: string;
  isRemote: boolean;
  remote?: string;
}

export interface GitBranchListResult {
  current: string;
  branches: GitBranchInfo[];
}

export interface GitWorktreeInfo {
  path: string;
  branch: string;
  commit: string;
  isMain: boolean;
}

export interface GitWorktreeListResult {
  worktrees: GitWorktreeInfo[];
}

export interface GitAddWorktreeResult {
  path: string;
  /**
   * When `transferUncommitted` was requested: whether the changes landed in the
   * new worktree. `false` means the apply conflicted — for a copy they remain on
   * the source branch; for a move they remain in a git stash (source still clean).
   */
  changesTransferred?: boolean;
}

export const getGitBranchesPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  includeRemote: z.boolean().default(true),
});
export type GetGitBranchesPayload = z.infer<typeof getGitBranchesPayloadSchema>;

export const gitFetchPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  remote: z.string().default("origin"),
  prune: z.boolean().default(false),
});
export type GitFetchPayload = z.infer<typeof gitFetchPayloadSchema>;

export const gitListWorktreesPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
});
export type GitListWorktreesPayload = z.infer<typeof gitListWorktreesPayloadSchema>;

export const gitAddWorktreePayloadSchema = z
  .object({
    projectLocation: projectLocationSchema,
    path: z.string().min(1).optional(),
    branch: z.string().optional(),
    createBranch: z.boolean().default(false),
    startPoint: z.string().optional(),
    /** Source branch metadata when `startPoint` is an immutable commit hash. */
    sourceBranch: z.string().min(1).max(255).optional(),
    /** Stable owner marker used to prove lifecycle ownership after recovery. */
    ownerToken: z.string().min(1).max(128).optional(),
    /**
     * Resolved worktree root (from global settings + per-project override). When
     * set, worktrees go under this directory instead of the built-in default.
     * Ignored when an explicit `path` is supplied.
     */
    worktreeRoot: z.string().min(1).optional(),
    /**
     * When true (project-relative mode), skip the disambiguating `<repo-hash>`
     * segment so the worktree lands directly at `<root>/<branch>`.
     */
    worktreeOmitRepoDir: z.boolean().optional(),
    /** Gitignore-style patterns for ignored files to copy from the main project. */
    copyIgnoredPatterns: z.array(z.string()).optional(),
    /**
     * Bring the main checkout's uncommitted changes (including untracked files)
     * into the new worktree.
     */
    transferUncommitted: z.boolean().default(false),
    /**
     * When transferring: keep a copy of the changes on the source branch (COPY).
     * Defaults to false, which leaves the source branch clean (MOVE).
     */
    keepChangesInSource: z.boolean().default(false),
  })
  .superRefine((payload, ctx) => {
    if (payload.ownerToken && !payload.sourceBranch) {
      ctx.addIssue({
        code: "custom",
        message: "A worktree owner token requires a frozen source branch",
        path: ["ownerToken"],
      });
    }
    if (!payload.sourceBranch) return;
    if (payload.createBranch !== true) {
      ctx.addIssue({
        code: "custom",
        message: "A frozen source branch requires createBranch to be true",
        path: ["createBranch"],
      });
    }
    if (!payload.branch?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "A frozen source branch requires a new branch name",
        path: ["branch"],
      });
    }
    if (!payload.startPoint || !fullCommitOidSchema.safeParse(payload.startPoint).success) {
      ctx.addIssue({
        code: "custom",
        message: "A frozen source branch requires a full commit hash start point",
        path: ["startPoint"],
      });
    }
  });
export type GitAddWorktreePayload = z.infer<typeof gitAddWorktreePayloadSchema>;

export const gitRemoveWorktreePayloadSchema = z
  .object({
    projectLocation: projectLocationSchema,
    path: z.string().min(1),
    force: z.boolean().default(false),
    deleteBranch: z.boolean().default(false),
    expectedBranch: z.string().min(1).optional(),
    expectedOwnerToken: z.string().min(1).max(128).optional(),
  })
  .superRefine((payload, ctx) => {
    if (payload.expectedOwnerToken && !payload.expectedBranch) {
      ctx.addIssue({
        code: "custom",
        message: "An expected worktree owner requires an expected branch",
        path: ["expectedOwnerToken"],
      });
    }
  });
export type GitRemoveWorktreePayload = z.infer<typeof gitRemoveWorktreePayloadSchema>;

export const gitPruneWorktreesPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  activeWorktreePaths: z.array(z.string()),
});
export type GitPruneWorktreesPayload = z.infer<typeof gitPruneWorktreesPayloadSchema>;

export const gitDeleteBranchPayloadSchema = z
  .object({
    projectLocation: projectLocationSchema,
    branch: z.string().min(1),
    force: z.boolean().default(false),
    remote: z.string().optional(),
    expectedOwnerToken: z.string().min(1).max(128).optional(),
  })
  .superRefine((payload, ctx) => {
    if (payload.remote && payload.expectedOwnerToken) {
      ctx.addIssue({
        code: "custom",
        message: "A remote branch cannot have a local worktree owner",
        path: ["expectedOwnerToken"],
      });
    }
  });
export type GitDeleteBranchPayload = z.infer<typeof gitDeleteBranchPayloadSchema>;

export const gitSwitchBranchPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  branch: z.string().min(1),
  createNew: z.boolean().default(false),
});
export type GitSwitchBranchPayload = z.infer<typeof gitSwitchBranchPayloadSchema>;

export interface GitSwitchBranchResult {
  branch: string;
  created: boolean;
  tracking: string;
  ahead: number;
  behind: number;
}

export const gitPullPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  remote: z.string().optional().default("origin"),
  preserveLocalChanges: z.boolean().default(false),
});
export type GitPullPayload = z.input<typeof gitPullPayloadSchema>;

export const gitPushPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  remote: z.string().optional().default("origin"),
  branch: z.string().optional(),
  setUpstream: z.boolean().optional().default(false),
});
export type GitPushPayload = z.input<typeof gitPushPayloadSchema>;

export const gitSyncPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  remote: z.string().optional().default("origin"),
});
export type GitSyncPayload = z.input<typeof gitSyncPayloadSchema>;

export interface GitSyncResult {
  pulled: boolean;
  pushed: boolean;
}

export const gitProjectSnapshotPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  /** Pass true to also include the gh availability check (`gh --version`). */
  includeGhCheck: z.boolean().default(false),
});
export type GitProjectSnapshotPayload = z.infer<typeof gitProjectSnapshotPayloadSchema>;

export interface GitProjectSnapshotResult {
  status: GitStatusResult | null;
  branches: GitBranchListResult | null;
  worktrees: GitWorktreeInfo[] | null;
  ghAvailable: boolean | null;
}

export const gitGetWorktreeSourceBranchPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  branch: z.string().min(1),
  /** When set, skip inference and use this branch as the source (e.g. PR baseRefName). */
  sourceBranchOverride: z.string().optional(),
});
export type GitGetWorktreeSourceBranchPayload = z.infer<
  typeof gitGetWorktreeSourceBranchPayloadSchema
>;

export interface GitGetWorktreeSourceBranchResult {
  sourceBranch: string | null;
  commitsAhead: number;
  sourceAhead: number;
}

export const gitGetWorktreeOwnerPayloadSchema = gitGetWorktreeSourceBranchPayloadSchema.pick({
  projectLocation: true,
  branch: true,
});
export type GitGetWorktreeOwnerPayload = z.infer<typeof gitGetWorktreeOwnerPayloadSchema>;

export interface GitGetWorktreeOwnerResult {
  ownerToken: string | null;
}

export const gitMergeToSourcePayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  worktreeLocation: projectLocationSchema,
  worktreeBranch: z.string().min(1),
  sourceBranch: z.string().min(1),
  expectedWorktreeCommit: fullCommitOidSchema.optional(),
});
export type GitMergeToSourcePayload = z.infer<typeof gitMergeToSourcePayloadSchema>;

export interface GitMergeToSourceResult {
  merged: boolean;
  fastForward: boolean;
  newSourceCommit: string;
  error?: string;
  conflictFiles?: string[];
}

export const gitPullFromSourcePayloadSchema = z.object({
  worktreeLocation: projectLocationSchema,
  sourceBranch: z.string().min(1),
  preserveLocalChanges: z.boolean().default(false),
});
export type GitPullFromSourcePayload = z.infer<typeof gitPullFromSourcePayloadSchema>;

export interface GitPullFromSourceResult {
  merged: boolean;
  fastForward: boolean;
  needsStash?: boolean;
  reapplyConflicting?: boolean;
  stashPreserved?: boolean;
  conflicting?: boolean;
  error?: string;
  conflictFiles?: string[];
  /**
   * Commit hash of the stash created for this pull when it remains preserved
   * (merge conflicted before the stash could be re-applied). Pass it to
   * `gitFinishMerge`/`gitAbortMerge` as `reapplyStashCommit` so the stashed
   * changes are restored once the merge is resolved or abandoned.
   */
  stashCommit?: string;
}

export const gitAbortMergePayloadSchema = z.object({
  worktreeLocation: projectLocationSchema,
  /** Poracode pull stash to re-apply (and drop) after the merge is aborted. */
  reapplyStashCommit: fullCommitOidSchema.optional(),
});
export type GitAbortMergePayload = z.infer<typeof gitAbortMergePayloadSchema>;

export interface GitAbortMergeResult {
  /** The pull stash was found, re-applied cleanly, and dropped. */
  stashReapplied?: boolean;
  /** A stash was requested but could not be re-applied; it remains in the stash list. */
  stashPreserved?: boolean;
}

export const gitFinishMergePayloadSchema = z.object({
  worktreeLocation: projectLocationSchema,
  /** Poracode pull stash to re-apply (and drop) after the merge commit succeeds. */
  reapplyStashCommit: fullCommitOidSchema.optional(),
});
export type GitFinishMergePayload = z.infer<typeof gitFinishMergePayloadSchema>;

export interface GitFinishMergeResult {
  success: boolean;
  error?: string;
  /** The pull stash was found, re-applied cleanly, and dropped. */
  stashReapplied?: boolean;
  /** Re-applying the pull stash hit conflicts; the stash entry is kept. */
  reapplyConflicting?: boolean;
  /** A stash was requested but remains preserved (re-apply conflicted or stash missing). */
  stashPreserved?: boolean;
  conflictFiles?: string[];
}

export const gitWatchProjectPayloadSchema = z.object({
  projectId: z.string().min(1),
  projectLocation: projectLocationSchema,
});
export type GitWatchProjectPayload = z.infer<typeof gitWatchProjectPayloadSchema>;

export const gitWatchWorktreesPayloadSchema = z.object({
  projectId: z.string().min(1),
  worktreePaths: z.array(z.string()),
});
export type GitWatchWorktreesPayload = z.infer<typeof gitWatchWorktreesPayloadSchema>;

export const gitUnwatchProjectPayloadSchema = z.object({
  projectId: z.string().min(1),
  releaseWslDistro: z.string().min(1).optional(),
});
export type GitUnwatchProjectPayload = z.infer<typeof gitUnwatchProjectPayloadSchema>;

export const relocateProjectPayloadSchema = z.object({
  projectId: z.string().min(1),
  /** New on-disk location the project folder was moved to. */
  newLocation: projectLocationSchema,
});
export type RelocateProjectPayload = z.infer<typeof relocateProjectPayloadSchema>;

export interface RelocateProjectResult {
  /** Number of linked worktrees git re-pointed via `worktree repair`. */
  repairedWorktrees: number;
}
