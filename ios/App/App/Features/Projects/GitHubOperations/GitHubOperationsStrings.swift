import Foundation

enum GitHubOperationsStrings {
  static var title: String { localized("githubOperations.title") }
  static var availability: String { localized("githubOperations.availability") }
  static var pullRequests: String { localized("githubOperations.pullRequests") }
  static var workflows: String { localized("githubOperations.workflows") }
  static var unavailable: String { localized("githubOperations.unavailable") }
  static var actionHint: String { localized("githubOperations.actionHint") }
  static var notReady: String { localized("githubOperations.notReady") }
  static var cancel: String { localized("githubOperations.cancel") }
  static var run: String { localized("githubOperations.run") }
  static var confirm: String { localized("githubOperations.confirm") }
  static var ready: String { localized("githubOperations.ready") }
  static var detail: String { localized("githubOperations.detail") }
  static var summary: String { localized("githubOperations.summary") }
  static var full: String { localized("githubOperations.full") }
  static var branch: String { localized("githubOperations.branch") }
  static var baseBranch: String { localized("githubOperations.baseBranch") }
  static var pullRequestTitle: String { localized("githubOperations.pullRequestTitle") }
  static var body: String { localized("githubOperations.body") }
  static var draft: String { localized("githubOperations.draft") }
  static var pullRequestNumber: String { localized("githubOperations.pullRequestNumber") }
  static var host: String { localized("githubOperations.host") }
  static var login: String { localized("githubOperations.login") }
  static var workflowId: String { localized("githubOperations.workflowId") }
  static var optionalWorkflowId: String { localized("githubOperations.optionalWorkflowId") }
  static var workflowRunId: String { localized("githubOperations.workflowRunId") }
  static var ref: String { localized("githubOperations.ref") }
  static var mergeMethod: String { localized("githubOperations.mergeMethod") }
  static var merge: String { localized("githubOperations.merge") }
  static var squash: String { localized("githubOperations.squash") }
  static var rebase: String { localized("githubOperations.rebase") }
  static var admin: String { localized("githubOperations.admin") }
  static var reviewDecision: String { localized("githubOperations.reviewDecision") }
  static var approve: String { localized("githubOperations.approve") }
  static var requestChanges: String { localized("githubOperations.requestChanges") }
  static var commentDecision: String { localized("githubOperations.commentDecision") }
  static var inputs: String { localized("githubOperations.inputs") }
  static var inputsHint: String { localized("githubOperations.inputsHint") }
  static var failedOnly: String { localized("githubOperations.failedOnly") }
  static var pinWorkflow: String { localized("githubOperations.pinWorkflow") }
  static var unpinWorkflow: String { localized("githubOperations.unpinWorkflow") }
  static var attempt: String { localized("githubOperations.attempt") }
  static var succeeded: String { localized("githubOperations.succeeded") }
  static var failed: String { localized("githubOperations.failed") }
  static var cancelled: String { localized("githubOperations.cancelled") }
  static var skipped: String { localized("githubOperations.skipped") }
  static var timedOut: String { localized("githubOperations.timedOut") }
  static var inProgress: String { localized("githubOperations.inProgress") }
  static var queued: String { localized("githubOperations.queued") }
  static var waiting: String { localized("githubOperations.waiting") }
  static var unknown: String { localized("githubOperations.unknown") }
  static var openDialog: String { localized("githubOperations.createPr.openDialog") }
  static var autoGenerate: String { localized("githubOperations.createPr.autoGenerate") }

  static func action(_ procedure: GitHubProcedure) -> String {
    localized(procedure.rawValue)
  }

  static func confirmation(for request: GitHubOperationRequest) -> String {
    switch request {
    case .ghMergePr(let value):
      formatted("githubOperations.confirmMerge", value.prNumber)
    case .ghClosePr(let value):
      formatted("githubOperations.confirmClose", value.prNumber)
    case .ghCancelWorkflowRun(let value):
      formatted("githubOperations.confirmCancelRun", value.runId)
    case .ghDeleteWorkflowRun(let value):
      formatted("githubOperations.confirmDeleteRun", value.runId)
    default:
      confirm
    }
  }

  static func failure(_ failure: GitHubOperationsFailure) -> String {
    switch failure {
    case .notReady: localized("githubOperations.failure.notReady")
    case .capabilityMissing: localized("githubOperations.failure.capabilityMissing")
    case .authenticationExpired: localized("githubOperations.failure.authenticationExpired")
    case .authorizationDenied: localized("githubOperations.failure.authorizationDenied")
    case .rejected: localized("githubOperations.failure.rejected")
    case .transport: localized("githubOperations.failure.transport")
    case .invalidResponse: localized("githubOperations.failure.invalidResponse")
    case .ambiguousOutcome: localized("githubOperations.failure.ambiguousOutcome")
    case .busy: localized("githubOperations.failure.busy")
    }
  }

  private static func formatted(_ key: String, _ value: Int64) -> String {
    String.localizedStringWithFormat(localized(key), value)
  }

  private static func localized(_ key: String) -> String {
    String(
      localized: String.LocalizationValue(key),
      table: "GitHubOperations",
      bundle: .main
    )
  }
}
