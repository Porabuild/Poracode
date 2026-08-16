import XCTest

@testable import App

final class GitOperationsControllerTests: XCTestCase {
  @MainActor
  func testDestructiveMutationRequiresCapturedConfirmation() async {
    let context = makeGitOperationsContext()
    let gateway = QueuedGitOperationsGateway(outcomes: [.value(.omitted)])
    let controller = GitOperationsController(gateway: gateway)
    controller.activate(context)
    let request = GitOperationRequest.gitRevertAll(
      .init(projectLocation: context.lease.location)
    )

    await controller.submit(request)
    XCTAssertNotNil(controller.state.pendingConfirmation)
    let requestsBeforeConfirmation = await gateway.requests
    XCTAssertEqual(requestsBeforeConfirmation.count, 0)

    await controller.confirmPendingMutation()
    XCTAssertNil(controller.state.pendingConfirmation)
    let requestsAfterConfirmation = await gateway.requests
    XCTAssertEqual(requestsAfterConfirmation, [request])
  }

  @MainActor
  func testAmbiguousMutationIsNotRetriedAndReconcilesWithAuthoritativeReads() async {
    let context = makeGitOperationsContext()
    let branches = ProjectGitBranchList(current: "main", branches: [])
    let worktrees = GitWorktreeListResult(worktrees: [])
    let gateway = QueuedGitOperationsGateway(outcomes: [
      .failure(.ambiguousOutcome),
      .value(.branches(branches)),
      .value(.worktrees(worktrees)),
      .value(.worktreeStatuses(.init(statuses: [:]))),
    ])
    let controller = GitOperationsController(gateway: gateway)
    controller.activate(context)
    let mutation = GitOperationRequest.gitStageAll(
      .init(projectLocation: context.lease.location)
    )

    await controller.submit(mutation)

    let requests = await gateway.requests
    XCTAssertEqual(requests.first, mutation)
    XCTAssertEqual(requests.filter { $0.procedure == .gitStageAll }.count, 1)
    XCTAssertEqual(
      requests.map(\.procedure),
      [
        .gitStageAll, .gitListBranches, .gitListWorktrees, .gitWorktreeStatusBatch,
      ])
    XCTAssertEqual(controller.state.authoritative.branches, branches)
    XCTAssertEqual(controller.state.authoritative.worktrees, [])
    XCTAssertFalse(controller.state.requiresAuthoritativeRefresh)
  }

  @MainActor
  func testBackgroundCancellationSuppressesLateMutationResult() async {
    let context = makeGitOperationsContext()
    let gate = ControllerGitOperationsGate()
    let gateway = BlockingGitOperationsGateway(gate: gate)
    let controller = GitOperationsController(gateway: gateway)
    controller.activate(context)
    let task = Task {
      await controller.submit(
        .gitStageAll(.init(projectLocation: context.lease.location))
      )
    }
    await gate.waitUntilStarted()
    controller.enterBackground()
    await gate.succeed(.omitted)
    await task.value
    XCTAssertNil(controller.state.lastResult)
    XCTAssertNil(controller.state.activeMutation)
  }

  @MainActor
  func testProjectRelocationSuppressesStaleRead() async {
    let original = makeGitOperationsContext()
    let relocated = makeGitOperationsContext(
      location: GitOperationsSamples.windows,
      projectGeneration: 2
    )
    let gate = ControllerGitOperationsGate()
    let gateway = BlockingGitOperationsGateway(gate: gate)
    let controller = GitOperationsController(gateway: gateway)
    controller.activate(original)
    let task = Task {
      await controller.read(
        .gitListBranches(.init(projectLocation: original.lease.location))
      )
    }
    await gate.waitUntilStarted()
    controller.activate(relocated)
    await gate.succeed(.branches(.init(current: "old", branches: [])))
    await task.value
    XCTAssertNil(controller.state.authoritative.branches)
    XCTAssertEqual(controller.state.context?.lease, relocated.lease)
  }

  @MainActor
  func testHostSwitchSuppressesLateMutationResult() async {
    let original = makeGitOperationsContext()
    let replacement = makeGitOperationsContext(
      connectionID: ClientConnectionID(
        UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
      ),
      generation: 2
    )
    let gate = ControllerGitOperationsGate()
    let gateway = BlockingGitOperationsGateway(gate: gate)
    let controller = GitOperationsController(gateway: gateway)
    controller.activate(original)
    let task = Task {
      await controller.submit(
        .gitStageAll(.init(projectLocation: original.lease.location))
      )
    }
    await gate.waitUntilStarted()
    controller.activate(replacement)
    await gate.succeed(.omitted)
    await task.value
    XCTAssertNil(controller.state.lastResult)
    XCTAssertEqual(controller.state.completedMutationCount, 0)
    XCTAssertEqual(controller.state.context?.lease, replacement.lease)
  }
}

private actor QueuedGitOperationsGateway: GitOperationsGateway {
  enum Outcome: Sendable {
    case value(GitOperationResult)
    case failure(ProjectSessionGatewayError)
  }

  private var outcomes: [Outcome]
  private(set) var requests: [GitOperationRequest] = []

  init(outcomes: [Outcome]) { self.outcomes = outcomes }

  func call(
    _ request: GitOperationRequest,
    lease: ProjectWorkspaceLease
  ) async throws -> GitOperationResult {
    requests.append(request)
    guard !outcomes.isEmpty else { throw ProjectSessionGatewayError.transport(nil) }
    switch outcomes.removeFirst() {
    case .value(let value): return value
    case .failure(let error): throw error
    }
  }
}

private actor ControllerGitOperationsGate {
  private var started = false
  private var continuation: CheckedContinuation<GitOperationResult, any Error>?

  func wait() async throws -> GitOperationResult {
    started = true
    return try await withCheckedThrowingContinuation { continuation = $0 }
  }

  func waitUntilStarted() async {
    while !started { await Task.yield() }
  }

  func succeed(_ value: GitOperationResult) {
    continuation?.resume(returning: value)
    continuation = nil
  }
}

private struct BlockingGitOperationsGateway: GitOperationsGateway {
  let gate: ControllerGitOperationsGate
  func call(
    _ request: GitOperationRequest,
    lease: ProjectWorkspaceLease
  ) async throws -> GitOperationResult {
    try await gate.wait()
  }
}
