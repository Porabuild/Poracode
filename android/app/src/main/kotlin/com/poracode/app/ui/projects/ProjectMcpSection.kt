package com.poracode.app.ui.projects

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.model.McpHttpTransport
import com.poracode.app.model.McpServer
import com.poracode.app.model.McpSseTransport
import com.poracode.app.model.McpStdioTransport
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.session.projects.ProjectSessionRuntime
import com.poracode.app.ui.settings.GlobalMcpSettingsController
import com.poracode.app.ui.settings.McpScopedMutationResult
import com.poracode.app.ui.settings.McpServerEditorSheet
import kotlinx.coroutines.launch

@Composable
internal fun ProjectMcpSection(
    runtime: ProjectSessionRuntime,
    identity: ProjectIdentity,
    access: ProjectUiAccess,
    commandBusy: Boolean,
    onDiscover: () -> Unit,
    mcpController: GlobalMcpSettingsController,
) {
    val state by runtime.settings.state.collectAsStateWithLifecycle()
    val entry = state.entries[identity]
    var localBusy by remember(identity) { mutableStateOf(false) }
    var mutationFailed by remember(identity) { mutableStateOf(false) }
    var mutationUncertain by remember(identity) { mutableStateOf(false) }
    var editor by remember(identity) { mutableStateOf<McpServer?>(null) }
    var adding by remember(identity) { mutableStateOf(false) }
    var deleting by remember(identity) { mutableStateOf<McpServer?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(identity, access.canManage) {
        if (access.canManage) runtime.settings.load(identity)
    }

    fun mutate(action: ((McpScopedMutationResult) -> Unit) -> Unit) {
        if (localBusy || commandBusy) return
        localBusy = true
        mutationFailed = false
        mutationUncertain = false
        action { result ->
            scope.launch {
                when (result) {
                    McpScopedMutationResult.Applied -> runtime.settings.load(identity)
                    McpScopedMutationResult.Uncertain -> {
                        mutationUncertain = true
                        runtime.settings.load(identity)
                    }
                    McpScopedMutationResult.Failed -> mutationFailed = true
                    McpScopedMutationResult.Stale -> Unit
                }
                localBusy = false
            }
        }
    }

    fun upsert(server: McpServer) = mutate { settled ->
        mcpController.upsertProject(identity, server, settled)
    }

    ProjectSection(stringResource(R.string.settings_global_mcp_title)) {
        Text(
            stringResource(R.string.projects_mcp_description),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (!access.canManage) {
            Text(
                stringResource(R.string.projects_manage_denied),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            return@ProjectSection
        }
        if (entry == null || (entry.loading && entry.settings == null)) {
            ProjectMcpLoading()
            return@ProjectSection
        }
        if (entry.failure != null && entry.settings == null) {
            ProjectFailureText(entry.failure)
            OutlinedButton(onClick = { scope.launch { runtime.settings.load(identity) } }) {
                Text(stringResource(R.string.retry))
            }
            return@ProjectSection
        }
        val servers = entry.settings?.mcpServers.orEmpty()
        val enabled = !commandBusy && !localBusy
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
        ) {
            OutlinedButton(enabled = enabled, onClick = onDiscover) {
                Text(stringResource(R.string.settings_integrations_discover_project))
            }
            Button(
                enabled = enabled,
                onClick = { adding = true },
                modifier = Modifier.testTag("project_mcp_add"),
            ) {
                Icon(Icons.Outlined.Add, contentDescription = null)
                Text(stringResource(R.string.settings_global_mcp_add))
            }
        }
        if (entry.loading || localBusy) LinearProgressIndicator(Modifier.fillMaxWidth())
        if (servers.isEmpty() && !localBusy) {
            Text(
                stringResource(R.string.projects_no_integrations),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        servers.forEach { server ->
            ProjectMcpServerCard(
                server = server,
                enabled = enabled,
                onEnabledChange = { upsert(server.copy(enabled = it)) },
                onEdit = { editor = server },
                onDelete = { deleting = server },
                onMove = {
                    mutate { settled ->
                        mcpController.moveProjectToGlobal(
                            identity,
                            server.id,
                            settled,
                        )
                    }
                },
            )
        }
        if (mutationFailed) {
            Text(
                stringResource(R.string.settings_request_failed),
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
            )
        }
        if (mutationUncertain) {
            Text(
                stringResource(R.string.settings_global_mcp_uncertain),
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
            )
        }
        ProjectFailureText(entry.failure)

        if (adding || editor != null) {
            McpServerEditorSheet(
                server = editor,
                existingNames = servers.mapTo(linkedSetOf()) { it.name.lowercase() },
                onDismiss = { adding = false; editor = null },
                onSave = { server ->
                    upsert(server)
                    adding = false
                    editor = null
                },
            )
        }
        deleting?.let { server ->
            AlertDialog(
                onDismissRequest = { deleting = null },
                title = { Text(stringResource(R.string.settings_global_mcp_delete_title)) },
                text = {
                    Text(stringResource(R.string.settings_global_mcp_delete_message, server.name))
                },
                confirmButton = {
                    Button(
                        onClick = {
                            mutate { settled ->
                                mcpController.removeProject(
                                    identity,
                                    server.id,
                                    settled,
                                )
                            }
                            deleting = null
                        },
                    ) { Text(stringResource(R.string.settings_global_mcp_delete)) }
                },
                dismissButton = {
                    TextButton(onClick = { deleting = null }) {
                        Text(stringResource(R.string.settings_global_mcp_cancel))
                    }
                },
            )
        }
    }
}

@Composable
private fun ProjectMcpLoading() {
    Row(
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CircularProgressIndicator()
        Text(stringResource(R.string.projects_loading_integrations))
    }
}

@Composable
private fun ProjectMcpServerCard(
    server: McpServer,
    enabled: Boolean,
    onEnabledChange: (Boolean) -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onMove: () -> Unit,
) {
    OutlinedCard(Modifier.fillMaxWidth().testTag("project_mcp_server_${server.id}")) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .toggleable(
                        value = server.enabled,
                        enabled = enabled,
                        role = Role.Switch,
                        onValueChange = onEnabledChange,
                    ),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(server.name, style = MaterialTheme.typography.titleSmall)
                    Text(
                        transportLabel(server),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (server.description.isNotBlank()) {
                        Text(
                            server.description,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                Switch(
                    checked = server.enabled,
                    enabled = enabled,
                    onCheckedChange = null,
                    modifier = Modifier.clearAndSetSemantics {},
                )
            }
            HorizontalDivider()
            Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                IconButton(enabled = enabled, onClick = onEdit) {
                    Icon(Icons.Outlined.Edit, stringResource(R.string.settings_global_mcp_edit))
                }
                IconButton(enabled = enabled, onClick = onMove) {
                    Icon(
                        Icons.Outlined.Public,
                        stringResource(R.string.settings_global_mcp_move_global),
                    )
                }
                IconButton(enabled = enabled, onClick = onDelete) {
                    Icon(Icons.Outlined.Delete, stringResource(R.string.settings_global_mcp_delete))
                }
            }
        }
    }
}

@Composable
private fun transportLabel(server: McpServer): String = when (server.transport) {
    is McpStdioTransport -> stringResource(R.string.projects_mcp_local_process)
    is McpHttpTransport -> stringResource(R.string.projects_mcp_http)
    is McpSseTransport -> stringResource(R.string.projects_mcp_sse)
}
