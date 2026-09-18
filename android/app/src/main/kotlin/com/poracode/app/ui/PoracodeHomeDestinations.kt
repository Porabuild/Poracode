package com.poracode.app.ui

import androidx.compose.runtime.Composable
import com.poracode.app.model.ClientConnectionId
import com.poracode.app.push.RemoteUserNotificationBanner
import com.poracode.app.push.PushUiState
import com.poracode.app.session.AppSession
import com.poracode.app.session.HostPresentation
import com.poracode.app.session.advancedops.AdvancedOpsProductionComposition
import com.poracode.app.session.browsermirror.BrowserMirrorComposition
import com.poracode.app.session.projects.ProjectSessionRuntime
import com.poracode.app.session.ports.PortForwardRuntime
import com.poracode.app.session.richchat.RichChatHostLease
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.session.richchat.canOperateTerminal
import com.poracode.app.session.threads.ThreadSessionRuntime
import com.poracode.app.storage.DeviceSettingsPreferences
import com.poracode.app.storage.DeviceSettingsState
import com.poracode.app.ui.advancedops.AdvancedOperationsScreen
import com.poracode.app.ui.browsermirror.BrowserMirrorScreen
import com.poracode.app.ui.home.HomeProjectFilterPresentation
import com.poracode.app.ui.home.HomeProjectUtility
import com.poracode.app.ui.home.HomeScreen
import com.poracode.app.ui.home.clearsThreadSelection
import com.poracode.app.ui.hosts.HostSwitcherScreen
import com.poracode.app.ui.onboarding.OnboardingScreen
import com.poracode.app.ui.ports.PortForwardScreen
import com.poracode.app.ui.projects.ProjectInheritedSettings
import com.poracode.app.ui.projects.ProjectManagementDestination
import com.poracode.app.ui.projects.ProjectManagementScreen
import com.poracode.app.ui.remoteintegrations.RemoteIntegrationsComposition
import com.poracode.app.ui.remoteintegrations.RemoteIntegrationsScreen
import com.poracode.app.ui.remoteintegrations.RemoteIntegrationsSection
import com.poracode.app.ui.remoteintegrations.ScheduleRunThreadTarget
import com.poracode.app.ui.settings.SettingsPane
import com.poracode.app.ui.settings.SettingsRoute
import com.poracode.app.ui.settings.SettingsScreen
import com.poracode.app.ui.settings.SettingsUiComposition
import com.poracode.app.ui.settingsintegrations.SettingsIntegrationsComposition
import com.poracode.app.ui.settingsintegrations.SettingsIntegrationsSessionScreen
import com.poracode.app.ui.settingsintegrations.importDiscoveredMcp
import com.poracode.app.ui.terminal.ProjectTerminalScreen
import com.poracode.app.ui.thread.ArchivedThreadsPane

/**
 * Per-destination content for the Home root, extracted out of `PoracodeApp.kt`.
 *
 * Every function below reads its identity parameters (project id, connection id, pane,
 * page, section, utility, initial command…) from the [HomeDestination] value passed into
 * it, never from live [PoracodeNavigationState] fields. `AnimatedContent` keeps composing
 * the outgoing destination during its exit transition after navigation state has already
 * moved on to the next destination, so a live `navigation.*` read (or a `requireNotNull` /
 * `!!` on one) in a branch body would crash mid-exit. Reading `navigation.*` inside
 * callbacks (onBack, onOpen…) remains safe — callbacks only fire while the screen is
 * visible.
 */

@Composable
internal fun PendingPairConfirmDestinationContent(
    state: AppSession.UiState,
    session: AppSession,
    pairWithPermission: (AppSession.PairingInput) -> Unit,
    confirmWithPermission: () -> Unit,
) {
    OnboardingScreen(
        state = state,
        onPair = pairWithPermission,
        onUnpair = session::unpair,
        onConfirmPendingPair = confirmWithPermission,
        onCancelPendingPair = session::cancelPendingPair,
    )
}

@Composable
internal fun AdvancedOperationsDestinationContent(
    navigation: PoracodeNavigationState,
    advanced: AdvancedOpsProductionComposition,
    defaultContentLanguage: String?,
) {
    AdvancedOperationsScreen(
        composition = advanced,
        defaultContentLanguage = defaultContentLanguage,
        onBack = {
            navigation.showAdvancedOperations = false
            navigation.advancedOperationsConnectionId = null
        },
    )
}

@Composable
internal fun BrowserMirrorDestinationContent(
    navigation: PoracodeNavigationState,
    browserMirror: BrowserMirrorComposition,
) {
    BrowserMirrorScreen(
        controller = browserMirror.controller,
        onBack = {
            navigation.showBrowserMirror = false
            navigation.browserMirrorConnectionId = null
        },
    )
}

