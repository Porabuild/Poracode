import XCTest

@testable import App

private final class RichChatCapturingURLProtocol: URLProtocol {
  struct Stub {
    let status: Int
    let headers: [String: String]
    let body: Data
  }

  nonisolated(unsafe) static var requests: [URLRequest] = []
  nonisolated(unsafe) static var bodies: [Data?] = []
  nonisolated(unsafe) static var stubs: [Stub] = []
  nonisolated(unsafe) static var failure: Error?

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    Self.requests.append(request)
    Self.bodies.append(Self.body(from: request))
    if let failure = Self.failure {
      client?.urlProtocol(self, didFailWithError: failure)
      return
    }
    let stub =
      Self.stubs.isEmpty
      ? Stub(status: 500, headers: [:], body: Data())
      : Self.stubs.removeFirst()
    var headers = stub.headers
    if headers["Content-Type"] == nil { headers["Content-Type"] = "application/json" }
    let response = HTTPURLResponse(
      url: request.url!, statusCode: stub.status, httpVersion: nil, headerFields: headers
    )!
    client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: stub.body)
    client?.urlProtocolDidFinishLoading(self)
  }

  override func stopLoading() {}

  static func enqueueJSON(_ value: RichJSON, status: Int = 200) throws {
    stubs.append(Stub(status: status, headers: [:], body: try JSONDecoding.encoder.encode(value)))
  }

  static func reset() {
    requests = []
    bodies = []
    stubs = []
    failure = nil
  }

  private static func body(from request: URLRequest) -> Data? {
    if let body = request.httpBody { return body }
    guard let stream = request.httpBodyStream else { return nil }
    stream.open()
    defer { stream.close() }
    var data = Data()
    let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 4_096)
    defer { buffer.deallocate() }
    while true {
      let count = stream.read(buffer, maxLength: 4_096)
      if count <= 0 { return data.isEmpty ? nil : data }
      data.append(buffer, count: count)
    }
  }
}

final class RichChatRemoteAPITests: XCTestCase {
  override func tearDown() {
    RichChatCapturingURLProtocol.reset()
    super.tearDown()
  }

  func testRichMutationsUseCanonicalBodiesEncodedPathsAndExactCommandHeaders() async throws {
    for _ in 0..<11 {
      try RichChatCapturingURLProtocol.enqueueJSON(.object(["ok": .bool(true)]))
    }
    let api = makeAPI()
    let threadID = "thread /東京"
    try await api.richSend(
      threadID: threadID,
      input: RichChatSendInput(
        prompt: "hello",
        config: ["model": .string("gpt-5")],
        userMessageItemID: "user-1"
      ))
    try await api.richInterrupt(threadID: threadID)
    try await api.richTruncate(threadID: threadID, after: "item-1")
    try await api.richGoal(threadID: threadID, update: .pause)
    try await api.richSetSteer(
      threadID: threadID,
      input: RichSetPendingSteerInput(
        prompt: "continue", segments: nil, config: ["model": .string("gpt-5")]))
    try await api.richClearSteer(threadID: threadID)
    try await api.richCommand(
      threadID: threadID,
      command: RichChatThreadCommand(payload: ["kind": .string("acknowledge")]))
    try await api.richResolveRequest(
      threadID: threadID,
      resolution: RichChatRequestResolution(
        requestID: .text("request-1"), method: "resolve", response: .bool(true)))
    try await api.richWriteTerminal(threadID: threadID, data: "ls\n")
    try await api.richResizeTerminal(
      threadID: threadID, size: RichChatTerminalSize(columns: 100, rows: 30))
    try await api.richCloseTerminal(threadID: threadID)

    let encoded = "thread%20%2F%E6%9D%B1%E4%BA%AC"
    XCTAssertEqual(
      RichChatCapturingURLProtocol.requests.map { $0.url?.path(percentEncoded: true) },
      [
        "/prefix/api/threads/\(encoded)/send",
        "/prefix/api/threads/\(encoded)/interrupt",
        "/prefix/api/threads/\(encoded)/runtime/truncate",
        "/prefix/api/threads/\(encoded)/goal",
        "/prefix/api/threads/\(encoded)/steer/set",
        "/prefix/api/threads/\(encoded)/steer/clear",
        "/prefix/api/threads/\(encoded)/command",
        "/prefix/api/threads/\(encoded)/requests/resolve",
        "/prefix/api/threads/\(encoded)/terminal/write",
        "/prefix/api/threads/\(encoded)/terminal/resize",
        "/prefix/api/threads/\(encoded)/terminal/close",
      ]
    )
    XCTAssertEqual(
      RichChatCapturingURLProtocol.requests[0].value(
        forHTTPHeaderField: ProtocolConstants.commandIdHeader),
      "user-1"
    )
    for request in RichChatCapturingURLProtocol.requests.dropFirst() {
      XCTAssertNil(request.value(forHTTPHeaderField: ProtocolConstants.commandIdHeader))
    }
    XCTAssertEqual(try body(2)["itemId"], .string("item-1"))
    XCTAssertEqual(try body(4)["prompt"], .string("continue"))
    XCTAssertEqual(try body(7)["requestId"], .string("request-1"))
    XCTAssertEqual(try body(9)["cols"], .number(100))
  }

