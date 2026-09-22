import Foundation
import XCTest

@testable import App

/// Correction coverage for the B4 review's proof gaps (N5) against the real
/// session graph:
/// - the deep-link/push outside-page by-id fallback through the production
///   `NotificationRouteController` (not a protocol stub);
/// - project restore-before-confirmation (the thread case already existed);
/// - an abandoned/superseded pending navigation releases only its own pin.
@MainActor
final class BoundedCatalogCorrectionTests: XCTestCase {
  override func setUp() {
    super.setUp()
    BoundedCatalogURLProtocol.reset()
  }

  override func tearDown() {
    BoundedCatalogURLProtocol.reset()
    super.tearDown()
  }

  private func policy() -> (BoundedCatalogPolicy) -> BoundedCatalogPolicy {
    { policy in
      var next = policy
      next.drainDebounceMs = 1
      next.periodicReconcileEnabled = false
      return next
    }
  }

  private func route(_ session: AppSession, threadID: String) throws -> NotificationRoute {
    NotificationRoute(
      version: NotificationRoute.version,
      clientConnectionId: try XCTUnwrap(session.selectedConnectionId),
      desktopId: try XCTUnwrap(session.state.profile?.desktopId),
      threadId: threadID
    )
  }

  func testOutsidePageDeepLinkInstallsAndPinsThroughTheRealSession() async throws {
    let fixture = BoundedCatalogHostFixture()
    fixture.holdWalks = true
    let harness = try await BoundedCatalogSessionHarness.make(
      fixture: fixture,
      threadCount: 300,
      projectCount: 1,
      configurePolicy: policy()
    )
    let loaded = Set(harness.session.snapshot?.threads.map(\.id) ?? [])
    let outsidePage = try XCTUnwrap(fixture.threadIds().first { !loaded.contains($0) })

    let navigation = NotificationNavigationCenter()
    let controller = NotificationRouteController(navigation: navigation)
    controller.attach(session: harness.session)
    controller.submit(try route(harness.session, threadID: outsidePage))
    await controller.settleForTests()

    XCTAssertEqual(navigation.event?.route.threadId, outsidePage)
    XCTAssertEqual(navigation.event?.threadTitle, "Thread")
    XCTAssertTrue(
      harness.session.snapshot?.threads.contains { $0.id == outsidePage } == true,
      "the exact by-id read installs the outside-page row"
    )
    XCTAssertTrue(
      harness.session.state.catalog.pinnedThreadIds.contains(outsidePage),
      "the pending navigation pins its target so confirmation cannot remove it"
    )
  }

  func testSupersededNavigationReleasesItsPinWithoutUnpinningTheOpenView() async throws {
    let fixture = BoundedCatalogHostFixture()
    fixture.holdWalks = true
    let harness = try await BoundedCatalogSessionHarness.make(
      fixture: fixture,
      threadCount: 300,
      projectCount: 1,
      configurePolicy: policy()
    )
    let loaded = Set(harness.session.snapshot?.threads.map(\.id) ?? [])
    let outsidePage = try XCTUnwrap(fixture.threadIds().first { !loaded.contains($0) })
    let secondOutside = try XCTUnwrap(
      fixture.threadIds().first { !loaded.contains($0) && $0 != outsidePage }
    )

    // A genuine open view pins its target (the real RichChat page lifecycle).
    let suite = try await attachSuite(harness, threadID: "t00001")
    XCTAssertTrue(harness.session.state.catalog.pinnedThreadIds.contains("t00001"))

    let navigation = NotificationNavigationCenter()
    let controller = NotificationRouteController(navigation: navigation)
    controller.attach(session: harness.session)
    controller.submit(try route(harness.session, threadID: outsidePage))
    await controller.settleForTests()
    XCTAssertTrue(harness.session.state.catalog.pinnedThreadIds.contains(outsidePage))

    // A newer tap supersedes the first route: its navigation pin is released
    // and the target is re-pinned for the new route, while the open view's pin
    // is untouched.
    controller.submit(try route(harness.session, threadID: secondOutside))
    await controller.settleForTests()
    XCTAssertFalse(
      harness.session.state.catalog.pinnedThreadIds.contains(outsidePage),
      "a superseded navigation must release its pin"
    )
    XCTAssertTrue(
      harness.session.state.catalog.pinnedThreadIds.contains(secondOutside)
    )
    XCTAssertTrue(
      harness.session.state.catalog.pinnedThreadIds.contains("t00001"),
      "the open view's pin is never released by a navigation action"
    )

    // Backgrounding abandons the pending navigation and releases only its pin.
    controller.submit(try route(harness.session, threadID: outsidePage))
    await controller.settleForTests()
    controller.setForeground(false)
    XCTAssertFalse(
      harness.session.state.catalog.pinnedThreadIds.contains(outsidePage),
      "an abandoned navigation must release its pin"
    )
    XCTAssertTrue(harness.session.state.catalog.pinnedThreadIds.contains("t00001"))

    // Dismissing the open view releases exactly the open owner's pin.
    harness.session.detachRichChatSuite(suite)
    XCTAssertTrue(harness.session.state.catalog.pinnedThreadIds.isEmpty)
  }

