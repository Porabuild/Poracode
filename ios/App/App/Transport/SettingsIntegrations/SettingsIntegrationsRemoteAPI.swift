import Foundation

protocol SettingsIntegrationsRemoteAPI: Sendable {
  func settingsScanSkills(_ request: SettingsSkillScanRequest) async throws
    -> SettingsSkillScanResult
  func settingsListSkillMarketplace(
    _ request: SettingsSkillMarketplaceRequest
  ) async throws -> SettingsSkillMarketplaceResult
  func settingsSetSkillEnabled(_ request: SettingsSetSkillEnabledRequest) async throws
  func settingsDeleteSkill(_ request: SettingsDeleteSkillRequest) async throws
  func settingsImportSkills(
    _ request: SettingsImportSkillsRequest
  ) async throws -> SettingsImportSkillsResult
  func settingsInstallMarketplaceSkill(
    _ request: SettingsInstallMarketplaceSkillRequest
  ) async throws -> SettingsInstallMarketplaceSkillResult
  func settingsDiscoverExternalMCPServers(
    _ request: SettingsDiscoverMCPRequest
  ) async throws -> SettingsDiscoverMCPResult
  func settingsProbeMCPServer(
    _ request: SettingsMCPServerRequest
  ) async throws -> SettingsMCPProbeResult
  func settingsGetMCPOAuthStatus(
    _ request: SettingsMCPOAuthOwnerRequest
  ) async throws -> SettingsMCPOAuthStatusResult
  func settingsBeginMCPServerOAuth(
    _ request: SettingsMCPServerRequest
  ) async throws -> SettingsMCPOAuthBeginResult
  func settingsWaitMCPServerOAuth(
    _ request: SettingsMCPOAuthWaitRequest
  ) async throws -> SettingsMCPOAuthWaitResult
  func settingsClearMCPServerOAuth(_ request: SettingsMCPOAuthClearRequest) async throws
}

enum SettingsIntegrationsRemoteMutationError: Error, Sendable {
  case ambiguousOutcome
}

extension RemoteAPIClient: SettingsIntegrationsRemoteAPI {
  func settingsScanSkills(
    _ request: SettingsSkillScanRequest
  ) async throws -> SettingsSkillScanResult {
    try await settingsIntegrationsRead(.scanSkills, request, as: SettingsSkillScanResult.self)
  }

  func settingsListSkillMarketplace(
    _ request: SettingsSkillMarketplaceRequest
  ) async throws -> SettingsSkillMarketplaceResult {
    try await settingsIntegrationsRead(
      .listSkillMarketplace, request, as: SettingsSkillMarketplaceResult.self
    )
  }

  func settingsSetSkillEnabled(_ request: SettingsSetSkillEnabledRequest) async throws {
    try await settingsIntegrationsOmittedMutation(.setSkillEnabled, request)
  }

  func settingsDeleteSkill(_ request: SettingsDeleteSkillRequest) async throws {
    try await settingsIntegrationsOmittedMutation(.deleteSkill, request)
  }

  func settingsImportSkills(
    _ request: SettingsImportSkillsRequest
  ) async throws -> SettingsImportSkillsResult {
    try await settingsIntegrationsMutation(
      .importSkills, request, as: SettingsImportSkillsResult.self)
  }

  func settingsInstallMarketplaceSkill(
    _ request: SettingsInstallMarketplaceSkillRequest
  ) async throws -> SettingsInstallMarketplaceSkillResult {
    try await settingsIntegrationsMutation(
      .installMarketplaceSkill, request, as: SettingsInstallMarketplaceSkillResult.self
    )
  }

  func settingsDiscoverExternalMCPServers(
    _ request: SettingsDiscoverMCPRequest
  ) async throws -> SettingsDiscoverMCPResult {
    try await settingsIntegrationsRead(
      .discoverExternalMcpServers, request, as: SettingsDiscoverMCPResult.self
    )
  }

