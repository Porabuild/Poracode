import Foundation

protocol SettingsRemoteAPI: Sendable {
  func settingsAgentStatuses() async throws -> SettingsAgentStatuses
  func settingsProviderUsage() async throws -> SettingsProviderUsage
  func settingsProfileDevices() async throws -> SettingsProfileDevices
  func settingsProfileCoreStats(
    _ request: SettingsProfileStatsRequest
  ) async throws -> SettingsProfileCoreStats
  func settingsProfileTokenStats(
    _ request: SettingsProfileStatsRequest
  ) async throws -> SettingsProfileTokenStats
  func settingsSetProfileIdentity(
    _ identity: SettingsProfileIdentity
  ) async throws -> SettingsProfileIdentityResponse
  func settingsRead() async throws -> SettingsReadResponse
  func settingsWrite(_ patch: SettingsPatch) async throws -> SettingsReadResponse
  func globalMCPSettingsRead() async throws -> GlobalMCPSettingsResponse
  func globalMCPSettingsCommand(_ command: GlobalMCPSettingsCommand) async throws
    -> GlobalMCPSettingsResponse
  func globalMCPSettingsOperation(_ operation: GlobalMCPSettingsOperation) async throws
    -> GlobalMCPSettingsOperationResult
}

extension SettingsRemoteAPI {
  func globalMCPSettingsRead() async throws -> GlobalMCPSettingsResponse {
    throw RemoteClientError.invalidResponse("MCP settings are unavailable.")
  }

  func globalMCPSettingsCommand(_ command: GlobalMCPSettingsCommand) async throws
    -> GlobalMCPSettingsResponse
  {
    _ = command
    throw RemoteClientError.invalidResponse("MCP settings are unavailable.")
  }

  func globalMCPSettingsOperation(_ operation: GlobalMCPSettingsOperation) async throws
    -> GlobalMCPSettingsOperationResult
  {
    _ = operation
    throw RemoteClientError.invalidResponse("MCP settings are unavailable.")
  }
}

enum SettingsRemoteMutationError: Error, Sendable {
  case ambiguousOutcome
}

extension RemoteAPIClient: SettingsRemoteAPI {
  func settingsAgentStatuses() async throws -> SettingsAgentStatuses {
    try await get(
      route: "agent-statuses",
      canonicalize: SettingsRemoteV3Contract.agentStatusesResponse
    )
  }

  func settingsProviderUsage() async throws -> SettingsProviderUsage {
    try await get(
      route: "provider-usage",
      canonicalize: SettingsRemoteV3Contract.providerUsageResponse
    )
  }

  func settingsProfileDevices() async throws -> SettingsProfileDevices {
    try await get(
      route: "profile-devices",
      canonicalize: SettingsRemoteV3Contract.profileDevicesResponse
    )
  }

  func settingsProfileCoreStats(
    _ request: SettingsProfileStatsRequest
  ) async throws -> SettingsProfileCoreStats {
    let body = try SettingsRemoteV3Contract.profileCoreStatsRequest(
      JSONDecoding.encoder.encode(request)
    )
    let data = try await requestData(
      path: path(for: "profile-core-stats"), method: "POST", jsonBody: body
    )
    let canonical = try SettingsRemoteV3Contract.profileCoreStatsResponse(data)
    return try decode(SettingsProfileCoreStats.self, canonical)
  }

  func settingsProfileTokenStats(
    _ request: SettingsProfileStatsRequest
  ) async throws -> SettingsProfileTokenStats {
    let body = try SettingsRemoteV3Contract.profileTokenStatsRequest(
      JSONDecoding.encoder.encode(request)
    )
    let data = try await requestData(
      path: path(for: "profile-token-stats"), method: "POST", jsonBody: body
    )
    let canonical = try SettingsRemoteV3Contract.profileTokenStatsResponse(data)
    return try decode(SettingsProfileTokenStats.self, canonical)
  }

  func settingsSetProfileIdentity(
    _ identity: SettingsProfileIdentity
  ) async throws -> SettingsProfileIdentityResponse {
    let body = try SettingsRemoteV3Contract.profileIdentityRequest(
      JSONDecoding.encoder.encode(identity)
    )
    return try await mutate(
      route: "profile-identity", body: body,
      canonicalize: SettingsRemoteV3Contract.profileIdentityResponse
    )
  }

  func settingsRead() async throws -> SettingsReadResponse {
    try await get(
      route: "settings-read", canonicalize: SettingsRemoteV3Contract.settingsReadResponse)
  }

  func settingsWrite(_ patch: SettingsPatch) async throws -> SettingsReadResponse {
    let body = try SettingsRemoteV3Contract.settingsWriteRequest(
      JSONDecoding.encoder.encode(patch)
    )
    return try await mutate(
      route: "settings-write", body: body,
      canonicalize: SettingsRemoteV3Contract.settingsWriteResponse
    )
  }

  func globalMCPSettingsRead() async throws -> GlobalMCPSettingsResponse {
    try await get(
      route: "mcp-settings-read",
      canonicalize: SettingsRemoteV3Contract.mcpSettingsReadResponse
    )
  }

  func globalMCPSettingsCommand(_ command: GlobalMCPSettingsCommand) async throws
    -> GlobalMCPSettingsResponse
  {
    let body = try SettingsRemoteV3Contract.mcpSettingsCommandRequest(
      JSONDecoding.encoder.encode(command)
    )
    return try await mutate(
      route: "mcp-settings-command",
      body: body,
      canonicalize: SettingsRemoteV3Contract.mcpSettingsCommandResponse
    )
  }

  func globalMCPSettingsOperation(_ operation: GlobalMCPSettingsOperation) async throws
    -> GlobalMCPSettingsOperationResult
  {
    let body = try SettingsRemoteV3Contract.mcpSettingsOperationRequest(
      JSONDecoding.encoder.encode(operation)
    )
    return try await mutate(
      route: "mcp-settings-operation",
      body: body,
      canonicalize: SettingsRemoteV3Contract.mcpSettingsOperationResponse
    )
  }

  private func get<Value: Decodable & Sendable>(
    route: String,
    canonicalize: @Sendable (Data) throws -> Data
  ) async throws -> Value {
    let data = try await requestData(path: path(for: route))
    return try decode(Value.self, canonicalize(data))
  }

  private func mutate<Value: Decodable & Sendable>(
    route: String,
    body: Data,
    canonicalize: @Sendable (Data) throws -> Data
  ) async throws -> Value {
    let response: Data
    do {
      response = try await requestData(path: path(for: route), method: "POST", jsonBody: body)
    } catch is CancellationError {
      throw CancellationError()
    } catch let error as RemoteClientError
      where RemoteMutationClassification.classify(statusCode: error.status, code: error.code)
      == .requestMayHaveCommitted
    {
      throw SettingsRemoteMutationError.ambiguousOutcome
    } catch {
      throw error
    }
    do {
      try Task.checkCancellation()
      return try decode(Value.self, canonicalize(response))
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      // The host accepted the one and only POST, but its result could not be established.
      throw SettingsRemoteMutationError.ambiguousOutcome
    }
  }

  nonisolated private func path(for id: String) -> String {
    guard let route = SettingsRemoteV3Contract.metadata(id: id) else {
      preconditionFailure("Missing Settings route metadata: \(id)")
    }
    return route.path
  }

  nonisolated private func decode<Value: Decodable>(
    _ type: Value.Type,
    _ data: Data
  ) throws -> Value {
    do { return try JSONDecoding.decode(type, from: data) } catch is CancellationError {
      throw CancellationError()
    } catch { throw RemoteClientError.invalidResponse("Invalid Settings response.") }
  }
}
