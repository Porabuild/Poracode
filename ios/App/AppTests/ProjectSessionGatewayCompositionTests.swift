import XCTest

@testable import App

private actor ProjectRemoteAPIFake: ProjectRemoteAPI {
  var error: (any Error)?
  private(set) var commandCalls = 0

  func setError(_ error: (any Error)?) { self.error = error }

  func remoteRunProjectCommand(_ command: ProjectCommand) async throws -> ProjectCommandResult {
    _ = command
    commandCalls += 1
    if let error { throw error }
    return ProjectCommandResult(projects: [], project: nil)
  }

  func remoteLoadProjectSettings(projectId: String) async throws -> ProjectSettings {
    _ = projectId
    if let error { throw error }
    return ProjectSettings(mcpServers: nil)
  }

  func remoteBrowseHostDirectory(path: String) async throws -> BrowseHostDirectoryResult {
    _ = path
    if let error { throw error }
    return .init(path: "/", parentPath: nil, homePath: "/", entries: [], truncated: false)
  }

  func remoteDetectSetupScript(location: ProjectLocation) async throws -> DetectSetupScriptResult {
    _ = location
    if let error { throw error }
    return .init(setupScript: nil)
  }

  func remoteLoadProjectNotes(projectId: String) async throws -> ProjectNotesResponse {
    _ = projectId
    if let error { throw error }
    return .init(notes: nil)
  }

  func remoteWriteProjectNotes(_ body: ProjectNotesWriteBody, projectId: String) async throws {
    _ = body
    _ = projectId
    if let error { throw error }
  }
}

@MainActor
private final class ProjectSelectionBox {
  var selection: ProjectTransportSelection?
}

private actor ProjectRefreshTestWaiter: ProjectRefreshWaiting {
  private var started = false
  private var startContinuation: CheckedContinuation<Void, Never>?
  private var continuation: CheckedContinuation<Void, Never>?

  func wait() async throws {
    started = true
    startContinuation?.resume()
    startContinuation = nil
    await withCheckedContinuation { continuation = $0 }
    try Task.checkCancellation()
  }

  func waitUntilStarted() async {
    guard !started else { return }
    await withCheckedContinuation { startContinuation = $0 }
  }

  func release() {
    continuation?.resume()
    continuation = nil
  }
}

@MainActor
final class ProjectSessionGatewayCompositionTests: XCTestCase {
  func testAppSessionExposesSelectedHostLeaseAndExactCapabilities() {
    let app = AppSession(dependencies: .live)
    let connectionId = ClientConnectionID()
    app.state.selectedConnectionId = connectionId
    _ = app.state.operationOwner.bumpWorkGeneration()
    app.state.profile = ConnectionProfile(
      desktopId: "desktop",
      label: "Desktop",
      httpBaseURL: "https://desktop.test",
      wsBaseURL: "wss://desktop.test",
      appVersion: "1",
      scopes: ["session:read", "projects:manage", "projects:manage:extra"],
      pairedAt: Date(timeIntervalSince1970: 0)
    )
    app.state.api = RemoteAPIClientBox(
      RemoteAPIClient(endpoint: "https://desktop.test", accessToken: "secret")
    )
    app.state.phase = .ready

    let session = app.currentProjectControllerSession
    XCTAssertEqual(session?.lease.connectionId, connectionId)
    XCTAssertEqual(session?.lease.generation, UInt64(app.state.workGeneration))
    XCTAssertEqual(session?.capabilities, [.sessionRead, .projectsManage])
    XCTAssertTrue(session?.isOnline == true)
    XCTAssertTrue(session?.isReady == true)
  }

  func testWorkspaceSelectionRequiresExactHostProjectLocationAndAdvancesGeneration() {
    let app = AppSession(dependencies: .live)
    let connectionId = ClientConnectionID()
    let identity = ProjectIdentity(connectionId: connectionId, projectId: "project")
    let initialLocation = ProjectLocation.posix(path: "/workspace")
    let movedLocation = ProjectLocation.posix(path: "/workspace-moved")

    app.state.selectedConnectionId = connectionId
    _ = app.state.operationOwner.bumpWorkGeneration()
    app.state.profile = ConnectionProfile(
      desktopId: "desktop",
      label: "Desktop",
      httpBaseURL: "https://desktop.test",
      wsBaseURL: "wss://desktop.test",
      appVersion: "1",
      scopes: ["session:read", "session:operate"],
      pairedAt: Date(timeIntervalSince1970: 0)
    )
    app.state.api = RemoteAPIClientBox(
      RemoteAPIClient(endpoint: "https://desktop.test", accessToken: "secret")
    )
    app.state.phase = .ready
    app.state.snapshot = shellSnapshot(projectId: identity.projectId, location: initialLocation)

    let source = ProjectWorkspaceSelectionSource(
      session: app,
      identity: identity,
      location: initialLocation
    )
    XCTAssertEqual(source.context?.lease.projectGeneration, 1)
    XCTAssertNotNil(source.selection)

    let worktreeLocation = ProjectLocation.posix(path: "/workspace/.poracode/worktrees/feature")
    let worktreeSource = ProjectWorkspaceSelectionSource(
      session: app,
      identity: identity,
      location: initialLocation,
      workspaceLocation: worktreeLocation
    )
    XCTAssertEqual(worktreeSource.projectLocation, initialLocation)
    XCTAssertEqual(worktreeSource.context?.lease.location, worktreeLocation)
    XCTAssertNotNil(
      worktreeSource.selection,
      "A thread workspace must validate the project root while operating on its worktree"
    )

    source.synchronize(identity: identity, location: movedLocation)
    XCTAssertNil(source.context, "A relocated lease must not run against an old snapshot")
    app.state.snapshot = shellSnapshot(projectId: identity.projectId, location: movedLocation)
    XCTAssertEqual(source.context?.lease.projectGeneration, 2)

    app.state.selectedConnectionId = ClientConnectionID()
    XCTAssertNil(source.selection, "A host switch must invalidate the project transport")
  }

