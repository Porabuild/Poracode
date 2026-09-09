import XCTest

#if canImport(App)
  @testable import App
#elseif canImport(RichChatDomain)
  @testable import RichChatDomain
#endif

@MainActor
final class RichChatTranscriptControllerTests: XCTestCase {
  func testFixtureHistoryInstallsAuthoritativelyThenReplaysOneNewLiveBatch() async throws {
    let fixture = try loadRichChatFixture("rich-persisted-transcript.json")
    let persisted = try JSONDecoder().decode(
      [PersistedRuntimeItem].self,
      from: JSONEncoder().encode(try XCTUnwrap(fixture["runtimeItems"]))
    )
    let turns = try JSONDecoder().decode(
      [JSONValue].self,
      from: JSONEncoder().encode(try XCTUnwrap(fixture["completedTurns"]))
    )
    let barrier = RichChatControllerTestBarrier()
    let gateway = RichChatControllerGatewayFake()
    let history = RemoteThreadSnapshot(
      snapshotSeq: 10,
      thread: RichChatControllerTestValues.thread(),
      runtimeItems: persisted,
      runtimeNextCursor: 3,
      completedTurns: turns,
      contextUsage: .object(["used": .number(12)]),
      terminalScrollback: "ready",
      updatedAt: "2026-08-12T00:00:00.000Z"
    )
    await gateway.configureHistory(.value(history), barrier: barrier)
    let controller = RichChatTranscriptController(gateway: gateway)
    let access = RichChatControllerTestValues.access()
    let target = RichChatControllerTestValues.target()
    controller.activate(access: access, threadID: target.threadID)

    let loading = Task { await controller.loadHistory() }
    await barrier.waitUntilReached()
    let live: [RichRuntimeEvent] = [
      .itemStarted(
        threadID: target.threadID,
        itemID: "live",
        itemType: RichItemType.assistantMessage,
        payload: .omitted,
        parentItemID: nil
      ),
      .contentDelta(
        threadID: target.threadID,
        itemID: "live",
        stream: "assistant_text",
        delta: "new"
      ),
      .itemCompleted(
        threadID: target.threadID,
        itemID: "live",
        payload: .omitted
      ),
    ]
    controller.receiveLiveEvents(live, sequence: 11, target: target)
    controller.receiveLiveEvents(live, sequence: 11, target: target)
    controller.receiveLiveEvents(
      live,
      sequence: 12,
      target: RichChatControllerTestValues.target(host: RichChatControllerTestValues.hostB)
    )
    await barrier.release()
    await loading.value

    XCTAssertEqual(controller.state.transcript?.itemsInOrder.count, persisted.count + 1)
    XCTAssertEqual(controller.state.transcript?.itemsByID["live"]?.streams["assistant_text"], "new")
    XCTAssertEqual(controller.state.liveSequence, 11)
    XCTAssertEqual(controller.state.completedTurns.count, 2)
    XCTAssertEqual(controller.state.terminalScrollback, "ready")
    XCTAssertEqual(controller.state.loadState, .loaded)
  }

  func testHostSwitchCancelsGatedHistoryAndLateResultCannotInstall() async {
    let barrier = RichChatControllerTestBarrier()
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureHistory(
      .value(
        RichChatControllerTestValues.history(items: [
          RichChatControllerTestValues.persistedItem(id: "old-host")
        ])),
      barrier: barrier
    )
    let controller = RichChatTranscriptController(gateway: gateway)
    controller.activate(access: RichChatControllerTestValues.access(), threadID: "thread-rich")
    let loading = Task { await controller.loadHistory() }
    await barrier.waitUntilReached()

    controller.activate(
      access: RichChatControllerTestValues.access(host: RichChatControllerTestValues.hostB),
      threadID: "replacement"
    )
    await barrier.release()
    await loading.value

    XCTAssertEqual(controller.state.target?.threadID, "replacement")
    XCTAssertTrue(controller.state.transcript?.itemsInOrder.isEmpty == true)
    XCTAssertEqual(controller.state.loadState, .idle)
  }

