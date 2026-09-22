import Foundation
import XCTest

@testable import App

/// B4 session-level bounded catalog behavior through the real
/// `AppSession` graph and the real `RemoteAPIClient` wire path.
@MainActor
final class BoundedCatalogSessionTests: XCTestCase {
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

  func testTenThousandThreadsAndTwoThousandProjectsPaintPageOneThenConverge() async throws {
    let fixture = BoundedCatalogHostFixture()
    fixture.holdWalks = true
    let harness = try await BoundedCatalogSessionHarness.make(
      fixture: fixture,
      threadCount: 10_000,
      projectCount: 2_000,
      configurePolicy: policy()
    )
    XCTAssertEqual(harness.session.phase, .ready)
    // Page 1 paints first: exactly the negotiated limits while both walks are
    // still held.
    XCTAssertEqual(harness.session.snapshot?.threads.count, 100)
    XCTAssertEqual(harness.session.snapshot?.projects.count, 50)
    let pageOneSeq = harness.session.state.lastSeenSeq
    XCTAssertEqual(harness.session.catalog.isNegotiated, true)

    fixture.releaseWalks()
    // This is a correctness/scale fixture, not a latency budget. On shared CI
    // simulators the 140 paged responses can take more than 30 seconds even
    // though the same run completes locally in about 26 seconds. Wait once for
    // the full state instead of recording cascading failures from three
    // sequential deadlines; production latency is qualified separately.
    await harness.waitUntil(
      "large catalog converges",
      timeout: 120,
      diagnostics: {
        "threads=\(harness.session.snapshot?.threads.count ?? -1) "
          + "projects=\(harness.session.snapshot?.projects.count ?? -1) "
          + "threadRequests=\(fixture.requestCount("/api/threads")) "
          + "projectRequests=\(fixture.requestCount("/api/projects")) "
          + "threadPass=\(harness.session.state.catalog.threadPass != nil) "
          + "projectPass=\(harness.session.state.catalog.projectPass != nil)"
      }
    ) {
      harness.session.snapshot?.threads.count == 10_000
        && harness.session.snapshot?.projects.count == 2_000
        && harness.session.state.catalog.threadPass == nil
        && harness.session.state.catalog.projectPass == nil
        && !harness.session.state.catalog.pendingThreadsPass
        && !harness.session.state.catalog.pendingProjectsPass
    }
    XCTAssertEqual(harness.session.snapshot?.threads.count, 10_000)
    XCTAssertEqual(harness.session.snapshot?.projects.count, 2_000)
    // Only the shell page 1 advances the global replay cursor; paint and
    // inventory continuations never do.
    XCTAssertEqual(harness.session.state.lastSeenSeq, pageOneSeq)
    // No false deletion attempts on a stable catalog.
    XCTAssertTrue(fixture.membershipBatches.isEmpty)
    XCTAssertNil(harness.session.state.catalog.threadAppliedSeq["t00000"])
    XCTAssertEqual(harness.session.state.catalog.pinnedThreadIds, [])
  }

  func testSegmentYieldsResumeWithoutATotalCap() async throws {
    let fixture = BoundedCatalogHostFixture()
    let harness = try await BoundedCatalogSessionHarness.make(
      fixture: fixture,
      threadCount: 1_000,
      projectCount: 1,
      configurePolicy: { policy in
        var next = policy
        next.drainDebounceMs = 1
        next.periodicReconcileEnabled = false
        next.segmentPages = 3
        return next
      }
    )
    XCTAssertEqual(harness.session.snapshot?.threads.count, 100)
    await harness.waitUntil("segmented walk converges", timeout: 30) {
      harness.session.snapshot?.threads.count == 1_000
        && harness.session.state.catalog.threadPass == nil
        && !harness.session.state.catalog.pendingThreadsPass
    }
    // 10 paint pages + 5 inventory pages with 3 pages per segment: several
    // yields, no cap, and the walk completed.
    XCTAssertGreaterThan(fixture.requestCount("/api/threads"), 4)
  }

