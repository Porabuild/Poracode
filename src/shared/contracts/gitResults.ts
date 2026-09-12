import { z } from "zod";
import { fileCheckpointRecordSchema, fileCheckpointTurnSchema, gitStatusDetailSchema } from "./git";

const safeInt = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
const safeNonNegInt = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const remoteHostPlatformSchema = z.enum(["github", "gitlab", "bitbucket", "unknown"]);

export const gitRemoteInfoSchema = z.object({
  url: z.string(),
  platform: remoteHostPlatformSchema,
  owner: z.string(),
  repo: z.string(),
});

export const gitFileChangeSchema = z.object({
  path: z.string(),
  oldPath: z.string().optional(),
  status: z.string(),
  staged: z.boolean(),
  insertions: safeInt,
  deletions: safeInt,
});

export const gitStatusResultSchema = z.object({
  detail: gitStatusDetailSchema.optional(),
  isRepo: z.boolean(),
  branch: z.string(),
  headSha: z.string().optional(),
  tracking: z.string(),
  hasRemote: z.boolean(),
  remoteInfo: gitRemoteInfoSchema.nullable(),
  ahead: safeInt,
  behind: safeInt,
  staged: z.array(gitFileChangeSchema),
  unstaged: z.array(gitFileChangeSchema),
  totalInsertions: safeInt,
  totalDeletions: safeInt,
  mergeInProgress: z.boolean().optional(),
  mergeMessage: z.string().optional(),
  conflictFiles: z.array(gitFileChangeSchema).optional(),
});

export const gitDiffResultSchema = z.object({
  diff: z.string(),
});

export const gitDiffBatchResultSchema = z.object({
  staged: z.record(z.string(), z.string()),
  unstaged: z.record(z.string(), z.string()),
});

export const gitFileContentResultSchema = z.object({
  oldContent: z.string(),
  newContent: z.string(),
});

export const createFileCheckpointResultSchema = z.object({
  checkpoint: fileCheckpointRecordSchema,
});

export const finalizeFileCheckpointResultSchema = z.object({
  checkpoint: fileCheckpointTurnSchema,
});

export const listFileCheckpointsResultSchema = z.object({
  checkpoints: z.array(fileCheckpointRecordSchema),
  turns: z.array(fileCheckpointTurnSchema),
});

export const gitWorktreeStatusBatchResultSchema = z.object({
  statuses: z.record(z.string(), gitStatusResultSchema),
});

export const gitCommitResultSchema = z.object({
  hash: z.string(),
  message: z.string(),
  stashReapplied: z.boolean().optional(),
  reapplyConflicting: z.boolean().optional(),
  stashPreserved: z.boolean().optional(),
  conflictFiles: z.array(z.string()).optional(),
});

export const generateCommitMessageResultSchema = z.object({
  message: z.string(),
});

export const generateTitleResultSchema = z.object({
  title: z.string(),
});

export const generatePrSummaryResultSchema = z.object({
  title: z.string(),
  description: z.string(),
});

export const gitBranchInfoSchema = z.object({
  name: z.string(),
  current: z.boolean(),
  commit: z.string(),
  isRemote: z.boolean(),
  remote: z.string().optional(),
});

export const gitBranchListResultSchema = z.object({
  current: z.string(),
  branches: z.array(gitBranchInfoSchema),
});

export const gitWorktreeInfoSchema = z.object({
  path: z.string(),
  branch: z.string(),
  commit: z.string(),
  isMain: z.boolean(),
});

export const gitWorktreeListResultSchema = z.object({
  worktrees: z.array(gitWorktreeInfoSchema),
});

export const gitAddWorktreeResultSchema = z.object({
  path: z.string(),
  changesTransferred: z.boolean().optional(),
});

export const gitSwitchBranchResultSchema = z.object({
  branch: z.string(),
  created: z.boolean(),
  tracking: z.string(),
  ahead: safeInt,
  behind: safeInt,
});

export const gitSyncResultSchema = z.object({
  pulled: z.boolean(),
  pushed: z.boolean(),
});

export const gitProjectSnapshotResultSchema = z.object({
  status: gitStatusResultSchema.nullable(),
  branches: gitBranchListResultSchema.nullable(),
  worktrees: z.array(gitWorktreeInfoSchema).nullable(),
  ghAvailable: z.boolean().nullable(),
});

export const gitGetWorktreeSourceBranchResultSchema = z.object({
  sourceBranch: z.string().nullable(),
  commitsAhead: safeInt,
  sourceAhead: safeInt,
});

export const gitGetWorktreeOwnerResultSchema = z.object({
  ownerToken: z.string().nullable(),
});

export const gitMergeToSourceResultSchema = z.object({
  merged: z.boolean(),
  fastForward: z.boolean(),
  newSourceCommit: z.string(),
  error: z.string().optional(),
  conflictFiles: z.array(z.string()).optional(),
});

export const gitPullFromSourceResultSchema = z.object({
  merged: z.boolean(),
  fastForward: z.boolean(),
  needsStash: z.boolean().optional(),
  reapplyConflicting: z.boolean().optional(),
  stashPreserved: z.boolean().optional(),
  conflicting: z.boolean().optional(),
  error: z.string().optional(),
  conflictFiles: z.array(z.string()).optional(),
  stashCommit: z.string().optional(),
});

export const gitAbortMergeResultSchema = z.object({
  stashReapplied: z.boolean().optional(),
  stashPreserved: z.boolean().optional(),
});

export const gitFinishMergeResultSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  stashReapplied: z.boolean().optional(),
  reapplyConflicting: z.boolean().optional(),
  stashPreserved: z.boolean().optional(),
  conflictFiles: z.array(z.string()).optional(),
});

export { safeInt as gitSafeIntSchema, safeNonNegInt as gitSafeNonNegIntSchema };
