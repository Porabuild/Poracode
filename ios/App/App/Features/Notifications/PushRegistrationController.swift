import Foundation
import Observation

@MainActor
@Observable
final class PushClientStatus {
  enum State: Equatable {
    case idle
    case ready
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
    }
  ) {
    self.catalog = catalog
    self.vault = vault
    self.stateStore = stateStore
    self.outbox = outbox
    self.makeAPI = makeAPI
    self.appVersion = appVersion
  }

  func setForeground(_ foreground: Bool) async {
    isForeground = foreground
    if foreground { await reconcileNow() }
  }

  func receiveAPNSToken(_ token: Data) async {
    do {
      try await vault.storeAPNSToken(token.lowercaseHexString)
      if isForeground { scheduleReconcile() }
    } catch {
      await disableForPreservedState()
    }
  }

  func receivePushToStartToken(_ token: Data) async {
    do {
      try await vault.storePushToStartToken(token.lowercaseHexString)
      if isForeground { scheduleReconcile() }
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
      if isForeground { scheduleReconcile() }
    } catch {
      await disableForPreservedState()
    }
  }

  func removeActivity(_ activityId: String) async {
    try? await vault.removeActivity(activityId)
  }

  func reconcileNow() async {
    guard isForeground else { return }
    do {
      let vaultLoad = try await vault.load()
      let stateLoad = try await stateStore.load()
      let outboxLoad = try await outbox.load()
      guard vaultLoad.isUsable, stateLoad.isUsable, outboxLoad.isUsable else {
        await disableForPreservedState()
        return
      }
      await retryUnregisterOutbox()
      let secrets = try await vault.snapshotCreatingIfNeeded()
      guard let deviceToken = secrets.apnsToken else {
        await markReady()
        return
      }
      let snapshot = try await catalog.snapshot()
      for host in snapshot.hosts where host.scopes.contains("session:operate") {
        guard isForeground else { return }
        await reconcile(host: host, secrets: secrets, deviceToken: deviceToken)
      }
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
    let entry: PushUnregisterOutbox.Entry
    do {
      entry = try await outbox.enqueue(
        endpoint: record.httpBaseURL,
        accessToken: accessToken,
        deviceId: secrets.deviceId,
        route: route
      )
    } catch {
      await disableForPreservedState()
      return
    }
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
    deviceToken: String
  ) async {
    let storedToken: String?
    do {
      storedToken = try await catalog.token(for: host.connectionId)
    } catch {
      return
    }
    guard let accessToken = storedToken, !accessToken.isEmpty else { return }
    let api = makeAPI(host.httpBaseURL, accessToken)
    let environment: RemoteEnvironmentDescriptor
    do {
      environment = try await api.environment()
    } catch {
      return
    }
    let versions = environment.capabilities?.pushRouting?.versions ?? []
    do {
      try await stateStore.updateHost(host.connectionId) {
        $0.capabilityVersions = versions
      }
    } catch {
      await disableForPreservedState()
      return
    }
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
      activityTokens: routedDeltas.isEmpty ? nil : routedDeltas
    )
    do {
      let response = try await api.registerPush(request)
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
    } catch {
      return
    }
  }

  private func retryUnregisterOutbox() async {
    guard let entries = try? await outbox.pending() else {
      await disableForPreservedState()
      return
    }
    for entry in entries {
      guard isForeground else { return }
      await attemptUnregister(entry)
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

  private func disableForPreservedState() async {
    await MainActor.run { PushClientStatus.shared.set(.disabledForPreservedState) }
  }
}
