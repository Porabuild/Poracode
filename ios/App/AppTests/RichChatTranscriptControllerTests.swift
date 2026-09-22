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

  func testOfflinePagingFailureClearsOnlyAfterSuccessfulAuthoritativeHistory() async {
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureHistory(.value(RichChatControllerTestValues.history()))
    let controller = RichChatTranscriptController(gateway: gateway)
    controller.activate(access: RichChatControllerTestValues.access(), threadID: "thread-rich")
    await controller.loadHistory()

    controller.updateAccess(RichChatControllerTestValues.access(online: false))
    await controller.loadOlder()
    XCTAssertEqual(controller.state.pageFailure, .offline)

    controller.updateAccess(RichChatControllerTestValues.access())
    await gateway.configureHistory(.failure(.invalidResponse))
    await controller.loadHistory()
    XCTAssertEqual(controller.state.pageFailure, .offline)

    await gateway.configureHistory(.value(RichChatControllerTestValues.history()))
    await controller.loadHistory()
    XCTAssertEqual(controller.state.loadState, .loaded)
    XCTAssertNil(controller.state.pageFailure)
    XCTAssertEqual(controller.state.olderCursor, 4)
    XCTAssertEqual(controller.state.transcript?.orderedItemIDs, ["history"])
  }

  func testAuthoritativeHistoryDoesNotClearPagingDomainFailure() async {
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureHistory(.value(RichChatControllerTestValues.history()))
    await gateway.configurePage(.failure(.http(statusCode: 403, code: "forbidden", missingScope: nil)))
    let controller = RichChatTranscriptController(gateway: gateway)
    controller.activate(access: RichChatControllerTestValues.access(), threadID: "thread-rich")
    await controller.loadHistory()
    await controller.loadOlder()
    let failure = controller.state.pageFailure
    XCTAssertNotNil(failure)
    XCTAssertNotEqual(failure, .offline)
    await controller.loadHistory()
    XCTAssertEqual(controller.state.pageFailure, failure)
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

  // MARK: - history read terminal paths (F-D1/F-D2)

  /// F-D1: a completed read whose snapshot names another thread is a host
  /// contract violation. It must end `.loading` with a truthful error and
  /// release the retained window instead of stranding the buffer with no read
  /// in flight and never applying (or re-requesting) the buffered frames.
  func testWrongThreadHistoryResponseFailsAndReleasesBufferedBatches() async {
    let barrier = RichChatControllerTestBarrier()
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureHistory(
      .value(RichChatControllerTestValues.history(threadID: "thread-other")),
      barrier: barrier
    )
    let controller = RichChatTranscriptController(gateway: gateway)
    let target = RichChatControllerTestValues.target()
    controller.activate(access: RichChatControllerTestValues.access(), threadID: target.threadID)

    let loading = Task { await controller.loadHistory() }
    await barrier.waitUntilReached()
    controller.receiveLiveEvents(
      [.turnStarted(threadID: target.threadID, turnID: "buffered")],
      sequence: 11,
      target: target
    )
    XCTAssertEqual(controller.state.loadState, .loading)
    XCTAssertEqual(controller.retainedHistoryBatchCount, 1)

    await barrier.release()
    await loading.value

    XCTAssertEqual(controller.state.loadState, .failed(.invalidResponse))
    XCTAssertEqual(
      controller.retainedHistoryBatchCount, 0,
      "the wrong-thread response must release the retained window")
    XCTAssertEqual(controller.state.liveSequence, -1)
    XCTAssertNil(controller.state.transcript?.openTurn)

    // The failure is retryable: a correct snapshot recovers and the dropped
    // wrong-thread window never replays over it.
    await gateway.configureHistory(
      .value(
        RichChatControllerTestValues.history(items: [
          RichChatControllerTestValues.persistedItem(id: "recovered")
        ])))
    await controller.loadHistory()
    XCTAssertEqual(controller.state.loadState, .loaded)
    XCTAssertEqual(controller.state.transcript?.orderedItemIDs, ["recovered"])
    XCTAssertNotEqual(
      controller.state.transcript?.openTurn, true,
      "the dropped wrong-thread window must not replay over the recovered snapshot")

    // Once the read has ended, live events apply directly again.
    controller.receiveLiveEvents(
      [.turnStarted(threadID: target.threadID, turnID: "live")],
      sequence: 12,
      target: target
    )
    XCTAssertEqual(controller.state.transcript?.openTurn, true)
    XCTAssertEqual(controller.state.liveSequence, 12)
  }

  /// F-D2: an owner-valid cancellation of the history read (caller teardown
  /// cancels the awaiting task) releases the retained batches like any other
  /// terminal path, so the ledger is never left open with no read in flight.
  func testOwnerValidCancellationReleasesRetainedHistoryBatches() async {
    let barrier = RichChatControllerTestBarrier()
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureHistory(
      .value(RichChatControllerTestValues.history()), barrier: barrier)
    let controller = RichChatTranscriptController(gateway: gateway)
    let target = RichChatControllerTestValues.target()
    controller.activate(access: RichChatControllerTestValues.access(), threadID: target.threadID)

    let loading = Task { await controller.loadHistory() }
    await barrier.waitUntilReached()
    controller.receiveLiveEvents(
      [.turnStarted(threadID: target.threadID, turnID: "buffered")],
      sequence: 11,
      target: target
    )
    XCTAssertEqual(controller.retainedHistoryBatchCount, 1)

    loading.cancel()
    await barrier.release()
    await loading.value

    XCTAssertEqual(controller.state.loadState, .idle)
    XCTAssertEqual(
      controller.retainedHistoryBatchCount, 0,
      "owner-valid cancellation must release the retained window")

    // The cancelled window is gone: a fresh read installs only the snapshot.
    await controller.loadHistory()
    XCTAssertEqual(controller.state.loadState, .loaded)
    XCTAssertEqual(controller.state.transcript?.orderedItemIDs, ["history"])
    XCTAssertEqual(controller.state.liveSequence, 10)
    XCTAssertNotEqual(
      controller.state.transcript?.openTurn, true,
      "the cancelled window must not replay over the fresh snapshot")
  }

  /// Real production deadline evidence: a URLSession custom protocol that never
  /// answers stalls the actual `RemoteAPIClient` request, and the request's
  /// short configured timeout (the same `URLRequest.timeoutInterval` production
  /// derives from `RemoteSocketPolicy.requestTimeoutSeconds`) must end the read
  /// and release the buffered batches — no fake clock, no injected timer.
  func testRealTransportTimeoutFailsAndReleasesRetainedBatches() async throws {
    RichChatStallingURLProtocol.reset()
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [RichChatStallingURLProtocol.self]
    let api = GeneratedRichChatRemoteAPI(
      json: RemoteAPIClient(
        endpoint: "https://relay.test/prefix",
        accessToken: "access-secret",
        session: URLSession(configuration: configuration),
        requestTimeout: 0.4
      ))
    let access = RichChatControllerTestValues.access()
    let target = RichChatControllerTestValues.target(threadID: "thread-fixture-001")
    let selection = RichChatTransportSelection(access: access, api: api)
    let gateway = SelectedRichChatSessionGateway { selection }
    let controller = RichChatTranscriptController(gateway: gateway)
    controller.activate(access: access, threadID: target.threadID)

    let requestStarted = expectation(description: "history request reached the transport")
    RichChatStallingURLProtocol.onStart = { requestStarted.fulfill() }
    let loading = Task { await controller.loadHistory() }
    await fulfillment(of: [requestStarted], timeout: 5)
    XCTAssertEqual(controller.state.loadState, .loading)

    // Sequence 100 outranks the fixture's snapshotSeq 42, so retention would
    // be observable as a replay if the timeout path failed to release it.
    controller.receiveLiveEvents(
      [.turnStarted(threadID: target.threadID, turnID: "stalled")],
      sequence: 100,
      target: target
    )
    XCTAssertEqual(controller.retainedHistoryBatchCount, 1)

    let deadline = Date().addingTimeInterval(5)
    while controller.state.loadState == .loading, Date() < deadline {
      try? await Task.sleep(for: .milliseconds(25))
    }
    guard controller.state.loadState != .loading else {
      loading.cancel()
      await loading.value
      XCTFail("the transport request deadline did not end the history read")
      return
    }
    await loading.value

    XCTAssertEqual(controller.state.loadState, .failed(.transport))
    XCTAssertEqual(
      controller.retainedHistoryBatchCount, 0,
      "the real request timeout must release the retained window")

    // Serve the valid snapshot next; the released stalled batch must not replay.
    let history = try RichJSON.object(loadRichChatFixture("thread-history.json"))
    RichChatStallingURLProtocol.respond(with: try JSONDecoding.encoder.encode(history))
    await controller.loadHistory()

    XCTAssertEqual(controller.state.loadState, .loaded)
    XCTAssertEqual(controller.state.snapshotSequence, 42)
    XCTAssertEqual(controller.state.liveSequence, 42)
    XCTAssertNotEqual(
      controller.state.transcript?.openTurn, true,
      "the released sequence-100 batch must not replay over snapshotSeq 42")
    XCTAssertEqual(RichChatStallingURLProtocol.startedCount, 2)
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

/// Test-only transport stub that stalls every request until the test supplies a
/// body, so the production `URLRequest` timeout is the release trigger.
private final class RichChatStallingURLProtocol: URLProtocol {
  private static let lock = NSLock()
  nonisolated(unsafe) private static var started = 0
  nonisolated(unsafe) private static var body: Data?
  nonisolated(unsafe) static var onStart: (() -> Void)?

  static var startedCount: Int {
    lock.lock()
    defer { lock.unlock() }
    return started
  }

  static func respond(with data: Data) {
    lock.lock()
    body = data
    lock.unlock()
  }

  static func reset() {
    lock.lock()
    started = 0
    body = nil
    onStart = nil
    lock.unlock()
  }

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    Self.lock.lock()
    Self.started += 1
    let responseBody = Self.body
    let onStart = Self.onStart
    Self.onStart = nil
    Self.lock.unlock()
    onStart?()
    guard let responseBody else { return }
    let response = HTTPURLResponse(
      url: request.url!, statusCode: 200, httpVersion: nil,
      headerFields: ["Content-Type": "application/json"]
    )!
    client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: responseBody)
    client?.urlProtocolDidFinishLoading(self)
  }

  override func stopLoading() {}
}
