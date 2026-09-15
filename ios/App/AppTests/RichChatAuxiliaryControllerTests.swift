import XCTest

@testable import App

@MainActor
final class RichChatAuxiliaryControllerTests: XCTestCase {
  func testTerminalWatchOwnsCursorGenerationAndGapRequestsRefresh() async {
    let gateway = RichChatControllerGatewayFake()
    let refresh = RichChatRefreshRecorder()
    let controller = RichChatTerminalController(
      gateway: gateway,
      watchIDGenerator: RichChatFixedWatchIDGenerator(value: "watch-1"),
      refreshRequester: refresh
    )
    let target = RichChatControllerTestValues.target()
    controller.activate(access: RichChatControllerTestValues.access(), threadID: target.threadID)
    await controller.watch(terminalID: "terminal")
    await controller.receive(
      .cursor(
        TerminalCursorFrame(
          kind: .baseline,
          terminalID: "terminal",
          watchID: "watch-1",
          generation: "g1",
          fromCursor: 0,
          toCursor: 3,
          data: "abc"
        )),
      target: target
    )
    await controller.receive(
      .cursor(
        TerminalCursorFrame(
          kind: .output,
          terminalID: "terminal",
          watchID: "watch-1",
          generation: "g1",
          fromCursor: 5,
          toCursor: 6,
          data: "x"
        )),
      target: target
    )

    let refreshReasons = await refresh.requests.map(\.1)
    XCTAssertEqual(controller.state.cursor?.transcript, "abc")
    XCTAssertTrue(controller.state.cursor?.needsResync == true)
    XCTAssertEqual(refreshReasons, [.terminalCursorInvalidated])
  }

  func testStaleTerminalWatchAndBackgroundFramesAreIgnored() async {
    let gateway = RichChatControllerGatewayFake()
    let controller = RichChatTerminalController(
      gateway: gateway,
      watchIDGenerator: RichChatFixedWatchIDGenerator(value: "current")
    )
    let access = RichChatControllerTestValues.access()
    let target = RichChatControllerTestValues.target()
    controller.activate(access: access, threadID: target.threadID)
    await controller.watch(terminalID: "terminal")
    let stale = TerminalCursorFrame(
      kind: .baseline,
      terminalID: "terminal",
      watchID: "stale",
      generation: "g",
      fromCursor: 0,
      toCursor: 1,
      data: "x"
    )
    await controller.receive(.cursor(stale), target: target)
    XCTAssertFalse(controller.state.cursor?.baselineReceived == true)

    controller.enterBackground()
    await controller.receive(.cursor(stale), target: target)
    controller.leaveBackground(access: access)
    XCTAssertNil(controller.state.watchID)
    XCTAssertNil(controller.state.cursor)
  }

  func testTerminalWriteIsRejectedUntilWatchIsEstablished() async {
    let gateway = RichChatControllerGatewayFake()
    let controller = RichChatTerminalController(
      gateway: gateway,
      watchIDGenerator: RichChatFixedWatchIDGenerator(value: "watch-write")
    )
    controller.activate(
      access: RichChatControllerTestValues.access(),
      threadID: "thread-rich"
    )

    await controller.write("pwd\n")
    var calls = await gateway.calls
    XCTAssertEqual(controller.state.failure, .unavailable)
    XCTAssertFalse(calls.contains("terminal-write"))

    await controller.watch(terminalID: "terminal")
    await controller.write("pwd\n")
    calls = await gateway.calls
    XCTAssertTrue(calls.contains("terminal-write"))
  }

  func testRequestResolutionUsesRequestsScopeAndAmbiguityRefreshes() async {
    let gateway = RichChatControllerGatewayFake()
    let refresh = RichChatRefreshRecorder()
    await gateway.configureMutation(.failure(.ambiguousOutcome))
    let controller = RichChatRequestController(
      gateway: gateway,
      refreshRequester: refresh
    )
    controller.activate(access: RichChatControllerTestValues.access(), threadID: "thread-rich")
    let payload = RichRequestPayload(
      summary: "Approve",
      details: nil,
      options: nil,
      multiSelect: nil
    )
    let request = RichOpenRequest(
      requestID: .text("r1"),
      threadID: "thread-rich",
      type: .toolCallApproval,
      payload: payload,
      receivedAtMilliseconds: 0
    )

    await controller.resolve(
      RichChatRequestResolution(
        requestID: .text("r1"),
        method: "resolve",
        response: .object(["decision": .string("accepted")])
      ),
      request: request
    )

    let refreshReasons = await refresh.requests.map(\.1)
    XCTAssertEqual(controller.state.failure, .ambiguousOutcome)
    XCTAssertTrue(controller.state.requiresAuthoritativeRefresh)
    XCTAssertEqual(refreshReasons, [.ambiguousMutation])
  }

