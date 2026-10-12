import XCTest

@testable import App

/// Stage B mirror of the Android queue-parity pins: shared-fixture decoding,
/// generated-contract round-trips, transcript replace/tri-state/buffered
/// ordering, and conversation-gateway routing for all queue operations.
@MainActor
final class RichChatFollowUpQueueTests: XCTestCase {
  private let fixtureName = "thread-follow-up-queue-envelope.json"

  // MARK: - Fixture decoding

  func testFixtureBroadcastsApplyReplaceAndClear() throws {
    let broadcasts = try richFixtureArray(
      try XCTUnwrap(try loadRichChatFixture(fixtureName)["broadcasts"]))

    let set = try RichFollowUpQueueDecoder.decodeEnvelope(broadcasts[0])
    XCTAssertEqual(set.threadID, "thread-rich")
    XCTAssertEqual(set.queue?.items.map(\.id), ["queue-rich-1", "queue-rich-2"])
    XCTAssertEqual(set.queue?.items[1].segments?.count, 3)
    XCTAssertEqual(set.queue?.paused, false)

    let paused = try RichFollowUpQueueDecoder.decodeEnvelope(broadcasts[1])
    XCTAssertEqual(paused.queue?.items.isEmpty, true)
    XCTAssertEqual(paused.queue?.paused, true)

    let cleared = try RichFollowUpQueueDecoder.decodeEnvelope(broadcasts[2])
    XCTAssertNil(cleared.queue)

    XCTAssertThrowsError(
      try RichFollowUpQueueDecoder.decodeEnvelope(
        .object(["type": .string("thread-follow-up-queue"), "threadId": .string("t")])))
  }

  // MARK: - Generated contract round-trip against the fixture

