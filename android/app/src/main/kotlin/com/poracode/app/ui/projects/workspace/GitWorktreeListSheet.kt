package com.poracode.app.ui.projects.workspace

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.SuggestionChipDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R

private enum class GitWorktreeSourceAction { PullFromSource, MergeToSource }

/**
 * Browsable worktree list reached from the workspace Git tab, with per-worktree actions. The
 * host already returns this data via `gitListWorktrees`; this sheet is the first Android surface
 * that renders it instead of requiring a free-text worktree path.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun GitWorktreeListSheet(
    worktrees: List<GitWorktreeInfo>?,
    enabled: Boolean,
    onPullFromSource: (GitWorktreeInfo, String) -> Unit,
    onMergeToSource: (GitWorktreeInfo, String) -> Unit,
    onAbortMerge: (GitWorktreeInfo) -> Unit,
    onFinishMerge: (GitWorktreeInfo) -> Unit,
    onRemove: (GitWorktreeInfo) -> Unit,
    onDismiss: () -> Unit,
) {
    var sourceActionTarget by remember {
        mutableStateOf<Pair<GitWorktreeInfo, GitWorktreeSourceAction>?>(null)
    }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(stringResource(R.string.git_worktrees_title), style = MaterialTheme.typography.headlineSmall)
            val list = worktrees.orEmpty()
            if (list.isEmpty()) {
                Text(
                    stringResource(R.string.git_worktree_list_empty),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                LazyColumn(Modifier.fillMaxWidth().heightIn(max = 420.dp)) {
                    items(list, key = { it.path }) { worktree ->
                        GitWorktreeRow(
                            worktree = worktree,
                            enabled = enabled,
                            onPullFromSource = {
                                sourceActionTarget = worktree to GitWorktreeSourceAction.PullFromSource
                            },
                            onMergeToSource = {
                                sourceActionTarget = worktree to GitWorktreeSourceAction.MergeToSource
                            },
                            onAbortMerge = { onAbortMerge(worktree) },
                            onFinishMerge = { onFinishMerge(worktree) },
                            onRemove = { onRemove(worktree) },
                        )
                        HorizontalDivider()
                    }
                }
            }
            TextButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.git_close_sheet))
            }
        }
    }

    sourceActionTarget?.let { (worktree, action) ->
        GitWorktreeSourceBranchDialog(
            onDismiss = { sourceActionTarget = null },
            onConfirm = { sourceBranch ->
                sourceActionTarget = null
                when (action) {
                    GitWorktreeSourceAction.PullFromSource -> onPullFromSource(worktree, sourceBranch)
                    GitWorktreeSourceAction.MergeToSource -> onMergeToSource(worktree, sourceBranch)
                }
            },
        )
    }
}

@Composable
private fun GitWorktreeRow(
    worktree: GitWorktreeInfo,
    enabled: Boolean,
    onPullFromSource: () -> Unit,
    onMergeToSource: () -> Unit,
    onAbortMerge: () -> Unit,
    onFinishMerge: () -> Unit,
    onRemove: () -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    Row(
        Modifier.fillMaxWidth().padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(worktree.branch, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (worktree.isMain) {
                    SuggestionChip(
                        onClick = {},
                        enabled = false,
                        colors = SuggestionChipDefaults.suggestionChipColors(),
                        label = { Text(stringResource(R.string.git_worktree_main_badge)) },
                    )
                }
            }
            Text(
                worktree.path,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Column {
            IconButton(onClick = { menuOpen = true }, enabled = enabled) {
                Icon(
                    Icons.Outlined.MoreVert,
                    contentDescription = stringResource(R.string.git_worktree_actions_description, worktree.path),
                )
            }
            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                // Pull-from-source/abort/finish-merge are always applied to the main checkout by
                // the host contract (GitOwner.WorktreeLocation must equal the open project's own
                // location), so they are only offered here on the main worktree row to avoid
                // implying a per-worktree effect the protocol cannot deliver.
                if (worktree.isMain) {
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.git_pull_from_source)) },
                        onClick = { menuOpen = false; onPullFromSource() },
                    )
                }
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.git_merge_to_source)) },
                    onClick = { menuOpen = false; onMergeToSource() },
                )
                if (worktree.isMain) {
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.git_abort_merge)) },
                        onClick = { menuOpen = false; onAbortMerge() },
                    )
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.git_finish_merge)) },
                        onClick = { menuOpen = false; onFinishMerge() },
                    )
                }
                if (!worktree.isMain) {
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.git_remove_worktree)) },
                        onClick = { menuOpen = false; onRemove() },
                    )
                }
            }
        }
    }
}

@Composable
private fun GitWorktreeSourceBranchDialog(onDismiss: () -> Unit, onConfirm: (String) -> Unit) {
    var sourceBranch by rememberSaveable { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.git_worktree_source_branch_dialog_title)) },
        text = {
            OutlinedTextField(
                value = sourceBranch,
                onValueChange = { sourceBranch = it },
                placeholder = { Text(stringResource(R.string.git_worktree_source_branch_dialog_hint)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = {
            Button(
                onClick = { onConfirm(sourceBranch.trim()) },
                enabled = sourceBranch.isNotBlank(),
            ) { Text(stringResource(R.string.git_confirm)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.git_cancel)) }
        },
    )
}
