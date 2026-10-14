import Foundation

struct ThreadLifecycleTransportSelection: Sendable {
  let access: ThreadSessionAccess
  let api: any ThreadLifecycleRemoteAPI
}

actor SelectedThreadSessionGateway: ThreadLifecycleGateway {
  typealias SelectionProvider = @MainActor @Sendable () -> ThreadLifecycleTransportSelection?

  private static let requiredScope = "session:operate"
  private let selectionProvider: SelectionProvider

  init(selectionProvider: @escaping SelectionProvider) {
    self.selectionProvider = selectionProvider
  }

  func startExistingThread(
    target: ThreadLifecycleTarget,
    request: ThreadStartExistingRequest,
    commandID: String
  ) async throws -> String {
    guard request.threadID == target.threadID, !commandID.isEmpty else {
      throw ThreadLifecycleGatewayError.invalidRequest
    }
    return try await execute(target: target) { api in
      try await api.remoteStartExistingThread(request, commandID: commandID)
    }
  }

  func runThreadCommand(
    target: ThreadLifecycleTarget,
    command: ThreadRemoteCommand,
    commandID: String?
  ) async throws {
    guard command.permitsCommandID == (commandID != nil), commandID?.isEmpty != true else {
      throw ThreadLifecycleGatewayError.invalidRequest
    }
    try await execute(target: target) { api in
      try await api.remoteRunThreadCommand(
        threadID: target.threadID,
        command: command,
        commandID: commandID
      )
    }
  }

  private func execute<Value: Sendable>(
    target: ThreadLifecycleTarget,
    operation: @escaping @Sendable (any ThreadLifecycleRemoteAPI) async throws -> Value
  ) async throws -> Value {
    try Task.checkCancellation()
    let selection = try await currentSelection(target)
    do {
      let value = try await operation(selection.api)
      try Task.checkCancellation()
      try await requireCurrent(target.lease)
      return value
    } catch is CancellationError {
      throw CancellationError()
    } catch let error as ThreadLifecycleGatewayError {
      throw error
    } catch let error as ThreadLifecycleTransportError {
      try await requireCurrent(target.lease)
      throw Self.normalize(error)
    } catch {
      try await requireCurrent(target.lease)
      throw ThreadLifecycleGatewayError.transport
    }
  }

  private func currentSelection(
    _ target: ThreadLifecycleTarget
  ) async throws -> ThreadLifecycleTransportSelection {
    guard !target.threadID.isEmpty,
      !target.lease.identity.desktopID.isEmpty,
      !target.lease.identity.host.isEmpty
    else { throw ThreadLifecycleGatewayError.invalidRequest }
    guard let selection = await selectionProvider(), selection.access.lease == target.lease else {
      throw CancellationError()
    }
    if !selection.access.isOnline {
      throw ThreadLifecycleGatewayError.unavailable(.offline)
    }
    if !selection.access.isReady {
      throw ThreadLifecycleGatewayError.unavailable(.notReady)
    }
    if !selection.access.isForeground {
      throw ThreadLifecycleGatewayError.unavailable(.background)
    }
    guard selection.access.scopes.contains(Self.requiredScope) else {
      throw ThreadLifecycleGatewayError.http(
        statusCode: 403,
        code: "missing_scope",
        missingScope: Self.requiredScope
      )
    }
    return selection
  }

  private func requireCurrent(_ lease: ThreadHostLease) async throws {
    guard let current = await selectionProvider(),
      current.access.lease == lease,
      current.access.isOnline,
      current.access.isReady,
      current.access.isForeground,
      current.access.scopes.contains(Self.requiredScope)
    else {
      throw CancellationError()
    }
  }

  private static func normalize(
    _ error: ThreadLifecycleTransportError
  ) -> ThreadLifecycleGatewayError {
    switch error {
    case .invalidRequest:
      return .invalidRequest
    case .ambiguousOutcome:
      return .ambiguousOutcome
    case .http(let statusCode, let rawCode):
      let code = sanitizedCode(rawCode)
      let missingScope =
        statusCode == 403 && code == "missing_scope" ? requiredScope : nil
      return .http(statusCode: statusCode, code: code, missingScope: missingScope)
    }
  }

  private static func sanitizedCode(_ value: String) -> String? {
    guard !value.isEmpty, value.utf8.count <= 64 else { return nil }
    let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789_-")
    guard value.unicodeScalars.allSatisfy(allowed.contains) else { return nil }
    return value
  }
}
