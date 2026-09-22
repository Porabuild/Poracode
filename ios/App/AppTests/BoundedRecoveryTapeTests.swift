import XCTest

@testable import App

/// Drives the shared `protocol/remote/v3/fixtures/bounded-recovery-tape.json`
/// semantic tape through the production recovery buffers, and adds focused
/// budget tests for the boundaries the tape does not reach directly
/// (`ReplayInstallBuffer`, rich-chat history-read batches).
///
/// The tape is client-local bookkeeping: count/byte/age bounds, oldest-first
/// eviction, coverage-loss recovery, replacement supersede, and release. No
/// expectation is re-authored in Swift.
@MainActor
final class BoundedRecoveryTapeTests: XCTestCase {

  // MARK: - Tape loading

  private func tape() throws -> [String: JSONValue] {
    try remoteFixtureObject("bounded-recovery-tape.json")
  }

  // MARK: - Tape identity

  func testTapeMatchesProtocolVersionAndAdditiveBoundary() throws {
    let root = try tape()
    XCTAssertEqual(root["id"]?.stringValue, "remote-v3-bounded-recovery-tape")
    XCTAssertEqual(
      try fixtureInt(root["protocolVersion"]), ProtocolConstants.remoteProtocolVersion
    )
    // Deliberate generation pin: raise consciously with the next protocol bump
    // and the committed tape together. Pure client-local bookkeeping does not
    // bump the wire protocol by itself.
    XCTAssertEqual(ProtocolConstants.remoteProtocolVersion, 12)
    XCTAssertEqual(root["versionBoundary"]?.stringValue, "fixture-only-additive")
  }

  // MARK: - Replacement slot

  private let hostA = ClientConnectionID(
    UUID(uuidString: "33333333-3333-4333-8333-333333333333")!)

  private func target(generation: UInt64) -> RichChatThreadTarget {
    RichChatThreadTarget(
      lease: RichChatHostLease(connectionID: hostA, generation: generation),
      threadID: "thread-tape"
    )
  }

  private func queue(_ state: String) -> RichFollowUpQueue {
    RichFollowUpQueue(
      items: [
        RichPendingSteer(id: state, prompt: state, segments: nil, stagedAtMilliseconds: 0)
      ],
      paused: false
    )
  }

  private func envelope(_ state: String) -> RichFollowUpQueueEnvelope {
    RichFollowUpQueueEnvelope(threadID: "thread-tape", queue: queue(state))
  }

  func testReplacementCasesDriveFollowUpQueueReplaySlot() throws {
    let root = try tape()
    let targetA = target(generation: 1)
    let targetB = target(generation: 2)
    for rawCase in try fixtureArray(root["replacementCases"]) {
      let entry = try fixtureObject(rawCase)
      let id = try fixtureString(entry["id"])
      let expected = try fixtureObject(entry["expected"])
      var slot = RichChatFollowUpQueueReplaySlot()
      for rawRecord in try fixtureArray(entry["records"]) {
        let record = try fixtureObject(rawRecord)
        slot.record(
          envelope(try fixtureString(record["state"])),
          sequence: try fixtureInt(record["sequence"]),
          target: targetA
        )
      }
      if entry["reset"]?.boolValue == true { slot.reset() }

      XCTAssertEqual(
        slot.retainedCount, try fixtureInt(expected["retainedCount"]), "\(id): retained count")
      XCTAssertLessThanOrEqual(slot.retainedCount, 1, "\(id): replacement count is hard-bounded")
      // A -1 snapshot baseline always lets a retained state win, so this reads
      // the retained state without mutating the slot.
      XCTAssertEqual(
        slot.replay(over: nil, snapshotSequence: -1, target: targetA)?.items.first?.id,
        expected["retainedState"]?.stringValue,
        "\(id): retained state"
      )

      let replayTarget = entry["replayTarget"]?.stringValue ?? "target-1"
      let destination = replayTarget == "target-2" ? targetB : targetA
      for rawReplay in try fixtureArray(expected["replays"]) {
        let replay = try fixtureObject(rawReplay)
        let result = slot.replay(
          over: queue(try fixtureString(replay["over"])),
          snapshotSequence: try fixtureInt(replay["snapshotSeq"]),
          target: destination
        )
        XCTAssertEqual(result?.items.first?.id, replay["state"]?.stringValue, "\(id): replay")
      }
    }
  }

