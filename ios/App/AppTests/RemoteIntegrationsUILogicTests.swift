import XCTest

@testable import App

@MainActor
final class RemoteIntegrationsUILogicTests: XCTestCase {
  func testRoutesAndAccessGatesModelOfflineReadinessAndExactScopes() {
    XCTAssertEqual(RemoteIntegrationsRoute.allCases.count, 3)
    XCTAssertEqual(RemoteIntegrationsRoute.update.readCapability, .projectsManage)
    XCTAssertEqual(RemoteIntegrationsRoute.schedules.readCapability, .sessionRead)
    XCTAssertEqual(RemoteIntegrationsRoute.prWatches.readCapability, .sessionRead)

    let lease = remoteIntegrationsLease()
    XCTAssertEqual(
      remoteIntegrationsAccess(lease, protocolVersion: 4).gate(.sessionRead),
      .protocolIncompatible
    )
    XCTAssertEqual(
      remoteIntegrationsAccess(lease, isOnline: false).gate(.sessionRead),
      .offline
    )
    XCTAssertEqual(
      remoteIntegrationsAccess(lease, isReady: false).gate(.sessionRead),
      .notReady
    )
    XCTAssertEqual(
      remoteIntegrationsAccess(lease, capabilities: []).gate(.sessionOperate),
      .capabilityMissing("session:operate")
    )
  }

  func testFailurePresentationNeverIncludesAssociatedRemoteValues() {
    let failures: [RemoteIntegrationsFailure] = [
      .capabilityMissing(RemoteIntegrationsFixtures.secret),
      .rejected(statusCode: 599, code: RemoteIntegrationsFixtures.secret),
    ]
    for failure in failures {
      let value = RemoteIntegrationsStrings.failure(failure)
      XCTAssertFalse(value.contains(RemoteIntegrationsFixtures.secret))
      XCTAssertFalse(value.contains("599"))
    }
  }

  func testUpdatePresentationClampsProgressAndDoesNotExposeHostMessage() {
    XCTAssertEqual(
      RemoteIntegrationsPresentation.progress(
        .downloading(.init(percent: 150, bytesPerSecond: 1, transferred: 1, total: 1))
      ),
      1
    )
    let message = RemoteIntegrationsPresentation.updateStatus(.failed)
    XCTAssertFalse(message.contains(RemoteIntegrationsFixtures.secret))
  }

  func testSchedulePresentationUsesOnlySafeSummaryFields() {
    let summary = RemoteIntegrationsPresentation.recurrence(
      .weekly(days: [1, 3], time: "09:30")
    )
    XCTAssertTrue(summary.contains("09:30"))
    XCTAssertFalse(summary.contains(RemoteIntegrationsFixtures.secret))
  }

  func testAppCompositionUsesExactSelectedHostGenerationScopesAndSnapshotProjects() {
    let session = AppSession(dependencies: .live)
    let connectionID = ClientConnectionID()
    let profile = ConnectionProfile(
      desktopId: "desktop",
      label: "Profile Label",
      httpBaseURL: "https://desktop.test",
      wsBaseURL: "wss://desktop.test",
      appVersion: "1",
      scopes: ["session:read", "session:operate", "projects:manage:extra"],
      pairedAt: Date(timeIntervalSince1970: 0),
      protocolVersion: 3
    )
    session.state.selectedConnectionId = connectionID
    session.state.hosts = [
      HostRecord(
        connectionId: connectionID,
        desktopId: profile.desktopId,
        label: "Registry Label",
        httpBaseURL: profile.httpBaseURL,
        wsBaseURL: profile.wsBaseURL,
        appVersion: profile.appVersion,
        scopes: ["session:read", "projects:manage"],
        pairedAt: profile.pairedAt,
        protocolVersion: 3
      )
    ]
    session.state.profile = profile
    session.state.api = RemoteAPIClientBox(
      RemoteAPIClient(endpoint: profile.httpBaseURL, accessToken: "secret")
    )
    session.state.phase = .ready
    session.state.snapshot = RemoteShellSnapshot(
      snapshotSeq: 1,
      projects: [
        project(id: "second", name: "Zulu", disabled: false),
        project(id: "disabled", name: "Hidden", disabled: true),
        project(id: "first", name: "Alpha", disabled: false),
      ],
      threads: [],
      runtimeSummariesByThread: [:],
      updatedAt: "2026-08-12T00:00:00Z"
    )
    _ = session.state.operationOwner.bumpWorkGeneration()

    let selection = session.currentRemoteIntegrationsHostSelection
    XCTAssertEqual(selection?.name, "Registry Label")
    XCTAssertEqual(selection?.lease.connectionID, connectionID)
    XCTAssertEqual(selection?.lease.generation, UInt64(session.state.workGeneration))
    XCTAssertEqual(selection?.access.protocolVersion, 3)
    XCTAssertEqual(selection?.access.capabilities, [.sessionRead])
    XCTAssertTrue(selection?.access.isOnline == true)
    XCTAssertTrue(selection?.access.isReady == true)
    XCTAssertEqual(session.currentRemoteIntegrationsProjects.map(\.id), ["first", "second"])

    session.state.selectedConnectionId = ClientConnectionID()
    XCTAssertNil(session.currentRemoteIntegrationsHostSelection)
    XCTAssertTrue(session.currentRemoteIntegrationsProjects.isEmpty)
  }

  private func project(id: String, name: String, disabled: Bool) -> RemoteProject {
    RemoteProject(
      id: id,
      remoteServerId: nil,
      remoteId: nil,
      name: name,
      location: .posix(path: "/\(id)"),
      workspaceId: nil,
      disabled: disabled,
      createdAt: "2026-08-12T00:00:00Z"
    )
  }
}
