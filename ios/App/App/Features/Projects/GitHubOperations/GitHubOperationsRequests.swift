import Foundation

enum GitHubAvailabilityDetail: String, Codable, Equatable, Sendable {
  case summary
  case full
}

enum GitHubMergeMethod: String, Codable, Equatable, Sendable {
  case merge
  case squash
  case rebase
}

enum GitHubReviewDecision: String, Codable, Equatable, Sendable {
  case approve
  case requestChanges = "request-changes"
  case comment
}

struct GitHubLocationRequest: Codable, Equatable, Sendable {
  let projectLocation: GitHubProjectLocation
}

struct GitHubAvailabilityRequest: Codable, Equatable, Sendable {
  let projectLocation: GitHubProjectLocation
  var detail: GitHubAvailabilityDetail?
}

struct GitHubBranchRequest: Codable, Equatable, Sendable {
  let projectLocation: GitHubProjectLocation
  let branch: String
}

struct GitHubPullRequestNumberRequest: Codable, Equatable, Sendable {
  let projectLocation: GitHubProjectLocation
  let prNumber: Int64
}

struct GitHubRuntimeRequest: Codable, Equatable, Sendable {
  let runtime: GitHubProjectLocation
}

struct GitHubAccount: Codable, Equatable, Hashable, Sendable {
  let host: String
  let login: String
}

struct GitHubRepositoriesRequest: Codable, Equatable, Sendable {
  let runtime: GitHubProjectLocation
  let account: GitHubAccount
}

struct GitHubWorkflowRunsRequest: Codable, Equatable, Sendable {
  let projectLocation: GitHubProjectLocation
  var workflowId: Int64?
}

struct GitHubWorkflowRunRequest: Codable, Equatable, Sendable {
  let projectLocation: GitHubProjectLocation
  let runId: Int64
}

struct GitHubWorkflowDefinitionRequest: Codable, Equatable, Sendable {
  let projectLocation: GitHubProjectLocation
  let workflowId: Int64
  var ref: String?
}

struct GitHubCreatePullRequest: Codable, Equatable, Sendable {
  let projectLocation: GitHubProjectLocation
  let branch: String
  let baseBranch: String
  let title: String
  var body: String?
  var isDraft: Bool?
}

struct GitHubMergePullRequest: Codable, Equatable, Sendable {
  let projectLocation: GitHubProjectLocation
  let prNumber: Int64
  var method: GitHubMergeMethod?
  var admin: Bool?
}

struct GitHubSubmitPullRequestReview: Codable, Equatable, Sendable {
  let projectLocation: GitHubProjectLocation
  let prNumber: Int64
  let decision: GitHubReviewDecision
  var body: String?
}

struct GitHubUpdatePullRequestBranch: Codable, Equatable, Sendable {
  let projectLocation: GitHubProjectLocation
  let prNumber: Int64
  var rebase: Bool?
}

struct GitHubPostPullRequestComment: Codable, Equatable, Sendable {
  let projectLocation: GitHubProjectLocation
  let prNumber: Int64
  let body: String
}

struct GitHubDispatchWorkflow: Codable, Equatable, Sendable {
  let projectLocation: GitHubProjectLocation
  let workflowId: Int64
  var ref: String?
  var inputs: [String: String]?
}

struct GitHubRerunWorkflow: Codable, Equatable, Sendable {
  let projectLocation: GitHubProjectLocation
  let runId: Int64
  var failedOnly: Bool?
}