@Composable
internal fun SettingsIntegrationsDestinationContent(
    destination: HomeDestination.SettingsIntegrations,
    navigation: PoracodeNavigationState,
    settingsIntegrations: SettingsIntegrationsComposition,
    settings: SettingsUiComposition,
) {
    SettingsIntegrationsSessionScreen(
        composition = settingsIntegrations,
        onImportMcp = settings::importDiscoveredMcp,
        onBack = {
            navigation.showSettingsIntegrations = false
            navigation.settingsIntegrationsProjectId = null
            navigation.settingsIntegrationsConnectionId = null
            navigation.settingsIntegrationsPage = null
        },
        initialProjectIdentity = destination.identity,
        initialPage = destination.page,
    )
}

@Composable
internal fun RemoteIntegrationsDestinationContent(
    destination: HomeDestination.RemoteIntegrations,
    navigation: PoracodeNavigationState,
    remoteIntegrations: RemoteIntegrationsComposition,
    session: AppSession,
    state: AppSession.UiState,
) {
    RemoteIntegrationsScreen(
        composition = remoteIntegrations,
        scheduleThreads = session.unifiedThreads().filter {
            it.connectionId == state.hostCatalog.selectedConnectionId
        }.map {
            ScheduleRunThreadTarget(
                threadId = it.thread.id,
                presentedId = it.id,
                title = it.thread.title,
                model = it.thread.config.model,
            )
        },
        onOpenThread = { presentedId ->
            navigation.remoteIntegrationsSection = null
            navigation.remoteIntegrationsConnectionId = null
            session.openThread(presentedId)
        },
        initialSection = destination.section,
        onBack = {
            navigation.remoteIntegrationsSection = null
            navigation.remoteIntegrationsConnectionId = null
        },
    )
}

@Composable
internal fun SettingsDestinationContent(
    destination: HomeDestination.Settings,
    navigation: PoracodeNavigationState,
    settings: SettingsUiComposition,
    deviceSettings: DeviceSettingsPreferences,
    pushState: PushUiState,
    onPushAction: () -> Unit,
    openExternalUrl: (String) -> Unit,
    session: AppSession,
    state: AppSession.UiState,
    threads: ThreadSessionRuntime,
    projectInheritedSettings: ProjectInheritedSettings,
) {
    SettingsScreen(
        composition = settings,
        deviceSettings = deviceSettings,
        pushState = pushState,
        expectedConnectionId = destination.connectionId,
        initialPane = destination.pane,
        onBack = {
            navigation.settingsPane = null
            navigation.settingsConnectionId = null
        },
        onPushAction = onPushAction,
        onEnterDesktopSettings = {
            navigation.settingsConnectionId = state.hostCatalog.selectedConnectionId?.value
        },
        onLeaveDesktopSettings = { navigation.settingsConnectionId = null },
        onOpenSchedules = {
            navigation.remoteIntegrationsConnectionId = navigation.settingsConnectionId
            navigation.remoteIntegrationsSection = RemoteIntegrationsSection.Schedules.name
        },
        onOpenSettingsIntegrations = {
            navigation.settingsIntegrationsProjectId = null
            navigation.settingsIntegrationsConnectionId = navigation.settingsConnectionId
            navigation.showSettingsIntegrations = true
        },
        onOpenAdvancedOperations = {
            navigation.advancedOperationsConnectionId = navigation.settingsConnectionId
            navigation.showAdvancedOperations = true
        },
        onOpenBrowserMirror = {
            navigation.browserMirrorConnectionId = navigation.settingsConnectionId
            navigation.showBrowserMirror = true
        },
        onOpenPrivacy = { openExternalUrl("https://poracode.com/privacy") },
        onOpenSupport = { openExternalUrl("https://poracode.com/support") },
        archivedThreads = { archivedModifier ->
            ArchivedThreadsPane(
                threads = session.unifiedThreads().filter {
                    it.thread.isArchived &&
                        it.connectionId == state.hostCatalog.selectedConnectionId
                },
                controller = threads.controller,
                canOperate = state.canSessionOperate,
                onOpenThread = { presentedId ->
                    navigation.settingsPane = null
                    navigation.settingsConnectionId = null
                    session.openThread(presentedId)
                },
                modifier = archivedModifier,
            )
        },
    )
}

