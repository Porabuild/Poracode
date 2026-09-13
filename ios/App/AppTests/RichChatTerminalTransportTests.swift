import Foundation
import XCTest

@testable import App

final class RichChatTerminalTransportTests: XCTestCase {
  func testWaitsForReadyThenSendsCanonicalWatchAndDeliversCursorFrames() async throws {
    let connection = TerminalScriptedConnection(messages: [Self.ready])
    let connector = TerminalScriptedConnector(connections: [connection])
    let transport = RichChatTerminalWebSocketTransport(
      connector: connector,
      reconnectDelay: { _ in .zero }
    )
    let owner = Self.owner()
    let events = await transport.richChatTerminalEvents(owner: owner)
    let watch = try GeneratedRemoteV3Contract.richTerminalWatchMessage(
      terminalID: "thread-1", watchID: "watch-1"
    )

    try await transport.sendRichChatTerminalMessage(watch, owner: owner)
    await connection.push(Self.baseline(watchID: "watch-1"))

    let sent = await connection.sentMessages()
    XCTAssertEqual(sent, [watch])
    let frame = try await Self.firstFrame(in: events)
    guard case .cursor(let cursor) = frame else { return XCTFail("Expected cursor frame") }
    XCTAssertEqual(cursor.watchID, "watch-1")
    XCTAssertEqual(cursor.data, "hello")
  }

  func testReconnectUsesFreshSocketAndReinstallsWatchWithoutReplayCursor() async throws {
    let first = TerminalScriptedConnection(messages: [Self.ready])
    let second = TerminalScriptedConnection(messages: [Self.ready])
    let connector = TerminalScriptedConnector(connections: [first, second])
    let transport = RichChatTerminalWebSocketTransport(
      connector: connector,
      reconnectDelay: { _ in .zero }
    )
    let owner = Self.owner()
    let events = await transport.richChatTerminalEvents(owner: owner)
    let watch = try GeneratedRemoteV3Contract.richTerminalWatchMessage(
      terminalID: "thread-1", watchID: "watch-reconnect"
    )

    try await transport.sendRichChatTerminalMessage(watch, owner: owner)
    await first.fail()
    try await Self.eventually { await second.sentMessages() == [watch] }

    let requestedOwners = await connector.requestedOwners()
    XCTAssertEqual(requestedOwners, [owner, owner])
    withExtendedLifetime(events) {}
  }

  func testOwnerSwapCancelsOldConnectionBeforeInstallingNewWatch() async throws {
    let first = TerminalScriptedConnection(messages: [Self.ready])
    let second = TerminalScriptedConnection(messages: [Self.ready])
    let connector = TerminalScriptedConnector(connections: [first, second])
    let transport = RichChatTerminalWebSocketTransport(connector: connector)
    let firstOwner = Self.owner(threadID: "thread-1")
    let secondOwner = Self.owner(threadID: "thread-2")
    let events = await transport.richChatTerminalEvents(owner: firstOwner)
    let firstWatch = try GeneratedRemoteV3Contract.richTerminalWatchMessage(
      terminalID: "thread-1", watchID: "watch-1"
    )
    try await transport.sendRichChatTerminalMessage(firstWatch, owner: firstOwner)

    let secondWatch = try GeneratedRemoteV3Contract.richTerminalWatchMessage(
      terminalID: "thread-2", watchID: "watch-2"
    )
    try await transport.sendRichChatTerminalMessage(secondWatch, owner: secondOwner)

    let firstCancelled = await first.wasCancelled()
    let secondSent = await second.sentMessages()
    XCTAssertTrue(firstCancelled)
    XCTAssertEqual(secondSent, [secondWatch])
    withExtendedLifetime(events) {}
  }