  // MARK: - Replay-install boundary (count/bytes/age/release)

  func testReplayInstallBufferHonorsByteBudgetAndStaleGeneration() {
    var buffer = ReplayInstallBuffer(
      budget: RecoveryBufferBudget(maxCount: 8, maxBytes: 200, maxAgeMilliseconds: 600_000)
    )
    buffer.begin(installGeneration: 7)
    XCTAssertTrue(
      buffer.bufferIfInstalling(
        installGeneration: 7, seq: 11, event: .threadReset(threadId: "t"),
        estimatedByteCount: 100, receivedAtMilliseconds: 1
      )
    )
    XCTAssertFalse(
      buffer.bufferIfInstalling(
        installGeneration: 8, seq: 12, event: .threadReset(threadId: "t"),
        estimatedByteCount: 100, receivedAtMilliseconds: 2
      ),
      "a newer install never claims the frame"
    )
    XCTAssertTrue(
      buffer.bufferIfInstalling(
        installGeneration: 7, seq: 12, event: .threadReset(threadId: "t"),
        estimatedByteCount: 100, receivedAtMilliseconds: 2
      )
    )
    XCTAssertFalse(buffer.overflowed)
    XCTAssertTrue(
      buffer.bufferIfInstalling(
        installGeneration: 7, seq: 13, event: .threadReset(threadId: "t"),
        estimatedByteCount: 100, receivedAtMilliseconds: 3
      )
    )
    XCTAssertTrue(buffer.overflowed, "byte budget overflow must demand resync")
    XCTAssertEqual(buffer.buffered.map(\.seq), [12, 13])
    XCTAssertEqual(buffer.retainedBytes, 200)

    // The synthetic arrivals share this monotonic clock, so nothing expires.
    let taken = buffer.take(installGeneration: 7, nowMilliseconds: 3)
    XCTAssertEqual(taken?.envelopes.map(\.seq), [12, 13])
    XCTAssertEqual(taken?.coverageLost, true)
    XCTAssertFalse(buffer.overflowed)

    buffer.begin(installGeneration: 9)
    buffer.discard()
    XCTAssertTrue(buffer.buffered.isEmpty)
    XCTAssertEqual(buffer.retainedBytes, 0)
    XCTAssertFalse(buffer.overflowed)
  }

  func testReplayInstallBufferEvictsBeyondRetainedAgeBudget() {
    var buffer = ReplayInstallBuffer(
      budget: RecoveryBufferBudget(maxCount: 8, maxBytes: 1_000_000, maxAgeMilliseconds: 100)
    )
    buffer.begin(installGeneration: 3)
    for (seq, at) in [(11, 0), (12, 50), (13, 200)] {
      XCTAssertTrue(
        buffer.bufferIfInstalling(
          installGeneration: 3, seq: seq, event: .threadReset(threadId: "t"),
          estimatedByteCount: 10, receivedAtMilliseconds: Int64(at)
        )
      )
    }
    XCTAssertTrue(buffer.overflowed)
    XCTAssertEqual(buffer.buffered.map(\.seq), [13])
  }

