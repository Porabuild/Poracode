package com.poracode.app.ui.projects

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.RemoteProject
import com.poracode.app.session.projects.ProjectHostLease
import com.poracode.app.session.projects.ProjectSessionRuntime

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ProjectNotesScreen(
    runtime: ProjectSessionRuntime,
    lease: ProjectHostLease,
    project: RemoteProject,
    identity: ProjectIdentity,
    access: ProjectUiAccess,
    onBack: () -> Unit,
) {
    BackHandler(onBack = onBack)
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.projects_notes)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Outlined.ArrowBack,
                            contentDescription = stringResource(R.string.back),
                        )
                    }
                },
            )
        },
    ) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding)) {
            item("access") { ProjectAccessBanner(lease, access) }
            item("project") {
                Text(
                    project.name,
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                )
            }
            item("notes-${identity.connectionId.value}:${identity.projectId}") {
                Box(Modifier.padding(horizontal = 16.dp)) {
                    ProjectNotesSection(
                        runtime = runtime,
                        identity = identity,
                        access = access,
                    )
                }
            }
            item("bottom-space") {
                androidx.compose.foundation.layout.Spacer(Modifier.height(24.dp))
            }
        }
    }
}
