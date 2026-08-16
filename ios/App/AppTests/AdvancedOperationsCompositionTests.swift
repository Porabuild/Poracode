import Foundation
import XCTest

@testable import App

/// Production composition and reachability for Advanced Operations.
///
/// Everything here is deterministic: no sleeps, no unbounded continuations, and
/// no reliance on task scheduling order. Races are expressed by mutating the
/// authoritative session state between the calls that the production code makes
/// on either side of an await.
@MainActor
final class AdvancedOperationsCompositionTests: XCTestCase {
  private let connectionID = ClientConnectionID(
    UUID(uuidString: "11111111-2222-4333-8444-555555555555")!
  )
  private let otherConnectionID = ClientConnectionID(
    UUID(uuidString: "99999999-8888-4777-8666-555555555555")!
  )
  private let location = ProjectLocation.posix(path: "/workspace")

  // MARK: - Project surface

  func testProjectSurfaceMintsLocationOwnersAndNoThreadOwners() {
    let app = makeSession()
    let source = app.makeAdvancedOperationsSelectionSource(
      surface: .project(projectIdentity, expectedLocation: location)
    )

    XCTAssertEqual(
      source.ownerKey,
      AdvancedOperationsOwnerKey(projectLocation: location, threadID: nil)
    )
    XCTAssertEqual(
      source.access(for: .readAbsoluteFile)?.lease.owner,
      .projectLocation(location)
    )
    XCTAssertEqual(
      source.access(for: .workflowGetRun)?.lease.owner,
      .location(location, threadID: nil)
    )
    XCTAssertNil(source.access(for: .subagentSubscribe))
    XCTAssertNil(source.access(for: .createFileCheckpoint))
    XCTAssertNil(source.access(for: .workflowAgentChat))
  }

  func testProjectSurfaceLosesItsOwnerWhenTheProjectRelocates() {
    let app = makeSession()
    let source = app.makeAdvancedOperationsSelectionSource(
      surface: .project(projectIdentity, expectedLocation: location)
    )
    XCTAssertNotNil(source.access(for: .readAbsoluteFile))

    app.state.snapshot = shell(location: .posix(path: "/moved"))
    source.synchronize()

    XCTAssertEqual(source.ownerKey, .none)
    XCTAssertNil(source.access(for: .readAbsoluteFile))
  }

  func testProjectSurfaceLosesItsOwnerWhenTheSelectedHostChanges() {
    let app = makeSession()
    let source = app.makeAdvancedOperationsSelectionSource(
      surface: .project(projectIdentity, expectedLocation: location)
    )
    XCTAssertNotNil(source.access(for: .readAbsoluteFile))

    app.state.selectedConnectionId = otherConnectionID
    source.synchronize()

    XCTAssertNil(source.binding, "A host without a matching record must expose no binding")
    XCTAssertNil(source.access(for: .readAbsoluteFile))
  }

  // MARK: - Thread surface

  func testThreadSurfaceMintsEveryOwnerShapeFromTheAuthoritativeSnapshot() {
    let app = makeSession(withThread: true)
    let source = app.makeAdvancedOperationsSelectionSource(
      surface: .thread(threadID: "thread-1")
    )

    XCTAssertEqual(
      source.access(for: .createFileCheckpoint)?.lease.owner,
      .thread(threadID: "thread-1", projectLocation: location)
    )
    XCTAssertEqual(
      source.access(for: .stageThreadInput)?.lease.owner,
      .thread(threadID: "thread-1", projectLocation: nil)
    )
    XCTAssertEqual(
      source.access(for: .workflowAgentChat)?.lease.owner,
      .location(location, threadID: "thread-1")
    )
    XCTAssertEqual(
      source.access(for: .deleteProjectEntry)?.lease.owner,
      .projectLocation(location)
    )
  }

  func testThreadSurfaceUsesTheWorktreeOverlayRatherThanTheProjectRoot() {
    let app = makeSession(withThread: true, worktreePath: "/workspace/.poracode/worktrees/a")
    let source = app.makeAdvancedOperationsSelectionSource(
      surface: .thread(threadID: "thread-1")
    )
    XCTAssertEqual(
      source.ownerKey.projectLocation,
      .posix(path: "/workspace/.poracode/worktrees/a")
    )
  }