  func settingsProbeMCPServer(
    _ request: SettingsMCPServerRequest
  ) async throws -> SettingsMCPProbeResult {
    try await settingsIntegrationsMutation(
      .probeMcpServer, request, as: SettingsMCPProbeResult.self
    )
  }

  func settingsGetMCPOAuthStatus(
    _ request: SettingsMCPOAuthOwnerRequest
  ) async throws -> SettingsMCPOAuthStatusResult {
    try await settingsIntegrationsRead(
      .getMcpOauthStatus, request, as: SettingsMCPOAuthStatusResult.self
    )
  }

  func settingsBeginMCPServerOAuth(
    _ request: SettingsMCPServerRequest
  ) async throws -> SettingsMCPOAuthBeginResult {
    try await settingsIntegrationsMutation(
      .beginMcpServerOauth, request, as: SettingsMCPOAuthBeginResult.self
    )
  }

  func settingsWaitMCPServerOAuth(
    _ request: SettingsMCPOAuthWaitRequest
  ) async throws -> SettingsMCPOAuthWaitResult {
    try await settingsIntegrationsMutation(
      .waitMcpServerOauth, request, as: SettingsMCPOAuthWaitResult.self
    )
  }

  func settingsClearMCPServerOAuth(_ request: SettingsMCPOAuthClearRequest) async throws {
    try await settingsIntegrationsOmittedMutation(.clearMcpServerOauth, request)
  }

  private func settingsIntegrationsRead<
    Request: Encodable & Sendable, Result: Decodable & Sendable
  >(
    _ procedure: SettingsIntegrationsProcedure,
    _ request: Request,
    as type: Result.Type
  ) async throws -> Result {
    let body = try SettingsIntegrationsRemoteV3Contract.request(procedure, payload: request)
    let data = try await requestData(
      path: SettingsIntegrationsRemoteV3Contract.procedurePath,
      method: "POST",
      jsonBody: body
    )
    return try SettingsIntegrationsRemoteV3Contract.result(
      type, procedure: procedure, response: data
    )
  }

  private func settingsIntegrationsMutation<
    Request: Encodable & Sendable, Result: Decodable & Sendable
  >(
    _ procedure: SettingsIntegrationsProcedure,
    _ request: Request,
    as type: Result.Type
  ) async throws -> Result {
    let data = try await settingsIntegrationsMutationData(procedure, request)
    do {
      try Task.checkCancellation()
      return try SettingsIntegrationsRemoteV3Contract.result(
        type, procedure: procedure, response: data
      )
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      throw SettingsIntegrationsRemoteMutationError.ambiguousOutcome
    }
  }

  private func settingsIntegrationsOmittedMutation<Request: Encodable & Sendable>(
    _ procedure: SettingsIntegrationsProcedure,
    _ request: Request
  ) async throws {
    let data = try await settingsIntegrationsMutationData(procedure, request)
    do {
      try Task.checkCancellation()
      try SettingsIntegrationsRemoteV3Contract.omittedResult(procedure, response: data)
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      throw SettingsIntegrationsRemoteMutationError.ambiguousOutcome
    }
  }

  private func settingsIntegrationsMutationData<Request: Encodable & Sendable>(
    _ procedure: SettingsIntegrationsProcedure,
    _ request: Request
  ) async throws -> Data {
    let body = try SettingsIntegrationsRemoteV3Contract.request(procedure, payload: request)
    do {
      return try await requestData(
        path: SettingsIntegrationsRemoteV3Contract.procedurePath,
        method: "POST",
        jsonBody: body
      )
    } catch is CancellationError {
      throw CancellationError()
    } catch let error as RemoteClientError
      where RemoteMutationClassification.classify(statusCode: error.status, code: error.code) == .requestMayHaveCommitted
    {
      throw SettingsIntegrationsRemoteMutationError.ambiguousOutcome
    } catch {
      throw error
    }
  }
}
