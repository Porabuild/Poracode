package com.poracode.app.ui.projects.workspace

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material.icons.outlined.AddCircleOutline
import androidx.compose.material.icons.outlined.DeleteSweep
import androidx.compose.material.icons.outlined.Merge
import androidx.compose.material.icons.outlined.RemoveCircleOutline
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.GitFileChange
import com.poracode.app.model.GitStatusResult
import com.poracode.app.session.projects.ProjectOperationFailure
import com.poracode.app.ui.components.EmptyStateView
import com.poracode.app.ui.components.ErrorStateView
import com.poracode.app.ui.components.LoadingStateView

internal sealed interface ProjectGitDiffUiState {
    data object Idle : ProjectGitDiffUiState
    data object Loading : ProjectGitDiffUiState
    data class Loaded(val diff: String) : ProjectGitDiffUiState
    data object Failed : ProjectGitDiffUiState
}

@Composable
internal fun ProjectGitPane(
    status: GitStatusResult?,
    snapshotLoaded: Boolean,
    loading: Boolean,
    failure: ProjectOperationFailure?,
    selectedPath: String?,
    selectedStaged: Boolean,
    diffState: ProjectGitDiffUiState,
    canLoadDiff: Boolean,
    canOperate: Boolean,
    expanded: Boolean,
    onSelectChange: (GitFileChange) -> Unit,
    onStage: (GitFileChange) -> Unit,
    onUnstage: (GitFileChange) -> Unit,
    onRevert: (GitFileChange) -> Unit,
    actions: @Composable () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (!snapshotLoaded && loading) {
        LoadingStateView(stringResource(R.string.workspace_loading_git), modifier)
        return
    }
    if (!snapshotLoaded || status == null) {
        EmptyStateView(
            stringResource(R.string.workspace_git_unavailable),
            stringResource(R.string.workspace_request_failed),
            modifier,
        )
        return
    }
    val list: @Composable (Modifier) -> Unit = { listModifier ->
        GitChangeList(
            status,
            loading,
            failure,
            selectedPath,
            selectedStaged,
            canLoadDiff,
            onSelectChange,
            canOperate,
            onStage,
            onUnstage,
            onRevert,
            actions,
            listModifier,
        )
    }
    val diff: @Composable (Modifier) -> Unit = { diffModifier ->
        GitDiffViewer(selectedPath, diffState, diffModifier)
    }
    if (expanded) {
        Row(modifier.fillMaxSize()) {
            list(Modifier.width(360.dp).fillMaxSize())
            VerticalDivider()
            diff(Modifier.weight(1f).fillMaxSize())
        }
    } else {
        Column(modifier.fillMaxSize()) {
            list(Modifier.weight(0.46f).fillMaxWidth())
            HorizontalDivider()
            diff(Modifier.weight(0.54f).fillMaxWidth())
        }
    }
}

