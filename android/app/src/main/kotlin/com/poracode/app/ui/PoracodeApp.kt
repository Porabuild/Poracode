package com.poracode.app.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.session.AppSession
import com.poracode.app.session.advancedops.AdvancedOpsProductionComposition
import com.poracode.app.session.browsermirror.BrowserMirrorComposition
import com.poracode.app.session.projects.ProjectSessionRuntime
import com.poracode.app.session.ports.PortForwardRuntime
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.session.threads.ThreadSessionRuntime
import com.poracode.app.protocol.LocalNetworkAccess
import com.poracode.app.protocol.LocalNetworkPermissionUi
import com.poracode.app.push.PendingPushRoute
import com.poracode.app.push.PushUiState
import kotlinx.coroutines.flow.StateFlow
import com.poracode.app.ui.components.BrandLaunchView
import com.poracode.app.ui.advancedops.AdvancedOperationsScreen
import com.poracode.app.ui.browsermirror.BrowserMirrorScreen
import com.poracode.app.ui.home.HomeScreen
import com.poracode.app.ui.hosts.HostSwitcherScreen
import com.poracode.app.ui.onboarding.OnboardingScreen
import com.poracode.app.ui.projects.ProjectManagementScreen
import com.poracode.app.ui.ports.PortForwardScreen
import com.poracode.app.ui.remoteintegrations.RemoteIntegrationsComposition
import com.poracode.app.ui.remoteintegrations.RemoteIntegrationsScreen
import com.poracode.app.ui.settings.SettingsScreen
import com.poracode.app.ui.settings.SettingsUiComposition
import com.poracode.app.ui.settingsintegrations.SettingsIntegrationsComposition
import com.poracode.app.ui.settingsintegrations.SettingsIntegrationsSessionScreen
import com.poracode.app.ui.theme.PoracodeTheme

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
) {
    val state by session.state.collectAsStateWithLifecycle()
    val permissionUi by localNetworkPermissionUi.collectAsStateWithLifecycle()
    val pushState by pushUiState.collectAsStateWithLifecycle()
    val pendingRoute by pendingPushRoute.collectAsStateWithLifecycle()
    val rootPresentation = rootPresentation(state.phase, state.profile != null)
    var showHosts by rememberSaveable { mutableStateOf(false) }
    var showProjects by rememberSaveable { mutableStateOf(false) }
    var showPorts by rememberSaveable { mutableStateOf(false) }
    var showSettings by rememberSaveable { mutableStateOf(false) }
    var showRemoteIntegrations by rememberSaveable { mutableStateOf(false) }
    var showSettingsIntegrations by rememberSaveable { mutableStateOf(false) }
    var showAdvancedOperations by rememberSaveable { mutableStateOf(false) }
    var showBrowserMirror by rememberSaveable { mutableStateOf(false) }
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

    LaunchedEffect(rootPresentation, state.phase, state.profile?.httpBaseUrl) {
        if (rootPresentation != RootPresentation.Home) {
            showHosts = false
            showProjects = false
            showPorts = false
            showSettings = false
            showRemoteIntegrations = false
            showSettingsIntegrations = false
            showAdvancedOperations = false
            showBrowserMirror = false
        }
        if (state.phase == AppSession.Phase.LocalNetworkPermissionRequired) {
            state.profile?.httpBaseUrl?.let { endpoint ->
                requestLocalNetworkPermission(endpoint, session::onLocalNetworkPermissionGranted)
            }
        }
    }

    PoracodeTheme {
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
                    // Pending browsable confirm can still show over Ready if user
                    // opened a link while paired — Onboarding overlay via Home is not used;
                    // session surfaces confirm on onboarding-capable phases. If Ready with
                    // pending confirm, re-route to onboarding confirm chrome.
                    if (showAdvancedOperations) {
                        AdvancedOperationsScreen(
                            composition = advanced,
                            onBack = { showAdvancedOperations = false },
                        )
                    } else if (showBrowserMirror) {
                        BrowserMirrorScreen(
                            controller = browserMirror.controller,
                            onBack = { showBrowserMirror = false },
                        )
                    } else if (showSettingsIntegrations) {
                        SettingsIntegrationsSessionScreen(
                            composition = settingsIntegrations,
                            onBack = { showSettingsIntegrations = false },
                        )
                    } else if (showRemoteIntegrations) {
                        RemoteIntegrationsScreen(
                            composition = remoteIntegrations,
                            onBack = { showRemoteIntegrations = false },
                        )
                    } else if (showSettings) {
                        SettingsScreen(
                            composition = settings,
                            onBack = { showSettings = false },
                            onOpenRemoteIntegrations = {
                                showRemoteIntegrations = true
                            },
                            onOpenSettingsIntegrations = {
                                showSettingsIntegrations = true
                            },
                            onOpenAdvancedOperations = {
                                showAdvancedOperations = true
                            },
                            onOpenBrowserMirror = {
                                showBrowserMirror = true
                            },
                        )
                    } else if (showProjects) {
                        ProjectManagementScreen(
                            runtime = projects,
                            onBack = { showProjects = false },
                            onRefresh = session::refreshSnapshot,
                        )
                    } else if (showPorts) {
                        PortForwardScreen(
                            controller = ports.controller,
                            onBack = { showPorts = false },
                            openBrowser = openExternalUrl,
                        )
                    } else if (showHosts) {
                        HostSwitcherScreen(
                            catalog = state.hostCatalog,
                            onBack = { showHosts = false },
                            onSelect = session::selectHost,
                            onRemove = session::removeHost,
                            onPair = pairWithPermission,
                        )
                    } else if (state.pendingPairConfirm != null) {
                        OnboardingScreen(
                            state = state,
                            onPair = pairWithPermission,
                            onUnpair = session::unpair,
                            onConfirmPendingPair = confirmWithPermission,
                            onCancelPendingPair = session::cancelPendingPair,
                        )
                    } else {
                        HomeScreen(
                            state = state,
                            threads = session.unifiedThreads(),
                            onRefresh = session::refreshSnapshot,
                            onUnpair = session::unpair,
                            onOpenThread = session::openThread,
                            onCloseThread = {
                                richChat.closeThread()
                                session.closeThread()
                            },
                            richChat = richChat,
                            threadRuntime = threads,
                            onManageHosts = { showHosts = true },
                            onManageProjects = { showProjects = true },
                            onManagePorts = { showPorts = true },
                            onOpenSettings = { showSettings = true },
                            selectedPresentedThreadId = com.poracode.app.session.HostPresentation
                                .presentedId(
                                    state.hostCatalog.selectedConnectionId,
                                    state.openThreadId,
                                ),
                            pushState = pushState,
                            onPushAction = onPushAction,
                        )
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

internal enum class RootPresentation {
    Splash,
    Onboarding,
    Home,
}

internal fun rootPresentation(
    phase: AppSession.Phase,
    hasProfile: Boolean,
): RootPresentation = when (phase) {
    AppSession.Phase.Launching -> RootPresentation.Splash
    AppSession.Phase.Ready,
    AppSession.Phase.ReconnectingStored,
    -> RootPresentation.Home
    AppSession.Phase.Connecting -> if (hasProfile) {
        RootPresentation.Home
    } else {
        RootPresentation.Onboarding
    }
    AppSession.Phase.NeedsPairing,
    AppSession.Phase.SessionExpired,
    AppSession.Phase.ProtocolIncompatible,
    AppSession.Phase.LocalStoreInconsistent,
    AppSession.Phase.LocalNetworkPermissionRequired,
    -> RootPresentation.Onboarding
}
