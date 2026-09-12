import Foundation

/// Production raw socket for Browser Mirror.
///
/// It never opens a connection of its own: watch, unwatch, and input ride the shared
/// event-stream socket owned by the session, and every send is bound to the exact host
/// lease and socket generation the caller captured. `stop` deliberately does nothing to
/// the shared connection — only the multiplexer sink is detached, by the composition.
@MainActor
final class BrowserMirrorSessionSocket: BrowserMirrorRawSocket {
  typealias SocketProvider = @MainActor () -> (any SessionLiveSocket)?
  typealias LeaseProvider = @MainActor () -> BrowserMirrorHostLease?

  private let socketProvider: SocketProvider
  private let leaseProvider: LeaseProvider

  init(
    socketProvider: @escaping SocketProvider,
    leaseProvider: @escaping LeaseProvider
  ) {
    self.socketProvider = socketProvider
    self.leaseProvider = leaseProvider
  }

  // The protocol requirements below are nonisolated witnesses, so each one hops to the
  // main actor helper that owns the selection and the shared socket reference.

  func start(lease: BrowserMirrorHostLease) async throws {
    try await verifyLive(lease: lease)
  }

  func send(
    _ message: Data,
    lease: BrowserMirrorHostLease,
    socketGeneration: UInt64
  ) async throws {
    try await deliver(message, lease: lease, socketGeneration: socketGeneration)
  }

  func stop(lease _: BrowserMirrorHostLease) async {
    // The event-stream socket is session-owned and shared; the feature never closes it.
  }

  @MainActor
  private func verifyLive(lease: BrowserMirrorHostLease) throws {
    guard leaseProvider() == lease, socketProvider() != nil else {
      throw CancellationError()
    }
  }

  @MainActor
  private func deliver(
    _ message: Data,
    lease: BrowserMirrorHostLease,
    socketGeneration: UInt64
  ) async throws {
    guard leaseProvider() == lease, let socket = socketProvider() else {
      throw CancellationError()
    }
    try await socket.sendBrowserMirrorMessage(message, socketGeneration: socketGeneration)
    guard leaseProvider() == lease else { throw CancellationError() }
  }

  func currentSocketGeneration(lease: BrowserMirrorHostLease) async -> UInt64? {
    guard leaseProvider() == lease, let socket = socketProvider() else { return nil }
    let generation = await socket.browserMirrorSocketGeneration()
    guard leaseProvider() == lease else { return nil }
    return generation
  }
}

/// Delivers out-of-band browser frames from the shared socket to the controller.
/// The controller re-checks host, socket generation, and subscription state itself, so a
/// frame from a superseded connection or a switched host is dropped without being applied.
final class BrowserMirrorControllerSink: BrowserMirrorSocketInboundSink {
  private let controller: BrowserMirrorController

  init(controller: BrowserMirrorController) {
    self.controller = controller
  }

  func receiveBrowserMirrorMessage(_ data: Data, socketGeneration: UInt64) async {
    guard let lease = await controller.currentLease else { return }
    await controller.receive(
      data: data,
      lease: lease,
      socketGeneration: socketGeneration
    )
  }
}
