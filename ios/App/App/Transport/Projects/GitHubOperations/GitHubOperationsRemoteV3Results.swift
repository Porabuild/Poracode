import Foundation

extension GitHubOperationsRemoteV3Contract {
  static func canonicalResult(
    _ procedure: GitHubProcedure,
    response: Data
  ) throws -> Data {
    switch procedure {
    case .ghCheckAvailable:
      try decode(
        response, .ghCheckAvailable, RemoteRootCodecs.procedureU2EGhCheckAvailableU2EResult)
    case .ghGetPrForBranch:
      try decode(
        response, .ghGetPrForBranch, RemoteRootCodecs.procedureU2EGhGetPrForBranchU2EResult)
    case .ghListPrs:
      try decode(response, .ghListPrs, RemoteRootCodecs.procedureU2EGhListPrsU2EResult)
    case .ghListPullRequests:
      try decode(
        response, .ghListPullRequests,
        RemoteRootCodecs.procedureU2EGhListPullRequestsU2EResult)
    case .ghGetPrChecks:
      try decode(response, .ghGetPrChecks, RemoteRootCodecs.procedureU2EGhGetPrChecksU2EResult)
    case .ghGetPrFiles:
      try decode(response, .ghGetPrFiles, RemoteRootCodecs.procedureU2EGhGetPrFilesU2EResult)
    case .ghGetPrDiff:
      try decode(response, .ghGetPrDiff, RemoteRootCodecs.procedureU2EGhGetPrDiffU2EResult)
    case .ghGetPrDetails:
      try decode(response, .ghGetPrDetails, RemoteRootCodecs.procedureU2EGhGetPrDetailsU2EResult)
    case .ghGetPrReviewComments:
      try decode(
        response, .ghGetPrReviewComments,
        RemoteRootCodecs.procedureU2EGhGetPrReviewCommentsU2EResult)
    case .ghListAccounts:
      try decode(response, .ghListAccounts, RemoteRootCodecs.procedureU2EGhListAccountsU2EResult)
    case .ghListRepos:
      try decode(response, .ghListRepos, RemoteRootCodecs.procedureU2EGhListReposU2EResult)
    case .ghListWorkflows:
      try decode(response, .ghListWorkflows, RemoteRootCodecs.procedureU2EGhListWorkflowsU2EResult)
    case .ghListWorkflowRuns:
      try decode(
        response, .ghListWorkflowRuns,
        RemoteRootCodecs.procedureU2EGhListWorkflowRunsU2EResult)
    case .ghGetWorkflowRun:
      try decode(
        response, .ghGetWorkflowRun,
        RemoteRootCodecs.procedureU2EGhGetWorkflowRunU2EResult)
    case .ghGetWorkflowDefinition:
      try decode(
        response, .ghGetWorkflowDefinition,
        RemoteRootCodecs.procedureU2EGhGetWorkflowDefinitionU2EResult)
    case .ghCreatePr:
      try decode(response, .ghCreatePr, RemoteRootCodecs.procedureU2EGhCreatePrU2EResult)
    case .ghPostPrComment:
      try decode(
        response, .ghPostPrComment,
        RemoteRootCodecs.procedureU2EGhPostPrCommentU2EResult)
    case .ghMergePr, .ghClosePr, .ghReopenPr, .ghMarkPrReady,
      .ghSubmitPrReview, .ghUpdatePrBranch, .ghDispatchWorkflow,
      .ghRerunWorkflowRun, .ghCancelWorkflowRun, .ghDeleteWorkflowRun:
      throw GitHubOperationsFailure.invalidResponse
    }
  }

  private static func decode<Value: Codable & Sendable>(
    _ response: Data,
    _ procedure: GitHubProcedure,
    _ codec: RemoteRootCodec<Value>
  ) throws -> Data {
    _ = metadata(for: procedure)
    return try canonical(response, codec: codec, boundary: "GitHub procedure result")
  }
}