  func testGatewayRequiresExactScopeBeforeCallingAPI() async throws {
    let api = ProjectRemoteAPIFake()
    let box = ProjectSelectionBox()
    let lease = makeLease()
    box.selection = ProjectTransportSelection(
      session: makeSession(lease: lease, capabilities: [.sessionRead]), api: api
    )
    let gateway = SelectedProjectSessionGateway { box.selection }

    do {
      _ = try await gateway.runProjectCommand(.remove(projectId: "p"), lease: lease)
      XCTFail("Expected missing scope")
    } catch let error as ProjectSessionGatewayError {
      XCTAssertEqual(
        error,
        .http(statusCode: 403, code: "missing_scope", missingScope: "projects:manage")
      )
    }
    let calls = await api.commandCalls
    XCTAssertEqual(calls, 0)
  }

  func testGatewayMaps401AndSanitizesServerErrorCode() async throws {
    let api = ProjectRemoteAPIFake()
    let box = ProjectSelectionBox()
    let lease = makeLease()
    box.selection = ProjectTransportSelection(
      session: makeSession(lease: lease, capabilities: [.projectsManage]), api: api
    )
    let gateway = SelectedProjectSessionGateway { box.selection }

    await api.setError(RemoteClientError(message: "secret detail", status: 401, code: "BAD SECRET"))
    do {
      _ = try await gateway.runProjectCommand(.remove(projectId: "p"), lease: lease)
      XCTFail("Expected authorization failure")
    } catch let error as ProjectSessionGatewayError {
      XCTAssertEqual(error, .http(statusCode: 401, code: nil, missingScope: nil))
    }
  }

  func testStaleSelectedHostLeaseCancelsBeforeRequest() async throws {
    let api = ProjectRemoteAPIFake()
    let box = ProjectSelectionBox()
    let current = makeLease(generation: 2)
    box.selection = ProjectTransportSelection(
      session: makeSession(lease: current, capabilities: [.projectsManage]), api: api
    )
    let gateway = SelectedProjectSessionGateway { box.selection }

    do {
      _ = try await gateway.runProjectCommand(
        .remove(projectId: "p"), lease: makeLease(generation: 1)
      )
      XCTFail("Expected cancellation")
    } catch is CancellationError {}
    let calls = await api.commandCalls
    XCTAssertEqual(calls, 0)
  }

  func testRefreshSchedulerWaitsAndChecksLeaseWithoutSleeping() async throws {
    let waiter = ProjectRefreshTestWaiter()
    let box = ProjectSelectionBox()
    let lease = makeLease()
    box.selection = ProjectTransportSelection(
      session: makeSession(lease: lease, capabilities: []), api: ProjectRemoteAPIFake()
    )
    var refreshed: [ProjectControllerHostLease] = []
    let scheduler = SelectedProjectRefreshScheduler(
      waiter: waiter,
      sessionProvider: { box.selection?.session },
      refresh: { refreshed.append($0) }
    )

    await scheduler.scheduleProjectRefresh(for: lease)
    await waiter.waitUntilStarted()
    await waiter.release()
    for _ in 0..<20 where refreshed.isEmpty { await Task.yield() }
    XCTAssertEqual(refreshed, [lease])
  }

  private func makeLease(generation: UInt64 = 1) -> ProjectControllerHostLease {
    ProjectControllerHostLease(connectionId: ClientConnectionID(), generation: generation)
  }

  private func makeSession(
    lease: ProjectControllerHostLease,
    capabilities: Set<ProjectControllerCapability>
  ) -> ProjectControllerSession {
    ProjectControllerSession(
      lease: lease, isOnline: true, isReady: true, capabilities: capabilities
    )
  }

  private func shellSnapshot(
    projectId: String,
    location: ProjectLocation
  ) -> RemoteShellSnapshot {
    RemoteShellSnapshot(
      snapshotSeq: 1,
      projects: [
        RemoteProject(
          id: projectId,
          remoteServerId: nil,
          remoteId: nil,
          name: "Project",
          location: location,
          workspaceId: nil,
          disabled: false,
          createdAt: "2026-08-12T00:00:00Z"
        )
      ],
      threads: [],
      runtimeSummariesByThread: [:],
      updatedAt: "2026-08-12T00:00:00Z"
    )
  }
}
