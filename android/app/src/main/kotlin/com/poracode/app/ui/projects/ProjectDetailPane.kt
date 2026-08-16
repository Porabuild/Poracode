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
import androidx.compose.material3.OutlinedButton
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

@Composable
internal fun ProjectDetailPane(
    runtime: ProjectSessionRuntime,
    lease: ProjectHostLease,
    project: RemoteProject,
    identity: ProjectIdentity,
    access: ProjectUiAccess,
    commandBusy: Boolean,
    onOpenWorkspace: () -> Unit,
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
        item(key = "workspace-${identity.connectionId.value}:${identity.projectId}") {
            OutlinedButton(
                onClick = onOpenWorkspace,
                enabled = access.canRead,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(stringResource(R.string.workspace_title))
            }
        }
        item(key = "general-${identity.connectionId.value}:${identity.projectId}") {
            ProjectGeneralSection(
                runtime = runtime,
                lease = lease,
                project = project,
                identity = identity,
                access = access,
                commandBusy = commandBusy,
                onRemoved = onRemoved,
            )
        }
        item(key = "notes-${identity.connectionId.value}:${identity.projectId}") {
            ProjectNotesSection(runtime, identity, access)
        }
        item(key = "mcp-${identity.connectionId.value}:${identity.projectId}") {
            ProjectMcpSection(runtime, identity, access, commandBusy)
        }
        item { Spacer(Modifier.height(32.dp)) }
    }
}