  /// F3: a hung/quiet snapshot fetch must not replay a frame retained past the
  /// age budget. No new input arrives; the clock advances past the budget and
  /// the take drops the expired frame, reports coverage loss (→ requiresResync),
  /// and releases the retained payload.
  func testReplayInstallBufferDropsExpiredFramesAtTakeWithoutNewInput() throws {
    var buffer = ReplayInstallBuffer(
      budget: RecoveryBufferBudget(maxCount: 8, maxBytes: 1_000_000, maxAgeMilliseconds: 100)
    )
    buffer.begin(installGeneration: 4)
    for (seq, at) in [(11, 0), (12, 50)] {
      XCTAssertTrue(
        buffer.bufferIfInstalling(
          installGeneration: 4, seq: seq, event: .threadReset(threadId: "t"),
          estimatedByteCount: 10, receivedAtMilliseconds: Int64(at)
        )
      )
    }
    XCTAssertFalse(buffer.overflowed, "no append-time eviction happened")

    let taken = try XCTUnwrap(buffer.take(installGeneration: 4, nowMilliseconds: 120))
    XCTAssertEqual(taken.envelopes.map(\.seq), [12], "the expired head is never replayed")
    XCTAssertTrue(taken.coverageLost)
    XCTAssertTrue(buffer.buffered.isEmpty, "payload released")
    XCTAssertEqual(buffer.retainedBytes, 0)

    // Fully expired window: nothing replays, but recovery is still demanded.
    buffer.begin(installGeneration: 5)
    XCTAssertTrue(
      buffer.bufferIfInstalling(
        installGeneration: 5, seq: 11, event: .threadReset(threadId: "t"),
        estimatedByteCount: 10, receivedAtMilliseconds: 0
      )
    )
    let fullyExpired = try XCTUnwrap(buffer.take(installGeneration: 5, nowMilliseconds: 500))
    XCTAssertEqual(fullyExpired.envelopes, [])
    XCTAssertTrue(fullyExpired.coverageLost)
  }

  // MARK: - Rich-chat history-read batches

  private func deltaEvent(threadID: String, bytes: Int) -> RichRuntimeEvent {
    .contentDelta(
      threadID: threadID,
      itemID: "item",
      stream: "assistant_text",
      delta: String(repeating: "x", count: max(0, bytes))
    )
  }

  private func loadingController(
    budget: RecoveryBufferBudget,
    refresh: RichChatRefreshRecorder,
    barrier: RichChatControllerTestBarrier,
    clock: @escaping () -> Int64 = { RecoveryClock.nowMilliseconds() }
  ) async throws -> (RichChatTranscriptController, RichChatThreadTarget, Task<Void, Never>) {
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureHistory(
      .value(RichChatControllerTestValues.history()), barrier: barrier
    )
    let controller = RichChatTranscriptController(
      gateway: gateway,
      refreshRequester: refresh,
      transcriptBatchBudget: budget,
      clock: clock
    )
    let target = RichChatControllerTestValues.target()
    controller.activate(
      access: RichChatControllerTestValues.access(),
      threadID: target.threadID
    )
    let loading = Task { await controller.loadHistory() }
    await barrier.waitUntilReached()
    return (controller, target, loading)
  }

  func testTranscriptBatchByteBudgetForcesAuthoritativeRefresh() async throws {
    let refresh = RichChatRefreshRecorder()
    let barrier = RichChatControllerTestBarrier()
    let (controller, target, loading) = try await loadingController(
      budget: RecoveryBufferBudget(maxCount: 8, maxBytes: 300, maxAgeMilliseconds: 600_000),
      refresh: refresh,
      barrier: barrier
    )

    // Each batch estimates above maxBytes / 2 (so two exceed the budget and
    // the older is evicted) but below maxBytes (so a single batch is legal and
    // the newest window survives); the truncated replay must request recovery.
    for (seq, at) in [(11, 1_000), (12, 2_000), (13, 3_000)] {
      controller.receiveLiveEvents(
        [deltaEvent(threadID: target.threadID, bytes: 100)],
        sequence: seq,
        receivedAtMilliseconds: Int64(at),
        target: target
      )
    }
    await barrier.release()
    await loading.value

    XCTAssertEqual(controller.state.liveSequence, 13)
    XCTAssertTrue(controller.state.requiresAuthoritativeRefresh)
    let requests = await refresh.requests
    XCTAssertEqual(requests.count, 1)
    XCTAssertEqual(requests.first?.1, .transcriptInvalidated)
  }

  func testTranscriptBatchRetainedAgeBudgetEvictsAndForcesRecovery() async throws {
    let refresh = RichChatRefreshRecorder()
    let barrier = RichChatControllerTestBarrier()
    var now: Int64 = 0
    let (controller, target, loading) = try await loadingController(
      budget: RecoveryBufferBudget(maxCount: 8, maxBytes: 1_000_000, maxAgeMilliseconds: 500),
      refresh: refresh,
      barrier: barrier,
      clock: { now }
    )

    for (seq, at) in [(11, 1_000), (12, 2_000), (13, 3_000)] {
      now = Int64(at)
      controller.receiveLiveEvents(
        [deltaEvent(threadID: target.threadID, bytes: 150)],
        sequence: seq,
        receivedAtMilliseconds: Int64(at),
        target: target
      )
    }
    await barrier.release()
    await loading.value

    XCTAssertTrue(controller.state.requiresAuthoritativeRefresh)
    let requests = await refresh.requests
    XCTAssertEqual(requests.count, 1)
  }

