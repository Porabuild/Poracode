import Foundation

struct GitAbortMergeResult: Codable, Equatable, Sendable {
  var stashPreserved: Bool?
  var stashReapplied: Bool?
}

struct GitAddWorktreeResult: Codable, Equatable, Sendable {
  let path: String
  var changesTransferred: Bool?
}

struct GitCommitResult: Codable, Equatable, Sendable {
  let hash: String
  let message: String
  var conflictFiles: [String]?
  var reapplyConflicting: Bool?
  var stashPreserved: Bool?
  var stashReapplied: Bool?
}

struct GitFinishMergeResult: Codable, Equatable, Sendable {
  let success: Bool
  var conflictFiles: [String]?
  var error: String?
  var reapplyConflicting: Bool?
  var stashPreserved: Bool?
  var stashReapplied: Bool?
}

struct GitWorktreeOwnerResult: Codable, Equatable, Sendable {
  let ownerToken: String?
}

struct GitWorktreeSourceBranchResult: Codable, Equatable, Sendable {
  let sourceBranch: String?
  let commitsAhead: Int
  let sourceAhead: Int
}

struct GitWorktreeListResult: Codable, Equatable, Sendable {
  let worktrees: [ProjectGitWorktreeInfo]
}

struct GitMergeToSourceResult: Codable, Equatable, Sendable {
  let merged: Bool
  let fastForward: Bool
  let newSourceCommit: String
  var conflictFiles: [String]?
  var error: String?
}

struct GitPullFromSourceResult: Codable, Equatable, Sendable {
  let merged: Bool
  let fastForward: Bool
  var conflictFiles: [String]?
  var conflicting: Bool?
  var error: String?
  var needsStash: Bool?
  var reapplyConflicting: Bool?
  var stashCommit: String?
  var stashPreserved: Bool?
}

struct GitSwitchBranchResult: Codable, Equatable, Sendable {
  let branch: String
  let created: Bool
  let tracking: String
  let ahead: Int
  let behind: Int
}

struct GitSyncResult: Codable, Equatable, Sendable {
  let pulled: Bool
  let pushed: Bool
}

struct GitWorktreeStatusBatchResult: Codable, Equatable, Sendable {
  let statuses: [String: ProjectGitStatus]
}

enum GitOperationResult: Equatable, Sendable {
  case omitted
  case abortMerge(GitAbortMergeResult)
  case addWorktree(GitAddWorktreeResult)
  case commit(GitCommitResult)
  case finishMerge(GitFinishMergeResult)
  case worktreeOwner(GitWorktreeOwnerResult)
  case worktreeSourceBranch(GitWorktreeSourceBranchResult)
  case branches(ProjectGitBranchList)
  case worktrees(GitWorktreeListResult)
  case mergeToSource(GitMergeToSourceResult)
  case pullFromSource(GitPullFromSourceResult)
  case switchBranch(GitSwitchBranchResult)
  case sync(GitSyncResult)
  case worktreeStatuses(GitWorktreeStatusBatchResult)
}
