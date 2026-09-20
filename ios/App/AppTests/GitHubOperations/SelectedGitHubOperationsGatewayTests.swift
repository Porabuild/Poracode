import Foundation
import XCTest

#if canImport(App)
  @testable import App
#else
  @testable import GitHubOperations
#endif

@MainActor
final class SelectedGitHubOperationsGatewayTests: XCTestCase {
  func testSelectionEnforcesConnectionHostProjectLocationAndGeneration() async throws {
    let api = GitHubStubRemoteAPI()
    let selection = GitHubTransportSelection(
      context: GitHubOperationsSamples.context,
      api: api
    )
    let gateway = SelectedGitHubOperationsGateway { selection }
    let request = GitHubOperationRequest.ghListAccounts(
      .init(runtime: GitHubOperationsSamples.wsl)
    )
    _ = try await gateway.call(request, lease: GitHubOperationsSamples.lease)
    let initialCount = await api.count
    XCTAssertEqual(initialCount, 1)

    let stale = GitHubProjectLease(
      clientConnectionId: GitHubOperationsSamples.lease.clientConnectionId,
      desktopId: GitHubOperationsSamples.lease.desktopId,
      hostGeneration: GitHubOperationsSamples.lease.hostGeneration,
      project: GitHubOperationsSamples.lease.project,
      projectGeneration: 6
    )
    do {
      _ = try await gateway.call(request, lease: stale)
      XCTFail("Expected stale selection cancellation")
    } catch is CancellationError {
    } catch {
      XCTFail("Unexpected error type")
    }
    let finalCount = await api.count
    XCTAssertEqual(finalCount, 1)
  }

  func testRuntimeAndProjectOwnersCannotBeSubstituted() async {
    let api = GitHubStubRemoteAPI()
    let gateway = SelectedGitHubOperationsGateway {
      .init(context: GitHubOperationsSamples.context, api: api)
    }
    let wrongLocation = GitHubProjectLocation.posix(path: "/other", remoteServerId: nil)
    do {
      _ = try await gateway.call(
        .ghListRepos(
          .init(runtime: wrongLocation, account: .init(host: "github.com", login: "dev"))
        ),
        lease: GitHubOperationsSamples.lease
      )
      XCTFail("Expected owner rejection")
    } catch let failure as GitHubOperationsFailure {
      XCTAssertEqual(failure, .invalidResponse)
    } catch {
      XCTFail("Unexpected error type")
    }
    let count = await api.count
    XCTAssertEqual(count, 0)
  }

  func testPostflightHostLeaseChangeSuppressesDeliveredResult() async {
    let box = GitHubSelectionBox()
    let api = GitHubSwitchingRemoteAPI {
      let changedLease = GitHubProjectLease(
        clientConnectionId: GitHubOperationsSamples.lease.clientConnectionId,
        desktopId: "desktop-2",
        hostGeneration: GitHubOperationsSamples.lease.hostGeneration,
        project: GitHubOperationsSamples.lease.project,
        projectGeneration: GitHubOperationsSamples.lease.projectGeneration
      )
      box.selection = .init(
        context: .init(lease: changedLease, grantedScopes: ["session:read"]),
        api: GitHubStubRemoteAPI()
      )
    }
    box.selection = .init(context: GitHubOperationsSamples.context, api: api)
    let gateway = SelectedGitHubOperationsGateway { box.selection }

    do {
      _ = try await gateway.call(
        .ghListWorkflows(.init(projectLocation: GitHubOperationsSamples.wsl)),
        lease: GitHubOperationsSamples.lease
      )
      XCTFail("Expected stale host suppression")
    } catch is CancellationError {
    } catch {
      XCTFail("Unexpected error type")
    }
  }
}

private actor GitHubStubRemoteAPI: GitHubOperationsRemoteAPI {
  private(set) var count = 0

  func remoteGitHubOperation(
    _ request: GitHubOperationRequest
  ) -> GitHubOperationResult {
    count += 1
    return GitHubOperationsSamples.result(request.procedure)
  }
}

@MainActor
private final class GitHubSelectionBox {
  var selection: GitHubTransportSelection?
}

private actor GitHubSwitchingRemoteAPI: GitHubOperationsRemoteAPI {
  let switchSelection: @MainActor @Sendable () -> Void

  init(switchSelection: @escaping @MainActor @Sendable () -> Void) {
    self.switchSelection = switchSelection
  }

  func remoteGitHubOperation(
    _ request: GitHubOperationRequest
  ) async -> GitHubOperationResult {
    await switchSelection()
    return GitHubOperationsSamples.result(request.procedure)
  }
}
