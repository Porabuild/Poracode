import Foundation

/// Generated-contract-backed project HTTP surface used by the lease-owning gateway.
protocol ProjectRemoteAPI: Sendable {
  func remoteRunProjectCommand(
    _ command: ProjectCommand,
    operationId: String
  ) async throws -> ProjectCommandOutcome
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

/// Decoded union of the generated project-command response root. The generated
/// codec has already validated the union; this selects the declared shape and
/// never re-interprets an absent list as an empty catalog.
private struct ProjectCommandWireResult: Decodable {
  var ok: Bool?
  var projects: [RemoteProject]?
  var project: RemoteProject?
}

extension RemoteAPIClient: ProjectRemoteAPI {
  func remoteRunProjectCommand(
    _ command: ProjectCommand,
    operationId: String
  ) async throws -> ProjectCommandOutcome {
    let body = try GeneratedRemoteV3Contract.projectCommandRequest(
      JSONDecoding.encoder.encode(command)
    )
    // The declaration is only ever sent to a host whose authoritative
    // handshake advertised `projectCommandResults` v1 on this exact client; the
    // per-operation command id is required by the host under it and is the
    // receipt identity for this one operation.
    var headers: [String: String] = [:]
    if effectiveProjectCommandResultDeclaration {
      headers[ProtocolConstants.projectCommandResultHeader] =
        ProtocolConstants.projectCommandResultDeclaration
      headers[ProtocolConstants.commandIdHeader] = operationId
    }
    let response = try await mutationRequest(
      path: "/api/projects/command", jsonBody: body, extraHeaders: headers
    )
    do {
      let canonical = try GeneratedRemoteV3Contract.projectCommandResponse(response)
      return try Self.decodeProjectCommandOutcome(canonical)
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      throw ProjectRemoteMutationError.ambiguousOutcome
    }
  }

  static func decodeProjectCommandOutcome(_ data: Data) throws -> ProjectCommandOutcome {
    let wire = try JSONDecoding.decode(ProjectCommandWireResult.self, from: data)
    if wire.ok == true {
      return .bounded(ProjectCommandBoundedResult(project: wire.project))
    }
    guard let projects = wire.projects else {
      throw ProjectRemoteMutationError.ambiguousOutcome
    }
    return .complete(ProjectCommandResult(projects: projects, project: wire.project))
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

  private func mutationRequest(
    path: String,
    jsonBody: Data,
    extraHeaders: [String: String] = [:]
  ) async throws -> Data {
    do {
      return try await requestData(
        path: path, method: "POST", jsonBody: jsonBody, extraHeaders: extraHeaders
      )
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
