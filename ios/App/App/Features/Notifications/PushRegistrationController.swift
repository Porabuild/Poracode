import Foundation
import Observation

@MainActor
@Observable
final class PushClientStatus {
  enum State: Equatable {
    case idle
    case ready
    case disabledByUser
    case disabledForPreservedState
  }

  static let shared = PushClientStatus()
  private(set) var state: State = .idle

  func set(_ state: State) { self.state = state }
}

actor PushRegistrationController {
  typealias APIFactory =
    @Sendable (String, String, RemoteEnvironmentContext?) -> any PushRemoteAPI

  static let shared = PushRegistrationController()

  private let catalog: HostCatalog
  private let vault: PushTokenVault
  private let stateStore: PushClientStateStore
  private let outbox: PushUnregisterOutbox
  private let removalPolicy: PushUnregisterRemovalPolicy
  private let makeAPI: APIFactory
  private let appVersion: @Sendable () -> String
  private var deliveryEnabled: Bool
  private var alertPreferences: PushAlertPreferences
  private var deliveryRevision: UInt64 = 0
  private var isForeground = false
  private var reconcileTask: Task<Void, Never>?

  /// The one production factory: bound endpoint + paired bearer + resolved
  /// parent context (nil for a direct host). Tests inject a URLProtocol-backed
  /// session to capture the exact headers this factory produces.
  static func productionAPIFactory(session: URLSession? = nil) -> APIFactory {
    { endpoint, token, environment in
      RemoteAPIClient(
        endpoint: endpoint,
        accessToken: token,
        session: session,
        environment: environment
      )
    }
  }

  init(
    catalog: HostCatalog = .shared,
    vault: PushTokenVault = .shared,
    stateStore: PushClientStateStore = .shared,
    outbox: PushUnregisterOutbox = .shared,
    makeAPI: @escaping APIFactory = PushRegistrationController.productionAPIFactory(),
    appVersion: @escaping @Sendable () -> String = {
      Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    },
    deliveryEnabled: Bool = NotificationDeliveryPreference.isEnabled(),
    alertPreferences: PushAlertPreferences = NotificationAlertPreference.current().pushPreferences
  ) {
    self.catalog = catalog
    self.vault = vault
    self.stateStore = stateStore
    self.outbox = outbox
    self.removalPolicy = PushUnregisterRemovalPolicy(catalog: catalog, stateStore: stateStore)
    self.makeAPI = makeAPI
    self.appVersion = appVersion
    self.deliveryEnabled = deliveryEnabled
    self.alertPreferences = alertPreferences
  }

  func setAlertPreferences(_ preferences: PushAlertPreferences) async {
    guard alertPreferences != preferences else { return }
    alertPreferences = preferences
    if deliveryEnabled, isForeground { await reconcileNow() }
  }

  func setForeground(_ foreground: Bool) async {
    isForeground = foreground
    if foreground { await reconcileNow() }
  }

  func receiveAPNSToken(_ token: Data) async {
    do {
      try await vault.storeAPNSToken(token.lowercaseHexString)
      if deliveryEnabled && isForeground { scheduleReconcile() }
    } catch {
      await disableForPreservedState()
    }
  }

  func receivePushToStartToken(_ token: Data) async {
    do {
      try await vault.storePushToStartToken(token.lowercaseHexString)
      if deliveryEnabled && isForeground { scheduleReconcile() }
    } catch {
      await disableForPreservedState()
    }
  }

  func receiveActivityToken(
    _ token: Data,
    activityId: String,
    route: PushRegistrationRoute
  ) async {
    guard route.version == NotificationRoute.version else { return }
    do {
      try await vault.storeActivityToken(
        token.lowercaseHexString,
        activityId: activityId,
        route: route
      )
      if deliveryEnabled && isForeground { scheduleReconcile() }
    } catch {
      await disableForPreservedState()
    }
  }

  func removeActivity(_ activityId: String) async {
    try? await vault.removeActivity(activityId)
  }

  func setDeliveryEnabled(_ enabled: Bool) async {
    guard deliveryEnabled != enabled else {
      if enabled, isForeground { await reconcileNow() }
      return
    }
    deliveryRevision &+= 1
    let revision = deliveryRevision
    deliveryEnabled = enabled
    reconcileTask?.cancel()
    reconcileTask = nil
    if enabled {
      if isForeground { await reconcileNow() }
    } else {
      if await enqueueUnregistersForAllHosts(expectedRevision: revision) {
        guard ownsDelivery(revision, enabled: false) else { return }
        _ = await retryUnregisterOutbox()
        guard ownsDelivery(revision, enabled: false) else { return }
        await markDisabledByUser()
      }
    }
  }

  func reconcileNow() async {
    guard isForeground else { return }
    let revision = deliveryRevision
    do {
      let vaultLoad = try await vault.load()
      let stateLoad = try await stateStore.load()
      let outboxLoad = try await outbox.load()
      guard vaultLoad.isUsable, stateLoad.isUsable, outboxLoad.isUsable else {
        await disableForPreservedState()
        return
      }
      guard revision == deliveryRevision else { return }
      guard deliveryEnabled else {
        guard await enqueueUnregistersForAllHosts(expectedRevision: revision) else { return }
        guard ownsDelivery(revision, enabled: false) else { return }
        _ = await retryUnregisterOutbox()
        guard ownsDelivery(revision, enabled: false) else { return }
        await markDisabledByUser()
        return
      }
      guard let pendingUnregistrations = await retryUnregisterOutbox() else { return }
      guard ownsDelivery(revision, enabled: true) else { return }
      let secrets = try await vault.snapshotCreatingIfNeeded()
      guard ownsDelivery(revision, enabled: true) else { return }
      guard let deviceToken = secrets.apnsToken else {
        guard ownsDelivery(revision, enabled: true) else { return }
        await markReady()
        return
      }
      let snapshot = try await catalog.snapshot()
      guard ownsDelivery(revision, enabled: true) else { return }
      for host in snapshot.hosts where host.scopes.contains("session:operate") {
        guard isForeground, ownsDelivery(revision, enabled: true) else { return }
        let route = PushRegistrationRoute(
          clientConnectionId: host.connectionId,
          desktopId: host.desktopId
        )
        guard !pendingUnregistrations.contains(route) else { continue }
        await reconcile(
          host: host,
          secrets: secrets,
          deviceToken: deviceToken,
          expectedRevision: revision
        )
      }
      guard ownsDelivery(revision, enabled: true) else { return }
      await markReady()
    } catch PushStorageError.incompatible {
      await disableForPreservedState()
    } catch {
      // Transient catalog/network/storage errors leave the last good registration intact.
    }
  }

  /// Durable removal snapshot for one record — and, for a direct parent, every
  /// locally paired environment it cascades — taken before the catalog deletes
  /// them.
  ///
  /// Each environment route is enqueued with its existing child grant and the
  /// parent authority read from the parent record's vault slot, so the entry
  /// still authenticates through the proxy after both records (and both vault
  /// slots) are gone. A record whose grant is unreadable contributes no entry
  /// and no invented credential; the host-side registration remains a bounded
  /// best-effort residual. Entries expire with the outbox (7 days).
  func prepareRemoval(record: HostRecord, accessToken: String) async {
    guard let secrets = try? await vault.snapshotCreatingIfNeeded() else { return }
    for target in await removalPolicy.targets(record: record, accessToken: accessToken) {
      guard
        let entry = await enqueueUnregister(
          endpoint: target.record.httpBaseURL,
          accessToken: target.accessToken,
          deviceId: secrets.deviceId,
          route: PushRegistrationRoute(
            clientConnectionId: target.record.connectionId,
            desktopId: target.record.desktopId
          ),
          parentConnectionId: target.record.environment?.parentConnectionId,
          parentAuthority: target.parentAuthority
        )
      else { return }
      if target.cascaded {
        // The parent removal deletes this dependent in the same catalog
        // transaction. Its push state goes with it; the durable outbox entry
        // is now the only cleanup record.
        try? await stateStore.removeHost(target.record.connectionId)
      }
      Task { [weak self] in
        await self?.attemptUnregister(entry)
      }
    }
  }

  func didRemoveHost(_ connectionId: ClientConnectionID) async {
    try? await stateStore.removeHost(connectionId)
  }

  private func reconcile(
    host: HostRecord,
    secrets: PushTokenVault.Document,
    deviceToken: String,
    expectedRevision: UInt64
  ) async {
    let storedToken: String?
    do {
      storedToken = try await catalog.token(for: host.connectionId)
    } catch {
      return
    }
    guard ownsDelivery(expectedRevision, enabled: true) else { return }
    guard let accessToken = storedToken, !accessToken.isEmpty else { return }
    let environmentContext = await catalog.environmentTransportContext(for: host)
    let api = makeAPI(host.httpBaseURL, accessToken, environmentContext)
    let environment: RemoteEnvironmentDescriptor
    do {
      environment = try await api.environment()
    } catch {
      return
    }
    guard ownsDelivery(expectedRevision, enabled: true) else { return }
    let versions = environment.capabilities?.pushRouting?.versions ?? []
    do {
      try await stateStore.updateHost(host.connectionId) {
        $0.capabilityVersions = versions
      }
    } catch {
      await disableForPreservedState()
      return
    }
    guard ownsDelivery(expectedRevision, enabled: true) else { return }
    guard PushRoutingCapability.supportsV1(environment),
      environment.desktopId == host.desktopId,
      NotificationRouteValidation.validIdentifier(host.desktopId)
    else { return }

    let previous: PushClientStateStore.HostState
    do {
      previous = try await stateStore.host(host.connectionId)
    } catch {
      await disableForPreservedState()
      return
    }
    guard ownsDelivery(expectedRevision, enabled: true) else { return }
    let route = PushRegistrationRoute(
      clientConnectionId: host.connectionId,
      desktopId: host.desktopId
    )
    var routedDeltas: [String: String] = [:]
    for (activityId, secret) in secrets.activities where secret.route == route {
      if previous.activityTokenFingerprints[activityId] != PushFingerprint.of(secret.token) {
        routedDeltas[activityId] = secret.token
      }
    }
    let request = PushRegistrationRequest(
      deviceId: secrets.deviceId,
      deviceToken: deviceToken,
      appVersion: appVersion(),
      routing: route,
      pushToStartToken: secrets.pushToStartToken,
      activityTokens: routedDeltas.isEmpty ? nil : routedDeltas,
      alertPreferences: alertPreferences
    )
    do {
      let response = try await api.registerPush(request)
      guard ownsDelivery(expectedRevision, enabled: true) else {
        await cleanUpStaleRegistration(
          record: host,
          accessToken: accessToken,
          deviceId: secrets.deviceId,
          route: route
        )
        return
      }
      guard response.acceptedRoutingV1 else { return }
      try await stateStore.updateHost(host.connectionId) { state in
        state.capabilityVersions = versions
        state.deviceTokenFingerprint = PushFingerprint.of(deviceToken)
        state.pushToStartFingerprint = PushFingerprint.of(secrets.pushToStartToken)
        for (id, token) in routedDeltas {
          state.activityTokenFingerprints[id] = PushFingerprint.of(token)
        }
        state.lastRegisteredAt = Date()
      }
      guard ownsDelivery(expectedRevision, enabled: true) else {
        try? await stateStore.removeHost(host.connectionId)
        return
      }
    } catch {
      return
    }
  }

  private func retryUnregisterOutbox() async -> Set<PushRegistrationRoute>? {
    guard let entries = try? await outbox.pending() else {
      await disableForPreservedState()
      return nil
    }
    for entry in entries {
      await attemptUnregister(entry)
    }
    guard let remaining = try? await outbox.pending() else {
      await disableForPreservedState()
      return nil
    }
    return Set(remaining.map(\.route))
  }

  private func enqueueUnregistersForAllHosts(expectedRevision: UInt64) async -> Bool {
    do {
      let vaultLoad = try await vault.load()
      let stateLoad = try await stateStore.load()
      let outboxLoad = try await outbox.load()
      guard vaultLoad.isUsable, stateLoad.isUsable, outboxLoad.isUsable else {
        await disableForPreservedState()
        return false
      }
      guard ownsDelivery(expectedRevision, enabled: false) else { return false }
      let secrets = try await vault.snapshotCreatingIfNeeded()
      guard ownsDelivery(expectedRevision, enabled: false) else { return false }
      let snapshot = try await catalog.snapshot()
      guard ownsDelivery(expectedRevision, enabled: false) else { return false }
      for host in snapshot.hosts where host.scopes.contains("session:operate") {
        guard ownsDelivery(expectedRevision, enabled: false) else { return false }
        guard let token = try await catalog.token(for: host.connectionId), !token.isEmpty else {
          continue
        }
        guard ownsDelivery(expectedRevision, enabled: false) else { return false }
        let route = PushRegistrationRoute(
          clientConnectionId: host.connectionId,
          desktopId: host.desktopId
        )
        let parentAuthority = await removalPolicy.captureParentAuthority(for: host)
        guard
          await enqueueUnregister(
            endpoint: host.httpBaseURL,
            accessToken: token,
            deviceId: secrets.deviceId,
            route: route,
            parentConnectionId: host.environment?.parentConnectionId,
            parentAuthority: parentAuthority
          ) != nil
        else { return false }
        guard ownsDelivery(expectedRevision, enabled: false) else { return false }
        try? await stateStore.removeHost(host.connectionId)
      }
      return true
    } catch PushStorageError.incompatible {
      await disableForPreservedState()
      return false
    } catch {
      // Exact unregister entries already enqueued remain available for the
      // next foreground retry. Never replace them with a reconstructed route.
      return true
    }
  }

  private func enqueueUnregister(
    endpoint: String,
    accessToken: String,
    deviceId: String,
    route: PushRegistrationRoute,
    parentConnectionId: ClientConnectionID?,
    parentAuthority: PushUnregisterParentAuthority?
  ) async -> PushUnregisterOutbox.Entry? {
    do {
      return try await outbox.enqueue(
        endpoint: endpoint,
        accessToken: accessToken,
        deviceId: deviceId,
        route: route,
        parentConnectionId: parentConnectionId,
        parentAuthority: parentAuthority
      )
    } catch {
      await disableForPreservedState()
      return nil
    }
  }

  /// A disable can overtake an in-flight register request at the network
  /// boundary. Once that stale request returns, unregister its exact route
  /// again. If delivery was re-enabled in the meantime, reconcile only after
  /// the stale unregister has drained so the final remote state is registered.
  private func cleanUpStaleRegistration(
    record: HostRecord,
    accessToken: String,
    deviceId: String,
    route: PushRegistrationRoute
  ) async {
    guard
      let entry = await enqueueUnregister(
        endpoint: record.httpBaseURL,
        accessToken: accessToken,
        deviceId: deviceId,
        route: route,
        parentConnectionId: record.environment?.parentConnectionId,
        parentAuthority: await removalPolicy.captureParentAuthority(for: record)
      )
    else { return }
    try? await stateStore.removeHost(record.connectionId)
    await attemptUnregister(entry)
    if deliveryEnabled, isForeground {
      await reconcileNow()
    }
  }

  /// Parent authority for one unregister dispatch.
  ///
  /// A parent that still exists locally is the freshest grant and wins. When it
  /// is gone — or its locally unreadable slot would fail closed — the bounded
  /// snapshot captured before the removal cascade is used, so cleanup still
  /// authenticates after both records are deleted. A direct route resolves to
  /// nil and sends no parent header.
  ///
  /// A route with no environment tuple still fails closed when its endpoint has
  /// the proxy shape (a legacy/corrupt entry, or a captured authority that lost
  /// its route reference): the child grant must never reach the parent proxy
  /// bare, and a fail-closed context sends no request at all.
  private func environmentContext(
    for entry: PushUnregisterOutbox.Entry
  ) async -> RemoteEnvironmentContext? {
    guard let parentConnectionId = entry.parentConnectionId else {
      let isProxyShaped = entry.parentAuthority != nil
        || EnvironmentEndpoints.isProxyEndpoint(entry.endpoint)
      return isProxyShaped ? .parentMissing(environmentId: "") : nil
    }
    let live = await catalog.parentHeaderContext(parentConnectionId: parentConnectionId)
    if let live, let token = await live.parentAuthorizationToken(), !token.isEmpty {
      return live
    }
    if let authority = entry.validatedParentAuthority {
      let token = authority.accessToken
      return RemoteEnvironmentContext(
        environmentId: "",
        expectedChildDesktopId: nil,
        parentAuthorizationToken: { token },
        mintParentWebSocketTicket: { throw EnvironmentTransportError.parentTicketMissing() }
      )
    }
    // No usable authority: a fail-closed context (no dial, no header) rather
    // than a bare child dispatch the proxy could misread.
    return live ?? .parentMissing(environmentId: "")
  }

  private func attemptUnregister(_ entry: PushUnregisterOutbox.Entry) async {
    let environment = await environmentContext(for: entry)
    let api = makeAPI(entry.endpoint, entry.accessToken, environment)
    do {
      try await api.unregisterPush(
        PushUnregisterRequest(deviceId: entry.deviceId, routing: entry.route)
      )
      try? await outbox.remove(entry.id)
    } catch let error as RemoteClientError where error.isUnauthorized {
      // Environment custody is never concluded by a 401/403: the protocol has
      // no trusted child-origin marker, so a markerless refusal may be the
      // parent, a local fail-closed resolution, or a CORS/host response. Only
      // a direct-host route keeps the existing genuine-auth-failure
      // retirement.
      guard PushUnregisterRemovalPolicy.retiresOnAuthRefusal(entry) else { return }
      try? await outbox.remove(entry.id)
    } catch {
      // Keep exact endpoint/token/device/route for bounded foreground retries.
    }
  }

  private func scheduleReconcile() {
    reconcileTask?.cancel()
    reconcileTask = Task { [weak self] in
      await self?.reconcileNow()
    }
  }

  private func markReady() async {
    await MainActor.run { PushClientStatus.shared.set(.ready) }
  }

  private func ownsDelivery(_ revision: UInt64, enabled: Bool) -> Bool {
    deliveryRevision == revision && deliveryEnabled == enabled
  }

  private func markDisabledByUser() async {
    await MainActor.run { PushClientStatus.shared.set(.disabledByUser) }
  }

  private func disableForPreservedState() async {
    await MainActor.run { PushClientStatus.shared.set(.disabledForPreservedState) }
  }
}
