import Foundation
import XCTest

#if canImport(App)
  @testable import App
#else
  @testable import PortForwarding
#endif

@MainActor
final class SelectedPortForwardingGatewayTests: XCTestCase {
  func testEveryGuardRejectsBeforeTransport() async throws {
    let cases: [(PortForwardingHostAccess, PortForwardingFailure)] = [
      (PortForwardingTestValues.access(online: false), .unavailable(.offline)),
      (PortForwardingTestValues.access(ready: false), .unavailable(.notReady)),
      (PortForwardingTestValues.access(foreground: false), .unavailable(.background)),
      (PortForwardingTestValues.access(scopes: []), .missingScope),
      (
        PortForwardingHostAccess(
          lease: PortForwardingTestValues.lease(), protocolVersion: 2, isOnline: true,
          isReady: true, isForeground: true, capabilities: [.forward]),
        .protocolIncompatible
      ),
    ]
    for (access, expected) in cases {
      let api = PortForwardingRemoteAPISpy()
      let box = PortForwardingSelectionBox(.init(access: access, api: api))
      let gateway = SelectedPortForwardingGateway { box.selection }
      await assertFailure(expected) {
        _ = try await gateway.scan(lease: PortForwardingTestValues.lease())
      }
      let calls = await api.recordedCalls()
      XCTAssertTrue(calls.isEmpty)
    }
  }

  func testExactConnectionAndGenerationMismatchesCancel() async throws {
    let api = PortForwardingRemoteAPISpy()
    let requested = PortForwardingTestValues.lease()
    let otherConnection = PortForwardingHostLease(
      connectionID: ClientConnectionID(
        UUID(uuidString: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")!),
      connectionGeneration: requested.connectionGeneration)
    for lease in [otherConnection, PortForwardingTestValues.lease(generation: 8)] {
      let box = PortForwardingSelectionBox(
        .init(access: PortForwardingTestValues.access(lease: lease), api: api))
      let gateway = SelectedPortForwardingGateway { box.selection }
      do {
        _ = try await gateway.scan(lease: requested)
        XCTFail("Expected cancellation")
      } catch is CancellationError {
      } catch {
        XCTFail("Unexpected error: \(type(of: error))")
      }
    }
    let calls = await api.recordedCalls()
    XCTAssertTrue(calls.isEmpty)
  }

  func testHostRaceAfterAwaitCancelsCompletion() async throws {
    let api = PortForwardingRemoteAPISpy()
    await api.setOutcome(.blocked)
    let box = PortForwardingSelectionBox(
      .init(access: PortForwardingTestValues.access(), api: api))
    let gateway = SelectedPortForwardingGateway { box.selection }
    let task = Task { try await gateway.start(port: 3000, lease: PortForwardingTestValues.lease()) }
    while await api.recordedCalls().isEmpty { await Task.yield() }
    box.selection = .init(
      access: PortForwardingTestValues.access(lease: PortForwardingTestValues.lease(generation: 8)),
      api: api)
    await api.release()
    do {
      _ = try await task.value
      XCTFail("Expected cancellation")
    } catch is CancellationError {
    } catch {
      XCTFail("Unexpected error: \(type(of: error))")
    }
    let calls = await api.recordedCalls()
    XCTAssertEqual(calls, [.portForward])
  }

  func testBackgroundRaceAfterAwaitCancelsCompletion() async throws {
    let api = PortForwardingRemoteAPISpy()
    await api.setOutcome(.blocked)
    let box = PortForwardingSelectionBox(
      .init(access: PortForwardingTestValues.access(), api: api))
    let gateway = SelectedPortForwardingGateway { box.selection }
    let task = Task {
      try await gateway.open(
        forwardID: PortForwardingTestValues.forwardID, lease: PortForwardingTestValues.lease())
    }
    while await api.recordedCalls().isEmpty { await Task.yield() }
    box.selection = .init(
      access: PortForwardingTestValues.access(foreground: false), api: api)
    await api.release()
    do {
      try await task.value
      XCTFail("Expected background cancellation")
    } catch is CancellationError {
    } catch {
      XCTFail("Unexpected error: \(type(of: error))")
    }
  }

  func testMutationClassificationAndStructuredRejections() async throws {
    let api = PortForwardingRemoteAPISpy()
    let box = PortForwardingSelectionBox(
      .init(access: PortForwardingTestValues.access(), api: api))
    let gateway = SelectedPortForwardingGateway { box.selection }

    await api.setOutcome(.failure(.ambiguousMutation))
    await assertFailure(.ambiguousMutation) {
      _ = try await gateway.start(port: 3000, lease: PortForwardingTestValues.lease())
    }
    await api.setOutcome(.failure(.rejected(statusCode: 403, code: "missing_scope")))
    await assertFailure(.missingScope) {
      try await gateway.stop(
        forwardID: PortForwardingTestValues.forwardID,
        lease: PortForwardingTestValues.lease())
    }
  }

  private func assertFailure(
    _ expected: PortForwardingFailure,
    operation: () async throws -> Void
  ) async {
    do {
      try await operation()
      XCTFail("Expected \(expected)")
    } catch let failure as PortForwardingFailure {
      XCTAssertEqual(failure, expected)
    } catch {
      XCTFail("Unexpected error: \(type(of: error))")
    }
  }
}