  func testStartThreadCommandUsesStableCommandIDOnlyForStart() async throws {
    try RichChatCapturingURLProtocol.enqueueJSON(.object(["ok": .bool(true)]))
    let api = makeAPI()
    try await api.richCommand(
      threadID: "thread-1",
      command: RichChatThreadCommand(
        payload: [
          "kind": .string("start"),
          "projectId": .string("project-1"),
          "agentKind": .string("codex"),
          "config": .object(["model": .string("gpt-5")]),
          "prompt": .string("hello"),
        ]
      ))
    XCTAssertEqual(
      RichChatCapturingURLProtocol.requests.first?.value(
        forHTTPHeaderField: ProtocolConstants.commandIdHeader),
      "thread-start:thread-1"
    )
  }

  func testHistoryAndCheckpointFixturesRoundTripThroughTransport() async throws {
    let history = try RichJSON.object(loadRichChatFixture("thread-history.json"))
    try RichChatCapturingURLProtocol.enqueueJSON(history)
    let checkpointFixture = try loadRichChatFixture("checkpoint-turn-sequences.json")
    let capture = try richFixtureObject(
      try XCTUnwrap(try richFixtureArray(try XCTUnwrap(checkpointFixture["captures"])).first))
    try RichChatCapturingURLProtocol.enqueueJSON(
      .object(["result": try XCTUnwrap(capture["result"])]))
    try RichChatCapturingURLProtocol.enqueueJSON(
      .object(["result": try XCTUnwrap(checkpointFixture["listResult"])]))

    let api = makeAPI()
    let snapshot = try await api.richHistory(threadID: "thread-fixture-001", targetEntryCount: 50)
    XCTAssertEqual(snapshot.snapshotSeq, 42)
    XCTAssertEqual(snapshot.runtimeItems.first?.id, "item-fixture-assistant")

    let location = ProjectLocation.posix(path: "/srv/fixture")
    let checkpoint = try await api.richCreateCheckpoint(
      threadID: "thread-rich", itemID: "rich-user-1", projectLocation: location)
    XCTAssertEqual(checkpoint.checkpointItemID, "rich-user-1")
    let collection = try await api.richListCheckpoints(
      threadID: "thread-rich", projectLocation: location)
    XCTAssertEqual(collection.checkpoints.count, 2)
    XCTAssertEqual(collection.turns.count, 2)

    // F1: the production rich-history read is the negotiated bounded tail
    // (no fixture-global switch), and a response without the echo is the only
    // legacy outcome.
    XCTAssertEqual(
      RichChatCapturingURLProtocol.requests[0].url?.query,
      "reads=bounded-v1&runtimePage=1&completedTurnsLimit=200"
        + "&targetTimelineEntryCount=50&maxBytes=33554432&maxDecodeBytes=67108864"
    )
    for index in 1...2 {
      XCTAssertEqual(RichChatCapturingURLProtocol.requests[index].url?.path, "/prefix/api/git/call")
    }
  }