  func testDeletionRequiresCompletedInventoryAndConfirmation() async throws {
    let fixture = BoundedCatalogHostFixture()
    let harness = try await BoundedCatalogSessionHarness.make(
      fixture: fixture,
      threadCount: 120,
      projectCount: 1,
      configurePolicy: policy()
    )
    await harness.waitUntil("initial convergence", timeout: 10) {
      harness.session.snapshot?.threads.count == 120
    }

    // Deleted before the pass starts: known before, unseen by the walk. It is
    // restored before the confirmation read, which must return it existing.
    fixture.deleteThread("t00010")
    fixture.beforeMembershipRespond = {
      fixture.restoreThread(
        .make(id: "t00010", updatedAt: "2026-01-01T00:00:10.000Z")
      )
      fixture.beforeMembershipRespond = nil
    }
    harness.session.handleServerMessageForTests(
      .event(
        seq: 100,
        event: .object([
          "type": .string("remote-threads-changed"),
          "threadIds": .array([.string("t00010")]),
        ])
      )
    )
    await harness.waitUntil("restore-behind-cursor pass completes", timeout: 10) {
      fixture.membershipBatches.count == 1 && harness.session.state.catalog.threadPass == nil
    }
    XCTAssertEqual(fixture.membershipBatches[0]["threadIds"], ["t00010"])
    XCTAssertTrue(
      harness.session.snapshot?.threads.contains { $0.id == "t00010" } == true,
      "a restored row must survive confirmation"
    )

    // Deleted and not restored: confirmed absent and removed, in one batch.
    fixture.deleteThread("t00020")
    harness.session.handleServerMessageForTests(
      .event(
        seq: 101,
        event: .object([
          "type": .string("remote-threads-changed"),
          "threadIds": .array([.string("t00020")]),
        ])
      )
    )
    await harness.waitUntil("confirmed deletion converges", timeout: 10) {
      harness.session.snapshot?.threads.contains { $0.id == "t00020" } == false
        && harness.session.state.catalog.threadPass == nil
    }
    XCTAssertEqual(harness.session.snapshot?.threads.count, 119)
    XCTAssertEqual(fixture.membershipBatches.last?["threadIds"], ["t00020"])
    XCTAssertTrue(harness.session.snapshot?.threads.contains { $0.id == "t00010" } == true)
  }

  func testServerThreadStateWinsAgainstALatePage() async throws {
    let fixture = BoundedCatalogHostFixture()
    let harness = try await BoundedCatalogSessionHarness.make(
      fixture: fixture,
      threadCount: 300,
      projectCount: 1,
      configurePolicy: policy()
    )
    await harness.waitUntil("threads converge", timeout: 10) {
      harness.session.snapshot?.threads.count == 300
    }

    // Start a pass and hold its page in flight, then apply a live thread-state
    // with a newer event seq while the page read is still outstanding.
    fixture.holdWalks = true
    harness.session.handleServerMessageForTests(
      .event(
        seq: 54,
        event: .object([
          "type": .string("remote-threads-changed"),
          "threadIds": .array([.string("t00150")]),
        ])
      )
    )
    await harness.waitUntil("pass page in flight", timeout: 5) {
      harness.session.state.catalog.threadPass != nil
        && fixture.requestCount("/api/threads") > 0
    }
    let passStartedSeq = harness.session.state.catalog.threadPass?.startedSeq ?? Int.max
    // The host persists the transition (as `persistThreadStateEvent` does), so
    // any page read after it is consistent; the held page still carries the
    // pre-event value.
    fixture.mutateThread(id: "t00150", status: "working", attention: "working")
    harness.session.handleServerMessageForTests(
      .event(
        seq: 55,
        event: .object([
          "type": .string("thread-state"),
          "threadId": .string("t00150"),
          "status": .string("working"),
          "attention": .string("working"),
          "canResumeWithConfig": .bool(true),
        ])
      )
    )
    XCTAssertEqual(harness.session.state.catalog.threadAppliedSeq["t00150"], 55)

    fixture.releaseWalks()
    await harness.waitUntil("held page merged and pass completed", timeout: 10) {
      harness.session.state.catalog.threadPass == nil
    }
    XCTAssertLessThan(passStartedSeq, 55)
    XCTAssertEqual(
      harness.session.snapshot?.threads.first { $0.id == "t00150" }?.status, "working",
      "a live-applied row must not regress to the page's older status"
    )
    XCTAssertEqual(harness.session.state.catalog.threadAppliedSeq["t00150"], 55)
  }

