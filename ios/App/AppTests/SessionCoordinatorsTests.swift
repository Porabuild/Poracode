import XCTest

@testable import App

// MARK: - History / live hydration

final class ThreadHistoryHydrationTests: XCTestCase {
  func testHistoryNPlusLiveEventsReplayOnce() throws {
    var buffer = ThreadHistoryHydrationBuffer()
    let threadId = "thread-1"
    let gen = 3
    buffer.begin(threadId: threadId, workGeneration: gen)

    // Live envelopes N+1..N+3 while history N is in flight.
    let started = runtimeEnvelope(
      type: "item.started",
      threadId: threadId,
      itemId: "item-a",
      itemType: "assistant_message",
      state: "running"
    )
    let delta = runtimeEnvelope(
      type: "content.delta",
      threadId: threadId,
      itemId: "item-a",
      stream: "assistant_text",
      delta: "hello"
    )
    let completed = runtimeEnvelope(
      type: "item.completed",
      threadId: threadId,
      itemId: "item-a",
      state: "completed"
    )

    XCTAssertTrue(
      buffer.bufferIfHydrating(threadId: threadId, workGeneration: gen, seq: 11, event: started)
    )
    XCTAssertTrue(
      buffer.bufferIfHydrating(threadId: threadId, workGeneration: gen, seq: 12, event: delta)
    )
    XCTAssertTrue(
      buffer.bufferIfHydrating(threadId: threadId, workGeneration: gen, seq: 13, event: completed)
    )
    XCTAssertEqual(buffer.buffered.count, 3)

    let historyItems: [PersistedRuntimeItem] = [
      PersistedRuntimeItem(
        id: "older",
        type: "user_message",
        state: "completed",
        payload: nil,
        streams: ["input_text": "prior"],
        parentItemId: nil
      )
    ]
    let snapshotSeq = 10
    let replay = buffer.commitHistory(
      threadId: threadId,
      workGeneration: gen,
      snapshotSeq: snapshotSeq
    )
    XCTAssertNotNil(replay)
    XCTAssertEqual(replay?.map(\.seq), [11, 12, 13])
    XCTAssertFalse(buffer.isAwaitingHistory)
    XCTAssertTrue(buffer.buffered.isEmpty)

    let installed = ThreadHistoryHydration.install(
      historyItems: historyItems,
      threadId: threadId,
      snapshotSeq: snapshotSeq,
      buffered: replay!
    )
    XCTAssertEqual(installed.count, 2)
    let live = try XCTUnwrap(installed.first(where: { $0.id == "item-a" }))
    XCTAssertEqual(live.state, "completed")
    XCTAssertEqual(live.streams["assistant_text"], "hello")

    // Second commit must not re-replay (buffer already closed).
    XCTAssertNil(
      buffer.commitHistory(threadId: threadId, workGeneration: gen, snapshotSeq: snapshotSeq)
    )
  }

  func testDiscardOnThreadSwitchCancelsBuffer() {
    var buffer = ThreadHistoryHydrationBuffer()
    buffer.begin(threadId: "t1", workGeneration: 1)
    _ = buffer.bufferIfHydrating(
      threadId: "t1",
      workGeneration: 1,
      seq: 5,
      event: .object(["type": .string("noop")])
    )
    buffer.begin(threadId: "t2", workGeneration: 1)
    XCTAssertEqual(buffer.threadId, "t2")
    XCTAssertTrue(buffer.buffered.isEmpty)
    // Stale t1 commit rejected.
    XCTAssertNil(buffer.commitHistory(threadId: "t1", workGeneration: 1, snapshotSeq: 0))
  }

  func testWorkGenerationMismatchDropsBuffer() {
    var buffer = ThreadHistoryHydrationBuffer()
    buffer.begin(threadId: "t1", workGeneration: 1)
    XCTAssertFalse(
      buffer.bufferIfHydrating(
        threadId: "t1",
        workGeneration: 2,
        seq: 1,
        event: .object([:])
      )
    )
    buffer.discard()
    XCTAssertFalse(buffer.isActive)
  }

