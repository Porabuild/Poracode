import Foundation

struct ProjectTransportSelection: Sendable {
  let session: ProjectControllerSession
  let api: any ProjectRemoteAPI
}

/// Owns all selected-host checks around project HTTP operations.
///
/// The selection is captured before the request and checked again after it. A host switch,
/// generation bump, or cancellation makes the completion stale and propagates cancellation.
actor SelectedProjectSessionGateway: ProjectSessionGateway {
  typealias SelectionProvider = @MainActor @Sendable () -> ProjectTransportSelection?

  private let selectionProvider: SelectionProvider

  init(selectionProvider: @escaping SelectionProvider) {
    self.selectionProvider = selectionProvider
  }

  func runProjectCommand(
    _ command: ProjectCommand,
    lease: ProjectControllerHostLease
  ) async throws -> ProjectCommandResult {
    try await execute(lease: lease, scope: .projectsManage) { api in
      try await api.remoteRunProjectCommand(command)
    }
  }

  func loadProjectSettings(
    for identity: ProjectIdentity,
    lease: ProjectControllerHostLease
  ) async throws -> ProjectSettings {
    try require(identity: identity, lease: lease)
    return try await execute(lease: lease, scope: .projectsManage) { api in
      try await api.remoteLoadProjectSettings(projectId: identity.projectId)
    }
  }

  func browseHostDirectory(
    path: String,
    lease: ProjectControllerHostLease
  ) async throws -> BrowseHostDirectoryResult {
    try await execute(lease: lease, scope: .projectsManage) { api in
      try await api.remoteBrowseHostDirectory(path: path)
    }
  }

  func detectSetupScript(
    at location: ProjectLocation,
    lease: ProjectControllerHostLease
  ) async throws -> DetectSetupScriptResult {
    try await execute(lease: lease, scope: .sessionRead) { api in
      try await api.remoteDetectSetupScript(location: location)
    }
  }

  func loadProjectNotes(
    for identity: ProjectIdentity,
    lease: ProjectControllerHostLease
  ) async throws -> ProjectNotesResponse {
    try require(identity: identity, lease: lease)
    return try await execute(lease: lease, scope: .sessionRead) { api in
      try await api.remoteLoadProjectNotes(projectId: identity.projectId)
    }
  }

  func writeProjectNotes(
    _ body: ProjectNotesWriteBody,
    for identity: ProjectIdentity,
    lease: ProjectControllerHostLease
  ) async throws {
    try require(identity: identity, lease: lease)
    try await execute(lease: lease, scope: .sessionOperate) { api in
      try await api.remoteWriteProjectNotes(body, projectId: identity.projectId)
    }
  }

  private func execute<Value: Sendable>(
    lease: ProjectControllerHostLease,
    scope: ProjectControllerCapability,
    operation: @escaping @Sendable (any ProjectRemoteAPI) async throws -> Value
  ) async throws -> Value {
    try Task.checkCancellation()
    let selection = await selectionProvider()
    guard let selection, selection.session.lease == lease else {
      throw CancellationError()
    }
    if let failure = selection.session.gate(scope) {
      throw Self.gatewayError(for: failure, requiredScope: scope.rawValue)
    }

    do {
      let value = try await operation(selection.api)
      try Task.checkCancellation()
      let current = await selectionProvider()
      guard current?.session.lease == lease else { throw CancellationError() }
      return value
    } catch is CancellationError {
      throw CancellationError()
    } catch ProjectRemoteMutationError.ambiguousOutcome {
      throw ProjectSessionGatewayError.ambiguousOutcome
    } catch let error as RemoteClientError {
      throw Self.normalize(error, requiredScope: scope.rawValue)
    } catch let error as ProjectSessionGatewayError {
      throw error
    } catch {
      throw ProjectSessionGatewayError.transport(nil)
    }
  }

  private func require(
    identity: ProjectIdentity,
    lease: ProjectControllerHostLease
  ) throws {
    guard identity.connectionId == lease.connectionId else { throw CancellationError() }
  }

  private static func gatewayError(
    for failure: ProjectOperationFailure,
    requiredScope: String
  ) -> ProjectSessionGatewayError {
    switch failure {
    case .capabilityMissing:
      return .http(statusCode: 403, code: "missing_scope", missingScope: requiredScope)
    case .authenticationExpired:
      return .http(statusCode: 401, code: "invalid_access_token", missingScope: nil)
    case .authorizationDenied:
      return .http(statusCode: 403, code: "forbidden", missingScope: nil)
    default:
      return .transport(nil)
    }
  }

  private static func normalize(
    _ error: RemoteClientError,
    requiredScope: String
  ) -> ProjectSessionGatewayError {
    if error.code == "invalid_response" { return .invalidResponse }
    if error.status > 0 {
      let code = sanitizedCode(error.code)
      let missing = error.status == 403 && code == "missing_scope" ? requiredScope : nil
      return .http(statusCode: error.status, code: code, missingScope: missing)
    }
    return .transport(nil)
  }

  private static func sanitizedCode(_ value: String) -> String? {
    guard !value.isEmpty, value.utf8.count <= 64 else { return nil }
    let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789_-")
    guard value.unicodeScalars.allSatisfy(allowed.contains) else { return nil }
    return value
  }
}
