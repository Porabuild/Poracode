import Foundation

/// Generated-contract-backed project workspace and Git read surface.
protocol ProjectWorkspaceRemoteAPI: Sendable {
  func remoteSearchProjectFiles(
    location: ProjectLocation,
    query: String,
    limit: Int,
    searchConfig: ProjectWorkspaceSearchConfig?
  ) async throws -> ProjectFileSearchResult

  func remoteListProjectTree(
    location: ProjectLocation,
    directoryPath: String
  ) async throws -> ProjectTreeResult

  func remoteSearchProjectTree(
    location: ProjectLocation,
    query: String,
    limit: Int,
    searchConfig: ProjectWorkspaceSearchConfig?
  ) async throws -> ProjectTreeSearchResult

  func remoteReadProjectFile(
    location: ProjectLocation,
    path: String
  ) async throws -> ProjectFileReadResult

  func remoteWriteProjectFile(
    location: ProjectLocation,
    path: String,
    content: String,
    baseModifiedAtMs: Double
  ) async throws -> ProjectFileWriteResult

  func remoteCreateProjectEntry(
    location: ProjectLocation,
    path: String,
    type: AdvancedProjectEntryType
  ) async throws

  func remoteRenameProjectEntry(
    location: ProjectLocation,
    path: String,
    nextName: String
  ) async throws

  func remoteMoveProjectEntry(
    location: ProjectLocation,
    path: String,
    nextParentPath: String?
  ) async throws

  func remoteDeleteProjectEntry(
    location: ProjectLocation,
    path: String
  ) async throws

  func remoteGetGitStatus(
    location: ProjectLocation,
    detail: ProjectGitStatusDetail?
  ) async throws -> ProjectGitStatus

  func remoteGetGitDiff(
    location: ProjectLocation,
    filePath: String?,
    staged: Bool
  ) async throws -> ProjectGitDiffResult

  func remoteGetGitDiffBatch(
    location: ProjectLocation,
    untrackedPaths: [String]
  ) async throws -> ProjectGitDiffBatchResult

  func remoteGetGitFileContent(
    location: ProjectLocation,
    filePath: String,
    staged: Bool
  ) async throws -> ProjectGitFileContentResult

  func remoteGitProjectSnapshot(
    location: ProjectLocation,
    includeGhCheck: Bool
  ) async throws -> ProjectGitSnapshot
}

extension RemoteAPIClient: ProjectWorkspaceRemoteAPI {
  func remoteSearchProjectFiles(
    location: ProjectLocation,
    query: String,
    limit: Int,
    searchConfig: ProjectWorkspaceSearchConfig?
  ) async throws -> ProjectFileSearchResult {
    let body = try GeneratedRemoteV3Contract.searchProjectFilesEnvelope(
      location: location,
      query: query,
      limit: limit,
      searchConfig: searchConfig
    )
    let response = try await projectWorkspaceRequest(body)
    let canonical = try GeneratedRemoteV3Contract.searchProjectFilesResult(response)
    return try JSONDecoding.decode(ProjectFileSearchResult.self, from: canonical)
  }

  func remoteListProjectTree(
    location: ProjectLocation,
    directoryPath: String
  ) async throws -> ProjectTreeResult {
    let body = try GeneratedRemoteV3Contract.listProjectTreeEnvelope(
      location: location,
      directoryPath: directoryPath
    )
    let response = try await projectWorkspaceRequest(body)
    let canonical = try GeneratedRemoteV3Contract.listProjectTreeResult(response)
    return try JSONDecoding.decode(ProjectTreeResult.self, from: canonical)
  }

  func remoteSearchProjectTree(
    location: ProjectLocation,
    query: String,
    limit: Int,
    searchConfig: ProjectWorkspaceSearchConfig?
  ) async throws -> ProjectTreeSearchResult {
    let body = try GeneratedRemoteV3Contract.searchProjectTreeEnvelope(
      location: location,
      query: query,
      limit: limit,
      searchConfig: searchConfig
    )
    let response = try await projectWorkspaceRequest(body)
    let canonical = try GeneratedRemoteV3Contract.searchProjectTreeResult(response)
    return try JSONDecoding.decode(ProjectTreeSearchResult.self, from: canonical)
  }

  func remoteReadProjectFile(
    location: ProjectLocation,
    path: String
  ) async throws -> ProjectFileReadResult {
    let body = try GeneratedRemoteV3Contract.readProjectFileEnvelope(
      location: location,
      path: path
    )
    let response = try await projectWorkspaceRequest(body)
    let canonical = try GeneratedRemoteV3Contract.readProjectFileResult(response)
    return try JSONDecoding.decode(ProjectFileReadResult.self, from: canonical)
  }

  func remoteWriteProjectFile(
    location: ProjectLocation,
    path: String,
    content: String,
    baseModifiedAtMs: Double
  ) async throws -> ProjectFileWriteResult {
    let body = try GeneratedRemoteV3Contract.writeProjectFileEnvelope(
      location: location,
      path: path,
      content: content,
      baseModifiedAtMs: baseModifiedAtMs
    )
    let response = try await projectWorkspaceMutationRequest(body)
    do {
      let canonical = try GeneratedRemoteV3Contract.writeProjectFileResult(response)
      return try JSONDecoding.decode(ProjectFileWriteResult.self, from: canonical)
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      throw ProjectRemoteMutationError.ambiguousOutcome
    }
  }

