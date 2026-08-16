import Foundation
import Observation

extension AppSession {
  /// Exact selected-host access for Browser Mirror. The registry/profile match prevents an
  /// in-progress host switch from exposing the previous host's access, and the resolved
  /// desktop identity is carried so credential resolution can be rechecked against it.
  var currentBrowserMirrorAccess: BrowserMirrorHostAccess? {
    guard
      let connectionID = state.selectedConnectionId,
      let record = state.hosts.first(where: { $0.connectionId == connectionID }),
      let profile = state.profile,
      profile.desktopId == record.desktopId,
      profile.httpBaseURL == record.httpBaseURL,
      profile.protocolVersion == record.protocolVersion
    else { return nil }

    let profileCapabilities = Set(
      profile.scopes.compactMap(BrowserMirrorCapability.init(rawValue:))
    )
    let registryCapabilities = Set(
      record.scopes.compactMap(BrowserMirrorCapability.init(rawValue:))
    )
    let isOnline =
      state.api != nil
      && !state.liveLifecycle.isInBackground
      && state.phase != .needsPairing
      && state.phase != .sessionExpired
      && state.phase != .protocolIncompatible
      && state.phase != .localStoreInconsistent

    return BrowserMirrorHostAccess(
      lease: BrowserMirrorHostLease(
        connectionID: BrowserMirrorConnectionID(connectionID),
        connectionGeneration: UInt64(max(0, state.workGeneration))
      ),
      protocolVersion: profile.protocolVersion,
      isOnline: isOnline,
      isReady: isOnline && state.phase == .ready,
      isForeground: !state.liveLifecycle.isInBackground,
      capabilities: profileCapabilities.intersection(registryCapabilities),
      expectedDesktopID: record.desktopId
    )
  }

  func makeBrowserMirrorComposition() -> BrowserMirrorComposition {
    BrowserMirrorComposition(
      credentials: deps.hostCatalog,
      accessProvider: { @MainActor [weak self] in self?.currentBrowserMirrorAccess },
      socketProvider: { @MainActor [weak self] in self?.state.webSocket }
    )
  }
}

/// Synchronous foreground gate. Flipping it closes every transport path for the feature
/// before the asynchronous teardown runs, so no send can be enqueued after backgrounding.
@MainActor
final class BrowserMirrorForegroundGate {
  var isForeground = true
}

/// Owns the Browser Mirror controller for one presentation, binds it to the shared session
/// socket, and invalidates all feature-owned work when the presentation goes away.
@MainActor
@Observable
final class BrowserMirrorComposition {
  let controller: BrowserMirrorController

  private let gate: BrowserMirrorForegroundGate
  private let rawSocket: BrowserMirrorSessionSocket
  private let socketProvider: @MainActor () -> (any SessionLiveSocket)?
  private var sink: BrowserMirrorControllerSink?
  private var boundGeneration: UInt64?
  private var boundLease: BrowserMirrorHostLease?

  init(
    credentials: any BrowserMirrorCredentialRepository,
    accessProvider: @escaping @MainActor @Sendable () -> BrowserMirrorHostAccess?,
    socketProvider: @escaping @MainActor @Sendable () -> (any SessionLiveSocket)?
  ) {
    let gate = BrowserMirrorForegroundGate()
    self.gate = gate
    let gated: @MainActor @Sendable () -> BrowserMirrorHostAccess? = {
      guard let access = accessProvider() else { return nil }
      guard gate.isForeground else {
        return BrowserMirrorHostAccess(
          lease: access.lease,
          protocolVersion: access.protocolVersion,
          isOnline: access.isOnline,
          isReady: access.isReady,
          isForeground: false,
          capabilities: access.capabilities,
          expectedDesktopID: access.expectedDesktopID
        )
      }
      return access
    }
    let socket = BrowserMirrorSessionSocket(
      socketProvider: socketProvider,
      leaseProvider: { gated()?.lease }
    )
    rawSocket = socket
    self.socketProvider = socketProvider
    controller = BrowserMirrorController(
      access: gated(),
      gateway: BrowserMirrorTransportFactory.makeGateway(
        credentials: credentials,
        accessProvider: gated
      ),
      socket: GeneratedBrowserMirrorSocketGateway(
        rawSocket: socket,
        accessProvider: gated
      )
    )
  }

  func activate() async {
    gate.isForeground = true
    let value = BrowserMirrorControllerSink(controller: controller)
    sink = value
    await socketProvider()?.attachBrowserMirrorSink(value)
    await controller.beginWatching()
    await synchronizeSocket()
  }

  /// Invalidates all feature-owned work: the sink is detached, the watch is released, and
  /// frame bytes are dropped. A later activation starts from a fresh authoritative read.
  func deactivate() async {
    sink = nil
    boundGeneration = nil
    boundLease = nil
    await socketProvider()?.attachBrowserMirrorSink(nil)
    await controller.endWatching()
  }

  func suspend() {
    gate.isForeground = false
    boundGeneration = nil
    boundLease = nil
    controller.suspendForBackground()
  }

  func resume() async {
    gate.isForeground = true
    await controller.resumeFromForeground()
    await synchronizeSocket()
  }

  func synchronizeAccess(_ access: BrowserMirrorHostAccess?) async {
    if access?.lease != boundLease {
      boundGeneration = nil
      boundLease = nil
    }
    await controller.updateAccess(access)
    await synchronizeSocket()
  }

  /// Re-establishes the watch on the live socket generation. Repeat calls for a generation
  /// already bound are ignored, so the intent stays idempotent across reconnects.
  func synchronizeSocket() async {
    guard controller.watchIntent, let lease = controller.currentLease,
      let generation = await rawSocket.currentSocketGeneration(lease: lease),
      controller.currentLease == lease
    else { return }
    guard boundGeneration != generation || boundLease != lease else { return }
    if let previous = boundGeneration, let previousLease = boundLease {
      controller.socketClosed(lease: previousLease, socketGeneration: previous)
    }
    boundGeneration = generation
    boundLease = lease
    await controller.socketReady(lease: lease, socketGeneration: generation)
  }

  func socketDisconnected() {
    guard let lease = boundLease, let generation = boundGeneration else { return }
    boundGeneration = nil
    boundLease = nil
    controller.socketClosed(lease: lease, socketGeneration: generation)
  }
}