  func testV2ChunkedBaselineAcksEachChunkAndDeliversOneBaselineCursorFrame() async throws {
    let connection = TerminalScriptedConnection(messages: [Self.ready])
    let connector = TerminalScriptedConnector(connections: [connection])
    let transport = RichChatTerminalWebSocketTransport(
      connector: connector,
      reconnectDelay: { _ in .zero }
    )
    let owner = Self.owner()
    let events = await transport.richChatTerminalEvents(owner: owner)
    let watch = try GeneratedRemoteV3Contract.richTerminalWatchMessageV2(
      terminalID: "thread-1", watchID: "watch-1", resume: nil
    )

    try await transport.sendRichChatTerminalMessage(watch, owner: owner)
    await connection.push(Self.baselineChunk(index: 0, count: 3, from: 100, to: 103, data: "abc"))
    await connection.push(Self.baselineChunk(index: 1, count: 3, from: 103, to: 106, data: "def"))
    await connection.push(Self.baselineChunk(index: 2, count: 3, from: 106, to: 108, data: "gh"))
    try await Self.eventually { await connection.sentMessages().count == 4 }

    let sent = await connection.sentMessages()
    XCTAssertEqual(sent.first, watch)
    let ackCursors = try sent.dropFirst().map { try Self.ackThroughCursor($0) }
    XCTAssertEqual(ackCursors, [103, 106, 108])

    let frames = try await Self.collectFrames(in: events) { frame in
      if case .cursor(let cursor) = frame { return cursor.kind == .baseline }
      return false
    }
    // Chunks never leak past the transport — exactly one synthesized baseline.
    XCTAssertEqual(frames.count, 1)
    for frame in frames {
      if case .baselineChunk = frame { XCTFail("chunk crossed the transport boundary") }
    }
    guard case .cursor(let baseline) = frames[0] else { return XCTFail("Expected cursor") }
    XCTAssertEqual(baseline.fromCursor, 100)
    XCTAssertEqual(baseline.toCursor, 108)
    XCTAssertEqual(baseline.data, "abcdefgh")
    XCTAssertEqual(baseline.generation, "instance-1")
    withExtendedLifetime(events) {}
  }

  func testV2RequestDowngradesToV1WhenEnvironmentLacksV2() async throws {
    let connection = TerminalScriptedConnection(messages: [Self.ready])
    let connector = TerminalScriptedConnector(
      connections: [connection],
      environment: Self.cursorSyncEnvironment(versions: [1])
    )
    let transport = RichChatTerminalWebSocketTransport(
      connector: connector,
      reconnectDelay: { _ in .zero }
    )
    let owner = Self.owner()
    let events = await transport.richChatTerminalEvents(owner: owner)
    let v2 = try GeneratedRemoteV3Contract.richTerminalWatchMessageV2(
      terminalID: "thread-1", watchID: "watch-1", resume: nil
    )
    try await transport.sendRichChatTerminalMessage(v2, owner: owner)
    try await Self.eventually { await connection.sentMessages().count == 1 }
    // Byte equality is not stable across separately-built canonical messages
    // (key order follows dictionary iteration); compare structurally.
    let negotiatedMessages = await connection.sentMessages()
    XCTAssertEqual(negotiatedMessages.count, 1)
    XCTAssertEqual(try Self.watchVersion(negotiatedMessages[0]), 1)
    withExtendedLifetime(events) {}
  }

  func testUnsupportedVersionVerdictRewatchesAsV1OnTheSameConnection() async throws {
    let connection = TerminalScriptedConnection(messages: [Self.ready])
    let connector = TerminalScriptedConnector(connections: [connection])
    let transport = RichChatTerminalWebSocketTransport(
      connector: connector,
      reconnectDelay: { _ in .zero }
    )
    let owner = Self.owner()
    let events = await transport.richChatTerminalEvents(owner: owner)
    let v2 = try GeneratedRemoteV3Contract.richTerminalWatchMessageV2(
      terminalID: "thread-1", watchID: "watch-1", resume: nil
    )

    try await transport.sendRichChatTerminalMessage(v2, owner: owner)
    await connection.push(Self.unsupportedVersionVerdict(watchID: "watch-1"))
    await connection.push(Self.baseline(watchID: "watch-1"))

    let frames = try await Self.collectFrames(in: events) { frame in
      if case .cursor(let cursor) = frame { return cursor.kind == .baseline }
      return false
    }
    let sent = await connection.sentMessages()
    // The v2 watch was rejected, then re-sent as v1 on the same socket; the
    // verdict itself is consumed by the downgrade and never delivered.
    // (Structural comparison — see the negotiation test for why.)
    XCTAssertEqual(sent.count, 2)
    XCTAssertEqual(try Self.watchVersion(sent[0]), 2)
    XCTAssertEqual(try Self.watchVersion(sent[1]), 1)
    for frame in frames {
      if case .watchError = frame { XCTFail("downgrade verdict must not be delivered") }
    }
    XCTAssertEqual(frames.count, 1)
    withExtendedLifetime(events) {}
  }

