import Foundation

enum GitOperationsActionRole: Equatable, Sendable {
  case standard
  case destructive
}

enum GitOperationsActionSurface: String, CaseIterable, Sendable {
  case authoritativeRefresh
  case repositoryQuick
  case repository
  case branch
  case worktree
  case file
}

struct GitOperationsActionDescriptor: Identifiable, Equatable, Sendable {
  let procedure: GitOperationProcedure
  let symbol: String
  let role: GitOperationsActionRole
  let surface: GitOperationsActionSurface

  var id: GitOperationProcedure { procedure }
  var accessibilityLabel: String { GitOperationsStrings.action(procedure) }
}

enum GitOperationsPresentation {
  static let actions: [GitOperationsActionDescriptor] = [
    action(.gitAbortMerge, "xmark.circle", .destructive, .worktree),
    action(.gitAddRemote, "network", .standard, .repository),
    action(.gitAddWorktree, "folder.badge.plus", .standard, .repository),
    action(.gitCommit, "checkmark.circle", .standard, .repository),
    action(.gitDeleteBranch, "trash", .destructive, .branch),
    action(.gitFetch, "arrow.down.circle", .standard, .repositoryQuick),
    action(.gitFinishMerge, "checkmark.circle.fill", .standard, .worktree),
    action(
      .gitGetWorktreeOwner, "person.crop.circle.badge.questionmark", .standard, .branch),
    action(.gitGetWorktreeSourceBranch, "arrow.triangle.branch", .standard, .branch),
    action(.gitInit, "externaldrive.badge.plus", .standard, .repository),
    action(.gitListBranches, "list.bullet", .standard, .authoritativeRefresh),
    action(.gitListWorktrees, "folder.on.folder", .standard, .authoritativeRefresh),
    action(.gitMergeToSource, "arrow.triangle.merge", .standard, .worktree),
    action(.gitPruneWorktrees, "trash.slash", .destructive, .repository),
    action(.gitPull, "arrow.down", .standard, .repositoryQuick),
    action(.gitPullFromSource, "arrow.down.to.line", .standard, .worktree),
    action(.gitPullRebase, "arrow.down.right.and.arrow.up.left", .standard, .repository),
    action(.gitPush, "arrow.up", .standard, .repositoryQuick),
    action(.gitRemoveWorktree, "folder.badge.minus", .destructive, .worktree),
    action(.gitRevert, "arrow.uturn.backward", .destructive, .file),
    action(.gitRevertAll, "arrow.uturn.backward.circle", .destructive, .repository),
    action(.gitStage, "plus.circle", .standard, .file),
    action(.gitStageAll, "plus.circle.fill", .standard, .repository),
    action(.gitSwitchBranch, "arrow.left.arrow.right", .standard, .branch),
    action(.gitSync, "arrow.triangle.2.circlepath", .standard, .repositoryQuick),
    action(.gitSyncRebase, "arrow.triangle.2.circlepath.circle", .standard, .repository),
    action(.gitUnstage, "minus.circle", .standard, .file),
    action(.gitUnstageAll, "minus.circle.fill", .standard, .repository),
    action(.gitWorktreeStatusBatch, "checklist", .standard, .authoritativeRefresh),
  ]

  static func descriptor(
    for procedure: GitOperationProcedure
  ) -> GitOperationsActionDescriptor {
    guard let descriptor = actions.first(where: { $0.procedure == procedure }) else {
      preconditionFailure("Missing Git operation presentation")
    }
    return descriptor
  }

  static func actions(on surface: GitOperationsActionSurface) -> [GitOperationsActionDescriptor] {
    actions.filter { $0.surface == surface }
  }

  private static func action(
    _ procedure: GitOperationProcedure,
    _ symbol: String,
    _ role: GitOperationsActionRole,
    _ surface: GitOperationsActionSurface
  ) -> GitOperationsActionDescriptor {
    .init(procedure: procedure, symbol: symbol, role: role, surface: surface)
  }
}