  func testPaginationPrependsUniqueItemsAndPreservesLiveRequestAndTurn() async {
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureHistory(.value(RichChatControllerTestValues.history()))
    await gateway.configurePage(
      .value(
        RemoteRuntimeItemsPage(
          items: [
            RichChatControllerTestValues.persistedItem(id: "older"),
            RichChatControllerTestValues.persistedItem(id: "history"),
          ],
          nextCursor: nil
        )))
    let controller = RichChatTranscriptController(gateway: gateway)
    let target = RichChatControllerTestValues.target()
    controller.activate(access: RichChatControllerTestValues.access(), threadID: target.threadID)
    await controller.loadHistory()
    let payload = RichRequestPayload(
      summary: "Allow?",
      details: nil,
      options: nil,
      multiSelect: nil
    )
    controller.receiveLiveEvents(
      [
        .turnStarted(threadID: target.threadID, turnID: "turn"),
        .requestOpened(
          threadID: target.threadID,
          requestID: .text("request"),
          requestType: .toolCallApproval,
          payload: payload
        ),
      ],
      sequence: 11,
      target: target
    )

    await controller.loadOlder()

    XCTAssertEqual(controller.state.transcript?.orderedItemIDs, ["older", "history"])
    XCTAssertEqual(controller.state.transcript?.openRequests.map(\.id), [.text("request")])
    XCTAssertEqual(controller.state.transcript?.openTurn, true)
    XCTAssertNil(controller.state.olderCursor)
  }

  // MARK: - context.updated / usage.spent / warning

  func testSnapshotContextHydratesThenBufferedAndLiveReportsMergeShallowly() async throws {
    let barrier = RichChatControllerTestBarrier()
    let gateway = RichChatControllerGatewayFake()
    var history = RichChatControllerTestValues.history(sequence: 10)
    history.contextUsage = .object([
      "usedTokens": .number(100),
      "maxTokens": .number(8192),
      "breakdown": .array([
        .object([
          "id": .string("system"), "label": .string("System"), "tokens": .number(40),
        ])
      ]),
    ])
    await gateway.configureHistory(.value(history), barrier: barrier)
    let controller = RichChatTranscriptController(gateway: gateway)
    let target = RichChatControllerTestValues.target()
    controller.activate(access: RichChatControllerTestValues.access(), threadID: target.threadID)

    let loading = Task { await controller.loadHistory() }
    await barrier.waitUntilReached()
    // Stale (<= snapshotSeq) batch must be discarded by the authoritative install.
    controller.receiveLiveEvents(
      [contextEvent(target.threadID, usedTokens: 999, maxTokens: 4096)],
      sequence: 9,
      target: target
    )
    // Buffered newer batch replays over the snapshot and only replaces usedTokens.
    controller.receiveLiveEvents(
      [contextEvent(target.threadID, usedTokens: 250)],
      sequence: 11,
      target: target
    )
    await barrier.release()
    await loading.value

    XCTAssertEqual(
      controller.state.contextUsage,
      RichContextUsage(
        usedTokens: 250,
        maxTokens: 8192,
        breakdown: [RichContextBreakdownEntry(id: "system", label: "System", tokens: 40)]
      ))
    XCTAssertEqual(controller.state.liveSequence, 11)

    // A later live batch reporting only maxTokens retains usedTokens + breakdown.
    controller.receiveLiveEvents(
      [contextEvent(target.threadID, maxTokens: 16384)],
      sequence: 12,
      target: target
    )
    XCTAssertEqual(
      controller.state.contextUsage,
      RichContextUsage(
        usedTokens: 250,
        maxTokens: 16384,
        breakdown: [RichContextBreakdownEntry(id: "system", label: "System", tokens: 40)]
      ))
  }

  func testMalformedSnapshotContextInstallsNothingAndLeavesIndicatorHidden() async {
    let gateway = RichChatControllerGatewayFake()
    var history = RichChatControllerTestValues.history()
    history.contextUsage = .object(["usedTokens": .number(-1), "maxTokens": .number(8192)])
    await gateway.configureHistory(.value(history))
    let controller = RichChatTranscriptController(gateway: gateway)
    let target = RichChatControllerTestValues.target()
    controller.activate(access: RichChatControllerTestValues.access(), threadID: target.threadID)
    await controller.loadHistory()

    XCTAssertNil(controller.state.contextUsage)
    XCTAssertNil(RichChatPresentation.contextUsage(controller.state.contextUsage))
    XCTAssertEqual(controller.state.loadState, .loaded)
  }