  /// N5: a successful navigation's pin is handed off to the real RichChat page
  /// that actually opens the thread, and released when that page goes away.
  func testSuccessfulNavigationHandsOffItsPinToTheOpenRichChatView() async throws {
    let fixture = BoundedCatalogHostFixture()
    fixture.holdWalks = true
    let harness = try await BoundedCatalogSessionHarness.make(
      fixture: fixture,
      threadCount: 300,
      projectCount: 1,
      configurePolicy: policy()
    )
    let loaded = Set(harness.session.snapshot?.threads.map(\.id) ?? [])
    let outsidePage = try XCTUnwrap(fixture.threadIds().first { !loaded.contains($0) })

    let navigation = NotificationNavigationCenter()
    let controller = NotificationRouteController(navigation: navigation)
    controller.attach(session: harness.session)
    controller.submit(try route(harness.session, threadID: outsidePage))
    await controller.settleForTests()
    XCTAssertTrue(harness.session.state.catalog.navigationPinnedThreadIds.contains(outsidePage))

    // The destination actually activates: the page selects/attaches its suite.
    let suite = try await attachSuite(harness, threadID: outsidePage)
    XCTAssertTrue(
      harness.session.state.catalog.pinnedThreadIds.contains(outsidePage),
      "the open RichChat view owns the pin"
    )
    XCTAssertFalse(
      harness.session.state.catalog.navigationPinnedThreadIds.contains(outsidePage),
      "a successful navigation hands its pin over instead of retaining it"
    )

    // View dismissal is the open owner's release.
    harness.session.detachRichChatSuite(suite)
    XCTAssertFalse(
      harness.session.state.catalog.pinnedThreadIds.contains(outsidePage),
      "dismissing the open view releases its pin"
    )
  }