  func testSupersededDrainCannotStealSuccessorOwnership() async throws {
    let fixture = BoundedCatalogHostFixture()
    let harness = try await BoundedCatalogSessionHarness.make(
      fixture: fixture,
      threadCount: 400,
      projectCount: 1,
      configurePolicy: policy()
    )
    await harness.waitUntil("initial convergence", timeout: 10) {
      harness.session.snapshot?.threads.count == 400
    }

    // Hold the next membership pass's page in flight, then start a new
    // generation while the old drain is still unwinding inside the request.
    fixture.holdWalks = true
    harness.session.handleServerMessageForTests(
      .event(
        seq: 200,
        event: .object([
          "type": .string("remote-threads-changed"),
          "threadIds": .array([.string("t00000")]),
        ])
      )
    )
    await harness.waitUntil("old drain owns the walk", timeout: 5) {
      harness.session.state.catalog.drainOwners[.threads] != nil
        && fixture.requestCount("/api/threads") > 1
    }
    let oldAttempt = harness.session.state.catalog.attempt
    let oldOwner = harness.session.state.catalog.drainOwners[.threads]

    // A resync gap supersedes the generation; the fresh pass must run even
    // while the old drain is still suspended.
    harness.session.catalog.onResyncGap()
    harness.session.catalog.onSocketOnline()
    await harness.waitUntil("fresh generation schedules its own drain", timeout: 10) {
      harness.session.state.catalog.attempt > oldAttempt
        && harness.session.state.catalog.drainOwners[.threads]?.attempt
          == harness.session.state.catalog.attempt
    }
    XCTAssertNotEqual(oldOwner?.attempt, harness.session.state.catalog.attempt)

    fixture.releaseWalks()
    await harness.waitUntil("fresh pass completes", timeout: 10) {
      harness.session.state.catalog.threadPass == nil
        && !harness.session.state.catalog.pendingThreadsPass
    }
    XCTAssertEqual(harness.session.snapshot?.threads.count, 400)
  }

  func testOpenViewPinProtectsExactRowAndReleasesByOwner() async throws {
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

    // The real deep-link by-id read installs the outside-page row, and the open
    // RichChat page takes over its pin from the navigation owner.
    _ = await harness.session.ensureThreadLoadedForOpen(id: outsidePage)
    _ = try await attachRichChatPage(harness, threadID: outsidePage)
    XCTAssertTrue(harness.session.state.catalog.pinnedThreadIds.contains(outsidePage))
    XCTAssertFalse(
      harness.session.state.catalog.navigationPinnedThreadIds.contains(outsidePage),
      "the open view owns the pin after the handoff"
    )

    // Replacing the open view releases the previous owner's pin, and opening
    // back pins the new target while releasing the intermediate one.
    _ = try await attachRichChatPage(harness, threadID: "t00001")
    XCTAssertEqual(harness.session.state.catalog.pinnedThreadIds, ["t00001"])
    let restored = try await attachRichChatPage(harness, threadID: outsidePage)
    XCTAssertEqual(harness.session.state.catalog.pinnedThreadIds, [outsidePage])

    fixture.releaseWalks()
    await harness.waitUntil("walks complete", timeout: 10) {
      harness.session.state.catalog.threadPass == nil
    }

    // A host deletion of the pinned thread cannot converge while pinned.
    fixture.deleteThread(outsidePage)
    harness.session.handleServerMessageForTests(
      .event(
        seq: 300,
        event: .object([
          "type": .string("remote-threads-changed"),
          "threadIds": .array([.string(outsidePage)]),
        ])
      )
    )
    try await Task.sleep(for: .milliseconds(120))
    XCTAssertTrue(
      harness.session.snapshot?.threads.contains { $0.id == outsidePage } == true,
      "pinned (open) rows are never deletion candidates"
    )

    harness.session.detachRichChatSuite(restored)
    // A membership event after the release re-runs the confirmation gate.
    harness.session.handleServerMessageForTests(
      .event(
        seq: 301,
        event: .object([
          "type": .string("remote-threads-changed"),
          "threadIds": .array([.string(outsidePage)]),
        ])
      )
    )
    await harness.waitUntil("released pin converges", timeout: 10) {
      harness.session.snapshot?.threads.contains { $0.id == outsidePage } == false
    }
    XCTAssertEqual(harness.session.snapshot?.threads.count, 299)
  }

