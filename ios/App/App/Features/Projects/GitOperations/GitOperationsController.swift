import Foundation
import Observation

@MainActor
@Observable
final class GitOperationsController {
  var state = GitOperationsControllerState()

  private let gateway: any GitOperationsGateway
  private let serializer: GitOperationsMutationSerializer
  private let readTask = GitOperationsTaskSlot()
  private let mutationTask = GitOperationsTaskSlot()
  private var revision: UInt64 = 0
  private var isBackgrounded = false

  init(
    gateway: any GitOperationsGateway,
    serializer: GitOperationsMutationSerializer = GitOperationsMutationSerializer()
  ) {
    self.gateway = gateway
    self.serializer = serializer
  }

  func activate(_ context: ProjectWorkspaceContext) {
    guard context.isConsistent else {
      deactivate()
      return
    }
    guard state.context != context else { return }
    cancelOwnedWork()
    revision &+= 1
    isBackgrounded = false
    state = GitOperationsControllerState(context: context)
  }

  func deactivate() {
    cancelOwnedWork()
    revision &+= 1
    isBackgrounded = false
    state = GitOperationsControllerState()
  }

  func enterBackground() {
    cancelOwnedWork()
    revision &+= 1
    isBackgrounded = true
    state.activeMutation = nil
    state.pendingConfirmation = nil
    if case .loading = state.loadState { state.loadState = .idle }
  }

  func leaveBackground(_ context: ProjectWorkspaceContext) {
    guard state.context?.lease == context.lease else { return }
    state.context = context
    isBackgrounded = false
  }

  func read(_ request: GitOperationRequest) async {
    guard request.procedure.metadata.scope == .read,
      let capture = capture(capability: .sessionRead, request: request)
    else { return }
    state.loadState = .loading(request.procedure)
    readTask.launch { [weak self] in
      guard let self else { return }
      do {
        let result = try await self.gateway.call(request, lease: capture.lease)
        try Task.checkCancellation()
        guard self.owns(capture) else { return }
        try self.install(result, procedure: request.procedure)
        self.state.loadState = .loaded
        self.state.failure = nil
      } catch is CancellationError {
        guard self.owns(capture) else { return }
        self.state.loadState = .idle
      } catch {
        guard self.owns(capture) else { return }
        let failure = ProjectOperationFailure.map(error)
        self.state.failure = failure
        self.state.loadState = .failed(failure)
      }
    }
    await readTask.wait()
  }

  func submit(_ request: GitOperationRequest) async {
    guard request.procedure.metadata.scope == .operate else { return }
    if request.procedure.requiresConfirmation {
      guard let context = state.context, ownsLease(context.lease) else { return }
      state.pendingConfirmation = GitOperationsPendingConfirmation(
        request: request,
        lease: context.lease
      )
      return
    }
    await runMutation(request)
  }

  func confirmPendingMutation() async {
    guard let pending = state.pendingConfirmation else { return }
    state.pendingConfirmation = nil
    guard ownsLease(pending.lease) else { return }
    await runMutation(pending.request)
  }

  func cancelPendingMutation() {
    state.pendingConfirmation = nil
  }

  private func runMutation(_ request: GitOperationRequest) async {
    guard state.activeMutation == nil else {
      state.failure = .busy
      return
    }
    guard let capture = capture(capability: .sessionOperate, request: request) else { return }
    state.activeMutation = request.procedure
    state.failure = nil
    mutationTask.launch { [weak self] in
      guard let self else { return }
      do {
        let result = try await self.serializer.perform { [gateway = self.gateway] in
          try await gateway.call(request, lease: capture.lease)
        }
        try Task.checkCancellation()
        guard self.owns(capture) else { return }
        self.state.lastResult = result
        self.state.completedMutationCount &+= 1
        self.state.activeMutation = nil
        self.state.requiresAuthoritativeRefresh = false
        try self.install(result, procedure: request.procedure)
      } catch is CancellationError {
        guard self.owns(capture) else { return }
        self.state.activeMutation = nil
      } catch {
        guard self.owns(capture) else { return }
        let failure = ProjectOperationFailure.map(error)
        self.state.activeMutation = nil
        self.state.failure = failure
        if failure == .ambiguousOutcome {
          self.state.requiresAuthoritativeRefresh = true
          await self.reconcile(capture)
        }
      }
    }
    await mutationTask.wait()
  }

  private func reconcile(_ capture: Capture) async {
    do {
      let branches = try await gateway.call(
        .gitListBranches(.init(projectLocation: capture.lease.location, includeRemote: true)),
        lease: capture.lease
      )
      try Task.checkCancellation()
      guard owns(capture) else { return }
      try install(branches, procedure: .gitListBranches)

      let worktrees = try await gateway.call(
        .gitListWorktrees(.init(projectLocation: capture.lease.location)),
        lease: capture.lease
      )
      try Task.checkCancellation()
      guard owns(capture) else { return }
      try install(worktrees, procedure: .gitListWorktrees)

      let statuses = try await gateway.call(
        .gitWorktreeStatusBatch(
          .init(
            projectLocation: capture.lease.location,
            worktreePaths: [capture.lease.location.displayPath],
            detail: .full
          )
        ),
        lease: capture.lease
      )
      try Task.checkCancellation()
      guard owns(capture) else { return }
      try install(statuses, procedure: .gitWorktreeStatusBatch)
      state.requiresAuthoritativeRefresh = false
    } catch is CancellationError {
      return
    } catch {
      guard owns(capture) else { return }
      state.requiresAuthoritativeRefresh = true
    }
  }

  private struct Capture: Sendable {
    let lease: ProjectWorkspaceLease
    let revision: UInt64
  }

  private func capture(
    capability: ProjectControllerCapability,
    request: GitOperationRequest
  ) -> Capture? {
    guard !isBackgrounded, let context = state.context, context.isConsistent else {
      state.failure = .notReady
      return nil
    }
    if let failure = context.session.gate(capability) {
      state.failure = failure
      return nil
    }
    guard request.ownerLocation == context.lease.location else {
      state.failure = .invalidResponse
      return nil
    }
    return Capture(lease: context.lease, revision: revision)
  }

  private func owns(_ capture: Capture) -> Bool {
    !isBackgrounded && capture.revision == revision && ownsLease(capture.lease)
  }

  private func ownsLease(_ lease: ProjectWorkspaceLease) -> Bool {
    state.context?.isConsistent == true && state.context?.lease == lease
  }

  private func cancelOwnedWork() {
    readTask.cancel()
    mutationTask.cancel()
  }
}
