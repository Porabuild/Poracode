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
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.SwapHoriz
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.SuggestionChipDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R

/**
 * Browsable Git branch list reached from the workspace Git tab, with per-row switch/delete
 * actions. The host already returns this data via `gitListBranches`; this sheet is the first
 * Android surface that renders it instead of requiring the free-text branch field.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun GitBranchListSheet(
    branchList: GitBranchListResult?,
    enabled: Boolean,
    onSwitch: (String) -> Unit,
    onDelete: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(stringResource(R.string.git_branch_section), style = MaterialTheme.typography.headlineSmall)
            val branches = branchList?.branches.orEmpty()
            if (branches.isEmpty()) {
                Text(
                    stringResource(R.string.git_branch_list_empty),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                LazyColumn(Modifier.fillMaxWidth().heightIn(max = 420.dp)) {
                    items(branches, key = { "${it.name}:${it.isRemote}" }) { branch ->
                        GitBranchRow(branch, enabled, onSwitch, onDelete)
                        HorizontalDivider()
                    }
                }
            }
            TextButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.git_close_sheet))
            }
        }
    }
}

@Composable
private fun GitBranchRow(
    branch: GitBranchInfo,
    enabled: Boolean,
    onSwitch: (String) -> Unit,
    onDelete: (String) -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(branch.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (branch.current) {
                    SuggestionChip(
                        onClick = {},
                        enabled = false,
                        colors = SuggestionChipDefaults.suggestionChipColors(),
                        label = { Text(stringResource(R.string.git_branch_current_badge)) },
                    )
                } else if (branch.isRemote) {
                    SuggestionChip(
                        onClick = {},
                        enabled = false,
                        colors = SuggestionChipDefaults.suggestionChipColors(),
                        label = { Text(stringResource(R.string.git_branch_remote_badge)) },
                    )
                }
            }
            Text(
                branch.commit.take(7),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (!branch.current) {
            IconButton(onClick = { onSwitch(branch.name) }, enabled = enabled) {
                Icon(
                    Icons.Outlined.SwapHoriz,
                    contentDescription = stringResource(R.string.git_branch_switch_action, branch.name),
                )
            }
        }
        if (!branch.current && !branch.isRemote) {
            IconButton(onClick = { onDelete(branch.name) }, enabled = enabled) {
                Icon(
                    Icons.Outlined.DeleteOutline,
                    contentDescription = stringResource(R.string.git_branch_delete_action, branch.name),
                )
            }
        }
    }
}