@Composable
internal fun ProjectUtilityDestinationContent(
    destination: HomeDestination.ProjectUtility,
    navigation: PoracodeNavigationState,
    projects: ProjectSessionRuntime,
    richChat: RichChatSessionRuntime,
    richChatHostLease: RichChatHostLease?,
    session: AppSession,
    state: AppSession.UiState,
    deviceSettingsState: DeviceSettingsState,
    projectInheritedSettings: ProjectInheritedSettings,
    settings: SettingsUiComposition,
    advanced: AdvancedOpsProductionComposition,
) {
    if (destination.utility == HomeProjectUtility.Terminal) {
        val selectedConnectionId = ClientConnectionId(destination.connectionId)
        val project = HomeProjectFilterPresentation.resolveProject(
            connectionId = selectedConnectionId,
            projectId = destination.projectId,
            selectedConnectionId = selectedConnectionId,
            selectedSnapshot = state.snapshot,
            hostSnapshots = state.hostSnapshots,
        )
        val terminalLease = richChatHostLease?.takeIf { it.connectionId == selectedConnectionId }
        ProjectTerminalScreen(
            runtime = richChat,
            canOperate = terminalLease.canOperateTerminal(),
            projectName = project?.name,
            projectLocation = project?.location,
            activationKey = terminalLease?.let { "${it.connectionId.value}:${it.generation}" },
            initialCommand = destination.initialCommand,
            terminalTextSizeSp = deviceSettingsState.projectTerminalTextSizeSp,
            onBack = navigation::clearProjectUtility,
        )
    } else {
        ProjectManagementScreen(
            runtime = projects,
            onBack = navigation::clearProjectUtility,
            onRefresh = session::refreshSnapshot,
            inheritedSettings = projectInheritedSettings,
            onLoadInheritedSettings = {
                settings.controller.refresh(SettingsPane.Preferences)
            },
            canOpenTerminal = richChatHostLease.canOperateTerminal() &&
                richChatHostLease?.connectionId == state.hostCatalog.selectedConnectionId,
            initialProjectId = destination.projectId,
            initialDestination = when (destination.utility) {
                HomeProjectUtility.Notes -> ProjectManagementDestination.Notes
                HomeProjectUtility.PullRequests -> ProjectManagementDestination.PullRequests
                HomeProjectUtility.GithubActions -> ProjectManagementDestination.GithubActions
                HomeProjectUtility.Terminal -> ProjectManagementDestination.Detail
            },
            onOpenIntegrations = navigation::openSettingsIntegrations,
            mcpController = settings.globalMcp,
            onOpenTerminal = { identity, command ->
                richChat.closeThread()
                session.closeThread()
                navigation.openProjectUtility(
                    identity.projectId,
                    identity.connectionId.value,
                    HomeProjectUtility.Terminal,
                    command,
                )
            },
            onOpenAdvanced = { identity ->
                advanced.selectProject(identity.projectId)
                navigation.advancedOperationsConnectionId = identity.connectionId.value
                navigation.showAdvancedOperations = true
            },
        )
    }
}

@Composable
internal fun ProjectsDestinationContent(
    navigation: PoracodeNavigationState,
    projects: ProjectSessionRuntime,
    richChat: RichChatSessionRuntime,
    richChatHostLease: RichChatHostLease?,
    session: AppSession,
    state: AppSession.UiState,
    projectInheritedSettings: ProjectInheritedSettings,
    settings: SettingsUiComposition,
    advanced: AdvancedOpsProductionComposition,
) {
    ProjectManagementScreen(
        runtime = projects,
        onBack = { navigation.showProjects = false },
        onRefresh = session::refreshSnapshot,
        inheritedSettings = projectInheritedSettings,
        onLoadInheritedSettings = {
            settings.controller.refresh(SettingsPane.Preferences)
        },
        canOpenTerminal = richChatHostLease.canOperateTerminal() &&
            richChatHostLease?.connectionId == state.hostCatalog.selectedConnectionId,
        onOpenIntegrations = navigation::openSettingsIntegrations,
        mcpController = settings.globalMcp,
        onOpenTerminal = { identity, command ->
            richChat.closeThread()
            session.closeThread()
            navigation.openProjectUtility(
                identity.projectId,
                identity.connectionId.value,
                HomeProjectUtility.Terminal,
                command,
            )
            navigation.showProjects = false
        },
        onOpenAdvanced = { identity ->
            advanced.selectProject(identity.projectId)
            navigation.advancedOperationsConnectionId = identity.connectionId.value
            navigation.showAdvancedOperations = true
        },
    )
}

@Composable
internal fun PortsDestinationContent(
    navigation: PoracodeNavigationState,
    ports: PortForwardRuntime,
    openExternalUrl: (String) -> Unit,
) {
    PortForwardScreen(
        controller = ports.controller,
        onBack = { navigation.showPorts = false },
        openBrowser = openExternalUrl,
    )
}

