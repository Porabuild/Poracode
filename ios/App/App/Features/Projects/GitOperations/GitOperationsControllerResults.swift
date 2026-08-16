import Foundation

extension GitOperationsController {
  func install(
    _ result: GitOperationResult,
    procedure: GitOperationProcedure
  ) throws {
    switch (procedure, result) {
    case (.gitListBranches, .branches(let value)):
      state.authoritative.branches = value
    case (.gitListWorktrees, .worktrees(let value)):
      state.authoritative.worktrees = value.worktrees
    case (.gitWorktreeStatusBatch, .worktreeStatuses(let value)):
      state.authoritative.worktreeStatuses = value.statuses
    case (.gitGetWorktreeOwner, .worktreeOwner(let value)):
      state.authoritative.owner = value
    case (.gitGetWorktreeSourceBranch, .worktreeSourceBranch(let value)):
      state.authoritative.sourceBranch = value
    case (.gitSwitchBranch, .switchBranch), (.gitAddWorktree, .addWorktree),
      (.gitCommit, .commit), (.gitAbortMerge, .abortMerge),
      (.gitFinishMerge, .finishMerge), (.gitMergeToSource, .mergeToSource),
      (.gitPullFromSource, .pullFromSource), (.gitSync, .sync),
      (.gitSyncRebase, .sync):
      break
    case (_, .omitted) where procedure.metadata.resultKind == .omitted:
      break
    default:
      throw ProjectSessionGatewayError.invalidResponse
    }
  }
}
