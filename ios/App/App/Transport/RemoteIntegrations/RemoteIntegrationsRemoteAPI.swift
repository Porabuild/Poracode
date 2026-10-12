import Foundation

protocol RemoteIntegrationsRemoteAPI: Sendable {
  func remoteIntegrationsHostUpdate() async throws -> RemoteIntegrationsHostUpdateState
  func remoteIntegrationsCheckHostUpdate() async throws -> RemoteIntegrationsHostUpdateState
  func remoteIntegrationsInstallHostUpdate() async throws
  func remoteIntegrationsSchedules() async throws -> RemoteIntegrationsSchedulesResponse
  func remoteIntegrationsScheduleRuns(id: String) async throws
    -> RemoteIntegrationsScheduleRunsResponse
  func remoteIntegrationsScheduleCommand(
    _ command: RemoteIntegrationsScheduleCommand
  ) async throws -> RemoteIntegrationsSchedulesResponse
  func remoteIntegrationsPRWatch(
    _ key: RemoteIntegrationsPRWatchKey
  ) async throws -> RemoteIntegrationsPRWatchResponse
  func remoteIntegrationsCheckPRWatch(_ key: RemoteIntegrationsPRWatchKey) async throws
  func remoteIntegrationsUpsertPRWatch(
    _ input: RemoteIntegrationsPRWatchInput
  ) async throws -> RemoteIntegrationsPRWatch
  func remoteIntegrationsDeletePRWatch(_ key: RemoteIntegrationsPRWatchKey) async throws
}

enum RemoteIntegrationsRemoteMutationError: Error, Sendable {
  case ambiguousOutcome
}

extension RemoteAPIClient: RemoteIntegrationsRemoteAPI {
  func remoteIntegrationsHostUpdate() async throws -> RemoteIntegrationsHostUpdateState {
    try await remoteIntegrationsRead(
      route: "host-update",
      canonicalize: RemoteIntegrationsRemoteV3Contract.hostUpdateResponse
    )
  }

  func remoteIntegrationsCheckHostUpdate() async throws -> RemoteIntegrationsHostUpdateState {
    try await remoteIntegrationsMutate(
      route: "host-update-check",
      method: "POST",
      canonicalize: RemoteIntegrationsRemoteV3Contract.hostUpdateCheckResponse
    )
  }

  func remoteIntegrationsInstallHostUpdate() async throws {
    let response = try await remoteIntegrationsMutationData(
      route: "host-update-install",
      method: "POST",
      body: nil
    )
    do {
      _ = try RemoteIntegrationsRemoteV3Contract.hostUpdateInstallResponse(response)
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      throw RemoteIntegrationsRemoteMutationError.ambiguousOutcome
    }
  }

  func remoteIntegrationsSchedules() async throws -> RemoteIntegrationsSchedulesResponse {
    try await remoteIntegrationsRead(
      route: "schedules-read",
      canonicalize: RemoteIntegrationsRemoteV3Contract.schedulesReadResponse
    )
  }

  func remoteIntegrationsScheduleRuns(
    id: String
  ) async throws -> RemoteIntegrationsScheduleRunsResponse {
    let items = try RemoteIntegrationsRemoteV3Contract.scheduleRunsQuery(id: id)
    let data = try await requestData(
      path: remoteIntegrationsPath(for: "schedule-runs-read"),
      queryItems: items
    )
    return try remoteIntegrationsDecode(
      RemoteIntegrationsScheduleRunsResponse.self,
      RemoteIntegrationsRemoteV3Contract.scheduleRunsResponse(data)
    )
  }

  func remoteIntegrationsScheduleCommand(
    _ command: RemoteIntegrationsScheduleCommand
  ) async throws -> RemoteIntegrationsSchedulesResponse {
    let body = try RemoteIntegrationsRemoteV3Contract.schedulesCommandRequest(
      JSONDecoding.encoder.encode(command)
    )
    let response: RemoteIntegrationsSchedulesResponse = try await remoteIntegrationsMutate(
      route: "schedules-command",
      method: "POST",
      body: body,
      canonicalize: RemoteIntegrationsRemoteV3Contract.schedulesCommandResponse
    )
    if case .delete = command { return response }
    guard response.schedule != nil else {
      throw RemoteIntegrationsRemoteMutationError.ambiguousOutcome
    }
    return response
  }

  func remoteIntegrationsPRWatch(
    _ key: RemoteIntegrationsPRWatchKey
  ) async throws -> RemoteIntegrationsPRWatchResponse {
    let items = try RemoteIntegrationsRemoteV3Contract.prWatchReadQuery(key)
    let data = try await requestData(
      path: remoteIntegrationsPath(for: "pr-watch-read"),
      queryItems: items
    )
    return try remoteIntegrationsDecode(
      RemoteIntegrationsPRWatchResponse.self,
      RemoteIntegrationsRemoteV3Contract.prWatchReadResponse(data)
    )
  }

