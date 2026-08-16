import Foundation

protocol RemoteIntegrationsGateway: Sendable {
  func hostUpdate(
    lease: RemoteIntegrationsHostLease
  ) async throws -> RemoteIntegrationsHostUpdateState
  func checkHostUpdate(
    lease: RemoteIntegrationsHostLease
  ) async throws -> RemoteIntegrationsHostUpdateState
  func installHostUpdate(lease: RemoteIntegrationsHostLease) async throws
  func schedules(
    lease: RemoteIntegrationsHostLease
  ) async throws -> RemoteIntegrationsSchedulesResponse
  func scheduleCommand(
    _ command: RemoteIntegrationsScheduleCommand,
    lease: RemoteIntegrationsHostLease
  ) async throws -> RemoteIntegrationsSchedulesResponse
  func prWatch(
    _ key: RemoteIntegrationsPRWatchKey,
    lease: RemoteIntegrationsHostLease
  ) async throws -> RemoteIntegrationsPRWatchResponse
  func checkPRWatch(
    _ key: RemoteIntegrationsPRWatchKey,
    lease: RemoteIntegrationsHostLease
  ) async throws
  func upsertPRWatch(
    _ input: RemoteIntegrationsPRWatchInput,
    lease: RemoteIntegrationsHostLease
  ) async throws -> RemoteIntegrationsPRWatch
  func deletePRWatch(
    _ key: RemoteIntegrationsPRWatchKey,
    lease: RemoteIntegrationsHostLease
  ) async throws
}

actor SelectedRemoteIntegrationsGateway: RemoteIntegrationsGateway {
  typealias SelectionProvider =
    @Sendable (RemoteIntegrationsHostLease) async throws
    -> RemoteIntegrationsTransportSelection?

  private let selectionProvider: SelectionProvider

  init(selectionProvider: @escaping SelectionProvider) {
    self.selectionProvider = selectionProvider
  }

  init(source: RemoteIntegrationsExactHostTransportSource) {
    selectionProvider = { lease in try await source.selection(for: lease) }
  }

  func hostUpdate(
    lease: RemoteIntegrationsHostLease
  ) async throws -> RemoteIntegrationsHostUpdateState {
    try await execute(lease: lease, scope: .projectsManage) {
      try await $0.remoteIntegrationsHostUpdate()
    }
  }

  func checkHostUpdate(
    lease: RemoteIntegrationsHostLease
  ) async throws -> RemoteIntegrationsHostUpdateState {
    try await execute(lease: lease, scope: .projectsManage) {
      try await $0.remoteIntegrationsCheckHostUpdate()
    }
  }

  func installHostUpdate(lease: RemoteIntegrationsHostLease) async throws {
    try await execute(lease: lease, scope: .projectsManage) {
      try await $0.remoteIntegrationsInstallHostUpdate()
    }
  }

  func schedules(
    lease: RemoteIntegrationsHostLease
  ) async throws -> RemoteIntegrationsSchedulesResponse {
    try await execute(lease: lease, scope: .sessionRead) {
      try await $0.remoteIntegrationsSchedules()
    }
  }

  func scheduleCommand(
    _ command: RemoteIntegrationsScheduleCommand,
    lease: RemoteIntegrationsHostLease
  ) async throws -> RemoteIntegrationsSchedulesResponse {
    try await execute(lease: lease, scope: .sessionOperate) {
      try await $0.remoteIntegrationsScheduleCommand(command)
    }
  }

  func prWatch(
    _ key: RemoteIntegrationsPRWatchKey,
    lease: RemoteIntegrationsHostLease
  ) async throws -> RemoteIntegrationsPRWatchResponse {
    try await execute(lease: lease, scope: .sessionRead) {
      try await $0.remoteIntegrationsPRWatch(key)
    }
  }

  func checkPRWatch(
    _ key: RemoteIntegrationsPRWatchKey,
    lease: RemoteIntegrationsHostLease
  ) async throws {
    try await execute(lease: lease, scope: .sessionOperate) {
      try await $0.remoteIntegrationsCheckPRWatch(key)
    }
  }

  func upsertPRWatch(
    _ input: RemoteIntegrationsPRWatchInput,
    lease: RemoteIntegrationsHostLease
  ) async throws -> RemoteIntegrationsPRWatch {
    try await execute(lease: lease, scope: .sessionOperate) {
      try await $0.remoteIntegrationsUpsertPRWatch(input)
    }
  }

  func deletePRWatch(
    _ key: RemoteIntegrationsPRWatchKey,
    lease: RemoteIntegrationsHostLease
  ) async throws {
    try await execute(lease: lease, scope: .sessionOperate) {
      try await $0.remoteIntegrationsDeletePRWatch(key)
    }
  }

  private func execute<Value: Sendable>(
    lease: RemoteIntegrationsHostLease,
    scope: RemoteIntegrationsCapability,
    operation: @escaping @Sendable (any RemoteIntegrationsRemoteAPI) async throws -> Value
  ) async throws -> Value {
    do {
      try Task.checkCancellation()
      guard let selection = try await selectionProvider(lease) else {
        throw RemoteIntegrationsGatewayError.transport
      }
      guard selection.access.lease == lease else { throw CancellationError() }
      if let failure = selection.access.gate(scope) {
        throw Self.error(for: failure, requiredScope: scope.rawValue)
      }
      let value = try await operation(selection.api)
      try Task.checkCancellation()
      guard try await selectionProvider(lease)?.access.lease == lease else {
        throw CancellationError()
      }
      return value
    } catch is CancellationError {
      throw CancellationError()
    } catch RemoteIntegrationsRemoteMutationError.ambiguousOutcome {
      throw RemoteIntegrationsGatewayError.ambiguousOutcome
    } catch let error as RemoteClientError {
      throw Self.normalize(error, requiredScope: scope.rawValue)
    } catch let error as RemoteIntegrationsGatewayError {
      throw error
    } catch {
      throw RemoteIntegrationsGatewayError.transport
    }
  }

  private static func error(
    for failure: RemoteIntegrationsFailure,
    requiredScope: String
  ) -> RemoteIntegrationsGatewayError {
    switch failure {
    case .protocolIncompatible: return .protocolIncompatible
    case .capabilityMissing:
      return .http(statusCode: 403, code: "missing_scope", missingScope: requiredScope)
    case .authenticationExpired:
      return .http(statusCode: 401, code: "invalid_access_token", missingScope: nil)
    case .authorizationDenied:
      return .http(statusCode: 403, code: "forbidden", missingScope: nil)
    case .ambiguousOutcome: return .ambiguousOutcome
    case .invalidResponse: return .invalidResponse
    default: return .transport
    }
  }

  private static func normalize(
    _ error: RemoteClientError,
    requiredScope: String
  ) -> RemoteIntegrationsGatewayError {
    if error.code == "protocol_version_mismatch" { return .protocolIncompatible }
    if error.code == "invalid_response" { return .invalidResponse }
    guard error.status > 0 else { return .transport }
    let code = sanitizedCode(error.code)
    let missing = error.status == 403 && code == "missing_scope" ? requiredScope : nil
    return .http(statusCode: error.status, code: code, missingScope: missing)
  }

  private static func sanitizedCode(_ value: String) -> String? {
    guard !value.isEmpty, value.utf8.count <= 64 else { return nil }
    let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789_-")
    return value.unicodeScalars.allSatisfy(allowed.contains) ? value : nil
  }
}
