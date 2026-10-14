import Foundation

enum GitHubProcedureScope: String, Codable, Equatable, Sendable {
  case read = "session:read"
  case operate = "session:operate"
}

enum GitHubProcedureOwner: String, Codable, Equatable, Sendable {
  case projectLocation
  case runtime
}

enum GitHubProcedureResultKind: String, Codable, Equatable, Sendable {
  case json
  case omitted
}

struct GitHubProcedureMetadata: Equatable, Sendable {
  let procedure: GitHubProcedure
  let scope: GitHubProcedureScope
  let owner: GitHubProcedureOwner
  let resultKind: GitHubProcedureResultKind
  let isLongRunning: Bool

  var isMutation: Bool { scope == .operate }
}

/// Stable, hash-free names for every remote-v3 GitHub procedure.
enum GitHubProcedure: String, CaseIterable, Codable, Sendable {
  case ghCheckAvailable
  case ghGetPrForBranch
  case ghListPrs
  case ghListPullRequests
  case ghGetPrChecks
  case ghGetPrFiles
  case ghGetPrDiff
  case ghGetPrDetails
  case ghGetPrReviewComments
  case ghListAccounts
  case ghListRepos
  case ghListWorkflows
  case ghListWorkflowRuns
  case ghGetWorkflowRun
  case ghGetWorkflowDefinition
  case ghCreatePr
  case ghMergePr
  case ghClosePr
  case ghReopenPr
  case ghMarkPrReady
  case ghSubmitPrReview
  case ghUpdatePrBranch
  case ghPostPrComment
  case ghDispatchWorkflow
  case ghRerunWorkflowRun
  case ghCancelWorkflowRun
  case ghDeleteWorkflowRun
}

extension GitHubProcedure {
  static let metadata: [GitHubProcedureMetadata] = [
    entry(.ghCheckAvailable, .read, .projectLocation, .json),
    entry(.ghGetPrForBranch, .read, .projectLocation, .json),
    entry(.ghListPrs, .read, .projectLocation, .json),
    entry(.ghListPullRequests, .read, .projectLocation, .json),
    entry(.ghGetPrChecks, .read, .projectLocation, .json),
    entry(.ghGetPrFiles, .read, .projectLocation, .json),
    entry(.ghGetPrDiff, .read, .projectLocation, .json),
    entry(.ghGetPrDetails, .read, .projectLocation, .json),
    entry(.ghGetPrReviewComments, .read, .projectLocation, .json),
    entry(.ghListAccounts, .read, .runtime, .json),
    entry(.ghListRepos, .read, .runtime, .json),
    entry(.ghListWorkflows, .read, .projectLocation, .json),
    entry(.ghListWorkflowRuns, .read, .projectLocation, .json),
    entry(.ghGetWorkflowRun, .read, .projectLocation, .json),
    entry(.ghGetWorkflowDefinition, .read, .projectLocation, .json),
    entry(.ghCreatePr, .operate, .projectLocation, .json, long: true),
    entry(.ghMergePr, .operate, .projectLocation, .omitted, long: true),
    entry(.ghClosePr, .operate, .projectLocation, .omitted),
    entry(.ghReopenPr, .operate, .projectLocation, .omitted),
    entry(.ghMarkPrReady, .operate, .projectLocation, .omitted),
    entry(.ghSubmitPrReview, .operate, .projectLocation, .omitted, long: true),
    entry(.ghUpdatePrBranch, .operate, .projectLocation, .omitted, long: true),
    entry(.ghPostPrComment, .operate, .projectLocation, .json),
    entry(.ghDispatchWorkflow, .operate, .projectLocation, .omitted),
    entry(.ghRerunWorkflowRun, .operate, .projectLocation, .omitted),
    entry(.ghCancelWorkflowRun, .operate, .projectLocation, .omitted),
    entry(.ghDeleteWorkflowRun, .operate, .projectLocation, .omitted),
  ]

  var metadata: GitHubProcedureMetadata {
    guard let value = Self.metadata.first(where: { $0.procedure == self }) else {
      preconditionFailure("Missing GitHub operation metadata")
    }
    return value
  }

  var requiresConfirmation: Bool {
    switch self {
    case .ghMergePr, .ghClosePr, .ghCancelWorkflowRun, .ghDeleteWorkflowRun:
      true
    default:
      false
    }
  }

  private static func entry(
    _ procedure: GitHubProcedure,
    _ scope: GitHubProcedureScope,
    _ owner: GitHubProcedureOwner,
    _ resultKind: GitHubProcedureResultKind,
    long: Bool = false
  ) -> GitHubProcedureMetadata {
    GitHubProcedureMetadata(
      procedure: procedure,
      scope: scope,
      owner: owner,
      resultKind: resultKind,
      isLongRunning: long
    )
  }
}