  func remoteIntegrationsCheckPRWatch(_ key: RemoteIntegrationsPRWatchKey) async throws {
    let body = try RemoteIntegrationsRemoteV3Contract.prWatchCheckRequest(
      JSONDecoding.encoder.encode(key)
    )
    let data = try await remoteIntegrationsMutationData(
      route: "pr-watch-check",
      method: "POST",
      body: body
    )
    try remoteIntegrationsValidateMutationResponse(
      data,
      canonicalize: RemoteIntegrationsRemoteV3Contract.prWatchCheckResponse
    )
  }

  func remoteIntegrationsUpsertPRWatch(
    _ input: RemoteIntegrationsPRWatchInput
  ) async throws -> RemoteIntegrationsPRWatch {
    if input.watchEnabled, let agentKind = input.agentKind, let config = input.config {
      let sync = RemoteIntegrationsPRWatchAgentSync(
        projectId: input.projectId,
        agentKind: agentKind,
        config: config
      )
      let syncBody = try RemoteIntegrationsRemoteV3Contract.prWatchAgentSyncRequest(
        JSONDecoding.encoder.encode(sync)
      )
      let syncResponse = try await remoteIntegrationsMutationData(
        route: "pr-watch-agent-sync",
        method: "POST",
        body: syncBody
      )
      try remoteIntegrationsValidateMutationResponse(
        syncResponse,
        canonicalize: RemoteIntegrationsRemoteV3Contract.prWatchAgentSyncResponse
      )
    }
    let body = try RemoteIntegrationsRemoteV3Contract.prWatchUpsertRequest(
      JSONDecoding.encoder.encode(input)
    )
    let response: RemoteIntegrationsPRWatchResponse = try await remoteIntegrationsMutate(
      route: "pr-watch-upsert",
      method: "POST",
      body: body,
      canonicalize: RemoteIntegrationsRemoteV3Contract.prWatchUpsertResponse
    )
    guard let watch = response.watch else {
      throw RemoteIntegrationsRemoteMutationError.ambiguousOutcome
    }
    return watch
  }

  func remoteIntegrationsDeletePRWatch(_ key: RemoteIntegrationsPRWatchKey) async throws {
    let body = try RemoteIntegrationsRemoteV3Contract.prWatchDeleteRequest(
      JSONDecoding.encoder.encode(key)
    )
    let data = try await remoteIntegrationsMutationData(
      route: "pr-watch-delete",
      method: "DELETE",
      body: body
    )
    try remoteIntegrationsValidateMutationResponse(
      data,
      canonicalize: RemoteIntegrationsRemoteV3Contract.prWatchDeleteResponse
    )
  }

  private func remoteIntegrationsRead<Value: Decodable & Sendable>(
    route: String,
    canonicalize: @Sendable (Data) throws -> Data
  ) async throws -> Value {
    let data = try await requestData(path: remoteIntegrationsPath(for: route))
    return try remoteIntegrationsDecode(Value.self, canonicalize(data))
  }

  private func remoteIntegrationsMutate<Value: Decodable & Sendable>(
    route: String,
    method: String,
    body: Data? = nil,
    canonicalize: @Sendable (Data) throws -> Data
  ) async throws -> Value {
    let data = try await remoteIntegrationsMutationData(
      route: route,
      method: method,
      body: body
    )
    do {
      try Task.checkCancellation()
      return try remoteIntegrationsDecode(Value.self, canonicalize(data))
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      throw RemoteIntegrationsRemoteMutationError.ambiguousOutcome
    }
  }

  private func remoteIntegrationsMutationData(
    route: String,
    method: String,
    body: Data?
  ) async throws -> Data {
    do {
      return try await requestData(
        path: remoteIntegrationsPath(for: route),
        method: method,
        jsonBody: body
      )
    } catch is CancellationError {
      throw CancellationError()
    } catch let error as RemoteClientError
      where RemoteMutationClassification.classify(statusCode: error.status, code: error.code)
      == .requestMayHaveCommitted
    {
      throw RemoteIntegrationsRemoteMutationError.ambiguousOutcome
    } catch {
      throw error
    }
  }

  private func remoteIntegrationsValidateMutationResponse(
    _ data: Data,
    canonicalize: @Sendable (Data) throws -> Data
  ) throws {
    do {
      try Task.checkCancellation()
      let canonical = try canonicalize(data)
      let response = try remoteIntegrationsDecode(
        RemoteIntegrationsOKResponse.self,
        canonical
      )
      guard response.ok else { throw RemoteIntegrationsRemoteMutationError.ambiguousOutcome }
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      throw RemoteIntegrationsRemoteMutationError.ambiguousOutcome
    }
  }

  nonisolated private func remoteIntegrationsPath(for id: String) -> String {
    guard let route = RemoteIntegrationsRemoteV3Contract.metadata(id: id) else {
      preconditionFailure("Missing remote integrations route metadata: \(id)")
    }
    return route.path
  }

  nonisolated private func remoteIntegrationsDecode<Value: Decodable>(
    _ type: Value.Type,
    _ data: Data
  ) throws -> Value {
    do {
      return try JSONDecoding.decode(type, from: data)
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      throw RemoteClientError.invalidResponse("Invalid remote integrations response.")
    }
  }
}
