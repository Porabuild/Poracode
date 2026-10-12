import Foundation

extension GitHubOperationsRemoteV3Contract {
  static func canonicalRequest(_ request: GitHubOperationRequest) throws -> Data {
    switch request {
    case .ghCheckAvailable(let value):
      try encode(value, .ghCheckAvailable, RemoteRootCodecs.procedureU2EGhCheckAvailableU2ERequest)
    case .ghGetPrForBranch(let value):
      try encode(value, .ghGetPrForBranch, RemoteRootCodecs.procedureU2EGhGetPrForBranchU2ERequest)
    case .ghListPrs(let value):
      try encode(value, .ghListPrs, RemoteRootCodecs.procedureU2EGhListPrsU2ERequest)
    case .ghListPullRequests(let value):
      try encode(
        value, .ghListPullRequests,
        RemoteRootCodecs.procedureU2EGhListPullRequestsU2ERequest)
    case .ghGetPrChecks(let value):
      try encode(value, .ghGetPrChecks, RemoteRootCodecs.procedureU2EGhGetPrChecksU2ERequest)
    case .ghGetPrFiles(let value):
      try encode(value, .ghGetPrFiles, RemoteRootCodecs.procedureU2EGhGetPrFilesU2ERequest)
    case .ghGetPrDiff(let value):
      try encode(value, .ghGetPrDiff, RemoteRootCodecs.procedureU2EGhGetPrDiffU2ERequest)
    case .ghGetPrDetails(let value):
      try encode(value, .ghGetPrDetails, RemoteRootCodecs.procedureU2EGhGetPrDetailsU2ERequest)
    case .ghGetPrReviewComments(let value):
      try encode(
        value, .ghGetPrReviewComments,
        RemoteRootCodecs.procedureU2EGhGetPrReviewCommentsU2ERequest)
    case .ghListAccounts(let value):
      try encode(value, .ghListAccounts, RemoteRootCodecs.procedureU2EGhListAccountsU2ERequest)
    case .ghListRepos(let value):
      try encode(value, .ghListRepos, RemoteRootCodecs.procedureU2EGhListReposU2ERequest)
    case .ghListWorkflows(let value):
      try encode(value, .ghListWorkflows, RemoteRootCodecs.procedureU2EGhListWorkflowsU2ERequest)
    case .ghListWorkflowRuns(let value):
      try encode(
        value, .ghListWorkflowRuns,
        RemoteRootCodecs.procedureU2EGhListWorkflowRunsU2ERequest)
    case .ghGetWorkflowRun(let value):
      try encode(
        value, .ghGetWorkflowRun,
        RemoteRootCodecs.procedureU2EGhGetWorkflowRunU2ERequest)
    case .ghGetWorkflowDefinition(let value):
      try encode(
        value, .ghGetWorkflowDefinition,
        RemoteRootCodecs.procedureU2EGhGetWorkflowDefinitionU2ERequest)
    case .ghCreatePr(let value):
      try encode(value, .ghCreatePr, RemoteRootCodecs.procedureU2EGhCreatePrU2ERequest)
    case .ghMergePr(let value):
      try encode(value, .ghMergePr, RemoteRootCodecs.procedureU2EGhMergePrU2ERequest)
    case .ghClosePr(let value):
      try encode(value, .ghClosePr, RemoteRootCodecs.procedureU2EGhClosePrU2ERequest)
    case .ghReopenPr(let value):
      try encode(value, .ghReopenPr, RemoteRootCodecs.procedureU2EGhReopenPrU2ERequest)
    case .ghMarkPrReady(let value):
      try encode(value, .ghMarkPrReady, RemoteRootCodecs.procedureU2EGhMarkPrReadyU2ERequest)
    case .ghSubmitPrReview(let value):
      try encode(
        value, .ghSubmitPrReview,
        RemoteRootCodecs.procedureU2EGhSubmitPrReviewU2ERequest)
    case .ghUpdatePrBranch(let value):
      try encode(
        value, .ghUpdatePrBranch,
        RemoteRootCodecs.procedureU2EGhUpdatePrBranchU2ERequest)
    case .ghPostPrComment(let value):
      try encode(
        value, .ghPostPrComment,
        RemoteRootCodecs.procedureU2EGhPostPrCommentU2ERequest)
    case .ghDispatchWorkflow(let value):
      try encode(
        value, .ghDispatchWorkflow,
        RemoteRootCodecs.procedureU2EGhDispatchWorkflowU2ERequest)
    case .ghRerunWorkflowRun(let value):
      try encode(
        value, .ghRerunWorkflowRun,
        RemoteRootCodecs.procedureU2EGhRerunWorkflowRunU2ERequest)
    case .ghCancelWorkflowRun(let value):
      try encode(
        value, .ghCancelWorkflowRun,
        RemoteRootCodecs.procedureU2EGhCancelWorkflowRunU2ERequest)
    case .ghDeleteWorkflowRun(let value):
      try encode(
        value, .ghDeleteWorkflowRun,
        RemoteRootCodecs.procedureU2EGhDeleteWorkflowRunU2ERequest)
    }
  }

  private static func encode<Request: Encodable, Canonical: Codable & Sendable>(
    _ request: Request,
    _ procedure: GitHubProcedure,
    _ codec: RemoteRootCodec<Canonical>
  ) throws -> Data {
    _ = metadata(for: procedure)
    return try canonical(
      JSONEncoder().encode(request),
      codec: codec,
      boundary: "GitHub procedure request"
    )
  }
}
