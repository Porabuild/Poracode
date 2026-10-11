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
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.model.ProjectWorkspaceTarget
import com.poracode.app.model.PatchValue
import com.poracode.app.model.ProjectPatch
import com.poracode.app.model.RemoveProject
import com.poracode.app.model.UpdateProject
import com.poracode.app.session.projects.CatalogProject
import com.poracode.app.session.projects.ProjectSessionRuntime
import com.poracode.app.session.projects.ProjectSessionKey
import com.poracode.app.ui.components.CompactAppBarTitle
import com.poracode.app.ui.projects.workspace.ProjectWorkspaceScreen
import com.poracode.app.ui.settings.GlobalMcpSettingsController
import com.poracode.app.ui.settingsintegrations.SettingsIntegrationsPage
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ProjectManagementScreen(
    runtime: ProjectSessionRuntime,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    inheritedSettings: ProjectInheritedSettings,
    onLoadInheritedSettings: () -> Unit,
    canOpenTerminal: Boolean,
    onOpenIntegrations: (
        com.poracode.app.model.ProjectIdentity,
        SettingsIntegrationsPage,
    ) -> Unit,
    mcpController: GlobalMcpSettingsController,
    onOpenTerminal: (com.poracode.app.model.ProjectIdentity, String?) -> Unit,
    onOpenAdvanced: (com.poracode.app.model.ProjectIdentity) -> Unit,
    initialProjectId: String? = null,
    initialDestination: ProjectManagementDestination = ProjectManagementDestination.Detail,
) {
    val lease by runtime.hostLease.collectAsStateWithLifecycle()
    val catalogs by runtime.catalog.state.collectAsStateWithLifecycle()
    val excludedProjectIds by runtime.syncPreferences.excludedProjectIds
        .collectAsStateWithLifecycle()
    val currentCatalog = catalogs.currentCatalog(lease)
    // Retain the latest host-owned rows while offline so device-local sync can
    // still be changed. Every remote action remains gated by the current lease.
    val catalog = catalogs.displayCatalog(lease)
    val access = ProjectUiAccess.from(lease)
    val exactInheritedSettings = inheritedSettings.takeIf {
        it.connectionId == lease?.connectionId
    } ?: ProjectInheritedSettings()
    val projects = catalog?.orderedProjects.orEmpty().manageableProjects()
    val busy = (currentCatalog?.activeCommands ?: 0) > 0
    val initialWorkspace = initialDestination.workspaceEntryPoint()
    val initialSelection = projectManagementSelection(initialProjectId, initialDestination)
    var selectedProjectId by rememberSaveable(initialProjectId, initialDestination) {
        mutableStateOf(initialSelection.selectedProjectId)
    }
    var workspaceProjectId by rememberSaveable(initialProjectId, initialDestination) {
        mutableStateOf(initialSelection.workspaceProjectId)
    }
    var detailPage by rememberSaveable(initialProjectId, initialDestination) {
        mutableStateOf(ProjectSettingsPage.Index)
    }
    var showAdd by rememberSaveable { mutableStateOf(false) }
    var observedLeaseKey by remember { mutableStateOf<ProjectSessionKey?>(null) }
    val scope = rememberCoroutineScope()

    fun setProjectEnabled(item: CatalogProject) {
        scope.launch {
            runtime.catalog.execute(
                item.identity,
                UpdateProject(
                    item.identity.projectId,
                    ProjectPatch(
                        disabled = PatchValue.Set(item.project.disabled != true),
                    ),
                ),
            )
        }
    }

    fun removeProject(item: CatalogProject) {
        scope.launch {
            val outcome = runtime.catalog.execute(
                item.identity,
                RemoveProject(item.identity.projectId),
            )
            if (outcome is com.poracode.app.session.projects.ProjectCommandOutcome.Applied &&
                selectedProjectId == item.identity.projectId
            ) {
                selectedProjectId = null
            }
        }
    }

    LaunchedEffect(lease?.key) {
        if (lease != null) onLoadInheritedSettings()
        if (observedLeaseKey != null && observedLeaseKey != lease?.key) {
            selectedProjectId = initialSelection.selectedProjectId
            workspaceProjectId = initialSelection.workspaceProjectId
            detailPage = ProjectSettingsPage.Index
            showAdd = false
        }
        observedLeaseKey = lease?.key
    }
    LaunchedEffect(selectedProjectId) {
        detailPage = ProjectSettingsPage.Index
    }
    LaunchedEffect(catalog?.session, projects.map { it.identity }) {
        if (catalog != null) {
            if (projects.none { it.identity.projectId == selectedProjectId }) {
                selectedProjectId = null
            }
            if (projects.none { it.identity.projectId == workspaceProjectId }) {
                workspaceProjectId = null
            }
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
            onBack = {
                if (initialWorkspace != null && workspaceProject.id == initialProjectId) {
                    onBack()
                } else {
                    workspaceProjectId = null
                }
            },
            initialSection = initialWorkspace?.workspaceSection
                ?: com.poracode.app.ui.projects.workspace.ProjectWorkspaceSection.Files,
            initialGithubSection = initialWorkspace?.githubSection
                ?: com.poracode.app.ui.projects.workspace.ProjectGithubSection.PullRequests,
        )
        return
    }

    val notesProject = catalog.project(selectedProjectId)
    val notesLease = lease
    if (
        initialDestination == ProjectManagementDestination.Notes &&
        notesProject != null &&
        notesLease != null &&
        notesProject.id == initialProjectId
    ) {
        ProjectNotesScreen(
            runtime = runtime,
            lease = notesLease,
            project = notesProject,
            identity = notesLease.identity(notesProject.id)!!,
            access = access,
            onBack = onBack,
        )
        return
    }

    BoxWithConstraints(Modifier.fillMaxSize()) {
        val expanded = maxWidth >= 840.dp
        val selected = catalog.project(selectedProjectId)
        val navigateBack = {
            when {
                selectedProjectId != null && detailPage != ProjectSettingsPage.Index -> {
                    detailPage = ProjectSettingsPage.Index
                }
                !expanded && selectedProjectId != null -> selectedProjectId = null
                else -> onBack()
            }
        }
        BackHandler(onBack = navigateBack)
        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        CompactAppBarTitle(
                            if (selected != null && detailPage != ProjectSettingsPage.Index) {
                                stringResource(detailPage.title)
                            } else if (!expanded && selected != null) {
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
                            onOpenSettings = {
                                selectedProjectId = it
                                detailPage = ProjectSettingsPage.Index
                            },
                            isSynced = { item ->
                                item.identity.projectId !in excludedProjectIds[
                                    item.identity.connectionId.value
                                ].orEmpty()
                            },
                            onSetSynced = { item, synced ->
                                runtime.syncPreferences.setSynced(
                                    item.identity.connectionId,
                                    item.identity.projectId,
                                    synced,
                                )
                            },
                            onOpenWorkspace = { item ->
                                selectedProjectId = item.identity.projectId
                                workspaceProjectId = item.identity.projectId
                            },
                            onOpenTerminal = { item, command ->
                                onOpenTerminal(item.identity, command)
                            },
                            onToggleEnabled = ::setProjectEnabled,
                            onRemove = ::removeProject,
                            manageEnabled = access.canManage && !busy,
                            workspaceEnabled = access.canRead,
                            terminalEnabled = access.canOperate && canOpenTerminal,
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
                                inheritedSettings = exactInheritedSettings,
                                canOpenTerminal = canOpenTerminal,
                                page = detailPage,
                                synced = selected.id !in excludedProjectIds[
                                    lease!!.connectionId.value
                                ].orEmpty(),
                                onSetSynced = { synced ->
                                    runtime.syncPreferences.setSynced(
                                        lease!!.connectionId,
                                        selected.id,
                                        synced,
                                    )
                                },
                                onOpenPage = { detailPage = it },
                                onOpenIntegrations = { page ->
                                    onOpenIntegrations(lease.identity(selected.id)!!, page)
                                },
                                mcpController = mcpController,
                                onOpenWorkspace = { workspaceProjectId = selected.id },
                                onOpenTerminal = {
                                    onOpenTerminal(lease.identity(selected.id)!!, null)
                                },
                                onOpenAdvanced = {
                                    onOpenAdvanced(lease.identity(selected.id)!!)
                                },
                                onRemoved = {
                                    detailPage = ProjectSettingsPage.Index
                                    selectedProjectId = null
                                },
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
                        inheritedSettings = exactInheritedSettings,
                        canOpenTerminal = canOpenTerminal,
                        page = detailPage,
                        synced = selected.id !in excludedProjectIds[
                            lease!!.connectionId.value
                        ].orEmpty(),
                        onSetSynced = { synced ->
                            runtime.syncPreferences.setSynced(
                                lease!!.connectionId,
                                selected.id,
                                synced,
                            )
                        },
                        onOpenPage = { detailPage = it },
                        onOpenIntegrations = { page ->
                            onOpenIntegrations(lease.identity(selected.id)!!, page)
                        },
                        mcpController = mcpController,
                        onOpenWorkspace = { workspaceProjectId = selected.id },
                        onOpenTerminal = {
                            onOpenTerminal(lease.identity(selected.id)!!, null)
                        },
                        onOpenAdvanced = {
                            onOpenAdvanced(lease.identity(selected.id)!!)
                        },
                        onRemoved = {
                            detailPage = ProjectSettingsPage.Index
                            selectedProjectId = null
                        },
                        modifier = Modifier.fillMaxSize(),
                    )
                } else {
                    ProjectListPane(
                        projects = projects,
                        selectedProjectId = null,
                        onSelect = { selectedProjectId = it },
                        onOpenSettings = {
                            selectedProjectId = it
                            detailPage = ProjectSettingsPage.Index
                        },
                        isSynced = { item ->
                            item.identity.projectId !in excludedProjectIds[
                                item.identity.connectionId.value
                            ].orEmpty()
                        },
                        onSetSynced = { item, synced ->
                            runtime.syncPreferences.setSynced(
                                item.identity.connectionId,
                                item.identity.projectId,
                                synced,
                            )
                        },
                        onOpenWorkspace = { item ->
                            selectedProjectId = item.identity.projectId
                            workspaceProjectId = item.identity.projectId
                        },
                        onOpenTerminal = { item, command ->
                            onOpenTerminal(item.identity, command)
                        },
                        onToggleEnabled = ::setProjectEnabled,
                        onRemove = ::removeProject,
                        manageEnabled = access.canManage && !busy,
                        workspaceEnabled = access.canRead,
                        terminalEnabled = access.canOperate && canOpenTerminal,
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
