import Foundation

protocol SettingsIntegrationsGateway: Sendable {
  func scanSkills(
    _ request: SettingsSkillScanRequest, context: SettingsIntegrationsContext
  ) async throws -> SettingsSkillScanResult
  func listMarketplace(
    _ request: SettingsSkillMarketplaceRequest, context: SettingsIntegrationsContext
  ) async throws -> SettingsSkillMarketplaceResult
  func setSkillEnabled(
    _ request: SettingsSetSkillEnabledRequest, context: SettingsIntegrationsContext
  ) async throws
  func deleteSkill(
    _ request: SettingsDeleteSkillRequest, context: SettingsIntegrationsContext
  ) async throws
  func importSkills(
    _ request: SettingsImportSkillsRequest, context: SettingsIntegrationsContext
  ) async throws -> SettingsImportSkillsResult
  func installMarketplaceSkill(
    _ request: SettingsInstallMarketplaceSkillRequest, context: SettingsIntegrationsContext
  ) async throws -> SettingsInstallMarketplaceSkillResult
  func discoverMCP(
    _ request: SettingsDiscoverMCPRequest, context: SettingsIntegrationsContext
  ) async throws -> SettingsDiscoverMCPResult
  func probeMCP(
    _ request: SettingsMCPServerRequest, context: SettingsIntegrationsContext
  ) async throws -> SettingsMCPProbeResult
  func oauthStatus(
    _ request: SettingsMCPOAuthOwnerRequest, context: SettingsIntegrationsContext
  ) async throws -> SettingsMCPOAuthStatusResult
  func beginOAuth(
    _ request: SettingsMCPServerRequest, context: SettingsIntegrationsContext
  ) async throws -> SettingsMCPOAuthBeginResult
  func waitOAuth(
    _ request: SettingsMCPOAuthWaitRequest, context: SettingsIntegrationsContext
  ) async throws -> SettingsMCPOAuthWaitResult
  func clearOAuth(
    _ request: SettingsMCPOAuthClearRequest, context: SettingsIntegrationsContext
  ) async throws
}

struct SettingsIntegrationsTransportSelection: Sendable {
  let access: SettingsIntegrationsAccess
  let api: any SettingsIntegrationsRemoteAPI
}

