import XCTest

@testable import App

final class GeneratedRichChatContractTests: XCTestCase {
  func testSendGoalSteerRequestAndCommandCrossGeneratedRoots() throws {
    let send = try GeneratedRemoteV3Contract.richSend(
      threadID: "thread /東京",
      input: RichChatSendInput(
        prompt: "ship it",
        config: ["model": .string("gpt-5")],
        segments: [.attachment(path: "/tmp/a b.txt", mimeType: "text/plain")],
        userMessageItemID: "user-1"
      )
    )
    XCTAssertEqual(send.pathValues["threadId"], "thread /東京")
    let sendBody = try object(send.body)
    XCTAssertEqual(sendBody["prompt"], .string("ship it"))
    XCTAssertEqual(sendBody["userMessageItemId"], .string("user-1"))
    XCTAssertEqual(sendBody["segments"]?.arrayValue?.count, 1)

    let goal = try GeneratedRemoteV3Contract.richGoal(
      threadID: "thread", update: .edit(objective: "  Deliver native chat  "))
    XCTAssertEqual(try object(goal.body)["objective"], .string("Deliver native chat"))
    XCTAssertThrowsError(
      try GeneratedRemoteV3Contract.richGoal(
        threadID: "thread", update: .edit(objective: " \n ")))

    let steerFixture = try loadRichChatFixture("thread-pending-steer-envelope.json")
    let steerInput = try RichPendingSteerDecoder.decodeSetBody(
      try XCTUnwrap(steerFixture["setBody"]))
    let steer = try GeneratedRemoteV3Contract.richSetSteer(
      threadID: "thread", input: steerInput)
    XCTAssertEqual(try object(steer.body)["prompt"], .string("Please include the attachment."))

    let resolution = try GeneratedRemoteV3Contract.richResolveRequest(
      threadID: "thread",
      resolution: RichChatRequestResolution(
        requestID: .number(1), method: "resolve", response: .bool(true)))
    XCTAssertEqual(try object(resolution.body)["requestId"], .number(1))

    let command = try GeneratedRemoteV3Contract.richThreadCommand(
      threadID: "thread",
      command: RichChatThreadCommand(payload: ["kind": .string("acknowledge")]))
    XCTAssertEqual(try object(command.body), ["kind": .string("acknowledge")])
  }