  func testProcedureRequestsMatchTheFixtureAcrossGeneratedCodecs() throws {
    let root = try loadRichChatFixture(fixtureName)
    let requests = try richFixtureObject(try XCTUnwrap(root["procedureRequests"]))
    let fixtureItems = try richFixtureArray(
      try XCTUnwrap(try richFixtureObject(try XCTUnwrap(root["snapshotField"]))["items"]))
    let segments = fixtureItems[1].objectValue?["segments"]?.arrayValue

    func assertRoundTrip(
      _ data: Data,
      procedure: String,
      expected: [String: RichJSON],
      file: StaticString = #filePath,
      line: UInt = #line
    ) throws {
      let envelope = try richFixtureObject(try RichJSON.decode(data))
      XCTAssertEqual(envelope["procedure"], .string(procedure), file: file, line: line)
      XCTAssertEqual(
        try richFixtureObject(try XCTUnwrap(envelope["payload"], file: file, line: line)),
        expected,
        file: file,
        line: line
      )
    }

    // Without segments the payload equals the fixture exactly (no `segments`
    // key); with segments they ride along after the same canonical codec.
    let queueRequest = try richFixtureObject(try XCTUnwrap(requests["queueThreadFollowUp"]))
    let setBody = try RichPendingSteerDecoder.decodeSetBody(.object(queueRequest))
    try assertRoundTrip(
      GeneratedRemoteV3Contract.richQueueFollowUpRequest(
        threadID: "thread-rich", input: setBody),
      procedure: "queueThreadFollowUp",
      expected: queueRequest
    )
    let setWithSegments = RichSetPendingSteerInput(
      prompt: setBody.prompt,
      segments: try segments?.map { try RichPendingSteerDecoder.decodeSegment($0) },
      config: setBody.config
    )
    try assertRoundTrip(
      GeneratedRemoteV3Contract.richQueueFollowUpRequest(
        threadID: "thread-rich", input: setWithSegments),
      procedure: "queueThreadFollowUp",
      expected: queueRequest.merging(["segments": .array(try XCTUnwrap(segments))]) { _, value in value }
    )

    let itemProcedures: [(String, String)] = [
      ("removeQueuedThreadFollowUp", "queue-rich-1"),
      ("steerQueuedThreadFollowUp", "queue-rich-2"),
      ("pauseThreadFollowUps", "queue-rich-1"),
    ]
    for (procedure, itemID) in itemProcedures {
      let enumCase = try XCTUnwrap(RichChatProcedure(rawValue: procedure))
      try assertRoundTrip(
        GeneratedRemoteV3Contract.richQueuedFollowUpItemRequest(
          enumCase, threadID: "thread-rich", itemID: itemID),
        procedure: procedure,
        expected: try richFixtureObject(try XCTUnwrap(requests[procedure]))
      )
    }

    try assertRoundTrip(
      GeneratedRemoteV3Contract.richReorderQueuedFollowUpRequest(
        threadID: "thread-rich", itemID: "queue-rich-2", beforeID: nil),
      procedure: "reorderQueuedThreadFollowUp",
      expected: try richFixtureObject(try XCTUnwrap(requests["reorderQueuedThreadFollowUp"]))
    )

    let editRequest = try richFixtureObject(try XCTUnwrap(requests["editQueuedThreadFollowUp"]))
    let edit = RichQueuedFollowUpEdit(
      id: try XCTUnwrap(editRequest["id"]?.stringValue),
      expectedStagedAtMilliseconds: try XCTUnwrap(editRequest["expectedStagedAt"]?.exactInt64Value),
      prompt: try XCTUnwrap(editRequest["prompt"]?.stringValue),
      segments: nil
    )
    try assertRoundTrip(
      GeneratedRemoteV3Contract.richEditQueuedFollowUpRequest(threadID: "thread-rich", edit: edit),
      procedure: "editQueuedThreadFollowUp",
      expected: editRequest
    )

    try assertRoundTrip(
      GeneratedRemoteV3Contract.richThreadFollowUpsRequest(
        .resumeThreadFollowUps, threadID: "thread-rich"),
      procedure: "resumeThreadFollowUps",
      expected: try richFixtureObject(try XCTUnwrap(requests["resumeThreadFollowUps"]))
    )

    let getResult = try GeneratedRemoteV3Contract.richProcedureResult(
      .getThreadFollowUpQueue,
      envelope: try JSONEncoder().encode(["result": try XCTUnwrap(root["getResult"])])
    )
    let decodedGet = try RichFollowUpQueueDecoder.decodeQueue(try XCTUnwrap(getResult))
    XCTAssertEqual(decodedGet.items.map(\.id), ["queue-rich-1"])
    XCTAssertEqual(decodedGet.paused, true)
  }

  // MARK: - Transcript semantics

  func testBroadcastsReplaceAndClearOnlyForTheSelectedThread() async throws {
    let controller = RichChatTranscriptController(gateway: RichChatControllerGatewayFake())
    let access = RichChatControllerTestValues.access()
    let target = RichChatControllerTestValues.target()
    controller.activate(access: access, threadID: target.threadID)
    let broadcasts = try richFixtureArray(
      try XCTUnwrap(try loadRichChatFixture(fixtureName)["broadcasts"]))
    let set = try RichFollowUpQueueDecoder.decodeEnvelope(broadcasts[0])
    let paused = try RichFollowUpQueueDecoder.decodeEnvelope(broadcasts[1])
    let clear = try RichFollowUpQueueDecoder.decodeEnvelope(broadcasts[2])

    controller.receiveFollowUpQueue(set, sequence: 11, target: target)
    XCTAssertEqual(controller.state.followUpQueue?.items.map(\.id), ["queue-rich-1", "queue-rich-2"])

    controller.receiveFollowUpQueue(
      RichFollowUpQueueEnvelope(threadID: "thread-other", queue: paused.queue),
      sequence: 12,
      target: target
    )
    XCTAssertEqual(controller.state.followUpQueue?.items.count, 2)

    controller.receiveFollowUpQueue(paused, sequence: 12, target: target)
    XCTAssertEqual(controller.state.followUpQueue?.paused, true)
    XCTAssertEqual(controller.state.followUpQueue?.items.isEmpty, true)

    controller.receiveFollowUpQueue(clear, sequence: 13, target: target)
    XCTAssertNil(controller.state.followUpQueue)
  }

