package com.poracode.app.ui.settingsintegrations

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.protocol.settingsintegrations.SkillOwner

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsIntegrationsSessionScreen(
    composition: SettingsIntegrationsComposition,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val lease by composition.lease.collectAsStateWithLifecycle()
    val projects by composition.projects.collectAsStateWithLifecycle()
    val selectedProjectId by composition.selectedProjectId.collectAsStateWithLifecycle()
    val state by composition.controller.state.collectAsStateWithLifecycle()
    val owner = lease?.selectedProject ?: SkillOwner.Global
    var projectMenuExpanded by rememberSaveable { mutableStateOf(false) }
    val callbacks = remember(composition) {
        SettingsIntegrationsCallbacks(
            onRefreshSkills = { composition.refreshSkills(it) },
            onSetSkillEnabled = { owner, skill, enabled ->
                composition.setSkillEnabled(owner, skill, enabled)
            },
            onDeleteSkill = { owner, skill -> composition.deleteSkill(owner, skill) },
            onImportSkill = { composition.importSkill(it) },
            onMarketplaceSearch = { composition.searchMarketplace(it) },
            onInstallSkill = { composition.installMarketplaceSkill(it) },
            onDiscoverMcp = { composition.discoverMcp(it) },
            onProbeMcp = { owner, server -> composition.probeMcp(owner, server) },
            onBeginOauth = { owner, server -> composition.beginOauth(owner, server) },
            onLaunchOauth = composition::launchOauth,
            onClearOauth = { owner, url -> composition.clearOauth(owner, url) },
            onRefreshOauth = { composition.refreshOauth(it) },
        )
    }
    val access = SettingsIntegrationsAccess(
        hostSelected = lease != null,
        protocolCompatible = lease?.protocolVersion == 8,
        ready = lease?.ready == true,
        online = lease?.online == true,
        canRead = "session:read" in lease?.scopes.orEmpty(),
        canOperate = "session:operate" in lease?.scopes.orEmpty(),
    )

    LaunchedEffect(lease?.key, owner) {
        if (access.canRead && access.online && access.ready) {
            composition.refreshInitial(owner)
        }
    }
    DisposableEffect(composition) { onDispose(composition::onBackground) }
    BackHandler(onBack = onBack)

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.settings_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Outlined.ArrowBack,
                            stringResource(R.string.settings_back),
                        )
                    }
                },
                actions = {
                    if (projects.isNotEmpty()) {
                        val selectedName = projects.firstOrNull { it.id == selectedProjectId }?.name
                        Box {
                            TextButton(onClick = { projectMenuExpanded = true }) {
                                Text(
                                    selectedName
                                        ?: stringResource(R.string.settings_integrations_global),
                                )
                            }
                            DropdownMenu(
                                expanded = projectMenuExpanded,
                                onDismissRequest = { projectMenuExpanded = false },
                            ) {
                                DropdownMenuItem(
                                    text = {
                                        Text(stringResource(R.string.settings_integrations_global))
                                    },
                                    onClick = {
                                        projectMenuExpanded = false
                                        composition.selectProject(null)
                                    },
                                )
                                projects.forEach { project ->
                                    DropdownMenuItem(
                                        text = { Text(project.name) },
                                        onClick = {
                                            projectMenuExpanded = false
                                            composition.selectProject(project.id)
                                        },
                                    )
                                }
                            }
                        }
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            SettingsIntegrationsScreen(
                state = state,
                access = access,
                globalOwner = SkillOwner.Global,
                projectOwner = lease?.selectedProject,
                callbacks = callbacks,
                modifier = Modifier.weight(1f),
            )
        }
    }
}
