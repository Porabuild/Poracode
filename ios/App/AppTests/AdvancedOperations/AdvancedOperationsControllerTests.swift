import Foundation
import XCTest

#if canImport(App)
  @testable import App
#else
  @testable import AdvancedOperations
#endif

@MainActor
final class AdvancedOperationsControllerTests: XCTestCase {
  func testPerformProjectsStableSuccessIntoControllerState() async throws {
    let fixture = try AdvancedOperationFixtures.fixture(.generateTitle)
    let request = try AdvancedOperationFixtures.request(for: fixture)
    let lease = AdvancedOperationFixtures.lease(owner: request.owner)
    let expected = AdvancedOperationResult.generatedTitle(
      AdvancedGeneratedTitle(title: "Stable title")
    )
    let gateway = AdvancedOperationsGatewayStub(result: .success(expected))
    let controller = AdvancedOperationsController(gateway: gateway)

    let result = try await controller.perform(request, lease: lease)

    XCTAssertEqual(result, expected)
    XCTAssertEqual(controller.state, .succeeded(.generateTitle, expected))
  }

  func testPerformProjectsStructuredFailureIntoControllerState() async throws {
    let fixture = try AdvancedOperationFixtures.fixture(.readExternalFile)
    let request = try AdvancedOperationFixtures.request(for: fixture)
    let lease = AdvancedOperationFixtures.lease(owner: request.owner)
    let gateway = AdvancedOperationsGatewayStub(
      result: .failure(.missingScope(.projectsManage))
    )
    let controller = AdvancedOperationsController(gateway: gateway)

    do {
      _ = try await controller.perform(request, lease: lease)
      XCTFail("Expected failure")
    } catch let failure as AdvancedOperationFailure {
      XCTAssertEqual(failure, .missingScope(.projectsManage))
    }
    XCTAssertEqual(
      controller.state,
      .failed(.readExternalFile, .missingScope(.projectsManage))
    )
  }
}

private actor AdvancedOperationsGatewayStub: AdvancedOperationsGateway {
  let result: Result<AdvancedOperationResult, AdvancedOperationFailure>

  init(result: Result<AdvancedOperationResult, AdvancedOperationFailure>) {
    self.result = result
  }

  func call(
    _ request: AdvancedOperationRequest,
    lease: AdvancedOperationLease
  ) async throws -> AdvancedOperationResult {
    try result.get()
  }
}