  func testHistoryInstallIsTriStateForTheQueueField() async {
    let gateway = RichChatControllerGatewayFake()
    let controller = RichChatTranscriptController(gateway: gateway)
    let target = RichChatControllerTestValues.target()
    controller.activate(access: RichChatControllerTestValues.access(), threadID: target.threadID)

    // Live queue exists, then a snapshot with an absent field installs:
    // preserve the projection (the supervisor read failed).
    controller.receiveFollowUpQueue(
      RichFollowUpQueueEnvelope(
        threadID: target.threadID,
        queue: RichFollowUpQueue(items: [pending("queue-live")], paused: false)),
      sequence: 11,
      target: target
    )
    await gateway.configureHistory(.value(RichChatControllerTestValues.history(sequence: 20)))
    await controller.loadHistory()
    XCTAssertEqual(controller.state.followUpQueue?.items.map(\.id), ["queue-live"])

    // An explicit wire null clears.
    await gateway.configureHistory(
      .value(
        RichChatControllerTestValues.history(
          sequence: 30, followUpQueue: nil, followUpQueuePresent: true)))
    await controller.loadHistory()
    XCTAssertNil(controller.state.followUpQueue)

    // An object installs.
    await gateway.configureHistory(
      .value(
        RichChatControllerTestValues.history(
          sequence: 40,
          followUpQueue: .object([
            "items": .array([
              .object([
                "id": .string("queue-snapshot"), "prompt": .string("From snapshot"),
                "stagedAt": .number(1),
              ])
            ]),
            "paused": .bool(false),
          ]),
          followUpQueuePresent: true)))
    await controller.loadHistory()
    XCTAssertEqual(controller.state.followUpQueue?.items.map(\.id), ["queue-snapshot"])
  }

  /// The iOS mirror of the Android A4 pin: a broadcast buffered during the
  /// history read is newer than the snapshot and must win over both the
  /// failed (absent) field and an older snapshot value; a broadcast at or
  /// below the snapshot baseline was already reflected and must drop.
  func testBufferedQueueBroadcastsReplayOverTheInstallBase() async throws {
    let barrier = RichChatControllerTestBarrier()
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureHistory(
      .value(RichChatControllerTestValues.history(sequence: 10)), barrier: barrier)
    let controller = RichChatTranscriptController(gateway: gateway)
    let target = RichChatControllerTestValues.target()
    controller.activate(access: RichChatControllerTestValues.access(), threadID: target.threadID)

    let loading = Task { await controller.loadHistory() }
    await barrier.waitUntilReached()
    controller.receiveFollowUpQueue(
      RichFollowUpQueueEnvelope(
        threadID: target.threadID,
        queue: RichFollowUpQueue(items: [pending("queue-stale")], paused: false)),
      sequence: 9,
      target: target
    )
    controller.receiveFollowUpQueue(
      RichFollowUpQueueEnvelope(
        threadID: target.threadID,
        queue: RichFollowUpQueue(items: [pending("queue-new")], paused: false)),
      sequence: 11,
      target: target
    )
    await barrier.release()
    await loading.value

    XCTAssertEqual(controller.state.followUpQueue?.items.map(\.id), ["queue-new"])
  }

  // MARK: - B6 recovery-slot bounds

