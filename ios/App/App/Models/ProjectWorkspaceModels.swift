import Foundation

struct ProjectWorkspaceSearchConfig: Codable, Equatable, Sendable {
  let useIgnoreFiles: Bool
  let excludePatterns: [String]
}

enum ProjectWorkspaceEntryType: String, Codable, Equatable, Sendable {
  case file
  case directory
}

struct ProjectWorkspaceEntry: Codable, Equatable, Hashable, Identifiable, Sendable {
  let path: String
  let name: String
  let type: ProjectWorkspaceEntryType
  var hasChildren: Bool?

  var id: String { "\(type.rawValue):\(path)" }
}

struct ProjectFileSearchResult: Codable, Equatable, Sendable {
  let entries: [ProjectWorkspaceEntry]
  let totalIndexed: Int
}

struct ProjectTreeResult: Codable, Equatable, Sendable {
  let directoryPath: String
  let entries: [ProjectWorkspaceEntry]
}

struct ProjectTreeSearchResult: Codable, Equatable, Sendable {
  let entries: [ProjectWorkspaceEntry]
}

enum ProjectFileReadStatus: String, Codable, Equatable, Sendable {
  case ready
  case binary
  case tooLarge = "too_large"
  case unsupported
}

enum ProjectFileLineEnding: String, Codable, Equatable, Sendable {
  case lf
  case crlf
}

struct ProjectFileReadResult: Codable, Equatable, Sendable {
  let path: String
  let status: ProjectFileReadStatus
  let modifiedAtMs: Double
  var content: String?
  var contentBase64: String?
  var lineEnding: ProjectFileLineEnding?
  var hasBom: Bool?
}

struct ProjectFileWriteResult: Codable, Equatable, Sendable {
  let modifiedAtMs: Double
}

enum ProjectGitStatusDetail: String, Codable, Equatable, Sendable {
  case summary
  case full
}

enum ProjectGitRemotePlatform: String, Codable, Equatable, Sendable {
  case github
  case gitlab
  case bitbucket
  case unknown
}

struct ProjectGitRemoteInfo: Codable, Equatable, Sendable {
  let url: String
  let platform: ProjectGitRemotePlatform
  let owner: String
  let repo: String
}

struct ProjectGitFileChange: Codable, Equatable, Hashable, Identifiable, Sendable {
  let path: String
  var oldPath: String?
  let status: String
  let staged: Bool
  let insertions: Int
  let deletions: Int

  var id: String { "\(staged ? "staged" : "unstaged"):\(path):\(oldPath ?? "")" }
}

struct ProjectGitStatus: Codable, Equatable, Sendable {
  var detail: ProjectGitStatusDetail?
  let isRepo: Bool
  let branch: String
  var headSha: String?
  let tracking: String
  let hasRemote: Bool
  let remoteInfo: ProjectGitRemoteInfo?
  let ahead: Int
  let behind: Int
  let staged: [ProjectGitFileChange]
  let unstaged: [ProjectGitFileChange]
  let totalInsertions: Int
  let totalDeletions: Int
  var mergeInProgress: Bool?
  var mergeMessage: String?
  var conflictFiles: [ProjectGitFileChange]?
}

struct ProjectGitDiffResult: Codable, Equatable, Sendable {
  let diff: String
}

struct ProjectGitDiffBatchResult: Codable, Equatable, Sendable {
  let staged: [String: String]
  let unstaged: [String: String]
}

struct ProjectGitFileContentResult: Codable, Equatable, Sendable {
  let oldContent: String
  let newContent: String
}

struct ProjectGitBranchInfo: Codable, Equatable, Hashable, Identifiable, Sendable {
  let name: String
  let current: Bool
  let commit: String
  let isRemote: Bool
  var remote: String?

  var id: String { "\(isRemote ? "remote" : "local"):\(name)" }
}

struct ProjectGitBranchList: Codable, Equatable, Sendable {
  let current: String
  let branches: [ProjectGitBranchInfo]
}

struct ProjectGitWorktreeInfo: Codable, Equatable, Hashable, Identifiable, Sendable {
  let path: String
  let branch: String
  let commit: String
  let isMain: Bool

  var id: String { path }
}

struct ProjectGitSnapshot: Codable, Equatable, Sendable {
  let status: ProjectGitStatus?
  let branches: ProjectGitBranchList?
  let worktrees: [ProjectGitWorktreeInfo]?
  let ghAvailable: Bool?
}
