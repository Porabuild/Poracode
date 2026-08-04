import {
  createFileCheckpointPayloadSchema,
  finalizeFileCheckpointPayloadSchema,
  generateCommitMessagePayloadSchema,
  generatePrSummaryPayloadSchema,
  generateTitlePayloadSchema,
  getGitBranchesPayloadSchema,
  getGitDiffBatchPayloadSchema,
  getGitDiffPayloadSchema,
  getGitFileContentPayloadSchema,
  getGitStatusPayloadSchema,
  gitAbortMergePayloadSchema,
  gitAddRemotePayloadSchema,
  gitAddWorktreePayloadSchema,
  gitCommitPayloadSchema,
  gitDeleteBranchPayloadSchema,
  gitFetchPayloadSchema,
  gitFinishMergePayloadSchema,
  gitGetWorktreeOwnerPayloadSchema,
  gitGetWorktreeSourceBranchPayloadSchema,
  gitInitPayloadSchema,
  gitListWorktreesPayloadSchema,
  gitMergeToSourcePayloadSchema,
  gitProjectSnapshotPayloadSchema,
  gitPullFromSourcePayloadSchema,
  gitPullPayloadSchema,
  gitPruneWorktreesPayloadSchema,
  gitPushPayloadSchema,
  gitRemoveWorktreePayloadSchema,
  gitRevertAllPayloadSchema,
  gitRevertPayloadSchema,
  gitStageAllPayloadSchema,
  gitStagePayloadSchema,
  gitSwitchBranchPayloadSchema,
  gitSyncPayloadSchema,
  gitUnstageAllPayloadSchema,
  gitUnstagePayloadSchema,
  gitUnwatchProjectPayloadSchema,
  gitWatchProjectPayloadSchema,
  gitWatchWorktreesPayloadSchema,
  gitWorktreeStatusBatchPayloadSchema,
  listFileCheckpointsPayloadSchema,
  relocateProjectPayloadSchema,
  restoreFileCheckpointPayloadSchema,
} from "../../contracts";
import type {
  CreateFileCheckpointPayload,
  CreateFileCheckpointResult,
  FinalizeFileCheckpointPayload,
  FinalizeFileCheckpointResult,
  GenerateCommitMessagePayload,
  GenerateCommitMessageResult,
  GeneratePrSummaryPayload,
  GeneratePrSummaryResult,
  GenerateTitlePayload,
  GenerateTitleResult,
  GetGitBranchesPayload,
  GetGitDiffBatchPayload,
  GetGitDiffPayload,
  GetGitFileContentPayload,
  GetGitStatusPayload,
  GitAbortMergePayload,
  GitAbortMergeResult,
  GitAddRemotePayload,
  GitAddWorktreePayload,
  GitAddWorktreeResult,
  GitBranchListResult,
  GitCommitPayload,
  GitCommitResult,
  GitDeleteBranchPayload,
  GitDiffBatchResult,
  GitDiffResult,
  GitFetchPayload,
  GitFileContentResult,
  GitFinishMergePayload,
  GitFinishMergeResult,
  GitGetWorktreeOwnerPayload,
  GitGetWorktreeOwnerResult,
  GitGetWorktreeSourceBranchPayload,
  GitGetWorktreeSourceBranchResult,
  GitInitPayload,
  GitListWorktreesPayload,
  GitMergeToSourcePayload,
  GitMergeToSourceResult,
  GitProjectSnapshotPayload,
  GitProjectSnapshotResult,
  GitPullFromSourcePayload,
  GitPullFromSourceResult,
  GitPullPayload,
  GitPruneWorktreesPayload,
  GitPushPayload,
  GitRemoveWorktreePayload,
  GitRevertAllPayload,
  GitRevertPayload,
  GitStageAllPayload,
  GitStagePayload,
  GitStatusResult,
  GitSwitchBranchPayload,
  GitSwitchBranchResult,
  GitSyncPayload,
  GitSyncResult,
  GitUnstageAllPayload,
  GitUnstagePayload,
  GitUnwatchProjectPayload,
  GitWatchProjectPayload,
  GitWatchWorktreesPayload,
  GitWorktreeListResult,
  GitWorktreeStatusBatchPayload,
  GitWorktreeStatusBatchResult,
  ListFileCheckpointsPayload,
  ListFileCheckpointsResult,
  RelocateProjectPayload,
  RelocateProjectResult,
  RestoreFileCheckpointPayload,
} from "../../contracts";
import { definePayloadProcedure } from "../core";