  func testDuplicateAndOutOfOrderContextSequencesStayIdempotentAndGapsStillApply() async {
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureHistory(.value(RichChatControllerTestValues.history(sequence: 10)))
    let controller = RichChatTranscriptController(gateway: gateway)
    let target = RichChatControllerTestValues.target()
    controller.activate(access: RichChatControllerTestValues.access(), threadID: target.threadID)
    await controller.loadHistory()

    let first = [contextEvent(target.threadID, usedTokens: 100, maxTokens: 8192)]
    controller.receiveLiveEvents(first, sequence: 11, target: target)
    controller.receiveLiveEvents(first, sequence: 11, target: target)
    XCTAssertEqual(
      controller.state.contextUsage,
      RichContextUsage(usedTokens: 100, maxTokens: 8192, breakdown: nil),
      "a replayed seq must be a no-op, not a re-merge"
    )

    // A seq lower than the watermark cannot roll context back.
    controller.receiveLiveEvents(
      [contextEvent(target.threadID, usedTokens: 1)],
      sequence: 10,
      target: target
    )
    XCTAssertEqual(controller.state.contextUsage?.usedTokens, 100)

    // A gap in the sequence still applies; the watermark jumps forward.
    controller.receiveLiveEvents(
      [contextEvent(target.threadID, usedTokens: 400)],
      sequence: 30,
      target: target
    )
    XCTAssertEqual(controller.state.contextUsage?.usedTokens, 400)
    XCTAssertEqual(controller.state.liveSequence, 30)
  }

  func testStaleHostThreadAndBackgroundOwnershipCannotMutateContext() async {
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureHistory(.value(RichChatControllerTestValues.history(sequence: 10)))
    let controller = RichChatTranscriptController(gateway: gateway)
    let access = RichChatControllerTestValues.access()
    let target = RichChatControllerTestValues.target()
    controller.activate(access: access, threadID: target.threadID)
    await controller.loadHistory()
    controller.receiveLiveEvents(
      [contextEvent(target.threadID, usedTokens: 100, maxTokens: 8192)],
      sequence: 11,
      target: target
    )
    let installed = controller.state.contextUsage

    // Wrong host.
    controller.receiveLiveEvents(
      [contextEvent(target.threadID, usedTokens: 1)],
      sequence: 12,
      target: RichChatControllerTestValues.target(host: RichChatControllerTestValues.hostB)
    )
    // Stale host generation.
    controller.receiveLiveEvents(
      [contextEvent(target.threadID, usedTokens: 2)],
      sequence: 13,
      target: RichChatControllerTestValues.target(generation: 99)
    )
    // Wrong thread on the right host lease.
    controller.receiveLiveEvents(
      [contextEvent("thread-other", usedTokens: 3)],
      sequence: 14,
      target: RichChatControllerTestValues.target(threadID: "thread-other")
    )
    // Mixed batch whose event threadId disagrees with the target thread.
    controller.receiveLiveEvents(
      [contextEvent("thread-other", usedTokens: 4)],
      sequence: 15,
      target: target
    )
    XCTAssertEqual(controller.state.contextUsage, installed)
    XCTAssertEqual(controller.state.liveSequence, 11)

    // Backgrounded ownership drops live context entirely.
    controller.enterBackground()
    controller.receiveLiveEvents(
      [contextEvent(target.threadID, usedTokens: 5)],
      sequence: 16,
      target: target
    )
    controller.leaveBackground(access: access)
    XCTAssertEqual(controller.state.contextUsage, installed)
    XCTAssertEqual(controller.state.liveSequence, 11)
  }

  func testLiveUsageSpentAndWarningConsumeSequenceWithoutMutatingState() async throws {
    let fixture = try loadRichChatFixtureArray("runtime-events.json")
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureHistory(.value(RichChatControllerTestValues.history(sequence: 10)))
    let controller = RichChatTranscriptController(gateway: gateway)
    let target = RichChatControllerTestValues.target()
    controller.activate(access: RichChatControllerTestValues.access(), threadID: target.threadID)
    await controller.loadHistory()
    let before = controller.state

    // The shared fixture events name thread-fixture-001; retarget the controller
    // by decoding the fixture payload with the selected thread id substituted.
    var spentPayload = try richChatFixtureEvent("usage.spent", in: fixture)
    spentPayload["threadId"] = .string(target.threadID)
    var warningPayload = try richChatFixtureEvent("warning", in: fixture)
    warningPayload["threadId"] = .string(target.threadID)
    let events = [
      try RichRuntimeEventDecoder.decode(.object(spentPayload)),
      try RichRuntimeEventDecoder.decode(.object(warningPayload)),
    ]

    controller.receiveLiveEvents(events, sequence: 11, target: target)

    XCTAssertEqual(controller.state.transcript, before.transcript)
    XCTAssertEqual(controller.state.completedTurns, before.completedTurns)
    XCTAssertNil(controller.state.contextUsage)
    XCTAssertEqual(
      controller.state.liveSequence, 11,
      "intentional no-ops still consume the sequence exactly once"
    )
  }