  func testCheckpointFixtureRequestsAndResultsCrossGeneratedRoots() throws {
    let fixture = try loadRichChatFixture("checkpoint-turn-sequences.json")
    let capture = try richFixtureObject(
      try XCTUnwrap(try richFixtureArray(try XCTUnwrap(fixture["captures"])).first))
    let request = try richFixtureObject(try XCTUnwrap(capture["request"]))
    let body = try GeneratedRemoteV3Contract.richCreateCheckpointRequest(
      threadID: try string(request, "threadId"),
      checkpointItemID: try string(request, "checkpointItemId"),
      projectLocation: try decode(ProjectLocation.self, request["projectLocation"])
    )
    let envelope = try object(body)
    XCTAssertEqual(envelope["procedure"], .string("createFileCheckpoint"))

    let result = try GeneratedRemoteV3Contract.richProcedureResult(
      .createFileCheckpoint,
      envelope: try data(.object(["result": try XCTUnwrap(capture["result"])]))
    )
    let checkpoint = try RichCheckpointDecoder.decode(
      try XCTUnwrap(result?.objectValue?["checkpoint"]))
    XCTAssertEqual(checkpoint.checkpointItemID, "rich-user-1")
    XCTAssertFalse(checkpoint.isTurn)

    let listResult = try GeneratedRemoteV3Contract.richProcedureResult(
      .listFileCheckpoints,
      envelope: try data(.object(["result": try XCTUnwrap(fixture["listResult"])]))
    )
    XCTAssertEqual(listResult?.objectValue?["turns"]?.arrayValue?.count, 2)
    XCTAssertNil(
      try GeneratedRemoteV3Contract.richProcedureResult(
        .stageThreadInput, envelope: Data("{}".utf8)))
    XCTAssertThrowsError(
      try GeneratedRemoteV3Contract.richProcedureResult(
        .stageThreadInput, envelope: Data(#"{"result":null}"#.utf8)))
  }

  func testAttachmentAndRuntimeImageFixtureBoundariesCrossGeneratedQueries() throws {
    let fixture = try loadRichChatFixture("attachment-boundaries.json")
    for entry in try richFixtureArray(try XCTUnwrap(fixture["cases"])) {
      let value = try richFixtureObject(entry)
      let length = Int(try XCTUnwrap(value["nameLength"]?.exactInt64Value))
      let expected = try richFixtureObject(try XCTUnwrap(value["expected"]))
      let accepted = expected["queryValid"]?.boolValue == true
      XCTAssertEqual(
        Result {
          try GeneratedRemoteV3Contract.richAttachmentUpload(
            threadID: "thread-rich", name: String(repeating: "a", count: length))
        }.isSuccess,
        accepted,
        value["id"]?.stringValue ?? ""
      )
    }

    let markers = try loadRichChatFixture("rich-image-markers.json")
    let valid = try richFixtureObject(try XCTUnwrap(markers["valid"]))
    let reference = try XCTUnwrap(RichImagePolicy.decodeRemoteReference(valid["nestedRef"]))
    let route = try GeneratedRemoteV3Contract.richRuntimeImage(reference)
    XCTAssertEqual(route.pathValues["threadId"], "thread-rich")
    XCTAssertEqual(route.pathValues["itemId"], "image-rich")
    XCTAssertEqual(route.queryItems.map(\.name), ["path"])
    XCTAssertEqual(route.queryItems.first?.value, #"["result","content",1,"data"]"#)
  }

  func testTerminalFixturesAndUTF16GenerationBoundariesCrossSpecificWSRoots() throws {
    let watch = try fixtureData("ws-client-terminal-watch-cursor-sync-v1.json")
    let watchValue = try RichJSON.decode(watch).objectValue
    let watchMessage = try GeneratedRemoteV3Contract.richTerminalWatchMessage(
      terminalID: try XCTUnwrap(watchValue?["id"]?.stringValue),
      watchID: try XCTUnwrap(watchValue?["cursorSync"]?.objectValue?["watchId"]?.stringValue)
    )
    XCTAssertEqual(try RichJSON.decode(watchMessage), try RichJSON.decode(watch))

    let live = try GeneratedRemoteV3Contract.richTerminalServerFrame(
      fixtureData("ws-server-terminal-watch-result-live.json"))
    guard case .cursor(let baseline) = live else { return XCTFail("Expected baseline") }
    XCTAssertEqual(baseline.generation, "instance-fixture-aaa")
    XCTAssertEqual(baseline.toCursor, 11)

    let persisted = try GeneratedRemoteV3Contract.richTerminalServerFrame(
      fixtureData("ws-server-terminal-watch-result-persisted.json"))
    guard case .cursor(let persistedFrame) = persisted else {
      return XCTFail("Expected persisted baseline")
    }
    XCTAssertNil(persistedFrame.generation)

    let error = try GeneratedRemoteV3Contract.richTerminalServerFrame(
      fixtureData("ws-server-terminal-watch-result-error.json"))
    guard case .watchError(let failure) = error else { return XCTFail("Expected watch error") }
    XCTAssertEqual(failure.code, .notFound)
    XCTAssertFalse(failure.retryable)

    let emoji = try data(
      .object([
        "type": .string("terminal-output"),
        "id": .string("terminal"),
        "data": .string("😀"),
        "cursorSync": .object([
          "version": .number(1),
          "watchId": .string("watch"),
          "generation": .string("generation-a"),
          "fromCursor": .number(0),
          "toCursor": .number(2),
        ]),
      ]))
    guard
      case .cursor(let emojiFrame) = try GeneratedRemoteV3Contract.richTerminalServerFrame(emoji)
    else { return XCTFail("Expected UTF-16 cursor frame") }
    XCTAssertEqual(emojiFrame.toCursor, 2)

    let invalid = try data(
      .object([
        "type": .string("terminal-output"),
        "id": .string("terminal"),
        "data": .string("😀"),
        "cursorSync": .object([
          "version": .number(1),
          "watchId": .string("watch"),
          "generation": .string("generation-b"),
          "fromCursor": .number(0),
          "toCursor": .number(1),
        ]),
      ]))
    XCTAssertThrowsError(try GeneratedRemoteV3Contract.richTerminalServerFrame(invalid))
  }

  private func object(_ data: Data) throws -> [String: RichJSON] {
    try XCTUnwrap(try RichJSON.decode(data).objectValue)
  }

  private func data(_ value: RichJSON) throws -> Data {
    try JSONDecoding.encoder.encode(value)
  }

  private func string(_ object: [String: RichJSON], _ key: String) throws -> String {
    try XCTUnwrap(object[key]?.stringValue)
  }

  private func decode<Value: Decodable>(_ type: Value.Type, _ value: RichJSON?) throws -> Value {
    try JSONDecoding.decoder.decode(type, from: data(try XCTUnwrap(value)))
  }

  private func fixtureData(_ name: String) throws -> Data {
    try JSONDecoding.encoder.encode(RichJSON.object(loadRichChatFixture(name)))
  }
}

extension Result {
  fileprivate var isSuccess: Bool {
    if case .success = self { return true }
    return false
  }
}