export const gitProcedures = {
  createFileCheckpoint: definePayloadProcedure<
    CreateFileCheckpointPayload,
    CreateFileCheckpointResult,
    "supervisor"
  >("createFileCheckpoint", "supervisor", createFileCheckpointPayloadSchema),
  finalizeFileCheckpoint: definePayloadProcedure<
    FinalizeFileCheckpointPayload,
    FinalizeFileCheckpointResult,
    "supervisor"
  >("finalizeFileCheckpoint", "supervisor", finalizeFileCheckpointPayloadSchema),
  listFileCheckpoints: definePayloadProcedure<
    ListFileCheckpointsPayload,
    ListFileCheckpointsResult,
    "supervisor"
  >("listFileCheckpoints", "supervisor", listFileCheckpointsPayloadSchema),
  restoreFileCheckpoint: definePayloadProcedure<RestoreFileCheckpointPayload, void, "supervisor">(
    "restoreFileCheckpoint",
    "supervisor",
    restoreFileCheckpointPayloadSchema,
  ),
  getGitStatus: definePayloadProcedure<GetGitStatusPayload, GitStatusResult, "supervisor">(
    "getGitStatus",
    "supervisor",
    getGitStatusPayloadSchema,
  ),
  getGitDiff: definePayloadProcedure<GetGitDiffPayload, GitDiffResult, "supervisor">(
    "getGitDiff",
    "supervisor",
    getGitDiffPayloadSchema,
  ),
  getGitDiffBatch: definePayloadProcedure<GetGitDiffBatchPayload, GitDiffBatchResult, "supervisor">(
    "getGitDiffBatch",
    "supervisor",
    getGitDiffBatchPayloadSchema,
  ),
  getGitFileContent: definePayloadProcedure<
    GetGitFileContentPayload,
    GitFileContentResult,
    "supervisor"
  >("getGitFileContent", "supervisor", getGitFileContentPayloadSchema),
  gitStage: definePayloadProcedure<GitStagePayload, void, "supervisor">(
    "gitStage",
    "supervisor",
    gitStagePayloadSchema,
  ),
  gitUnstage: definePayloadProcedure<GitUnstagePayload, void, "supervisor">(
    "gitUnstage",
    "supervisor",
    gitUnstagePayloadSchema,
  ),
  gitRevert: definePayloadProcedure<GitRevertPayload, void, "supervisor">(
    "gitRevert",
    "supervisor",
    gitRevertPayloadSchema,
  ),
  gitStageAll: definePayloadProcedure<GitStageAllPayload, void, "supervisor">(
    "gitStageAll",
    "supervisor",
    gitStageAllPayloadSchema,
  ),
  gitUnstageAll: definePayloadProcedure<GitUnstageAllPayload, void, "supervisor">(
    "gitUnstageAll",
    "supervisor",
    gitUnstageAllPayloadSchema,
  ),
  gitRevertAll: definePayloadProcedure<GitRevertAllPayload, void, "supervisor">(
    "gitRevertAll",
    "supervisor",
    gitRevertAllPayloadSchema,
  ),
  gitCommit: definePayloadProcedure<GitCommitPayload, GitCommitResult, "supervisor">(
    "gitCommit",
    "supervisor",
    gitCommitPayloadSchema,
  ),
  gitInit: definePayloadProcedure<GitInitPayload, void, "supervisor">(
    "gitInit",
    "supervisor",
    gitInitPayloadSchema,
  ),
  gitAddRemote: definePayloadProcedure<GitAddRemotePayload, void, "supervisor">(
    "gitAddRemote",
    "supervisor",
    gitAddRemotePayloadSchema,
  ),
  generateCommitMessage: definePayloadProcedure<
    GenerateCommitMessagePayload,
    GenerateCommitMessageResult,
    "supervisor"
  >("generateCommitMessage", "supervisor", generateCommitMessagePayloadSchema),
  generateTitle: definePayloadProcedure<GenerateTitlePayload, GenerateTitleResult, "supervisor">(
    "generateTitle",
    "supervisor",
    generateTitlePayloadSchema,
  ),
  generatePrSummary: definePayloadProcedure<
    GeneratePrSummaryPayload,
    GeneratePrSummaryResult,
    "supervisor"
  >("generatePrSummary", "supervisor", generatePrSummaryPayloadSchema),
  gitListBranches: definePayloadProcedure<GetGitBranchesPayload, GitBranchListResult, "supervisor">(
    "gitListBranches",
    "supervisor",
    getGitBranchesPayloadSchema,
  ),
  gitFetch: definePayloadProcedure<GitFetchPayload, void, "supervisor">(
    "gitFetch",
    "supervisor",
    gitFetchPayloadSchema,
  ),
  gitListWorktrees: definePayloadProcedure<
    GitListWorktreesPayload,
    GitWorktreeListResult,
    "supervisor"
  >("gitListWorktrees", "supervisor", gitListWorktreesPayloadSchema),
  gitAddWorktree: definePayloadProcedure<GitAddWorktreePayload, GitAddWorktreeResult, "supervisor">(
    "gitAddWorktree",
    "supervisor",
    gitAddWorktreePayloadSchema,
  ),
  gitRemoveWorktree: definePayloadProcedure<GitRemoveWorktreePayload, void, "supervisor">(
    "gitRemoveWorktree",
    "supervisor",
    gitRemoveWorktreePayloadSchema,
  ),
  gitPruneWorktrees: definePayloadProcedure<GitPruneWorktreesPayload, void, "supervisor">(
    "gitPruneWorktrees",
    "supervisor",
    gitPruneWorktreesPayloadSchema,
  ),
  gitDeleteBranch: definePayloadProcedure<GitDeleteBranchPayload, void, "supervisor">(
    "gitDeleteBranch",
    "supervisor",
    gitDeleteBranchPayloadSchema,
  ),
  gitSwitchBranch: definePayloadProcedure<
    GitSwitchBranchPayload,
    GitSwitchBranchResult,
    "supervisor"
  >("gitSwitchBranch", "supervisor", gitSwitchBranchPayloadSchema),
  gitPull: definePayloadProcedure<GitPullPayload, void, "supervisor">(
    "gitPull",
    "supervisor",
    gitPullPayloadSchema,
  ),
  gitPullRebase: definePayloadProcedure<GitPullPayload, void, "supervisor">(
    "gitPullRebase",
    "supervisor",
    gitPullPayloadSchema,
  ),
  gitPush: definePayloadProcedure<GitPushPayload, void, "supervisor">(
    "gitPush",
    "supervisor",
    gitPushPayloadSchema,
  ),
  gitSync: definePayloadProcedure<GitSyncPayload, GitSyncResult, "supervisor">(
    "gitSync",
    "supervisor",
    gitSyncPayloadSchema,
  ),
  gitSyncRebase: definePayloadProcedure<GitSyncPayload, GitSyncResult, "supervisor">(
    "gitSyncRebase",
    "supervisor",
    gitSyncPayloadSchema,
  ),
  gitProjectSnapshot: definePayloadProcedure<
    GitProjectSnapshotPayload,
    GitProjectSnapshotResult,
    "supervisor"
  >("gitProjectSnapshot", "supervisor", gitProjectSnapshotPayloadSchema),
  gitWorktreeStatusBatch: definePayloadProcedure<
    GitWorktreeStatusBatchPayload,
    GitWorktreeStatusBatchResult,
    "supervisor"
  >("gitWorktreeStatusBatch", "supervisor", gitWorktreeStatusBatchPayloadSchema),
  gitGetWorktreeSourceBranch: definePayloadProcedure<
    GitGetWorktreeSourceBranchPayload,
    GitGetWorktreeSourceBranchResult,
    "supervisor"
  >("gitGetWorktreeSourceBranch", "supervisor", gitGetWorktreeSourceBranchPayloadSchema),
  gitGetWorktreeOwner: definePayloadProcedure<
    GitGetWorktreeOwnerPayload,
    GitGetWorktreeOwnerResult,
    "supervisor"
  >("gitGetWorktreeOwner", "supervisor", gitGetWorktreeOwnerPayloadSchema),
  gitMergeToSource: definePayloadProcedure<
    GitMergeToSourcePayload,
    GitMergeToSourceResult,
    "supervisor"
  >("gitMergeToSource", "supervisor", gitMergeToSourcePayloadSchema),
  gitPullFromSource: definePayloadProcedure<
    GitPullFromSourcePayload,
    GitPullFromSourceResult,
    "supervisor"
  >("gitPullFromSource", "supervisor", gitPullFromSourcePayloadSchema),
  gitAbortMerge: definePayloadProcedure<GitAbortMergePayload, GitAbortMergeResult, "supervisor">(
    "gitAbortMerge",
    "supervisor",
    gitAbortMergePayloadSchema,
  ),
  gitFinishMerge: definePayloadProcedure<GitFinishMergePayload, GitFinishMergeResult, "supervisor">(
    "gitFinishMerge",
    "supervisor",
    gitFinishMergePayloadSchema,
  ),
  gitWatchProject: definePayloadProcedure<GitWatchProjectPayload, void, "supervisor">(
    "gitWatchProject",
    "supervisor",
    gitWatchProjectPayloadSchema,
  ),
  gitWatchWorktrees: definePayloadProcedure<GitWatchWorktreesPayload, void, "supervisor">(
    "gitWatchWorktrees",
    "supervisor",
    gitWatchWorktreesPayloadSchema,
  ),
  gitUnwatchProject: definePayloadProcedure<GitUnwatchProjectPayload, void, "supervisor">(
    "gitUnwatchProject",
    "supervisor",
    gitUnwatchProjectPayloadSchema,
  ),
  relocateProject: definePayloadProcedure<
    RelocateProjectPayload,
    RelocateProjectResult,
    "supervisor"
  >("relocateProject", "supervisor", relocateProjectPayloadSchema),
} as const;
