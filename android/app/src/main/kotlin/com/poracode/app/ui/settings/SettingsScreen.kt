package com.poracode.app.ui.settings

import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.adaptive.currentWindowAdaptiveInfoV2
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import com.poracode.app.R
import com.poracode.app.push.PushUiState
import com.poracode.app.storage.DeviceSettingsPreferences
import com.poracode.app.ui.changelog.ReleaseNotesPane
import com.poracode.app.ui.components.PoracodeDrawerNavItem
import com.poracode.app.ui.components.PoracodeIconButton
import com.poracode.app.ui.components.PoracodePaneContainer
import com.poracode.app.ui.components.PoracodeSectionLabel
import com.poracode.app.ui.components.PoracodeTopAppBar
import com.poracode.app.ui.components.rememberPredictiveBackModifier
import com.poracode.app.ui.components.rememberReducedMotion
import com.poracode.app.ui.components.sharedAxisX
import com.poracode.app.ui.theme.CustomThemeStore
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeMetrics
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme

/**
 * Adaptive settings hierarchy matching the Material 3 multi-pane architecture:
 * - Compact (`< 760dp`): single-pane Device -> Desktop -> Detail push navigation.
 * - Wide (`>= 760dp`): full-height tonal navigation sidebar on `colors.surface`
 *   with flat [PoracodeDrawerNavItem] rows + full-height `16dp` rounded detail
 *   [PoracodePaneContainer] on `colors.background` (zero top cut-offs, zero 1dp dividers).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    composition: SettingsUiComposition,
    deviceSettings: DeviceSettingsPreferences,
    pushState: PushUiState,
    expectedConnectionId: String?,
    initialPane: SettingsPane? = null,
    initialRouteOverride: String? = null,
    customThemes: CustomThemeStore? = null,
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
    onRefreshHostAgentStatuses: (suspend () -> Unit)? = null,
    onUseEnvironmentHost: (com.poracode.app.model.ClientConnectionId) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val environmentState = composition.environments?.state?.collectAsStateWithLifecycle()?.value
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
    val initialRoute = initialRouteOverride?.let { name ->
        SettingsRoute.entries.firstOrNull { it.name == name }
    } ?: initialPane?.route() ?: SettingsRoute.DeviceIndex
    var routeName by rememberSaveable(initialRoute) { mutableStateOf(initialRoute.name) }
    val route = SettingsRoute.entries.firstOrNull { it.name == routeName }
        ?: SettingsRoute.DeviceIndex
    val pane = route.pane()
    val desktopOwned = expectedConnectionId != null &&
        lease?.connectionId?.value == expectedConnectionId
    val leaseKey = lease?.let { "${it.connectionId.value}:${it.generation}" }
    val environmentsAvailable = environmentState?.capabilityAvailable == true &&
        environmentState.access.canRead

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
    LaunchedEffect(route, lease?.key, environmentsAvailable, expectedConnectionId) {
        if (desktopOwned && route == SettingsRoute.Environments && environmentsAvailable) {
            composition.environments.refresh()
        }
    }

    val openRoute: (SettingsRoute) -> Unit = { target ->
        if (target.isDesktopRoute() && !desktopOwned) onEnterDesktopSettings()
        routeName = target.name
    }

    BoxWithConstraints(modifier.fillMaxSize()) {
        val fontScale = androidx.compose.ui.platform.LocalDensity.current.fontScale
        val bookHinge = com.poracode.app.ui.components.rememberBookHingeSplit(
            containerWidthDp = maxWidth,
            defaultSidebarWidthDp = 280.dp,
        )
        val splitLayout = (maxWidth >= 760.dp || bookHinge.isBookPosture) && fontScale < 1.5f
        val effectiveRoute = if (splitLayout && (route == SettingsRoute.DeviceIndex || route == SettingsRoute.DesktopIndex)) {
            SettingsRoute.General
        } else {
            route
        }
        val effectivePane = effectiveRoute.pane()
        val navigateBack = {
            if (splitLayout) {
                onBack()
            } else {
                when (route) {
                    SettingsRoute.DeviceIndex -> onBack()
                    SettingsRoute.DesktopIndex -> onLeaveDesktopSettings()
                    else -> Unit
                }
                routeName = (route.parent() ?: SettingsRoute.DeviceIndex).name
            }
        }
        val backModifier = rememberPredictiveBackModifier(onBack = navigateBack)
        val reducedMotion = rememberReducedMotion()
        val colors = PoracodeTheme.colors
        val showRefresh = desktopOwned && (effectivePane != null && effectivePane != SettingsPane.Host ||
            effectiveRoute == SettingsRoute.GlobalMcp)
        val refreshEnabled = when {
            effectiveRoute == SettingsRoute.GlobalMcp -> access.canManageProjects && !globalMcp.mutating
            effectiveRoute == SettingsRoute.Environments -> access.canRead && environmentState?.busy == null
            else -> access.canRead
        }
        val settingsScope = androidx.compose.runtime.rememberCoroutineScope()
        val triggerRefresh: () -> Unit = {
            when {
                effectiveRoute == SettingsRoute.GlobalMcp -> composition.globalMcp.refresh()
                effectiveRoute == SettingsRoute.Environments -> composition.environments?.refresh()
                effectivePane == SettingsPane.Agents -> {
                    settingsScope.launch {
                        runCatching { onRefreshHostAgentStatuses?.invoke() }
                        composition.controller.refresh(SettingsPane.Agents)
                    }
                }
                else -> composition.controller.refresh(requireNotNull(effectivePane))
            }
        }

        val detailBody: @Composable (SettingsRoute) -> Unit = { current ->
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
                        onOpen = openRoute,
                        onOpenPrivacy = onOpenPrivacy,
                        onOpenSupport = onOpenSupport,
                    )
                    SettingsRoute.General -> DeviceGeneralPane(localSettings, deviceSettings)
                    SettingsRoute.Appearance -> DeviceAppearancePane(localSettings, deviceSettings, customThemes)
                    SettingsRoute.Notifications -> DeviceNotificationsPane(
                        pushState,
                        localSettings,
                        deviceSettings,
                        onPushAction,
                    )
                    SettingsRoute.Audio -> DeviceAudioPane(
                        showDictationButton = localSettings.showDictationButton,
                        backend = com.poracode.app.ui.voice.VoiceDictationBackend.fromWire(localSettings.voiceBackend),
                        onToggleDictationButton = deviceSettings::setShowDictationButton,
                        onSelectBackend = { deviceSettings.setVoiceBackend(it.wireValue) },
                    )
                    SettingsRoute.Terminal -> DeviceTerminalPane(localSettings, deviceSettings)
                    SettingsRoute.Git -> DeviceGitPane(localSettings, deviceSettings)
                    SettingsRoute.KeyboardShortcuts -> DeviceKeyboardShortcutsPane(Modifier.fillMaxSize())
                    SettingsRoute.ReleaseNotes -> ReleaseNotesPane(Modifier.fillMaxSize())
                    SettingsRoute.DesktopIndex -> DesktopSettingsIndex(
                        host = host,
                        onOpen = openRoute,
                        onOpenSchedules = onOpenSchedules,
                        onOpenIntegrations = onOpenSettingsIntegrations,
                        onOpenAdvanced = onOpenAdvancedOperations,
                        onOpenBrowser = onOpenBrowserMirror,
                        environmentsAvailable = environmentsAvailable,
                        onOpenEnvironments = { openRoute(SettingsRoute.Environments) },
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
                    SettingsRoute.Environments -> {
                        val environments = composition.environments
                        val state = environmentState
                        if (environments != null && state != null) {
                            SettingsEnvironmentsPane(
                                state = state,
                                controller = environments,
                                onUse = onUseEnvironmentHost,
                                modifier = Modifier.fillMaxSize(),
                            )
                        } else {
                            SettingsLoading(stringResource(R.string.environments_unavailable))
                        }
                    }
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

        if (splitLayout) {
            com.poracode.app.ui.components.PoracodeAdaptiveSplitShell(
                dockedSidebarVisible = true,
                sidebarWidthDp = bookHinge.sidebarWidthDp,
                hingeGapDp = bookHinge.hingeGapDp,
                modifier = backModifier,
                sidebar = { sidebarModifier ->
                    Column(
                        modifier = sidebarModifier
                            .statusBarsPadding()
                            .navigationBarsPadding(),
                    ) {
                        com.poracode.app.ui.components.PoracodePaneHeader(
                            title = stringResource(R.string.settings_title),
                            horizontalPadding = 6.dp,
                            leading = {
                                PoracodeIconButton(
                                    icon = PoracodeIcons.ArrowBack,
                                    contentDescription = stringResource(R.string.settings_back),
                                    onClick = navigateBack,
                                )
                            },
                        )
                        SplitSettingsSidebar(
                            selected = effectiveRoute,
                            environmentsAvailable = environmentsAvailable,
                            onSelect = openRoute,
                            onOpenSchedules = onOpenSchedules,
                            onOpenIntegrations = onOpenSettingsIntegrations,
                            onOpenAdvanced = onOpenAdvancedOperations,
                            onOpenBrowser = onOpenBrowserMirror,
                            onOpenPrivacy = onOpenPrivacy,
                            onOpenSupport = onOpenSupport,
                            modifier = Modifier.weight(1f).fillMaxWidth(),
                        )
                    }
                },
            ) {
                Column(Modifier.fillMaxSize()) {
                    com.poracode.app.ui.components.PoracodePaneHeader(
                        title = settingsRouteTitle(effectiveRoute),
                        horizontalPadding = 20.dp,
                        trailing = {
                            if (showRefresh) {
                                PoracodeIconButton(
                                    icon = PoracodeIcons.Refresh,
                                    contentDescription = stringResource(R.string.settings_refresh),
                                    enabled = refreshEnabled,
                                    onClick = triggerRefresh,
                                )
                            }
                        },
                    )
                    com.poracode.app.ui.components.PoracodeCenteredDetail(
                        modifier = Modifier.weight(1f).fillMaxWidth(),
                    ) {
                        detailBody(effectiveRoute)
                    }
                }
            }
        } else {
            Scaffold(
                modifier = Modifier.fillMaxSize().then(backModifier),
                topBar = {
                    PoracodeTopAppBar(
                        title = { Text(settingsRouteTitle(route)) },
                        navigationIcon = {
                            IconButton(onClick = navigateBack) {
                                Icon(PoracodeIcons.ArrowBack, stringResource(R.string.settings_back))
                            }
                        },
                        actions = {
                            if (showRefresh) {
                                IconButton(onClick = triggerRefresh, enabled = refreshEnabled) {
                                    Icon(PoracodeIcons.Refresh, stringResource(R.string.settings_refresh))
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
                    detailBody(current)
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
        SettingsPane.Memory -> SettingsMemoryPane(
            entry = entry,
            access = access,
            mutation = mutation,
            leaseKey = leaseKey,
            onSave = { draft, baseline ->
                draft.patchFrom(baseline)?.let(composition.controller::saveSettings)
            },
            onRetry = { composition.controller.refresh(SettingsPane.Memory) },
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
        SettingsPane.Environments -> Unit
    }
}

@Composable
private fun settingsRouteTitle(route: SettingsRoute): String = stringResource(
    when (route) {
        SettingsRoute.DeviceIndex -> R.string.settings_title
        SettingsRoute.General -> R.string.settings_device_general
        SettingsRoute.Appearance -> R.string.settings_device_appearance
        SettingsRoute.Notifications -> R.string.settings_device_notifications
        SettingsRoute.Audio -> R.string.settings_device_audio
        SettingsRoute.Terminal -> R.string.settings_device_terminal
        SettingsRoute.Git -> R.string.settings_device_git
        SettingsRoute.KeyboardShortcuts -> R.string.settings_keyboard_shortcuts
        SettingsRoute.ReleaseNotes -> R.string.changelog_title
        SettingsRoute.DesktopIndex -> R.string.hosts_desktop_settings
        SettingsRoute.Host -> R.string.settings_host_title
        SettingsRoute.Agents -> R.string.settings_agents_title
        SettingsRoute.Usage -> R.string.settings_usage_title
        SettingsRoute.Profile -> R.string.settings_profile_title
        SettingsRoute.Preferences -> R.string.settings_generation_title
        SettingsRoute.Memory -> R.string.settings_memory_title
        SettingsRoute.Workspace -> R.string.settings_workspace_defaults
        SettingsRoute.Environments -> R.string.environments_settings_title
        SettingsRoute.GlobalMcp -> R.string.settings_global_mcp_title
        SettingsRoute.ArchivedThreads -> R.string.archived_threads_title
    },
)