@Composable
internal fun HostsDestinationContent(
    navigation: PoracodeNavigationState,
    session: AppSession,
    state: AppSession.UiState,
    pairWithPermission: (AppSession.PairingInput) -> Unit,
) {
    HostSwitcherScreen(
        catalog = state.hostCatalog,
        onBack = navigation::closeHostSwitcher,
        onSelect = session::selectHost,
        onRemove = session::removeHost,
        onRename = session::renameHost,
        onOpenProjects = { connectionId ->
            navigation.pendingHostConnectionId = connectionId.value
            navigation.pendingHostDestination = HostDestination.Projects.name
            if (state.hostCatalog.selectedConnectionId != connectionId) {
                session.selectHost(connectionId)
            }
        },
        onOpenDesktopSettings = { connectionId ->
            navigation.pendingHostConnectionId = connectionId.value
            navigation.pendingHostDestination = HostDestination.DesktopSettings.name
            if (state.hostCatalog.selectedConnectionId != connectionId) {
                session.selectHost(connectionId)
            }
        },
        onPair = pairWithPermission,
        selectedConnectionState = state.socketState,
        pairingBusy = state.isPairing,
        navigationBusy = navigation.pendingHostConnectionId != null,
    )
}

@Composable
internal fun HomeDestinationScreenContent(
    navigation: PoracodeNavigationState,
    session: AppSession,
    state: AppSession.UiState,
    richChat: RichChatSessionRuntime,
    threads: ThreadSessionRuntime,
    projects: ProjectSessionRuntime,
    excludedProjectIds: Map<String, Set<String>>,
    pushState: PushUiState,
    onPushAction: () -> Unit,
    notificationBanner: RemoteUserNotificationBanner?,
    deviceSettingsState: DeviceSettingsState,
) {
    HomeScreen(
        state = state,
        threads = session.unifiedThreads().filter { item ->
            item.project.id !in excludedProjectIds[item.connectionId.value].orEmpty()
        },
        onRefresh = session::refreshSnapshot,
        onUnpair = session::unpair,
        onOpenThread = session::openThread,
        onCloseThread = {
            richChat.closeThread()
            session.closeThread()
        },
        richChat = richChat,
        threadRuntime = threads,
        projectRuntime = projects,
        onManageHosts = { navigation.showHosts = true },
        onManageProjects = { navigation.showProjects = true },
        onManagePorts = { navigation.showPorts = true },
        onOpenBrowserMirror = {
            navigation.browserMirrorConnectionId = state.hostCatalog.selectedConnectionId?.value
            navigation.showBrowserMirror = true
        },
        onOpenSchedules = {
            navigation.remoteIntegrationsConnectionId = state.hostCatalog.selectedConnectionId?.value
            navigation.remoteIntegrationsSection = RemoteIntegrationsSection.Schedules.name
        },
        onOpenProfile = {
            navigation.settingsConnectionId = state.hostCatalog.selectedConnectionId?.value
            navigation.settingsPane = SettingsPane.Profile.name
        },
        onOpenUsage = {
            navigation.settingsConnectionId = state.hostCatalog.selectedConnectionId?.value
            navigation.settingsPane = SettingsPane.Usage.name
        },
        onOpenSettings = {
            navigation.settingsConnectionId = null
            navigation.settingsPane = SettingsRoute.DeviceIndex.name
        },
        onOpenAgentSettings = {
            navigation.settingsConnectionId = state.hostCatalog.selectedConnectionId?.value
            navigation.settingsPane = SettingsPane.Agents.name
        },
        onOpenProjectUtility = { connectionId, projectId, utility ->
            if (utility.clearsThreadSelection) {
                richChat.closeThread()
                session.closeThread()
            }
            navigation.openProjectUtility(projectId, connectionId.value, utility, null)
        },
        excludedProjectIds = excludedProjectIds,
        selectedPresentedThreadId = HostPresentation.presentedId(
            state.hostCatalog.selectedConnectionId,
            state.openThreadId,
        ),
        pushState = pushState,
        onPushAction = onPushAction,
        visibleShortcuts = deviceSettingsState.homeShortcutOrder.filterNot {
            it in deviceSettingsState.hiddenHomeShortcuts
        },
        terminalTextSizeSp = deviceSettingsState.agentTerminalTextSizeSp,
        notificationBanner = notificationBanner,
        onOpenNotification = { session.openRemoteNotification(it) },
        onDismissNotification = session::dismissRemoteNotification,
    )
}
