import Foundation

enum GitOperationRequest: Equatable, Sendable {
  case gitAbortMerge(GitMergeStateRequest)
  case gitAddRemote(GitAddRemoteRequest)
  case gitAddWorktree(GitAddWorktreeRequest)
  case gitCommit(GitCommitRequest)
  case gitDeleteBranch(GitDeleteBranchRequest)
  case gitFetch(GitFetchRequest)
  case gitFinishMerge(GitMergeStateRequest)
  case gitGetWorktreeOwner(GitBranchRequest)
  case gitGetWorktreeSourceBranch(GitSourceBranchRequest)
  case gitInit(GitLocationRequest)
  case gitListBranches(GitListBranchesRequest)
  case gitListWorktrees(GitLocationRequest)
  case gitMergeToSource(GitMergeToSourceRequest)
  case gitPruneWorktrees(GitPruneWorktreesRequest)
  case gitPull(GitPullRequest)
  case gitPullFromSource(GitPullFromSourceRequest)
  case gitPullRebase(GitPullRequest)
  case gitPush(GitPushRequest)
  case gitRemoveWorktree(GitRemoveWorktreeRequest)
  case gitRevert(GitFileRequest)
  case gitRevertAll(GitLocationRequest)
  case gitStage(GitFileRequest)
  case gitStageAll(GitLocationRequest)
  case gitSwitchBranch(GitSwitchBranchRequest)
  case gitSync(GitRemoteRequest)
  case gitSyncRebase(GitRemoteRequest)
  case gitUnstage(GitFileRequest)
  case gitUnstageAll(GitLocationRequest)
  case gitWorktreeStatusBatch(GitWorktreeStatusBatchRequest)
}

extension GitOperationRequest {
  var procedure: GitOperationProcedure {
    switch self {
    case .gitAbortMerge: .gitAbortMerge
    case .gitAddRemote: .gitAddRemote
    case .gitAddWorktree: .gitAddWorktree
    case .gitCommit: .gitCommit
    case .gitDeleteBranch: .gitDeleteBranch
    case .gitFetch: .gitFetch
    case .gitFinishMerge: .gitFinishMerge
    case .gitGetWorktreeOwner: .gitGetWorktreeOwner
    case .gitGetWorktreeSourceBranch: .gitGetWorktreeSourceBranch
    case .gitInit: .gitInit
    case .gitListBranches: .gitListBranches
    case .gitListWorktrees: .gitListWorktrees
    case .gitMergeToSource: .gitMergeToSource
    case .gitPruneWorktrees: .gitPruneWorktrees
    case .gitPull: .gitPull
    case .gitPullFromSource: .gitPullFromSource
    case .gitPullRebase: .gitPullRebase
    case .gitPush: .gitPush
    case .gitRemoveWorktree: .gitRemoveWorktree
    case .gitRevert: .gitRevert
    case .gitRevertAll: .gitRevertAll
    case .gitStage: .gitStage
    case .gitStageAll: .gitStageAll
    case .gitSwitchBranch: .gitSwitchBranch
    case .gitSync: .gitSync
    case .gitSyncRebase: .gitSyncRebase
    case .gitUnstage: .gitUnstage
    case .gitUnstageAll: .gitUnstageAll
    case .gitWorktreeStatusBatch: .gitWorktreeStatusBatch
    }
  }

  var ownerLocation: ProjectLocation {
    switch self {
    case .gitAbortMerge(let value), .gitFinishMerge(let value): value.worktreeLocation
    case .gitAddRemote(let value): value.projectLocation
    case .gitAddWorktree(let value): value.projectLocation
    case .gitCommit(let value): value.projectLocation
    case .gitDeleteBranch(let value): value.projectLocation
    case .gitFetch(let value): value.projectLocation
    case .gitGetWorktreeOwner(let value): value.projectLocation
    case .gitGetWorktreeSourceBranch(let value): value.projectLocation
    case .gitInit(let value), .gitListWorktrees(let value), .gitRevertAll(let value),
      .gitStageAll(let value), .gitUnstageAll(let value):
      value.projectLocation
    case .gitListBranches(let value): value.projectLocation
    case .gitMergeToSource(let value): value.projectLocation
    case .gitPruneWorktrees(let value): value.projectLocation
    case .gitPull(let value), .gitPullRebase(let value): value.projectLocation
    case .gitPullFromSource(let value): value.worktreeLocation
    case .gitPush(let value): value.projectLocation
    case .gitRemoveWorktree(let value): value.projectLocation
    case .gitRevert(let value), .gitStage(let value), .gitUnstage(let value):
      value.projectLocation
    case .gitSwitchBranch(let value): value.projectLocation
    case .gitSync(let value), .gitSyncRebase(let value): value.projectLocation
    case .gitWorktreeStatusBatch(let value): value.projectLocation
    }
  }
}
