import Foundation
import Observation

extension AppSession {
  /// Exact selected-host access for port forwarding.
  ///
  /// The registry record and the live profile must agree on desktop, endpoint,
  /// and protocol version, so an in-progress host switch exposes no access at
  /// all rather than the previous host's. Capabilities are the exact
  /// intersection of the profile grant and the registry record.
  var currentPortForwardingAccess: PortForwardingHostAccess? {
    guard let connectionID = state.selectedConnectionId,
      let record = state.hosts.first(where: { $0.connectionId == connectionID }),
      let profile = state.profile,
      profile.desktopId == record.desktopId,
      profile.httpBaseURL == record.httpBaseURL,
      profile.protocolVersion == record.protocolVersion
    else { return nil }

    let profileCapabilities = Set(
      profile.scopes.compactMap(PortForwardingCapability.init(rawValue:))
    )
    let registryCapabilities = Set(
      record.scopes.compactMap(PortForwardingCapability.init(rawValue:))
    )
    let isForeground = !state.liveLifecycle.isInBackground
    // Online means the selected host's own socket is carrying traffic right
    // now. An API object plus a non-error phase only proves a transport was
    // built once; while the socket is reconnecting, suspended, or failed the
    // desktop is not reachable and forwarding controls must read offline.
    let isOnline =
      state.api != nil
      && state.socketState == .online
      && isForeground
      && state.phase != .needsPairing
      && state.phase != .sessionExpired
      && state.phase != .protocolIncompatible
      && state.phase != .localStoreInconsistent
    return PortForwardingHostAccess(
      lease: PortForwardingHostLease(
        connectionID: connectionID,
        connectionGeneration: UInt64(max(0, state.workGeneration))
      ),
      protocolVersion: profile.protocolVersion,
      isOnline: isOnline,
      isReady: isOnline && state.phase == .ready,
      isForeground: isForeground,
      capabilities: profileCapabilities.intersection(registryCapabilities)
    )
  }

  /// Whether a live port-forwarding operation may begin right now. The Ports
  /// page itself stays reachable for an exact paired-host lease so it can show
  /// native offline, readiness, and missing-scope states.
  var canOpenPortForwarding: Bool {
    guard let access = currentPortForwardingAccess else { return false }
    return access.protocolVersion == PortForwardingRemoteV3Contract.protocolVersion
      && access.isOnline && access.isReady && access.isForeground
      && access.capabilities.contains(.forward)
  }

  func makePortForwardingComposition(
    lease: PortForwardingHostLease,
    browser: PortForwardingBrowserOpener
  ) -> PortForwardingComposition {
    PortForwardingComposition(
      lease: lease,
      credentials: deps.hostCatalog,
      accessProvider: { @MainActor [weak self] in self?.currentPortForwardingAccess },
      browser: browser
    )
  }
}

/// Cached transport for exactly one lease.
///
/// Held separately from the composition so the gateway can be built before the
/// controller without capturing a partially initialised object. Every read
/// re-checks the live access, so a host switch, a generation bump, or a
/// backgrounded session closes the transport path synchronously.
@MainActor
final class PortForwardingSelectionStore {
  private let accessProvider: @MainActor @Sendable () -> PortForwardingHostAccess?
  private var resolved: PortForwardingTransportSelection?
  private var resolvedLease: PortForwardingHostLease?
  private var isBackgrounded = false

  init(accessProvider: @escaping @MainActor @Sendable () -> PortForwardingHostAccess?) {
    self.accessProvider = accessProvider
  }

  var access: PortForwardingHostAccess? { accessProvider() }

  func selection() -> PortForwardingTransportSelection? {
    guard !isBackgrounded, let access = accessProvider(), let resolved, let resolvedLease,
      access.lease == resolvedLease
    else { return nil }
    let exact = PortForwardingHostAccess(
      lease: access.lease,
      protocolVersion: access.protocolVersion,
      isOnline: access.isOnline,
      isReady: access.isReady,
      isForeground: access.isForeground,
      capabilities: access.capabilities.intersection(resolved.access.capabilities)
    )
    return PortForwardingTransportSelection(access: exact, api: resolved.api)
  }