  func testDiscardIfMatchingLeavesReplacementBuffer() {
    var buffer = ThreadHistoryHydrationBuffer()
    buffer.begin(threadId: "old", workGeneration: 1)
    buffer.begin(threadId: "new", workGeneration: 2)
    buffer.discardIfMatching(threadId: "old", workGeneration: 1)
    XCTAssertTrue(buffer.isActive)
    XCTAssertEqual(buffer.threadId, "new")
    buffer.discardIfMatching(threadId: "new", workGeneration: 2)
    XCTAssertFalse(buffer.isActive)
  }

  private func runtimeEnvelope(
    type: String,
    threadId: String,
    itemId: String,
    itemType: String? = nil,
    state: String? = nil,
    stream: String? = nil,
    delta: String? = nil
  ) -> JSONValue {
    var event: [String: JSONValue] = [
      "type": .string(type),
      "threadId": .string(threadId),
      "itemId": .string(itemId),
    ]
    if let itemType { event["itemType"] = .string(itemType) }
    if let state { event["state"] = .string(state) }
    if let stream { event["stream"] = .string(stream) }
    if let delta { event["delta"] = .string(delta) }
    return .object([
      "type": .string("thread-runtime-event"),
      "threadId": .string(threadId),
      "event": .object(event),
    ])
  }
}

// MARK: - Global cursor ownership

final class GlobalCursorOwnershipTests: XCTestCase {
  func testThreadHistoryMustNotAdvanceGlobalCursor() {
    XCTAssertFalse(GlobalCursorOwnership.shouldAdvanceGlobalCursorFromThreadHistory())
  }

  func testResyncReconnectUsesShellSnapshotOnly() {
    XCTAssertEqual(GlobalCursorOwnership.resyncReconnectSeq(shellSnapshotSeq: 42), 42)
    XCTAssertEqual(GlobalCursorOwnership.resyncReconnectSeq(shellSnapshotSeq: -3), 0)
    // History seq must not be mixed into the reconnect decision.
    let shell = 100
    let history = 250
    let reconnect = GlobalCursorOwnership.resyncReconnectSeq(shellSnapshotSeq: shell)
    XCTAssertEqual(reconnect, 100)
    XCTAssertNotEqual(reconnect, history)
  }

  func testAuthoritativeCursorOnlyFromShellNotHistory() {
    var cursor = EventStreamCursor(appliedSeq: 50)
    // Simulate live events advancing applied.
    cursor.markEventApplied(51)
    cursor.markEventApplied(52)
    // Per-thread history N=40 must not call noteAuthoritative when ownership forbids it.
    if GlobalCursorOwnership.shouldAdvanceGlobalCursorFromThreadHistory() {
      cursor.noteAuthoritativeSnapshot(40)
    }
    XCTAssertEqual(cursor.appliedSeq, 52, "history must not touch global cursor")
    // Shell snapshot does advance with max.
    cursor.noteAuthoritativeSnapshot(60)
    XCTAssertEqual(cursor.appliedSeq, 60)
  }
}

// MARK: - Background / live session lifecycle

final class LiveSessionLifecycleTests: XCTestCase {
  func testSocketStartDeferredWhileBackground() {
    var life = LiveSessionLifecycle()
    life.noteEnteredBackground(sessionExpired: false, resyncPending: false)
    XCTAssertEqual(life.decideSocketStart(), .deferUntilForeground)
    XCTAssertTrue(life.pendingLiveStart)

    let actions = life.noteForeground()
    XCTAssertTrue(actions.startLiveSession)
    XCTAssertFalse(life.isInBackground)
    XCTAssertEqual(life.decideSocketStart(), .startNow)
  }

