import Foundation

extension GeneratedRemoteV3Contract {
  static func searchProjectFilesEnvelope(
    location: ProjectLocation,
    query: String,
    limit: Int,
    searchConfig: ProjectWorkspaceSearchConfig?
  ) throws -> Data {
    try workspaceEnvelope(
      name: "searchProjectFiles",
      request: ProjectWorkspaceSearchRequest(
        projectLocation: location,
        query: query,
        limit: limit,
        searchConfig: searchConfig
      ),
      codec: RemoteRootCodecs.procedureU2ESearchProjectFilesU2ERequest
    )
  }

  static func searchProjectFilesResult(_ envelope: Data) throws -> Data {
    try workspaceResult(
      envelope,
      codec: RemoteRootCodecs.procedureU2ESearchProjectFilesU2EResult,
      boundary: "search project files result"
    )
  }

  static func listProjectTreeEnvelope(
    location: ProjectLocation,
    directoryPath: String
  ) throws -> Data {
    try workspaceEnvelope(
      name: "listProjectTree",
      request: ProjectTreeListRequest(
        projectLocation: location,
        directoryPath: directoryPath
      ),
      codec: RemoteRootCodecs.procedureU2EListProjectTreeU2ERequest
    )
  }

  static func listProjectTreeResult(_ envelope: Data) throws -> Data {
    try workspaceResult(
      envelope,
      codec: RemoteRootCodecs.procedureU2EListProjectTreeU2EResult,
      boundary: "list project tree result"
    )
  }

  static func searchProjectTreeEnvelope(
    location: ProjectLocation,
    query: String,
    limit: Int,
    searchConfig: ProjectWorkspaceSearchConfig?
  ) throws -> Data {
    try workspaceEnvelope(
      name: "searchProjectTree",
      request: ProjectWorkspaceSearchRequest(
        projectLocation: location,
        query: query,
        limit: limit,
        searchConfig: searchConfig
      ),
      codec: RemoteRootCodecs.procedureU2ESearchProjectTreeU2ERequest
    )
  }

  static func searchProjectTreeResult(_ envelope: Data) throws -> Data {
    try workspaceResult(
      envelope,
      codec: RemoteRootCodecs.procedureU2ESearchProjectTreeU2EResult,
      boundary: "search project tree result"
    )
  }

  static func readProjectFileEnvelope(
    location: ProjectLocation,
    path: String
  ) throws -> Data {
    try workspaceEnvelope(
      name: "readProjectFile",
      request: ProjectFilePathRequest(projectLocation: location, path: path),
      codec: RemoteRootCodecs.procedureU2EReadProjectFileU2ERequest
    )
  }

  static func readProjectFileResult(_ envelope: Data) throws -> Data {
    try workspaceResult(
      envelope,
      codec: RemoteRootCodecs.procedureU2EReadProjectFileU2EResult,
      boundary: "read project file result"
    )
  }

  static func writeProjectFileEnvelope(
    location: ProjectLocation,
    path: String,
    content: String,
    baseModifiedAtMs: Double
  ) throws -> Data {
    try workspaceEnvelope(
      name: "writeProjectFile",
      request: ProjectFileWriteRequest(
        projectLocation: location,
        path: path,
        content: content,
        baseModifiedAtMs: baseModifiedAtMs
      ),
      codec: RemoteRootCodecs.procedureU2EWriteProjectFileU2ERequest
    )
  }

  static func writeProjectFileResult(_ envelope: Data) throws -> Data {
    try workspaceResult(
      envelope,
      codec: RemoteRootCodecs.procedureU2EWriteProjectFileU2EResult,
      boundary: "write project file result"
    )
  }

  static func getGitStatusEnvelope(
    location: ProjectLocation,
    detail: ProjectGitStatusDetail?
  ) throws -> Data {
    try workspaceEnvelope(
      name: "getGitStatus",
      request: ProjectGitStatusRequest(projectLocation: location, detail: detail),
      codec: RemoteRootCodecs.procedureU2EGetGitStatusU2ERequest
    )
  }

  static func getGitStatusResult(_ envelope: Data) throws -> Data {
    try workspaceResult(
      envelope,
      codec: RemoteRootCodecs.procedureU2EGetGitStatusU2EResult,
      boundary: "get Git status result"
    )
  }

  static func getGitDiffEnvelope(
    location: ProjectLocation,
    filePath: String?,
    staged: Bool
  ) throws -> Data {
    try workspaceEnvelope(
      name: "getGitDiff",
      request: ProjectGitDiffRequest(
        projectLocation: location,
        filePath: filePath,
        staged: staged
      ),
      codec: RemoteRootCodecs.procedureU2EGetGitDiffU2ERequest
    )
  }

