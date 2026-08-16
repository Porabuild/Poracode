import XCTest

@testable import App

/// Transactional snapshot / resync install: atomicity, the commit-boundary replay
/// buffer, identity re-checks, cancellation, and background gating.
@MainActor
final class ReplayInstallTransactionTests: XCTestCase {
  private func shell(
    seq: Int,
    summaries: JSONValue? = nil,
    gitState: JSONValue? = nil
  ) -> RemoteShellSnapshot {
    RemoteShellSnapshot(
      snapshotSeq: seq,
      projects: [],
      threads: [],
      runtimeSummariesByThread: [:],
      updatedAt: "2026-08-12T00:00:00.000Z",
      gitSummariesByThread: summaries,
      gitState: gitState
    )
  }

  private func summary(branch: String) -> JSONValue {
    .object([
      "isRepo": .bool(true), "branch": .string(branch), "totalInsertions": .number(0),
      "totalDeletions": .number(0), "ahead": .number(0), "behind": .number(0), "pr": .null,
    ])
  }

  private var emptyGitState: JSONValue {
    .object([
      "revision": .number(3), "projects": .object([:]), "targets": .object([:]),
      "pullRequests": .object([:]), "pullRequestKeyByBranch": .object([:]),
      "projectPullRequestLists": .object([:]),
    ])
  }

  // MARK: - Additive decoding

  func testOlderHostsOmittingAdditiveFieldsPreserveCachedState() throws {
    var existing = HostReplayState()
    existing.gitSummariesByThread = ["t": try GitThreadSummary(wire: summary(branch: "cached"))]
    existing.gitState = try GitStateSnapshot(wire: emptyGitState)

    let prepared = try HostSnapshotInstall.prepare(shell: shell(seq: 7), existing: existing)
    XCTAssertEqual(prepared.snapshotSeq, 7)
    XCTAssertEqual(prepared.replay.gitSummariesByThread["t"]?.branch, "cached")
    XCTAssertEqual(prepared.replay.gitState.revision, 3)
  }

  func testExplicitEmptyAdditiveFieldsReplaceCachedState() throws {
    var existing = HostReplayState()
    existing.gitSummariesByThread = ["t": try GitThreadSummary(wire: summary(branch: "cached"))]
    let prepared = try HostSnapshotInstall.prepare(
      shell: shell(seq: 1, summaries: .object([:])),
      existing: existing
    )
    XCTAssertTrue(prepared.replay.gitSummariesByThread.isEmpty)
  }

  func testMalformedAdditiveFieldRejectsTheWholeInstall() {
    let malformed = shell(
      seq: 4, summaries: .object(["t": .object(["isRepo": .bool(true)])])
    )
    XCTAssertThrowsError(
      try HostSnapshotInstall.prepare(shell: malformed, existing: HostReplayState())
    )
    let badState = shell(seq: 4, gitState: .object(["revision": .number(1)]))
    XCTAssertThrowsError(
      try HostSnapshotInstall.prepare(shell: badState, existing: HostReplayState())
    )
  }

  // MARK: - Boundary replay buffer

  func testBoundaryEventArrivingDuringInstallIsReplayedNotLost() throws {
    var buffer = ReplayInstallBuffer()
    buffer.begin(installGeneration: 1)
    XCTAssertTrue(
      buffer.bufferIfInstalling(
        installGeneration: 1, seq: 11,
        event: .remoteGitSummaries(["t": try GitThreadSummary(wire: summary(branch: "live"))])
      )
    )
    // A stale install generation never claims the frame.
    XCTAssertFalse(
      buffer.bufferIfInstalling(installGeneration: 2, seq: 12, event: .threadReset(threadId: "t"))
    )
    let boundary = try XCTUnwrap(buffer.take(installGeneration: 1))
    XCTAssertNil(buffer.take(installGeneration: 1), "the buffer is drained exactly once")

    let prepared = try HostSnapshotInstall.prepare(
      shell: shell(seq: 10, summaries: .object(["t": summary(branch: "snapshot")])),
      existing: HostReplayState()
    )
    let commit = HostSnapshotInstall.commit(prepared, boundary: boundary)
    XCTAssertEqual(commit.appliedBoundaryEvents, 1)
    XCTAssertEqual(commit.cursor, 11)
    XCTAssertFalse(commit.requiresResync)
    XCTAssertEqual(commit.replay.gitSummariesByThread["t"]?.branch, "live")
  }

