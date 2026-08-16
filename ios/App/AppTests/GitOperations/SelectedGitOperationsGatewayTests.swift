import XCTest

@testable import App

final class SelectedGitOperationsGatewayTests: XCTestCase {
  @MainActor
  func testExactLeaseAndScopeAreCheckedBeforeAndAfterAwait() async throws {
    let context = makeGitOperationsContext()
    let gate = GitOperationsGate()
    let api = GatedGitOperationsAPI(gate: gate)
    let box = GitOperationsSelectionBox(
      selection: .init(context: context, api: api)
    )
    let gateway = SelectedGitOperationsGateway { @MainActor in box.selection }
    let task = Task {
      try await gateway.call(
        .gitListBranches(.init(projectLocation: context.lease.location)),
        lease: context.lease
      )
    }
    await gate.waitUntilStarted()
    box.selection = .init(
      context: makeGitOperationsContext(projectGeneration: 2),
      api: api
    )
    await gate.succeed(.branches(.init(current: "main", branches: [])))
    do {
      _ = try await task.value
      XCTFail("Expected stale completion cancellation")
    } catch is CancellationError {
    }
  }

  @MainActor
  func testOwnerLocationMismatchNeverReachesTransport() async {
    let context = makeGitOperationsContext()
    let api = CountingGitOperationsAPI()
    let box = GitOperationsSelectionBox(
      selection: .init(context: context, api: api)
    )
    let gateway = SelectedGitOperationsGateway { @MainActor in box.selection }
    do {
      _ = try await gateway.call(
        .gitStageAll(.init(projectLocation: GitOperationsSamples.windows)),
        lease: context.lease
      )
      XCTFail("Expected ownership rejection")
    } catch ProjectSessionGatewayError.invalidResponse {
      let count = await api.count
      XCTAssertEqual(count, 0)
    } catch {
      XCTFail("Unexpected error: \(error)")
    }
  }

  @MainActor
  func testOperateScopeIsRequiredForMutations() async {
    let context = makeGitOperationsContext(capabilities: [.sessionRead])
    let api = CountingGitOperationsAPI()
    let box = GitOperationsSelectionBox(
      selection: .init(context: context, api: api)
    )
    let gateway = SelectedGitOperationsGateway { @MainActor in box.selection }
    do {
      _ = try await gateway.call(
        .gitStageAll(.init(projectLocation: context.lease.location)),
        lease: context.lease
      )
      XCTFail("Expected missing scope")
    } catch let error as ProjectSessionGatewayError {
      XCTAssertEqual(
        error,
        .http(statusCode: 403, code: "missing_scope", missingScope: "session:operate")
      )
      let count = await api.count
      XCTAssertEqual(count, 0)
    } catch {
      XCTFail("Unexpected error: \(error)")
    }
  }

  @MainActor
  func testForegroundOrScopeChangeCancelsCompletionAtSameLease() async {
    let context = makeGitOperationsContext()
    let gate = GitOperationsGate()
    let api = GatedGitOperationsAPI(gate: gate)
    let box = GitOperationsSelectionBox(selection: .init(context: context, api: api))
    let gateway = SelectedGitOperationsGateway { @MainActor in box.selection }
    let task = Task {
      try await gateway.call(
        .gitListBranches(.init(projectLocation: context.lease.location)),
        lease: context.lease
      )
    }
    await gate.waitUntilStarted()
    box.selection = .init(
      context: ProjectWorkspaceContext(
        session: ProjectControllerSession(
          lease: context.session.lease,
          isOnline: false,
          isReady: false,
          capabilities: [.sessionRead]
        ),
        lease: context.lease
      ),
      api: api
    )
    await gate.succeed(.branches(.init(current: "main", branches: [])))
    do {
      _ = try await task.value
      XCTFail("Expected foreground/access cancellation")
    } catch is CancellationError {
    } catch {
      XCTFail("Unexpected error: \(error)")
    }
  }
}

@MainActor
private final class GitOperationsSelectionBox {
  var selection: GitOperationsTransportSelection?
  init(selection: GitOperationsTransportSelection?) { self.selection = selection }
}

private actor GitOperationsGate {
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

private struct GatedGitOperationsAPI: GitOperationsRemoteAPI {
  let gate: GitOperationsGate
  func remoteGitOperation(_ request: GitOperationRequest) async throws -> GitOperationResult {
    try await gate.wait()
  }
}

private actor CountingGitOperationsAPI: GitOperationsRemoteAPI {
  private(set) var count = 0
  func remoteGitOperation(_ request: GitOperationRequest) async throws -> GitOperationResult {
    count += 1
    return .omitted
  }
}
