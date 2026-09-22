import Foundation
import XCTest

@testable import App

/// B4 older-completed-turn continuation through the real rich-chat UI action
/// (`RichChatTranscriptController.loadOlder()`) and the real wire path
/// (`SelectedRichChatSessionGateway` → `GeneratedRichChatRemoteAPI` →
/// `RemoteAPIClient` → URLProtocol fixture).
@MainActor
final class RichChatOlderTurnsTests: XCTestCase {
  private var fixture: BoundedCatalogHostFixture!

  override func setUp() {
    super.setUp()
    fixture = BoundedCatalogHostFixture()
    fixture.setThreads([.make(id: "t1")])
    fixture.setProjects([.make(id: "p1")])
    BoundedCatalogURLProtocol.install(fixture)
  }

  override func tearDown() {
    BoundedCatalogURLProtocol.reset()
    super.tearDown()
  }

  private struct Harness {
    var controller: RichChatTranscriptController
    var access: RichChatSessionAccess
    var target: RichChatThreadTarget
  }

  private func makeHarness(threadID: String = "t1") -> Harness {
    let client = RemoteAPIClient(
      endpoint: "https://a.test",
      accessToken: "token-1",
      session: BoundedCatalogURLProtocol.makeSession()
    )
    let api = GeneratedRichChatRemoteAPI(json: client)
    let access = RichChatSessionAccess(
      lease: RichChatHostLease(connectionID: ClientConnectionID(), generation: 1),
      isOnline: true,
      isReady: true,
      capabilities: [.sessionRead, .sessionOperate]
    )
    let gateway = SelectedRichChatSessionGateway(selectionProvider: {
      RichChatTransportSelection(access: access, api: api, terminalSocket: nil)
    })
    let controller = RichChatTranscriptController(gateway: gateway)
    let target = RichChatThreadTarget(lease: access.lease, threadID: threadID)
    controller.activate(access: access, threadID: threadID)
    return Harness(controller: controller, access: access, target: target)
  }

  private func seedTurns(count: Int, offset: Int = 0) {
    var seeds: [BoundedCatalogHostFixture.TurnSeed] = []
    for index in offset ..< (offset + count) {
      seeds.append(
        .init(
          startedAt: iso(Int64(index) * 2 + 1),
          endedAt: iso(Int64(index) * 2 + 2),
          // Every third turn is anchorless.
          anchorItemId: index.isMultiple(of: 3) ? nil : "item-\(index)"
        )
      )
    }
    fixture.setTurns(seeds, forThread: "t1")
  }