  func testBoundaryReplayDropsDuplicatesAndStopsAtTheFirstGap() throws {
    let prepared = try HostSnapshotInstall.prepare(
      shell: shell(seq: 10), existing: HostReplayState()
    )
    let commit = HostSnapshotInstall.commit(
      prepared,
      boundary: [
        .init(seq: 9, event: .threadReset(threadId: "stale")),
        .init(seq: 10, event: .threadReset(threadId: "duplicate")),
        .init(seq: 11, event: .threadReset(threadId: "contiguous")),
        .init(seq: 13, event: .threadReset(threadId: "gap")),
        .init(seq: 14, event: .threadReset(threadId: "after-gap")),
      ]
    )
    XCTAssertEqual(commit.cursor, 11, "the cursor never advances past a gap")
    XCTAssertEqual(commit.appliedBoundaryEvents, 1)
    XCTAssertTrue(commit.requiresResync)
    XCTAssertEqual(Array(commit.replay.threads.keys), ["contiguous"])
  }

  func testBoundaryReplayAppliesOutOfOrderArrivalsInSeqOrder() throws {
    let prepared = try HostSnapshotInstall.prepare(
      shell: shell(seq: 1), existing: HostReplayState()
    )
    let first = try GitStatePatch(wire: .object(["revision": .number(2)]))
    let second = try GitStatePatch(wire: .object(["revision": .number(3)]))
    let commit = HostSnapshotInstall.commit(
      prepared,
      boundary: [
        .init(seq: 3, event: .remoteGitState(second)),
        .init(seq: 2, event: .remoteGitState(first)),
      ]
    )
    XCTAssertEqual(commit.cursor, 3)
    XCTAssertEqual(commit.replay.gitState.revision, 3)
  }

  // MARK: - Commit identity policy

  private var baseIdentity: ReplayInstallIdentity {
    ReplayInstallIdentity(
      workGeneration: 4,
      apiEndpoint: "https://a.test",
      socketObjectID: nil,
      openThreadId: "t",
      openThreadEpoch: 2,
      installGeneration: 9
    )
  }

  func testCommitRequiresEveryCapturedIdentityToStillMatch() {
    XCTAssertEqual(
      ReplayInstallPolicy.decision(
        captured: baseIdentity, current: baseIdentity, isCancelled: false, isInBackground: false
      ),
      .commit
    )
    var mutations: [(String, (inout ReplayInstallIdentity) -> Void)] = [
      ("workGeneration", { $0.workGeneration += 1 }),
      ("apiEndpoint", { $0.apiEndpoint = "https://b.test" }),
      ("openThreadId", { $0.openThreadId = "other" }),
      ("openThreadEpoch", { $0.openThreadEpoch += 1 }),
      ("installGeneration", { $0.installGeneration += 1 }),
    ]
    let replacementSocket = NSObject()
    mutations.append(("socket", { $0.socketObjectID = ObjectIdentifier(replacementSocket) }))
    for (label, mutate) in mutations {
      var current = baseIdentity
      mutate(&current)
      XCTAssertEqual(
        ReplayInstallPolicy.decision(
          captured: baseIdentity, current: current, isCancelled: false, isInBackground: false
        ),
        .abortStale,
        label
      )
    }
  }

  func testCancellationAndBackgroundAreDistinctTerminalOutcomes() {
    XCTAssertEqual(
      ReplayInstallPolicy.decision(
        captured: baseIdentity, current: baseIdentity, isCancelled: true, isInBackground: false
      ),
      .abortCancelled,
      "cancellation is not a network error and must not schedule a retry"
    )
    XCTAssertEqual(
      ReplayInstallPolicy.decision(
        captured: baseIdentity, current: baseIdentity, isCancelled: false, isInBackground: true
      ),
      .abortBackground
    )
    // Cancellation wins over a stale identity so no retry is scheduled either way.
    var stale = baseIdentity
    stale.workGeneration += 5
    XCTAssertEqual(
      ReplayInstallPolicy.decision(
        captured: baseIdentity, current: stale, isCancelled: true, isInBackground: true
      ),
      .abortCancelled
    )
  }

  // MARK: - Session-level commit

  private func makeSession() -> AppSession {
    let keychain = InMemoryKeychainIO()
    let repo = SessionCredentialRepository(
      suiteName: "poracode.tests.replay.\(UUID().uuidString)",
      keychain: keychain
    )
    return AppSession(
      dependencies: .testing(
        credentialStore: repo,
        hostCatalog: HostCatalog.ephemeralForTests(
          vaultIO: keychain, sourceKeychain: keychain
        ),
        makeAPI: { endpoint, token in FakeRemoteAPI(endpoint: endpoint, accessToken: token) },
        makeSocket: { _ in FakeLiveSocket() }
      )
    )
  }