  func testThreadSurfaceWithoutAProjectKeepsThreadOwnersAndDropsLocationOwners() {
    let app = makeSession(withThread: true)
    app.state.snapshot = RemoteShellSnapshot(
      snapshotSeq: 2,
      projects: [],
      threads: [thread(worktreePath: nil)],
      runtimeSummariesByThread: [:],
      updatedAt: "2026-08-12T00:00:00Z"
    )
    let source = app.makeAdvancedOperationsSelectionSource(
      surface: .thread(threadID: "thread-1")
    )

    XCTAssertNotNil(source.access(for: .stageThreadInput))
    XCTAssertNil(source.access(for: .createFileCheckpoint))
    XCTAssertNil(source.access(for: .workflowGetRun))
    XCTAssertNil(source.access(for: .readAbsoluteFile))
  }

  func testThreadSurfaceLosesEverythingWhenTheThreadDisappears() {
    let app = makeSession(withThread: true)
    let source = app.makeAdvancedOperationsSelectionSource(
      surface: .thread(threadID: "thread-1")
    )
    XCTAssertNotNil(source.access(for: .stageThreadInput))

    app.state.snapshot = shell(location: location)
    source.synchronize()

    XCTAssertEqual(source.ownerKey, .none)
    for procedure in AdvancedOperationProcedure.allCases {
      XCTAssertNil(source.access(for: procedure), procedure.rawValue)
    }
  }

  // MARK: - Generations and barriers

  func testOwnerGenerationAdvancesOnEveryOwnerChangeAndInvalidatesOldLeases() {
    let app = makeSession()
    let source = app.makeAdvancedOperationsSelectionSource(
      surface: .project(projectIdentity, expectedLocation: location)
    )
    let first = try? XCTUnwrap(source.access(for: .readAbsoluteFile)?.lease)
    XCTAssertNotNil(first)
    XCTAssertEqual(source.ownerGeneration, 1)

    app.state.snapshot = shell(location: .posix(path: "/moved"))
    source.synchronize()
    XCTAssertEqual(source.ownerGeneration, 2)
    app.state.snapshot = shell(location: location)
    source.synchronize()
    XCTAssertEqual(source.ownerGeneration, 3)

    let latest = source.access(for: .readAbsoluteFile)?.lease
    XCTAssertNotNil(latest)
    XCTAssertNotEqual(first, latest)
    if let first { XCTAssertFalse(source.isCurrent(first)) }
    if let latest { XCTAssertTrue(source.isCurrent(latest)) }
  }

  func testSessionGenerationBumpInvalidatesEveryPreviouslyMintedLease() throws {
    let app = makeSession()
    let source = app.makeAdvancedOperationsSelectionSource(
      surface: .project(projectIdentity, expectedLocation: location)
    )
    let before = try XCTUnwrap(source.access(for: .readAbsoluteFile)?.lease)

    _ = app.state.operationOwner.bumpWorkGeneration()

    XCTAssertFalse(source.isCurrent(before))
    let after = source.access(for: .readAbsoluteFile)?.lease
    XCTAssertNotEqual(before, after)
    XCTAssertNotEqual(before.sessionID, after?.sessionID)
    XCTAssertNotEqual(before.sessionGeneration, after?.sessionGeneration)
  }

  func testSessionIdentityIsStableForOneSessionAndDistinctAcrossHosts() {
    let first = AdvancedOperationsSessionIdentity.make(
      connectionID: connectionID,
      desktopID: "desktop",
      endpoint: "https://desktop.test",
      protocolVersion: 3,
      generation: 4
    )
    XCTAssertEqual(
      first,
      AdvancedOperationsSessionIdentity.make(
        connectionID: connectionID,
        desktopID: "desktop",
        endpoint: "https://desktop.test",
        protocolVersion: 3,
        generation: 4
      )
    )
    for variant in [
      AdvancedOperationsSessionIdentity.make(
        connectionID: otherConnectionID, desktopID: "desktop",
        endpoint: "https://desktop.test", protocolVersion: 3, generation: 4),
      AdvancedOperationsSessionIdentity.make(
        connectionID: connectionID, desktopID: "other",
        endpoint: "https://desktop.test", protocolVersion: 3, generation: 4),
      AdvancedOperationsSessionIdentity.make(
        connectionID: connectionID, desktopID: "desktop",
        endpoint: "https://other.test", protocolVersion: 3, generation: 4),
      AdvancedOperationsSessionIdentity.make(
        connectionID: connectionID, desktopID: "desktop",
        endpoint: "https://desktop.test", protocolVersion: 3, generation: 5),
    ] {
      XCTAssertNotEqual(first, variant)
    }
  }