  func testStalledBaselineRetiresTheAttemptAndReconnects() async throws {
    let first = TerminalScriptedConnection(messages: [Self.ready])
    let second = TerminalScriptedConnection(messages: [Self.ready])
    let connector = TerminalScriptedConnector(connections: [first, second])
    let transport = RichChatTerminalWebSocketTransport(
      connector: connector,
      reconnectDelay: { _ in .zero },
      baselineTimeout: .milliseconds(50)
    )
    let owner = Self.owner()
    let events = await transport.richChatTerminalEvents(owner: owner)
    let watch = try GeneratedRemoteV3Contract.richTerminalWatchMessage(
      terminalID: "thread-1", watchID: "watch-stalled"
    )

    try await transport.sendRichChatTerminalMessage(watch, owner: owner)
    // The second socket receives the watch and serves the baseline promptly.
    try await Self.eventually { await second.sentMessages().count == 1 }
    await second.push(Self.baseline(watchID: "watch-stalled"))
    let frames = try await Self.collectFrames(in: events) { frame in
      if case .cursor(let cursor) = frame { return cursor.kind == .baseline }
      return false
    }
    XCTAssertEqual(frames.count, 1)
    let requested = await connector.requestedOwners()
    XCTAssertEqual(requested.count, 2)
    withExtendedLifetime(events) {}
  }

  func testNonRetryableWatchVerdictStopsTheAttemptWithoutReconnect() async throws {
    let connection = TerminalScriptedConnection(messages: [Self.ready])
    let connector = TerminalScriptedConnector(connections: [connection])
    let transport = RichChatTerminalWebSocketTransport(
      connector: connector,
      reconnectDelay: { _ in .zero },
      baselineTimeout: .milliseconds(80)
    )
    let owner = Self.owner()
    let events = await transport.richChatTerminalEvents(owner: owner)
    let watch = try GeneratedRemoteV3Contract.richTerminalWatchMessage(
      terminalID: "thread-1", watchID: "watch-1"
    )

    try await transport.sendRichChatTerminalMessage(watch, owner: owner)
    await connection.push(
      Data(
        #"{"type":"terminal-watch-result","id":"thread-1","cursorSync":{"version":1,"watchId":"watch-1","result":{"status":"error","code":"not-found","retryable":false}}}"#
          .utf8
      )
    )
    // The error must be delivered exactly once…
    let frames = try await Self.collectFrames(in: events) { frame in
      if case .watchError = frame { return true }
      return false
    }
    XCTAssertEqual(frames.count, 1)
    // …and the attempt must END: no deadline reconnect, no second socket,
    // even beyond the (short) baseline idle timeout.
    try? await Task.sleep(for: .milliseconds(300))
    let connects = await connector.requestedOwners().count
    let sent = await connection.sentMessages().count
    XCTAssertEqual(connects, 1)
    XCTAssertEqual(sent, 1)
    withExtendedLifetime(events) {}
  }

  func testFastPathRewatchArmsTheBaselineDeadline() async throws {
    let first = TerminalScriptedConnection(messages: [Self.ready])
    let second = TerminalScriptedConnection(messages: [Self.ready])
    let connector = TerminalScriptedConnector(connections: [first, second])
    let transport = RichChatTerminalWebSocketTransport(
      connector: connector,
      reconnectDelay: { _ in .zero },
      baselineTimeout: .milliseconds(80)
    )
    let owner = Self.owner()
    let events = await transport.richChatTerminalEvents(owner: owner)
    let firstWatch = try GeneratedRemoteV3Contract.richTerminalWatchMessage(
      terminalID: "thread-1", watchID: "watch-1"
    )

    try await transport.sendRichChatTerminalMessage(firstWatch, owner: owner)
    await first.push(Self.baseline(watchID: "watch-1"))
    _ = try await Self.collectFrames(in: events) { frame in
      if case .cursor(let cursor) = frame { return cursor.kind == .baseline }
      return false
    }

    // A re-watch on the still-live connection (fast path) must arm the
    // baseline deadline: the stalled second baseline retires the attempt.
    let secondWatch = try GeneratedRemoteV3Contract.richTerminalWatchMessage(
      terminalID: "thread-1", watchID: "watch-2"
    )
    try await transport.sendRichChatTerminalMessage(secondWatch, owner: owner)
    try await Self.eventually { await connector.requestedOwners().count == 2 }
    withExtendedLifetime(events) {}
  }