  func testCheckpointFixtureLoadsAndValidatedCreateAppends() async throws {
    let fixture = try loadRichChatFixture("checkpoint-turn-sequences.json")
    let list = try richFixtureObject(try XCTUnwrap(fixture["listResult"]))
    let collection = RichChatCheckpointCollection(
      checkpoints: try RichCheckpointDecoder.decodeList(try XCTUnwrap(list["checkpoints"])),
      turns: try RichCheckpointDecoder.decodeList(try XCTUnwrap(list["turns"]))
    )
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureCheckpointList(.value(collection))
    let controller = RichChatCheckpointController(
      historyGateway: gateway,
      conversationGateway: gateway
    )
    controller.activate(access: RichChatControllerTestValues.access(), threadID: "thread-rich")
    await controller.load(projectLocation: .posix(path: "/srv/fixture"))
    XCTAssertEqual(controller.state.collection.checkpoints.count, 2)
    XCTAssertEqual(controller.state.collection.turns.count, 2)

    let created = RichCheckpoint(
      threadID: "thread-rich",
      checkpointItemID: "new-item",
      ref: "refs/new",
      commit: "abc",
      capturedAt: "2026-08-12T00:00:00Z",
      baseCheckpointItemID: nil,
      baseRef: nil,
      changedFiles: nil
    )
    await gateway.configureCheckpoint(.value(created))
    await controller.create(
      itemID: "new-item",
      projectLocation: .posix(path: "/srv/fixture")
    )
    XCTAssertEqual(controller.state.collection.checkpoints.last, created)
  }

  func testAttachmentAndImagePlansEnforceDomainPolicyBeforeTransport() async {
    let rejected = RichChatMediaController.attachmentPlan(
      name: String(repeating: "a", count: 256),
      contentType: "text/plain",
      data: Data([1])
    )
    XCTAssertFalse(rejected.decision.accepted)
    XCTAssertNil(rejected.attachment)

    let accepted = RichChatMediaController.attachmentPlan(
      name: "note.txt",
      contentType: "text/plain",
      data: Data([1])
    )
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureString(.value("/attachments/note.txt"))
    await gateway.configureBinary(
      .value(RichChatBinaryPayload(data: Data([1, 2]), mimeType: "image/png")))
    let controller = RichChatMediaController(
      historyGateway: gateway,
      conversationGateway: gateway
    )
    controller.activate(access: RichChatControllerTestValues.access(), threadID: "thread-rich")
    await controller.upload(accepted)
    await controller.loadImage(.local(path: "/tmp/image.png"))

    XCTAssertEqual(controller.state.uploadedAttachmentPath, "/attachments/note.txt")
    XCTAssertEqual(controller.state.loadedImage?.mimeType, "image/png")
  }

  func testVisibleTimelineImagesLoadIndependently() async {
    let gateway = RichChatControllerGatewayFake()
    let payload = RichChatBinaryPayload(data: Data([1, 2]), mimeType: "image/png")
    await gateway.configureBinary(.value(payload))
    let controller = RichChatMediaController(
      historyGateway: gateway,
      conversationGateway: gateway
    )
    controller.activate(access: RichChatControllerTestValues.access(), threadID: "thread-rich")

    async let first = controller.fetchImagePayload(.local(path: "/tmp/one.png"))
    async let second = controller.fetchImagePayload(.local(path: "/tmp/two.png"))
    let results = await [first, second]
    let localImageCallCount = await gateway.calls.filter { $0 == "local-image" }.count

    XCTAssertEqual(results, [payload, payload])
    XCTAssertEqual(localImageCallCount, 2)
  }

  func testSuiteSelectionSwitchResetsEveryController() {
    let gateway = RichChatControllerGatewayFake()
    let suite = RichChatControllerSuite(gateway: gateway)
    suite.select(access: RichChatControllerTestValues.access(), threadID: "first")
    suite.select(
      access: RichChatControllerTestValues.access(host: RichChatControllerTestValues.hostB),
      threadID: "second"
    )

    XCTAssertEqual(suite.scope.target?.threadID, "second")
    XCTAssertEqual(suite.transcript.state.target, suite.scope.target)
    XCTAssertEqual(suite.conversation.state.target, suite.scope.target)
    XCTAssertEqual(suite.requests.state.target, suite.scope.target)
    XCTAssertEqual(suite.checkpoints.state.target, suite.scope.target)
    XCTAssertEqual(suite.media.state.target, suite.scope.target)
    XCTAssertEqual(suite.terminal.state.target, suite.scope.target)
  }

  func testAuthoritativeHistoryClearsAmbiguousBannerOnlyAfterSuccessfulRefresh() async {
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureMutation(.failure(.ambiguousOutcome))
    await gateway.configureHistory(.value(RichChatControllerTestValues.history()))
    let suite = RichChatControllerSuite(gateway: gateway)
    suite.select(access: RichChatControllerTestValues.access(), threadID: "thread-rich")

    await suite.conversation.rollback(turnCount: 1)
    XCTAssertTrue(suite.conversation.state.requiresAuthoritativeRefresh)
    await suite.refreshAuthoritativeHistory()
    XCTAssertFalse(suite.conversation.state.requiresAuthoritativeRefresh)
    XCTAssertNil(suite.conversation.state.failure)

    await suite.conversation.rollback(turnCount: 1)
    await gateway.configureHistory(.failure(.invalidResponse))
    await suite.refreshAuthoritativeHistory()
    XCTAssertTrue(suite.conversation.state.requiresAuthoritativeRefresh)
    XCTAssertEqual(suite.transcript.state.loadState, .failed(.invalidResponse))
  }
}
