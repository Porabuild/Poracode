import Foundation
import XCTest

#if canImport(App)
  @testable import App
#else
  @testable import BrowserMirror
#endif

#if canImport(FoundationNetworking)
  import FoundationNetworking
#endif

enum BrowserMirrorTestValues {
  static let lease = BrowserMirrorHostLease(
    connectionID: BrowserMirrorConnectionID(rawValue: "host-a"),
    connectionGeneration: 7
  )

  static let otherLease = BrowserMirrorHostLease(
    connectionID: BrowserMirrorConnectionID(rawValue: "host-b"),
    connectionGeneration: 8
  )

  static func access(
    lease: BrowserMirrorHostLease = lease,
    online: Bool = true,
    ready: Bool = true,
    foreground: Bool = true,
    capabilities: Set<BrowserMirrorCapability> = [.read, .operate]
  ) -> BrowserMirrorHostAccess {
    BrowserMirrorHostAccess(
      lease: lease,
      protocolVersion: 3,
      isOnline: online,
      isReady: ready,
      isForeground: foreground,
      capabilities: capabilities
    )
  }

  static let state = BrowserMirrorState(
    tabs: [
      BrowserMirrorTab(
        tabId: "tab-main",
        url: "https://example.test/docs",
        title: "Docs",
        faviconUrl: nil,
        loading: false,
        canGoBack: true,
        canGoForward: false
      )
    ],
    activeTabId: "tab-main"
  )

  static func frame(tabId: String = "tab-main", marker: UInt8 = 0) -> BrowserMirrorFrame {
    BrowserMirrorFrame(
      tabId: tabId,
      jpegData: Data([0xFF, 0xD8, 0xFF, marker, 0xFF, 0xD9]),
      metadata: BrowserMirrorFrameMetadata(
        deviceWidth: 1_280,
        deviceHeight: 720,
        pageScaleFactor: 2,
        offsetTop: 0,
        scrollOffsetX: 0,
        scrollOffsetY: 0
      )
    )
  }

  static func fixtureData() throws -> Data {
    let root = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .appendingPathComponent("../../../../protocol/remote/v3/fixtures/browser-mirror.json")
      .standardizedFileURL
    return try Data(contentsOf: root)
  }

  static func fixtureObject() throws -> [String: Any] {
    try XCTUnwrap(
      JSONSerialization.jsonObject(with: fixtureData()) as? [String: Any])
  }

  static func json(_ value: Any) throws -> Data {
    try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
  }

  static func equalJSON(_ left: Data, _ right: Data) throws -> Bool {
    let lhs = try JSONSerialization.jsonObject(with: left) as AnyObject
    let rhs = try JSONSerialization.jsonObject(with: right) as AnyObject
    return lhs.isEqual(rhs)
  }
}

actor BrowserMirrorGatewaySpy: BrowserMirrorGateway {
  enum CommandOutcome: Sendable {
    case success(BrowserMirrorState)
    case failure(BrowserMirrorFailure)
  }

  private var stateValue = BrowserMirrorTestValues.state
  private var commandOutcome: CommandOutcome = .success(BrowserMirrorTestValues.state)
  private var stateCalls: [BrowserMirrorHostLease] = []
  private var commandCalls: [(BrowserMirrorCommand, BrowserMirrorHostLease)] = []

  func setState(_ value: BrowserMirrorState) { stateValue = value }
  func setCommandOutcome(_ value: CommandOutcome) { commandOutcome = value }
  func recordedStateCalls() -> [BrowserMirrorHostLease] { stateCalls }
  func recordedCommandCount() -> Int { commandCalls.count }
  func recordedCommands() -> [BrowserMirrorCommand] { commandCalls.map(\.0) }

  func state(lease: BrowserMirrorHostLease) async throws -> BrowserMirrorState {
    stateCalls.append(lease)
    return stateValue
  }

  func command(
    _ command: BrowserMirrorCommand,
    lease: BrowserMirrorHostLease
  ) async throws -> BrowserMirrorState {
    commandCalls.append((command, lease))
    switch commandOutcome {
    case .success(let state): return state
    case .failure(let failure): throw failure
    }
  }
}

