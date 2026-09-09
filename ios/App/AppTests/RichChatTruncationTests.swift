import XCTest

@testable import App

@MainActor
final class RichChatTruncationTests: XCTestCase {
  private let target = RichChatControllerTestValues.target()

  private func history(sequence: Int = 10) -> RemoteThreadSnapshot {
    let base = RichChatControllerTestValues.history(sequence: sequence)
    return RemoteThreadSnapshot(
      snapshotSeq: sequence, thread: base.thread,
      runtimeItems: [
        RichChatControllerTestValues.persistedItem(id: "checkpoint"),
        PersistedRuntimeItem(
          id: "plan", type: RichItemType.plan, state: "completed", payload: .null, streams: [:],
          parentItemId: nil),
      ], runtimeNextCursor: 4,
      completedTurns: ["plan", "older-unloaded"].enumerated().map { index, anchor in
        .object([
          "startedAt": .string("2026-09-09T00:00:0\(index).000Z"),
          "endedAt": .string("2026-09-09T00:00:0\(index + 1).000Z"),
          "anchorItemId": .string(anchor),
        ])
      }, contextUsage: nil, terminalScrollback: nil, updatedAt: base.updatedAt
    )
  }

  private func truncate(_ checkpoint: String = "checkpoint") -> RichRuntimeEvent {
    .runtimeTruncated(
      threadID: target.threadID, itemID: checkpoint, removedCompletedTurnAnchors: ["plan"])
  }

  func testDecoderRejectsMalformedAnchorArrays() throws {
    let value: RichJSON = .object([
      "type": .string("runtime.truncated"), "threadId": .string(target.threadID),
      "itemId": .string("checkpoint"), "removedCompletedTurnAnchors": .array([.string("plan")]),
    ])
    XCTAssertEqual(try RichRuntimeEventDecoder.decode(value), truncate())
    var malformed = try XCTUnwrap(value.objectValue)
    malformed["removedCompletedTurnAnchors"] = .array([.string("plan"), .number(1)])
    XCTAssertThrowsError(try RichRuntimeEventDecoder.decode(.object(malformed)))
    malformed.removeValue(forKey: "removedCompletedTurnAnchors")
    XCTAssertThrowsError(try RichRuntimeEventDecoder.decode(.object(malformed)))
  }

  func testLiveTruncatePrunesCanonicalHiddenAnchorAndPreservesUnloadedTurn() async {
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureHistory(.value(history()))
    let controller = RichChatTranscriptController(gateway: gateway)
    controller.activate(access: RichChatControllerTestValues.access(), threadID: target.threadID)
    await controller.loadHistory()
    XCTAssertEqual(controller.state.completedTurns.first?.anchorItemID, "plan")
    XCTAssertEqual(
      controller.state.displayedCompletedTurns(in: controller.state.timeline).first?.anchorItemID,
      "checkpoint")
    controller.receiveLiveEvents([truncate()], sequence: 11, target: target)
    XCTAssertEqual(controller.state.transcript?.orderedItemIDs, ["checkpoint"])
    XCTAssertEqual(controller.state.completedTurns.map(\.anchorItemID), ["older-unloaded"])
    XCTAssertFalse(controller.state.requiresAuthoritativeRefresh)
  }

  func testBufferedTruncateUsesSnapshotSequenceAndPrunesTurnMetadata() async {
    for sequence in [9, 11] {
      let gateway = RichChatControllerGatewayFake()
      let barrier = RichChatControllerTestBarrier()
      await gateway.configureHistory(.value(history()), barrier: barrier)
      let controller = RichChatTranscriptController(gateway: gateway)
      controller.activate(access: RichChatControllerTestValues.access(), threadID: target.threadID)
      let loading = Task { await controller.loadHistory() }
      await barrier.waitUntilReached()
      controller.receiveLiveEvents([truncate()], sequence: sequence, target: target)
      await barrier.release()
      await loading.value
      XCTAssertEqual(
        controller.state.transcript?.orderedItemIDs,
        sequence > 10 ? ["checkpoint"] : ["checkpoint", "plan"])
      XCTAssertEqual(controller.state.completedTurns.count, sequence > 10 ? 1 : 2)
    }
  }

