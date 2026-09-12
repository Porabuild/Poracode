import Foundation

enum GitOperationsStrings {
  static let title = localized("gitOperations.title", "Git Operations")
  static let repository = localized("gitOperations.repository", "Repository")
  static let branches = localized("gitOperations.branches", "Branches")
  static let worktrees = localized("gitOperations.worktrees", "Worktrees")
  static let commitMessage = localized("gitOperations.commit.message", "Commit message")
  static let commit = localized("gitOperations.commit", "Commit")
  static let quickActions = localized("gitOperations.quickActions", "Quick Actions")
  static let refresh = localized("gitOperations.refresh", "Refresh")
  static let remoteName = localized("gitOperations.remote.name", "Remote name")
  static let remoteURL = localized("gitOperations.remote.url", "Remote URL")
  static let branchName = localized("gitOperations.branch.name", "Branch name")
  static let worktreePath = localized("gitOperations.worktree.path", "Worktree path")
  static let createBranch = localized("gitOperations.branch.create", "Create branch")
  static let add = localized("gitOperations.add", "Add")
  static let cancel = localized("gitOperations.cancel", "Cancel")
  static let confirm = localized("gitOperations.confirm", "Continue")
  static let destructiveTitle = localized(
    "gitOperations.confirm.title", "Confirm Git operation"
  )
  static let destructiveMessage = localized(
    "gitOperations.confirm.message",
    "This operation can permanently discard repository data."
  )
  static let unavailable = localized(
    "gitOperations.unavailable", "Git operations are unavailable."
  )
  static let busy = localized("gitOperations.busy", "Another Git operation is running.")
  static let uncertain = localized(
    "gitOperations.uncertain",
    "The result was uncertain. Repository state was refreshed."
  )

  static func action(_ procedure: GitOperationProcedure) -> String {
    localized("gitOperations.action.\(procedure.rawValue)", fallbackAction(procedure))
  }

  static func branch(_ name: String) -> String {
    format("gitOperations.branch.format", "Branch: %1$@", name)
  }

  static func worktree(_ path: String) -> String {
    format("gitOperations.worktree.format", "Worktree: %1$@", path)
  }

  static func failure(_ failure: ProjectOperationFailure) -> String {
    switch failure {
    case .busy: busy
    case .ambiguousOutcome: uncertain
    default: unavailable
    }
  }

  private static func fallbackAction(_ procedure: GitOperationProcedure) -> String {
    switch procedure {
    case .gitAbortMerge: "Abort Merge"
    case .gitAddRemote: "Add Remote"
    case .gitAddWorktree: "Add Worktree"
    case .gitCommit: "Commit"
    case .gitDeleteBranch: "Delete Branch"
    case .gitFetch: "Fetch"
    case .gitFinishMerge: "Finish Merge"
    case .gitGetWorktreeOwner: "Get Worktree Owner"
    case .gitGetWorktreeSourceBranch: "Get Source Branch"
    case .gitInit: "Initialize Repository"
    case .gitListBranches: "List Branches"
    case .gitListWorktrees: "List Worktrees"
    case .gitMergeToSource: "Merge to Source"
    case .gitPruneWorktrees: "Prune Worktrees"
    case .gitPull: "Pull"
    case .gitPullFromSource: "Pull from Source"
    case .gitPullRebase: "Pull with Rebase"
    case .gitPush: "Push"
    case .gitRemoveWorktree: "Remove Worktree"
    case .gitRevert: "Revert File"
    case .gitRevertAll: "Revert All"
    case .gitStage: "Stage File"
    case .gitStageAll: "Stage All"
    case .gitSwitchBranch: "Switch Branch"
    case .gitSync: "Sync"
    case .gitSyncRebase: "Sync with Rebase"
    case .gitUnstage: "Unstage File"
    case .gitUnstageAll: "Unstage All"
    case .gitWorktreeStatusBatch: "Refresh Worktree Status"
    }
  }

  private static func localized(_ key: String, _ fallback: String) -> String {
    NSLocalizedString(
      key,
      tableName: "GitOperations",
      bundle: .main,
      value: fallback,
      comment: ""
    )
  }

  private static func format(
    _ key: String,
    _ fallback: String,
    _ arguments: CVarArg...
  ) -> String {
    String(
      format: localized(key, fallback),
      locale: .autoupdatingCurrent,
      arguments: arguments
    )
  }
}