@Composable
private fun GitChangeList(
    status: GitStatusResult,
    loading: Boolean,
    failure: ProjectOperationFailure?,
    selectedPath: String?,
    selectedStaged: Boolean,
    canLoadDiff: Boolean,
    onSelectChange: (GitFileChange) -> Unit,
    canOperate: Boolean,
    onStage: (GitFileChange) -> Unit,
    onUnstage: (GitFileChange) -> Unit,
    onRevert: (GitFileChange) -> Unit,
    actions: @Composable () -> Unit,
    modifier: Modifier,
) {
    val conflictFiles = status.conflictFiles.orEmpty()
    val conflictsTitle = stringResource(R.string.workspace_conflicts, conflictFiles.size)
    val stagedTitle = stringResource(R.string.workspace_staged)
    val unstagedTitle = stringResource(R.string.workspace_unstaged)
    Column(modifier) {
        if (loading) LinearProgressIndicator(Modifier.fillMaxWidth())
        LazyColumn(Modifier.fillMaxSize()) {
            item(key = "summary") {
                Column(
                    Modifier.fillMaxWidth().padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        stringResource(R.string.workspace_branch, status.branch),
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text(
                        stringResource(R.string.workspace_ahead_behind, status.ahead, status.behind),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        stringResource(
                            R.string.workspace_change_totals,
                            status.totalInsertions,
                            status.totalDeletions,
                        ),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (status.mergeInProgress == true) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Outlined.Merge, contentDescription = null)
                            Column {
                                Text(stringResource(R.string.workspace_merge_in_progress))
                                Text(
                                    stringResource(
                                        R.string.workspace_conflicts,
                                        status.conflictFiles?.size ?: 0,
                                    ),
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                        }
                    }
                }
            }
            item(key = "actions") { actions() }
            if (failure != null) {
                item(key = "failure") {
                    ProjectWorkspaceFailureCard(failure, modifier = Modifier.padding(12.dp))
                }
            }
            if (conflictFiles.isEmpty() && status.staged.isEmpty() && status.unstaged.isEmpty()) {
                item(key = "clean") {
                    Text(
                        stringResource(R.string.workspace_no_changes),
                        modifier = Modifier.padding(24.dp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                changeSection(
                    "conflict",
                    conflictsTitle,
                    conflictFiles,
                    selectedPath,
                    selectedStaged,
                    canLoadDiff,
                    onSelectChange,
                    canOperate,
                    onStage,
                    onUnstage,
                    onRevert,
                )
                changeSection(
                    "staged",
                    stagedTitle,
                    status.staged,
                    selectedPath,
                    selectedStaged,
                    canLoadDiff,
                    onSelectChange,
                    canOperate,
                    onStage,
                    onUnstage,
                    onRevert,
                )
                changeSection(
                    "unstaged",
                    unstagedTitle,
                    status.unstaged,
                    selectedPath,
                    selectedStaged,
                    canLoadDiff,
                    onSelectChange,
                    canOperate,
                    onStage,
                    onUnstage,
                    onRevert,
                )
            }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.changeSection(
    keyPrefix: String,
    title: String,
    changes: List<GitFileChange>,
    selectedPath: String?,
    selectedStaged: Boolean,
    enabled: Boolean,
    onSelect: (GitFileChange) -> Unit,
    canOperate: Boolean,
    onStage: (GitFileChange) -> Unit,
    onUnstage: (GitFileChange) -> Unit,
    onRevert: (GitFileChange) -> Unit,
) {
    if (changes.isEmpty()) return
    item(key = "header-$keyPrefix") {
        Text(
            title,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.primary,
        )
    }
    items(changes, key = { "$keyPrefix:${it.path}:${it.oldPath.orEmpty()}" }) { change ->
        GitChangeRow(
            change,
            selected = selectedPath == change.path && selectedStaged == change.staged,
            enabled = enabled,
            onSelect = onSelect,
            canOperate = canOperate,
            onStage = onStage,
            onUnstage = onUnstage,
            onRevert = onRevert,
        )
        HorizontalDivider(Modifier.padding(start = 16.dp))
    }
}

@Composable
private fun GitChangeRow(
    change: GitFileChange,
    selected: Boolean,
    enabled: Boolean,
    onSelect: (GitFileChange) -> Unit,
    canOperate: Boolean,
    onStage: (GitFileChange) -> Unit,
    onUnstage: (GitFileChange) -> Unit,
    onRevert: (GitFileChange) -> Unit,
) {
    val status = gitChangeLabel(change.kind())
    val totals = stringResource(R.string.workspace_change_totals, change.insertions, change.deletions)
    val description = stringResource(
        R.string.workspace_change_description,
        change.path,
        status,
        totals,
    )
    Surface(
        color = if (selected) {
            MaterialTheme.colorScheme.secondaryContainer
        } else {
            MaterialTheme.colorScheme.surface
        },
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .clickable(enabled = enabled) { onSelect(change) }
            .semantics {
                role = Role.Button
                contentDescription = description
            },
    ) {
        Row(
            Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Outlined.Code, contentDescription = null)
            Column(Modifier.weight(1f)) {
                Text(change.path, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    if (change.oldPath != null) "$status · ${change.oldPath}" else status,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(totals, style = MaterialTheme.typography.labelSmall)
            IconButton(
                onClick = { if (change.staged) onUnstage(change) else onStage(change) },
                enabled = canOperate,
            ) {
                Icon(
                    if (change.staged) {
                        Icons.Outlined.RemoveCircleOutline
                    } else {
                        Icons.Outlined.AddCircleOutline
                    },
                    contentDescription = stringResource(
                        if (change.staged) R.string.git_unstage_file else R.string.git_stage_file,
                        change.path,
                    ),
                )
            }
            if (!change.staged) {
                IconButton(onClick = { onRevert(change) }, enabled = canOperate) {
                    Icon(
                        Icons.Outlined.DeleteSweep,
                        contentDescription = stringResource(R.string.git_revert_file, change.path),
                    )
                }
            }
        }
    }
}

@Composable
private fun GitDiffViewer(
    selectedPath: String?,
    state: ProjectGitDiffUiState,
    modifier: Modifier,
) {
    if (selectedPath == null || state == ProjectGitDiffUiState.Idle) {
        EmptyStateView(
            stringResource(R.string.workspace_select_change_title),
            stringResource(R.string.workspace_select_change_message),
            modifier,
        )
        return
    }
    when (state) {
        ProjectGitDiffUiState.Idle -> Unit
        ProjectGitDiffUiState.Loading ->
            LoadingStateView(stringResource(R.string.workspace_loading_diff), modifier)
        ProjectGitDiffUiState.Failed ->
            ErrorStateView(stringResource(R.string.workspace_diff_failed), modifier = modifier)
        is ProjectGitDiffUiState.Loaded -> {
            val document = remember(state.diff) { parseGitDiff(state.diff) }
            if (document.lines.all { it.text.isBlank() }) {
                EmptyStateView(
                    selectedPath,
                    stringResource(R.string.workspace_diff_empty),
                    modifier,
                )
                return
            }
            val horizontal = rememberScrollState()
            Column(modifier) {
                Text(
                    selectedPath,
                    modifier = Modifier.fillMaxWidth().padding(12.dp),
                    style = MaterialTheme.typography.titleSmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                HorizontalDivider()
                if (document.truncated) {
                    Text(
                        stringResource(R.string.workspace_diff_truncated),
                        modifier = Modifier.padding(12.dp),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.tertiary,
                    )
                }
                LazyColumn(Modifier.fillMaxSize()) {
                    items(document.lines) { line ->
                        Text(
                            line.text.ifEmpty { " " },
                            modifier = Modifier.fillMaxWidth().horizontalScroll(horizontal),
                            color = diffLineColor(line.kind),
                            fontFamily = FontFamily.Monospace,
                            softWrap = false,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun gitChangeLabel(kind: GitChangeKind): String = stringResource(
    when (kind) {
        GitChangeKind.Added -> R.string.workspace_status_added
        GitChangeKind.Modified -> R.string.workspace_status_modified
        GitChangeKind.Deleted -> R.string.workspace_status_deleted
        GitChangeKind.Renamed -> R.string.workspace_status_renamed
        GitChangeKind.Untracked -> R.string.workspace_status_untracked
        GitChangeKind.Conflicted -> R.string.workspace_status_conflicted
        GitChangeKind.Changed -> R.string.workspace_status_changed
    },
)

@Composable
private fun diffLineColor(kind: GitDiffLineKind) = when (kind) {
    GitDiffLineKind.Header -> MaterialTheme.colorScheme.primary
    GitDiffLineKind.Addition -> MaterialTheme.colorScheme.tertiary
    GitDiffLineKind.Deletion -> MaterialTheme.colorScheme.error
    GitDiffLineKind.Context -> MaterialTheme.colorScheme.onSurface
}