  func testOldReplayCannotRemoveNewMessageAfterSnapshot() async {
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureHistory(.value(history(sequence: 20)))
    let controller = RichChatTranscriptController(gateway: gateway)
    controller.activate(access: RichChatControllerTestValues.access(), threadID: target.threadID)
    await controller.loadHistory()
    controller.receiveLiveEvents(
      [
        truncate(),
        .itemStarted(
          threadID: target.threadID, itemID: "new", itemType: RichItemType.assistantMessage,
          payload: .omitted, parentItemID: nil),
      ], sequence: 21, target: target)
    controller.receiveLiveEvents([truncate()], sequence: 19, target: target)
    XCTAssertEqual(controller.state.transcript?.orderedItemIDs, ["checkpoint", "new"])
  }

  func testBufferedMissingCheckpointReloadsAuthoritativelyWithoutARefreshLoop() async {
    let gateway = RichChatControllerGatewayFake()
    let loadingBarrier = RichChatControllerTestBarrier()
    await gateway.configureHistory(.value(history()), barrier: loadingBarrier)
    let refreshed = RichChatControllerTestValues.history(
      sequence: 30, items: [RichChatControllerTestValues.persistedItem(id: "server-current")]
    )
    let requester = TruncationReloadRequester(gateway: gateway, response: .value(refreshed))
    let controller = RichChatTranscriptController(gateway: gateway, refreshRequester: requester)
    requester.controller = controller
    controller.activate(access: RichChatControllerTestValues.access(), threadID: target.threadID)
    let loading = Task { await controller.loadHistory() }
    await loadingBarrier.waitUntilReached()
    controller.receiveLiveEvents([truncate("unloaded")], sequence: 11, target: target)
    await loadingBarrier.release()
    await loading.value
    await requester.finished.waitUntilReached()
    XCTAssertEqual(requester.count, 1)
    XCTAssertEqual(controller.state.snapshotSequence, 30)
    XCTAssertEqual(controller.state.transcript?.orderedItemIDs, ["server-current"])
    XCTAssertTrue(controller.state.completedTurns.isEmpty)
    XCTAssertFalse(controller.state.requiresAuthoritativeRefresh)
    await requester.finished.release()
  }

  func testFailedCatchupKeepsWriteGateAndDoesNotLoop() async {
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureHistory(.value(history()))
    let requester = TruncationReloadRequester(gateway: gateway, response: .failure(.transport))
    let controller = RichChatTranscriptController(gateway: gateway, refreshRequester: requester)
    requester.controller = controller
    controller.activate(access: RichChatControllerTestValues.access(), threadID: target.threadID)
    await controller.loadHistory()
    controller.receiveLiveEvents([truncate("unloaded")], sequence: 11, target: target)
    await requester.finished.waitUntilReached()
    XCTAssertEqual(controller.state.loadState, .failed(.transport))
    XCTAssertTrue(controller.state.requiresAuthoritativeRefresh)
    XCTAssertEqual(controller.state.transcript?.orderedItemIDs, ["checkpoint", "plan"])
    for sequence in 12...20 {
      controller.receiveLiveEvents([truncate("unloaded")], sequence: sequence, target: target)
    }
    XCTAssertEqual(requester.count, 1)
    await requester.finished.release()
  }

  func testCatchupTaskCancelsAcrossOwnerAndBackgroundChanges() async {
    for action in ["activate", "deactivate", "background"] {
      let gateway = RichChatControllerGatewayFake()
      await gateway.configureHistory(.value(history()))
      let requester = CancellableTruncationRequester()
      let controller = RichChatTranscriptController(gateway: gateway, refreshRequester: requester)
      controller.activate(access: RichChatControllerTestValues.access(), threadID: target.threadID)
      await controller.loadHistory()
      controller.receiveLiveEvents([truncate("unloaded")], sequence: 11, target: target)
      await requester.entered.waitUntilReached()
      switch action {
      case "activate":
        controller.activate(
          access: RichChatControllerTestValues.access(host: RichChatControllerTestValues.hostB),
          threadID: target.threadID)
      case "deactivate": controller.deactivate()
      default: controller.enterBackground()
      }
      await requester.entered.release()
      await requester.finished.waitUntilReached()
      XCTAssertTrue(requester.wasCancelled, action)
      await requester.finished.release()
    }
  }

  func testCatchupStopsAfterThreeAdvancingButStillStaleSnapshots() async {
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureHistory(.value(history()))
    let extraRequest = expectation(description: "No fourth catchup")
    extraRequest.isInverted = true
    let requester = RepeatedTruncationRequester(gateway: gateway, extraRequest: extraRequest)
    let controller = RichChatTranscriptController(gateway: gateway, refreshRequester: requester)
    requester.controller = controller
    controller.activate(access: RichChatControllerTestValues.access(), threadID: target.threadID)
    await controller.loadHistory()
    controller.receiveLiveEvents([truncate("unloaded")], sequence: 11, target: target)
    await requester.finished.waitUntilReached()
    await requester.finished.release()
    await fulfillment(of: [extraRequest], timeout: 0.1)
    XCTAssertEqual(requester.count, 3)
    XCTAssertEqual(controller.state.snapshotSequence, 40)
    XCTAssertTrue(controller.state.requiresAuthoritativeRefresh)
  }

