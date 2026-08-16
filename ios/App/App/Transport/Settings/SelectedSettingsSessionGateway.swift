import Foundation

protocol SettingsSessionGateway: Sendable {
  func agentStatuses(lease: SettingsHostLease) async throws -> SettingsAgentStatuses
  func providerUsage(lease: SettingsHostLease) async throws -> SettingsProviderUsage
  func profileDevices(lease: SettingsHostLease) async throws -> SettingsProfileDevices
  func profileCoreStats(
    _ request: SettingsProfileStatsRequest,
    lease: SettingsHostLease
  ) async throws -> SettingsProfileCoreStats
  func profileTokenStats(
    _ request: SettingsProfileStatsRequest,
    lease: SettingsHostLease
  ) async throws -> SettingsProfileTokenStats
  func setProfileIdentity(
    _ identity: SettingsProfileIdentity,
    lease: SettingsHostLease
  ) async throws -> SettingsProfileIdentityResponse
  func readSettings(lease: SettingsHostLease) async throws -> SettingsReadResponse
  func writeSettings(
    _ patch: SettingsPatch,
    lease: SettingsHostLease
  ) async throws -> SettingsReadResponse
}

/// Owns scope, protocol, cancellation, and exact lease checks for Settings operations.
actor SelectedSettingsSessionGateway: SettingsSessionGateway {
  typealias SelectionProvider = @Sendable (SettingsHostLease) async throws
    -> SettingsTransportSelection?

  private let selectionProvider: SelectionProvider

  init(selectionProvider: @escaping SelectionProvider) {
    self.selectionProvider = selectionProvider
  }

  init(source: SettingsExactHostTransportSource) {
    self.selectionProvider = { lease in try await source.selection(for: lease) }
  }

  func agentStatuses(lease: SettingsHostLease) async throws -> SettingsAgentStatuses {
    try await execute(lease: lease, scope: .sessionRead) {
      try await $0.settingsAgentStatuses()
    }
  }

  func providerUsage(lease: SettingsHostLease) async throws -> SettingsProviderUsage {
    try await execute(lease: lease, scope: .sessionRead) {
      try await $0.settingsProviderUsage()
    }
  }

  func profileDevices(lease: SettingsHostLease) async throws -> SettingsProfileDevices {
    try await execute(lease: lease, scope: .sessionRead) {
      try await $0.settingsProfileDevices()
    }
  }

  func profileCoreStats(
    _ request: SettingsProfileStatsRequest,
    lease: SettingsHostLease
  ) async throws -> SettingsProfileCoreStats {
    try await execute(lease: lease, scope: .sessionRead) {
      try await $0.settingsProfileCoreStats(request)
    }
  }

  func profileTokenStats(
    _ request: SettingsProfileStatsRequest,
    lease: SettingsHostLease
  ) async throws -> SettingsProfileTokenStats {
    try await execute(lease: lease, scope: .sessionRead) {
      try await $0.settingsProfileTokenStats(request)
    }
  }

  func setProfileIdentity(
    _ identity: SettingsProfileIdentity,
    lease: SettingsHostLease
  ) async throws -> SettingsProfileIdentityResponse {
    try await execute(lease: lease, scope: .sessionOperate) {
      try await $0.settingsSetProfileIdentity(identity)
    }
  }

  func readSettings(lease: SettingsHostLease) async throws -> SettingsReadResponse {
    try await execute(lease: lease, scope: .sessionRead) { try await $0.settingsRead() }
  }

  func writeSettings(
    _ patch: SettingsPatch,
    lease: SettingsHostLease
  ) async throws -> SettingsReadResponse {
    try await execute(lease: lease, scope: .sessionOperate) {
      try await $0.settingsWrite(patch)
    }
  }

  private func execute<Value: Sendable>(
    lease: SettingsHostLease,
    scope: SettingsCapability,
    operation: @escaping @Sendable (any SettingsRemoteAPI) async throws -> Value
  ) async throws -> Value {
    do {
      try Task.checkCancellation()
      guard let selection = try await selectionProvider(lease) else {
        throw SettingsGatewayError.transport
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
    } catch SettingsRemoteMutationError.ambiguousOutcome {
      throw SettingsGatewayError.ambiguousOutcome
    } catch let error as RemoteClientError {
      throw Self.normalize(error, requiredScope: scope.rawValue)
    } catch let error as SettingsGatewayError {
      throw error
    } catch {
      throw SettingsGatewayError.transport
    }
  }

  private static func error(
    for failure: SettingsOperationFailure,
    requiredScope: String
  ) -> SettingsGatewayError {
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
  ) -> SettingsGatewayError {
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
