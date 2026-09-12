package com.poracode.app.ui.settings

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.push.PushUiState
import com.poracode.app.storage.DeviceSettingsPreferences
import com.poracode.app.ui.components.rememberReducedMotion
import com.poracode.app.ui.components.sharedAxisX

/** Material settings hierarchy: device index, selected desktop index, then detail. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    composition: SettingsUiComposition,
    deviceSettings: DeviceSettingsPreferences,
    pushState: PushUiState,
    expectedConnectionId: String?,
    initialPane: SettingsPane? = null,
    onBack: () -> Unit,
    onPushAction: () -> Unit,
    onEnterDesktopSettings: () -> Unit,
    onLeaveDesktopSettings: () -> Unit,
    onOpenSchedules: () -> Unit,
    onOpenSettingsIntegrations: () -> Unit,
    onOpenAdvancedOperations: () -> Unit,
    onOpenBrowserMirror: () -> Unit,
    onOpenPrivacy: () -> Unit,
    onOpenSupport: () -> Unit,
    archivedThreads: @Composable (Modifier) -> Unit,
    modifier: Modifier = Modifier,
) {
    val lease by composition.hostLease.collectAsStateWithLifecycle()
    val host by composition.host.collectAsStateWithLifecycle()
    val information by composition.information.state.collectAsStateWithLifecycle()
    val replayCache by composition.replayCache.collectAsStateWithLifecycle()
    val mutation by composition.controller.mutation.collectAsStateWithLifecycle()
    val globalMcp by composition.globalMcp.state.collectAsStateWithLifecycle()
    val globalMcpProjects by composition.mcpProjects.collectAsStateWithLifecycle()
    val localSettings by deviceSettings.state.collectAsStateWithLifecycle()
    val access = SettingsUiAccess.from(lease)
    val entry = lease?.key?.let(information.entries::get)
    val initialRoute = initialPane?.route() ?: SettingsRoute.DeviceIndex
    var routeName by rememberSaveable(initialRoute) { mutableStateOf(initialRoute.name) }
    val route = SettingsRoute.entries.firstOrNull { it.name == routeName }
        ?: SettingsRoute.DeviceIndex
    val pane = route.pane()
    val desktopOwned = expectedConnectionId != null &&
        lease?.connectionId?.value == expectedConnectionId
    val leaseKey = lease?.let { "${it.connectionId.value}:${it.generation}" }

    LaunchedEffect(pane, lease?.key, access.canRead, expectedConnectionId) {
        if (desktopOwned && (pane == SettingsPane.Host || (pane != null && access.canRead))) {
            composition.controller.refresh(pane)
        }
    }
    LaunchedEffect(route, lease?.key, access.canManageProjects, expectedConnectionId) {
        if (desktopOwned && route == SettingsRoute.GlobalMcp && access.canManageProjects) {
            composition.globalMcp.refresh()
            composition.globalMcp.refreshOauthStatus()
        }
    }
    val navigateBack = {
        when (route) {
            SettingsRoute.DeviceIndex -> onBack()
            SettingsRoute.DesktopIndex -> onLeaveDesktopSettings()
            else -> Unit
        }
        routeName = (route.parent() ?: SettingsRoute.DeviceIndex).name
    }
    BackHandler(onBack = navigateBack)
    val reducedMotion = rememberReducedMotion()

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text(settingsRouteTitle(route)) },
                navigationIcon = {
                    IconButton(onClick = navigateBack) {
                        Icon(
                            Icons.AutoMirrored.Outlined.ArrowBack,
                            stringResource(R.string.settings_back),
                        )
                    }
                },
                actions = {
                    if (desktopOwned && (pane != null && pane != SettingsPane.Host ||
                            route == SettingsRoute.GlobalMcp)) {
                        IconButton(
                            onClick = {
                                if (route == SettingsRoute.GlobalMcp) composition.globalMcp.refresh()
                                else composition.controller.refresh(requireNotNull(pane))
                            },
                            enabled = if (route == SettingsRoute.GlobalMcp) {
                                access.canManageProjects && !globalMcp.mutating
                            } else access.canRead,
                        ) {
                            Icon(Icons.Outlined.Refresh, stringResource(R.string.settings_refresh))
                        }
                    }
                },
            )
        },
    ) { padding ->
        AnimatedContent(
            targetState = route,
            contentKey = { it.name },
            transitionSpec = {
                sharedAxisX(
                    forward = targetState.depth() >= initialState.depth(),
                    reducedMotion = reducedMotion,
                )
            },
            modifier = Modifier.fillMaxSize().padding(padding),
            label = "SettingsRoute",
        ) { current ->
            val currentPane = current.pane()
            Column(Modifier.fillMaxSize()) {
                if (desktopOwned &&
                    (current == SettingsRoute.DesktopIndex || currentPane != null ||
                        current == SettingsRoute.GlobalMcp)
                ) {
                    SettingsAccessBanner(
                        access,
                        needsRead = currentPane != null && currentPane != SettingsPane.Host,
                        needsProjectsManage = current == SettingsRoute.GlobalMcp,
                    )
                }
                if ((current == SettingsRoute.DesktopIndex || currentPane != null ||
                        current == SettingsRoute.GlobalMcp) && !desktopOwned
                ) {
                    SettingsLoading(stringResource(R.string.settings_not_ready))
                } else when (current) {
                    SettingsRoute.DeviceIndex -> DeviceSettingsIndex(
                        onOpen = {
                            if (it == SettingsRoute.DesktopIndex) onEnterDesktopSettings()
                            routeName = it.name
                        },
                        onOpenPrivacy = onOpenPrivacy,
                        onOpenSupport = onOpenSupport,
                    )
                    SettingsRoute.General -> DeviceGeneralPane(localSettings, deviceSettings)
                    SettingsRoute.Appearance -> DeviceAppearancePane(localSettings, deviceSettings)
                    SettingsRoute.Notifications -> DeviceNotificationsPane(
                        pushState,
                        localSettings,
                        deviceSettings,
                        onPushAction,
                    )
                    SettingsRoute.Terminal -> DeviceTerminalPane(localSettings, deviceSettings)
                    SettingsRoute.Git -> DeviceGitPane(localSettings, deviceSettings)
                    SettingsRoute.DesktopIndex -> DesktopSettingsIndex(
                        host = host,
                        onOpen = { routeName = it.name },
                        onOpenSchedules = onOpenSchedules,
                        onOpenIntegrations = onOpenSettingsIntegrations,
                        onOpenAdvanced = onOpenAdvancedOperations,
                        onOpenBrowser = onOpenBrowserMirror,
                    )
                    SettingsRoute.ArchivedThreads -> archivedThreads(Modifier.fillMaxSize())
                    SettingsRoute.GlobalMcp -> GlobalMcpSettingsPane(
                        state = globalMcp,
                        projects = globalMcpProjects,
                        canManage = access.canManageProjects,
                        controller = composition.globalMcp,
                        onDiscover = onOpenSettingsIntegrations,
                        modifier = Modifier.fillMaxSize(),
                    )
                    else -> SettingsPaneContent(
                        pane = requireNotNull(currentPane),
                        host = host,
                        lease = lease,
                        entry = entry,
                        access = access,
                        mutation = mutation,
                        leaseKey = leaseKey,
                        composition = composition,
                        replayCache = replayCache,
                        modifier = Modifier.fillMaxSize(),
                    )
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
        SettingsPane.Usage -> SettingsUsagePane(
            entry = entry,
            access = access,
            replayCache = replayCache,
            onRetry = { composition.controller.refresh(SettingsPane.Usage) },
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
        SettingsPane.Workspace -> SettingsWorkspacePane(
            entry = entry,
            access = access,
            mutation = mutation,
            leaseKey = leaseKey,
            onSave = { draft, baseline ->
                draft.patchFrom(baseline)?.let(composition.controller::saveSettings)
            },
            onRetry = { composition.controller.refresh(SettingsPane.Workspace) },
            modifier = modifier,
        )
    }
}

@Composable
private fun settingsRouteTitle(route: SettingsRoute): String = stringResource(
    when (route) {
        SettingsRoute.DeviceIndex -> R.string.settings_title
        SettingsRoute.General -> R.string.settings_device_general
        SettingsRoute.Appearance -> R.string.settings_device_appearance
        SettingsRoute.Notifications -> R.string.settings_device_notifications
        SettingsRoute.Terminal -> R.string.settings_device_terminal
        SettingsRoute.Git -> R.string.settings_device_git
        SettingsRoute.DesktopIndex -> R.string.hosts_desktop_settings
        SettingsRoute.Host -> R.string.settings_host_title
        SettingsRoute.Agents -> R.string.settings_agents_title
        SettingsRoute.Usage -> R.string.settings_usage_title
        SettingsRoute.Profile -> R.string.settings_profile_title
        SettingsRoute.Preferences -> R.string.settings_generation_title
        SettingsRoute.Workspace -> R.string.settings_workspace_defaults
        SettingsRoute.GlobalMcp -> R.string.settings_global_mcp_title
        SettingsRoute.ArchivedThreads -> R.string.archived_threads_title
    },
)
