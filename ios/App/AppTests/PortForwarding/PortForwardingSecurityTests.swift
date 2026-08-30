import Foundation
import XCTest

#if canImport(App)
  @testable import App
#else
  @testable import PortForwarding
#endif

@MainActor
final class PortForwardingSecurityTests: XCTestCase {
  func testEntrySecretExistsOnlyInBrowserCallbackNotReturnedDomainState() async throws {
    let http = PortForwardingHTTPSpy(
      endpoint: "https://relay.example/s/host",
      responses: [.portEnter: try PortForwardingTestValues.fixture("port-enter")])
    let recorder = SecretBrowserRecorder()
    let api = GeneratedPortForwardingRemoteAPI(
      http: http,
      browser: PortForwardingBrowserOpener { url in recorder.record(url) })
    try await api.remoteOpen(forwardID: PortForwardingTestValues.forwardID)

    let opened = try XCTUnwrap(recorder.url)
    XCTAssertTrue(opened.absoluteString.contains(PortForwardingTestValues.token))
    XCTAssertFalse(String(reflecting: api).contains(PortForwardingTestValues.token))
    XCTAssertFalse(
      String(reflecting: PortForwardingTestValues.snapshot).contains(
        PortForwardingTestValues.token))
    let calls = await http.calls()
    XCTAssertEqual(calls, [.portEnter])
  }

  func testMaliciousEntryNeverReachesBrowserCallback() async throws {
    let body = Data(
      #"{"enterPath":"https://evil.example/forward/22222222-2222-4222-8222-222222222222/enter?fwt=BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"}"#
        .utf8)
    let http = PortForwardingHTTPSpy(
      endpoint: "https://relay.example/s/host", responses: [.portEnter: body])
    let recorder = SecretBrowserRecorder()
    let api = GeneratedPortForwardingRemoteAPI(
      http: http,
      browser: PortForwardingBrowserOpener { url in recorder.record(url) })
    do {
      try await api.remoteOpen(forwardID: PortForwardingTestValues.forwardID)
      XCTFail("Expected unsafe entry")
    } catch let error as PortForwardingTransportError {
      XCTAssertEqual(error, .unsafeEntry)
    }
    XCTAssertNil(recorder.url)
  }

  func testExactHostCredentialSourceRechecksGenerationAfterCredentialAwait() async throws {
    let repository = BlockingCredentialRepository()
    let box = PortForwardingSelectionBox(nil)
    box.selection = .init(
      access: PortForwardingTestValues.access(), api: PortForwardingRemoteAPISpy())
    let source = PortForwardingExactHostTransportSource(
      credentials: repository,
      accessProvider: { box.selection?.access },
      makeAPI: { _, _ in PortForwardingRemoteAPISpy() })
    let task = Task { try await source.selection(for: PortForwardingTestValues.lease()) }
    while !(await repository.isWaiting()) { await Task.yield() }
    box.selection = .init(
      access: PortForwardingTestValues.access(
        lease: PortForwardingTestValues.lease(generation: 8)),
      api: PortForwardingRemoteAPISpy())
    await repository.release()
    do {
      _ = try await task.value
      XCTFail("Expected stale generation cancellation")
    } catch is CancellationError {
    } catch {
      XCTFail("Unexpected error: \(type(of: error))")
    }
  }
}

@MainActor
private final class SecretBrowserRecorder: Sendable {
  private(set) var url: URL?
  func record(_ value: URL) -> Bool {
    url = value
    return true
  }
}

private actor PortForwardingHTTPSpy: PortForwardingHTTPExecuting {
  nonisolated let endpoint: String
  private let responses: [PortForwardingRoute: Data]
  private var routes: [PortForwardingRoute] = []

  init(endpoint: String, responses: [PortForwardingRoute: Data]) {
    self.endpoint = endpoint
    self.responses = responses
  }

  func execute(_ request: PortForwardingHTTPRequest) async throws -> Data {
    routes.append(request.route)
    guard let response = responses[request.route] else {
      throw PortForwardingHTTPError.transport
    }
    return response
  }

  func calls() -> [PortForwardingRoute] { routes }
}

private actor BlockingCredentialRepository: PortForwardingCredentialRepository {
  private var continuation: CheckedContinuation<Void, Never>?
  private var waiting = false

  func portForwardingCredentials(for connectionID: ClientConnectionID) async throws
    -> PortForwardingHostCredentials?
  {
    waiting = true
    await withCheckedContinuation { continuation = $0 }
    return PortForwardingHostCredentials(
      connectionID: connectionID,
      endpoint: "https://relay.example/s/host",
      token: "access",
      protocolVersion: 8,
      scopes: ["ports:forward"])
  }

  func isWaiting() -> Bool { waiting }
  func release() {
    continuation?.resume()
    continuation = nil
  }
}
