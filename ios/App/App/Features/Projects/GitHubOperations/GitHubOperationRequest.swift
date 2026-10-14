import Foundation

enum GitHubOperationRequest: Equatable, Sendable {
  case ghCheckAvailable(GitHubAvailabilityRequest)
  case ghGetPrForBranch(GitHubBranchRequest)
  case ghListPrs(GitHubLocationRequest)
  case ghListPullRequests(GitHubLocationRequest)
  case ghGetPrChecks(GitHubBranchRequest)
  case ghGetPrFiles(GitHubPullRequestNumberRequest)
  case ghGetPrDiff(GitHubPullRequestNumberRequest)
  case ghGetPrDetails(GitHubPullRequestNumberRequest)
  case ghGetPrReviewComments(GitHubPullRequestNumberRequest)
  case ghListAccounts(GitHubRuntimeRequest)
  case ghListRepos(GitHubRepositoriesRequest)
  case ghListWorkflows(GitHubLocationRequest)
  case ghListWorkflowRuns(GitHubWorkflowRunsRequest)
  case ghGetWorkflowRun(GitHubWorkflowRunRequest)
  case ghGetWorkflowDefinition(GitHubWorkflowDefinitionRequest)
  case ghCreatePr(GitHubCreatePullRequest)
  case ghMergePr(GitHubMergePullRequest)
  case ghClosePr(GitHubPullRequestNumberRequest)
  case ghReopenPr(GitHubPullRequestNumberRequest)
  case ghMarkPrReady(GitHubPullRequestNumberRequest)
  case ghSubmitPrReview(GitHubSubmitPullRequestReview)
  case ghUpdatePrBranch(GitHubUpdatePullRequestBranch)
  case ghPostPrComment(GitHubPostPullRequestComment)
  case ghDispatchWorkflow(GitHubDispatchWorkflow)
  case ghRerunWorkflowRun(GitHubRerunWorkflow)
  case ghCancelWorkflowRun(GitHubWorkflowRunRequest)
  case ghDeleteWorkflowRun(GitHubWorkflowRunRequest)
}

extension GitHubOperationRequest {
  var procedure: GitHubProcedure {
    switch self {
    case .ghCheckAvailable: .ghCheckAvailable
    case .ghGetPrForBranch: .ghGetPrForBranch
    case .ghListPrs: .ghListPrs
    case .ghListPullRequests: .ghListPullRequests
    case .ghGetPrChecks: .ghGetPrChecks
    case .ghGetPrFiles: .ghGetPrFiles
    case .ghGetPrDiff: .ghGetPrDiff
    case .ghGetPrDetails: .ghGetPrDetails
    case .ghGetPrReviewComments: .ghGetPrReviewComments
    case .ghListAccounts: .ghListAccounts
    case .ghListRepos: .ghListRepos
    case .ghListWorkflows: .ghListWorkflows
    case .ghListWorkflowRuns: .ghListWorkflowRuns
    case .ghGetWorkflowRun: .ghGetWorkflowRun
    case .ghGetWorkflowDefinition: .ghGetWorkflowDefinition
    case .ghCreatePr: .ghCreatePr
    case .ghMergePr: .ghMergePr
    case .ghClosePr: .ghClosePr
    case .ghReopenPr: .ghReopenPr
    case .ghMarkPrReady: .ghMarkPrReady
    case .ghSubmitPrReview: .ghSubmitPrReview
    case .ghUpdatePrBranch: .ghUpdatePrBranch
    case .ghPostPrComment: .ghPostPrComment
    case .ghDispatchWorkflow: .ghDispatchWorkflow
    case .ghRerunWorkflowRun: .ghRerunWorkflowRun
    case .ghCancelWorkflowRun: .ghCancelWorkflowRun
    case .ghDeleteWorkflowRun: .ghDeleteWorkflowRun
    }
  }

  var ownerLocation: GitHubProjectLocation {
    switch self {
    case .ghCheckAvailable(let value): value.projectLocation
    case .ghGetPrForBranch(let value), .ghGetPrChecks(let value): value.projectLocation
    case .ghListPrs(let value), .ghListPullRequests(let value),
      .ghListWorkflows(let value):
      value.projectLocation
    case .ghGetPrFiles(let value), .ghGetPrDiff(let value),
      .ghGetPrDetails(let value), .ghGetPrReviewComments(let value),
      .ghClosePr(let value), .ghReopenPr(let value), .ghMarkPrReady(let value):
      value.projectLocation
    case .ghListAccounts(let value): value.runtime
    case .ghListRepos(let value): value.runtime
    case .ghListWorkflowRuns(let value): value.projectLocation
    case .ghGetWorkflowRun(let value), .ghCancelWorkflowRun(let value),
      .ghDeleteWorkflowRun(let value):
      value.projectLocation
    case .ghGetWorkflowDefinition(let value): value.projectLocation
    case .ghCreatePr(let value): value.projectLocation
    case .ghMergePr(let value): value.projectLocation
    case .ghSubmitPrReview(let value): value.projectLocation
    case .ghUpdatePrBranch(let value): value.projectLocation
    case .ghPostPrComment(let value): value.projectLocation
    case .ghDispatchWorkflow(let value): value.projectLocation
    case .ghRerunWorkflowRun(let value): value.projectLocation
    }
  }

  var pullRequestNumber: Int64? {
    switch self {
    case .ghGetPrFiles(let value), .ghGetPrDiff(let value),
      .ghGetPrDetails(let value), .ghGetPrReviewComments(let value),
      .ghClosePr(let value), .ghReopenPr(let value), .ghMarkPrReady(let value):
      value.prNumber
    case .ghMergePr(let value): value.prNumber
    case .ghSubmitPrReview(let value): value.prNumber
    case .ghUpdatePrBranch(let value): value.prNumber
    case .ghPostPrComment(let value): value.prNumber
    default: nil
    }
  }

  var workflowRunId: Int64? {
    switch self {
    case .ghGetWorkflowRun(let value), .ghCancelWorkflowRun(let value),
      .ghDeleteWorkflowRun(let value):
      value.runId
    case .ghRerunWorkflowRun(let value): value.runId
    default: nil
    }
  }
}