  /// Attaches the real RichChat page lifecycle for one thread.
  private func attachRichChatPage(
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

  func testMembershipEventDuringAnActiveWalkSchedulesAFollowUpPass() async throws {
    let fixture = BoundedCatalogHostFixture()
    let harness = try await BoundedCatalogSessionHarness.make(
      fixture: fixture,
      threadCount: 60,
      projectCount: 1,
      configurePolicy: policy()
    )
    await harness.waitUntil("initial convergence", timeout: 10) {
      harness.session.snapshot?.threads.count == 60
    }

    fixture.holdWalks = true
    fixture.deleteThread("t00005")
    harness.session.handleServerMessageForTests(
      .event(
        seq: 100,
        event: .object([
          "type": .string("remote-threads-changed"),
          "threadIds": .array([.string("t00005")]),
        ])
      )
    )
    await harness.waitUntil("pass page in flight", timeout: 5) {
      harness.session.state.catalog.threadPass != nil
        && fixture.requestCount("/api/threads") > 0
    }
    // A second membership change while the walk is in flight must schedule a
    // follow-up pass; it must not be dropped by the walk's completion.
    fixture.deleteThread("t00006")
    harness.session.handleServerMessageForTests(
      .event(
        seq: 101,
        event: .object([
          "type": .string("remote-threads-changed"),
          "threadIds": .array([.string("t00006")]),
        ])
      )
    )
    XCTAssertTrue(harness.session.state.catalog.pendingThreadsPass)
    fixture.releaseWalks()
    await harness.waitUntil("follow-up pass converges both deletions", timeout: 10) {
      harness.session.snapshot?.threads.count == 58
        && harness.session.state.catalog.threadPass == nil
        && !harness.session.state.catalog.pendingThreadsPass
    }
    XCTAssertFalse(harness.session.snapshot?.threads.contains { $0.id == "t00005" } ?? true)
    XCTAssertFalse(harness.session.snapshot?.threads.contains { $0.id == "t00006" } ?? true)
  }

  func testBackgroundCancelsWalksAndForegroundResumesWithoutLostDrains() async throws {
    let fixture = BoundedCatalogHostFixture()
    fixture.holdWalks = true
    let harness = try await BoundedCatalogSessionHarness.make(
      fixture: fixture,
      threadCount: 400,
      projectCount: 1,
      configurePolicy: policy()
    )
    XCTAssertEqual(harness.session.snapshot?.threads.count, 100)

    _ = harness.session.cancelBackgroundSensitiveTasks()
    fixture.releaseWalks()
    try await Task.sleep(for: .milliseconds(80))
    XCTAssertNotEqual(harness.session.snapshot?.threads.count, 400)

    harness.session.handleScenePhase(.active)
    await harness.waitUntil("foreground resumes the retained walk", timeout: 15) {
      harness.session.snapshot?.threads.count == 400
        && harness.session.state.catalog.threadPass == nil
    }
    XCTAssertEqual(harness.session.state.catalog.pendingThreadsPass, false)
  }

  func testDeclaredCapabilityViolationIsTypedAndRestartsBoundedly() async throws {
    let fixture = BoundedCatalogHostFixture()
    fixture.holdWalks = true
    let harness = try await BoundedCatalogSessionHarness.make(
      fixture: fixture,
      threadCount: 50,
      projectCount: 1,
      configurePolicy: policy()
    )
    // Let the held bootstrap walk settle before injecting the violation, so
    // the failing request is unambiguously issued under suppression.
    let bootstrapAttempt = harness.session.state.catalog.attempt
    fixture.releaseWalks()
    await harness.waitUntil("held walk settles", timeout: 10) {
      harness.session.state.catalog.attempt == bootstrapAttempt
        && harness.session.state.catalog.threadPass == nil
        && !harness.session.state.catalog.pendingThreadsPass
    }
    let attempt = harness.session.state.catalog.attempt

    // A declared host that stops echoing the capability on a walk route is a
    // typed violation: visible, restarting the walk generation, never legacy.
    fixture.suppressEchoPaths = ["/api/threads"]
    harness.session.handleServerMessageForTests(
      .event(
        seq: 900,
        event: .object([
          "type": .string("remote-threads-changed"),
          "threadIds": .array([]),
        ])
      )
    )
    await harness.waitUntil("protocol violation surfaces", timeout: 10) {
      harness.session.state.globalError != nil
        && harness.session.state.catalog.attempt > attempt
    }
    XCTAssertEqual(harness.session.catalog.isNegotiated, true)
    XCTAssertEqual(
      harness.session.state.globalError?.isEmpty, false,
      "a declared capability violation must be visible"
    )

    // Remove the violation: the authoritative resync page resets the budget
    // and the walk converges again.
    fixture.suppressEchoPaths = []
    harness.session.catalog.onSocketOnline()
    await harness.waitUntil("walks resume and converge", timeout: 10) {
      harness.session.snapshot?.threads.count == 50
        && harness.session.state.catalog.threadPass == nil
        && !harness.session.state.catalog.pendingThreadsPass
    }
    // A protocol error never downgrades the host to legacy.
    XCTAssertFalse(harness.session.catalog.isLegacyHost)
  }

  func testLegacyHostKeepsTheAssembledPathAndNeverWalks() async throws {
    let fixture = BoundedCatalogHostFixture()
    fixture.declared = false
    let harness = try await BoundedCatalogSessionHarness.make(
      fixture: fixture,
      threadCount: 130,
      projectCount: 3,
      configurePolicy: policy()
    )
    XCTAssertEqual(harness.session.snapshot?.threads.count, 130)
    XCTAssertEqual(harness.session.snapshot?.projects.count, 3)
    XCTAssertEqual(harness.session.catalog.isLegacyHost, true)
    XCTAssertEqual(fixture.requestCount("/api/threads"), 0)
    XCTAssertEqual(fixture.requestCount("/api/projects"), 0)
    XCTAssertEqual(fixture.requestCount("/api/catalog/membership"), 0)

    // A membership event refreshes the assembled shell, never an inventory
    // walk or a confirmation read.
    fixture.deleteThread("t00005")
    harness.session.handleServerMessageForTests(
      .event(
        seq: 10,
        event: .object([
          "type": .string("remote-threads-changed"),
          "threadIds": .array([.string("t00005")]),
        ])
      )
    )
    await harness.waitUntil("legacy refresh converges", timeout: 10) {
      harness.session.snapshot?.threads.count == 129
    }
    XCTAssertEqual(fixture.requestCount("/api/threads"), 0)
    XCTAssertEqual(fixture.requestCount("/api/catalog/membership"), 0)
  }

  func testProjectDeletionIsConfirmedAndSchedulesCascade() async throws {
    let fixture = BoundedCatalogHostFixture()
    var threads: [BoundedCatalogHostFixture.ThreadSeed] = []
    for index in 0 ..< 60 {
      threads.append(
        .make(
          id: String(format: "t%05d", index),
          projectId: String(format: "p%04d", index % 3)
        )
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

    // A project delete cascades its threads host-side; the client schedules a
    // thread pass on the project event.
    fixture.deleteProject("p0002")
    harness.session.handleServerMessageForTests(
      .event(
        seq: 400,
        event: .object([
          "type": .string("remote-projects-changed"),
          "projectIds": .array([.string("p0002")]),
        ])
      )
    )
    await harness.waitUntil("project and cascade converge", timeout: 10) {
      harness.session.snapshot?.projects.count == 2
        && harness.session.snapshot?.threads.count == 40
        && harness.session.state.catalog.projectPass == nil
        && harness.session.state.catalog.threadPass == nil
    }
    XCTAssertTrue(
      fixture.membershipBatches.contains { $0["projectIds"] == ["p0002"] },
      "the project confirmation batch must carry exactly the deleted project"
    )
  }
}
