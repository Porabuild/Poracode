import Foundation

enum GitOperationsLoadState: Equatable, Sendable {
  case idle
  case loading(GitOperationProcedure)
  case loaded
  case failed(ProjectOperationFailure)
}

struct GitOperationsAuthoritativeState: Equatable, Sendable {
  var branches: ProjectGitBranchList?
  var worktrees: [ProjectGitWorktreeInfo]?
  var worktreeStatuses: [String: ProjectGitStatus] = [:]
  var owner: GitWorktreeOwnerResult?
  var sourceBranch: GitWorktreeSourceBranchResult?
}

struct GitOperationsPendingConfirmation: Identifiable, Equatable, Sendable {
  let id: UUID
  let request: GitOperationRequest
  let lease: ProjectWorkspaceLease

  init(request: GitOperationRequest, lease: ProjectWorkspaceLease, id: UUID = UUID()) {
    self.id = id
    self.request = request
    self.lease = lease
  }
}

struct GitOperationsControllerState: Equatable, Sendable {
  var context: ProjectWorkspaceContext?
  var authoritative = GitOperationsAuthoritativeState()
  var loadState: GitOperationsLoadState = .idle
  var activeMutation: GitOperationProcedure?
  var lastResult: GitOperationResult?
  var failure: ProjectOperationFailure?
  var pendingConfirmation: GitOperationsPendingConfirmation?
  var requiresAuthoritativeRefresh = false
  var completedMutationCount: UInt64 = 0

  var isBusy: Bool { activeMutation != nil }
}

extension GitOperationProcedure {
  var requiresConfirmation: Bool {
    switch self {
    case .gitAbortMerge, .gitDeleteBranch, .gitPruneWorktrees, .gitRemoveWorktree,
      .gitRevert, .gitRevertAll:
      true
    default:
      false
    }
  }
}