  func testScopesAreTheExactProfileAndRegistryIntersection() {
    let app = makeSession(
      profileScopes: ["session:read", "session:operate", "projects:manage"],
      recordScopes: ["session:read", "projects:manage"]
    )
    let source = app.makeAdvancedOperationsSelectionSource(
      surface: .project(projectIdentity, expectedLocation: location)
    )
    XCTAssertEqual(
      source.access(for: .readAbsoluteFile)?.scopes,
      [.sessionRead, .projectsManage]
    )
    XCTAssertFalse(
      AdvancedOperationGating.permits(
        AdvancedOperationsPresentation.descriptor(for: .createProjectEntry),
        access: source.access(for: .createProjectEntry)
      ),
      "session:operate was not granted by the registry record"
    )
    XCTAssertTrue(
      AdvancedOperationGating.permits(
        AdvancedOperationsPresentation.descriptor(for: .readAbsoluteFile),
        access: source.access(for: .readAbsoluteFile)
      )
    )
  }

  func testBackgroundClosesEveryAccessPathSynchronously() {
    let app = makeSession()
    let source = app.makeAdvancedOperationsSelectionSource(
      surface: .project(projectIdentity, expectedLocation: location)
    )
    XCTAssertNotNil(source.access(for: .readAbsoluteFile))

    source.enterBackground()
    for procedure in AdvancedOperationProcedure.allCases {
      XCTAssertNil(source.access(for: procedure), procedure.rawValue)
    }
    XCTAssertNil(source.selection(for: .readAbsoluteFile))

    source.leaveBackground()
    XCTAssertNotNil(source.access(for: .readAbsoluteFile))
  }

  func testForegroundFlagFollowsTheLiveSessionLifecycle() {
    let app = makeSession()
    let source = app.makeAdvancedOperationsSelectionSource(
      surface: .project(projectIdentity, expectedLocation: location)
    )
    app.state.liveLifecycle.noteEnteredBackground(sessionExpired: false, resyncPending: false)
    let access = source.access(for: .readAbsoluteFile)
    XCTAssertEqual(access?.isForeground, false)
    XCTAssertEqual(access?.isOnline, false)
    XCTAssertEqual(access?.unavailability, .offline)
  }

  // MARK: - Gateway

  func testGatewayRefusesToDispatchWithoutAResolvedHost() async throws {
    let app = makeSession()
    let source = app.makeAdvancedOperationsSelectionSource(
      surface: .project(projectIdentity, expectedLocation: location)
    )
    let composition = app.makeAdvancedOperationsComposition(source: source)
    let lease = try XCTUnwrap(source.access(for: .readAbsoluteFile)?.lease)

    do {
      _ = try await composition.gateway.call(readRequest(), lease: lease)
      XCTFail("Dispatch without a resolved host must not reach a transport")
    } catch is CancellationError {
    } catch {
      XCTFail("Unexpected failure: \(type(of: error))")
    }
  }

  func testGatewayDispatchesUnderTheResolvedHostAndRejectsAStaleOwner() async throws {
    let app = makeSession()
    let source = app.makeAdvancedOperationsSelectionSource(
      surface: .project(projectIdentity, expectedLocation: location)
    )
    let composition = app.makeAdvancedOperationsComposition(source: source)
    let api = AdvancedOperationsAPISpy(result: .success(.omitted))
    source.adoptResolvedHost(
      AdvancedOperationsResolvedHost(
        binding: try XCTUnwrap(source.binding),
        grantedScopes: [.sessionRead, .sessionOperate, .projectsManage],
        api: api
      )
    )
    let lease = try XCTUnwrap(source.access(for: .readAbsoluteFile)).lease
    XCTAssertNotNil(source.selection(for: .readAbsoluteFile))

    // The owner moves before the captured lease is used again.
    app.state.snapshot = shell(location: .posix(path: "/moved"))
    source.synchronize()
    do {
      _ = try await composition.gateway.call(readRequest(), lease: lease)
      XCTFail("A stale owner must not dispatch")
    } catch is CancellationError {
    } catch {
      XCTFail("Unexpected failure: \(type(of: error))")
    }
    let calls = await api.calls()
    XCTAssertEqual(calls, 0)
  }