  private func iso(_ seconds: Int64) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: Date(timeIntervalSince1970: Double(seconds)))
  }

  private func turnCursorRequestPaths() -> [String] {
    fixture.requests(matching: "/api/threads/t1/turns").map { $0.query["cursor"] ?? "nil" }
  }

  func testUiLoadOlderWalksCt1AcrossTwoTapsAndKeepsAnchorlessTurns() async throws {
    seedTurns(count: 520)
    let harness = makeHarness()
    await harness.controller.loadHistory(targetEntryCount: 40)
    // Item-less transcript of completed turns renders as loaded, not empty.
    XCTAssertEqual(harness.controller.state.loadState, .loaded)
    XCTAssertNil(harness.controller.state.olderCursor, "fixture serves no older items")
    XCTAssertEqual(harness.controller.state.completedTurns.count, 200)
    let firstCursor = try XCTUnwrap(harness.controller.state.olderTurnsCursor)
    XCTAssertTrue(firstCursor.hasPrefix("ct1."))
    XCTAssertTrue(harness.controller.state.completedTurns.contains { $0.anchorItemID == nil })

    // The exact UI action: RichChatTimelineView calls `controller.loadOlder()`.
    await harness.controller.loadOlder()
    XCTAssertEqual(harness.controller.state.completedTurns.count, 400)
    XCTAssertEqual(harness.controller.state.olderTurnsCursor?.hasPrefix("ct1."), true)

    await harness.controller.loadOlder()
    XCTAssertEqual(harness.controller.state.completedTurns.count, 520)
    XCTAssertNil(harness.controller.state.olderTurnsCursor)
    XCTAssertTrue(harness.controller.state.completedTurns.contains { $0.anchorItemID == nil })

    // Identity is (startedAt, endedAt): no duplicates, chronological order.
    let identities = harness.controller.state.completedTurns.map {
      "\($0.startedAtMilliseconds)|\($0.endedAtMilliseconds)"
    }
    XCTAssertEqual(Set(identities).count, 520)
    XCTAssertEqual(
      harness.controller.state.completedTurns.map(\.startedAtMilliseconds),
      harness.controller.state.completedTurns.map(\.startedAtMilliseconds).sorted()
    )

    // Exact wire: bounded reads, limit 200, ct1 continuation in order.
    let cursors = turnCursorRequestPaths()
    XCTAssertEqual(cursors.count, 2)
    XCTAssertEqual(
      cursors.map { RemoteBoundedCursorPayload.decodeCompletedTurnIndex($0) },
      [320, 120]
    )
    let request = try XCTUnwrap(fixture.requests(matching: "/api/threads/t1/turns").first)
    XCTAssertEqual(request.query["reads"], "bounded-v1")
    XCTAssertEqual(request.query["limit"], "200")

    // F1: the initial transcript read itself is the negotiated bounded tail on
    // the actual production gateway, so the ct1. cursor the UI walked was
    // obtained through the declared route.
    let historyRequest = try XCTUnwrap(
      fixture.requests(matching: "/api/threads/t1/history").first
    )
    XCTAssertEqual(historyRequest.query["reads"], "bounded-v1")
    XCTAssertEqual(historyRequest.query["completedTurnsLimit"], "200")
    XCTAssertEqual(historyRequest.query["runtimePage"], "1")

    // A further tap is a no-op: the continuation is exhausted.
    await harness.controller.loadOlder()
    XCTAssertEqual(fixture.requests(matching: "/api/threads/t1/turns").count, 2)
  }

  /// Negative control for the F1 oracle defect: the fixture is now
  /// request-faithful, so the old (legacy) production wiring receives the
  /// complete legacy shape with no `ct1.` cursor, and the corrected bounded
  /// request receives the tail plus its continuation.
  func testFixtureAnswersLegacyWiringWithLegacyShapeAndBoundedWithTail() async throws {
    seedTurns(count: 520)
    let client = RemoteAPIClient(
      endpoint: "https://a.test",
      accessToken: "token-1",
      session: BoundedCatalogURLProtocol.makeSession()
    )
    let legacy = try await client.threadHistory(threadId: "t1", targetTimelineEntryCount: 40)
    XCTAssertEqual(legacy.completedTurns.count, 520)
    XCTAssertNil(legacy.completedTurnsNextCursor)
    XCTAssertNil(legacy.reads)
    let legacyRequest = try XCTUnwrap(
      fixture.requests(matching: "/api/threads/t1/history").first
    )
    XCTAssertNil(legacyRequest.query["reads"])

    let outcome = try await client.boundedThreadHistory(
      threadId: "t1",
      completedTurnsLimit: 200,
      targetTimelineEntryCount: 40
    )
    guard case .bounded(let page) = outcome else {
      return XCTFail("A declared host must answer the bounded request with the bounded shape.")
    }
    XCTAssertEqual(page.snapshot.completedTurns.count, 200)
    XCTAssertEqual(
      page.completedTurnsNextCursor
        .flatMap(RemoteBoundedCursorPayload.decodeCompletedTurnIndex),
      320
    )
  }

  func testHeldOlderPageIsFencedByLiveTruncate() async throws {
    seedTurns(count: 520)
    let harness = makeHarness()
    await harness.controller.loadHistory(targetEntryCount: 40)
    let before = harness.controller.state.completedTurns.count
    XCTAssertEqual(before, 200)

    // Hold the next ct1 page, then apply a live truncation while it is in
    // flight: the host renumbered the turn indices, so the cursor is dropped
    // and the held page must not append.
    fixture.heldPaths = ["/api/threads/t1/turns"]
    let cursorBefore = harness.controller.state.olderTurnsCursor
    let load = Task { await harness.controller.loadOlder() }
    try await Task.sleep(for: .milliseconds(50))
    XCTAssertTrue(harness.controller.state.isLoadingOlder)

    harness.controller.receiveLiveEvents(
      [
        .runtimeTruncated(threadID: "t1", itemID: "item-x", removedCompletedTurnAnchors: [])
      ],
      sequence: 500,
      target: harness.target
    )
    XCTAssertNil(harness.controller.state.olderTurnsCursor, "cursor drops on truncate")
    XCTAssertNotEqual(cursorBefore, harness.controller.state.olderTurnsCursor)

    fixture.heldPaths = []
    fixture.releaseWalks()
    await load.value
    XCTAssertEqual(
      harness.controller.state.completedTurns.count, before,
      "a page fenced by truncation must not append older turns"
    )
    XCTAssertNil(harness.controller.state.olderTurnsCursor)
    XCTAssertFalse(harness.controller.state.isLoadingOlder)
  }

  func testCompleteAuthoritativeTailReplacesTheRetainedLevel() async throws {
    seedTurns(count: 120)
    let harness = makeHarness()
    await harness.controller.loadHistory(targetEntryCount: 40)
    XCTAssertEqual(harness.controller.state.completedTurns.count, 120)
    XCTAssertNil(harness.controller.state.olderTurnsCursor)

    // F2: the host truncates the oldest 40 turns and the reload's tail is
    // COMPLETE (`completedTurnsNextCursor == nil`). The complete tail is the
    // host's full remaining turn set and replaces the level — the truncated
    // turns cannot survive a reload.
    let truncated = Array(
      (0 ..< 120).map { index in
        BoundedCatalogHostFixture.TurnSeed(
          startedAt: iso(Int64(index) * 2 + 1),
          endedAt: iso(Int64(index) * 2 + 2),
          anchorItemId: nil
        )
      }.suffix(80)
    )
    fixture.setTurns(truncated, forThread: "t1")
    await harness.controller.loadHistory(targetEntryCount: 40)
    let replaced = harness.controller.state.completedTurns
    XCTAssertEqual(
      Set(replaced.map { "\($0.startedAtMilliseconds)|\($0.endedAtMilliseconds)" }).count,
      replaced.count
    )
    XCTAssertEqual(replaced.count, 80)

    // An authoritative reset (close/re-open, host switch) accepts the tail
    // replacement: only the host's remaining 80 turns survive.
    harness.controller.activate(access: harness.access, threadID: "t1")
    await harness.controller.loadHistory(targetEntryCount: 40)
    XCTAssertEqual(harness.controller.state.completedTurns.count, 80)
    XCTAssertNil(harness.controller.state.olderTurnsCursor)
  }

  func testPartialAuthoritativeTailKeepsProvenOlderPages() async throws {
    seedTurns(count: 520)
    let harness = makeHarness()
    await harness.controller.loadHistory(targetEntryCount: 40)
    XCTAssertEqual(harness.controller.state.completedTurns.count, 200)
    let cursor = try XCTUnwrap(harness.controller.state.olderTurnsCursor)
    XCTAssertEqual(RemoteBoundedCursorPayload.decodeCompletedTurnIndex(cursor), 320)
    await harness.controller.loadOlder()
    XCTAssertEqual(harness.controller.state.completedTurns.count, 400)

    // The host now holds only 220 turns (indices 300...519): the reload's tail
    // is PARTIAL (200 newest turns, `ct1.20` remains). A partial tail cannot
    // prove which loaded older turns the host removed, so the proven older
    // pages survive; only the newest window is authoritative.
    seedTurns(count: 220, offset: 300)
    await harness.controller.loadHistory(targetEntryCount: 40)
    let retained = harness.controller.state.completedTurns
    XCTAssertEqual(retained.count, 400)
    XCTAssertNotNil(harness.controller.state.olderTurnsCursor)
    XCTAssertEqual(
      Set(retained.map { "\($0.startedAtMilliseconds)|\($0.endedAtMilliseconds)" }).count,
      retained.count
    )
    // The oldest retained page is strictly older than the new partial tail.
    let oldestTail = try XCTUnwrap(
      fixture.turns(forThread: "t1").map(\.startedAt).compactMap(RichTimeline.epochMilliseconds).min()
    )
    XCTAssertLessThan(retained[0].startedAtMilliseconds, oldestTail)
  }

  func testDeliveredReplacementDropsTheRetainedLevelAndFencesHeldPages() async throws {
    seedTurns(count: 520)
    let harness = makeHarness()
    await harness.controller.loadHistory(targetEntryCount: 40)
    await harness.controller.loadOlder()
    XCTAssertEqual(harness.controller.state.completedTurns.count, 400)
    XCTAssertNotNil(harness.controller.state.olderTurnsCursor)

    // Hold the next ct1 page, then deliver a thread reset for the same thread:
    // the retained level and both continuations are dropped and the held page
    // must not append across the reset.
    fixture.heldPaths = ["/api/threads/t1/turns"]
    let load = Task { await harness.controller.loadOlder() }
    try await Task.sleep(for: .milliseconds(50))
    XCTAssertTrue(harness.controller.state.isLoadingOlder)
    harness.controller.invalidateForDeliveredReplacement(requiresRefresh: false)
    XCTAssertNil(harness.controller.state.olderTurnsCursor)
    XCTAssertNil(harness.controller.state.olderCursor)
    XCTAssertTrue(harness.controller.state.completedTurns.isEmpty)
    fixture.heldPaths = []
    fixture.releaseWalks()
    await load.value
    XCTAssertTrue(
      harness.controller.state.completedTurns.isEmpty,
      "a page fenced by a delivered replacement must not append"
    )
    XCTAssertFalse(harness.controller.state.isLoadingOlder)
  }

  func testSelectionAndLeaseChangeFenceHeldPagesAndResetCursors() async throws {
    seedTurns(count: 520)
    let harness = makeHarness()
    await harness.controller.loadHistory(targetEntryCount: 40)
    XCTAssertNotNil(harness.controller.state.olderTurnsCursor)

    // Selection change (same lease) resets the transcript surface.
    fixture.heldPaths = ["/api/threads/t1/turns"]
    let load = Task { await harness.controller.loadOlder() }
    try await Task.sleep(for: .milliseconds(50))
    harness.controller.activate(access: harness.access, threadID: "t2")
    fixture.heldPaths = []
    fixture.releaseWalks()
    await load.value
    XCTAssertTrue(harness.controller.state.completedTurns.isEmpty)
    XCTAssertNil(harness.controller.state.olderTurnsCursor)

    // Host switch / re-pair: the lease changes and the controller deactivates.
    let switched = RichChatSessionAccess(
      lease: RichChatHostLease(connectionID: ClientConnectionID(), generation: 2),
      isOnline: true,
      isReady: true,
      capabilities: [.sessionRead, .sessionOperate]
    )
    harness.controller.updateAccess(switched)
    XCTAssertNil(harness.controller.state.target)
    XCTAssertTrue(harness.controller.state.completedTurns.isEmpty)
  }
}
