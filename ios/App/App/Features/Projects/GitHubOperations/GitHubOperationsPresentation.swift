import Foundation

enum GitHubPullRequestCreationMode: String, CaseIterable, Sendable {
  static let storageKey = "poracode.pull-request-creation-mode.v1"

  case dialog
  case auto

  static func resolved(_ rawValue: String) -> Self {
    Self(rawValue: rawValue) ?? .dialog
  }
}

enum GitHubActionCategory: CaseIterable, Sendable {
  case availability
  case pullRequests
  case workflows
}

enum GitHubActionRequirement: Sendable {
  case none
  case branch
  case account
  case pullRequest
  case workflow
  case workflowRun
}

enum GitHubActionRole: Sendable {
  case standard
  case destructive
}

struct GitHubActionDescriptor: Identifiable, Sendable {
  let procedure: GitHubProcedure
  let category: GitHubActionCategory
  let requirement: GitHubActionRequirement
  let role: GitHubActionRole

  var id: GitHubProcedure { procedure }
  var title: String { GitHubOperationsStrings.action(procedure) }
  var accessibilityLabel: String { title }
}

struct GitHubActionGating: Equatable, Sendable {
  let grantedScopes: Set<String>
  var isReady = true
  var isAvailable: Bool
  var hasBranch: Bool
  var hasAccount: Bool
  var hasPullRequest: Bool
  var hasWorkflow: Bool
  var hasWorkflowRun: Bool

  func permits(_ descriptor: GitHubActionDescriptor) -> Bool {
    guard isReady else { return false }
    guard grantedScopes.contains(descriptor.procedure.metadata.scope.rawValue) else {
      return false
    }
    if descriptor.procedure != .ghCheckAvailable && !isAvailable { return false }
    switch descriptor.requirement {
    case .none: return true
    case .branch: return hasBranch
    case .account: return hasAccount
    case .pullRequest: return hasPullRequest
    case .workflow: return hasWorkflow
    case .workflowRun: return hasWorkflowRun
    }
  }

  /// Entry points stay reachable so their forms can collect prerequisites.
  /// Submission still uses `permits(_:)` against the completed draft.
  func permitsEntry(_ descriptor: GitHubActionDescriptor) -> Bool {
    guard isReady,
      grantedScopes.contains(descriptor.procedure.metadata.scope.rawValue)
    else { return false }
    return descriptor.procedure == .ghCheckAvailable || isAvailable
  }
}

struct GitHubOperationsActivationID: Hashable, Sendable {
  let lease: GitHubProjectLease?
  let scopes: [String]
  let isOnline: Bool
  let isReady: Bool
  let isForeground: Bool

  init(_ context: GitHubControllerContext?) {
    lease = context?.lease
    scopes = (context?.grantedScopes ?? []).sorted()
    isOnline = context?.isOnline == true
    isReady = context?.isReady == true
    isForeground = context?.isForeground == true
  }
}

enum GitHubOperationsPresentation {
  static let actions: [GitHubActionDescriptor] = GitHubProcedure.allCases.map { procedure in
    GitHubActionDescriptor(
      procedure: procedure,
      category: category(procedure),
      requirement: requirement(procedure),
      role: procedure.requiresConfirmation ? .destructive : .standard
    )
  }

  static func actions(in category: GitHubActionCategory) -> [GitHubActionDescriptor] {
    actions.filter { $0.category == category }
  }

  private static func category(_ procedure: GitHubProcedure) -> GitHubActionCategory {
    switch procedure {
    case .ghCheckAvailable, .ghListAccounts, .ghListRepos: .availability
    case .ghGetPrForBranch, .ghListPrs, .ghListPullRequests, .ghGetPrChecks,
      .ghGetPrFiles, .ghGetPrDiff, .ghGetPrDetails, .ghGetPrReviewComments,
      .ghCreatePr, .ghMergePr, .ghClosePr, .ghReopenPr, .ghMarkPrReady,
      .ghSubmitPrReview, .ghUpdatePrBranch, .ghPostPrComment:
      .pullRequests
    case .ghListWorkflows, .ghListWorkflowRuns, .ghGetWorkflowRun,
      .ghGetWorkflowDefinition, .ghDispatchWorkflow, .ghRerunWorkflowRun,
      .ghCancelWorkflowRun, .ghDeleteWorkflowRun:
      .workflows
    }
  }

  private static func requirement(_ procedure: GitHubProcedure) -> GitHubActionRequirement {
    switch procedure {
    case .ghCheckAvailable, .ghListAccounts, .ghListPrs, .ghListPullRequests,
      .ghListWorkflows, .ghListWorkflowRuns, .ghCreatePr:
      .none
    case .ghGetPrForBranch, .ghGetPrChecks: .branch
    case .ghListRepos: .account
    case .ghGetPrFiles, .ghGetPrDiff, .ghGetPrDetails, .ghGetPrReviewComments,
      .ghMergePr, .ghClosePr, .ghReopenPr, .ghMarkPrReady,
      .ghSubmitPrReview, .ghUpdatePrBranch, .ghPostPrComment:
      .pullRequest
    case .ghGetWorkflowDefinition, .ghDispatchWorkflow: .workflow
    case .ghGetWorkflowRun, .ghRerunWorkflowRun, .ghCancelWorkflowRun,
      .ghDeleteWorkflowRun:
      .workflowRun
    }
  }
}