  private func contextEvent(
    _ threadID: String,
    usedTokens: Int64? = nil,
    maxTokens: Int64? = nil
  ) -> RichRuntimeEvent {
    .contextUpdated(
      threadID: threadID,
      usage: RichContextUsage(usedTokens: usedTokens, maxTokens: maxTokens, breakdown: nil)
    )
  }

  func testBackgroundCancelsLoadAndDropsLiveEventsWithoutReplay() async {
    let gateway = RichChatControllerGatewayFake()
    let controller = RichChatTranscriptController(gateway: gateway)
    let target = RichChatControllerTestValues.target()
    let access = RichChatControllerTestValues.access()
    controller.activate(access: access, threadID: target.threadID)
    controller.enterBackground()
    controller.receiveLiveEvents(
      [.turnStarted(threadID: target.threadID, turnID: "ignored")],
      sequence: 1,
      target: target
    )
    controller.leaveBackground(access: access)

    XCTAssertNil(controller.state.transcript?.openTurn)
    XCTAssertEqual(controller.state.liveSequence, -1)
  }

  // MARK: - history turn baseline (status-derived openTurn)

  /// The snapshot status is the only authoritative open-turn evidence a history
  /// install has; every live-turn status must open the marker even though the
  /// persisted rows only carry completed turns.
  func testInitialHistoryLoadSeedsOpenTurnAcrossActiveStatusDomain() async throws {
    for status in ["launching", "working", "needs_approval", "needs_reply"] {
      let gateway = RichChatControllerGatewayFake()
      await gateway.configureHistory(.value(Self.history(status: status)))
      let controller = RichChatTranscriptController(gateway: gateway)
      let target = RichChatControllerTestValues.target()
      controller.activate(access: RichChatControllerTestValues.access(), threadID: target.threadID)

      await controller.loadHistory()

      XCTAssertEqual(
        controller.state.transcript?.openTurn, true,
        "\(status) is a live-turn status and must open the marker on first open")
      XCTAssertEqual(controller.state.loadState, .loaded)
    }
  }

  func testInitialHistoryLoadClosesMarkerAcrossInactiveStatusDomain() async throws {
    for status in ["idle", "finished", "error", "inactive"] {
      let gateway = RichChatControllerGatewayFake()
      await gateway.configureHistory(.value(Self.history(status: status)))
      let controller = RichChatTranscriptController(gateway: gateway)
      let target = RichChatControllerTestValues.target()
      controller.activate(access: RichChatControllerTestValues.access(), threadID: target.threadID)

      await controller.loadHistory()

      XCTAssertEqual(
        controller.state.transcript?.openTurn, false,
        "\(status) is a settled status and must not open the marker")
    }
  }

  func testForegroundHistoryRefreshKeepsActiveTurnOpen() async throws {
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureHistory(.value(Self.history(status: "idle")))
    let controller = RichChatTranscriptController(gateway: gateway)
    let target = RichChatControllerTestValues.target()
    controller.activate(access: RichChatControllerTestValues.access(), threadID: target.threadID)
    await controller.loadHistory()
    controller.receiveLiveEvents(
      [.turnStarted(threadID: target.threadID, turnID: "live")],
      sequence: 11,
      target: target
    )
    XCTAssertEqual(controller.state.transcript?.openTurn, true)

    // Foreground refresh (`refreshAuthoritativeHistory`) mid-turn: the fresh
    // snapshot still reports a working thread, so the marker must survive the
    // authoritative rebuild instead of being reset with the transcript.
    await gateway.configureHistory(.value(Self.history(status: "working")))
    await controller.loadHistory()

    XCTAssertEqual(
      controller.state.transcript?.openTurn, true,
      "a working-status refresh must not close the live open turn")
  }