  func adopt(_ selection: PortForwardingTransportSelection?, lease: PortForwardingHostLease) {
    guard !isBackgrounded, accessProvider()?.lease == lease, let selection else {
      resolved = nil
      resolvedLease = nil
      return
    }
    resolved = selection
    resolvedLease = lease
  }

  func invalidate() {
    resolved = nil
    resolvedLease = nil
  }

  func suspend() {
    isBackgrounded = true
    invalidate()
  }

  func resume() {
    isBackgrounded = false
  }

  /// Test-only view of the closed/open state, so activation ownership can be
  /// asserted without sleeping or reaching into a live credential store.
  var isSuspendedForTests: Bool { isBackgrounded }
}

/// Owns the port-forwarding controller for one presentation and keeps it bound
/// to exactly one connection and connection generation.
@MainActor
@Observable
final class PortForwardingComposition {
  let controller: PortForwardingController

  @ObservationIgnored private let store: PortForwardingSelectionStore
  @ObservationIgnored private let transport: PortForwardingExactHostTransportSource
  /// Identity-safe slot for the only foreground work this presentation owns.
  /// Installing cancels the previous activation, and `suspend()` cancels the
  /// current one, so no credential resolution outlives the sheet, the
  /// foreground, or the host it was started for.
  @ObservationIgnored private var activationTask = OwnedTaskSlot()

  init(
    lease: PortForwardingHostLease,
    credentials: any PortForwardingCredentialRepository,
    accessProvider: @escaping @MainActor @Sendable () -> PortForwardingHostAccess?,
    browser: PortForwardingBrowserOpener
  ) {
    let store = PortForwardingSelectionStore(accessProvider: accessProvider)
    self.store = store
    transport = PortForwardingExactHostTransportSource(
      credentials: credentials,
      accessProvider: accessProvider,
      makeAPI: { endpoint, token in
        GeneratedPortForwardingRemoteAPI(
          http: try PortForwardingURLSessionHTTPClient(endpoint: endpoint, token: token),
          browser: browser
        )
      }
    )
    controller = PortForwardingController(
      lease: lease,
      gateway: SelectedPortForwardingGateway { @MainActor [weak store] in store?.selection() }
    )
  }

  var currentLease: PortForwardingHostLease? { store.access?.lease }

  /// Resolves a forward's entry address for Copy URL. Lives here — not on the
  /// controller — so the controller never holds a URL-bearing value.
  func entryAddress(forForwardID forwardID: String) async -> URL? {
    guard let selection = store.selection() else { return nil }
    return try? await selection.api.remoteEntryURL(forwardID: forwardID)
  }

  /// Schedules activation as owned work. The view never spawns a detached
  /// task: every entry point funnels through this slot so dismissal,
  /// backgrounding, and host switches all cancel deterministically.
  func scheduleActivation() {
    var installToken: UInt64 = 0
    let task = Task { @MainActor [weak self] in
      guard let self else { return }
      defer { self.activationTask.clearIfCurrent(installToken) }
      await self.activate()
    }
    installToken = activationTask.install(task)
  }

  /// Rebinds to the current lease and resolves its credentials. Any previously
  /// resolved host is dropped first so it can never serve the new lease.
  func activate() async {
    // A cancelled activation must not resume a store that `suspend()` closed.
    guard !Task.isCancelled else { return }
    store.resume()
    store.invalidate()
    guard let access = store.access else { return }
    let lease = access.lease
    controller.rebind(to: lease)
    do {
      let selection = try await transport.selection(for: lease)
      guard !Task.isCancelled else { return }
      // `adopt` re-reads the live access and refuses a lease that is no longer
      // current, so a completion that outran a host switch changes nothing.
      store.adopt(selection, lease: lease)
    } catch {
      guard store.access?.lease == lease else { return }
      store.invalidate()
    }
  }

  func suspend() {
    activationTask.cancelCurrent()
    store.suspend()
  }

  /// Joins the pending activation so tests observe a settled composition
  /// without sleeping or depending on scheduling order.
  func joinOwnedWorkForTests() async {
    await activationTask.current?.join()
  }

  var isSuspendedForTests: Bool { store.isSuspendedForTests }
}
