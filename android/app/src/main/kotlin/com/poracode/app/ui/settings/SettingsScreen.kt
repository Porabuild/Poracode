package com.poracode.app.ui.settings

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Computer
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.Extension
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.SmartToy
import androidx.compose.material.icons.outlined.SystemUpdate
import androidx.compose.material.icons.outlined.Tune
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

/** Standalone settings surface. The app shell owns creation, navigation, and [onBack]. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    composition: SettingsUiComposition,
    onBack: () -> Unit,
    onOpenRemoteIntegrations: () -> Unit,
    onOpenSettingsIntegrations: () -> Unit,
    onOpenAdvancedOperations: () -> Unit,
    onOpenBrowserMirror: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val lease by composition.hostLease.collectAsStateWithLifecycle()
    val host by composition.host.collectAsStateWithLifecycle()
    val information by composition.information.state.collectAsStateWithLifecycle()
    val replayCache by composition.replayCache.collectAsStateWithLifecycle()
    val mutation by composition.controller.mutation.collectAsStateWithLifecycle()
    val access = SettingsUiAccess.from(lease)
    val entry = lease?.key?.let(information.entries::get)
    var paneName by rememberSaveable { mutableStateOf(SettingsPane.Host.name) }
    val pane = SettingsPane.entries.firstOrNull { it.name == paneName } ?: SettingsPane.Host
    val leaseKey = lease?.let { "${it.connectionId.value}:${it.generation}" }

    LaunchedEffect(lease?.key) { paneName = SettingsPane.Host.name }
    LaunchedEffect(pane, lease?.key, access.canRead) {
        if (pane == SettingsPane.Host || access.canRead) composition.controller.refresh(pane)
    }
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
                    IconButton(onClick = onOpenAdvancedOperations) {
                        Icon(
                            Icons.Outlined.Build,
                            stringResource(R.string.advanced_ops_title),
                        )
                    }
                    IconButton(onClick = onOpenBrowserMirror) {
                        Icon(
                            Icons.Outlined.Public,
                            stringResource(R.string.browser_mirror_title),
                        )
                    }
                    IconButton(onClick = onOpenSettingsIntegrations) {
                        Icon(
                            Icons.Outlined.Extension,
                            listOf(
                                stringResource(R.string.settings_integrations_skills),
                                stringResource(R.string.settings_integrations_mcp),
                            ).joinToString(" / "),
                        )
                    }
                    IconButton(onClick = onOpenRemoteIntegrations) {
                        Icon(
                            Icons.Outlined.SystemUpdate,
                            stringResource(R.string.remote_integrations_title),
                        )
                    }
                    if (pane != SettingsPane.Host) {
                        IconButton(
                            onClick = { composition.controller.refresh(pane) },
                            enabled = access.canRead,
                        ) {
                            Icon(
                                Icons.Outlined.Refresh,
                                stringResource(R.string.settings_refresh),
                            )
                        }
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            SettingsAccessBanner(access, needsRead = pane != SettingsPane.Host)
            BoxWithConstraints(Modifier.fillMaxSize()) {
                val expanded = maxWidth >= 840.dp
                if (expanded) {
                    Row(Modifier.fillMaxSize()) {
                        SettingsNavigationRail(pane) { paneName = it.name }
                        VerticalDivider()
                        SettingsPaneContent(
                            pane,
                            host,
                            lease,
                            entry,
                            access,
                            mutation,
                            leaseKey,
                            composition,
                            replayCache,
                            Modifier.weight(1f),
                        )
                    }
                } else {
                    Column(Modifier.fillMaxSize()) {
                        SettingsTabs(pane) { paneName = it.name }
                        SettingsPaneContent(
                            pane,
                            host,
                            lease,
                            entry,
                            access,
                            mutation,
                            leaseKey,
                            composition,
                            replayCache,
                            Modifier.weight(1f),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SettingsPaneContent(
    pane: SettingsPane,
    host: SettingsHostMetadata?,
    lease: com.poracode.app.session.settings.SettingsHostLease?,
    entry: com.poracode.app.session.settings.SettingsHostInformationEntry?,
    access: SettingsUiAccess,
    mutation: SettingsMutationState,
    leaseKey: String?,
    composition: SettingsUiComposition,
    replayCache: com.poracode.app.session.replay.HostReplayCacheUi,
    modifier: Modifier,
) {
    when (pane) {
        SettingsPane.Host -> SettingsHostPane(host, lease, access, modifier)
        SettingsPane.Agents -> SettingsAgentsPane(
            entry = entry,
            access = access,
            replayCache = replayCache,
            onRetry = { composition.controller.refresh(SettingsPane.Agents) },
            modifier = modifier,
        )
        SettingsPane.Profile -> SettingsProfilePane(
            entry = entry,
            access = access,
            mutation = mutation,
            leaseKey = leaseKey,
            onSave = { composition.controller.saveProfile(it.request()) },
            onRetry = { composition.controller.refresh(SettingsPane.Profile) },
            modifier = modifier,
        )
        SettingsPane.Preferences -> SettingsPreferencesPane(
            entry = entry,
            access = access,
            mutation = mutation,
            leaseKey = leaseKey,
            onSave = { draft, baseline ->
                draft.patchFrom(baseline)?.let(composition.controller::saveSettings)
            },
            onRetry = { composition.controller.refresh(SettingsPane.Preferences) },
            modifier = modifier,
        )
    }
}

@Composable
private fun SettingsTabs(selected: SettingsPane, onSelect: (SettingsPane) -> Unit) {
    PrimaryScrollableTabRow(selectedTabIndex = selected.ordinal) {
        SettingsPane.entries.forEach { pane ->
            val label = settingsPaneLabel(pane)
            Tab(
                selected = pane == selected,
                onClick = { onSelect(pane) },
                text = { Text(label) },
                icon = { Icon(settingsPaneIcon(pane), contentDescription = null) },
            )
        }
    }
}

@Composable
private fun SettingsNavigationRail(selected: SettingsPane, onSelect: (SettingsPane) -> Unit) {
    NavigationRail {
        SettingsPane.entries.forEach { pane ->
            NavigationRailItem(
                selected = pane == selected,
                onClick = { onSelect(pane) },
                icon = { Icon(settingsPaneIcon(pane), contentDescription = null) },
                label = { Text(settingsPaneLabel(pane)) },
            )
        }
    }
}

@Composable
private fun settingsPaneLabel(pane: SettingsPane): String = stringResource(
    when (pane) {
        SettingsPane.Host -> R.string.settings_host_title
        SettingsPane.Agents -> R.string.settings_agents_title
        SettingsPane.Profile -> R.string.settings_profile_title
        SettingsPane.Preferences -> R.string.settings_preferences_title
    },
)

private fun settingsPaneIcon(pane: SettingsPane): ImageVector = when (pane) {
    SettingsPane.Host -> Icons.Outlined.Computer
    SettingsPane.Agents -> Icons.Outlined.SmartToy
    SettingsPane.Profile -> Icons.Outlined.Person
    SettingsPane.Preferences -> Icons.Outlined.Tune
}
