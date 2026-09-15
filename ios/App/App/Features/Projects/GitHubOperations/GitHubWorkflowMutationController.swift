import Foundation
import Observation

@MainActor
@Observable
final class GitHubWorkflowMutationController {
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

  func submit(_ request: GitHubOperationRequest) async {
    guard Self.supported.contains(request.procedure),
      request.procedure.metadata.scope == .operate
    else { return }
    let capture: GitHubControllerCapture
    switch runtime.capture(for: request) {
    case .success(let value): capture = value
    case .failure(let value):
      state.failure = value
      return
    }
    let deliveryId = UUID()
    if request.procedure.requiresConfirmation {
      state.pendingConfirmation = .init(
        id: deliveryId,
        request: request,
        capture: capture
      )
      return
    }
    await run(request, capture: capture, deliveryId: deliveryId)
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
    if let runId = mutation.workflowRunId {
      request = .ghGetWorkflowRun(
        .init(projectLocation: capture.lease.location, runId: runId)
      )
    } else if case .ghDispatchWorkflow(let value) = mutation {
      request = .ghListWorkflowRuns(
        .init(projectLocation: capture.lease.location, workflowId: value.workflowId)
      )
    } else {
      request = .ghListWorkflowRuns(.init(projectLocation: capture.lease.location))
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
    .ghDispatchWorkflow, .ghRerunWorkflowRun, .ghCancelWorkflowRun,
    .ghDeleteWorkflowRun,
  ]
}
