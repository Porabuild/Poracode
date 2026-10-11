package com.poracode.app.ui.projects.workspace

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.poracode.app.R

/**
 * Confirmation and follow-up dialog/sheet cluster for [ProjectWorkspaceScreen]: the unsaved-draft
 * discard prompt, the Git confirmation-required dialog, the pending-mutation discard dialog, and
 * the branch/worktree list sheets. Grouped here because they are all modal overlays gated by
 * transient screen state rather than the primary Files/Git/Github content.
 */
@Composable
internal fun ProjectWorkspaceDiscardDialog(
    pendingAction: EditorExitAction?,
    filePath: String?,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    if (pendingAction == null) return
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.workspace_discard_title)) },
        text = {
            Text(
                stringResource(
                    R.string.workspace_discard_message,
                    filePath.orEmpty(),
                ),
            )
        },
        confirmButton = {
            TextButton(onClick = onConfirm) { Text(stringResource(R.string.workspace_discard)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.workspace_keep_editing))
            }
        },
    )
}

@Composable
internal fun ProjectWorkspaceGitConfirmationOverlay(
    visible: Boolean,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    if (!visible) return
    GitConfirmationDialog(onConfirm = onConfirm, onDismiss = onDismiss)
}

@Composable
internal fun ProjectWorkspaceBranchOverlay(
    visible: Boolean,
    branchList: GitBranchListResult?,
    enabled: Boolean,
    onSwitch: (String) -> Unit,
    onDelete: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    if (!visible) return
    GitBranchListSheet(
        branchList = branchList,
        enabled = enabled,
        onSwitch = onSwitch,
        onDelete = onDelete,
        onDismiss = onDismiss,
    )
}

@Composable
internal fun ProjectWorkspaceWorktreeOverlay(
    visible: Boolean,
    worktrees: List<GitWorktreeInfo>?,
    enabled: Boolean,
    onPullFromSource: (GitWorktreeInfo, String) -> Unit,
    onMergeToSource: (GitWorktreeInfo, String) -> Unit,
    onAbortMerge: (GitWorktreeInfo) -> Unit,
    onFinishMerge: (GitWorktreeInfo) -> Unit,
    onRemove: (GitWorktreeInfo) -> Unit,
    onDismiss: () -> Unit,
) {
    if (!visible) return
    GitWorktreeListSheet(
        worktrees = worktrees,
        enabled = enabled,
        onPullFromSource = onPullFromSource,
        onMergeToSource = onMergeToSource,
        onAbortMerge = onAbortMerge,
        onFinishMerge = onFinishMerge,
        onRemove = onRemove,
        onDismiss = onDismiss,
    )
}