  func testSessionCommitReplacesShellReplayAndCursorTogether() throws {
    let session = makeSession()
    let captured = session.beginReplayInstall(apiEndpoint: "https://a.test")
    let prepared = try HostSnapshotInstall.prepare(
      shell: shell(seq: 12, summaries: .object(["t": summary(branch: "main")])),
      existing: session.state.replay
    )
    let commit = session.commitReplayInstall(
      prepared,
      shell: shell(seq: 12, summaries: .object(["t": summary(branch: "main")])),
      captured: captured,
      currentAPIEndpoint: "https://a.test",
      advanceCursor: true,
      isCancelled: false
    )
    XCTAssertNotNil(commit)
    XCTAssertEqual(session.state.lastSeenSeq, 12)
    XCTAssertEqual(session.state.snapshot?.snapshotSeq, 12)
    XCTAssertEqual(session.state.replay.gitSummariesByThread["t"]?.branch, "main")
  }

  func testSessionCommitExposesNothingWhenIdentityMovedOn() throws {
    let session = makeSession()
    let captured = session.beginReplayInstall(apiEndpoint: "https://a.test")
    let prepared = try HostSnapshotInstall.prepare(
      shell: shell(seq: 20, summaries: .object(["t": summary(branch: "late")])),
      existing: session.state.replay
    )
    // A newer install (host switch / refresh) starts while this one is in flight.
    _ = session.beginReplayInstall(apiEndpoint: "https://a.test")

    XCTAssertNil(
      session.commitReplayInstall(
        prepared,
        shell: shell(seq: 20),
        captured: captured,
        currentAPIEndpoint: "https://a.test",
        advanceCursor: true,
        isCancelled: false
      )
    )
    XCTAssertNil(session.state.snapshot)
    XCTAssertEqual(session.state.lastSeenSeq, 0)
    XCTAssertTrue(session.state.replay.gitSummariesByThread.isEmpty)
  }

  func testSessionCommitAbortsOnCancellationAndEndpointChange() throws {
    for scenario in ["cancelled", "endpoint"] {
      let session = makeSession()
      let captured = session.beginReplayInstall(apiEndpoint: "https://a.test")
      let prepared = try HostSnapshotInstall.prepare(
        shell: shell(seq: 5), existing: session.state.replay
      )
      XCTAssertNil(
        session.commitReplayInstall(
          prepared,
          shell: shell(seq: 5),
          captured: captured,
          currentAPIEndpoint: scenario == "endpoint" ? "https://b.test" : "https://a.test",
          advanceCursor: true,
          isCancelled: scenario == "cancelled"
        ),
        scenario
      )
      XCTAssertNil(session.state.snapshot, scenario)
      XCTAssertEqual(session.state.lastSeenSeq, 0, scenario)
    }
  }

  func testBackgroundSynchronouslyInvalidatesAnInFlightInstall() throws {
    let session = makeSession()
    let captured = session.beginReplayInstall(apiEndpoint: "https://a.test")
    XCTAssertTrue(
      session.bufferReplayEventDuringInstall(seq: 3, event: .threadReset(threadId: "t"))
    )
    _ = session.cancelBackgroundSensitiveTasks()
    XCTAssertTrue(
      session.state.needsAuthoritativeRefresh,
      "dropping buffered frames requires one authoritative recovery"
    )
    let prepared = try HostSnapshotInstall.prepare(
      shell: shell(seq: 5), existing: session.state.replay
    )
    XCTAssertNil(
      session.commitReplayInstall(
        prepared,
        shell: shell(seq: 5),
        captured: captured,
        currentAPIEndpoint: "https://a.test",
        advanceCursor: true,
        isCancelled: false
      )
    )
    XCTAssertNil(session.state.snapshot)
  }

  func testEventsAreOnlyBufferedForTheCurrentInstall() {
    let session = makeSession()
    XCTAssertFalse(
      session.bufferReplayEventDuringInstall(seq: 1, event: .threadReset(threadId: "t")),
      "with no install in flight the event applies immediately"
    )
    let captured = session.beginReplayInstall(apiEndpoint: nil)
    XCTAssertTrue(
      session.bufferReplayEventDuringInstall(seq: 2, event: .threadReset(threadId: "t"))
    )
    session.abortReplayInstall(captured)
    XCTAssertFalse(
      session.bufferReplayEventDuringInstall(seq: 3, event: .threadReset(threadId: "t"))
    )
  }
}