  func testFreshIdleHistoryClosesPreviouslyActiveTurn() async throws {
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureHistory(.value(Self.history(status: "working")))
    let controller = RichChatTranscriptController(gateway: gateway)
    let target = RichChatControllerTestValues.target()
    controller.activate(access: RichChatControllerTestValues.access(), threadID: target.threadID)
    await controller.loadHistory()
    XCTAssertEqual(controller.state.transcript?.openTurn, true)

    // The turn genuinely ended while the marker was open: the fresh idle
    // status is authoritative and must close it (capturing the prior marker
    // would resurrect a finished turn).
    await gateway.configureHistory(.value(Self.history(status: "idle")))
    await controller.loadHistory()

    XCTAssertEqual(
      controller.state.transcript?.openTurn, false,
      "a settled-status refresh must close the stale open turn")
  }

  func testNewerBufferedTurnCompletedOverridesActiveBaseline() async throws {
    let barrier = RichChatControllerTestBarrier()
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureHistory(.value(Self.history(status: "working")), barrier: barrier)
    let controller = RichChatTranscriptController(gateway: gateway)
    let target = RichChatControllerTestValues.target()
    controller.activate(access: RichChatControllerTestValues.access(), threadID: target.threadID)

    let loading = Task { await controller.loadHistory() }
    await barrier.waitUntilReached()
    // A stale (<= snapshotSeq) end is dropped by the authoritative install;
    // a buffered end newer than the snapshot wins over the working baseline.
    controller.receiveLiveEvents(
      [.turnCompleted(threadID: target.threadID, turnID: "stale", state: .completed)],
      sequence: 9,
      target: target
    )
    controller.receiveLiveEvents(
      [.turnCompleted(threadID: target.threadID, turnID: "fresh", state: .completed)],
      sequence: 11,
      target: target
    )
    await barrier.release()
    await loading.value

    XCTAssertEqual(
      controller.state.transcript?.openTurn, false,
      "a buffered turn end newer than the snapshot must override the active baseline")
    XCTAssertEqual(controller.state.liveSequence, 11)
  }

  func testNewerBufferedTurnStartedOverridesIdleBaseline() async throws {
    let barrier = RichChatControllerTestBarrier()
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureHistory(.value(Self.history(status: "idle")), barrier: barrier)
    let controller = RichChatTranscriptController(gateway: gateway)
    let target = RichChatControllerTestValues.target()
    controller.activate(access: RichChatControllerTestValues.access(), threadID: target.threadID)

    let loading = Task { await controller.loadHistory() }
    await barrier.waitUntilReached()
    controller.receiveLiveEvents(
      [.turnStarted(threadID: target.threadID, turnID: "fresh")],
      sequence: 11,
      target: target
    )
    await barrier.release()
    await loading.value

    XCTAssertEqual(
      controller.state.transcript?.openTurn, true,
      "a buffered turn start newer than the snapshot must override the idle baseline")
    XCTAssertEqual(controller.state.liveSequence, 11)
  }

  func testPaginationKeepsClosedBaselineClosed() async throws {
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureHistory(.value(Self.history(status: "idle")))
    await gateway.configurePage(
      .value(
        RemoteRuntimeItemsPage(
          items: [RichChatControllerTestValues.persistedItem(id: "older")],
          nextCursor: nil
        )))
    let controller = RichChatTranscriptController(gateway: gateway)
    let target = RichChatControllerTestValues.target()
    controller.activate(access: RichChatControllerTestValues.access(), threadID: target.threadID)
    await controller.loadHistory()

    await controller.loadOlder()

    XCTAssertEqual(controller.state.transcript?.orderedItemIDs, ["older", "history"])
    // The page response carries no status, so pagination preserves an open
    // marker but has nothing to derive a closed one from — it must simply
    // never fabricate one (every consumer gates on `openTurn == true`).
    XCTAssertNotEqual(
      controller.state.transcript?.openTurn, true,
      "pagination has no status evidence and must not fabricate an open turn")
  }

  private static func history(status: String, sequence: Int = 10) -> RemoteThreadSnapshot {
    var snapshot = RichChatControllerTestValues.history(sequence: sequence)
    snapshot.thread.status = status
    return snapshot
  }
}
