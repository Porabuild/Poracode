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

  init(connections: [TerminalScriptedConnection]) {
    self.connections = connections
  }

  func connect(owner: RichChatThreadTarget) throws -> any RichChatTerminalWebSocketConnection {
    owners.append(owner)
    guard !connections.isEmpty else { throw RichChatGatewayError.transport }
    return connections.removeFirst()
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
