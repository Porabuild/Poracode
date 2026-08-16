import Foundation
import XCTest

@testable import App

/// Production composition and reachability for port forwarding.
@MainActor
final class PortForwardingCompositionTests: XCTestCase {
  private let connectionID = ClientConnectionID(
    UUID(uuidString: "22222222-3333-4444-8555-666666666666")!
  )
  private let otherConnectionID = ClientConnectionID(
    UUID(uuidString: "77777777-3333-4444-8555-666666666666")!
  )

  // MARK: - Access

  func testAccessIsTheExactProfileAndRegistryCapabilityIntersection() throws {
    let app = makeSession(
      profileScopes: ["session:read", "ports:forward"],
      recordScopes: ["session:read", "ports:forward"]
    )
    let access = try XCTUnwrap(app.currentPortForwardingAccess)
    XCTAssertEqual(access.lease.connectionID, connectionID)
    XCTAssertEqual(access.lease.connectionGeneration, UInt64(app.state.workGeneration))
    XCTAssertEqual(access.capabilities, [.forward])
    XCTAssertTrue(app.canOpenPortForwarding)
  }

  func testCapabilityGrantedByOnlyOneSideIsNotUsable() {
    let profileOnly = makeSession(
      profileScopes: ["ports:forward"],
      recordScopes: ["session:read"]
    )
    XCTAssertEqual(profileOnly.currentPortForwardingAccess?.capabilities, [])
    XCTAssertFalse(profileOnly.canOpenPortForwarding)

    let recordOnly = makeSession(
      profileScopes: ["session:read"],
      recordScopes: ["ports:forward"]
    )
    XCTAssertEqual(recordOnly.currentPortForwardingAccess?.capabilities, [])
    XCTAssertFalse(recordOnly.canOpenPortForwarding)
  }

  func testMenuEntryIsClosedWhenTheHostIsNotForegroundOnlineAndReady() {
    let background = makeSession()
    background.state.liveLifecycle.noteEnteredBackground(
      sessionExpired: false,
      resyncPending: false
    )
    XCTAssertFalse(background.canOpenPortForwarding)
    XCTAssertEqual(background.currentPortForwardingAccess?.isForeground, false)

    let connecting = makeSession()
    connecting.state.phase = .connecting
    XCTAssertFalse(connecting.canOpenPortForwarding)

    let expired = makeSession()
    expired.state.phase = .sessionExpired
    XCTAssertFalse(expired.canOpenPortForwarding)

    let offline = makeSession()
    offline.state.api = nil
    XCTAssertFalse(offline.canOpenPortForwarding)
  }

  func testReconnectingSocketReadsOfflineEvenWhileThePhaseStaysReady() {
    let app = makeSession()
    app.state.socketState = .reconnecting

    XCTAssertEqual(app.state.phase, .ready)
    XCTAssertNotNil(app.state.api, "The API object survives a reconnect")
    XCTAssertEqual(app.currentPortForwardingAccess?.isOnline, false)
    XCTAssertEqual(app.currentPortForwardingAccess?.isReady, false)
    XCTAssertEqual(app.currentPortForwardingAccess?.isForeground, true)
    XCTAssertFalse(app.canOpenPortForwarding)
  }

  func testEveryNonOnlineSocketStateReadsOffline() {
    let offlineStates: [RemoteWebSocketClient.ConnectionState] = [
      .idle, .connecting, .reconnecting, .suspended, .failed("boom"),
    ]
    for socketState in offlineStates {
      let app = makeSession()
      app.state.socketState = socketState
      XCTAssertEqual(
        app.currentPortForwardingAccess?.isOnline,
        false,
        "Socket state \(socketState) must not read online"
      )
      XCTAssertFalse(app.canOpenPortForwarding, "Socket state \(socketState) must close the menu")
    }

    let online = makeSession()
    online.state.socketState = .online
    XCTAssertEqual(online.currentPortForwardingAccess?.isOnline, true)
    XCTAssertTrue(online.canOpenPortForwarding)
  }

  // MARK: - Owned activation

  func testSuspendCancelsAnInFlightActivationAndKeepsTheStoreClosed() async throws {
    let app = makeSession()
    let lease = try XCTUnwrap(app.currentPortForwardingAccess?.lease)
    let composition = app.makePortForwardingComposition(
      lease: lease,
      browser: PortForwardingBrowserOpener { _ in false }
    )

    composition.scheduleActivation()
    // Dismissal lands before the scheduled task has had a chance to start.
    composition.suspend()
    await composition.joinOwnedWorkForTests()

    // The cancelled activation must not have reopened the transport path.
    // `activate()` reopens the store as its first act, so a store that is
    // still closed proves the stale work never ran.
    XCTAssertTrue(composition.isSuspendedForTests)
  }

