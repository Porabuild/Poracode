package com.poracode.app.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.protocol.LocalNetworkAccess
import com.poracode.app.protocol.LocalNetworkPermissionUi
import com.poracode.app.push.PendingPushRoute
import com.poracode.app.push.PushUiState
import com.poracode.app.session.AppSession
import com.poracode.app.session.advancedops.AdvancedOpsProductionComposition
import com.poracode.app.session.browsermirror.BrowserMirrorComposition
import com.poracode.app.session.ports.PortForwardRuntime
import com.poracode.app.session.projects.ProjectSessionRuntime
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.session.threads.ThreadSessionRuntime
import com.poracode.app.storage.DeviceAppearanceMode
import com.poracode.app.storage.DeviceSettingsPreferences
import com.poracode.app.ui.components.BrandLaunchView
import com.poracode.app.ui.components.rememberReducedMotion
import com.poracode.app.ui.components.sharedAxisX
import com.poracode.app.ui.home.HomeProjectUtility
import com.poracode.app.ui.onboarding.OnboardingScreen
import com.poracode.app.ui.projects.ProjectInheritedSettings
import com.poracode.app.ui.remoteintegrations.RemoteIntegrationsComposition
import com.poracode.app.ui.settings.SettingsUiComposition
import com.poracode.app.ui.settingsintegrations.SettingsIntegrationsComposition
import com.poracode.app.ui.theme.PoracodeTheme
import kotlinx.coroutines.flow.StateFlow

