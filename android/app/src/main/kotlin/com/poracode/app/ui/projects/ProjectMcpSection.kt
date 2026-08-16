package com.poracode.app.ui.projects

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.model.McpHttpTransport
import com.poracode.app.model.McpServer
import com.poracode.app.model.McpSseTransport
import com.poracode.app.model.McpStdioTransport
import com.poracode.app.model.PatchValue
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.ProjectPatch
import com.poracode.app.model.UpdateProject
import com.poracode.app.session.projects.ProjectCommandOutcome
import com.poracode.app.session.projects.ProjectOperationFailure
import com.poracode.app.session.projects.ProjectSessionRuntime
import kotlinx.coroutines.launch

@Composable
internal fun ProjectMcpSection(
    runtime: ProjectSessionRuntime,
    identity: ProjectIdentity,
    access: ProjectUiAccess,
    commandBusy: Boolean,
) {
    val state by runtime.settings.state.collectAsStateWithLifecycle()
    val entry = state.entries[identity]
    var localBusy by remember(identity) { mutableStateOf(false) }
    var failure by remember(identity) { mutableStateOf<ProjectOperationFailure?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(identity, access.canManage) {
        if (access.canManage) runtime.settings.load(identity)
    }

    ProjectSection(stringResource(R.string.projects_mcp_integrations)) {
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
        if (entry == null || entry.loading || localBusy) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator()
                Text(stringResource(R.string.projects_loading_integrations))
            }
            return@ProjectSection
        }
        val servers = entry.settings?.mcpServers.orEmpty()
        if (servers.isEmpty()) {
            Text(stringResource(R.string.projects_no_integrations))
        }
        servers.forEach { server ->
            McpServerToggle(
                server = server,
                enabled = !commandBusy && !localBusy,
                onEnabledChange = { checked ->
                    val updated = servers.withServerEnabled(server.id, checked)
                    localBusy = true
                    failure = null
                    scope.launch {
                        when (
                            val outcome = runtime.catalog.execute(
                                UpdateProject(
                                    projectId = identity.projectId,
                                    patch = ProjectPatch(mcpServers = PatchValue.Set(updated)),
                                ),
                            )
                        ) {
                            is ProjectCommandOutcome.Applied -> runtime.settings.load(identity)
                            is ProjectCommandOutcome.Rejected -> failure = outcome.failure
                            ProjectCommandOutcome.Stale -> Unit
                        }
                        localBusy = false
                    }
                },
            )
        }
        ProjectFailureText(failure ?: entry.failure)
    }
}

@Composable
private fun McpServerToggle(
    server: McpServer,
    enabled: Boolean,
    onEnabledChange: (Boolean) -> Unit,
) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(server.name, style = MaterialTheme.typography.titleSmall)
            if (server.description.isNotBlank()) {
                Text(
                    server.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                transportLabel(server),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Switch(
            checked = server.enabled,
            onCheckedChange = onEnabledChange,
            enabled = enabled,
            modifier = Modifier.semantics { contentDescription = server.name },
        )
    }
}

@Composable
private fun transportLabel(server: McpServer): String = when (server.transport) {
    is McpStdioTransport -> stringResource(R.string.projects_mcp_local_process)
    is McpHttpTransport -> stringResource(R.string.projects_mcp_http)
    is McpSseTransport -> stringResource(R.string.projects_mcp_sse)
}