  func testReturningToTheForegroundReschedulesActivationThroughTheOwnedSlot() async throws {
    let app = makeSession()
    let lease = try XCTUnwrap(app.currentPortForwardingAccess?.lease)
    let composition = app.makePortForwardingComposition(
      lease: lease,
      browser: PortForwardingBrowserOpener { _ in false }
    )

    composition.suspend()
    XCTAssertTrue(composition.isSuspendedForTests)

    composition.scheduleActivation()
    await composition.joinOwnedWorkForTests()

    XCTAssertFalse(composition.isSuspendedForTests)
  }

  func testMenuEntryIsClosedWhenTheHostIsNotProtocolV3() {
    let app = makeSession(protocolVersion: 2)
    XCTAssertFalse(app.canOpenPortForwarding)
  }

  func testAccessDisappearsWhileHostIdentitiesDisagree() {
    let app = makeSession()
    XCTAssertNotNil(app.currentPortForwardingAccess)
    app.state.selectedConnectionId = otherConnectionID
    XCTAssertNil(app.currentPortForwardingAccess)
    XCTAssertFalse(app.canOpenPortForwarding)
  }

  // MARK: - Selection store barriers

  func testSelectionIsUnavailableUntilAHostIsResolvedForTheCurrentLease() throws {
    let app = makeSession()
    let store = PortForwardingSelectionStore { [weak app] in app?.currentPortForwardingAccess }
    XCTAssertNil(store.selection())

    let lease = try XCTUnwrap(app.currentPortForwardingAccess?.lease)
    store.adopt(makeSelection(lease: lease, capabilities: [.forward]), lease: lease)
    XCTAssertNotNil(store.selection())
    XCTAssertEqual(store.selection()?.access.capabilities, [.forward])
  }

  func testResolvedHostIsDroppedWhenTheConnectionGenerationMoves() throws {
    let app = makeSession()
    let store = PortForwardingSelectionStore { [weak app] in app?.currentPortForwardingAccess }
    let lease = try XCTUnwrap(app.currentPortForwardingAccess?.lease)
    store.adopt(makeSelection(lease: lease, capabilities: [.forward]), lease: lease)
    XCTAssertNotNil(store.selection())

    _ = app.state.operationOwner.bumpWorkGeneration()
    XCTAssertNil(store.selection(), "A resolved host must not serve a newer generation")
  }

  func testAdoptRefusesASelectionResolvedForAnAlreadyStaleLease() throws {
    let app = makeSession()
    let store = PortForwardingSelectionStore { [weak app] in app?.currentPortForwardingAccess }
    let lease = try XCTUnwrap(app.currentPortForwardingAccess?.lease)
    _ = app.state.operationOwner.bumpWorkGeneration()

    store.adopt(makeSelection(lease: lease, capabilities: [.forward]), lease: lease)
    XCTAssertNil(store.selection())
  }

  func testBackgroundClosesTheTransportPathSynchronously() throws {
    let app = makeSession()
    let store = PortForwardingSelectionStore { [weak app] in app?.currentPortForwardingAccess }
    let lease = try XCTUnwrap(app.currentPortForwardingAccess?.lease)
    store.adopt(makeSelection(lease: lease, capabilities: [.forward]), lease: lease)
    XCTAssertNotNil(store.selection())

    store.suspend()
    XCTAssertNil(store.selection())
    store.adopt(makeSelection(lease: lease, capabilities: [.forward]), lease: lease)
    XCTAssertNil(store.selection(), "A suspended store must not adopt a new host")

    store.resume()
    store.adopt(makeSelection(lease: lease, capabilities: [.forward]), lease: lease)
    XCTAssertNotNil(store.selection())
  }

  func testCapabilitiesAreIntersectedAgainstTheResolvedRecord() throws {
    let app = makeSession()
    let store = PortForwardingSelectionStore { [weak app] in app?.currentPortForwardingAccess }
    let lease = try XCTUnwrap(app.currentPortForwardingAccess?.lease)
    store.adopt(makeSelection(lease: lease, capabilities: []), lease: lease)
    XCTAssertEqual(store.selection()?.access.capabilities, [])
  }