  func testGatewayDispatchesOnceAndNeverRetriesAnAmbiguousMutation() async throws {
    let app = makeSession()
    let source = app.makeAdvancedOperationsSelectionSource(
      surface: .project(projectIdentity, expectedLocation: location)
    )
    let composition = app.makeAdvancedOperationsComposition(source: source)
    let api = AdvancedOperationsAPISpy(result: .failure(.ambiguousDelivery))
    source.adoptResolvedHost(
      AdvancedOperationsResolvedHost(
        binding: try XCTUnwrap(source.binding),
        grantedScopes: [.sessionRead, .sessionOperate, .projectsManage],
        api: api
      )
    )
    let lease = try XCTUnwrap(source.access(for: .deleteProjectEntry)).lease

    do {
      _ = try await composition.gateway.call(deleteRequest(), lease: lease)
      XCTFail("Ambiguous delivery must surface as a failure")
    } catch let failure as AdvancedOperationFailure {
      XCTAssertEqual(failure, .ambiguousDelivery)
    }
    let calls = await api.calls()
    XCTAssertEqual(calls, 1, "An ambiguous mutation must never be retried")
  }

  func testAuthoritativeRefreshIsDroppedForALeaseThatIsNoLongerCurrent() async throws {
    let app = makeSession()
    let source = app.makeAdvancedOperationsSelectionSource(
      surface: .project(projectIdentity, expectedLocation: location)
    )
    let lease = try XCTUnwrap(source.access(for: .deleteProjectEntry)?.lease)
    _ = app.state.operationOwner.bumpWorkGeneration()

    // Must return without touching the snapshot for a superseded lease.
    let before = app.state.snapshot
    await app.refreshAdvancedOperationsAuthoritativeState(lease: lease, source: source)
    XCTAssertEqual(app.state.snapshot, before)
  }

  // MARK: - Socket-backed online state

  func testReconnectingSocketReadsOfflineEvenWhileThePhaseStaysReady() {
    let app = makeSession()
    let source = app.makeAdvancedOperationsSelectionSource(
      surface: .project(projectIdentity, expectedLocation: location)
    )
    app.state.socketState = .reconnecting

    let access = source.access(for: .readAbsoluteFile)
    XCTAssertNotNil(access, "The lease still exists; only reachability changed")
    XCTAssertEqual(app.state.phase, .ready)
    XCTAssertNotNil(app.state.api, "The API object survives a reconnect")
    XCTAssertEqual(access?.isOnline, false)
    XCTAssertEqual(access?.isReady, false)
    XCTAssertEqual(access?.isForeground, true)
    XCTAssertEqual(access?.unavailability, .offline)
    XCTAssertEqual(access?.isUsable, false)
  }

  func testEveryNonOnlineSocketStateReadsOffline() {
    let offlineStates: [RemoteWebSocketClient.ConnectionState] = [
      .idle, .connecting, .reconnecting, .suspended, .failed("boom"),
    ]
    for socketState in offlineStates {
      let app = makeSession()
      let source = app.makeAdvancedOperationsSelectionSource(
        surface: .project(projectIdentity, expectedLocation: location)
      )
      app.state.socketState = socketState
      for procedure in AdvancedOperationProcedure.allCases {
        guard let access = source.access(for: procedure) else { continue }
        XCTAssertFalse(
          access.isOnline,
          "\(procedure.rawValue) must read offline under socket state \(socketState)"
        )
        XCTAssertFalse(access.isUsable, procedure.rawValue)
      }
    }

    let online = makeSession()
    let onlineSource = online.makeAdvancedOperationsSelectionSource(
      surface: .project(projectIdentity, expectedLocation: location)
    )
    online.state.socketState = .online
    XCTAssertEqual(onlineSource.access(for: .readAbsoluteFile)?.isOnline, true)
    XCTAssertEqual(onlineSource.access(for: .readAbsoluteFile)?.isUsable, true)
  }

