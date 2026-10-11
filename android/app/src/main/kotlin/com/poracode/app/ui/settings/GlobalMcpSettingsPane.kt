package com.poracode.app.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Login
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.McpHttpTransport
import com.poracode.app.model.McpServer
import com.poracode.app.model.McpSseTransport
import com.poracode.app.model.McpStdioTransport
import com.poracode.app.ui.components.EmptyStateView
import com.poracode.app.ui.components.ErrorStateView
import com.poracode.app.ui.components.LoadingStateView

@Composable
internal fun GlobalMcpSettingsPane(
    state: GlobalMcpSettingsUiState,
    projects: List<GlobalMcpProject>,
    canManage: Boolean,
    controller: GlobalMcpSettingsController,
    onDiscover: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var editor by remember { mutableStateOf<McpServer?>(null) }
    var adding by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf<McpServer?>(null) }
    var movingServerId by remember { mutableStateOf<String?>(null) }
    var toolServerId by remember { mutableStateOf<String?>(null) }
    val uriHandler = LocalUriHandler.current
    Column(modifier.fillMaxSize()) {
        Column(
            Modifier.fillMaxWidth().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                stringResource(R.string.settings_global_mcp_redaction_note),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
            ) {
                OutlinedButton(onClick = onDiscover) {
                    Text(stringResource(R.string.settings_integrations_mcp_discovery))
                }
                Button(
                    enabled = canManage && !state.mutating,
                    onClick = { adding = true },
                ) {
                    Icon(Icons.Outlined.Add, contentDescription = null)
                    Text(stringResource(R.string.settings_global_mcp_add))
                }
            }
        }
        // Mutually exclusive: a failed load never also claims the list is empty, and a
        // loading spinner never coexists with either. Only the loaded-with-content branch
        // renders the server list, the pending-mutation banner, and the OAuth affordances.
        when {
            state.loading && !state.loaded -> LoadingStateView(
                stringResource(R.string.settings_status_loading),
                Modifier.weight(1f),
            )
            state.failure != null -> ErrorStateView(
                settingsFailureMessage(state.failure),
                onRetry = controller::refresh,
                modifier = Modifier.weight(1f),
            )
            state.loaded && state.servers.isEmpty() -> EmptyStateView(
                stringResource(R.string.settings_global_mcp_empty),
                stringResource(R.string.settings_global_mcp_empty_description),
                Modifier.weight(1f),
            )
            else -> LazyColumn(
                Modifier.weight(1f),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (state.mutationUncertain) item {
                    Text(
                        stringResource(R.string.settings_global_mcp_uncertain),
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                items(state.servers, key = McpServer::id) { server ->
                    GlobalMcpServerCard(
                        server = server,
                        state = state,
                        canManage = canManage,
                        canMove = projects.isNotEmpty(),
                        onToggle = { controller.upsert(server.copy(enabled = it)) },
                        onEdit = { editor = server },
                        onDelete = { deleting = server },
                        onMove = { movingServerId = server.id },
                        onTools = { toolServerId = server.id },
                        onProbe = { controller.probe(server.id) },
                        onOauth = {
                            if (server.id in state.authenticatedServerIds) {
                                controller.clearOauth(server.id)
                            } else {
                                controller.beginOauth(server.id)
                            }
                        },
                    )
                }
                if (state.oauthLifecycle != GlobalMcpOauthLifecycle.Idle) item {
                    Text(
                        stringResource(state.oauthLifecycle.messageResource()),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                state.authorizationUrl?.let { url ->
                    item {
                        Button(
                            onClick = {
                                if (runCatching { uriHandler.openUri(url) }.isSuccess) {
                                    controller.continueOauthAfterBrowserOpened()
                                }
                            },
                        ) {
                            Text(stringResource(R.string.settings_global_mcp_open_browser))
                        }
                    }
                }
            }
        }
    }
    if (adding || editor != null) McpServerEditorSheet(
        server = editor,
        existingNames = state.servers.mapTo(linkedSetOf()) { it.name.lowercase() },
        onDismiss = { adding = false; editor = null },
        onSave = {
            controller.upsert(it)
            adding = false
            editor = null
        },
    )
    deleting?.let { server ->
        AlertDialog(
            onDismissRequest = { deleting = null },
            title = { Text(stringResource(R.string.settings_global_mcp_delete_title)) },
            text = { Text(stringResource(R.string.settings_global_mcp_delete_message, server.name)) },
            confirmButton = {
                Button(onClick = { controller.remove(server.id); deleting = null }) {
                    Text(stringResource(R.string.settings_global_mcp_delete))
                }
            },
            dismissButton = {
                TextButton(onClick = { deleting = null }) {
                    Text(stringResource(R.string.settings_global_mcp_cancel))
                }
            },
        )
    }
    movingServerId?.let { serverId ->
        state.servers.firstOrNull { it.id == serverId }?.let { server ->
            GlobalMcpMoveSheet(
                server = server,
                projects = projects,
                enabled = canManage && !state.mutating,
                onDismiss = { movingServerId = null },
                onMove = { projectId ->
                    movingServerId = null
                    controller.move(server.id, projectId)
                },
            )
        }
    }
    toolServerId?.let { serverId ->
        state.servers.firstOrNull { it.id == serverId }?.let { server ->
            GlobalMcpToolsSheet(
                server = server,
                tools = state.probes[server.id]?.tools.orEmpty(),
                enabled = canManage && !state.mutating,
                onDismiss = { toolServerId = null },
                onToggle = { tool, enabled ->
                    controller.upsert(
                        server.copy(
                            disabledTools = updatedDisabledTools(
                                server.disabledTools,
                                tool,
                                enabled,
                            ),
                        ),
                    )
                },
            )
        }
    }
}

@Composable
private fun GlobalMcpServerCard(
    server: McpServer,
    state: GlobalMcpSettingsUiState,
    canManage: Boolean,
    canMove: Boolean,
    onToggle: (Boolean) -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onMove: () -> Unit,
    onTools: () -> Unit,
    onProbe: () -> Unit,
    onOauth: () -> Unit,
) {
    val probe = state.probes[server.id]
    val enabled = canManage && !state.mutating
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .toggleable(
                        value = server.enabled,
                        enabled = enabled,
                        role = Role.Switch,
                        onValueChange = onToggle,
                    ),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(server.name, style = MaterialTheme.typography.titleMedium)
                    if (server.description.isNotBlank()) Text(
                        server.description,
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Text(server.transport.safeLabel(), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Switch(
                    checked = server.enabled,
                    enabled = enabled,
                    onCheckedChange = null,
                    modifier = Modifier.clearAndSetSemantics {},
                )
            }
            probe?.let {
                Text(
                    stringResource(
                        R.string.settings_global_mcp_probe_summary,
                        it.status,
                        it.toolCount,
                        it.latencyMs,
                    ),
                    style = MaterialTheme.typography.bodySmall,
                )
                if (it.tools.isNotEmpty()) Text(
                    it.tools.joinToString(),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            HorizontalDivider()
            Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                IconButton(enabled = enabled, onClick = onEdit) {
                    Icon(Icons.Outlined.Edit, stringResource(R.string.settings_global_mcp_edit))
                }
                IconButton(enabled = enabled, onClick = onDelete) {
                    Icon(Icons.Outlined.Delete, stringResource(R.string.settings_global_mcp_delete))
                }
                if (state.probes[server.id]?.tools?.isNotEmpty() == true) IconButton(
                    enabled = enabled,
                    onClick = onTools,
                ) {
                    Icon(Icons.Outlined.Build, stringResource(R.string.settings_global_mcp_tools))
                }
                if (canMove) IconButton(
                    enabled = enabled,
                    onClick = onMove,
                ) {
                    Icon(Icons.Outlined.FolderOpen, stringResource(R.string.settings_global_mcp_move))
                }
                IconButton(
                    enabled = enabled && state.probingServerId == null,
                    onClick = onProbe,
                ) {
                    if (state.probingServerId == server.id) CircularProgressIndicator()
                    else Icon(Icons.Outlined.PlayArrow, stringResource(R.string.settings_global_mcp_probe))
                }
                if (server.transport !is McpStdioTransport) IconButton(
                    enabled = enabled,
                    onClick = onOauth,
                ) {
                    val authorized = server.id in state.authenticatedServerIds
                    Icon(
                        if (authorized) Icons.AutoMirrored.Outlined.Logout
                        else Icons.AutoMirrored.Outlined.Login,
                        stringResource(
                            if (authorized) R.string.settings_global_mcp_clear_oauth
                            else R.string.settings_global_mcp_authorize,
                        ),
                    )
                }
            }
        }
    }
}

private fun GlobalMcpOauthLifecycle.messageResource(): Int = when (this) {
    GlobalMcpOauthLifecycle.Idle -> R.string.settings_global_mcp_oauth_idle
    GlobalMcpOauthLifecycle.Checking -> R.string.settings_global_mcp_oauth_checking
    GlobalMcpOauthLifecycle.Ready -> R.string.settings_global_mcp_oauth_ready
    GlobalMcpOauthLifecycle.Starting -> R.string.settings_global_mcp_oauth_starting
    GlobalMcpOauthLifecycle.OpeningBrowser -> R.string.settings_global_mcp_oauth_open_browser
    GlobalMcpOauthLifecycle.Waiting -> R.string.settings_global_mcp_oauth_waiting
    GlobalMcpOauthLifecycle.Authorized -> R.string.settings_global_mcp_oauth_authorized
    GlobalMcpOauthLifecycle.Failed -> R.string.settings_global_mcp_oauth_failed
    GlobalMcpOauthLifecycle.Paused -> R.string.settings_global_mcp_oauth_paused
}

private fun com.poracode.app.model.McpTransport.safeLabel(): String = when (this) {
    is McpStdioTransport -> command
    is McpHttpTransport -> url.substringBefore('?')
    is McpSseTransport -> url.substringBefore('?')
}

internal fun updatedDisabledTools(
    current: List<String>?,
    tool: String,
    enabled: Boolean,
): List<String>? {
    val disabled = current.orEmpty().toMutableSet()
    if (enabled) disabled.remove(tool) else disabled.add(tool)
    return disabled.sorted().takeIf(List<String>::isNotEmpty)
}

private val NAME = Regex("^[A-Za-z0-9][A-Za-z0-9_.-]*$")
