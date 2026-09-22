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

  func testCheckpointOfflineGateFailureClearsAfterRenewedOnlineLoad() async throws {
    // Repro of the foreground/reconnect defect: `activate()` re-arms the suite
    // while the socket is still reconnecting, so the gated checkpoint load
    // records the `.offline` failure band. The later online reload that follows
    // the socket's fresh `.online` must clear that stale band — otherwise the
    // page displays "desktop is offline" indefinitely while the connection is
    // demonstrably live.
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureCheckpointList(
      .value(RichChatCheckpointCollection(checkpoints: [], turns: [])))
    let controller = RichChatCheckpointController(
      historyGateway: gateway,
      conversationGateway: gateway
    )
    controller.activate(access: RichChatControllerTestValues.access(), threadID: "thread-rich")
    await controller.load(projectLocation: .posix(path: "/srv/fixture"))
    XCTAssertNil(controller.state.failure)

    controller.updateAccess(RichChatControllerTestValues.access(online: false))
    await controller.load(projectLocation: .posix(path: "/srv/fixture"))
    XCTAssertEqual(controller.state.failure, .offline)

    controller.updateAccess(RichChatControllerTestValues.access(online: true))
    await controller.load(projectLocation: .posix(path: "/srv/fixture"))
    XCTAssertNil(
      controller.state.failure,
      "a successful online load must not leave the stale offline failure band"
    )
    XCTAssertEqual(controller.state.loadState, .empty)
  }

  func testSuiteOfflineBandsClearAfterSuccessfulAuthoritativeRefresh() async {
    // Same residual class as the checkpoint regression, on the other
    // `displayedFailure` producers. Timeline images are the reachable producer:
    // `RichChatImageView` fetches on appearance regardless of operate access, so
    // an image fetch during a reconnect window records `.offline` in the media
    // controller. The renewal must clear it, not only the ambiguous banner.
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureHistory(.value(RichChatControllerTestValues.history()))
    await gateway.configureBinary(
      .value(RichChatBinaryPayload(data: Data([1, 2]), mimeType: "image/png")))
    let suite = RichChatControllerSuite(gateway: gateway)
    suite.select(access: RichChatControllerTestValues.access(), threadID: "thread-rich")
    await suite.refreshAuthoritativeHistory()
    let onlinePayload = await suite.media.fetchImagePayload(.local(path: "/tmp/one.png"))
    XCTAssertNotNil(onlinePayload)
    XCTAssertNil(suite.media.state.failure)

    suite.updateAccess(RichChatControllerTestValues.access(online: false))
    let offlinePayload = await suite.media.fetchImagePayload(.local(path: "/tmp/one.png"))
    XCTAssertNil(offlinePayload)
    XCTAssertEqual(suite.media.state.failure, .offline)
    await suite.conversation.send(
      RichChatSendInput(prompt: "queued while offline", config: [:]))
    XCTAssertEqual(suite.conversation.state.failure, .offline)
    await suite.requests.resolve(
      RichChatRequestResolution(
        requestID: .text("r1"),
        method: "resolve",
        response: .object(["decision": .string("accepted")])
      ),
      request: RichOpenRequest(
        requestID: .text("r1"),
        threadID: "thread-rich",
        type: .toolCallApproval,
        payload: RichRequestPayload(
          summary: "Approve", details: nil, options: nil, multiSelect: nil),
        receivedAtMilliseconds: 0
      )
    )
    XCTAssertEqual(suite.requests.state.failure, .offline)
    let offlineCalls = await gateway.calls
    XCTAssertFalse(offlineCalls.contains("send"))
    let offlineImageCalls = offlineCalls.filter { $0 == "local-image" }.count
    XCTAssertEqual(
      offlineImageCalls, 1,
      "the offline refusal must not attempt a transport call beyond the online baseline")

    suite.updateAccess(RichChatControllerTestValues.access(online: true))
    await suite.refreshAuthoritativeHistory()
    XCTAssertEqual(suite.transcript.state.loadState, .loaded)
    XCTAssertNil(
      suite.media.state.failure,
      "a successful authoritative refresh must clear the offline band a gated image fetch recorded")
    XCTAssertNil(
      suite.conversation.state.failure,
      "a successful authoritative refresh must clear the offline band a gated send recorded")
    XCTAssertNil(
      suite.requests.state.failure,
      "a successful authoritative refresh must clear the offline band a gated resolution recorded")
    let renewedPayload = await suite.media.fetchImagePayload(.local(path: "/tmp/one.png"))
    XCTAssertNotNil(renewedPayload)
  }

  func testOfflineBandPersistsThroughFailedRefresh() async {
    // The clear is evidence-gated: while the renewed authoritative read still
    // fails, the recorded band stays so the page keeps telling the truth.
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureHistory(.value(RichChatControllerTestValues.history()))
    let suite = RichChatControllerSuite(gateway: gateway)
    suite.select(access: RichChatControllerTestValues.access(), threadID: "thread-rich")
    await suite.refreshAuthoritativeHistory()
    XCTAssertNil(suite.conversation.state.failure)

    suite.updateAccess(RichChatControllerTestValues.access(online: false))
    await suite.conversation.send(
      RichChatSendInput(prompt: "queued while offline", config: [:]))
    XCTAssertEqual(suite.conversation.state.failure, .offline)

    suite.updateAccess(RichChatControllerTestValues.access(online: true))
    await gateway.configureHistory(.failure(.invalidResponse))
    await suite.refreshAuthoritativeHistory()
    XCTAssertEqual(suite.transcript.state.loadState, .failed(.invalidResponse))
    XCTAssertEqual(
      suite.conversation.state.failure,
      .offline,
      "a failed refresh is not success evidence; the offline band must persist"
    )
  }

  func testAuthoritativeRefreshKeepsDomainFailuresAndOperationIdentity() async {
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureHistory(.value(RichChatControllerTestValues.history()))
    let suite = RichChatControllerSuite(gateway: gateway)
    suite.select(access: RichChatControllerTestValues.access(), threadID: "thread-rich")
    await suite.refreshAuthoritativeHistory()

    await gateway.configureMutation(
      .failure(.http(statusCode: 500, code: "boom", missingScope: nil)), for: "rollback")
    await suite.conversation.rollback(turnCount: 1)
    XCTAssertEqual(
      suite.conversation.state.failure, .rejected(statusCode: 500, code: "boom"))
    await suite.refreshAuthoritativeHistory()
    XCTAssertEqual(
      suite.conversation.state.failure,
      .rejected(statusCode: 500, code: "boom"),
      "only stale offline bands clear; domain failures survive the acknowledgement"
    )

    suite.updateAccess(RichChatControllerTestValues.access(online: false))
    await suite.conversation.send(RichChatSendInput(prompt: "refused", config: [:]))
    XCTAssertEqual(suite.conversation.state.failure, .offline)
    XCTAssertFalse(suite.conversation.state.isSending)
    XCTAssertNil(suite.conversation.state.activeMutation)
    XCTAssertNil(suite.conversation.state.lastCompletedOperation)
  }

  func testRetiredRefreshCannotClearCurrentHostsOfflineFailure() async {
    let gateway = RichChatControllerGatewayFake()
    let barrier = RichChatControllerTestBarrier()
    await gateway.configureHistory(.value(RichChatControllerTestValues.history()), barrier: barrier)
    let suite = RichChatControllerSuite(gateway: gateway)
    suite.select(access: RichChatControllerTestValues.access(), threadID: "thread-rich")
    let retiredRefresh = Task { await suite.refreshAuthoritativeHistory() }
    await barrier.waitUntilReached()

    let hostB = RichChatControllerTestValues.hostB
    suite.select(access: RichChatControllerTestValues.access(host: hostB), threadID: "thread-rich")
    await gateway.configureHistory(.value(RichChatControllerTestValues.history()))
    await suite.refreshAuthoritativeHistory()
    suite.updateAccess(RichChatControllerTestValues.access(host: hostB, online: false))
    _ = await suite.media.fetchImagePayload(.local(path: "/tmp/offline.png"))
    XCTAssertEqual(suite.media.state.failure, .offline)
    suite.updateAccess(RichChatControllerTestValues.access(host: hostB))

    await barrier.release()
    await retiredRefresh.value
    XCTAssertEqual(suite.media.state.failure, .offline,
      "a retired host refresh cannot acknowledge the current host's failure")
    await suite.refreshAuthoritativeHistory()
    XCTAssertNil(suite.media.state.failure)
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
