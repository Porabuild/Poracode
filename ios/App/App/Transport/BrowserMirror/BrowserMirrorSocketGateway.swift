import Foundation

struct BrowserMirrorSocketKey: Equatable, Hashable, Sendable {
  let lease: BrowserMirrorHostLease
  let socketGeneration: UInt64
}

protocol BrowserMirrorRawSocket: Sendable {
  func start(lease: BrowserMirrorHostLease) async throws
  func send(
    _ message: Data,
    lease: BrowserMirrorHostLease,
    socketGeneration: UInt64
  ) async throws
  func stop(lease: BrowserMirrorHostLease) async
}

protocol BrowserMirrorSocketGateway: Sendable {
  func start(lease: BrowserMirrorHostLease) async throws
  func watch(key: BrowserMirrorSocketKey) async throws
  func unwatch(key: BrowserMirrorSocketKey) async
  func input(_ input: BrowserMirrorInput, key: BrowserMirrorSocketKey) async throws
  func stop(lease: BrowserMirrorHostLease) async
  func event(
    from data: Data,
    key: BrowserMirrorSocketKey
  ) async throws -> BrowserMirrorSocketEvent
}

actor GeneratedBrowserMirrorSocketGateway: BrowserMirrorSocketGateway {
  typealias AccessProvider = @MainActor @Sendable () -> BrowserMirrorHostAccess?

  private let rawSocket: any BrowserMirrorRawSocket
  private let accessProvider: AccessProvider

  init(
    rawSocket: any BrowserMirrorRawSocket,
    accessProvider: @escaping AccessProvider
  ) {
    self.rawSocket = rawSocket
    self.accessProvider = accessProvider
  }

  func start(lease: BrowserMirrorHostLease) async throws {
    try await validate(lease: lease, capability: .read)
    try await rawSocket.start(lease: lease)
    try await validate(lease: lease, capability: .read)
  }

  func watch(key: BrowserMirrorSocketKey) async throws {
    try await validate(lease: key.lease, capability: .read)
    let data = try BrowserMirrorRemoteV3Adapter.watchMessage()
    try await rawSocket.send(
      data,
      lease: key.lease,
      socketGeneration: key.socketGeneration
    )
    try await validate(lease: key.lease, capability: .read)
  }

  func unwatch(key: BrowserMirrorSocketKey) async {
    guard let data = try? BrowserMirrorRemoteV3Adapter.unwatchMessage() else { return }
    try? await rawSocket.send(
      data,
      lease: key.lease,
      socketGeneration: key.socketGeneration
    )
  }

  func input(_ input: BrowserMirrorInput, key: BrowserMirrorSocketKey) async throws {
    try await validate(lease: key.lease, capability: .operate)
    let data = try BrowserMirrorRemoteV3Adapter.inputMessage(input)
    try await rawSocket.send(
      data,
      lease: key.lease,
      socketGeneration: key.socketGeneration
    )
    try await validate(lease: key.lease, capability: .operate)
  }

  func stop(lease: BrowserMirrorHostLease) async {
    await rawSocket.stop(lease: lease)
  }

  func event(
    from data: Data,
    key: BrowserMirrorSocketKey
  ) async throws -> BrowserMirrorSocketEvent {
    try await validate(lease: key.lease, capability: .read)
    let value = try BrowserMirrorRemoteV3Adapter.serverEvent(data)
    try await validate(lease: key.lease, capability: .read)
    return value
  }

  private func validate(
    lease: BrowserMirrorHostLease,
    capability: BrowserMirrorCapability
  ) async throws {
    guard let access = await accessProvider() else { throw CancellationError() }
    try BrowserMirrorAccessPolicy.validate(
      access,
      lease: lease,
      capability: capability
    )
  }
}
