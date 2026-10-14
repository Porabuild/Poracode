import Foundation

extension GitOperationsRemoteV3Contract {
  static func canonicalResult(
    _ procedure: GitOperationProcedure,
    response: Data
  ) throws -> GitOperationResult {
    let data = try resultData(response)
    switch procedure {
    case .gitAbortMerge:
      return .abortMerge(
        try decode(
          data, procedure, GitAbortMergeResult.self,
          RemoteRootCodecs.procedureU2EGitAbortMergeU2EResult))
    case .gitAddWorktree:
      return .addWorktree(
        try decode(
          data, procedure, GitAddWorktreeResult.self,
          RemoteRootCodecs.procedureU2EGitAddWorktreeU2EResult))
    case .gitCommit:
      return .commit(
        try decode(
          data, procedure, GitCommitResult.self,
          RemoteRootCodecs.procedureU2EGitCommitU2EResult))
    case .gitFinishMerge:
      return .finishMerge(
        try decode(
          data, procedure, GitFinishMergeResult.self,
          RemoteRootCodecs.procedureU2EGitFinishMergeU2EResult))
    case .gitGetWorktreeOwner:
      return .worktreeOwner(
        try decode(
          data, procedure, GitWorktreeOwnerResult.self,
          RemoteRootCodecs.procedureU2EGitGetWorktreeOwnerU2EResult))
    case .gitGetWorktreeSourceBranch:
      return .worktreeSourceBranch(
        try decode(
          data, procedure, GitWorktreeSourceBranchResult.self,
          RemoteRootCodecs.procedureU2EGitGetWorktreeSourceBranchU2EResult))
    case .gitListBranches:
      return .branches(
        try decode(
          data, procedure, ProjectGitBranchList.self,
          RemoteRootCodecs.procedureU2EGitListBranchesU2EResult))
    case .gitListWorktrees:
      return .worktrees(
        try decode(
          data, procedure, GitWorktreeListResult.self,
          RemoteRootCodecs.procedureU2EGitListWorktreesU2EResult))
    case .gitMergeToSource:
      return .mergeToSource(
        try decode(
          data, procedure, GitMergeToSourceResult.self,
          RemoteRootCodecs.procedureU2EGitMergeToSourceU2EResult))
    case .gitPullFromSource:
      return .pullFromSource(
        try decode(
          data, procedure, GitPullFromSourceResult.self,
          RemoteRootCodecs.procedureU2EGitPullFromSourceU2EResult))
    case .gitSwitchBranch:
      return .switchBranch(
        try decode(
          data, procedure, GitSwitchBranchResult.self,
          RemoteRootCodecs.procedureU2EGitSwitchBranchU2EResult))
    case .gitSync:
      return .sync(
        try decode(
          data, procedure, GitSyncResult.self,
          RemoteRootCodecs.procedureU2EGitSyncU2EResult))
    case .gitSyncRebase:
      return .sync(
        try decode(
          data, procedure, GitSyncResult.self,
          RemoteRootCodecs.procedureU2EGitSyncRebaseU2EResult))
    case .gitWorktreeStatusBatch:
      return .worktreeStatuses(
        try decode(
          data, procedure, GitWorktreeStatusBatchResult.self,
          RemoteRootCodecs.procedureU2EGitWorktreeStatusBatchU2EResult))
    case .gitAddRemote, .gitDeleteBranch, .gitFetch, .gitInit, .gitPruneWorktrees,
      .gitPull, .gitPullRebase, .gitPush, .gitRemoveWorktree, .gitRevert,
      .gitRevertAll, .gitStage, .gitStageAll, .gitUnstage, .gitUnstageAll:
      throw RemoteClientError.invalidResponse("Unexpected Git operation result.")
    }
  }

  private static func resultData(_ response: Data) throws -> Data {
    guard let object = try JSONSerialization.jsonObject(with: response) as? [String: Any],
      let result = object["result"]
    else {
      throw RemoteClientError.invalidResponse("Invalid Git operation response.")
    }
    return try JSONSerialization.data(withJSONObject: result)
  }

  private static func decode<Result: Decodable, Canonical: Codable & Sendable>(
    _ data: Data,
    _ procedure: GitOperationProcedure,
    _ type: Result.Type,
    _ codec: RemoteRootCodec<Canonical>
  ) throws -> Result {
    let canonicalData = try canonical(
      data,
      codec: codec,
      boundary: "\(procedure.rawValue) result"
    )
    return try JSONDecoding.decode(type, from: canonicalData)
  }
}