  func testUnauthorizedRetryDeferredAndRescheduledOnForeground() {
    var life = LiveSessionLifecycle()
    life.noteEnteredBackground(sessionExpired: true, resyncPending: false)
    XCTAssertTrue(life.pendingUnauthorizedRetry)

    // 60s fire while still backgrounded parks again (idempotent).
    life.noteUnauthorizedRetryFiresWhileBackgrounded()
    XCTAssertTrue(life.pendingUnauthorizedRetry)

    let actions = life.noteForeground()
    XCTAssertTrue(actions.rescheduleUnauthorizedRetry)
    XCTAssertFalse(life.pendingUnauthorizedRetry)
  }

  func testResyncRetryBlockedByBackground() {
    var life = LiveSessionLifecycle()
    life.noteEnteredBackground(sessionExpired: false, resyncPending: true)
    XCTAssertTrue(life.pendingResyncRetry)
    life.noteResyncRetryBlockedByBackground()
    let actions = life.noteForeground()
    XCTAssertTrue(actions.rescheduleResync)
  }

  func testClearAllPending() {
    var life = LiveSessionLifecycle()
    life.noteEnteredBackground(sessionExpired: true, resyncPending: true)
    _ = life.decideSocketStart()
    life.clearAllPending()
    XCTAssertFalse(life.pendingLiveStart)
    XCTAssertFalse(life.pendingUnauthorizedRetry)
    XCTAssertFalse(life.pendingResyncRetry)
  }

  func testForegroundWithoutPendingDoesNotStartLive() {
    var life = LiveSessionLifecycle()
    life.noteEnteredBackground(sessionExpired: false, resyncPending: false)
    // No decideSocketStart → no pending live start.
    let actions = life.noteForeground()
    XCTAssertFalse(actions.startLiveSession)
  }
}

// MARK: - Stale socket identity

final class SocketDelegateIdentityTests: XCTestCase {
  func testStaleClientIgnored() {
    let decision = SocketDelegateIdentity.decision(
      activeSocketMatches: false,
      currentWorkGeneration: 7
    )
    XCTAssertEqual(decision, .ignoreStaleClient)
  }

  func testMatchingClientCapturesGeneration() {
    let decision = SocketDelegateIdentity.decision(
      activeSocketMatches: true,
      currentWorkGeneration: 9
    )
    XCTAssertEqual(decision, .proceed(generation: 9))
  }

  func testExpiryMustNotUseUnverifiedGeneration() {
    // Host A expires after host B is active → identity fails; generation 5 is never used.
    let hostAMatches = false
    let currentGenForHostB = 5
    let decision = SocketDelegateIdentity.decision(
      activeSocketMatches: hostAMatches,
      currentWorkGeneration: currentGenForHostB
    )
    if case .proceed = decision {
      XCTFail("stale host A must not proceed with host B generation")
    }
    XCTAssertEqual(decision, .ignoreStaleClient)
  }
}

// MARK: - Pair persistence rollback

final class PairPersistenceCoordinatorTests: XCTestCase {
  func testRollbackRestoresPriorWhenPresent() {
    let profile = ConnectionProfile(
      desktopId: "d",
      label: "L",
      httpBaseURL: "https://desktop.example",
      wsBaseURL: "wss://desktop.example",
      appVersion: "1",
      hostMode: nil,
      platform: nil,
      scopes: ["session:read"],
      tokenExpiresAt: nil,
      pairedAt: Date(timeIntervalSince1970: 1)
    )
    let action = PairPersistenceCoordinator.rollbackAction(
      priorProfile: profile,
      priorToken: "old-token"
    )
    guard case .restorePrior(let p, let t) = action else {
      return XCTFail("expected restorePrior")
    }
    XCTAssertEqual(p.desktopId, "d")
    XCTAssertEqual(t, "old-token")
  }

  func testRollbackClearsPartialWhenNoPrior() {
    XCTAssertEqual(
      PairPersistenceCoordinator.rollbackAction(priorProfile: nil, priorToken: nil),
      .clearPartial
    )
    XCTAssertEqual(
      PairPersistenceCoordinator.rollbackAction(priorProfile: nil, priorToken: ""),
      .clearPartial
    )
  }

