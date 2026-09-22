import Foundation
import XCTest

#if canImport(App)
  @testable import App
#else
  @testable import PortForwarding
#endif

#if canImport(FoundationNetworking)
  import FoundationNetworking
#endif

@MainActor
final class PortForwardingHTTPTests: XCTestCase {
  override func setUp() {
    super.setUp()
    PortForwardingURLProtocol.reset()
  }

  override func tearDown() {
    #if !canImport(App)
    TlsCertPinStore.setLastDecisionMismatchedForTests(false)
    #endif
    super.tearDown()
  }

  func testAllFiveRoutesAreReachableWithExactMethodPathStatusAndAuth() async throws {
    PortForwardingURLProtocol.handler = { request in
      let path = request.url?.path ?? ""
      let fixture: String
      switch path {
      case "/relay/host/api/ports": fixture = "ports-read"
      case "/relay/host/api/ports/forward": fixture = "port-forward"
      case "/relay/host/api/ports/enter": fixture = "port-enter"
      case "/relay/host/api/ports/unforward": fixture = "port-unforward"
      default: throw URLError(.badURL)
      }
      return (200, try PortForwardingTestValues.fixture(fixture), [:])
    }
    let browser = PortForwardingBrowserRecorder()
    let api = try makeAPI(browser: browser)

    _ = try await api.remoteScan()
    _ = try await api.remoteStart(port: 3000)
    try await api.remoteOpen(forwardID: PortForwardingTestValues.forwardID)
    try await api.remoteStop(forwardID: PortForwardingTestValues.forwardID)

    let requests = PortForwardingURLProtocol.requests
    XCTAssertEqual(requests.map(\.httpMethod), ["GET", "POST", "POST", "POST"])
    XCTAssertEqual(
      requests.compactMap { $0.url?.path },
      [
        "/relay/host/api/ports",
        "/relay/host/api/ports/forward",
        "/relay/host/api/ports/enter",
        "/relay/host/api/ports/unforward",
      ])
    XCTAssertTrue(
      requests.allSatisfy { $0.value(forHTTPHeaderField: "Authorization") == "Bearer access" })
    XCTAssertNil(requests[0].httpBody)
    XCTAssertEqual(
      requests.dropFirst().map { $0.value(forHTTPHeaderField: "Content-Type") },
      ["application/json", "application/json", "application/json"])

    let opened = try XCTUnwrap(browser.openedURL())
    XCTAssertEqual(opened.path, "/relay/host/forward/\(PortForwardingTestValues.forwardID)/enter")
    XCTAssertEqual(URLComponents(url: opened, resolvingAgainstBaseURL: false)?.queryItems?.count, 1)
    XCTAssertEqual(PortForwardingRoute.allCases.count, requests.count + 1)
  }

  func testMutationTransportFailureIsAmbiguousAndDeliveredOnce() async throws {
    PortForwardingURLProtocol.handler = { _ in throw URLError(.networkConnectionLost) }
    let api = try makeAPI(browser: PortForwardingBrowserRecorder())
    do {
      _ = try await api.remoteStart(port: 5173)
      XCTFail("Expected ambiguous mutation")
    } catch let error as PortForwardingTransportError {
      XCTAssertEqual(error, .ambiguousMutation)
    }
    XCTAssertEqual(PortForwardingURLProtocol.requests.count, 1)
    XCTAssertEqual(PortForwardingURLSessionHTTPClient.maximumAttempts, 1)
  }

  func testEnterBrowserUnavailable503IsDefiniteAndNeverOpensTheBrowser() async throws {
    PortForwardingURLProtocol.handler = { request in
      guard request.url?.path == "/relay/host/api/ports/enter" else {
        throw URLError(.badURL)
      }
      let body = #"{"error":{"code":"forward_browser_unavailable","message":"no"}}"#
      return (503, Data(body.utf8), [:])
    }
    let browser = PortForwardingBrowserRecorder()
    let api = try makeAPI(browser: browser)
    do {
      _ = try await api.remoteEntryURL(forwardID: PortForwardingTestValues.forwardID)
      XCTFail("Expected the definite forwarding rejection")
    } catch let error as PortForwardingTransportError {
      // The parsed 503 carries its definitive code: a configuration failure,
      // never the ambiguous-mutation path.
      XCTAssertEqual(error, .rejected(statusCode: 503, code: "forward_browser_unavailable"))
    }
    XCTAssertEqual(PortForwardingURLProtocol.requests.count, 1)
    XCTAssertNil(browser.openedURL())
  }