  // MARK: - Credentials

  func testCatalogResolvesCredentialsOnlyForTheExactConnection() async throws {
    let keychain = InMemoryKeychainIO()
    let catalog = HostCatalog.ephemeralForTests(vaultIO: keychain)
    defer { Task { await catalog.wipeForTests() } }
    let record = hostRecord(scopes: ["session:read", "ports:forward"])
    let activated = try await catalog.activate(id: 1, kind: .add)
    XCTAssertTrue(activated)
    _ = try await catalog.pairAdd(record: record, token: "secret-token", owning: 1)

    let resolved = try await catalog.portForwardingCredentials(for: connectionID)
    XCTAssertEqual(resolved?.connectionID, connectionID)
    XCTAssertEqual(resolved?.endpoint, "https://desktop.test")
    XCTAssertEqual(resolved?.protocolVersion, ProtocolConstants.remoteProtocolVersion)
    XCTAssertEqual(resolved?.scopes, ["session:read", "ports:forward"])

    let foreign = try await catalog.portForwardingCredentials(for: otherConnectionID)
    XCTAssertNil(foreign, "Another host's connection must resolve nothing")
  }

  func testAdvancedCatalogResolvesCredentialsOnlyForTheExactConnection() async throws {
    let keychain = InMemoryKeychainIO()
    let catalog = HostCatalog.ephemeralForTests(vaultIO: keychain)
    defer { Task { await catalog.wipeForTests() } }
    let activated = try await catalog.activate(id: 1, kind: .add)
    XCTAssertTrue(activated)
    _ = try await catalog.pairAdd(
      record: hostRecord(scopes: ["session:read", "projects:manage"]),
      token: "secret-token",
      owning: 1
    )

    let resolved = try await catalog.advancedOperationsCredentials(for: connectionID)
    XCTAssertEqual(resolved?.connectionID, connectionID)
    XCTAssertEqual(resolved?.desktopID, "desktop")
    XCTAssertEqual(resolved?.scopes, ["session:read", "projects:manage"])
    let foreign = try await catalog.advancedOperationsCredentials(for: otherConnectionID)
    XCTAssertNil(foreign, "Another host's connection must resolve nothing")
  }

  // MARK: - Fixtures

  private func makeSelection(
    lease: PortForwardingHostLease,
    capabilities: Set<PortForwardingCapability>
  ) -> PortForwardingTransportSelection {
    PortForwardingTransportSelection(
      access: PortForwardingHostAccess(
        lease: lease,
        protocolVersion: ProtocolConstants.remoteProtocolVersion,
        isOnline: true,
        isReady: true,
        isForeground: true,
        capabilities: capabilities
      ),
      api: PortForwardingAPIStub()
    )
  }

  private func hostRecord(scopes: [String]) -> HostRecord {
    HostRecord(
      connectionId: connectionID,
      desktopId: "desktop",
      label: "Desktop",
      httpBaseURL: "https://desktop.test",
      wsBaseURL: "wss://desktop.test",
      appVersion: "1",
      scopes: scopes,
      pairedAt: Date(timeIntervalSince1970: 0)
    )
  }

  private func makeSession(
    profileScopes: [String] = ["session:read", "ports:forward"],
    recordScopes: [String] = ["session:read", "ports:forward"],
    protocolVersion: Int = ProtocolConstants.remoteProtocolVersion
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
      pairedAt: Date(timeIntervalSince1970: 0),
      protocolVersion: protocolVersion
    )
    var record = hostRecord(scopes: recordScopes)
    record.protocolVersion = protocolVersion
    app.state.hosts = [record]
    app.state.api = RemoteAPIClientBox(
      RemoteAPIClient(endpoint: "https://desktop.test", accessToken: "secret")
    )
    app.state.phase = .ready
    app.state.socketState = .online
    return app
  }
}

private struct PortForwardingAPIStub: PortForwardingRemoteAPI {
  func remoteScan() async throws -> PortForwardingSnapshot { .empty }
  func remoteStart(port: Int) async throws -> PortForward {
    PortForward(id: "f", targetPort: port, listenPort: port, createdAt: 0)
  }
  func remoteOpen(forwardID: String) async throws {}
  func remoteEntryURL(forwardID: String) async throws -> URL {
    URL(string: "https://desktop.test/forward/\(forwardID)")!
  }
  func remoteStop(forwardID: String) async throws {}
}