  func testNeedsStoreRollbackOnlyAfterTokenBeforeMetadata() {
    XCTAssertFalse(
      PairPersistenceCoordinator.needsStoreRollback(phase: .beforeTokenWrite)
    )
    XCTAssertTrue(
      PairPersistenceCoordinator.needsStoreRollback(phase: .afterTokenWriteBeforeMetadata)
    )
    XCTAssertFalse(
      PairPersistenceCoordinator.needsStoreRollback(phase: .committed)
    )
  }

  func testInMemoryStoreFakeRollbackTransaction() async throws {
    // Injectable store fakes: simulate token write then metadata failure → rollback.
    final class TokenBox: @unchecked Sendable {
      var token: String?
    }
    final class ProfileBox: @unchecked Sendable {
      var profile: ConnectionProfile?
    }
    let tokens = TokenBox()
    let profiles = ProfileBox()

    let prior = ConnectionProfile(
      desktopId: "prior",
      label: "Prior",
      httpBaseURL: "https://prior.example",
      wsBaseURL: "wss://prior.example",
      appVersion: "1",
      hostMode: nil,
      platform: nil,
      scopes: ["session:read"],
      tokenExpiresAt: nil,
      pairedAt: Date(timeIntervalSince1970: 1)
    )
    tokens.token = "prior-token"
    profiles.profile = prior

    var phase = PairPersistenceCoordinator.WritePhase.beforeTokenWrite
    // New token write succeeds.
    tokens.token = "new-token"
    phase = .afterTokenWriteBeforeMetadata
    // Metadata save fails.
    let saveFailed = true
    if saveFailed, PairPersistenceCoordinator.needsStoreRollback(phase: phase) {
      switch PairPersistenceCoordinator.rollbackAction(
        priorProfile: prior,
        priorToken: "prior-token"
      ) {
      case .restorePrior(let p, let t):
        tokens.token = t
        profiles.profile = p
      case .clearPartial:
        tokens.token = nil
        profiles.profile = nil
      }
    }
    XCTAssertEqual(tokens.token, "prior-token")
    XCTAssertEqual(profiles.profile?.desktopId, "prior")
  }
}

// MARK: - Deep-link fingerprint / idempotency

final class PairingCandidateTrackerTests: XCTestCase {
  func testFingerprintIsStableAndNonSecret() {
    let a = PairingCandidateTracker.fingerprint(
      endpoint: "https://desktop.example",
      credential: "lc_pair_secret"
    )
    let b = PairingCandidateTracker.fingerprint(
      endpoint: "https://desktop.example",
      credential: "lc_pair_secret"
    )
    XCTAssertEqual(a, b)
    XCTAssertEqual(a.count, 64, "sha256 hex")
    XCTAssertFalse(a.contains("lc_pair_secret"))
    XCTAssertFalse(a.contains("desktop.example"))
  }

  func testDuplicateInFlightAndSucceededIgnored() {
    var tracker = PairingCandidateTracker()
    let digest = PairingCandidateTracker.fingerprint(
      endpoint: "https://h",
      credential: "tok1"
    )
    XCTAssertEqual(tracker.decide(digest: digest), .proceed)
    tracker.markInFlight(digest)
    XCTAssertEqual(tracker.decide(digest: digest), .ignoreDuplicate)

    tracker.markSucceeded(digest)
    XCTAssertEqual(tracker.decide(digest: digest), .ignoreDuplicate)
  }

  func testFailedAllowsRetryOfSameCandidate() {
    var tracker = PairingCandidateTracker()
    let digest = PairingCandidateTracker.fingerprint(
      endpoint: "https://h",
      credential: "tok1"
    )
    tracker.markInFlight(digest)
    tracker.markFailed(digest)
    XCTAssertEqual(tracker.decide(digest: digest), .proceed)
  }

  func testFreshTokenSameHostStillWorks() {
    var tracker = PairingCandidateTracker()
    let first = PairingCandidateTracker.fingerprint(
      endpoint: "https://h",
      credential: "tok-old"
    )
    let second = PairingCandidateTracker.fingerprint(
      endpoint: "https://h",
      credential: "tok-new"
    )
    XCTAssertNotEqual(first, second)
    tracker.markSucceeded(first)
    XCTAssertEqual(tracker.decide(digest: second), .proceed)
  }
}

