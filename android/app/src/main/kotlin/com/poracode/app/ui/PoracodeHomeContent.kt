package com.poracode.app.ui

import androidx.compose.runtime.Composable
import com.poracode.app.push.PushUiState
import com.poracode.app.push.RemoteUserNotificationBanner
import com.poracode.app.session.AppSession
import com.poracode.app.session.HostPresentation
import com.poracode.app.session.browsermirror.BrowserMirrorComposition
import com.poracode.app.session.ports.PortForwardRuntime
import com.poracode.app.session.projects.ProjectSessionRuntime
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.session.threads.ThreadSessionRuntime
import com.poracode.app.storage.DeviceSettingsPreferences
import com.poracode.app.storage.DeviceSettingsState
import com.poracode.app.storage.HomeWorkspacePreferences
import com.poracode.app.storage.PinnedSettingsShortcut
import com.poracode.app.ui.home.HomeScreen
import com.poracode.app.ui.home.HomeWorkspaceSettingsScreen
import com.poracode.app.ui.home.clearsThreadSelection
import com.poracode.app.ui.remoteintegrations.RemoteIntegrationsSection
import com.poracode.app.ui.richchat.RichChatComposerDraftStore
import com.poracode.app.ui.settings.SettingsPane
import com.poracode.app.ui.settings.SettingsRoute
import com.poracode.app.ui.settings.SettingsUiComposition
import com.poracode.app.ui.settings.isDesktopRoute

@Composable
internal fun WorkspacesDestinationContent(
    navigation: PoracodeNavigationState,
    workspaces: HomeWorkspacePreferences,
) {
    HomeWorkspaceSettingsScreen(
        workspaces = workspaces,
        onBack = { navigation.showWorkspaces = false },
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
    settings: SettingsUiComposition,
    browserMirror: BrowserMirrorComposition,
    ports: PortForwardRuntime,
    deviceSettings: DeviceSettingsPreferences,
    workspaces: HomeWorkspacePreferences,
    draftStore: RichChatComposerDraftStore,
    openExternalUrl: (String) -> Unit,
    excludedProjectIds: Map<String, Set<String>>,
    pushState: PushUiState,
    onPushAction: () -> Unit,
    notificationBanner: RemoteUserNotificationBanner?,
    deviceSettingsState: DeviceSettingsState,
    userHiddenModels: kotlinx.serialization.json.JsonObject?,
    onRefreshModelVisibility: () -> Unit,
    providerUsageControl: @Composable (com.poracode.app.model.RemoteThread?, com.poracode.app.model.AgentStatusEntry?) -> Unit,
) {
    androidx.compose.runtime.LaunchedEffect(state.hostCatalog.selectedConnectionId, state.openThreadId) {
        onRefreshModelVisibility()
    }
    HomeScreen(
        providerUsageControl = providerUsageControl,
        userHiddenModels = userHiddenModels,
        onRefreshModelVisibility = onRefreshModelVisibility,
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
        settingsComposition = settings,
        browserMirror = browserMirror,
        ports = ports,
        deviceSettings = deviceSettings,
        workspaces = workspaces,
        draftStore = draftStore,
        openExternalUrl = openExternalUrl,
        onManageHosts = { navigation.showHosts = true },
        onManageProjects = { navigation.showProjects = true },
        onManagePorts = { navigation.showPorts = true },
        onManageWorkspaces = { navigation.showWorkspaces = true },
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
        onOpenPinnedSettings = { shortcut ->
            val targetRoute = shortcut.toSettingsRoute()
            navigation.settingsConnectionId = if (targetRoute.isDesktopRoute()) {
                state.hostCatalog.selectedConnectionId?.value
            } else {
                null
            }
            navigation.settingsPane = targetRoute.name
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
        pinnedSettingsShortcuts = deviceSettingsState.pinnedSettingsShortcuts,
        terminalTextSizeSp = deviceSettingsState.agentTerminalTextSizeSp,
        notificationBanner = notificationBanner,
        onOpenNotification = { session.openRemoteNotification(it) },
        onDismissNotification = session::dismissRemoteNotification,
    )
}

private fun PinnedSettingsShortcut.toSettingsRoute(): SettingsRoute = when (this) {
    PinnedSettingsShortcut.Usage -> SettingsRoute.Usage
    PinnedSettingsShortcut.Profile -> SettingsRoute.Profile
    PinnedSettingsShortcut.Agents -> SettingsRoute.Agents
    PinnedSettingsShortcut.Appearance -> SettingsRoute.Appearance
    PinnedSettingsShortcut.Environments -> SettingsRoute.Environments
    PinnedSettingsShortcut.GlobalMcp -> SettingsRoute.GlobalMcp
    PinnedSettingsShortcut.ArchivedThreads -> SettingsRoute.ArchivedThreads
    PinnedSettingsShortcut.Notifications -> SettingsRoute.Notifications
    PinnedSettingsShortcut.Terminal -> SettingsRoute.Terminal
    PinnedSettingsShortcut.Git -> SettingsRoute.Git
}
