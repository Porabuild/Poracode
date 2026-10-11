import Foundation

enum GitOperationScope: String, Equatable, Sendable {
  case read = "session:read"
  case operate = "session:operate"
}

enum GitOperationOwner: String, Equatable, Sendable {
  case projectLocation
  case worktreeLocation
}

enum GitOperationResultKind: String, Equatable, Sendable {
  case json
  case omitted
}

struct GitOperationMetadata: Equatable, Sendable {
  let procedure: GitOperationProcedure
  let scope: GitOperationScope
  let owner: GitOperationOwner
  let resultKind: GitOperationResultKind
  let isLongRunning: Bool

  var isMutation: Bool { scope == .operate }
}

enum GitOperationProcedure: String, CaseIterable, Codable, Sendable {
  case gitAbortMerge
  case gitAddRemote
  case gitAddWorktree
  case gitCommit
  case gitDeleteBranch
  case gitFetch
  case gitFinishMerge
  case gitGetWorktreeOwner
  case gitGetWorktreeSourceBranch
  case gitInit
  case gitListBranches
  case gitListWorktrees
  case gitMergeToSource
  case gitPruneWorktrees
  case gitPull
  case gitPullFromSource
  case gitPullRebase
  case gitPush
  case gitRemoveWorktree
  case gitRevert
  case gitRevertAll
  case gitStage
  case gitStageAll
  case gitSwitchBranch
  case gitSync
  case gitSyncRebase
  case gitUnstage
  case gitUnstageAll
  case gitWorktreeStatusBatch
}

extension GitOperationProcedure {
  static let metadata: [GitOperationMetadata] = [
    entry(.gitAbortMerge, .operate, .worktreeLocation, .json),
    entry(.gitAddRemote, .operate, .projectLocation, .omitted),
    entry(.gitAddWorktree, .operate, .projectLocation, .json),
    entry(.gitCommit, .operate, .projectLocation, .json, long: true),
    entry(.gitDeleteBranch, .operate, .projectLocation, .omitted),
    entry(.gitFetch, .operate, .projectLocation, .omitted, long: true),
    entry(.gitFinishMerge, .operate, .worktreeLocation, .json, long: true),
    entry(.gitGetWorktreeOwner, .read, .projectLocation, .json),
    entry(.gitGetWorktreeSourceBranch, .read, .projectLocation, .json),
    entry(.gitInit, .operate, .projectLocation, .omitted),
    entry(.gitListBranches, .read, .projectLocation, .json),
    entry(.gitListWorktrees, .read, .projectLocation, .json),
    entry(.gitMergeToSource, .operate, .projectLocation, .json, long: true),
    entry(.gitPruneWorktrees, .operate, .projectLocation, .omitted),
    entry(.gitPull, .operate, .projectLocation, .omitted, long: true),
    entry(.gitPullFromSource, .operate, .worktreeLocation, .json, long: true),
    entry(.gitPullRebase, .operate, .projectLocation, .omitted, long: true),
    entry(.gitPush, .operate, .projectLocation, .omitted, long: true),
    entry(.gitRemoveWorktree, .operate, .projectLocation, .omitted),
    entry(.gitRevert, .operate, .projectLocation, .omitted),
    entry(.gitRevertAll, .operate, .projectLocation, .omitted),
    entry(.gitStage, .operate, .projectLocation, .omitted),
    entry(.gitStageAll, .operate, .projectLocation, .omitted),
    entry(.gitSwitchBranch, .operate, .projectLocation, .json),
    entry(.gitSync, .operate, .projectLocation, .json, long: true),
    entry(.gitSyncRebase, .operate, .projectLocation, .json, long: true),
    entry(.gitUnstage, .operate, .projectLocation, .omitted),
    entry(.gitUnstageAll, .operate, .projectLocation, .omitted),
    entry(.gitWorktreeStatusBatch, .read, .projectLocation, .json),
  ]

  var metadata: GitOperationMetadata {
    guard let metadata = Self.metadata.first(where: { $0.procedure == self }) else {
      preconditionFailure("Missing Git operation metadata")
    }
    return metadata
  }

  private static func entry(
    _ procedure: GitOperationProcedure,
    _ scope: GitOperationScope,
    _ owner: GitOperationOwner,
    _ resultKind: GitOperationResultKind,
    long: Bool = false
  ) -> GitOperationMetadata {
    GitOperationMetadata(
      procedure: procedure,
      scope: scope,
      owner: owner,
      resultKind: resultKind,
      isLongRunning: long
    )
  }
}
