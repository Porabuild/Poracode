import Foundation
import XCTest

#if canImport(App)
  @testable import App
#else
  @testable import AdvancedOperations
#endif

@MainActor
final class SelectedAdvancedOperationsGatewayTests: XCTestCase {
  func testExactLeaseAndScopePermitCall() async throws {
    let fixture = try AdvancedOperationFixtures.fixture(.readAbsoluteFile)
    let request = try AdvancedOperationFixtures.request(for: fixture)
    let lease = AdvancedOperationFixtures.lease(owner: request.owner)
    let api = AdvancedOperationsAPISpy(
      result: .success(
        .readAbsoluteFile(
          AdvancedAbsoluteFileResult(
            status: .ready,
            content: "ok",
            modifiedAtMs: 1
          )))
    )
    let box = selectionBox(lease: lease, scope: .projectsManage, api: api)
    let gateway = SelectedAdvancedOperationsGateway { box.selection }

    _ = try await gateway.call(request, lease: lease)

    let callCount = await api.calls()
    XCTAssertEqual(callCount, 1)
  }

  func testOwnerMismatchIsRejectedBeforeTransport() async throws {
    let fixture = try AdvancedOperationFixtures.fixture(.readAbsoluteFile)
    let request = try AdvancedOperationFixtures.request(for: fixture)
    let lease = AdvancedOperationFixtures.lease(
      owner: .projectLocation(.posix(path: "/different"))
    )
    let api = AdvancedOperationsAPISpy(result: .success(.omitted))
    let box = selectionBox(lease: lease, scope: .projectsManage, api: api)
    let gateway = SelectedAdvancedOperationsGateway { box.selection }

    do {
      _ = try await gateway.call(request, lease: lease)
      XCTFail("Expected invalid request")
    } catch let failure as AdvancedOperationFailure {
      XCTAssertEqual(failure, .invalidRequest)
    }
    let callCount = await api.calls()
    XCTAssertEqual(callCount, 0)
  }

  func testMissingExactScopeIsRejectedBeforeTransport() async throws {
    let fixture = try AdvancedOperationFixtures.fixture(.createProjectEntry)
    let request = try AdvancedOperationFixtures.request(for: fixture)
    let lease = AdvancedOperationFixtures.lease(owner: request.owner)
    let api = AdvancedOperationsAPISpy(result: .success(.omitted))
    let box = selectionBox(lease: lease, scope: .sessionRead, api: api)
    let gateway = SelectedAdvancedOperationsGateway { box.selection }

    do {
      _ = try await gateway.call(request, lease: lease)
      XCTFail("Expected missing scope")
    } catch let failure as AdvancedOperationFailure {
      XCTAssertEqual(failure, .missingScope(.sessionOperate))
    }
    let callCount = await api.calls()
    XCTAssertEqual(callCount, 0)
  }

  func testGenerationChangeAfterAwaitCancelsStaleCompletion() async throws {
    let fixture = try AdvancedOperationFixtures.fixture(.readAbsoluteFile)
    let request = try AdvancedOperationFixtures.request(for: fixture)
    let lease = AdvancedOperationFixtures.lease(owner: request.owner)
    let api = AdvancedOperationsAPISpy(
      result: .success(
        .readAbsoluteFile(
          AdvancedAbsoluteFileResult(
            status: .ready,
            content: "ok",
            modifiedAtMs: 1
          )))
    )
    let box = selectionBox(lease: lease, scope: .projectsManage, api: api)
    let gateway = SelectedAdvancedOperationsGateway {
      defer {
        if box.selection?.access.lease == lease {
          let replacement = AdvancedOperationFixtures.lease(
            owner: request.owner,
            sessionGeneration: lease.sessionGeneration + 1
          )
          box.selection = self.selection(
            lease: replacement,
            scope: .projectsManage,
            api: api
          )
        }
      }
      return box.selection
    }

    do {
      _ = try await gateway.call(request, lease: lease)
      XCTFail("Expected stale completion cancellation")
    } catch is CancellationError {
      let callCount = await api.calls()
      XCTAssertEqual(callCount, 1)
    }
  }

  func testUnsafeRemoteErrorCodeIsDiscarded() async throws {
    let fixture = try AdvancedOperationFixtures.fixture(.readAbsoluteFile)
    let request = try AdvancedOperationFixtures.request(for: fixture)
    let lease = AdvancedOperationFixtures.lease(owner: request.owner)
    let api = AdvancedOperationsAPISpy(
      result: .failure(.rejected(statusCode: 400, code: "secret=value"))
    )
    let box = selectionBox(lease: lease, scope: .projectsManage, api: api)
    let gateway = SelectedAdvancedOperationsGateway { box.selection }

    do {
      _ = try await gateway.call(request, lease: lease)
      XCTFail("Expected rejection")
    } catch let failure as AdvancedOperationFailure {
      XCTAssertEqual(failure, .rejected(statusCode: 400, code: nil))
    }
  }

  private func selectionBox(
    lease: AdvancedOperationLease,
    scope: AdvancedOperationScope,
    api: any AdvancedOperationsRemoteAPI
  ) -> AdvancedOperationsSelectionBox {
    AdvancedOperationsSelectionBox(selection: selection(lease: lease, scope: scope, api: api))
  }

  private func selection(
    lease: AdvancedOperationLease,
    scope: AdvancedOperationScope,
    api: any AdvancedOperationsRemoteAPI
  ) -> AdvancedOperationsTransportSelection {
    AdvancedOperationsTransportSelection(
      access: AdvancedOperationSessionAccess(
        lease: lease,
        isOnline: true,
        isReady: true,
        isForeground: true,
        scopes: [scope]
      ),
      api: api
    )
  }
}