  func testEnterForwardingUnavailableIsDefiniteThroughOpen() async throws {
    PortForwardingURLProtocol.handler = { request in
      guard request.url?.path == "/relay/host/api/ports/enter" else {
        throw URLError(.badURL)
      }
      let body = #"{"error":{"code":"forward_browser_unavailable","message":"no"}}"#
      return (503, Data(body.utf8), [:])
    }
    let browser = PortForwardingBrowserRecorder()
    let api = try makeAPI(browser: browser)
    do {
      try await api.remoteOpen(forwardID: PortForwardingTestValues.forwardID)
      XCTFail("Expected the definite forwarding rejection")
    } catch let error as PortForwardingTransportError {
      XCTAssertEqual(error, .rejected(statusCode: 503, code: "forward_browser_unavailable"))
    }
    XCTAssertNil(browser.openedURL())
  }

  func testEnterOther503StaysAmbiguous() async throws {
    PortForwardingURLProtocol.handler = { request in
      guard request.url?.path == "/relay/host/api/ports/enter" else {
        throw URLError(.badURL)
      }
      let body = #"{"error":{"code":"ports_unavailable","message":"no"}}"#
      return (503, Data(body.utf8), [:])
    }
    let api = try makeAPI(browser: PortForwardingBrowserRecorder())
    do {
      _ = try await api.remoteEntryURL(forwardID: PortForwardingTestValues.forwardID)
      XCTFail("Expected ambiguous mutation")
    } catch let error as PortForwardingTransportError {
      XCTAssertEqual(error, .ambiguousMutation)
    }
  }

  func testEnter500WithoutRecognizableCodeStaysAmbiguous() async throws {
    PortForwardingURLProtocol.handler = { request in
      guard request.url?.path == "/relay/host/api/ports/enter" else {
        throw URLError(.badURL)
      }
      return (500, Data("{}".utf8), [:])
    }
    let api = try makeAPI(browser: PortForwardingBrowserRecorder())
    do {
      _ = try await api.remoteEntryURL(forwardID: PortForwardingTestValues.forwardID)
      XCTFail("Expected ambiguous mutation")
    } catch let error as PortForwardingTransportError {
      XCTAssertEqual(error, .ambiguousMutation)
    }
  }

  func testReadTransportFailureIsNotAmbiguous() async throws {
    PortForwardingURLProtocol.handler = { _ in throw URLError(.notConnectedToInternet) }
    let api = try makeAPI(browser: PortForwardingBrowserRecorder())
    do {
      _ = try await api.remoteScan()
      XCTFail("Expected transport failure")
    } catch let error as PortForwardingTransportError {
      XCTAssertEqual(error, .transport)
    }
    XCTAssertEqual(PortForwardingURLProtocol.requests.count, 1)
  }

  func testDeclaredOversizedResponseIsRejectedWithoutRetry() async throws {
    PortForwardingURLProtocol.handler = { _ in
      (200, Data("{}".utf8), ["Content-Length": "2048"])
    }
    let api = try makeAPI(browser: PortForwardingBrowserRecorder(), maximumBytes: 1024)
    do {
      _ = try await api.remoteScan()
      XCTFail("Expected invalid response")
    } catch let error as PortForwardingTransportError {
      XCTAssertEqual(error, .invalidResponse)
    }
    XCTAssertEqual(PortForwardingURLProtocol.requests.count, 1)
  }

  func testCancellationStopsUnderlyingRequestAndPropagates() async throws {
    PortForwardingURLProtocol.holdOpen = true
    let api = try makeAPI(browser: PortForwardingBrowserRecorder())
    let task = Task { try await api.remoteScan() }
    while PortForwardingURLProtocol.requests.isEmpty { await Task.yield() }
    task.cancel()
    do {
      _ = try await task.value
      XCTFail("Expected cancellation")
    } catch is CancellationError {
    } catch {
      XCTFail("Unexpected error: \(type(of: error))")
    }
    XCTAssertEqual(PortForwardingURLProtocol.requests.count, 1)
    for _ in 0..<1_000 where PortForwardingURLProtocol.stopCount == 0 {
      await Task.yield()
    }
    XCTAssertGreaterThanOrEqual(PortForwardingURLProtocol.stopCount, 1)
  }