actor BrowserMirrorSocketSpy: BrowserMirrorSocketGateway {
  enum Call: Equatable, Sendable {
    case start(BrowserMirrorHostLease)
    case watch(BrowserMirrorSocketKey)
    case unwatch(BrowserMirrorSocketKey)
    case input(BrowserMirrorInput, BrowserMirrorSocketKey)
    case stop(BrowserMirrorHostLease)
  }

  private var calls: [Call] = []
  private var blockWatch = false
  private var watchContinuation: CheckedContinuation<Void, Never>?
  private var watchStartedContinuation: CheckedContinuation<Void, Never>?

  func recordedCalls() -> [Call] { calls }
  func setBlockWatch(_ value: Bool) { blockWatch = value }

  func waitUntilWatchStarted() async {
    if calls.contains(where: {
      if case .watch = $0 { return true }
      return false
    }) {
      return
    }
    await withCheckedContinuation { watchStartedContinuation = $0 }
  }

  func releaseWatch() {
    watchContinuation?.resume()
    watchContinuation = nil
  }

  func start(lease: BrowserMirrorHostLease) async throws {
    calls.append(.start(lease))
  }

  func watch(key: BrowserMirrorSocketKey) async throws {
    calls.append(.watch(key))
    watchStartedContinuation?.resume()
    watchStartedContinuation = nil
    if blockWatch {
      await withCheckedContinuation { watchContinuation = $0 }
    }
  }

  func unwatch(key: BrowserMirrorSocketKey) async {
    calls.append(.unwatch(key))
  }

  func input(_ input: BrowserMirrorInput, key: BrowserMirrorSocketKey) async throws {
    calls.append(.input(input, key))
  }

  func stop(lease: BrowserMirrorHostLease) async {
    calls.append(.stop(lease))
  }

  func event(
    from data: Data,
    key _: BrowserMirrorSocketKey
  ) async throws -> BrowserMirrorSocketEvent {
    try BrowserMirrorRemoteV3Adapter.serverEvent(data)
  }
}

actor BrowserMirrorHTTPSpy: BrowserMirrorHTTPExecuting {
  nonisolated let endpoint = "https://example.test/base"
  private var requests: [BrowserMirrorHTTPRequest] = []
  private var result: Result<Data, BrowserMirrorHTTPError>

  init(result: Result<Data, BrowserMirrorHTTPError>) {
    self.result = result
  }

  func setResult(_ value: Result<Data, BrowserMirrorHTTPError>) { result = value }
  func callCount() -> Int { requests.count }
  func recordedRequests() -> [BrowserMirrorHTTPRequest] { requests }

  func execute(_ request: BrowserMirrorHTTPRequest) async throws -> Data {
    requests.append(request)
    return try result.get()
  }
}

extension URLRequest {
  /// `URLSession` rewrites `httpBody` into `httpBodyStream` before the protocol sees it,
  /// so recorded request bodies must be drained from the stream.
  var browserMirrorBody: Data? {
    if let httpBody { return httpBody }
    guard let stream = httpBodyStream else { return nil }
    stream.open()
    defer { stream.close() }
    var data = Data()
    var buffer = [UInt8](repeating: 0, count: 4_096)
    while stream.hasBytesAvailable {
      let read = stream.read(&buffer, maxLength: buffer.count)
      guard read > 0 else { break }
      data.append(buffer, count: read)
    }
    return data.isEmpty ? nil : data
  }
}

final class BrowserMirrorURLProtocol: URLProtocol, @unchecked Sendable {
  enum Outcome: Sendable {
    case response(status: Int, body: Data)
    case failure(URLError.Code)
  }

  private static let lock = NSLock()
  nonisolated(unsafe) private static var outcomes: [Outcome] = []
  nonisolated(unsafe) private static var requests: [URLRequest] = []

  static func prepare(_ values: [Outcome]) {
    lock.withLock {
      outcomes = values
      requests = []
    }
  }

  static func recordedRequests() -> [URLRequest] {
    lock.withLock { requests }
  }

  override class func canInit(with _: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    let outcome: Outcome? = Self.lock.withLock {
      Self.requests.append(request)
      return Self.outcomes.isEmpty ? nil : Self.outcomes.removeFirst()
    }
    guard let outcome else {
      client?.urlProtocol(self, didFailWithError: URLError(.resourceUnavailable))
      return
    }
    switch outcome {
    case .response(let status, let body):
      let response = HTTPURLResponse(
        url: request.url!,
        statusCode: status,
        httpVersion: nil,
        headerFields: ["Content-Length": String(body.count)]
      )!
      client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: body)
      client?.urlProtocolDidFinishLoading(self)
    case .failure(let code):
      client?.urlProtocol(self, didFailWithError: URLError(code))
    }
  }

  override func stopLoading() {}
}
