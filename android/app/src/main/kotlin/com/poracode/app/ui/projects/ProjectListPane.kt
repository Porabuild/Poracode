package com.poracode.app.ui.projects

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.session.projects.CatalogProject
import com.poracode.app.ui.components.EmptyStateView
import com.poracode.app.ui.components.PoracodeListRow
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme
import androidx.compose.material3.FilledTonalButton

@Composable
internal fun ProjectListPane(
    projects: List<CatalogProject>,
    selectedProjectId: String?,
    onSelect: (String) -> Unit,
    onOpenSettings: (String) -> Unit,
    isSynced: (CatalogProject) -> Boolean,
    onSetSynced: (CatalogProject, Boolean) -> Unit,
    onOpenWorkspace: (CatalogProject) -> Unit,
    onOpenTerminal: (CatalogProject, String?) -> Unit,
    onToggleEnabled: (CatalogProject) -> Unit,
    onRemove: (CatalogProject) -> Unit,
    manageEnabled: Boolean,
    workspaceEnabled: Boolean,
    terminalEnabled: Boolean,
    modifier: Modifier = Modifier,
    hostName: String? = null,
) {
    if (projects.isEmpty()) {
        EmptyStateView(
            title = stringResource(R.string.projects_empty_title),
            message = stringResource(R.string.projects_empty_message),
            modifier = modifier,
        )
        return
    }
    LazyColumn(
        modifier = modifier.padding(horizontal = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(projects, key = { "${it.identity.connectionId.value}:${it.identity.projectId}" }) {
            item ->
            val project = item.project
            val description = stringResource(
                R.string.projects_project_row_description,
                project.name,
                project.location.path,
            )
            val colors = PoracodeTheme.colors
            var menuExpanded by remember { mutableStateOf(false) }
            PoracodeListRow(
                onClick = { onSelect(item.identity.projectId) },
                onLongClick = { menuExpanded = true },
                onLongClickLabel = stringResource(R.string.common_more_actions),
                selected = item.identity.projectId == selectedProjectId,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = description },
            ) {
                Icon(
                    if (project.disabled == true) PoracodeIcons.Block else PoracodeIcons.Folder,
                    contentDescription = null,
                    modifier = Modifier.size(15.dp),
                    tint = colors.muted,
                )
                Column(Modifier.weight(1f)) {
                    Text(
                        project.name,
                        style = MaterialTheme.typography.labelLarge.copy(
                            fontWeight = FontWeight.SemiBold,
                        ),
                        color = colors.foreground,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        project.location.path,
                        style = PoracodeTextStyles.rowDescription,
                        color = colors.muted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                if (!hostName.isNullOrBlank()) {
                    Text(
                        hostName,
                        style = PoracodeTextStyles.rowDescription,
                        color = colors.muted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.widthIn(max = 120.dp),
                    )
                }
                ProjectRowMenu(
                    expanded = menuExpanded,
                    onDismiss = { menuExpanded = false },
                    item = item,
                    synced = isSynced(item),
                    manageEnabled = manageEnabled,
                    workspaceEnabled = workspaceEnabled,
                    terminalEnabled = terminalEnabled,
                    onOpenSettings = { onOpenSettings(item.identity.projectId) },
                    onSetSynced = { onSetSynced(item, it) },
                    onOpenWorkspace = { onOpenWorkspace(item) },
                    onOpenTerminal = { command -> onOpenTerminal(item, command) },
                    onToggleEnabled = { onToggleEnabled(item) },
                    onRemove = { onRemove(item) },
                )
            }
        }
    }
}

@Composable
private fun ProjectRowMenu(
    expanded: Boolean,
    onDismiss: () -> Unit,
    item: CatalogProject,
    synced: Boolean,
    manageEnabled: Boolean,
    workspaceEnabled: Boolean,
    terminalEnabled: Boolean,
    onOpenSettings: () -> Unit,
    onSetSynced: (Boolean) -> Unit,
    onOpenWorkspace: () -> Unit,
    onOpenTerminal: (String?) -> Unit,
    onToggleEnabled: () -> Unit,
    onRemove: () -> Unit,
) {
    var confirmRemove by remember { mutableStateOf(false) }
    androidx.compose.foundation.layout.Box {
        DropdownMenu(expanded = expanded, onDismissRequest = onDismiss) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.projects_settings)) },
                onClick = { onDismiss(); onOpenSettings() },
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.workspace_title)) },
                enabled = workspaceEnabled,
                onClick = { onDismiss(); onOpenWorkspace() },
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.terminal_title)) },
                enabled = terminalEnabled,
                onClick = { onDismiss(); onOpenTerminal(null) },
            )
            item.project.scripts?.actions.orEmpty().forEach { action ->
                DropdownMenuItem(
                    text = {
                        Text(stringResource(R.string.projects_run_action, action.name))
                    },
                    enabled = terminalEnabled,
                    onClick = { onDismiss(); onOpenTerminal(action.command) },
                )
            }
            DropdownMenuItem(
                text = {
                    Text(
                        stringResource(
                            if (synced) R.string.projects_stop_syncing
                            else R.string.projects_include_in_sync,
                        ),
                    )
                },
                onClick = { onDismiss(); onSetSynced(!synced) },
            )
            DropdownMenuItem(
                text = {
                    Text(
                        stringResource(
                            if (item.project.disabled == true) R.string.projects_enable
                            else R.string.projects_disable,
                        ),
                    )
                },
                enabled = manageEnabled,
                onClick = { onDismiss(); onToggleEnabled() },
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.projects_remove)) },
                enabled = manageEnabled,
                onClick = { onDismiss(); confirmRemove = true },
            )
        }
    }
    if (confirmRemove) {
        AlertDialog(
            onDismissRequest = { confirmRemove = false },
            title = { Text(stringResource(R.string.projects_remove_confirm_title, item.project.name)) },
            text = { Text(stringResource(R.string.projects_remove_confirm_message)) },
            confirmButton = {
                FilledTonalButton(onClick = { confirmRemove = false; onRemove() }) {
                    Text(stringResource(R.string.projects_remove))
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmRemove = false }) {
                    Text(stringResource(R.string.projects_cancel))
                }
            },
        )
    }
}

@Composable
internal fun ProjectEmptyDetail(modifier: Modifier = Modifier) {
    EmptyStateView(
        title = stringResource(R.string.projects_select_title),
        message = stringResource(R.string.projects_select_message),
        modifier = modifier,
    )
}