  func testMissingCheckpointKeepsItemsAndRequestsOnlyOneRefresh() async {
    let gateway = RichChatControllerGatewayFake()
    let recorder = RichChatRefreshRecorder()
    await gateway.configureHistory(.value(history()))
    let controller = RichChatTranscriptController(gateway: gateway, refreshRequester: recorder)
    controller.activate(access: RichChatControllerTestValues.access(), threadID: target.threadID)
    await controller.loadHistory()
    for sequence in 11...20 {
      controller.receiveLiveEvents([truncate("unloaded")], sequence: sequence, target: target)
    }
    for _ in 0..<20 {
      if await recorder.requests.count == 1 { break }
      await Task.yield()
    }
    let requests = await recorder.requests
    XCTAssertEqual(requests.count, 1)
    XCTAssertEqual(requests.first?.1, .transcriptInvalidated)
    XCTAssertTrue(controller.state.requiresAuthoritativeRefresh)
    XCTAssertEqual(controller.state.transcript?.orderedItemIDs, ["checkpoint", "plan"])
    XCTAssertEqual(controller.state.completedTurns.map(\.anchorItemID), ["older-unloaded"])
    await gateway.configureHistory(.value(history(sequence: 30)))
    await controller.loadHistory()
    XCTAssertFalse(controller.state.requiresAuthoritativeRefresh)
  }
}

@MainActor
private final class TruncationReloadRequester: RichChatAuthoritativeRefreshRequesting {
  weak var controller: RichChatTranscriptController?
  let gateway: RichChatControllerGatewayFake
  let response: RichChatControllerTestResponse<RemoteThreadSnapshot>
  let finished = RichChatControllerTestBarrier()
  private(set) var count = 0

  init(
    gateway: RichChatControllerGatewayFake,
    response: RichChatControllerTestResponse<RemoteThreadSnapshot>
  ) {
    self.gateway = gateway
    self.response = response
  }

  @MainActor
  func requestRichChatRefresh(
    target: RichChatThreadTarget, reason: RichChatAuthoritativeRefreshReason
  ) async {
    count += 1
    await gateway.configureHistory(response)
    await controller?.loadHistory()
    await finished.suspend()
  }
}

@MainActor
private final class CancellableTruncationRequester: RichChatAuthoritativeRefreshRequesting {
  let entered = RichChatControllerTestBarrier()
  let finished = RichChatControllerTestBarrier()
  private(set) var wasCancelled = false

  @MainActor
  func requestRichChatRefresh(
    target: RichChatThreadTarget, reason: RichChatAuthoritativeRefreshReason
  ) async {
    await entered.suspend()
    wasCancelled = Task.isCancelled
    await finished.suspend()
  }
}

@MainActor
private final class RepeatedTruncationRequester: RichChatAuthoritativeRefreshRequesting {
  weak var controller: RichChatTranscriptController?
  let gateway: RichChatControllerGatewayFake
  let extraRequest: XCTestExpectation
  let finished = RichChatControllerTestBarrier()
  private(set) var count = 0

  init(gateway: RichChatControllerGatewayFake, extraRequest: XCTestExpectation) {
    self.gateway = gateway
    self.extraRequest = extraRequest
  }

  @MainActor
  func requestRichChatRefresh(
    target: RichChatThreadTarget, reason: RichChatAuthoritativeRefreshReason
  ) async {
    count += 1
    guard count <= 3 else {
      extraRequest.fulfill()
      return
    }
    let sequence = 10 + count * 10
    let barrier = RichChatControllerTestBarrier()
    await gateway.configureHistory(
      .value(RichChatControllerTestValues.history(sequence: sequence)), barrier: barrier)
    let loading = Task { await controller?.loadHistory() }
    await barrier.waitUntilReached()
    controller?.receiveLiveEvents(
      [
        .runtimeTruncated(
          threadID: target.threadID, itemID: "unloaded", removedCompletedTurnAnchors: [])
      ], sequence: sequence + 1, target: target)
    await barrier.release()
    await loading.value
    if count == 3 { await finished.suspend() }
  }
}