  /// N5: owner-aware release. A navigation release (supersede/cancel/background)
  /// cannot unpin the open view, and dismissing the open view cannot unpin a
  /// newer pending navigation.
  func testSameTargetNavigationAndOpenOwnershipReleaseWithoutUnpinningTheOther() async throws {
    let fixture = BoundedCatalogHostFixture()
    fixture.holdWalks = true
    let harness = try await BoundedCatalogSessionHarness.make(
      fixture: fixture, threadCount: 300, projectCount: 1, configurePolicy: policy()
    )
    let loaded = Set(harness.session.snapshot?.threads.map(\.id) ?? [])
    let outsidePage = try XCTUnwrap(fixture.threadIds().first { !loaded.contains($0) })
    let secondOutside = try XCTUnwrap(
      fixture.threadIds().first { !loaded.contains($0) && $0 != outsidePage }
    )

    let navigation = NotificationNavigationCenter()
    let controller = NotificationRouteController(navigation: navigation)
    controller.attach(session: harness.session)
    controller.submit(try route(harness.session, threadID: outsidePage))
    await controller.settleForTests()
    XCTAssertTrue(harness.session.state.catalog.navigationPinnedThreadIds.contains(outsidePage))
    let suite = try await attachSuite(harness, threadID: outsidePage)

    // The very navigation that opened the view is cancelled/abandoned while the
    // view holds the same target: only the navigation owner's claim is released.
    controller.setForeground(false)
    XCTAssertFalse(
      harness.session.state.catalog.navigationPinnedThreadIds.contains(outsidePage),
      "the abandoned navigation releases its own pin"
    )
    XCTAssertTrue(
      harness.session.state.catalog.pinnedThreadIds.contains(outsidePage),
      "releasing a navigation pin never unpins the open view"
    )

    // The reverse order: a newer pending navigation for another target
    // survives the open view's dismissal; its own abandonment then releases it.
    controller.submit(try route(harness.session, threadID: secondOutside))
    await controller.settleForTests()
    XCTAssertTrue(
      harness.session.state.catalog.navigationPinnedThreadIds.contains(secondOutside)
    )
    harness.session.detachRichChatSuite(suite)
    XCTAssertFalse(
      harness.session.state.catalog.pinnedThreadIds.contains(outsidePage),
      "dismissing the open view releases its own pin"
    )
    XCTAssertTrue(
      harness.session.state.catalog.pinnedThreadIds.contains(secondOutside),
      "dismissing the open view never unpins a newer navigation"
    )
    controller.setForeground(false)
    XCTAssertFalse(harness.session.state.catalog.pinnedThreadIds.contains(secondOutside))
  }

  /// N5: replacing the open view with another thread transfers the open pin
  /// (the superseded page's later `detach` must not release the new owner).
  func testReplacingTheOpenRichChatViewTransfersTheOpenPin() async throws {
    let fixture = BoundedCatalogHostFixture()
    fixture.setThreads([.make(id: "t1"), .make(id: "t2")])
    fixture.setProjects([.make(id: "p1")])
    let harness = try await BoundedCatalogSessionHarness.make(
      fixture: fixture, threadCount: 0, projectCount: 0, configurePolicy: policy()
    )
    let first = try await attachSuite(harness, threadID: "t1")
    XCTAssertTrue(harness.session.state.catalog.pinnedThreadIds.contains("t1"))

    let second = try await attachSuite(harness, threadID: "t2")
    XCTAssertTrue(harness.session.state.catalog.pinnedThreadIds.contains("t2"))
    XCTAssertFalse(
      harness.session.state.catalog.pinnedThreadIds.contains("t1"),
      "the replaced view's open pin is released with the replacement"
    )
    // The superseded page can only detach after the replacement is active; its
    // late detach must not release the new owner's pin.
    harness.session.detachRichChatSuite(first)
    XCTAssertTrue(harness.session.state.catalog.pinnedThreadIds.contains("t2"))
    harness.session.detachRichChatSuite(second)
    XCTAssertFalse(harness.session.state.catalog.pinnedThreadIds.contains("t2"))
  }

  /// Wires the real RichChat suite the session owns and returns it.
  private func attachSuite(
    _ harness: BoundedCatalogSessionHarness,
    threadID: String
  ) async throws -> RichChatControllerSuite {
    harness.session.state.socketState = .online
    let suite = harness.session.makeRichChatControllerSuite()
    let access = try XCTUnwrap(harness.session.currentRichChatAccess)
    suite.select(access: access, threadID: threadID)
    harness.session.attachRichChatSuite(suite)
    return suite
  }

  /// Wires the real RichChat suite the session owns and returns it.
  private func attachRichChatSuite(
    _ harness: BoundedCatalogSessionHarness,
    threadID: String = "t1"
  ) async throws -> RichChatControllerSuite {
    harness.session.state.socketState = .online
    let suite = harness.session.makeRichChatControllerSuite()
    let access = try XCTUnwrap(harness.session.currentRichChatAccess)
    suite.select(access: access, threadID: threadID)
    harness.session.activeRichChatSuite = suite
    await suite.refreshAuthoritativeHistory()
    return suite
  }