  func remoteCreateProjectEntry(
    location: ProjectLocation,
    path: String,
    type: AdvancedProjectEntryType
  ) async throws {
    try await remoteProjectEntryMutation(
      .createProjectEntry(
        .init(projectLocation: location, path: path, entryType: type)
      )
    )
  }

  func remoteRenameProjectEntry(
    location: ProjectLocation,
    path: String,
    nextName: String
  ) async throws {
    try await remoteProjectEntryMutation(
      .renameProjectEntry(
        .init(projectLocation: location, path: path, nextName: nextName)
      )
    )
  }

  func remoteMoveProjectEntry(
    location: ProjectLocation,
    path: String,
    nextParentPath: String?
  ) async throws {
    try await remoteProjectEntryMutation(
      .moveProjectEntry(
        .init(projectLocation: location, path: path, nextParentPath: nextParentPath)
      )
    )
  }

  func remoteDeleteProjectEntry(
    location: ProjectLocation,
    path: String
  ) async throws {
    try await remoteProjectEntryMutation(
      .deleteProjectEntry(.init(projectLocation: location, path: path))
    )
  }

  func remoteGetGitStatus(
    location: ProjectLocation,
    detail: ProjectGitStatusDetail?
  ) async throws -> ProjectGitStatus {
    let body = try GeneratedRemoteV3Contract.getGitStatusEnvelope(
      location: location,
      detail: detail
    )
    let response = try await projectWorkspaceRequest(body)
    let canonical = try GeneratedRemoteV3Contract.getGitStatusResult(response)
    return try JSONDecoding.decode(ProjectGitStatus.self, from: canonical)
  }

  func remoteGetGitDiff(
    location: ProjectLocation,
    filePath: String?,
    staged: Bool
  ) async throws -> ProjectGitDiffResult {
    let body = try GeneratedRemoteV3Contract.getGitDiffEnvelope(
      location: location,
      filePath: filePath,
      staged: staged
    )
    let response = try await projectWorkspaceRequest(body)
    let canonical = try GeneratedRemoteV3Contract.getGitDiffResult(response)
    return try JSONDecoding.decode(ProjectGitDiffResult.self, from: canonical)
  }

  func remoteGetGitDiffBatch(
    location: ProjectLocation,
    untrackedPaths: [String]
  ) async throws -> ProjectGitDiffBatchResult {
    let body = try GeneratedRemoteV3Contract.getGitDiffBatchEnvelope(
      location: location,
      untrackedPaths: untrackedPaths
    )
    let response = try await projectWorkspaceRequest(body)
    let canonical = try GeneratedRemoteV3Contract.getGitDiffBatchResult(response)
    return try JSONDecoding.decode(ProjectGitDiffBatchResult.self, from: canonical)
  }

  func remoteGetGitFileContent(
    location: ProjectLocation,
    filePath: String,
    staged: Bool
  ) async throws -> ProjectGitFileContentResult {
    let body = try GeneratedRemoteV3Contract.getGitFileContentEnvelope(
      location: location,
      filePath: filePath,
      staged: staged
    )
    let response = try await projectWorkspaceRequest(body)
    let canonical = try GeneratedRemoteV3Contract.getGitFileContentResult(response)
    return try JSONDecoding.decode(ProjectGitFileContentResult.self, from: canonical)
  }

  func remoteGitProjectSnapshot(
    location: ProjectLocation,
    includeGhCheck: Bool
  ) async throws -> ProjectGitSnapshot {
    let body = try GeneratedRemoteV3Contract.gitProjectSnapshotEnvelope(
      location: location,
      includeGhCheck: includeGhCheck
    )
    let response = try await projectWorkspaceRequest(body)
    let canonical = try GeneratedRemoteV3Contract.gitProjectSnapshotResult(response)
    return try JSONDecoding.decode(ProjectGitSnapshot.self, from: canonical)
  }

  private func projectWorkspaceRequest(_ body: Data) async throws -> Data {
    try await requestData(path: "/api/git/call", method: "POST", jsonBody: body)
  }

  /// The file write is submitted exactly once. A transport failure after submission cannot
  /// establish whether the host committed it, so callers must reconcile with a fresh read.
  private func projectWorkspaceMutationRequest(_ body: Data) async throws -> Data {
    do {
      return try await projectWorkspaceRequest(body)
    } catch is CancellationError {
      throw CancellationError()
    } catch let error as RemoteClientError
      where RemoteMutationClassification.classify(statusCode: error.status, code: error.code)
      == .requestMayHaveCommitted
    {
      throw ProjectRemoteMutationError.ambiguousOutcome
    } catch {
      throw error
    }
  }

  private func remoteProjectEntryMutation(_ request: AdvancedOperationRequest) async throws {
    let body = try AdvancedOperationsRemoteV3Contract.requestEnvelope(request)
    let response = try await projectWorkspaceMutationRequest(body)
    do {
      let result = try AdvancedOperationsRemoteV3Contract.result(
        for: request.procedure,
        envelope: response
      )
      guard result == .omitted else { throw ProjectSessionGatewayError.invalidResponse }
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      throw ProjectRemoteMutationError.ambiguousOutcome
    }
  }
}