  func testTerminalSocketURLOmitsReplayCursorAndSuppressesBulkThreadContent() async throws {
    let api = RemoteAPIClient(endpoint: "https://example.test/prefix", accessToken: "token")
    let url = try await api.websocketURL(
      ticket: "ticket",
      lastSeenSeq: nil,
      threadItemInterests: []
    )
    let items = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems)

    XCTAssertEqual(items.first(where: { $0.name == "ticket" })?.value, "ticket")
    XCTAssertNil(items.first(where: { $0.name == "lastSeenSeq" }))
    XCTAssertEqual(items.first(where: { $0.name == "threadItemInterests" })?.value, "[]")
  }

  func testUnauthorizedTicketFailureIsTerminalAndDoesNotReconnect() async throws {
    let connector = TerminalFailingConnector(
      error: RemoteClientError(message: "expired", status: 401, code: "unauthorized")
    )
    let transport = RichChatTerminalWebSocketTransport(
      connector: connector,
      reconnectDelay: { _ in .zero }
    )
    let owner = Self.owner()
    let events = await transport.richChatTerminalEvents(owner: owner)
    let watch = try GeneratedRemoteV3Contract.richTerminalWatchMessage(
      terminalID: "thread-1", watchID: "watch-auth"
    )

    do {
      try await transport.sendRichChatTerminalMessage(watch, owner: owner)
      XCTFail("Unauthorized ticket must fail the watch")
    } catch let error as RemoteClientError {
      XCTAssertTrue(error.isUnauthorized)
    }
    let failure = try await Self.firstFailedConnection(in: events)
    XCTAssertEqual(failure, .failed(retryable: false))
    try await Task.sleep(for: .milliseconds(25))
    let calls = await connector.connectCount()
    XCTAssertEqual(calls, 1)
  }

  private static let ready = Data(#"{"type":"ready","seq":0}"#.utf8)

  private static func baseline(watchID: String) -> Data {
    Data(
      #"{"type":"terminal-watch-result","id":"thread-1","cursorSync":{"version":1,"watchId":"\#(watchID)","result":{"status":"ready","generation":"generation-1","fromCursor":0,"toCursor":5,"data":"hello","processState":"running","terminalSize":{"cols":80,"rows":24}}}}"#
        .utf8
    )
  }

  private static func baselineChunk(
    index: Int,
    count: Int,
    from: Int64,
    to: Int64,
    data: String,
    resumeServed: Bool = false
  ) -> Data {
    Data(
      #"{"type":"terminal-watch-baseline-chunk","id":"thread-1","cursorSync":{"version":2,"watchId":"watch-1","generation":"instance-1","chunkIndex":\#(index),"chunkCount":\#(count),"fromCursor":\#(from),"toCursor":\#(to),"data":"\#(data)","processState":"running","terminalSize":null,"resumeServed":\#(resumeServed)}}"#
        .utf8
    )
  }

  /// The rejection travels on the version-1 watch-result error channel;
  /// `reason` discriminates the downgrade verdict.
  private static func unsupportedVersionVerdict(watchID: String) -> Data {
    Data(
      #"{"type":"terminal-watch-result","id":"thread-1","cursorSync":{"version":1,"watchId":"\#(watchID)","result":{"status":"error","code":"unavailable","reason":"unsupported-version","retryable":false}}}"#
        .utf8
    )
  }

  private static func ackThroughCursor(_ data: Data) throws -> Int64? {
    try RichJSON.decode(data).objectValue?["cursorSync"]?.objectValue?["throughCursor"]?
      .exactInt64Value
  }

  private static func watchVersion(_ data: Data) throws -> Int? {
    try RichJSON.decode(data).objectValue?["cursorSync"]?.objectValue?["version"]?
      .exactInt64Value.map(Int.init)
  }

  private static func cursorSyncEnvironment(versions: [Int]) -> RemoteEnvironmentDescriptor {
    RemoteEnvironmentDescriptor(
      protocolVersion: ProtocolConstants.remoteProtocolVersion,
      hostMode: nil,
      desktopId: "desk-terminal",
      label: "Desktop Terminal",
      appVersion: "1.0.0",
      platform: "macOS",
      auth: .init(
        policy: ProtocolConstants.authPolicy,
        bootstrapMethods: [ProtocolConstants.bootstrapMethod],
        sessionMethods: [ProtocolConstants.sessionMethod],
        scopes: ProtocolConstants.standardScopes
      ),
      endpoints: .init(httpBaseUrl: "https://a.test", wsBaseUrl: "wss://a.test"),
      capabilities: .init(terminalCursorSync: .init(versions: versions))
    )
  }

  private static func collectFrames(
    in events: AsyncStream<RichChatTerminalTransportEvent>,
    until predicate: @escaping (RichChatTerminalServerFrame) -> Bool
  ) async throws -> [RichChatTerminalServerFrame] {
    var frames: [RichChatTerminalServerFrame] = []
    for await event in events {
      if case .frame(let frame) = event {
        frames.append(frame)
        if predicate(frame) { return frames }
      }
    }
    throw RichChatGatewayError.transport
  }

  private static func owner(threadID: String = "thread-1") -> RichChatThreadTarget {
    RichChatThreadTarget(
      lease: RichChatHostLease(
        connectionID: ClientConnectionID(
          UUID(uuidString: "77777777-7777-4777-8777-777777777777")!
        ),
        generation: 4
      ),
      threadID: threadID
    )
  }

  private static func firstFrame(
    in events: AsyncStream<RichChatTerminalTransportEvent>
  ) async throws -> RichChatTerminalServerFrame {
    for await event in events {
      if case .frame(let frame) = event { return frame }
    }
    throw RichChatGatewayError.transport
  }

  private static func firstFailedConnection(
    in events: AsyncStream<RichChatTerminalTransportEvent>
  ) async throws -> RichChatTerminalConnectionState {
    for await event in events {
      if case .connection(let state) = event, case .failed = state { return state }
    }
    throw RichChatGatewayError.transport
  }

  private static func eventually(
    _ condition: @escaping @Sendable () async -> Bool
  ) async throws {
    for _ in 0..<100 {
      if await condition() { return }
      try await Task.sleep(for: .milliseconds(10))
    }
    XCTFail("Condition was not satisfied")
  }
}