  func testCancelledURLErrorStaysTransportWithoutPinVerdict() async throws {
    // A cancelled URLError surfaces in didCompleteWithError on the delegate
    // queue, where Task.isCancelled is always false. The restored URLError
    // branch keeps the error intact so the execute-level catch classifies it:
    // with no pin verdict for the endpoint this stays a transport failure and
    // must never surface as CancellationError (mirrors BoundedHTTPBody).
    PortForwardingURLProtocol.handler = { _ in throw URLError(.cancelled) }
    let api = try makeAPI(browser: PortForwardingBrowserRecorder())
    do {
      _ = try await api.remoteScan()
      XCTFail("Expected transport failure")
    } catch let error as PortForwardingTransportError {
      XCTAssertEqual(error, .transport)
    } catch is CancellationError {
      XCTFail("a cancelled URLError must not surface as CancellationError here")
    }
  }

  #if !canImport(App)
  // App-side coverage of the same refusal runs against the real pin store in
  // TlsPinPairingTests; here the harness shim flips the last trust decision.
  func testPinRefusedHandshakeIsCertificateMismatchAndNeverAmbiguous() async throws {
    TlsCertPinStore.setLastDecisionMismatchedForTests(true)
    // A refused server-trust evaluation surfaces as URLError.cancelled.
    PortForwardingURLProtocol.handler = { _ in throw URLError(.cancelled) }
    let api = try makeAPI(browser: PortForwardingBrowserRecorder())
    do {
      _ = try await api.remoteScan()
      XCTFail("Expected the pin refusal")
    } catch let error as PortForwardingTransportError {
      XCTAssertEqual(error, .certificateMismatch)
    }
    do {
      _ = try await api.remoteStart(port: 5173)
      XCTFail("Expected the pin refusal")
    } catch let error as PortForwardingTransportError {
      // The handshake died before the mutation was sent: definite non-commit,
      // never the ambiguous-mutation path.
      XCTAssertEqual(error, .certificateMismatch)
    }
  }

  func testCancelledRequestWithoutPinMismatchStaysTransport() async throws {
    TlsCertPinStore.setLastDecisionMismatchedForTests(false)
    PortForwardingURLProtocol.handler = { _ in throw URLError(.cancelled) }
    let api = try makeAPI(browser: PortForwardingBrowserRecorder())
    do {
      _ = try await api.remoteScan()
      XCTFail("Expected transport failure")
    } catch let error as PortForwardingTransportError {
      XCTAssertEqual(error, .transport)
    }
  }
  #endif

  // MARK: - Environment parent authority (portable parity)

  /// A direct host — `.direct` or the nil context the transport source resolves
  /// for one — sends no parent header at all, so a parent token can never leak
  /// to a non-environment endpoint.
  func testDirectAuthoritySendsNoParentHeader() async throws {
    PortForwardingURLProtocol.handler = { _ in
      (200, try PortForwardingTestValues.fixture("ports-read"), [:])
    }
    let nilContext = EnvironmentParentAuthority(context: nil)
    let api = try makeAPI(
      browser: PortForwardingBrowserRecorder(),
      environmentAuthority: nilContext)
    _ = try await api.remoteScan()

    let requests = PortForwardingURLProtocol.requests
    XCTAssertEqual(requests.count, 1)
    XCTAssertFalse(EnvironmentParentAuthority.direct.isEnvironmentBound)
    XCTAssertNil(requests[0].value(forHTTPHeaderField: "x-poracode-environment-authorization"))
  }

  /// An environment-bound client attaches the parent bearer to every dispatch
  /// while the child bearer stays the client's own grant.
  func testEnvironmentBoundAuthoritySendsParentHeaderOnEveryDispatch() async throws {
    PortForwardingURLProtocol.handler = { request in
      let path = request.url?.path ?? ""
      switch path {
      case "/relay/host/api/ports": return (200, try PortForwardingTestValues.fixture("ports-read"), [:])
      case "/relay/host/api/ports/forward": return (200, try PortForwardingTestValues.fixture("port-forward"), [:])
      default: throw URLError(.badURL)
      }
    }
    let authority = EnvironmentParentAuthority(context: RemoteEnvironmentContext(
      environmentId: "env-1",
      expectedChildDesktopId: "desktop-1",
      parentAuthorizationToken: { "parent-token" },
      mintParentWebSocketTicket: {
        // HTTP dispatches never mint parent WS tickets; this would fail the
        // test loudly if one ever did.
        throw RemoteClientError(
          message: "unused", status: 401, code: "environment_parent_ticket_missing")
      }))
    let api = try makeAPI(
      browser: PortForwardingBrowserRecorder(),
      environmentAuthority: authority)
    _ = try await api.remoteScan()
    _ = try await api.remoteStart(port: 3000)

    let requests = PortForwardingURLProtocol.requests
    XCTAssertEqual(requests.count, 2)
    XCTAssertTrue(authority.isEnvironmentBound)
    for request in requests {
      XCTAssertEqual(
        request.value(forHTTPHeaderField: "x-poracode-environment-authorization"),
        "Bearer parent-token")
      XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer access")
    }
  }