  private func seedTurns(_ fixture: BoundedCatalogHostFixture, count: Int) {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    func iso(_ seconds: Int64) -> String {
      formatter.string(from: Date(timeIntervalSince1970: Double(seconds)))
    }
    fixture.setTurns(
      (0 ..< count).map { index in
        .init(
          startedAt: iso(Int64(index) * 2 + 1),
          endedAt: iso(Int64(index) * 2 + 2),
          anchorItemId: index.isMultiple(of: 3) ? nil : "item-\(index)"
        )
      },
      forThread: "t1"
    )
  }

  func testDeliveredThreadResetInvalidatesTheRetainedOlderTurnLevel() async throws {
    let fixture = BoundedCatalogHostFixture()
    fixture.setThreads([.make(id: "t1")])
    fixture.setProjects([.make(id: "p1")])
    seedTurns(fixture, count: 520)
    let harness = try await BoundedCatalogSessionHarness.make(
      fixture: fixture, threadCount: 0, projectCount: 0, configurePolicy: policy()
    )
    let suite = try await attachRichChatSuite(harness)
    XCTAssertEqual(suite.transcript.state.completedTurns.count, 200)
    await suite.transcript.loadOlder()
    XCTAssertEqual(suite.transcript.state.completedTurns.count, 400)

    // A delivered thread-reset replaces the runtime: without the invalidation
    // the follow-up partial tail (`ct1.320`) would merge and keep all 400.
    harness.session.handleServerMessageForTests(
      .event(seq: 200, event: .object([
        "type": .string("thread-reset"),
        "threadId": .string("t1"),
      ]))
    )
    await harness.waitUntil("reset invalidation refreshes the transcript", timeout: 10) {
      suite.transcript.state.completedTurns.count == 200
        && suite.transcript.state.olderTurnsCursor != nil
    }
    let cursor = try XCTUnwrap(suite.transcript.state.olderTurnsCursor)
    XCTAssertEqual(RemoteBoundedCursorPayload.decodeCompletedTurnIndex(cursor), 320)
  }

  /// F2-L: a delivered reset that lands inside an in-flight authoritative
  /// history read must fence that held response (the payload was built before
  /// the reset) and must demand a fresh authoritative read even though
  /// `loadState == .loading`. The held pre-reset payload never installs.
  func testDeliveredThreadResetDuringInFlightHistoryReadFencesTheHeldPayload() async throws {
    let fixture = BoundedCatalogHostFixture()
    fixture.setThreads([.make(id: "t1")])
    fixture.setProjects([.make(id: "p1")])
    seedTurns(fixture, count: 520)
    fixture.heldPaths = ["/api/threads/t1/history"]
    let harness = try await BoundedCatalogSessionHarness.make(
      fixture: fixture, threadCount: 0, projectCount: 0, configurePolicy: policy()
    )
    harness.session.state.socketState = .online
    let suite = harness.session.makeRichChatControllerSuite()
    let access = try XCTUnwrap(harness.session.currentRichChatAccess)
    suite.select(access: access, threadID: "t1")
    harness.session.activeRichChatSuite = suite

    let load = Task { await suite.transcript.loadHistory() }
    await harness.waitUntil("the held history read is in flight", timeout: 10) {
      suite.transcript.state.loadState == .loading
        && fixture.requestCount("/api/threads/t1/history") == 1
    }

    // The host rebases while the read is held: the response already built for
    // the held request is a pre-reset payload (a 200-turn bounded tail with
    // `ct1.320`) and must never install over the post-reset baseline.
    seedTurns(fixture, count: 80)
    harness.session.handleServerMessageForTests(
      .event(
        seq: 200,
        event: .object([
          "type": .string("thread-reset"),
          "threadId": .string("t1"),
        ]))
    )
    XCTAssertEqual(
      suite.transcript.state.loadState, .idle,
      "the held read is fenced by the delivered reset"
    )
    XCTAssertTrue(
      suite.transcript.state.requiresAuthoritativeRefresh,
      "the delivered reset demands an authoritative read even while loading"
    )

    fixture.heldPaths = []
    fixture.releaseWalks()
    await load.value
    await harness.waitUntil("the fresh post-reset baseline installs", timeout: 10) {
      suite.transcript.state.loadState == .loaded
        && suite.transcript.state.completedTurns.count == 80
        && suite.transcript.state.olderTurnsCursor == nil
    }
    XCTAssertGreaterThanOrEqual(
      fixture.requestCount("/api/threads/t1/history"), 2,
      "the delivered reset must drive a fresh authoritative read"
    )
    XCTAssertNotEqual(
      suite.transcript.state.completedTurns.count, 200,
      "the pre-reset payload must never install after the delivered reset"
    )
  }