  /// B6 acceptance: a delayed history read plus many queue changes retains one
  /// replacement state; the newest sequence wins even when a stale broadcast
  /// arrives afterward, and a retransmitted sequence keeps the later arrival.
  func testDelayedHistoryRetainsOnlyTheNewestQueueReplacement() async throws {
    let barrier = RichChatControllerTestBarrier()
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureHistory(
      .value(RichChatControllerTestValues.history(sequence: 10)), barrier: barrier)
    let controller = RichChatTranscriptController(gateway: gateway)
    let target = RichChatControllerTestValues.target()
    controller.activate(access: RichChatControllerTestValues.access(), threadID: target.threadID)

    let loading = Task { await controller.loadHistory() }
    await barrier.waitUntilReached()
    for sequence in 11...60 {
      controller.receiveFollowUpQueue(
        RichFollowUpQueueEnvelope(threadID: target.threadID, queue: queue("queue-\(sequence)")),
        sequence: sequence,
        target: target
      )
    }
    // A late stale broadcast must not downgrade the retained newest state.
    controller.receiveFollowUpQueue(
      RichFollowUpQueueEnvelope(threadID: target.threadID, queue: queue("queue-stale")),
      sequence: 9,
      target: target
    )
    // A retransmitted sequence keeps the later arrival.
    controller.receiveFollowUpQueue(
      RichFollowUpQueueEnvelope(threadID: target.threadID, queue: queue("queue-60-retransmit")),
      sequence: 60,
      target: target
    )
    await barrier.release()
    await loading.value

    XCTAssertEqual(controller.state.followUpQueue?.items.map(\.id), ["queue-60-retransmit"])
  }

  /// A buffered state at or below the snapshot baseline was already reflected
  /// in the install and must drop; the snapshot value wins.
  func testBufferedQueueAtOrBelowSnapshotCannotOverrideTheInstall() async throws {
    let barrier = RichChatControllerTestBarrier()
    let gateway = RichChatControllerGatewayFake()
    var history = RichChatControllerTestValues.history(sequence: 10)
    history.followUpQueue = queueObject("queue-snapshot")
    history.followUpQueuePresent = true
    await gateway.configureHistory(.value(history), barrier: barrier)
    let controller = RichChatTranscriptController(gateway: gateway)
    let target = RichChatControllerTestValues.target()
    controller.activate(access: RichChatControllerTestValues.access(), threadID: target.threadID)

    let loading = Task { await controller.loadHistory() }
    await barrier.waitUntilReached()
    controller.receiveFollowUpQueue(
      RichFollowUpQueueEnvelope(threadID: target.threadID, queue: queue("queue-stale")),
      sequence: 9,
      target: target
    )
    controller.receiveFollowUpQueue(
      RichFollowUpQueueEnvelope(threadID: target.threadID, queue: queue("queue-at-baseline")),
      sequence: 10,
      target: target
    )
    await barrier.release()
    await loading.value

    XCTAssertEqual(controller.state.followUpQueue?.items.map(\.id), ["queue-snapshot"])
  }

  /// Host switch and stale generations release or refuse the retained state: a
  /// broadcast for another host/stale generation is dropped, and switching the
  /// selected host before the delayed read returns clears the slot so the new
  /// host's snapshot installs its own queue.
  func testHostSwitchAndStaleGenerationCannotInstallBufferedQueue() async throws {
    let barrier = RichChatControllerTestBarrier()
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureHistory(
      .value(RichChatControllerTestValues.history(sequence: 10)), barrier: barrier)
    let controller = RichChatTranscriptController(gateway: gateway)
    let target = RichChatControllerTestValues.target()
    controller.activate(access: RichChatControllerTestValues.access(), threadID: target.threadID)

    let loading = Task { await controller.loadHistory() }
    await barrier.waitUntilReached()
    controller.receiveFollowUpQueue(
      RichFollowUpQueueEnvelope(threadID: target.threadID, queue: queue("queue-host-a")),
      sequence: 11,
      target: target
    )
    // Wrong host and stale host generation broadcasts never reach the slot.
    controller.receiveFollowUpQueue(
      RichFollowUpQueueEnvelope(threadID: target.threadID, queue: queue("queue-host-b")),
      sequence: 12,
      target: RichChatControllerTestValues.target(host: RichChatControllerTestValues.hostB)
    )
    controller.receiveFollowUpQueue(
      RichFollowUpQueueEnvelope(threadID: target.threadID, queue: queue("queue-stale-generation")),
      sequence: 13,
      target: RichChatControllerTestValues.target(generation: 99)
    )

    controller.activate(
      access: RichChatControllerTestValues.access(host: RichChatControllerTestValues.hostB),
      threadID: target.threadID
    )
    await barrier.release()
    await loading.value

    var fresh = RichChatControllerTestValues.history(sequence: 20)
    fresh.followUpQueue = queueObject("queue-snapshot-b")
    fresh.followUpQueuePresent = true
    await gateway.configureHistory(.value(fresh))
    await controller.loadHistory()

    XCTAssertEqual(
      controller.state.target?.lease.connectionID, RichChatControllerTestValues.hostB)
    XCTAssertEqual(controller.state.followUpQueue?.items.map(\.id), ["queue-snapshot-b"])
  }