  /// A missing or empty parent token fails closed with the typed
  /// `environment_parent_not_paired` rejection before any dial — never a bare
  /// child bearer to the proxy.
  func testMissingOrEmptyParentTokenFailsClosedBeforeAnyDial() async throws {
    PortForwardingURLProtocol.handler = { _ in
      (200, try PortForwardingTestValues.fixture("ports-read"), [:])
    }
    for parentToken in [nil as String?, ""] {
      let authority = EnvironmentParentAuthority(context: RemoteEnvironmentContext(
        environmentId: "env-1",
        expectedChildDesktopId: nil,
        parentAuthorizationToken: { parentToken },
        mintParentWebSocketTicket: {
          throw RemoteClientError(
            message: "unused", status: 401, code: "environment_parent_ticket_missing")
        }))
      let api = try makeAPI(
        browser: PortForwardingBrowserRecorder(),
        environmentAuthority: authority)
      do {
        _ = try await api.remoteScan()
        XCTFail("Expected the fail-closed parent rejection")
      } catch let error as PortForwardingTransportError {
        XCTAssertEqual(error, .rejected(statusCode: 401, code: "environment_parent_not_paired"))
      }
    }
    XCTAssertTrue(PortForwardingURLProtocol.requests.isEmpty)
  }

  private func makeAPI(
    browser: PortForwardingBrowserRecorder,
    maximumBytes: Int = PortForwardingURLSessionHTTPClient.defaultMaximumResponseBytes,
    environmentAuthority: EnvironmentParentAuthority = .direct
  ) throws -> GeneratedPortForwardingRemoteAPI {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [PortForwardingURLProtocol.self]
    let session = URLSession(configuration: configuration)
    let http = try PortForwardingURLSessionHTTPClient(
      endpoint: "https://relay.example/relay/host",
      token: "access",
      session: session,
      maximumResponseBytes: maximumBytes,
      environmentAuthority: environmentAuthority)
    return GeneratedPortForwardingRemoteAPI(
      http: http,
      browser: PortForwardingBrowserOpener { url in browser.record(url) })
  }
}

@MainActor
private final class PortForwardingBrowserRecorder: Sendable {
  private var url: URL?
  func record(_ value: URL) -> Bool {
    url = value
    return true
  }
  func openedURL() -> URL? { url }
}

private final class PortForwardingURLProtocol: URLProtocol, @unchecked Sendable {
  typealias Handler = @Sendable (URLRequest) throws -> (Int, Data, [String: String])
  private static let lock = NSLock()
  nonisolated(unsafe) static var handler: Handler?
  nonisolated(unsafe) static var holdOpen = false
  nonisolated(unsafe) private static var storedRequests: [URLRequest] = []
  nonisolated(unsafe) private static var storedStopCount = 0

  static var requests: [URLRequest] { lock.withLock { storedRequests } }
  static var stopCount: Int { lock.withLock { storedStopCount } }

  static func reset() {
    lock.withLock {
      handler = nil
      holdOpen = false
      storedRequests = []
      storedStopCount = 0
    }
  }

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    Self.lock.withLock { Self.storedRequests.append(request) }
    if Self.lock.withLock({ Self.holdOpen }) { return }
    do {
      guard let handler = Self.lock.withLock({ Self.handler }) else {
        throw URLError(.resourceUnavailable)
      }
      let (status, data, headers) = try handler(request)
      let response = HTTPURLResponse(
        url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
      client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: data)
      client?.urlProtocolDidFinishLoading(self)
    } catch {
      client?.urlProtocol(self, didFailWithError: error)
    }
  }

  override func stopLoading() {
    Self.lock.withLock { Self.storedStopCount += 1 }
  }
}