// MARK: - Terminal presentation filter

final class ThreadPresentationFilterTests: XCTestCase {
  func testHidesTerminalPresentationMode() {
    let gui = RemoteThread(
      id: "g1",
      remoteServerId: nil,
      remoteId: nil,
      projectId: "p1",
      title: "Chat",
      agentKind: "claude",
      agentInstanceId: nil,
      config: .empty,
      status: "idle",
      attention: "none",
      canResumeWithConfig: nil,
      worktreePath: nil,
      worktreeBranch: nil,
      archived: false,
      done: false,
      starred: false,
      presentationMode: "gui",
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-02T00:00:00.000Z",
      activeTurnStartedAt: nil,
      lastTurnStartedAt: nil,
      lastTurnEndedAt: nil,
      errorMessage: nil,
      parentThreadId: nil
    )
    let terminal = RemoteThread(
      id: "t1",
      remoteServerId: nil,
      remoteId: nil,
      projectId: "p1",
      title: "PTY",
      agentKind: "claude",
      agentInstanceId: nil,
      config: .empty,
      status: "idle",
      attention: "none",
      canResumeWithConfig: nil,
      worktreePath: nil,
      worktreeBranch: nil,
      archived: false,
      done: false,
      starred: true,
      presentationMode: "terminal",
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-03T00:00:00.000Z",
      activeTurnStartedAt: nil,
      lastTurnStartedAt: nil,
      lastTurnEndedAt: nil,
      errorMessage: nil,
      parentThreadId: nil
    )
    let otherProject = RemoteThread(
      id: "g2",
      remoteServerId: nil,
      remoteId: nil,
      projectId: "p2",
      title: "Other",
      agentKind: "claude",
      agentInstanceId: nil,
      config: .empty,
      status: "idle",
      attention: "none",
      canResumeWithConfig: nil,
      worktreePath: nil,
      worktreeBranch: nil,
      archived: false,
      done: false,
      starred: false,
      presentationMode: nil,
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
      activeTurnStartedAt: nil,
      lastTurnStartedAt: nil,
      lastTurnEndedAt: nil,
      errorMessage: nil,
      parentThreadId: nil
    )

    XCTAssertTrue(ThreadPresentationFilter.isVisibleInGUIList(gui))
    XCTAssertFalse(ThreadPresentationFilter.isVisibleInGUIList(terminal))
    // Authoritative default: missing presentationMode is terminal (not GUI).
    XCTAssertFalse(ThreadPresentationFilter.isVisibleInGUIList(otherProject))
    XCTAssertFalse(ThreadPresentationFilter.isGUIPresentation(nil))
    XCTAssertTrue(ThreadPresentationFilter.isGUIPresentation("gui"))

    let visible = ThreadPresentationFilter.visibleThreads(
      from: [gui, terminal, otherProject],
      projectId: "p1"
    )
    XCTAssertEqual(visible.map(\.id), ["g1"])
  }
}

final class UnifiedThreadPresentationTests: XCTestCase {
  func testMixesHostsWithCollisionFreeIDsAndGlobalSort() {
    let first = ClientConnectionID()
    let second = ClientConnectionID()
    let firstSnapshot = snapshot(title: "First", updatedAt: "2026-08-01T00:00:00Z")
    let secondSnapshot = snapshot(
      title: "Second",
      updatedAt: "2026-07-01T00:00:00Z",
      starred: true
    )

    let entries = UnifiedThreadPresentation.entries(
      hosts: [host(first, label: "MacBook"), host(second, label: "Studio")],
      selectedConnectionID: first,
      selectedSnapshot: firstSnapshot,
      hostSnapshots: [first: firstSnapshot, second: secondSnapshot]
    )

    XCTAssertEqual(entries.map(\.thread.title), ["Second", "First"])
    XCTAssertNotEqual(entries[0].id, entries[1].id)
    XCTAssertEqual(CompositeRemoteID(rawValue: entries[0].id).decode()?.connectionId, second)
  }