  static func getGitDiffResult(_ envelope: Data) throws -> Data {
    try workspaceResult(
      envelope,
      codec: RemoteRootCodecs.procedureU2EGetGitDiffU2EResult,
      boundary: "get Git diff result"
    )
  }

  static func getGitDiffBatchEnvelope(
    location: ProjectLocation,
    untrackedPaths: [String]
  ) throws -> Data {
    try workspaceEnvelope(
      name: "getGitDiffBatch",
      request: ProjectGitDiffBatchRequest(
        projectLocation: location,
        untrackedPaths: untrackedPaths
      ),
      codec: RemoteRootCodecs.procedureU2EGetGitDiffBatchU2ERequest
    )
  }

  static func getGitDiffBatchResult(_ envelope: Data) throws -> Data {
    try workspaceResult(
      envelope,
      codec: RemoteRootCodecs.procedureU2EGetGitDiffBatchU2EResult,
      boundary: "get Git diff batch result"
    )
  }

  static func getGitFileContentEnvelope(
    location: ProjectLocation,
    filePath: String,
    staged: Bool
  ) throws -> Data {
    try workspaceEnvelope(
      name: "getGitFileContent",
      request: ProjectGitFileContentRequest(
        projectLocation: location,
        filePath: filePath,
        staged: staged
      ),
      codec: RemoteRootCodecs.procedureU2EGetGitFileContentU2ERequest
    )
  }

  static func getGitFileContentResult(_ envelope: Data) throws -> Data {
    try workspaceResult(
      envelope,
      codec: RemoteRootCodecs.procedureU2EGetGitFileContentU2EResult,
      boundary: "get Git file content result"
    )
  }

  static func gitProjectSnapshotEnvelope(
    location: ProjectLocation,
    includeGhCheck: Bool
  ) throws -> Data {
    try workspaceEnvelope(
      name: "gitProjectSnapshot",
      request: ProjectGitSnapshotRequest(
        projectLocation: location,
        includeGhCheck: includeGhCheck
      ),
      codec: RemoteRootCodecs.procedureU2EGitProjectSnapshotU2ERequest
    )
  }

  static func gitProjectSnapshotResult(_ envelope: Data) throws -> Data {
    try workspaceResult(
      envelope,
      codec: RemoteRootCodecs.procedureU2EGitProjectSnapshotU2EResult,
      boundary: "Git project snapshot result"
    )
  }

  private static func workspaceEnvelope<Request: Encodable, Canonical: Codable & Sendable>(
    name: String,
    request: Request,
    codec: RemoteRootCodec<Canonical>
  ) throws -> Data {
    let payload = try canonicalData(
      try jsonData(request),
      codec: codec,
      boundary: "\(name) request"
    )
    return try procedureEnvelope(name: name, payload: payload)
  }

  private static func workspaceResult<Canonical: Codable & Sendable>(
    _ envelope: Data,
    codec: RemoteRootCodec<Canonical>,
    boundary: String
  ) throws -> Data {
    try procedureResult(envelope, codec: codec, boundary: boundary)
  }
}

private struct ProjectWorkspaceSearchRequest: Encodable {
  let projectLocation: ProjectLocation
  let query: String
  let limit: Int
  let searchConfig: ProjectWorkspaceSearchConfig?
}

private struct ProjectTreeListRequest: Encodable {
  let projectLocation: ProjectLocation
  let directoryPath: String
}

private struct ProjectFilePathRequest: Encodable {
  let projectLocation: ProjectLocation
  let path: String
}

private struct ProjectFileWriteRequest: Encodable {
  let projectLocation: ProjectLocation
  let path: String
  let content: String
  let baseModifiedAtMs: Double
}

private struct ProjectGitStatusRequest: Encodable {
  let projectLocation: ProjectLocation
  let detail: ProjectGitStatusDetail?
}

private struct ProjectGitDiffRequest: Encodable {
  let projectLocation: ProjectLocation
  let filePath: String?
  let staged: Bool
}

private struct ProjectGitDiffBatchRequest: Encodable {
  let projectLocation: ProjectLocation
  let untrackedPaths: [String]
}

private struct ProjectGitFileContentRequest: Encodable {
  let projectLocation: ProjectLocation
  let filePath: String
  let staged: Bool
}

private struct ProjectGitSnapshotRequest: Encodable {
  let projectLocation: ProjectLocation
  let includeGhCheck: Bool
}
