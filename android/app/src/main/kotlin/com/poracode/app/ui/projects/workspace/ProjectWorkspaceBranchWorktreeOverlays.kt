package com.poracode.app.ui.projects.workspace

import androidx.compose.runtime.Composable
import com.poracode.app.model.GitOperationRequest
import com.poracode.app.model.ProjectLocation

/**
 * Branch and worktree pickers for [ProjectWorkspaceScreen]. Both overlays submit through the same
 * [onSubmitGit] channel as the Git pane, so the request building lives here rather than at the
 * screen call site.
 */
@Composable
internal fun ProjectWorkspaceBranchWorktreeOverlays(
    location: ProjectLocation,
    branches: GitBranchListResult?,
    worktrees: List<GitWorktreeInfo>?,
    enabled: Boolean,
    showingBranches: Boolean,
    showingWorktrees: Boolean,
    onSubmitGit: (GitOperationRequest) -> Unit,
    onDismissBranches: () -> Unit,
    onDismissWorktrees: () -> Unit,
) {
    ProjectWorkspaceBranchOverlay(
        visible = showingBranches,
        branchList = branches,
        enabled = enabled,
        onSwitch = { branch -> onSubmitGit(gitSwitchBranchRequest(location, branch)) },
        onDelete = { branch -> onSubmitGit(gitDeleteBranchRequest(location, branch)) },
        onDismiss = onDismissBranches,
    )

    ProjectWorkspaceWorktreeOverlay(
        visible = showingWorktrees,
        worktrees = worktrees,
        enabled = enabled,
        onPullFromSource = { _, sourceBranch ->
            onSubmitGit(gitPullFromSourceRequest(location, sourceBranch))
        },
        onMergeToSource = { worktree, sourceBranch ->
            onSubmitGit(gitMergeToSourceRequest(location, worktree, sourceBranch))
        },
        onAbortMerge = { _ -> onSubmitGit(gitAbortMergeRequest(location)) },
        onFinishMerge = { _ -> onSubmitGit(gitFinishMergeRequest(location)) },
        onRemove = { worktree -> onSubmitGit(gitRemoveWorktreeRequest(location, worktree.path)) },
        onDismiss = onDismissWorktrees,
    )
}