  func testHomePresentationGroupsThreadsOnlyWithinOneHostProjectAndWorktree() {
    let connection = ClientConnectionID()
    let project = project(id: "project", name: "Poracode")
    let items = [
      item(
        connection: connection,
        hostName: "MacBook",
        project: project,
        thread: thread(id: "one", title: "One", worktreePath: "/repo/worktree")
      ),
      item(
        connection: connection,
        hostName: "MacBook",
        project: project,
        thread: thread(id: "two", title: "Two", worktreePath: "/repo/worktree")
      ),
    ]

    let entries = HomeThreadListPresentation.entries(from: items)

    guard case .worktree(let group) = entries.first else {
      return XCTFail("Expected a worktree group")
    }
    XCTAssertEqual(entries.count, 1)
    XCTAssertEqual(group.threads.map(\.thread.id), ["one", "two"])
  }

  func testHomeWorktreeCollapsedStatusPrefersFinishedThenWorking() {
    let connection = ClientConnectionID()
    let project = project(id: "project", name: "Poracode")
    let worktreePath = "/repo/worktree"
    let items = [
      item(
        connection: connection,
        hostName: "MacBook",
        project: project,
        thread: thread(
          id: "working", title: "Working", worktreePath: worktreePath, status: "working")
      ),
      item(
        connection: connection,
        hostName: "MacBook",
        project: project,
        thread: thread(
          id: "finished", title: "Finished", worktreePath: worktreePath, status: "finished")
      ),
    ]

    guard case .worktree(let group) = HomeThreadListPresentation.entries(from: items).first else {
      return XCTFail("Expected a worktree group")
    }
    XCTAssertEqual(group.collapsedStatusTone, .finished)

    let withoutFinished = HomeWorktreeThreadGroup(
      id: group.id,
      connectionID: group.connectionID,
      hostName: group.hostName,
      project: group.project,
      worktreePath: group.worktreePath,
      worktreeBranch: group.worktreeBranch,
      threads: [items[0]]
    )
    XCTAssertEqual(withoutFinished.collapsedStatusTone, .working)
  }

  func testHomePresentationDoesNotGroupSamePathAcrossHostsOrProjects() {
    let firstConnection = ClientConnectionID()
    let secondConnection = ClientConnectionID()
    let firstProject = project(id: "first", name: "First")
    let secondProject = project(id: "second", name: "Second")
    let items = [
      item(
        connection: firstConnection,
        hostName: "MacBook",
        project: firstProject,
        thread: thread(id: "one", title: "One", worktreePath: "/shared/path")
      ),
      item(
        connection: secondConnection,
        hostName: "Studio",
        project: firstProject,
        thread: thread(id: "two", title: "Two", worktreePath: "/shared/path")
      ),
      item(
        connection: firstConnection,
        hostName: "MacBook",
        project: secondProject,
        thread: thread(id: "three", title: "Three", worktreePath: "/shared/path")
      ),
    ]

    let entries = HomeThreadListPresentation.entries(from: items)

    XCTAssertEqual(entries.count, 3)
    XCTAssertTrue(entries.allSatisfy { if case .thread = $0 { true } else { false } })
  }

  func testHomePresentationFiltersByCompositeProjectAndVisibleMetadata() {
    let connection = ClientConnectionID()
    let firstProject = project(id: "first", name: "Poracode")
    let secondProject = project(id: "second", name: "Docs")
    let first = item(
      connection: connection,
      hostName: "MacBook",
      project: firstProject,
      thread: thread(id: "one", title: "Compose redesign", worktreePath: "/repo/feature")
    )
    let second = item(
      connection: connection,
      hostName: "MacBook",
      project: secondProject,
      thread: thread(id: "two", title: "Release notes", worktreePath: nil)
    )

    XCTAssertEqual(
      HomeThreadListPresentation.filter(
        [first, second],
        searchText: "feature",
        projectIDs: []
      ).map(\.thread.id),
      ["one"]
    )
    XCTAssertEqual(
      HomeThreadListPresentation.filter(
        [first, second],
        searchText: "",
        projectIDs: [HomeThreadListPresentation.projectIdentity(second)]
      ).map(\.thread.id),
      ["two"]
    )
  }

