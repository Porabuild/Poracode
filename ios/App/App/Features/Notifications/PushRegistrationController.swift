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
  typealias APIFactory = @Sendable (String, String) -> any PushRemoteAPI

  static let shared = PushRegistrationController()

  private let catalog: HostCatalog
  private let vault: PushTokenVault
  private let stateStore: PushClientStateStore
  private let outbox: PushUnregisterOutbox
  private let makeAPI: APIFactory
  private let appVersion: @Sendable () -> String
  private var deliveryEnabled: Bool
  private var alertPreferences: PushAlertPreferences
  private var deliveryRevision: UInt64 = 0
  private var isForeground = false
  private var reconcileTask: Task<Void, Never>?

  init(
    catalog: HostCatalog = .shared,
    vault: PushTokenVault = .shared,
    stateStore: PushClientStateStore = .shared,
    outbox: PushUnregisterOutbox = .shared,
    makeAPI: @escaping APIFactory = { endpoint, token in
      RemoteAPIClient(endpoint: endpoint, accessToken: token)
    },
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

  func prepareRemoval(record: HostRecord, accessToken: String) async {
    let route = PushRegistrationRoute(
      clientConnectionId: record.connectionId,
      desktopId: record.desktopId
    )
    guard let secrets = try? await vault.snapshotCreatingIfNeeded() else { return }
    guard
      let entry = await enqueueUnregister(
        endpoint: record.httpBaseURL,
        accessToken: accessToken,
        deviceId: secrets.deviceId,
        route: route
      )
    else { return }
    Task { [weak self] in
      await self?.attemptUnregister(entry)
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
    let api = makeAPI(host.httpBaseURL, accessToken)
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
          endpoint: host.httpBaseURL,
          accessToken: accessToken,
          deviceId: secrets.deviceId,
          route: route,
          connectionId: host.connectionId
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
        guard
          await enqueueUnregister(
            endpoint: host.httpBaseURL,
            accessToken: token,
            deviceId: secrets.deviceId,
            route: route
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
    route: PushRegistrationRoute
  ) async -> PushUnregisterOutbox.Entry? {
    do {
      return try await outbox.enqueue(
        endpoint: endpoint,
        accessToken: accessToken,
        deviceId: deviceId,
        route: route
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
    endpoint: String,
    accessToken: String,
    deviceId: String,
    route: PushRegistrationRoute,
    connectionId: ClientConnectionID
  ) async {
    guard
      let entry = await enqueueUnregister(
        endpoint: endpoint,
        accessToken: accessToken,
        deviceId: deviceId,
        route: route
      )
    else { return }
    try? await stateStore.removeHost(connectionId)
    await attemptUnregister(entry)
    if deliveryEnabled, isForeground {
      await reconcileNow()
    }
  }

  private func attemptUnregister(_ entry: PushUnregisterOutbox.Entry) async {
    let api = makeAPI(entry.endpoint, entry.accessToken)
    do {
      try await api.unregisterPush(
        PushUnregisterRequest(deviceId: entry.deviceId, routing: entry.route)
      )
      try? await outbox.remove(entry.id)
    } catch let error as RemoteClientError where error.isUnauthorized {
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
