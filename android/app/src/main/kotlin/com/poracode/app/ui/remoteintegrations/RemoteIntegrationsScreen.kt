package com.poracode.app.ui.remoteintegrations

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.SystemUpdate
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.PrimaryScrollableTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R

/** Adaptive, standalone surface. The app shell owns runtime creation and navigation. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RemoteIntegrationsScreen(
    composition: RemoteIntegrationsComposition,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val lease by composition.hostLease.collectAsStateWithLifecycle()
    val hostLabel by composition.hostLabel.collectAsStateWithLifecycle()
    val state by composition.controller.state.collectAsStateWithLifecycle()
    val access = RemoteIntegrationsAccess.from(lease)
    var sectionName by rememberSaveable { mutableStateOf(RemoteIntegrationsSection.Update.name) }
    val section = RemoteIntegrationsSection.entries.firstOrNull { it.name == sectionName }
        ?: RemoteIntegrationsSection.Update

    LaunchedEffect(lease?.key) { sectionName = RemoteIntegrationsSection.Update.name }
    LaunchedEffect(section, lease?.key) {
        val allowed = when (section) {
            RemoteIntegrationsSection.Update -> access.canManageProjects
            RemoteIntegrationsSection.Schedules -> access.canRead
            RemoteIntegrationsSection.PrWatches -> access.canRead && state.prKey != null
        }
        if (allowed) composition.refresh(section)
    }
    DisposableEffect(composition) {
        onDispose(composition::cancelTransientWork)
    }
    BackHandler(onBack = onBack)

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(stringResource(R.string.remote_integrations_title))
                        hostLabel?.let { Text(it, style = androidx.compose.material3.MaterialTheme.typography.labelSmall) }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Outlined.ArrowBack,
                            stringResource(R.string.remote_integrations_back),
                        )
                    }
                },
                actions = {
                    IconButton(
                        onClick = { composition.refresh(section) },
                        enabled = sectionCanRefresh(section, access, state.prKey != null),
                    ) {
                        Icon(
                            Icons.Outlined.Refresh,
                            stringResource(R.string.remote_integrations_refresh),
                        )
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            RemoteIntegrationsAccessBanner(access, section)
            BoxWithConstraints(Modifier.fillMaxSize()) {
                if (maxWidth >= 840.dp) {
                    Row(Modifier.fillMaxSize()) {
                        IntegrationNavigationRail(section) { sectionName = it.name }
                        VerticalDivider()
                        SectionContent(section, access, state, composition, Modifier.weight(1f))
                    }
                } else {
                    Column(Modifier.fillMaxSize()) {
                        IntegrationTabs(section) { sectionName = it.name }
                        SectionContent(section, access, state, composition, Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionContent(
    section: RemoteIntegrationsSection,
    access: RemoteIntegrationsAccess,
    state: com.poracode.app.session.remoteintegrations.RemoteIntegrationsState,
    composition: RemoteIntegrationsComposition,
    modifier: Modifier,
) {
    when (section) {
        RemoteIntegrationsSection.Update -> RemoteUpdatePane(state, access, composition, modifier)
        RemoteIntegrationsSection.Schedules -> RemoteSchedulesPane(state, access, composition, modifier)
        RemoteIntegrationsSection.PrWatches -> RemotePrWatchesPane(state, access, composition, modifier)
    }
}

@Composable
private fun IntegrationTabs(
    selected: RemoteIntegrationsSection,
    onSelect: (RemoteIntegrationsSection) -> Unit,
) {
    PrimaryScrollableTabRow(selectedTabIndex = selected.ordinal) {
        RemoteIntegrationsSection.entries.forEach { section ->
            Tab(
                selected = section == selected,
                onClick = { onSelect(section) },
                text = { Text(sectionLabel(section)) },
                icon = { Icon(sectionIcon(section), contentDescription = null) },
            )
        }
    }
}

@Composable
private fun IntegrationNavigationRail(
    selected: RemoteIntegrationsSection,
    onSelect: (RemoteIntegrationsSection) -> Unit,
) {
    NavigationRail {
        RemoteIntegrationsSection.entries.forEach { section ->
            NavigationRailItem(
                selected = section == selected,
                onClick = { onSelect(section) },
                icon = { Icon(sectionIcon(section), contentDescription = null) },
                label = { Text(sectionLabel(section)) },
            )
        }
    }
}

@Composable
private fun sectionLabel(section: RemoteIntegrationsSection): String = stringResource(
    when (section) {
        RemoteIntegrationsSection.Update -> R.string.remote_integrations_update
        RemoteIntegrationsSection.Schedules -> R.string.remote_integrations_schedules
        RemoteIntegrationsSection.PrWatches -> R.string.remote_integrations_pr_watches
    },
)

private fun sectionIcon(section: RemoteIntegrationsSection): ImageVector = when (section) {
    RemoteIntegrationsSection.Update -> Icons.Outlined.SystemUpdate
    RemoteIntegrationsSection.Schedules -> Icons.Outlined.Schedule
    RemoteIntegrationsSection.PrWatches -> Icons.Outlined.Visibility
}

private fun sectionCanRefresh(
    section: RemoteIntegrationsSection,
    access: RemoteIntegrationsAccess,
    hasPrKey: Boolean,
) = when (section) {
    RemoteIntegrationsSection.Update -> access.canManageProjects
    RemoteIntegrationsSection.Schedules -> access.canRead
    RemoteIntegrationsSection.PrWatches -> access.canRead && hasPrKey
}
