import Foundation
import XCTest

#if canImport(App)
  @testable import App
#else
  @testable import GitHubOperations
#endif

@MainActor
final class GitHubOperationsControllerTests: XCTestCase {
  func testPullRequestReadsAreLatestWinsAndCancellable() async {
    let recorder = GitHubCallRecorder()
    let gateway = GitHubStubGateway { request, _ in
      await recorder.append(request)
      let number = request.pullRequestNumber ?? 0
      if number == 1 { try await Task.sleep(for: .milliseconds(200)) }
      return GitHubOperationsSamples.result(
        .ghGetPrDetails,
        object: ["marker": .integer(number)]
      )
    }
    let controller = GitHubPullRequestController(gateway: gateway)
    controller.activate(GitHubOperationsSamples.context)

    let first = Task {
      await controller.load(
        .ghGetPrDetails(.init(projectLocation: GitHubOperationsSamples.wsl, prNumber: 1))
      )
    }
    await recorder.wait(untilCount: 1)
    await controller.load(
      .ghGetPrDetails(.init(projectLocation: GitHubOperationsSamples.wsl, prNumber: 2))
    )
    await first.value

    XCTAssertEqual(controller.documents[.ghGetPrDetails]?["marker"]?.integerValue, 2)
    XCTAssertEqual(controller.loadState, .loaded)
  }

  func testProjectGenerationChangeSuppressesStaleRead() async {
    let gateway = GitHubStubGateway { _, _ in
      try? await Task.sleep(for: .milliseconds(80))
      return GitHubOperationsSamples.result(
        .ghGetPrDetails,
        object: ["marker": .integer(1)]
      )
    }
    let controller = GitHubPullRequestController(gateway: gateway)
    controller.activate(GitHubOperationsSamples.context)
    let task = Task {
      await controller.load(
        .ghGetPrDetails(.init(projectLocation: GitHubOperationsSamples.wsl, prNumber: 1))
      )
    }
    await Task.yield()
    let changed = GitHubProjectLease(
      clientConnectionId: GitHubOperationsSamples.lease.clientConnectionId,
      desktopId: GitHubOperationsSamples.lease.desktopId,
      hostGeneration: GitHubOperationsSamples.lease.hostGeneration,
      project: GitHubOperationsSamples.lease.project,
      projectGeneration: 8
    )
    controller.activate(.init(lease: changed, grantedScopes: ["session:read"]))
    await task.value
    XCTAssertTrue(controller.documents.isEmpty)
  }

  func testPullRequestAmbiguityDeliversOnceAndReconcilesOnce() async {
    let recorder = GitHubCallRecorder()
    let gateway = GitHubStubGateway { request, _ in
      await recorder.append(request)
      if request.procedure == .ghUpdatePrBranch {
        throw GitHubOperationsFailure.ambiguousOutcome
      }
      return GitHubOperationsSamples.result(.ghGetPrDetails)
    }
    let controller = GitHubPullRequestMutationController(gateway: gateway)
    controller.activate(GitHubOperationsSamples.context)
    await controller.submit(
      .ghUpdatePrBranch(
        .init(projectLocation: GitHubOperationsSamples.wsl, prNumber: 42, rebase: true)
      )
    )

    let callCount = await recorder.count
    XCTAssertEqual(callCount, 2)
    let requests = await recorder.requests
    XCTAssertEqual(requests.map(\.procedure), [.ghUpdatePrBranch, .ghGetPrDetails])
    XCTAssertEqual(controller.state.reconciliationCount, 1)
    XCTAssertFalse(controller.state.requiresAuthoritativeRefresh)
  }

  func testDestructiveConfirmationCapturesExactRequestAndLease() async {
    let recorder = GitHubCallRecorder()
    let gateway = GitHubStubGateway { request, _ in
      await recorder.append(request)
      return .omitted(procedure: request.procedure)
    }
    let controller = GitHubPullRequestMutationController(gateway: gateway)
    controller.activate(GitHubOperationsSamples.context)
    let request = GitHubOperationRequest.ghClosePr(
      .init(projectLocation: GitHubOperationsSamples.wsl, prNumber: 42)
    )
    await controller.submit(request)

    let pending = try! XCTUnwrap(controller.state.pendingConfirmation)
    XCTAssertEqual(pending.request, request)
    XCTAssertEqual(pending.capture.lease, GitHubOperationsSamples.lease)
    let countBeforeConfirmation = await recorder.count
    XCTAssertEqual(countBeforeConfirmation, 0)

    await controller.confirmPendingMutation()
    let countAfterConfirmation = await recorder.count
    XCTAssertEqual(countAfterConfirmation, 1)
    XCTAssertNil(controller.state.pendingConfirmation)
    XCTAssertEqual(controller.state.lastResult, .omitted(procedure: .ghClosePr))
  }

  func testWorkflowAmbiguityUsesOneRelevantRunRead() async {
    let recorder = GitHubCallRecorder()
    let gateway = GitHubStubGateway { request, _ in
      await recorder.append(request)
      if request.procedure == .ghRerunWorkflowRun {
        throw GitHubOperationsFailure.ambiguousOutcome
      }
      return GitHubOperationsSamples.result(.ghGetWorkflowRun)
    }
    let controller = GitHubWorkflowMutationController(gateway: gateway)
    controller.activate(GitHubOperationsSamples.context)
    await controller.submit(
      .ghRerunWorkflowRun(
        .init(projectLocation: GitHubOperationsSamples.wsl, runId: 22, failedOnly: true)
      )
    )
    let workflowRequests = await recorder.requests
    XCTAssertEqual(
      workflowRequests.map(\.procedure),
      [
        .ghRerunWorkflowRun, .ghGetWorkflowRun,
      ])
    XCTAssertEqual(controller.state.reconciliationCount, 1)
  }

  func testBackgroundCancelsOwnedWorkAndClearsConfirmation() async {
    let gateway = GitHubStubGateway { request, _ in
      try await Task.sleep(for: .seconds(1))
      return GitHubOperationsSamples.result(request.procedure)
    }
    let controller = GitHubWorkflowMutationController(gateway: gateway)
    controller.activate(GitHubOperationsSamples.context)
    await controller.submit(
      .ghDeleteWorkflowRun(
        .init(projectLocation: GitHubOperationsSamples.wsl, runId: 22)
      )
    )
    XCTAssertNotNil(controller.state.pendingConfirmation)
    controller.enterBackground()
    XCTAssertNil(controller.state.pendingConfirmation)
    XCTAssertNil(controller.state.activeMutation)
  }
}
