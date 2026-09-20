import Foundation

/// Generated-contract-backed project HTTP surface used by the lease-owning gateway.
protocol ProjectRemoteAPI: Sendable {
  func remoteRunProjectCommand(_ command: ProjectCommand) async throws -> ProjectCommandResult
  func remoteLoadProjectSettings(projectId: String) async throws -> ProjectSettings
  func remoteBrowseHostDirectory(path: String) async throws -> BrowseHostDirectoryResult
  func remoteDetectSetupScript(location: ProjectLocation) async throws -> DetectSetupScriptResult
  func remoteLoadProjectNotes(projectId: String) async throws -> ProjectNotesResponse
  func remoteWriteProjectNotes(_ body: ProjectNotesWriteBody, projectId: String) async throws
}

/// A mutation reached the transport but no authoritative response established its outcome.
enum ProjectRemoteMutationError: Error, Sendable {
  case ambiguousOutcome
}

extension RemoteAPIClient: ProjectRemoteAPI {
  func remoteRunProjectCommand(_ command: ProjectCommand) async throws -> ProjectCommandResult {
    let body = try GeneratedRemoteV3Contract.projectCommandRequest(
      JSONDecoding.encoder.encode(command)
    )
    let response = try await mutationRequest(
      path: "/api/projects/command", jsonBody: body
    )
    do {
      let canonical = try GeneratedRemoteV3Contract.projectCommandResponse(response)
      return try JSONDecoding.decode(ProjectCommandResult.self, from: canonical)
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      throw ProjectRemoteMutationError.ambiguousOutcome
    }
  }

  func remoteLoadProjectSettings(projectId: String) async throws -> ProjectSettings {
    let validated = try GeneratedRemoteV3Contract.projectSettingsPath(projectId: projectId)
    let response = try await requestData(
      path: "/api/projects/\(Self.encodePathSegment(validated))/settings"
    )
    let canonical = try GeneratedRemoteV3Contract.projectSettingsResponse(response)
    return try JSONDecoding.decode(ProjectSettings.self, from: canonical)
  }

  func remoteBrowseHostDirectory(path: String) async throws -> BrowseHostDirectoryResult {
    let body = try GeneratedRemoteV3Contract.browseHostDirectoryEnvelope(path: path)
    let response = try await requestData(
      path: "/api/git/call", method: "POST", jsonBody: body
    )
    let canonical = try GeneratedRemoteV3Contract.browseHostDirectoryResult(response)
    return try JSONDecoding.decode(BrowseHostDirectoryResult.self, from: canonical)
  }

  func remoteDetectSetupScript(location: ProjectLocation) async throws -> DetectSetupScriptResult {
    let body = try GeneratedRemoteV3Contract.detectSetupScriptEnvelope(location: location)
    let response = try await requestData(
      path: "/api/git/call", method: "POST", jsonBody: body
    )
    let canonical = try GeneratedRemoteV3Contract.detectSetupScriptResult(response)
    return try JSONDecoding.decode(DetectSetupScriptResult.self, from: canonical)
  }

  func remoteLoadProjectNotes(projectId: String) async throws -> ProjectNotesResponse {
    let validated = try GeneratedRemoteV3Contract.projectNotesReadPath(projectId: projectId)
    let response = try await requestData(
      path: "/api/projects/\(Self.encodePathSegment(validated))/notes"
    )
    let canonical = try GeneratedRemoteV3Contract.projectNotesReadResponse(response)
    return try JSONDecoding.decode(ProjectNotesResponse.self, from: canonical)
  }

  func remoteWriteProjectNotes(
    _ body: ProjectNotesWriteBody,
    projectId: String
  ) async throws {
    let validated = try GeneratedRemoteV3Contract.projectNotesWritePath(projectId: projectId)
    let request = try GeneratedRemoteV3Contract.projectNotesWriteRequest(
      JSONDecoding.encoder.encode(body)
    )
    let response = try await mutationRequest(
      path: "/api/projects/\(Self.encodePathSegment(validated))/notes",
      jsonBody: request
    )
    do {
      _ = try GeneratedRemoteV3Contract.projectNotesWriteResponse(response)
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      throw ProjectRemoteMutationError.ambiguousOutcome
    }
  }

  private func mutationRequest(path: String, jsonBody: Data) async throws -> Data {
    do {
      return try await requestData(path: path, method: "POST", jsonBody: jsonBody)
    } catch is CancellationError {
      throw CancellationError()
    } catch let error as RemoteClientError
      where RemoteMutationClassification.classify(statusCode: error.status, code: error.code) == .requestMayHaveCommitted
    {
      throw ProjectRemoteMutationError.ambiguousOutcome
    } catch {
      throw error
    }
  }
}
