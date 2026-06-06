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

export const gitCommitPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  message: z.string().min(1),
  addAll: z.boolean().default(false),
});
export type GitCommitPayload = z.infer<typeof gitCommitPayloadSchema>;

export interface GitCommitResult {
  hash: string;
  message: string;
}

export const generateCommitMessagePayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  agentKind: agentKindSchema,
  model: z.string().min(1).optional(),
  effort: z.string().min(1).optional(),
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

export const gitAddWorktreePayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  path: z.string().min(1).optional(),
  branch: z.string().optional(),
  createBranch: z.boolean().default(false),
  startPoint: z.string().optional(),
});
export type GitAddWorktreePayload = z.infer<typeof gitAddWorktreePayloadSchema>;

export const gitRemoveWorktreePayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  path: z.string().min(1),
  force: z.boolean().default(false),
  deleteBranch: z.boolean().default(false),
});
export type GitRemoveWorktreePayload = z.infer<typeof gitRemoveWorktreePayloadSchema>;

export const gitPruneWorktreesPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  activeWorktreePaths: z.array(z.string()),
});
export type GitPruneWorktreesPayload = z.infer<typeof gitPruneWorktreesPayloadSchema>;

export const gitDeleteBranchPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  branch: z.string().min(1),
  force: z.boolean().default(false),
  remote: z.string().optional(),
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

export const gitMergeToSourcePayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  worktreeLocation: projectLocationSchema,
  worktreeBranch: z.string().min(1),
  sourceBranch: z.string().min(1),
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
}

export const gitAbortMergePayloadSchema = z.object({
  worktreeLocation: projectLocationSchema,
});
export type GitAbortMergePayload = z.infer<typeof gitAbortMergePayloadSchema>;

export const gitFinishMergePayloadSchema = z.object({
  worktreeLocation: projectLocationSchema,
});
export type GitFinishMergePayload = z.infer<typeof gitFinishMergePayloadSchema>;

export interface GitFinishMergeResult {
  success: boolean;
  error?: string;
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
});
export type GitUnwatchProjectPayload = z.infer<typeof gitUnwatchProjectPayloadSchema>;
