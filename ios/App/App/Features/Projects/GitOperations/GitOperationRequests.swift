import Foundation

struct GitLocationRequest: Codable, Equatable, Sendable {
  let projectLocation: ProjectLocation
}

struct GitMergeStateRequest: Codable, Equatable, Sendable {
  let worktreeLocation: ProjectLocation
  var reapplyStashCommit: String?
}

struct GitAddRemoteRequest: Codable, Equatable, Sendable {
  let projectLocation: ProjectLocation
  let remote: String
  let url: String
}

struct GitAddWorktreeRequest: Codable, Equatable, Sendable {
  let projectLocation: ProjectLocation
  var branch: String?
  var copyIgnoredPatterns: [String]?
  var createBranch: Bool?
  var keepChangesInSource: Bool?
  var ownerToken: String?
  var path: String?
  var sourceBranch: String?
  var startPoint: String?
  var transferUncommitted: Bool?
  var worktreeOmitRepoDir: Bool?
  var worktreeRoot: String?
}

struct GitCommitRequest: Codable, Equatable, Sendable {
  let projectLocation: ProjectLocation
  let message: String
  var addAll: Bool?
  var reapplyStashCommit: String?
}

struct GitDeleteBranchRequest: Codable, Equatable, Sendable {
  let projectLocation: ProjectLocation
  let branch: String
  var expectedOwnerToken: String?
  var force: Bool?
  var remote: String?
}

struct GitFetchRequest: Codable, Equatable, Sendable {
  let projectLocation: ProjectLocation
  var prune: Bool?
  var remote: String?
}

struct GitBranchRequest: Codable, Equatable, Sendable {
  let projectLocation: ProjectLocation
  let branch: String
}

struct GitSourceBranchRequest: Codable, Equatable, Sendable {
  let projectLocation: ProjectLocation
  let branch: String
  var sourceBranchOverride: String?
}

struct GitListBranchesRequest: Codable, Equatable, Sendable {
  let projectLocation: ProjectLocation
  var includeRemote: Bool?
}

struct GitMergeToSourceRequest: Codable, Equatable, Sendable {
  let projectLocation: ProjectLocation
  let worktreeLocation: ProjectLocation
  let worktreeBranch: String
  let sourceBranch: String
  var expectedWorktreeCommit: String?
}

struct GitPruneWorktreesRequest: Codable, Equatable, Sendable {
  let projectLocation: ProjectLocation
  let activeWorktreePaths: [String]
}

struct GitPullRequest: Codable, Equatable, Sendable {
  let projectLocation: ProjectLocation
  var preserveLocalChanges: Bool?
  var remote: String?
}

struct GitPullFromSourceRequest: Codable, Equatable, Sendable {
  let worktreeLocation: ProjectLocation
  let sourceBranch: String
  var preserveLocalChanges: Bool?
}

struct GitPushRequest: Codable, Equatable, Sendable {
  let projectLocation: ProjectLocation
  var branch: String?
  var remote: String?
  var setUpstream: Bool?
}

struct GitRemoveWorktreeRequest: Codable, Equatable, Sendable {
  let projectLocation: ProjectLocation
  let path: String
  var deleteBranch: Bool?
  var expectedBranch: String?
  var expectedOwnerToken: String?
  var force: Bool?
}

struct GitFileRequest: Codable, Equatable, Sendable {
  let projectLocation: ProjectLocation
  let filePath: String
}

struct GitSwitchBranchRequest: Codable, Equatable, Sendable {
  let projectLocation: ProjectLocation
  let branch: String
  var createNew: Bool?
}

struct GitRemoteRequest: Codable, Equatable, Sendable {
  let projectLocation: ProjectLocation
  var remote: String?
}

struct GitWorktreeStatusBatchRequest: Codable, Equatable, Sendable {
  let projectLocation: ProjectLocation
  let worktreePaths: [String]
  var detail: ProjectGitStatusDetail?
}
