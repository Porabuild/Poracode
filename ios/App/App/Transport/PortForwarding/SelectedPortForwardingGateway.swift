import Foundation

struct PortForwardingTransportSelection: Sendable {
  let access: PortForwardingHostAccess
  let api: any PortForwardingRemoteAPI
}

actor SelectedPortForwardingGateway: PortForwardingGateway {
  typealias SelectionProvider = @MainActor @Sendable () -> PortForwardingTransportSelection?

  private let selectionProvider: SelectionProvider

  init(selectionProvider: @escaping SelectionProvider) {
    self.selectionProvider = selectionProvider
  }

  func scan(lease: PortForwardingHostLease) async throws -> PortForwardingSnapshot {
    try await execute(lease: lease) { try await $0.remoteScan() }
  }

  func start(port: Int, lease: PortForwardingHostLease) async throws -> PortForward {
    guard (1...65_535).contains(port) else { throw PortForwardingFailure.invalidRequest }
    return try await execute(lease: lease) { try await $0.remoteStart(port: port) }
  }

  func open(forwardID: String, lease: PortForwardingHostLease) async throws {
    guard !forwardID.isEmpty else { throw PortForwardingFailure.invalidRequest }
    try await execute(lease: lease) { try await $0.remoteOpen(forwardID: forwardID) }
  }

  func stop(forwardID: String, lease: PortForwardingHostLease) async throws {
    guard !forwardID.isEmpty else { throw PortForwardingFailure.invalidRequest }
    try await execute(lease: lease) { try await $0.remoteStop(forwardID: forwardID) }
  }

  private func execute<Value: Sendable>(
    lease: PortForwardingHostLease,
    operation: @escaping @Sendable (any PortForwardingRemoteAPI) async throws -> Value
  ) async throws -> Value {
    try Task.checkCancellation()
    let selection = try await current(lease)
    do {
      let value = try await operation(selection.api)
      try Task.checkCancellation()
      try await requireCurrent(lease)
      return value
    } catch is CancellationError {
      throw CancellationError()
    } catch let error as PortForwardingTransportError {
      try await requireCurrent(lease)
      throw Self.normalize(error)
    } catch let failure as PortForwardingFailure {
      throw failure
    } catch {
      try await requireCurrent(lease)
      throw PortForwardingFailure.transport
    }
  }

  private func current(_ lease: PortForwardingHostLease) async throws
    -> PortForwardingTransportSelection
  {
    guard let selection = await selectionProvider(), selection.access.lease == lease else {
      throw CancellationError()
    }
    try Self.gate(selection.access)
    return selection
  }

  private func requireCurrent(_ lease: PortForwardingHostLease) async throws {
    guard let selection = await selectionProvider(),
      selection.access.lease == lease,
      selection.access.protocolVersion == PortForwardingRemoteV3Contract.protocolVersion,
      selection.access.isOnline,
      selection.access.isReady,
      selection.access.isForeground,
      selection.access.capabilities.contains(.forward)
    else {
      throw CancellationError()
    }
  }

  private static func gate(_ access: PortForwardingHostAccess) throws {
    guard access.protocolVersion == PortForwardingRemoteV3Contract.protocolVersion else {
      throw PortForwardingFailure.protocolIncompatible
    }
    guard access.isOnline else { throw PortForwardingFailure.unavailable(.offline) }
    guard access.isReady else { throw PortForwardingFailure.unavailable(.notReady) }
    guard access.isForeground else { throw PortForwardingFailure.unavailable(.background) }
    guard access.capabilities.contains(.forward) else {
      throw PortForwardingFailure.missingScope
    }
  }

  private static func normalize(_ error: PortForwardingTransportError)
    -> PortForwardingFailure
  {
    switch error {
    case .invalidRequest: .invalidRequest
    case .invalidResponse: .invalidResponse
    case .transport: .transport
    case .ambiguousMutation: .ambiguousMutation
    case .unsafeEntry: .unsafeEntry
    case .browserUnavailable: .browserUnavailable
    case .rejected(let status, let code):
      if status == 401 {
        .authenticationExpired
      } else if status == 403, code == "missing_scope" {
        .missingScope
      } else if status == 403 {
        .authorizationDenied
      } else {
        .rejected(statusCode: status, code: sanitized(code))
      }
    }
  }

  private static func sanitized(_ value: String?) -> String? {
    guard let value, !value.isEmpty, value.utf8.count <= 64 else { return nil }
    let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789_-")
    return value.unicodeScalars.allSatisfy(allowed.contains) ? value : nil
  }
}