  func testResyncGapInvalidatesTheRetainedOlderTurnLevel() async throws {
    let fixture = BoundedCatalogHostFixture()
    fixture.setThreads([.make(id: "t1")])
    fixture.setProjects([.make(id: "p1")])
    seedTurns(fixture, count: 520)
    let harness = try await BoundedCatalogSessionHarness.make(
      fixture: fixture, threadCount: 0, projectCount: 0, configurePolicy: policy()
    )
    let suite = try await attachRichChatSuite(harness)
    await suite.transcript.loadHistory(targetEntryCount: 40)
    await suite.transcript.loadOlder()
    XCTAssertEqual(suite.transcript.state.completedTurns.count, 400)

    harness.session.triggerResyncForTests(reason: "gap")
    await harness.waitUntil("resync gap refreshes the transcript", timeout: 10) {
      suite.transcript.state.completedTurns.count == 200
        && suite.transcript.state.olderTurnsCursor != nil
    }
  }

  func testProjectRestoreBeforeConfirmationSurvives() async throws {
    let fixture = BoundedCatalogHostFixture()
    let threads: [BoundedCatalogHostFixture.ThreadSeed] = (0 ..< 60).map { index in
      .make(
        id: String(format: "t%05d", index),
        projectId: String(format: "p%04d", index % 3)
      )
    }
    fixture.setThreads(threads)
    fixture.setProjects((0 ..< 3).map { .make(id: String(format: "p%04d", $0)) })
    BoundedCatalogURLProtocol.install(fixture)
    let harness = try await BoundedCatalogSessionHarness.make(
      fixture: fixture,
      threadCount: 0,
      projectCount: 0,
      configurePolicy: policy()
    )
    await harness.waitUntil("catalogs converge", timeout: 10) {
      harness.session.snapshot?.threads.count == 60
        && harness.session.snapshot?.projects.count == 3
        && harness.session.state.catalog.projectPass == nil
    }

    // The project is deleted before the pass starts (known before, unseen by
    // the walk) but restored before the membership confirmation answer: the
    // answer must return it existing and the client must keep it.
    let inventoryRequestsBefore = fixture.requests(matching: "/api/projects")
      .filter { $0.query["mode"] == "inventory" }.count
    fixture.deleteProject("p0002")
    fixture.beforeMembershipRespond = {
      fixture.restoreProject(.make(id: "p0002"))
      fixture.beforeMembershipRespond = nil
    }
    harness.session.handleServerMessageForTests(
      .event(
        seq: 700,
        event: .object([
          "type": .string("remote-projects-changed"),
          "mode": .string("signal"),
        ])
      )
    )
    await harness.waitUntil("restore-behind-cursor project pass completes", timeout: 10) {
      fixture.membershipBatches.contains { $0["projectIds"] == ["p0002"] }
        && harness.session.state.catalog.projectPass == nil
        && harness.session.state.catalog.threadPass == nil
    }
    XCTAssertTrue(
      harness.session.snapshot?.projects.contains { $0.id == "p0002" } == true,
      "a project restored before confirmation must survive"
    )
    XCTAssertEqual(harness.session.snapshot?.projects.count, 3)
    // The signal form carries no rows and routed through the bounded refresh.
    let inventoryRequestsAfter = fixture.requests(matching: "/api/projects")
      .filter { $0.query["mode"] == "inventory" }.count
    XCTAssertGreaterThan(
      inventoryRequestsAfter,
      inventoryRequestsBefore,
      "the payload-less signal must drive a bounded inventory refresh"
    )
  }
}