actor TerminalFailingConnector: RichChatTerminalWebSocketConnecting {
  private let error: RemoteClientError
  private var calls = 0

  init(error: RemoteClientError) {
    self.error = error
  }

  func connect(owner _: RichChatThreadTarget) throws
    -> any RichChatTerminalWebSocketConnection
  {
    calls += 1
    throw error
  }

  func connectCount() -> Int { calls }
}

actor TerminalScriptedConnector: RichChatTerminalWebSocketConnecting {
  private var connections: [TerminalScriptedConnection]
  private var owners: [RichChatThreadTarget] = []
  private let environmentValue: RemoteEnvironmentDescriptor?

  init(
    connections: [TerminalScriptedConnection],
    environment: RemoteEnvironmentDescriptor? = nil
  ) {
    self.connections = connections
    self.environmentValue = environment
  }

  func connect(owner: RichChatThreadTarget) throws -> any RichChatTerminalWebSocketConnection {
    owners.append(owner)
    guard !connections.isEmpty else { throw RichChatGatewayError.transport }
    return connections.removeFirst()
  }

  func environment(owner _: RichChatThreadTarget) throws -> RemoteEnvironmentDescriptor? {
    environmentValue
  }

  func requestedOwners() -> [RichChatThreadTarget] { owners }
}

actor TerminalScriptedConnection: RichChatTerminalWebSocketConnection {
  private var messages: [Result<Data, RichChatGatewayError>]
  private var waiter: CheckedContinuation<Data, any Error>?
  private var sent: [Data] = []
  private var cancelled = false

  init(messages: [Data]) {
    self.messages = messages.map(Result.success)
  }

  func receive() async throws -> Data {
    if !messages.isEmpty { return try messages.removeFirst().get() }
    return try await withCheckedThrowingContinuation { waiter = $0 }
  }

  func send(_ data: Data) throws {
    guard !cancelled else { throw CancellationError() }
    sent.append(data)
  }

  func cancel() {
    cancelled = true
    waiter?.resume(throwing: CancellationError())
    waiter = nil
  }

  func push(_ data: Data) {
    if let waiter {
      self.waiter = nil
      waiter.resume(returning: data)
    } else {
      messages.append(.success(data))
    }
  }

  func fail() {
    if let waiter {
      self.waiter = nil
      waiter.resume(throwing: RichChatGatewayError.transport)
    } else {
      messages.append(.failure(.transport))
    }
  }

  func sentMessages() -> [Data] { sent }
  func wasCancelled() -> Bool { cancelled }
}
