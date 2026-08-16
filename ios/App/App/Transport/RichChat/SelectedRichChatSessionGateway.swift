import Foundation

struct RichChatTransportSelection: Sendable {
  let access: RichChatSessionAccess
  let api: any RichChatRemoteAPI
  let terminalSocket: (any RichChatTerminalSocketSending)?

  init(
    access: RichChatSessionAccess,
    api: any RichChatRemoteAPI,
    terminalSocket: (any RichChatTerminalSocketSending)? = nil
  ) {
    self.access = access
    self.api = api
    self.terminalSocket = terminalSocket
  }
}

/// Owns selected-host and work-generation checks around every rich-chat operation.
actor SelectedRichChatSessionGateway {
  typealias SelectionProvider = @MainActor @Sendable () -> RichChatTransportSelection?

  private let selectionProvider: SelectionProvider

  init(selectionProvider: @escaping SelectionProvider) {
    self.selectionProvider = selectionProvider
  }

  func executeRead<Value: Sendable>(
    target: RichChatThreadTarget,
    capability: RichChatCapability,
    operation: @escaping @Sendable (any RichChatRemoteAPI) async throws -> Value
  ) async throws -> Value {
    try await execute(target: target, capability: capability, operation: operation)
  }

  func executeMutation<Value: Sendable>(
    target: RichChatThreadTarget,
    capability: RichChatCapability,
    operation: @escaping @Sendable (any RichChatRemoteAPI) async throws -> Value
  ) async throws -> Value {
    try await execute(target: target, capability: capability, operation: operation)
  }

  func executeSocket(
    target: RichChatThreadTarget,
    capability: RichChatCapability,
    message: Data
  ) async throws {
    try Task.checkCancellation()
    let selection = try await currentSelection(target: target, capability: capability)
    guard let socket = selection.terminalSocket else {
      throw RichChatGatewayError.unavailable
    }
    do {
      try await socket.sendRichChatTerminalMessage(message, owner: target)
      try Task.checkCancellation()
      try await requireCurrent(target.lease)
    } catch is CancellationError {
      throw CancellationError()
    } catch let error as RichChatGatewayError {
      throw error
    } catch let error as RemoteClientError {
      throw Self.normalize(error, requiredScope: capability.rawValue)
    } catch {
      throw RichChatGatewayError.transport
    }
  }

  func terminalEvents(
    target: RichChatThreadTarget,
    capability: RichChatCapability
  ) async throws -> AsyncStream<RichChatTerminalTransportEvent> {
    let selection = try await currentSelection(target: target, capability: capability)
    guard let socket = selection.terminalSocket else { throw RichChatGatewayError.unavailable }
    return await socket.richChatTerminalEvents(owner: target)
  }

  func stopTerminalSocket(target: RichChatThreadTarget) async {
    guard let selection = await selectionProvider(), selection.access.lease == target.lease,
      let socket = selection.terminalSocket
    else { return }
    await socket.stopRichChatTerminalSocket(owner: target)
  }

  private func execute<Value: Sendable>(
    target: RichChatThreadTarget,
    capability: RichChatCapability,
    operation: @escaping @Sendable (any RichChatRemoteAPI) async throws -> Value
  ) async throws -> Value {
    try Task.checkCancellation()
    let selection = try await currentSelection(target: target, capability: capability)
    do {
      let value = try await operation(selection.api)
      try Task.checkCancellation()
      try await requireCurrent(target.lease)
      return value
    } catch is CancellationError {
      throw CancellationError()
    } catch let failure as RichChatTransportFailure {
      throw Self.normalize(failure)
    } catch let error as RemoteClientError {
      throw Self.normalize(error, requiredScope: capability.rawValue)
    } catch let error as RichChatGatewayError {
      throw error
    } catch {
      throw RichChatGatewayError.transport
    }
  }

  private func currentSelection(
    target: RichChatThreadTarget,
    capability: RichChatCapability
  ) async throws -> RichChatTransportSelection {
    guard !target.threadID.isEmpty else { throw RichChatGatewayError.invalidRequest }
    guard let selection = await selectionProvider(), selection.access.lease == target.lease else {
      throw CancellationError()
    }
    guard selection.access.isOnline, selection.access.isReady else {
      throw RichChatGatewayError.unavailable
    }
    guard selection.access.capabilities.contains(capability) else {
      throw RichChatGatewayError.http(
        statusCode: 403,
        code: "missing_scope",
        missingScope: capability.rawValue
      )
    }
    return selection
  }

  private func requireCurrent(_ lease: RichChatHostLease) async throws {
    guard let current = await selectionProvider(), current.access.lease == lease,
      current.access.isOnline, current.access.isReady
    else { throw CancellationError() }
  }

  private static func normalize(_ failure: RichChatTransportFailure) -> RichChatGatewayError {
    switch failure {
    case .invalidRequest: .invalidRequest
    case .invalidResponse: .invalidResponse
    case .rawTransportUnavailable: .rawTransportUnavailable
    case .ambiguousOutcome: .ambiguousOutcome
    }
  }

  private static func normalize(
    _ error: RemoteClientError,
    requiredScope: String
  ) -> RichChatGatewayError {
    if error.code == "invalid_response" { return .invalidResponse }
    guard error.status > 0 else { return .transport }
    let code = sanitizedCode(error.code)
    let missingScope = error.status == 403 && code == "missing_scope" ? requiredScope : nil
    return .http(statusCode: error.status, code: code, missingScope: missingScope)
  }

  private static func sanitizedCode(_ value: String) -> String? {
    guard !value.isEmpty, value.utf8.count <= 64 else { return nil }
    let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789_-")
    guard value.unicodeScalars.allSatisfy(allowed.contains) else { return nil }
    return value
  }
}
