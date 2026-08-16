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

  private func makeAPI(
    browser: PortForwardingBrowserRecorder,
    maximumBytes: Int = PortForwardingURLSessionHTTPClient.defaultMaximumResponseBytes
  ) throws -> GeneratedPortForwardingRemoteAPI {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [PortForwardingURLProtocol.self]
    let session = URLSession(configuration: configuration)
    let http = try PortForwardingURLSessionHTTPClient(
      endpoint: "https://relay.example/relay/host",
      token: "access",
      session: session,
      maximumResponseBytes: maximumBytes)
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