actor SelectedSettingsIntegrationsGateway: SettingsIntegrationsGateway {
  typealias SelectionProvider =
    @Sendable (SettingsIntegrationsContext) async throws
    -> SettingsIntegrationsTransportSelection?

  private let selectionProvider: SelectionProvider

  init(selectionProvider: @escaping SelectionProvider) {
    self.selectionProvider = selectionProvider
  }

  init(source: SettingsIntegrationsExactHostTransportSource) {
    selectionProvider = { context in try await source.selection(for: context) }
  }

  func scanSkills(
    _ request: SettingsSkillScanRequest, context: SettingsIntegrationsContext
  ) async throws -> SettingsSkillScanResult {
    try Self.requireOptionalLocation(request.projectLocation, context: context)
    return try await execute(.scanSkills, context: context) {
      try await $0.settingsScanSkills(request)
    }
  }

  func listMarketplace(
    _ request: SettingsSkillMarketplaceRequest, context: SettingsIntegrationsContext
  ) async throws -> SettingsSkillMarketplaceResult {
    try await execute(.listSkillMarketplace, context: context) {
      try await $0.settingsListSkillMarketplace(request)
    }
  }

  func setSkillEnabled(
    _ request: SettingsSetSkillEnabledRequest, context: SettingsIntegrationsContext
  ) async throws {
    try Self.requireOptionalLocation(request.projectLocation, context: context)
    try await execute(.setSkillEnabled, context: context) {
      try await $0.settingsSetSkillEnabled(request)
    }
  }

  func deleteSkill(
    _ request: SettingsDeleteSkillRequest, context: SettingsIntegrationsContext
  ) async throws {
    try Self.requireOptionalLocation(request.projectLocation, context: context)
    try await execute(.deleteSkill, context: context) { try await $0.settingsDeleteSkill(request) }
  }

  func importSkills(
    _ request: SettingsImportSkillsRequest, context: SettingsIntegrationsContext
  ) async throws -> SettingsImportSkillsResult {
    guard !request.skills.isEmpty,
      request.skills.allSatisfy({
        $0.projectLocation == nil || $0.projectLocation == context.projectLocation
      })
    else { throw CancellationError() }
    return try await execute(.importSkills, context: context) {
      try await $0.settingsImportSkills(request)
    }
  }

  func installMarketplaceSkill(
    _ request: SettingsInstallMarketplaceSkillRequest, context: SettingsIntegrationsContext
  ) async throws -> SettingsInstallMarketplaceSkillResult {
    try Self.requireOptionalLocation(request.projectLocation, context: context)
    return try await execute(.installMarketplaceSkill, context: context) {
      try await $0.settingsInstallMarketplaceSkill(request)
    }
  }

  func discoverMCP(
    _ request: SettingsDiscoverMCPRequest, context: SettingsIntegrationsContext
  ) async throws -> SettingsDiscoverMCPResult {
    try Self.requireOptionalLocation(request.projectLocation, context: context)
    return try await execute(.discoverExternalMcpServers, context: context) {
      try await $0.settingsDiscoverExternalMCPServers(request)
    }
  }

  func probeMCP(
    _ request: SettingsMCPServerRequest, context: SettingsIntegrationsContext
  ) async throws -> SettingsMCPProbeResult {
    try Self.requireOptionalLocation(request.projectLocation, context: context)
    return try await execute(.probeMcpServer, context: context) {
      try await $0.settingsProbeMCPServer(request)
    }
  }

  func oauthStatus(
    _ request: SettingsMCPOAuthOwnerRequest, context: SettingsIntegrationsContext
  ) async throws -> SettingsMCPOAuthStatusResult {
    try Self.requireOptionalLocation(request.projectLocation, context: context)
    return try await execute(.getMcpOauthStatus, context: context) {
      try await $0.settingsGetMCPOAuthStatus(request)
    }
  }

  func beginOAuth(
    _ request: SettingsMCPServerRequest, context: SettingsIntegrationsContext
  ) async throws -> SettingsMCPOAuthBeginResult {
    try Self.requireOptionalLocation(request.projectLocation, context: context)
    return try await execute(.beginMcpServerOauth, context: context) {
      try await $0.settingsBeginMCPServerOAuth(request)
    }
  }

  func waitOAuth(
    _ request: SettingsMCPOAuthWaitRequest, context: SettingsIntegrationsContext
  ) async throws -> SettingsMCPOAuthWaitResult {
    try Self.requireOptionalLocation(request.projectLocation, context: context)
    return try await execute(.waitMcpServerOauth, context: context) {
      try await $0.settingsWaitMCPServerOAuth(request)
    }
  }

  func clearOAuth(
    _ request: SettingsMCPOAuthClearRequest, context: SettingsIntegrationsContext
  ) async throws {
    try Self.requireOptionalLocation(request.projectLocation, context: context)
    try await execute(.clearMcpServerOauth, context: context) {
      try await $0.settingsClearMCPServerOAuth(request)
    }
  }

  private func execute<Value: Sendable>(
    _ procedure: SettingsIntegrationsProcedure,
    context: SettingsIntegrationsContext,
    operation: @escaping @Sendable (any SettingsIntegrationsRemoteAPI) async throws -> Value
  ) async throws -> Value {
    let metadata = SettingsIntegrationsRemoteV3Contract.metadata(for: procedure)
    do {
      try Task.checkCancellation()
      guard let selection = try await selectionProvider(context) else {
        throw SettingsIntegrationsGatewayError.transport
      }
      guard selection.access.context == context else { throw CancellationError() }
      if let failure = selection.access.gate(metadata.scope) {
        throw Self.error(for: failure)
      }
      let value = try await operation(selection.api)
      try Task.checkCancellation()
      guard try await selectionProvider(context)?.access.context == context else {
        throw CancellationError()
      }
      return value
    } catch is CancellationError {
      throw CancellationError()
    } catch SettingsIntegrationsRemoteMutationError.ambiguousOutcome {
      throw SettingsIntegrationsGatewayError.ambiguousOutcome
    } catch let error as RemoteClientError {
      throw Self.normalize(error, requiredScope: metadata.scope)
    } catch let error as SettingsIntegrationsGatewayError {
      throw error
    } catch {
      throw SettingsIntegrationsGatewayError.transport
    }
  }

  private static func requireOptionalLocation(
    _ location: ProjectLocation?, context: SettingsIntegrationsContext
  ) throws {
    guard location == nil || location == context.projectLocation else { throw CancellationError() }
  }

  private static func error(
    for failure: SettingsIntegrationsFailure
  ) -> SettingsIntegrationsGatewayError {
    switch failure {
    case .protocolIncompatible: return .protocolIncompatible
    case .missingScope(let scope):
      return .http(statusCode: 403, code: "missing_scope", missingScope: scope)
    case .authenticationExpired:
      return .http(statusCode: 401, code: "invalid_access_token", missingScope: nil)
    case .authorizationDenied:
      return .http(statusCode: 403, code: "forbidden", missingScope: nil)
    case .invalidResponse: return .invalidResponse
    case .ambiguousOutcome: return .ambiguousOutcome
    default: return .transport
    }
  }

  private static func normalize(
    _ error: RemoteClientError, requiredScope: SettingsIntegrationsScope
  ) -> SettingsIntegrationsGatewayError {
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