  // MARK: - Owned authoritative refresh

  func testScheduledRefreshRunsUnderTheCurrentLease() async throws {
    let app = makeSession()
    let source = app.makeAdvancedOperationsSelectionSource(
      surface: .project(projectIdentity, expectedLocation: location)
    )
    let lease = try XCTUnwrap(source.access(for: .deleteProjectEntry)?.lease)

    let ran = RefreshProbe()
    source.scheduleAuthoritativeRefresh(lease: lease) { _ in ran.mark() }
    await source.joinOwnedWorkForTests()

    XCTAssertTrue(ran.didRun)
  }

  func testScheduledRefreshIsRefusedOutrightForAnAlreadyStaleLease() async throws {
    let app = makeSession()
    let source = app.makeAdvancedOperationsSelectionSource(
      surface: .project(projectIdentity, expectedLocation: location)
    )
    let lease = try XCTUnwrap(source.access(for: .deleteProjectEntry)?.lease)
    _ = app.state.operationOwner.bumpWorkGeneration()

    let ran = RefreshProbe()
    source.scheduleAuthoritativeRefresh(lease: lease) { _ in ran.mark() }
    await source.joinOwnedWorkForTests()

    XCTAssertFalse(ran.didRun, "A superseded lease must not even install work")
  }

  func testOwnerChangeCancelsAPendingRefreshBeforeItCanRun() async throws {
    let app = makeSession()
    let source = app.makeAdvancedOperationsSelectionSource(
      surface: .project(projectIdentity, expectedLocation: location)
    )
    let lease = try XCTUnwrap(source.access(for: .deleteProjectEntry)?.lease)

    let ran = RefreshProbe()
    source.scheduleAuthoritativeRefresh(lease: lease) { _ in ran.mark() }
    // The owner moves before the scheduled task has had a chance to start.
    app.state.snapshot = shell(location: .posix(path: "/moved"))
    source.synchronize()
    await source.joinOwnedWorkForTests()

    XCTAssertFalse(ran.didRun)
  }

  func testDismissalCancelsAPendingRefreshBeforeItCanRun() async throws {
    let app = makeSession()
    let source = app.makeAdvancedOperationsSelectionSource(
      surface: .project(projectIdentity, expectedLocation: location)
    )
    let lease = try XCTUnwrap(source.access(for: .deleteProjectEntry)?.lease)

    let ran = RefreshProbe()
    source.scheduleAuthoritativeRefresh(lease: lease) { _ in ran.mark() }
    // `onDisappear` and the background transition both land here.
    source.enterBackground()
    await source.joinOwnedWorkForTests()

    XCTAssertFalse(ran.didRun)
  }

  func testHostSwitchCancelsAPendingRefreshBeforeItCanRun() async throws {
    let app = makeSession()
    let source = app.makeAdvancedOperationsSelectionSource(
      surface: .project(projectIdentity, expectedLocation: location)
    )
    let lease = try XCTUnwrap(source.access(for: .deleteProjectEntry)?.lease)

    let ran = RefreshProbe()
    source.scheduleAuthoritativeRefresh(lease: lease) { _ in ran.mark() }
    app.state.selectedConnectionId = otherConnectionID
    source.invalidateHost()
    await source.joinOwnedWorkForTests()

    XCTAssertFalse(ran.didRun)
  }

  func testASecondRefreshCancelsTheFirstInsteadOfLeavingItUnowned() async throws {
    let app = makeSession()
    let source = app.makeAdvancedOperationsSelectionSource(
      surface: .project(projectIdentity, expectedLocation: location)
    )
    let lease = try XCTUnwrap(source.access(for: .deleteProjectEntry)?.lease)

    let first = RefreshProbe()
    let second = RefreshProbe()
    source.scheduleAuthoritativeRefresh(lease: lease) { _ in first.mark() }
    source.scheduleAuthoritativeRefresh(lease: lease) { _ in second.mark() }
    await source.joinOwnedWorkForTests()

    XCTAssertFalse(first.didRun, "The superseded refresh must be cancelled, not left running")
    XCTAssertTrue(second.didRun)
  }

