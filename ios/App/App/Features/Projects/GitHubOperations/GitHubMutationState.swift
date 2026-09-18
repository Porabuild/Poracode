import Foundation

struct GitHubPendingConfirmation: Identifiable, Equatable, Sendable {
  let id: UUID
  let request: GitHubOperationRequest
  let capture: GitHubControllerCapture

  init(
    id: UUID = UUID(),
    request: GitHubOperationRequest,
    capture: GitHubControllerCapture
  ) {
    self.id = id
    self.request = request
    self.capture = capture
  }
}

struct GitHubMutationState: Equatable, Sendable {
  var activeMutation: GitHubProcedure?
  var pendingConfirmation: GitHubPendingConfirmation?
  var lastResult: GitHubOperationResult?
  var lastReconciliation: GitHubOperationResult?
  var failure: GitHubOperationsFailure?
  var requiresAuthoritativeRefresh = false
  var reconciliationCount = 0

  var isBusy: Bool { activeMutation != nil }
}
