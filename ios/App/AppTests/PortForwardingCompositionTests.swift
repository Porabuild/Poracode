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

  func testBrowserForwardEntryRequiresThisConnectionsOwnAdvertisedHandshake() throws {
    let app = makeSession()
    // No handshake yet: unknown, reads closed.
    XCTAssertEqual(app.currentPortForwardingAccess?.browserForwardEntry, false)

    app.state.noteBrowserForwardEntry(nil, connectionID: connectionID)
    XCTAssertEqual(app.currentPortForwardingAccess?.browserForwardEntry, false)

    // Authoritative absence from this host's own handshake.
    app.state.browserForwardEntry = .init(connectionID: connectionID, advertised: false)
    XCTAssertEqual(app.currentPortForwardingAccess?.browserForwardEntry, false)

    // Another desktop's advertising never leaks across a host switch.
    app.state.browserForwardEntry = .init(connectionID: otherConnectionID, advertised: true)
    XCTAssertEqual(app.currentPortForwardingAccess?.browserForwardEntry, false)

    app.state.browserForwardEntry = .init(connectionID: connectionID, advertised: true)
    XCTAssertEqual(app.currentPortForwardingAccess?.browserForwardEntry, true)
    // Raw forwarding reachability is unaffected by the capability either way.
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

  func testOperationReadinessClosesWhenTheHostIsNotForegroundOnlineAndReady() {
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
      XCTAssertFalse(
        app.canOpenPortForwarding,
        "Socket state \(socketState) must close live operations"
      )
    }

    let online = makeSession()
    online.state.socketState = .online
    XCTAssertEqual(online.currentPortForwardingAccess?.isOnline, true)
    XCTAssertTrue(online.canOpenPortForwarding)
  }

  // MARK: - Reconnect capability authority (online epoch)

  /// Browser-entry authority is bound to the selected host's online session:
  /// leaving `.online` drops retained support, and every fresh `.online`
  /// opens a new epoch that costs exactly one environment handshake. A
  /// same-host socket reconnect must never serve the previous connection's
  /// capability, while raw forwarding capabilities stay untouched.
  func testSameHostSocketReconnectDropsRetainedEntryUntilFreshHandshake() async throws {
    let (app, api) = makeReconnectSession()
    let key = SessionPoolKey.host(connectionID)
    let gate = AsyncGate()
    api.environmentGate = gate
    api.environmentResults = [
      .success(try environmentDescriptor(browserForwardJSON: #"{"browserForward": {"versions": [1]}}"#)),
      .success(try environmentDescriptor(browserForwardJSON: #"{"browserForward": {"versions": [2]}}"#)),
    ]

    // First online epoch: the supported handshake applies and opens entry.
    recordOnline(app, key)
    try await gate.waitUntilWaiting()
    XCTAssertEqual(api.environmentCalls, 1, "One environment handshake per online epoch")
    // While the epoch's handshake is in flight the slot reads unknown: closed.
    XCTAssertEqual(app.currentPortForwardingAccess?.browserForwardEntry, false)
    // The connect funnel's probe dedupes against the in-flight refresh.
    app.refreshBrowserForwardAuthority(for: connectionID)
    XCTAssertEqual(api.environmentCalls, 1, "In-flight authority must not double-fetch")

    await gate.resume()
    await app.browserForwardAuthorityTask.current?.join()
    XCTAssertEqual(app.currentPortForwardingAccess?.browserForwardEntry, true)
    // Raw forwarding reachability is unaffected by the capability either way.
    XCTAssertEqual(app.currentPortForwardingAccess?.capabilities, [.forward])
    XCTAssertTrue(app.canOpenPortForwarding)

    // Same-host transient reconnect: retained support must not survive.
    app.recordSocketState(.reconnecting, for: key)
    XCTAssertEqual(app.currentPortForwardingAccess?.browserForwardEntry, false)

    // Fresh online epoch: exactly one more handshake; an unknown-only
    // environment leaves entry closed.
    app.recordSocketState(.online, for: key)
    try await gate.waitUntilWaiting()
    XCTAssertEqual(api.environmentCalls, 2, "No per-action probes; one handshake per epoch")
    XCTAssertEqual(app.currentPortForwardingAccess?.browserForwardEntry, false)

    await gate.resume()
    await app.browserForwardAuthorityTask.current?.join()
    XCTAssertEqual(app.currentPortForwardingAccess?.browserForwardEntry, false)
    XCTAssertEqual(app.currentPortForwardingAccess?.capabilities, [.forward])
  }

  /// An environment read suspended across a host swap completes too late: it
  /// must never write its descriptor — supported or not — for another
  /// connection's online session.
  func testSuspendedEnvironmentReadCompletingAfterHostSwapCannotReauthorize() async throws {
    let (app, api) = makeReconnectSession()
    let key = SessionPoolKey.host(connectionID)
    let gate = AsyncGate()
    api.environmentGate = gate
    api.environmentResults = [
      .success(try environmentDescriptor(browserForwardJSON: #"{"browserForward": {"versions": [1]}}"#))
    ]

    recordOnline(app, key)
    try await gate.waitUntilWaiting()
    XCTAssertEqual(app.state.browserForwardRefresh?.connectionID, connectionID)
    XCTAssertEqual(app.state.browserForwardRefresh?.onlineEpoch, 1)

    // Host swap while the epoch's descriptor read is still suspended.
    app.state.selectedConnectionId = otherConnectionID
    await gate.resume()
    await app.browserForwardAuthorityTask.current?.join()

    XCTAssertNil(
      app.state.browserForwardEntry,
      "A late read for the previous connection must never re-authorize"
    )
    XCTAssertFalse(app.state.hasBrowserForwardAuthority(for: connectionID))
    XCTAssertFalse(app.state.hasBrowserForwardAuthority(for: otherConnectionID))
  }

  /// An environment read suspended across a further reconnect completes
  /// after its online epoch ended: the epoch fence must drop the result, so
  /// retained support can never regain live authority.
  func testSuspendedEnvironmentReadCompletingAfterReconnectCannotReauthorize() async throws {
    let (app, api) = makeReconnectSession()
    let key = SessionPoolKey.host(connectionID)
    let gate = AsyncGate()
    api.environmentGate = gate
    api.environmentResults = [
      .success(try environmentDescriptor(browserForwardJSON: #"{"browserForward": {"versions": [1]}}"#))
    ]

    recordOnline(app, key)  // epoch 1, read suspended
    try await gate.waitUntilWaiting()
    XCTAssertEqual(api.environmentCalls, 1)

    // The epoch ends before the read completes; the new epoch's own refresh
    // falls through to a failing environment (absence never inferred).
    app.recordSocketState(.reconnecting, for: key)
    recordOnline(app, key)  // epoch 2
    try await gate.waitUntilWaiting()

    await gate.resume()
    await app.browserForwardAuthorityTask.current?.join()

    XCTAssertNil(
      app.state.browserForwardEntry,
      "The epoch-1 supported result must be dropped, not restamped"
    )
    XCTAssertFalse(app.state.hasBrowserForwardAuthority(for: connectionID))
    XCTAssertEqual(app.currentPortForwardingAccess?.browserForwardEntry, false)
    XCTAssertEqual(api.environmentCalls, 2, "Each epoch refetches at most once")
  }

  /// The connect funnel probes only when no current-epoch authority exists:
  /// a resolved entry (this connection, this epoch) short-circuits, the
  /// probe returns after the epoch moves, and an in-flight refresh dedupes.
  func testConnectFunnelProbeFetchesOnlyWithoutCurrentEpochAuthority() async throws {
    let (app, api) = makeReconnectSession()
    let key = SessionPoolKey.host(connectionID)
    let gate = AsyncGate()
    api.environmentGate = gate

    // Resolved authority for the current epoch: no fetch at all.
    app.state.noteBrowserForwardEntry(
      try environmentDescriptor(browserForwardJSON: #"{"browserForward": {"versions": [2]}}"#),
      connectionID: connectionID
    )
    app.refreshBrowserForwardAuthority(for: connectionID)
    XCTAssertEqual(api.environmentCalls, 0, "Current-epoch authority must not refetch")

    // After the epoch moves, the same probe fetches once.
    app.recordSocketState(.reconnecting, for: key)
    api.environmentResults = [
      .success(try environmentDescriptor(browserForwardJSON: #"{"browserForward": {"versions": [1]}}"#))
    ]
    app.refreshBrowserForwardAuthority(for: connectionID)
    try await gate.waitUntilWaiting()
    XCTAssertEqual(api.environmentCalls, 1)
    app.refreshBrowserForwardAuthority(for: connectionID)
    XCTAssertEqual(api.environmentCalls, 1, "In-flight refresh must dedupe the probe")

    await gate.resume()
    await app.browserForwardAuthorityTask.current?.join()
    XCTAssertEqual(app.currentPortForwardingAccess?.browserForwardEntry, true)
  }

  /// Unpair clears the epoch and every authority/pending trace, so nothing
  /// can leak into a later pairing.
  func testUnpairResetClearsBrowserAuthorityAndEpoch() async throws {
    let (app, _) = makeReconnectSession()
    let key = SessionPoolKey.host(connectionID)
    recordOnline(app, key)
    app.state.noteBrowserForwardEntry(
      try environmentDescriptor(browserForwardJSON: #"{"browserForward": {"versions": [1]}}"#),
      connectionID: connectionID
    )
    XCTAssertEqual(app.state.browserForwardOnlineEpoch, 1)

    app.state.resetForUnpair()

    XCTAssertEqual(app.state.browserForwardOnlineEpoch, 0)
    XCTAssertNil(app.state.browserForwardEntry)
    XCTAssertNil(app.state.browserForwardRefresh)
    XCTAssertFalse(app.state.hasBrowserForwardAuthority(for: connectionID))
  }

  /// A cancelled refresh must never write authority — even when the
  /// transport delivers a buffered result that ignores cancellation (the
  /// gate resumes waiters normally on cancel, so `environment()` returns a
  /// supported descriptor into an already-cancelled task). The sweep that
  /// cancelled the task owns invalidation; the read only releases its own
  /// pending-marker reservation so a later probe can refetch.
  func testCancelledRefreshCannotWriteEvenWhenTransportIgnoresCancellation() async throws {
    let (app, api) = makeReconnectSession()
    let key = SessionPoolKey.host(connectionID)
    let gate = AsyncGate()
    api.environmentGate = gate
    api.environmentResults = [
      .success(try environmentDescriptor(browserForwardJSON: #"{"browserForward": {"versions": [1]}}"#))
    ]

    recordOnline(app, key)
    try await gate.waitUntilWaiting()
    XCTAssertEqual(api.environmentCalls, 1)

    // Background/unpair-style sweep cancels the in-flight refresh.
    app.browserForwardAuthorityTask.cancelCurrent()

    // The cancelled read settles: gate resumes the waiter, the stub hands
    // back the buffered supported descriptor, finish runs.
    var settled = false
    for _ in 0..<200 {
      if app.state.browserForwardRefresh == nil { settled = true; break }
      try await Task.sleep(for: .milliseconds(5))
    }
    XCTAssertTrue(settled, "Cancelled refresh must release its reservation")

    XCTAssertNil(
      app.state.browserForwardEntry,
      "A cancelled read must never write, even with a delivered value"
    )
    XCTAssertFalse(app.state.hasBrowserForwardAuthority(for: connectionID))
    XCTAssertEqual(app.currentPortForwardingAccess?.browserForwardEntry, false)

    // The released reservation lets this epoch be probed again. Join proves
    // the re-probe task actually ran before its call count is asserted.
    api.environmentGate = nil
    app.refreshBrowserForwardAuthority(for: connectionID)
    await app.browserForwardAuthorityTask.current?.join()
    XCTAssertEqual(api.environmentCalls, 2, "Re-probe after a released reservation refetches")
    XCTAssertNil(app.state.browserForwardEntry, "Failing re-probe stays unknown, never absent")
  }

  /// Pooled-host A→B→A: switching away overwrites the pending marker with
  /// another connection's key, switching back re-reserves the original
  /// (connection, epoch) key, and only then does the still-suspended
  /// original request complete. Its completion must neither release the
  /// newer request's reservation (request-token fence) nor write authority.
  func testLateCompletionAfterHostSwapRoundTripCannotReleaseNewerReservation() async throws {
    let (app, api) = makeReconnectSession()
    let key = SessionPoolKey.host(connectionID)
    let otherKey = SessionPoolKey.host(otherConnectionID)
    let gateA = AsyncGate()
    let gateB = AsyncGate()
    let gateAPrime = AsyncGate()
    api.environmentGates = [gateA, gateB, gateAPrime]
    api.environmentResults = [
      .success(try environmentDescriptor(browserForwardJSON: #"{"browserForward": {"versions": [1]}}"#)),
      .success(try environmentDescriptor(browserForwardJSON: #"{"browserForward": {"versions": [1]}}"#)),
    ]

    // A: selected host's first online epoch, suspended.
    recordOnline(app, key)
    try await gateA.waitUntilWaiting()
    XCTAssertEqual(api.environmentCalls, 1)

    // Switch away: B's own online epoch overwrites the pending key.
    app.state.selectedConnectionId = otherConnectionID
    recordOnline(app, otherKey)
    try await gateB.waitUntilWaiting()
    XCTAssertEqual(api.environmentCalls, 2)
    XCTAssertEqual(app.state.browserForwardRefresh?.connectionID, otherConnectionID)
    XCTAssertEqual(app.state.browserForwardRefresh?.onlineEpoch, 2)
    let tokenB = app.browserForwardAuthorityTask.token

    // Switch back: the original key is re-reserved for a new request (A′)
    // while A is still suspended on its gate.
    app.state.selectedConnectionId = connectionID
    recordOnline(app, key)
    try await gateAPrime.waitUntilWaiting()
    XCTAssertEqual(api.environmentCalls, 3)
    XCTAssertEqual(app.state.browserForwardRefresh?.connectionID, connectionID)
    XCTAssertEqual(app.state.browserForwardRefresh?.onlineEpoch, 3)
    XCTAssertNotEqual(app.browserForwardAuthorityTask.token, tokenB)

    // A settles now, while A′'s reservation stands. Its late completion must
    // leave A′'s marker (different request token) untouched.
    await gateA.resume()
    var settledA = false
    for _ in 0..<200 {
      if api.environmentCompletions >= 1 { settledA = true; break }
      try await Task.sleep(for: .milliseconds(5))
    }
    XCTAssertTrue(settledA, "A's suspended read must have settled")
    await Task.yield()
    await Task.yield()
    XCTAssertNotNil(
      app.state.browserForwardRefresh,
      "A's late completion must not release A′'s newer reservation"
    )
    XCTAssertEqual(app.state.browserForwardRefresh?.connectionID, connectionID)
    XCTAssertEqual(app.state.browserForwardRefresh?.onlineEpoch, 3)

    // Let B and A′ settle: B's cross-key result is dropped, A′'s failing
    // read leaves the slot unknown; A′ releases its own reservation.
    await gateB.resume()
    await gateAPrime.resume()
    var settled = false
    for _ in 0..<200 {
      if api.environmentCompletions >= 3 { settled = true; break }
      try await Task.sleep(for: .milliseconds(5))
    }
    XCTAssertTrue(settled)
    await app.browserForwardAuthorityTask.current?.join()
    XCTAssertNil(app.state.browserForwardRefresh)
    XCTAssertNil(app.state.browserForwardEntry, "No suspended request may write after three epochs")
    XCTAssertEqual(api.environmentCalls, 3)
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

  /// Session fixture for the reconnect-authority funnel: the live socket
  /// state path (`recordSocketState`) plus a controllable fake environment
  /// API in place of the real HTTP client.
  private func makeReconnectSession() -> (AppSession, FakeRemoteAPI) {
    let app = makeSession()
    let api = FakeRemoteAPI(endpoint: "https://desktop.test")
    app.state.api = api
    return (app, api)
  }

  /// Drives one fresh `.online` through the real funnel. The fixture comes
  /// out of `makeSession()` pre-marked `.online` without ever having
  /// connected, so the first epoch needs the connecting step.
  private func recordOnline(_ app: AppSession, _ key: SessionPoolKey) {
    app.recordSocketState(.connecting, for: key)
    app.recordSocketState(.online, for: key)
  }

  private func environmentDescriptor(browserForwardJSON: String) throws -> RemoteEnvironmentDescriptor {
    let json = """
      {
        "protocolVersion": \(ProtocolConstants.remoteProtocolVersion),
        "desktopId": "desktop", "label": "Desktop", "appVersion": "1",
        "auth": {"bootstrapMethods": [], "sessionMethods": [], "scopes": []},
        "endpoints": {"httpBaseUrl": "https://desktop.test", "wsBaseUrl": "wss://desktop.test"},
        "capabilities": \(browserForwardJSON)
      }
      """
    return try JSONDecoder().decode(RemoteEnvironmentDescriptor.self, from: Data(json.utf8))
  }

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
        capabilities: capabilities,
        browserForwardEntry: true
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
