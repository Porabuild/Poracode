import Foundation

extension GitOperationsRemoteV3Contract {
  static func canonicalRequest(_ request: GitOperationRequest) throws -> Data {
    switch request {
    case .gitAbortMerge(let value):
      try encode(value, .gitAbortMerge, RemoteRootCodecs.procedureU2EGitAbortMergeU2ERequest)
    case .gitAddRemote(let value):
      try encode(value, .gitAddRemote, RemoteRootCodecs.procedureU2EGitAddRemoteU2ERequest)
    case .gitAddWorktree(let value):
      try encode(value, .gitAddWorktree, RemoteRootCodecs.procedureU2EGitAddWorktreeU2ERequest)
    case .gitCommit(let value):
      try encode(value, .gitCommit, RemoteRootCodecs.procedureU2EGitCommitU2ERequest)
    case .gitDeleteBranch(let value):
      try encode(value, .gitDeleteBranch, RemoteRootCodecs.procedureU2EGitDeleteBranchU2ERequest)
    case .gitFetch(let value):
      try encode(value, .gitFetch, RemoteRootCodecs.procedureU2EGitFetchU2ERequest)
    case .gitFinishMerge(let value):
      try encode(value, .gitFinishMerge, RemoteRootCodecs.procedureU2EGitFinishMergeU2ERequest)
    case .gitGetWorktreeOwner(let value):
      try encode(
        value, .gitGetWorktreeOwner,
        RemoteRootCodecs.procedureU2EGitGetWorktreeOwnerU2ERequest)
    case .gitGetWorktreeSourceBranch(let value):
      try encode(
        value, .gitGetWorktreeSourceBranch,
        RemoteRootCodecs.procedureU2EGitGetWorktreeSourceBranchU2ERequest)
    case .gitInit(let value):
      try encode(value, .gitInit, RemoteRootCodecs.procedureU2EGitInitU2ERequest)
    case .gitListBranches(let value):
      try encode(value, .gitListBranches, RemoteRootCodecs.procedureU2EGitListBranchesU2ERequest)
    case .gitListWorktrees(let value):
      try encode(value, .gitListWorktrees, RemoteRootCodecs.procedureU2EGitListWorktreesU2ERequest)
    case .gitMergeToSource(let value):
      try encode(value, .gitMergeToSource, RemoteRootCodecs.procedureU2EGitMergeToSourceU2ERequest)
    case .gitPruneWorktrees(let value):
      try encode(
        value, .gitPruneWorktrees, RemoteRootCodecs.procedureU2EGitPruneWorktreesU2ERequest)
    case .gitPull(let value):
      try encode(value, .gitPull, RemoteRootCodecs.procedureU2EGitPullU2ERequest)
    case .gitPullFromSource(let value):
      try encode(
        value, .gitPullFromSource, RemoteRootCodecs.procedureU2EGitPullFromSourceU2ERequest)
    case .gitPullRebase(let value):
      try encode(value, .gitPullRebase, RemoteRootCodecs.procedureU2EGitPullRebaseU2ERequest)
    case .gitPush(let value):
      try encode(value, .gitPush, RemoteRootCodecs.procedureU2EGitPushU2ERequest)
    case .gitRemoveWorktree(let value):
      try encode(
        value, .gitRemoveWorktree, RemoteRootCodecs.procedureU2EGitRemoveWorktreeU2ERequest)
    case .gitRevert(let value):
      try encode(value, .gitRevert, RemoteRootCodecs.procedureU2EGitRevertU2ERequest)
    case .gitRevertAll(let value):
      try encode(value, .gitRevertAll, RemoteRootCodecs.procedureU2EGitRevertAllU2ERequest)
    case .gitStage(let value):
      try encode(value, .gitStage, RemoteRootCodecs.procedureU2EGitStageU2ERequest)
    case .gitStageAll(let value):
      try encode(value, .gitStageAll, RemoteRootCodecs.procedureU2EGitStageAllU2ERequest)
    case .gitSwitchBranch(let value):
      try encode(value, .gitSwitchBranch, RemoteRootCodecs.procedureU2EGitSwitchBranchU2ERequest)
    case .gitSync(let value):
      try encode(value, .gitSync, RemoteRootCodecs.procedureU2EGitSyncU2ERequest)
    case .gitSyncRebase(let value):
      try encode(value, .gitSyncRebase, RemoteRootCodecs.procedureU2EGitSyncRebaseU2ERequest)
    case .gitUnstage(let value):
      try encode(value, .gitUnstage, RemoteRootCodecs.procedureU2EGitUnstageU2ERequest)
    case .gitUnstageAll(let value):
      try encode(value, .gitUnstageAll, RemoteRootCodecs.procedureU2EGitUnstageAllU2ERequest)
    case .gitWorktreeStatusBatch(let value):
      try encode(
        value, .gitWorktreeStatusBatch,
        RemoteRootCodecs.procedureU2EGitWorktreeStatusBatchU2ERequest)
    }
  }

  private static func encode<Request: Encodable, Canonical: Codable & Sendable>(
    _ request: Request,
    _ procedure: GitOperationProcedure,
    _ codec: RemoteRootCodec<Canonical>
  ) throws -> Data {
    _ = metadata(for: procedure)
    return try canonical(
      JSONDecoding.encoder.encode(request),
      codec: codec,
      boundary: "\(procedure.rawValue) request"
    )
  }
}