@Composable
fun PoracodeApp(
    session: AppSession,
    projects: ProjectSessionRuntime,
    ports: PortForwardRuntime,
    richChat: RichChatSessionRuntime,
    threads: ThreadSessionRuntime,
    advanced: AdvancedOpsProductionComposition,
    settings: SettingsUiComposition,
    remoteIntegrations: RemoteIntegrationsComposition,
    settingsIntegrations: SettingsIntegrationsComposition,
    browserMirror: BrowserMirrorComposition,
    deviceSettings: DeviceSettingsPreferences,
    localNetworkPermissionUi: StateFlow<LocalNetworkPermissionUi>,
    requestLocalNetworkPermission: (String, () -> Unit) -> Unit,
    continueLocalNetworkPermission: () -> Unit,
    dismissLocalNetworkPermission: () -> Unit,
    pushUiState: StateFlow<PushUiState>,
    onPushAction: () -> Unit,
    pendingPushRoute: StateFlow<PendingPushRoute?>,
    onConfirmPushRoute: () -> Unit,
    onCancelPushRoute: () -> Unit,
    openExternalUrl: (String) -> Unit,
    onThemeDarkChanged: (Boolean) -> Unit,
) {
    val state by session.state.collectAsStateWithLifecycle()
    val richChatHostLease by richChat.hostLease.collectAsStateWithLifecycle()
    val permissionUi by localNetworkPermissionUi.collectAsStateWithLifecycle()
    val pushState by pushUiState.collectAsStateWithLifecycle()
    val pendingRoute by pendingPushRoute.collectAsStateWithLifecycle()
    val notificationBanner by session.notificationBanners.collectAsStateWithLifecycle()
    val deviceSettingsState by deviceSettings.state.collectAsStateWithLifecycle()
    val excludedProjectIds by projects.syncPreferences.excludedProjectIds
        .collectAsStateWithLifecycle()
    val settingsHostLease by settings.hostLease.collectAsStateWithLifecycle()
    val settingsInformation by settings.information.state.collectAsStateWithLifecycle()
    val projectInheritedSettings = ProjectInheritedSettings.from(
        settingsHostLease?.connectionId,
        settingsHostLease?.let { settingsInformation.entries[it.key]?.settings },
    )
    val rootPresentation = rootPresentation(state.phase, state.profile != null)
    val navigation = rememberPoracodeNavigationState()
    val projectUtility = HomeProjectUtility.entries.firstOrNull { it.name == navigation.projectUtilityName }
    val pairWithPermission: (AppSession.PairingInput) -> Unit = { input ->
        val endpoint = LocalNetworkAccess.pairingEndpoint(
            input.pairingUrlOrEmpty,
            input.manualBaseUrl,
            input.manualToken,
        )
        if (endpoint == null) session.pair(input)
        else requestLocalNetworkPermission(endpoint) { session.pair(input) }
    }
    val confirmWithPermission: () -> Unit = {
        val pending = state.pendingPairConfirm
        if (pending == null) session.confirmPendingPair()
        else requestLocalNetworkPermission(pending.endpoint) { session.confirmPendingPair() }
    }
    ObservePoracodeNavigation(
        navigation = navigation,
        rootPresentation = rootPresentation,
        state = state,
        requestLocalNetworkPermission = requestLocalNetworkPermission,
        onLocalNetworkPermissionGranted = session::onLocalNetworkPermissionGranted,
    )
    val useDarkTheme = when (deviceSettingsState.appearanceMode) {
        DeviceAppearanceMode.System -> isSystemInDarkTheme()
        DeviceAppearanceMode.Light -> false
        DeviceAppearanceMode.Dark -> true
    }
    LaunchedEffect(useDarkTheme) { onThemeDarkChanged(useDarkTheme) }
    PoracodeTheme(
        darkTheme = useDarkTheme,
        dynamicColor = deviceSettingsState.dynamicColor,
        chatTextSizeSp = deviceSettingsState.chatTextSizeSp,
    ) {
        Surface(modifier = Modifier.fillMaxSize()) {
            when (rootPresentation) {
                RootPresentation.Splash -> BrandLaunchView()
                RootPresentation.Onboarding -> {
                    OnboardingScreen(
                        state = state,
                        onPair = pairWithPermission,
                        onUnpair = if (state.sessionExpired || state.profile != null) {
                            session::unpair
                        } else {
                            null
                        },
                        protocolIncompatible = state.phase == AppSession.Phase.ProtocolIncompatible,
                        localStoreInconsistent =
                            state.phase == AppSession.Phase.LocalStoreInconsistent,
                        onConfirmPendingPair = confirmWithPermission,
                        onCancelPendingPair = session::cancelPendingPair,
                    )
                }
                RootPresentation.Home -> {
                    val reducedMotion = rememberReducedMotion()
                    val destination = homeDestination(
                        navigation = navigation,
                        pendingPairConfirm = state.pendingPairConfirm,
                        selectedConnectionId = state.hostCatalog.selectedConnectionId,
                        projectUtility = projectUtility,
                    )
                    AnimatedContent(
                        targetState = destination,
                        contentKey = { it.kind },
                        transitionSpec = {
                            sharedAxisX(
                                forward = targetState.depth >= initialState.depth,
                                reducedMotion = reducedMotion,
                            )
                        },
                        label = "HomeDestination",
                    ) { current ->
                        when (current) {
                            is HomeDestination.PendingPair -> PendingPairConfirmDestinationContent(
                                state = state,
                                session = session,
                                pairWithPermission = pairWithPermission,
                                confirmWithPermission = confirmWithPermission,
                            )
                            is HomeDestination.AdvancedOperations -> AdvancedOperationsDestinationContent(
                                navigation = navigation,
                                advanced = advanced,
                                defaultContentLanguage =
                                    deviceSettingsState.contentLanguage.modelLanguageName(),
                            )
                            is HomeDestination.BrowserMirror -> BrowserMirrorDestinationContent(
                                navigation = navigation,
                                browserMirror = browserMirror,
                            )
                            is HomeDestination.SettingsIntegrations -> SettingsIntegrationsDestinationContent(
                                destination = current,
                                navigation = navigation,
                                settingsIntegrations = settingsIntegrations,
                                settings = settings,
                            )
                            is HomeDestination.RemoteIntegrations -> RemoteIntegrationsDestinationContent(
                                destination = current,
                                navigation = navigation,
                                remoteIntegrations = remoteIntegrations,
                                session = session,
                                state = state,
                            )
                            is HomeDestination.Settings -> SettingsDestinationContent(
                                destination = current,
                                navigation = navigation,
                                settings = settings,
                                deviceSettings = deviceSettings,
                                pushState = pushState,
                                onPushAction = onPushAction,
                                openExternalUrl = openExternalUrl,
                                session = session,
                                state = state,
                                threads = threads,
                                projectInheritedSettings = projectInheritedSettings,
                            )
                            is HomeDestination.ProjectUtility -> ProjectUtilityDestinationContent(
                                destination = current,
                                navigation = navigation,
                                projects = projects,
                                richChat = richChat,
                                richChatHostLease = richChatHostLease,
                                session = session,
                                state = state,
                                deviceSettingsState = deviceSettingsState,
                                projectInheritedSettings = projectInheritedSettings,
                                settings = settings,
                                advanced = advanced,
                            )
                            is HomeDestination.Projects -> ProjectsDestinationContent(
                                navigation = navigation,
                                projects = projects,
                                richChat = richChat,
                                richChatHostLease = richChatHostLease,
                                session = session,
                                state = state,
                                projectInheritedSettings = projectInheritedSettings,
                                settings = settings,
                                advanced = advanced,
                            )
                            is HomeDestination.Ports -> PortsDestinationContent(
                                navigation = navigation,
                                ports = ports,
                                openExternalUrl = openExternalUrl,
                            )
                            is HomeDestination.Hosts -> HostsDestinationContent(
                                navigation = navigation,
                                session = session,
                                state = state,
                                pairWithPermission = pairWithPermission,
                            )
                            is HomeDestination.Home -> HomeDestinationScreenContent(
                                navigation = navigation,
                                session = session,
                                state = state,
                                richChat = richChat,
                                threads = threads,
                                projects = projects,
                                excludedProjectIds = excludedProjectIds,
                                pushState = pushState,
                                onPushAction = onPushAction,
                                notificationBanner = notificationBanner,
                                deviceSettingsState = deviceSettingsState,
                            )
                        }
                    }
                }
            }
            LocalNetworkPermissionDialog(
                ui = permissionUi,
                onContinue = continueLocalNetworkPermission,
                onDismiss = dismissLocalNetworkPermission,
            )
            PushRouteConfirmationDialog(
                pending = pendingRoute,
                onConfirm = onConfirmPushRoute,
                onCancel = onCancelPushRoute,
            )
        }
    }
}