  /// F3: no new input after the read starts — the monotonic clock advances
  /// past the budget while the history read hangs. The expired batches are
  /// released at commit, never replayed, and drive the existing bounded
  /// authoritative refresh instead.
  func testTranscriptBatchExpiredAtCommitWithoutNewInputForcesRecovery() async throws {
    let refresh = RichChatRefreshRecorder()
    let barrier = RichChatControllerTestBarrier()
    var now: Int64 = 0
    let (controller, target, loading) = try await loadingController(
      budget: RecoveryBufferBudget(maxCount: 8, maxBytes: 1_000_000, maxAgeMilliseconds: 500),
      refresh: refresh,
      barrier: barrier,
      clock: { now }
    )

    now = 1_000
    controller.receiveLiveEvents(
      [deltaEvent(threadID: target.threadID, bytes: 150)],
      sequence: 11,
      receivedAtMilliseconds: 1_000,
      target: target
    )
    now = 1_100
    controller.receiveLiveEvents(
      [deltaEvent(threadID: target.threadID, bytes: 150)],
      sequence: 12,
      receivedAtMilliseconds: 1_100,
      target: target
    )
    // Quiet stream: the read outlives the age budget with no new arrivals.
    now = 5_000
    await barrier.release()
    await loading.value

    XCTAssertEqual(
      controller.state.liveSequence, 10, "expired batches are never replayed over the snapshot")
    XCTAssertTrue(controller.state.requiresAuthoritativeRefresh)
    let requests = await refresh.requests
    XCTAssertEqual(requests.count, 1)
    XCTAssertEqual(requests.first?.1, .transcriptInvalidated)
  }

  /// Measured probe (pathological-regression guard, not a UI paint budget):
  /// the production entry path appends a bounded window for every live batch
  /// during a history read. It exercises the estimator and oldest-first
  /// eviction on the main actor; live-host UI dispatch/paint is not covered
  /// here (no paired live host in this environment).
  func testMeasuredAccountingProbeOnProductionEntryPath() async throws {
    let refresh = RichChatRefreshRecorder()
    let barrier = RichChatControllerTestBarrier()
    let (controller, target, loading) = try await loadingController(
      budget: RecoveryBufferBudget(
        maxCount: 512, maxBytes: 8 * 1024 * 1024, maxAgeMilliseconds: 600_000
      ),
      refresh: refresh,
      barrier: barrier
    )
    let event = deltaEvent(threadID: target.threadID, bytes: 512)
    let start = ContinuousClock.now
    for sequence in 0..<50_000 {
      controller.receiveLiveEvents(
        [event],
        sequence: sequence,
        receivedAtMilliseconds: Int64(sequence),
        target: target
      )
    }
    let elapsed = ContinuousClock.now - start
    await barrier.release()
    await loading.value
    XCTAssertTrue(controller.state.requiresAuthoritativeRefresh)
    XCTAssertLessThan(elapsed, .seconds(20), "accounting regression guard")
    print("B6 bounds probe: 50000 buffered appends in \(elapsed)")
  }

  func testEstimatorsCoverJSONAndRichEvents() throws {
    let value = JSONValue.object([
      "type": .string("content.delta"),
      "delta": .string(String(repeating: "x", count: 100)),
    ])
    XCTAssertGreaterThanOrEqual(value.recoveryByteCount, 100)
    let encoded = try JSONEncoder().encode(value)
    XCTAssertGreaterThanOrEqual(value.recoveryByteCount, encoded.count)
    XCTAssertGreaterThanOrEqual(
      RichRuntimeEvent.contentDelta(
        threadID: "thread", itemID: "item", stream: "assistant_text",
        delta: String(repeating: "x", count: 1_000)
      ).recoveryByteCount,
      1_000
    )
  }
}
