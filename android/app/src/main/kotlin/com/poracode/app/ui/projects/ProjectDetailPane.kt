package com.poracode.app.ui.projects

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.RemoteProject
import com.poracode.app.model.displayPath
import com.poracode.app.session.projects.ProjectHostLease
import com.poracode.app.session.projects.ProjectSessionRuntime
import com.poracode.app.ui.settings.GlobalMcpSettingsController
import com.poracode.app.ui.settingsintegrations.SettingsIntegrationsPage

@Composable
internal fun ProjectDetailPane(
    runtime: ProjectSessionRuntime,
    lease: ProjectHostLease,
    project: RemoteProject,
    identity: ProjectIdentity,
    access: ProjectUiAccess,
    commandBusy: Boolean,
    inheritedSettings: ProjectInheritedSettings,
    canOpenTerminal: Boolean,
    page: ProjectSettingsPage,
    synced: Boolean,
    onSetSynced: (Boolean) -> Unit,
    onOpenPage: (ProjectSettingsPage) -> Unit,
    onOpenIntegrations: (SettingsIntegrationsPage) -> Unit,
    mcpController: GlobalMcpSettingsController,
    onOpenWorkspace: () -> Unit,
    onOpenTerminal: () -> Unit,
    onOpenAdvanced: () -> Unit,
    onRemoved: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val catalogs by runtime.catalog.state.collectAsStateWithLifecycle()
    val catalog = catalogs.currentCatalog(lease)
    LazyColumn(
        modifier = modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item(key = "header-${identity.connectionId.value}:${identity.projectId}") {
            Column(Modifier.fillMaxWidth().padding(top = 16.dp)) {
                Text(project.name, style = MaterialTheme.typography.headlineSmall)
                Text(
                    project.location.displayPath(),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                if (project.disabled == true) {
                    Text(
                        stringResource(R.string.projects_disabled),
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.labelMedium,
                    )
                }
                ProjectFailureText(catalog?.failure, Modifier.padding(top = 8.dp))
                if (catalog?.setupFailure != null) {
                    Text(
                        stringResource(R.string.projects_setup_detection_failed),
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
            }
        }
        item(key = "page-${page.name}-${identity.connectionId.value}:${identity.projectId}") {
            when (page) {
                ProjectSettingsPage.Index -> ProjectSettingsIndex(
                    onOpenPage = onOpenPage,
                    onOpenSkills = { onOpenIntegrations(SettingsIntegrationsPage.Skills) },
                    onOpenWorkspace = onOpenWorkspace,
                    onOpenTerminal = onOpenTerminal,
                    onOpenAdvanced = onOpenAdvanced,
                    workspaceEnabled = access.canRead,
                    terminalEnabled = access.canOperate && canOpenTerminal,
                )
                ProjectSettingsPage.General -> ProjectGeneralSection(
                    runtime = runtime,
                    lease = lease,
                    project = project,
                    identity = identity,
                    access = access,
                    commandBusy = commandBusy,
                    synced = synced,
                    onSetSynced = onSetSynced,
                    onRemoved = onRemoved,
                )
                ProjectSettingsPage.Worktrees -> ProjectWorktreeSettingsSection(
                    runtime = runtime,
                    project = project,
                    identity = identity,
                    access = access,
                    commandBusy = commandBusy,
                    inheritedSettings = inheritedSettings,
                )
                ProjectSettingsPage.Actions -> ProjectActionsSettingsSection(
                    runtime = runtime,
                    project = project,
                    identity = identity,
                    access = access,
                    commandBusy = commandBusy,
                )
                ProjectSettingsPage.Mcp -> ProjectMcpSection(
                    runtime = runtime,
                    identity = identity,
                    access = access,
                    commandBusy = commandBusy,
                    onDiscover = { onOpenIntegrations(SettingsIntegrationsPage.Mcp) },
                    mcpController = mcpController,
                )
                ProjectSettingsPage.Search -> ProjectSearchSettingsSection(
                    runtime = runtime,
                    project = project,
                    identity = identity,
                    access = access,
                    commandBusy = commandBusy,
                    inheritedSettings = inheritedSettings,
                )
                ProjectSettingsPage.Notes -> ProjectNotesSection(runtime, identity, access)
            }
        }
        item { Spacer(Modifier.height(32.dp)) }
    }
}
