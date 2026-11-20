import Foundation

/// Exact ownership token for work tied to one host generation and one project selection.
///
/// `projectGeneration` must advance whenever the selected project or its location changes.
/// Keeping it separate from the host work generation prevents an old completion from a
/// previous selection of the same project from installing into the current workspace.
struct ProjectWorkspaceLease: Equatable, Hashable, Sendable {
  let hostLease: ProjectControllerHostLease
  let project: ProjectIdentity
  let location: ProjectLocation
  let projectGeneration: UInt64

  var isConsistent: Bool {
    project.connectionId == hostLease.connectionId
  }

  func hasSameEditorOwner(as previous: Self) -> Bool {
    project == previous.project && location == previous.location
      && projectGeneration == previous.projectGeneration
  }
}

struct ProjectWorkspaceContext: Equatable, Sendable {
  let session: ProjectControllerSession
  let lease: ProjectWorkspaceLease

  var isConsistent: Bool {
    lease.isConsistent && session.lease == lease.hostLease
  }
}

protocol ProjectWorkspaceGateway: Sendable {
  func searchProjectFiles(
    query: String,
    limit: Int,
    searchConfig: ProjectWorkspaceSearchConfig?,
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectFileSearchResult

  func listProjectTree(
    directoryPath: String,
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectTreeResult

  func searchProjectTree(
    query: String,
    limit: Int,
    searchConfig: ProjectWorkspaceSearchConfig?,
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectTreeSearchResult

  func readProjectFile(
    path: String,
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectFileReadResult

  func writeProjectFile(
    path: String,
    content: String,
    baseModifiedAtMs: Double,
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectFileWriteResult

  func createProjectEntry(
    path: String,
    type: AdvancedProjectEntryType,
    lease: ProjectWorkspaceLease
  ) async throws

  func renameProjectEntry(
    path: String,
    nextName: String,
    lease: ProjectWorkspaceLease
  ) async throws

  func moveProjectEntry(
    path: String,
    nextParentPath: String?,
    lease: ProjectWorkspaceLease
  ) async throws

  func deleteProjectEntry(
    path: String,
    lease: ProjectWorkspaceLease
  ) async throws

  func getGitStatus(
    detail: ProjectGitStatusDetail?,
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectGitStatus

  func getGitDiff(
    filePath: String?,
    staged: Bool,
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectGitDiffResult

  func getGitDiffBatch(
    untrackedPaths: [String],
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectGitDiffBatchResult

  func getGitFileContent(
    filePath: String,
    staged: Bool,
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectGitFileContentResult

  func gitProjectSnapshot(
    includeGhCheck: Bool,
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectGitSnapshot
}

extension ProjectWorkspaceGateway {
  /// Prefer an exact root entry, then look for the basename in the project index.
  /// The literal root path remains usable when the listing or index is unavailable.
  func resolveBareFilename(_ filename: String, lease: ProjectWorkspaceLease) async throws -> String {
    do {
      let root = try await listProjectTree(directoryPath: "", lease: lease)
      if root.entries.contains(where: { $0.path == filename && $0.type == .file }) {
        return filename
      }
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      // A failed root listing does not prevent searching the workspace index.
    }

    do {
      let matches = try await searchProjectFiles(query: filename, limit: 5, searchConfig: nil, lease: lease)
      for entry in matches.entries where entry.type == .file && entry.name.caseInsensitiveCompare(filename) == .orderedSame {
        if RichChatFilePolicy.isSafeFileSource(entry.path),
          case .project(let path) = try? RichChatFilePolicy.resolve(entry.path, location: lease.location)
        {
          return path
        }
      }
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      // Offer the exact root path when the index cannot supply a match.
    }
    return filename
  }
}