  func testHomeDeviceNameRemovesPoracodeConnectionPrefix() {
    XCTAssertEqual(HomeDeviceName.display("Poracode on H1FCM6T4GX"), "H1FCM6T4GX")
    XCTAssertEqual(HomeDeviceName.display("Pora.code on Studio"), "Studio")
    XCTAssertEqual(HomeDeviceName.display("MacBook Pro"), "MacBook Pro")
  }

  private func host(_ id: ClientConnectionID, label: String) -> HostRecord {
    HostRecord(
      connectionId: id,
      profile: ConnectionProfile(
        desktopId: label.lowercased(),
        label: label,
        httpBaseURL: "https://\(label.lowercased()).test",
        wsBaseURL: "wss://\(label.lowercased()).test",
        appVersion: "1",
        scopes: ["session:read"],
        pairedAt: Date(timeIntervalSince1970: 0)
      )
    )
  }

  private func project(id: String, name: String) -> RemoteProject {
    RemoteProject(
      id: id,
      remoteServerId: nil,
      remoteId: nil,
      name: name,
      location: .posix(path: "/repo/\(id)"),
      workspaceId: nil,
      disabled: false,
      createdAt: "2026-01-01T00:00:00Z"
    )
  }

  private func item(
    connection: ClientConnectionID,
    hostName: String,
    project: RemoteProject,
    thread: RemoteThread
  ) -> UnifiedThreadListItem {
    UnifiedThreadListItem(
      connectionID: connection,
      hostName: hostName,
      project: project,
      thread: thread
    )
  }

  private func thread(
    id: String,
    title: String,
    worktreePath: String?,
    status: String = "idle",
    done: Bool = false
  ) -> RemoteThread {
    RemoteThread(
      id: id,
      remoteServerId: nil,
      remoteId: nil,
      projectId: "project",
      title: title,
      agentKind: "codex",
      agentInstanceId: nil,
      config: .empty,
      status: status,
      attention: "none",
      canResumeWithConfig: nil,
      worktreePath: worktreePath,
      worktreeBranch: worktreePath.map { _ in "feature" },
      archived: false,
      done: done,
      starred: false,
      presentationMode: "gui",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      activeTurnStartedAt: nil,
      lastTurnStartedAt: nil,
      lastTurnEndedAt: nil,
      errorMessage: nil,
      parentThreadId: nil
    )
  }

  private func snapshot(
    title: String,
    updatedAt: String,
    starred: Bool = false
  ) -> RemoteShellSnapshot {
    RemoteShellSnapshot(
      snapshotSeq: 1,
      projects: [
        RemoteProject(
          id: "project",
          remoteServerId: nil,
          remoteId: nil,
          name: "lightcode",
          location: .posix(path: "/repo"),
          workspaceId: nil,
          disabled: false,
          createdAt: "2026-01-01T00:00:00Z"
        )
      ],
      threads: [
        RemoteThread(
          id: "same-thread-id",
          remoteServerId: nil,
          remoteId: nil,
          projectId: "project",
          title: title,
          agentKind: "codex",
          agentInstanceId: nil,
          config: .empty,
          status: "idle",
          attention: "none",
          canResumeWithConfig: nil,
          worktreePath: nil,
          worktreeBranch: nil,
          archived: false,
          done: false,
          starred: starred,
          presentationMode: "gui",
          createdAt: updatedAt,
          updatedAt: updatedAt,
          activeTurnStartedAt: nil,
          lastTurnStartedAt: nil,
          lastTurnEndedAt: nil,
          errorMessage: nil,
          parentThreadId: nil
        )
      ],
      runtimeSummariesByThread: [:],
      updatedAt: updatedAt
    )
  }
}
