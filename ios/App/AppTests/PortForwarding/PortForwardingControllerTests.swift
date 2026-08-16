import Foundation
import XCTest

#if canImport(App)
  @testable import App
#else
  @testable import PortForwarding
#endif

@MainActor
final class PortForwardingControllerTests: XCTestCase {
  func testScanStartOpenStopStateFlow() async throws {
    let gateway = PortForwardingGatewaySpy()
    let controller = PortForwardingController(
      lease: PortForwardingTestValues.lease(), gateway: gateway)
    await controller.scan()
    XCTAssertEqual(controller.loadState, .ready)
    XCTAssertEqual(controller.snapshot, PortForwardingTestValues.snapshot)

    await controller.start(port: 3000)
    XCTAssertEqual(controller.snapshot.forwards.map(\.targetPort), [3000, 5173])
    XCTAssertEqual(controller.operation, .none)

    await controller.open(forwardID: PortForwardingTestValues.forwardID)
    XCTAssertEqual(controller.operation, .none)

    await controller.stop(forwardID: PortForwardingTestValues.forwardID)
    XCTAssertEqual(controller.snapshot.forwards.map(\.targetPort), [5173])
    let calls = await gateway.calls
    // Starting a forward opens it immediately, so portEnter runs twice: once
    // for the auto-open, once for the explicit open in this flow.
    XCTAssertEqual(calls, [.portsRead, .portForward, .portEnter, .portEnter, .portUnforward])
  }

  func testAmbiguousMutationIsVisibleWithoutOptimisticStateChange() async throws {
    let gateway = PortForwardingGatewaySpy()
    let controller = PortForwardingController(
      lease: PortForwardingTestValues.lease(), gateway: gateway)
    await controller.scan()
    let before = controller.snapshot
    await gateway.setFailure(.ambiguousMutation)
    await controller.start(port: 3000)
    XCTAssertEqual(controller.snapshot, before)
    XCTAssertEqual(controller.loadState, .failed(.ambiguousMutation))
    XCTAssertEqual(controller.operation, .none)
  }

  func testRebindClearsHostOwnedState() async throws {
    let controller = PortForwardingController(
      lease: PortForwardingTestValues.lease(), gateway: PortForwardingGatewaySpy())
    await controller.scan()
    controller.rebind(to: PortForwardingTestValues.lease(generation: 8))
    XCTAssertEqual(controller.snapshot, .empty)
    XCTAssertEqual(controller.loadState, .idle)
    XCTAssertEqual(controller.operation, .none)
  }

  func testViewProjectionGatesForwardedPortAndExposesAccessibleValues() async throws {
    let controller = PortForwardingController(
      lease: PortForwardingTestValues.lease(), gateway: PortForwardingGatewaySpy())
    await controller.scan()
    let projection = PortForwardingViewProjection(controller: controller)
    XCTAssertEqual(projection.detected.count, 2)
    XCTAssertFalse(try XCTUnwrap(projection.detected.first { $0.id == 5173 }).canStart)
    XCTAssertTrue(try XCTUnwrap(projection.detected.first { $0.id == 3000 }).canStart)
    XCTAssertEqual(projection.active.count, 1)
    XCTAssertFalse(projection.active[0].title.isEmpty)
    XCTAssertFalse(projection.active[0].value.isEmpty)
  }
}
