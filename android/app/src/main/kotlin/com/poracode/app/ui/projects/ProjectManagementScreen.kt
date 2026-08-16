package com.poracode.app.ui.projects

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.model.ProjectWorkspaceTarget
import com.poracode.app.session.projects.ProjectSessionRuntime
import com.poracode.app.ui.projects.workspace.ProjectWorkspaceScreen

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProjectManagementScreen(
    runtime: ProjectSessionRuntime,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
) {
    val lease by runtime.hostLease.collectAsStateWithLifecycle()
    val catalogs by runtime.catalog.state.collectAsStateWithLifecycle()
    val catalog = catalogs.currentCatalog(lease)
    val access = ProjectUiAccess.from(lease)
    val projects = catalog?.orderedProjects.orEmpty()
    val busy = (catalog?.activeCommands ?: 0) > 0
    var selectedProjectId by rememberSaveable { mutableStateOf<String?>(null) }
    var workspaceProjectId by rememberSaveable { mutableStateOf<String?>(null) }
    var showAdd by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(lease?.key) {
        selectedProjectId = null
        workspaceProjectId = null
        showAdd = false
    }
    LaunchedEffect(projects.map { it.identity }) {
        if (projects.none { it.identity.projectId == selectedProjectId }) {
            selectedProjectId = null
        }
        if (projects.none { it.identity.projectId == workspaceProjectId }) {
            workspaceProjectId = null
        }
    }

    val workspaceProject = catalog.project(workspaceProjectId)
    val workspaceTarget = workspaceProject?.let { wp ->
        lease?.identity(wp.id)?.let { ProjectWorkspaceTarget(it, wp.location) }
    }
    LaunchedEffect(workspaceTarget, lease?.key) {
        runtime.setActiveWorkspaceTarget(workspaceTarget)
    }
    DisposableEffect(Unit) {
        onDispose { runtime.setActiveWorkspaceTarget(null) }
    }
    if (workspaceProject != null && lease != null) {
        val identity = lease.identity(workspaceProject.id)!!
        ProjectWorkspaceScreen(
            controller = runtime.workspace,
            gateway = runtime.workspaceGateway,
            gitController = runtime.gitOperations,
            githubController = runtime.githubOperations,
            lease = lease,
            target = workspaceTarget!!,
            projectName = workspaceProject.name,
            onBack = { workspaceProjectId = null },
        )
        return
    }

    BoxWithConstraints(Modifier.fillMaxSize()) {
        val expanded = maxWidth >= 840.dp
        val selected = catalog.project(selectedProjectId)
        val navigateBack = {
            if (!expanded && selectedProjectId != null) selectedProjectId = null else onBack()
        }
        BackHandler(onBack = navigateBack)
        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        Text(
                            if (!expanded && selected != null) {
                                selected.name
                            } else {
                                stringResource(R.string.projects_manage_title)
                            },
                        )
                    },
                    navigationIcon = {
                        IconButton(onClick = navigateBack) {
                            Icon(
                                Icons.AutoMirrored.Outlined.ArrowBack,
                                stringResource(R.string.back),
                            )
                        }
                    },
                    actions = {
                        IconButton(onClick = onRefresh, enabled = access.online && access.ready) {
                            Icon(
                                Icons.Outlined.Refresh,
                                stringResource(R.string.refresh_projects),
                            )
                        }
                        IconButton(
                            onClick = { showAdd = true },
                            enabled = access.canManage && !busy,
                        ) {
                            Icon(Icons.Outlined.Add, stringResource(R.string.projects_add_title))
                        }
                    },
                )
            },
        ) { padding ->
            Column(Modifier.fillMaxSize().padding(padding)) {
                if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
                ProjectAccessBanner(lease, access)
                if (expanded) {
                    Row(Modifier.fillMaxSize()) {
                        ProjectListPane(
                            projects = projects,
                            selectedProjectId = selectedProjectId,
                            onSelect = { selectedProjectId = it },
                            modifier = Modifier.width(360.dp).fillMaxHeight(),
                        )
                        HorizontalDivider(Modifier.fillMaxHeight().width(1.dp))
                        if (selected != null) {
                            ProjectDetailPane(
                                runtime = runtime,
                                lease = lease!!,
                                project = selected,
                                identity = lease.identity(selected.id)!!,
                                access = access,
                                commandBusy = busy,
                                onOpenWorkspace = { workspaceProjectId = selected.id },
                                onRemoved = { selectedProjectId = null },
                                modifier = Modifier.weight(1f),
                            )
                        } else {
                            ProjectEmptyDetail(Modifier.weight(1f))
                        }
                    }
                } else if (selected != null) {
                    ProjectDetailPane(
                        runtime = runtime,
                        lease = lease!!,
                        project = selected,
                        identity = lease.identity(selected.id)!!,
                        access = access,
                        commandBusy = busy,
                        onOpenWorkspace = { workspaceProjectId = selected.id },
                        onRemoved = { selectedProjectId = null },
                        modifier = Modifier.fillMaxSize(),
                    )
                } else {
                    ProjectListPane(
                        projects = projects,
                        selectedProjectId = null,
                        onSelect = { selectedProjectId = it },
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }
        }
    }

    if (showAdd && lease != null) {
        AddProjectDialog(
            runtime = runtime,
            lease = lease!!,
            enabled = access.canManage && !busy,
            onDismiss = { showAdd = false },
        )
    }
}
