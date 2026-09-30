import XCTest

@testable import App

/// B6 pins for the follow-up-queue recovery slot: the newest sequence-tagged
/// replacement state wins, retention is constant regardless of queue churn,
/// and a stale target/generation or an at-or-below-snapshot sequence can never
/// install.
@MainActor
final class RichChatFollowUpQueueReplaySlotTests: XCTestCase {
  func testRetentionStaysConstantAcrossManyQueueChanges() {
    var slot = RichChatFollowUpQueueReplaySlot()
    let target = RichChatControllerTestValues.target()

    for sequence in 1...10_000 {
      slot.record(envelope(queue: "queue-\(sequence)"), sequence: sequence, target: target)
    }

    XCTAssertEqual(slot.retainedCount, 1)
    XCTAssertEqual(
      slot.replay(over: nil, snapshotSequence: 0, target: target)?.items.map(\.id),
      ["queue-10000"]
    )
  }

  func testNewestSequenceWinsRegardlessOfArrivalOrder() {
    var slot = RichChatFollowUpQueueReplaySlot()
    let target = RichChatControllerTestValues.target()

    slot.record(envelope(queue: "queue-13"), sequence: 13, target: target)
    slot.record(envelope(queue: "queue-11"), sequence: 11, target: target)
    XCTAssertEqual(
      slot.replay(over: nil, snapshotSequence: 10, target: target)?.items.map(\.id),
      ["queue-13"],
      "an out-of-order older broadcast must not downgrade the retained state"
    )

    slot.record(envelope(queue: "queue-15"), sequence: 15, target: target)
    XCTAssertEqual(
      slot.replay(over: nil, snapshotSequence: 10, target: target)?.items.map(\.id),
      ["queue-15"]
    )
  }

  func testEqualSequenceKeepsLaterArrival() {
    var slot = RichChatFollowUpQueueReplaySlot()
    let target = RichChatControllerTestValues.target()

    slot.record(envelope(queue: "queue-first"), sequence: 12, target: target)
    slot.record(envelope(queue: "queue-second"), sequence: 12, target: target)

    XCTAssertEqual(slot.retainedCount, 1)
    XCTAssertEqual(
      slot.replay(over: nil, snapshotSequence: 10, target: target)?.items.map(\.id),
      ["queue-second"],
      "a retransmitted sequence keeps the previous append-and-replay winner"
    )
  }

  func testAtOrBelowSnapshotSequenceIsNotReplayed() {
    var slot = RichChatFollowUpQueueReplaySlot()
    let target = RichChatControllerTestValues.target()
    let base = queue("queue-snapshot")

    slot.record(envelope(queue: "queue-stale"), sequence: 9, target: target)
    XCTAssertEqual(
      slot.replay(over: base, snapshotSequence: 10, target: target)?.items.map(\.id),
      ["queue-snapshot"]
    )

    slot.record(envelope(queue: "queue-boundary"), sequence: 10, target: target)
    XCTAssertEqual(
      slot.replay(over: base, snapshotSequence: 10, target: target)?.items.map(\.id),
      ["queue-snapshot"],
      "a state already reflected in the snapshot baseline must drop"
    )
  }

  func testStaleHostGenerationOrThreadCannotReplay() {
    var slot = RichChatFollowUpQueueReplaySlot()
    let target = RichChatControllerTestValues.target()
    slot.record(envelope(queue: "queue-host-a"), sequence: 12, target: target)

    let staleGeneration = RichChatControllerTestValues.target(generation: 99)
    XCTAssertNil(
      slot.replay(over: nil, snapshotSequence: 10, target: staleGeneration),
      "a stale host generation must not install the retained state"
    )
    let otherHost = RichChatControllerTestValues.target(host: RichChatControllerTestValues.hostB)
    XCTAssertNil(slot.replay(over: nil, snapshotSequence: 10, target: otherHost))
    let otherThread = RichChatControllerTestValues.target(threadID: "thread-other")
    XCTAssertNil(slot.replay(over: nil, snapshotSequence: 10, target: otherThread))

    // A broadcast for a different target starts a fresh slot instead of
    // clobbering the previous target's retained state.
    slot.record(envelope(queue: "queue-host-b"), sequence: 11, target: otherHost)
    XCTAssertEqual(
      slot.replay(over: nil, snapshotSequence: 10, target: otherHost)?.items.map(\.id),
      ["queue-host-b"]
    )
    XCTAssertNil(slot.replay(over: nil, snapshotSequence: 10, target: target))
  }

  func testExplicitClearReplaysAsNilReplacement() {
    var slot = RichChatFollowUpQueueReplaySlot()
    let target = RichChatControllerTestValues.target()

    slot.record(
      RichFollowUpQueueEnvelope(threadID: target.threadID, queue: nil),
      sequence: 11,
      target: target
    )

    XCTAssertNil(
      slot.replay(over: queue("queue-snapshot"), snapshotSequence: 10, target: target),
      "a newer explicit clear must replace the snapshot value with nil"
    )
  }

  func testResetReleasesRetainedState() {
    var slot = RichChatFollowUpQueueReplaySlot()
    let target = RichChatControllerTestValues.target()
    slot.record(envelope(queue: "queue-11"), sequence: 11, target: target)

    slot.reset()

    XCTAssertEqual(slot.retainedCount, 0)
    XCTAssertNil(slot.replay(over: nil, snapshotSequence: 10, target: target))
  }

  /// Main-actor probe for the B6 recovery path: drives the production
  /// `receiveFollowUpQueue` entry through many queue changes during a delayed
  /// history read on the main actor (XCTest's thread) and reports the measured
  /// wall time. The assertion is a generous pathological-regression guard, not
  /// a performance budget.
  func testMainActorProbeForManyQueueChanges() async {
    let barrier = RichChatControllerTestBarrier()
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureHistory(
      .value(RichChatControllerTestValues.history(sequence: 10)), barrier: barrier)
    let controller = RichChatTranscriptController(gateway: gateway)
    let target = RichChatControllerTestValues.target()
    controller.activate(access: RichChatControllerTestValues.access(), threadID: target.threadID)

    let loading = Task { await controller.loadHistory() }
    await barrier.waitUntilReached()

    let iterations = 1_000_000
    let clock = ContinuousClock()
    let start = clock.now
    for sequence in 1...iterations {
      controller.receiveFollowUpQueue(
        RichFollowUpQueueEnvelope(threadID: target.threadID, queue: queue("queue-\(sequence)")),
        sequence: sequence,
        target: target
      )
    }
    let elapsed = clock.now - start

    let milliseconds = Double(elapsed.components.attoseconds) / 1e15
      + Double(elapsed.components.seconds) * 1_000
    print(
      "[B6] MainActor receiveFollowUpQueue probe: \(iterations) updates in "
        + String(format: "%.1f ms", milliseconds)
    )
    XCTAssertLessThan(elapsed, .seconds(10), "pathological regression guard")

    await barrier.release()
    await loading.value
    XCTAssertEqual(controller.state.followUpQueue?.items.map(\.id), ["queue-1000000"])
  }

  private func envelope(queue id: String) -> RichFollowUpQueueEnvelope {
    RichFollowUpQueueEnvelope(threadID: "thread-rich", queue: queue(id))
  }

  private func queue(_ id: String) -> RichFollowUpQueue {
    RichFollowUpQueue(
      items: [
        RichPendingSteer(
          id: id, prompt: "Run the integration suite.", segments: nil,
          stagedAtMilliseconds: 1)
      ],
      paused: false
    )
  }
}
