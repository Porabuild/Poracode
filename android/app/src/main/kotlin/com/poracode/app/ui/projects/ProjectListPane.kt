package com.poracode.app.ui.projects

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.session.projects.CatalogProject
import com.poracode.app.ui.components.EmptyStateView

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
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onSelect(item.identity.projectId) }
                    .semantics {
                        role = Role.Button
                        contentDescription = description
                    },
                colors = CardDefaults.cardColors(
                    containerColor = if (item.identity.projectId == selectedProjectId) {
                        MaterialTheme.colorScheme.secondaryContainer
                    } else {
                        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f)
                    },
                ),
            ) {
                Row(
                    Modifier.padding(14.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        if (project.disabled == true) Icons.Outlined.Block else Icons.Outlined.Folder,
                        contentDescription = null,
                    )
                    Column(Modifier.weight(1f)) {
                        Text(
                            project.name,
                            style = MaterialTheme.typography.titleMedium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            project.location.path,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (project.disabled == true) {
                            Text(
                                stringResource(R.string.projects_disabled),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.error,
                            )
                        }
                    }
                    ProjectRowMenu(
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
}

@Composable
private fun ProjectRowMenu(
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
    var expanded by remember { mutableStateOf(false) }
    var confirmRemove by remember { mutableStateOf(false) }
    androidx.compose.foundation.layout.Box {
        IconButton(onClick = { expanded = true }) {
            Icon(Icons.Outlined.MoreVert, stringResource(R.string.projects_more_actions))
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.projects_settings)) },
                onClick = { expanded = false; onOpenSettings() },
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.workspace_title)) },
                enabled = workspaceEnabled,
                onClick = { expanded = false; onOpenWorkspace() },
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.terminal_title)) },
                enabled = terminalEnabled,
                onClick = { expanded = false; onOpenTerminal(null) },
            )
            item.project.scripts?.actions.orEmpty().forEach { action ->
                DropdownMenuItem(
                    text = {
                        Text(stringResource(R.string.projects_run_action, action.name))
                    },
                    enabled = terminalEnabled,
                    onClick = { expanded = false; onOpenTerminal(action.command) },
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
                onClick = { expanded = false; onSetSynced(!synced) },
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
                onClick = { expanded = false; onToggleEnabled() },
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.projects_remove)) },
                enabled = manageEnabled,
                onClick = { expanded = false; confirmRemove = true },
            )
        }
    }
    if (confirmRemove) {
        AlertDialog(
            onDismissRequest = { confirmRemove = false },
            title = { Text(stringResource(R.string.projects_remove_confirm_title, item.project.name)) },
            text = { Text(stringResource(R.string.projects_remove_confirm_message)) },
            confirmButton = {
                Button(onClick = { confirmRemove = false; onRemove() }) {
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
