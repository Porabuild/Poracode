import Foundation

struct ProjectWorkspaceTransportSelection: Sendable {
  let context: ProjectWorkspaceContext
  let api: any ProjectWorkspaceRemoteAPI
}

/// Verifies exact host and project ownership before and after every workspace operation.
actor SelectedProjectWorkspaceGateway: ProjectWorkspaceGateway {
  typealias SelectionProvider =
    @MainActor @Sendable () -> ProjectWorkspaceTransportSelection?

  private let selectionProvider: SelectionProvider

  init(selectionProvider: @escaping SelectionProvider) {
    self.selectionProvider = selectionProvider
  }

  func searchProjectFiles(
    query: String,
    limit: Int,
    searchConfig: ProjectWorkspaceSearchConfig?,
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectFileSearchResult {
    try await execute(lease: lease, scope: .sessionRead) { api in
      try await api.remoteSearchProjectFiles(
        location: lease.location,
        query: query,
        limit: limit,
        searchConfig: searchConfig
      )
    }
  }

  func listProjectTree(
    directoryPath: String,
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectTreeResult {
    try await execute(lease: lease, scope: .sessionRead) { api in
      try await api.remoteListProjectTree(
        location: lease.location,
        directoryPath: directoryPath
      )
    }
  }

  func searchProjectTree(
    query: String,
    limit: Int,
    searchConfig: ProjectWorkspaceSearchConfig?,
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectTreeSearchResult {
    try await execute(lease: lease, scope: .sessionRead) { api in
      try await api.remoteSearchProjectTree(
        location: lease.location,
        query: query,
        limit: limit,
        searchConfig: searchConfig
      )
    }
  }

  func readProjectFile(
    path: String,
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectFileReadResult {
    try await execute(lease: lease, scope: .sessionRead) { api in
      try await api.remoteReadProjectFile(location: lease.location, path: path)
    }
  }

  func writeProjectFile(
    path: String,
    content: String,
    baseModifiedAtMs: Double,
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectFileWriteResult {
    try await execute(lease: lease, scope: .sessionOperate) { api in
      try await api.remoteWriteProjectFile(
        location: lease.location,
        path: path,
        content: content,
        baseModifiedAtMs: baseModifiedAtMs
      )
    }
  }

  func getGitStatus(
    detail: ProjectGitStatusDetail?,
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectGitStatus {
    try await execute(lease: lease, scope: .sessionRead) { api in
      try await api.remoteGetGitStatus(location: lease.location, detail: detail)
    }
  }

  func getGitDiff(
    filePath: String?,
    staged: Bool,
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectGitDiffResult {
    try await execute(lease: lease, scope: .sessionRead) { api in
      try await api.remoteGetGitDiff(
        location: lease.location,
        filePath: filePath,
        staged: staged
      )
    }
  }

  func getGitDiffBatch(
    untrackedPaths: [String],
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectGitDiffBatchResult {
    try await execute(lease: lease, scope: .sessionRead) { api in
      try await api.remoteGetGitDiffBatch(
        location: lease.location,
        untrackedPaths: untrackedPaths
      )
    }
  }

  func getGitFileContent(
    filePath: String,
    staged: Bool,
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectGitFileContentResult {
    try await execute(lease: lease, scope: .sessionRead) { api in
      try await api.remoteGetGitFileContent(
        location: lease.location,
        filePath: filePath,
        staged: staged
      )
    }
  }

  func gitProjectSnapshot(
    includeGhCheck: Bool,
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectGitSnapshot {
    try await execute(lease: lease, scope: .sessionRead) { api in
      try await api.remoteGitProjectSnapshot(
        location: lease.location,
        includeGhCheck: includeGhCheck
      )
    }
  }

  private func execute<Value: Sendable>(
    lease: ProjectWorkspaceLease,
    scope: ProjectControllerCapability,
    operation: @escaping @Sendable (any ProjectWorkspaceRemoteAPI) async throws -> Value
  ) async throws -> Value {
    try Task.checkCancellation()
    guard lease.isConsistent else { throw CancellationError() }
    let selection = await selectionProvider()
    guard let selection,
      selection.context.isConsistent,
      selection.context.lease == lease
    else { throw CancellationError() }

    if let failure = selection.context.session.gate(scope) {
      throw Self.gatewayError(for: failure, requiredScope: scope.rawValue)
    }

    do {
      let value = try await operation(selection.api)
      try Task.checkCancellation()
      let current = await selectionProvider()
      guard current?.context.isConsistent == true, current?.context.lease == lease else {
        throw CancellationError()
      }
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
