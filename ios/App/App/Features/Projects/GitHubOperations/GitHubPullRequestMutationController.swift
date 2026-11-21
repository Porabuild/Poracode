import Foundation
import Observation

@MainActor
@Observable
final class GitHubPullRequestMutationController {
  private(set) var state = GitHubMutationState()

  private let gateway: any GitHubOperationsGateway
  private let deliveryGate: GitHubMutationDeliveryGate
  private let runtime = GitHubControllerRuntime()

  init(
    gateway: any GitHubOperationsGateway,
    deliveryGate: GitHubMutationDeliveryGate = GitHubMutationDeliveryGate()
  ) {
    self.gateway = gateway
    self.deliveryGate = deliveryGate
  }

  func activate(_ context: GitHubControllerContext) {
    if runtime.activate(context) { state = GitHubMutationState() }
  }

  func deactivate() {
    runtime.deactivate()
    state = GitHubMutationState()
  }

  func enterBackground() {
    runtime.enterBackground()
    state.activeMutation = nil
    state.pendingConfirmation = nil
  }

  func leaveBackground(_ context: GitHubControllerContext) {
    if runtime.leaveBackground(context) { state = GitHubMutationState() }
  }

  @discardableResult
  func submit(
    _ request: GitHubOperationRequest, expectedLease: GitHubProjectLease? = nil
  ) async -> GitHubOperationsFailure? {
    guard Self.supported.contains(request.procedure),
      request.procedure.metadata.scope == .operate
    else { return .notReady }
    if let expectedLease, runtime.context?.lease != expectedLease { return .notReady }
    let capture: GitHubControllerCapture
    switch runtime.capture(for: request) {
    case .success(let value): capture = value
    case .failure(let value):
      state.failure = value
      return value
    }
    let deliveryId = UUID()
    if request.procedure.requiresConfirmation {
      state.pendingConfirmation = .init(
        id: deliveryId,
        request: request,
        capture: capture
      )
      return nil
    }
    await run(request, capture: capture, deliveryId: deliveryId)
    guard runtime.owns(capture) else { return .notReady }
    return state.failure
  }

  func confirmPendingMutation() async {
    guard let pending = state.pendingConfirmation else { return }
    state.pendingConfirmation = nil
    guard runtime.owns(pending.capture) else { return }
    await run(pending.request, capture: pending.capture, deliveryId: pending.id)
  }

  func cancelPendingMutation() {
    state.pendingConfirmation = nil
  }

  private func run(
    _ request: GitHubOperationRequest,
    capture: GitHubControllerCapture,
    deliveryId: UUID
  ) async {
    guard state.activeMutation == nil else {
      state.failure = .busy
      return
    }
    state.activeMutation = request.procedure
    state.failure = nil
    runtime.mutationTask.launch { [weak self] _ in
      guard let self else { return }
      do {
        let result = try await self.deliveryGate.deliver(id: deliveryId) {
          try await self.gateway.call(request, lease: capture.lease)
        }
        try Task.checkCancellation()
        guard self.runtime.owns(capture) else { return }
        self.state.activeMutation = nil
        self.state.failure = nil
        self.state.lastResult = result
        self.state.requiresAuthoritativeRefresh = false
      } catch is CancellationError {
        guard self.runtime.owns(capture) else { return }
        self.state.activeMutation = nil
      } catch {
        guard self.runtime.owns(capture) else { return }
        let mapped = GitHubFailureMapper.map(error)
        self.state.activeMutation = nil
        self.state.failure = mapped
        if mapped == .ambiguousOutcome {
          self.state.requiresAuthoritativeRefresh = true
          await self.reconcile(request, capture: capture)
        }
      }
    }
    await runtime.mutationTask.wait()
  }

  private func reconcile(
    _ mutation: GitHubOperationRequest,
    capture: GitHubControllerCapture
  ) async {
    let request: GitHubOperationRequest
    if let number = mutation.pullRequestNumber {
      request = .ghGetPrDetails(
        .init(projectLocation: capture.lease.location, prNumber: number)
      )
    } else {
      request = .ghListPullRequests(.init(projectLocation: capture.lease.location))
    }
    state.reconciliationCount += 1
    do {
      let result = try await gateway.call(request, lease: capture.lease)
      try Task.checkCancellation()
      guard runtime.owns(capture) else { return }
      state.lastReconciliation = result
      state.requiresAuthoritativeRefresh = false
    } catch {
      guard runtime.owns(capture) else { return }
      state.requiresAuthoritativeRefresh = true
    }
  }

  private static let supported: Set<GitHubProcedure> = [
    .ghCreatePr, .ghMergePr, .ghClosePr, .ghReopenPr, .ghMarkPrReady,
    .ghSubmitPrReview, .ghUpdatePrBranch, .ghPostPrComment,
  ]
}