  func testMalformedOrLostMutationIsAmbiguousAndNeverRetried() async throws {
    try RichChatCapturingURLProtocol.enqueueJSON(.object(["ok": .bool(false)]))
    let api = makeAPI()
    do {
      try await api.richClearSteer(threadID: "thread")
      XCTFail("Expected ambiguous outcome")
    } catch let failure as RichChatTransportFailure {
      XCTAssertEqual(failure, .ambiguousOutcome)
    }
    XCTAssertEqual(RichChatCapturingURLProtocol.requests.count, 1)

    RichChatCapturingURLProtocol.reset()
    try RichChatCapturingURLProtocol.enqueueJSON(.object([:]), status: 500)
    do {
      try await api.richClearSteer(threadID: "thread")
      XCTFail("Expected ambiguous outcome")
    } catch let failure as RichChatTransportFailure {
      XCTAssertEqual(failure, .ambiguousOutcome)
    }
    XCTAssertEqual(RichChatCapturingURLProtocol.requests.count, 1)
  }

  func testMutationFailureClassificationTable() async throws {
    let ambiguousStatuses = [500, 503]
    for status in ambiguousStatuses {
      RichChatCapturingURLProtocol.reset()
      try RichChatCapturingURLProtocol.enqueueJSON(.object([:]), status: status)
      let api = makeAPI()
      do {
        try await api.richSend(
          threadID: "thread-1",
          input: RichChatSendInput(
            prompt: "hello", config: ["model": .string("gpt-5")], userMessageItemID: "user-\(status)"
          ))
        XCTFail("status \(status): expected ambiguous outcome")
      } catch let failure as RichChatTransportFailure {
        XCTAssertEqual(failure, .ambiguousOutcome, "status \(status)")
      } catch {
        XCTFail("status \(status): unexpected error \(error)")
      }
      XCTAssertEqual(RichChatCapturingURLProtocol.requests.count, 1, "no retry: \(status)")
    }
    let definiteStatuses = [400, 403]
    for status in definiteStatuses {
      RichChatCapturingURLProtocol.reset()
      try RichChatCapturingURLProtocol.enqueueJSON(.object([:]), status: status)
      let api = makeAPI()
      do {
        try await api.richInterrupt(threadID: "thread-1")
        XCTFail("status \(status): expected definite rejection")
      } catch let error as RemoteClientError {
        XCTAssertEqual(error.status, status, "status \(status)")
      } catch {
        XCTFail("status \(status): unexpected error \(error)")
      }
      XCTAssertEqual(RichChatCapturingURLProtocol.requests.count, 1, "no retry: \(status)")
    }
  }

  func testExplicitUncertainReceipt409IsAmbiguousWhileOrdinaryConflictsAreDefinite() async throws {
    try RichChatCapturingURLProtocol.enqueueJSON(
      .object([
        "error": .object([
          "code": .string("command_outcome_uncertain"),
          "message": .string("Remote command outcome is uncertain and was not repeated."),
        ])
      ]),
      status: 409
    )
    let api = makeAPI()
    do {
      try await api.richSend(
        threadID: "thread-1",
        input: RichChatSendInput(
          prompt: "hello", config: ["model": .string("gpt-5")], userMessageItemID: "user-1"))
      XCTFail("Expected ambiguous outcome")
    } catch let failure as RichChatTransportFailure {
      XCTAssertEqual(failure, .ambiguousOutcome)
    } catch {
      XCTFail("Unexpected error \(error)")
    }
    XCTAssertEqual(RichChatCapturingURLProtocol.requests.count, 1, "never resend")

    RichChatCapturingURLProtocol.reset()
    try RichChatCapturingURLProtocol.enqueueJSON(
      .object([
        "error": .object([
          "code": .string("command_id_conflict"),
          "message": .string("Remote command id was already used for another operation."),
        ])
      ]),
      status: 409
    )
    let definiteAPI = makeAPI()
    do {
      try await definiteAPI.richInterrupt(threadID: "thread-1")
      XCTFail("Expected definite rejection")
    } catch let error as RemoteClientError {
      XCTAssertEqual(error.status, 409)
      XCTAssertEqual(error.code, "command_id_conflict")
    } catch {
      XCTFail("Unexpected error \(error)")
    }
    XCTAssertEqual(RichChatCapturingURLProtocol.requests.count, 1, "never resend")
  }