  func testStaleRefreshCompletionCannotMutateTheSnapshot() async throws {
    let app = makeSession()
    let source = app.makeAdvancedOperationsSelectionSource(
      surface: .project(projectIdentity, expectedLocation: location)
    )
    let lease = try XCTUnwrap(source.access(for: .deleteProjectEntry)?.lease)
    let before = app.state.snapshot

    source.scheduleAuthoritativeRefresh(lease: lease) { @MainActor [weak app, weak source] lease in
      await app?.refreshAdvancedOperationsAuthoritativeState(lease: lease, source: source)
    }
    _ = app.state.operationOwner.bumpWorkGeneration()
    await source.joinOwnedWorkForTests()

    XCTAssertEqual(app.state.snapshot, before)
  }

  // MARK: - Fixtures

  private var projectIdentity: ProjectIdentity {
    ProjectIdentity(connectionId: connectionID, projectId: "project-1")
  }

  private func readRequest() -> AdvancedOperationRequest {
    .readAbsoluteFile(
      AdvancedReadExternalFileRequest(projectLocation: location, absolutePath: "/tmp/a")
    )
  }

  private func deleteRequest() -> AdvancedOperationRequest {
    .deleteProjectEntry(
      AdvancedDeleteProjectEntryRequest(projectLocation: location, path: "a.txt")
    )
  }

  private func thread(worktreePath: String?) -> RemoteThread {
    RemoteThread(
      id: "thread-1",
      projectId: "project-1",
      title: "Thread",
      agentKind: "claude",
      config: .empty,
      status: "idle",
      attention: "none",
      worktreePath: worktreePath,
      createdAt: "2026-08-12T00:00:00Z",
      updatedAt: "2026-08-12T00:00:00Z"
    )
  }

  private func shell(
    location: ProjectLocation,
    threads: [RemoteThread] = []
  ) -> RemoteShellSnapshot {
    RemoteShellSnapshot(
      snapshotSeq: 1,
      projects: [
        RemoteProject(
          id: "project-1",
          remoteServerId: nil,
          remoteId: nil,
          name: "Project",
          location: location,
          workspaceId: nil,
          disabled: false,
          createdAt: "2026-08-12T00:00:00Z"
        )
      ],
      threads: threads,
      runtimeSummariesByThread: [:],
      updatedAt: "2026-08-12T00:00:00Z"
    )
  }

  private func makeSession(
    withThread: Bool = false,
    worktreePath: String? = nil,
    profileScopes: [String] = ["session:read", "session:operate", "projects:manage"],
    recordScopes: [String] = ["session:read", "session:operate", "projects:manage"]
  ) -> AppSession {
    let app = AppSession(dependencies: .live)
    app.state.selectedConnectionId = connectionID
    app.state.profile = ConnectionProfile(
      desktopId: "desktop",
      label: "Desktop",
      httpBaseURL: "https://desktop.test",
      wsBaseURL: "wss://desktop.test",
      appVersion: "1",
      scopes: profileScopes,
      pairedAt: Date(timeIntervalSince1970: 0)
    )
    app.state.hosts = [
      HostRecord(
        connectionId: connectionID,
        desktopId: "desktop",
        label: "Desktop",
        httpBaseURL: "https://desktop.test",
        wsBaseURL: "wss://desktop.test",
        appVersion: "1",
        scopes: recordScopes,
        pairedAt: Date(timeIntervalSince1970: 0)
      )
    ]
    app.state.api = RemoteAPIClientBox(
      RemoteAPIClient(endpoint: "https://desktop.test", accessToken: "secret")
    )
    app.state.phase = .ready
    app.state.socketState = .online
    app.state.snapshot = shell(
      location: location,
      threads: withThread ? [thread(worktreePath: worktreePath)] : []
    )
    return app
  }
}

/// Records whether an owned refresh body actually executed.
///
/// Main-actor isolated so the scheduled work and the assertions observe the
/// same value without any synchronisation of their own.
@MainActor
private final class RefreshProbe {
  private(set) var didRun = false

  func mark() { didRun = true }
}