  /// Cancelling an in-flight history read releases the retained state, so a
  /// later load cannot replay a queue captured for the abandoned read.
  func testCancelledHistoryReleasesBufferedQueueState() async throws {
    let barrier = RichChatControllerTestBarrier()
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureHistory(
      .value(RichChatControllerTestValues.history(sequence: 10)), barrier: barrier)
    let controller = RichChatTranscriptController(gateway: gateway)
    let access = RichChatControllerTestValues.access()
    let target = RichChatControllerTestValues.target()
    controller.activate(access: access, threadID: target.threadID)

    let loading = Task { await controller.loadHistory() }
    await barrier.waitUntilReached()
    controller.receiveFollowUpQueue(
      RichFollowUpQueueEnvelope(threadID: target.threadID, queue: queue("queue-abandoned")),
      sequence: 11,
      target: target
    )
    controller.enterBackground()
    await barrier.release()
    await loading.value
    controller.leaveBackground(access: access)

    var fresh = RichChatControllerTestValues.history(sequence: 20)
    fresh.followUpQueue = queueObject("queue-fresh")
    fresh.followUpQueuePresent = true
    await gateway.configureHistory(.value(fresh))
    await controller.loadHistory()

    XCTAssertEqual(controller.state.followUpQueue?.items.map(\.id), ["queue-fresh"])
  }

  // MARK: - Conversation operations

  func testQueueOperationsRideTheConversationGateway() async {
    let gateway = RichChatControllerGatewayFake()
    let controller = RichChatConversationController(gateway: gateway)
    controller.activate(access: RichChatControllerTestValues.access(), threadID: "thread-rich")

    let queued = await controller.queueFollowUp(
      RichSetPendingSteerInput(prompt: "Run the integration suite.", segments: nil, config: [:]))
    XCTAssertTrue(queued)
    _ = await controller.steerQueuedFollowUp(id: "queue-1")
    await controller.removeQueuedFollowUp(id: "queue-1")
    await controller.reorderQueuedFollowUp(id: "queue-2", beforeID: nil)
    let pausedNow = await controller.pauseFollowUps(id: "queue-1")
    XCTAssertTrue(pausedNow)
    let edited = await controller.editQueuedFollowUp(
      RichQueuedFollowUpEdit(
        id: "queue-1", expectedStagedAtMilliseconds: 1, prompt: "Edited.", segments: nil))
    XCTAssertTrue(edited)
    await controller.resumeFollowUps()

    let calls = await gateway.calls
    XCTAssertEqual(
      calls.filter { $0.hasPrefix("queue-") },
      [
        "queue-set", "queue-steer", "queue-remove", "queue-reorder", "queue-pause",
        "queue-edit", "queue-resume",
      ]
    )
  }

  private func pending(_ id: String) -> RichPendingSteer {
    RichPendingSteer(id: id, prompt: "Run the integration suite.", segments: nil, stagedAtMilliseconds: 1)
  }

  private func queue(_ id: String) -> RichFollowUpQueue {
    RichFollowUpQueue(items: [pending(id)], paused: false)
  }

  private func queueObject(_ id: String) -> JSONValue {
    .object([
      "items": .array([
        .object([
          "id": .string(id),
          "prompt": .string("Run the integration suite."),
          "stagedAt": .number(1),
        ])
      ]),
      "paused": .bool(false),
    ])
  }
}