  @MainActor
  func testUncertainReceipt409ReachesConversationStateAsAmbiguousWithOneRefresh() async throws {
    try RichChatCapturingURLProtocol.enqueueJSON(
      .object([
        "error": .object([
          "code": .string("command_outcome_uncertain"),
          "message": .string("Remote command outcome is uncertain and was not repeated."),
        ])
      ]),
      status: 409
    )
    let api = makeAPI()
    let access = RichChatControllerTestValues.access()
    let box = RichChatUncertainSelectionBox(
      selection: RichChatTransportSelection(access: access, api: api)
    )
    let gateway = SelectedRichChatSessionGateway { box.selection }
    let refresh = RichChatRefreshRecorder()
    let controller = RichChatConversationController(gateway: gateway, refreshRequester: refresh)
    controller.activate(access: access, threadID: "thread-rich")

    let sent = await controller.send(
      RichChatSendInput(prompt: "hello", config: ["model": .string("gpt-5")])
    )

    XCTAssertFalse(sent)
    XCTAssertEqual(controller.state.failure, .ambiguousOutcome)
    let requests = await refresh.requests
    XCTAssertEqual(requests.map(\.1), [.ambiguousMutation])
    XCTAssertEqual(RichChatCapturingURLProtocol.requests.count, 1, "never resend")
  }

  func testTransportDropAfterSendIsAmbiguousAndNotRetried() async throws {
    RichChatCapturingURLProtocol.failure = URLError(.notConnectedToInternet)
    let api = makeAPI()
    do {
      try await api.richWriteTerminal(threadID: "thread-1", data: "ls\n")
      XCTFail("Expected ambiguous outcome")
    } catch let failure as RichChatTransportFailure {
      XCTAssertEqual(failure, .ambiguousOutcome)
    }
    XCTAssertEqual(RichChatCapturingURLProtocol.requests.count, 1)
  }

  func testReadFailuresStayDefiniteIncluding5xx() async throws {
    try RichChatCapturingURLProtocol.enqueueJSON(.object([:]), status: 503)
    let api = makeAPI()
    do {
      _ = try await api.richHistory(threadID: "thread-1", targetEntryCount: 10)
      XCTFail("Expected definite read failure")
    } catch let error as RemoteClientError {
      XCTAssertEqual(error.status, 503)
    } catch is RichChatTransportFailure {
      XCTFail("Read failures must never be classified as ambiguous")
    }
    XCTAssertEqual(RichChatCapturingURLProtocol.requests.count, 1)
  }

  private func makeAPI() -> GeneratedRichChatRemoteAPI {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [RichChatCapturingURLProtocol.self]
    let client = RemoteAPIClient(
      endpoint: "https://relay.test/prefix",
      accessToken: "access-secret",
      session: URLSession(configuration: configuration)
    )
    return GeneratedRichChatRemoteAPI(json: client)
  }

  private func body(_ index: Int) throws -> [String: RichJSON] {
    try XCTUnwrap(
      try RichJSON.decode(try XCTUnwrap(RichChatCapturingURLProtocol.bodies[index])).objectValue)
  }
}

@MainActor
private final class RichChatUncertainSelectionBox {
  var selection: RichChatTransportSelection?

  init(selection: RichChatTransportSelection) {
    self.selection = selection
  }
}
