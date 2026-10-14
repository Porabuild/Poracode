package com.poracode.app.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import com.poracode.app.session.AppSession
import com.poracode.app.ui.home.HomeProjectUtility
import com.poracode.app.ui.settings.SettingsPane
import com.poracode.app.ui.settingsintegrations.SettingsIntegrationsPage

@Stable
internal class PoracodeNavigationState {
    var showHosts by mutableStateOf(false)
    var showProjects by mutableStateOf(false)
    var showPorts by mutableStateOf(false)
    var settingsPane by mutableStateOf<String?>(null)
    var settingsConnectionId by mutableStateOf<String?>(null)
    var pendingHostDestination by mutableStateOf<String?>(null)
    var pendingHostConnectionId by mutableStateOf<String?>(null)
    var remoteIntegrationsSection by mutableStateOf<String?>(null)
    var remoteIntegrationsConnectionId by mutableStateOf<String?>(null)
    var showSettingsIntegrations by mutableStateOf(false)
    var settingsIntegrationsProjectId by mutableStateOf<String?>(null)
    var settingsIntegrationsConnectionId by mutableStateOf<String?>(null)
    var settingsIntegrationsPage by mutableStateOf<String?>(null)
    var showAdvancedOperations by mutableStateOf(false)
    var advancedOperationsConnectionId by mutableStateOf<String?>(null)
    var showBrowserMirror by mutableStateOf(false)
    var browserMirrorConnectionId by mutableStateOf<String?>(null)
    var projectUtilityProjectId by mutableStateOf<String?>(null)
    var projectUtilityConnectionId by mutableStateOf<String?>(null)
    var projectUtilityName by mutableStateOf<String?>(null)
    // A shell command may contain secrets and is deliberately excluded from the saver.
    var projectUtilityInitialCommand by mutableStateOf<String?>(null)

    fun closeHostSwitcher() {
        showHosts = false
        pendingHostConnectionId = null
        pendingHostDestination = null
    }

    fun clearProjectUtility() {
        projectUtilityProjectId = null
        projectUtilityConnectionId = null
        projectUtilityName = null
        projectUtilityInitialCommand = null
    }

    fun openProjectUtility(
        projectId: String,
        connectionId: String,
        utility: HomeProjectUtility,
        initialCommand: String?,
    ) {
        projectUtilityProjectId = projectId
        projectUtilityConnectionId = connectionId
        projectUtilityName = utility.name
        projectUtilityInitialCommand = initialCommand
    }

    fun openSettingsIntegrations(
        identity: com.poracode.app.model.ProjectIdentity,
        page: SettingsIntegrationsPage,
    ) {
        settingsIntegrationsProjectId = identity.projectId
        settingsIntegrationsConnectionId = identity.connectionId.value
        settingsIntegrationsPage = page.name
        showSettingsIntegrations = true
    }

    fun resetForRoot(preservePendingHostDestination: Boolean) {
        showHosts = false
        showProjects = false
        showPorts = false
        settingsPane = null
        settingsConnectionId = null
        if (!preservePendingHostDestination) {
            pendingHostDestination = null
            pendingHostConnectionId = null
        }
        remoteIntegrationsSection = null
        remoteIntegrationsConnectionId = null
        showSettingsIntegrations = false
        settingsIntegrationsProjectId = null
        settingsIntegrationsConnectionId = null
        settingsIntegrationsPage = null
        showAdvancedOperations = false
        advancedOperationsConnectionId = null
        showBrowserMirror = false
        browserMirrorConnectionId = null
        clearProjectUtility()
    }

    companion object {
        val Saver = listSaver<PoracodeNavigationState, Any>(
            save = { state ->
                listOf(
                    state.showHosts,
                    state.showProjects,
                    state.showPorts,
                    state.settingsPane.orEmpty(),
                    state.settingsConnectionId.orEmpty(),
                    state.pendingHostDestination.orEmpty(),
                    state.pendingHostConnectionId.orEmpty(),
                    state.remoteIntegrationsSection.orEmpty(),
                    state.remoteIntegrationsConnectionId.orEmpty(),
                    state.showSettingsIntegrations,
                    state.settingsIntegrationsProjectId.orEmpty(),
                    state.settingsIntegrationsConnectionId.orEmpty(),
                    state.showAdvancedOperations,
                    state.advancedOperationsConnectionId.orEmpty(),
                    state.showBrowserMirror,
                    state.browserMirrorConnectionId.orEmpty(),
                    state.projectUtilityProjectId.orEmpty(),
                    state.projectUtilityConnectionId.orEmpty(),
                    state.projectUtilityName.orEmpty(),
                    state.settingsIntegrationsPage.orEmpty(),
                )
            },
            restore = { values ->
                PoracodeNavigationState().apply {
                    showHosts = values[0] as Boolean
                    showProjects = values[1] as Boolean
                    showPorts = values[2] as Boolean
                    settingsPane = (values[3] as String).ifEmpty { null }
                    settingsConnectionId = (values[4] as String).ifEmpty { null }
                    pendingHostDestination = (values[5] as String).ifEmpty { null }
                    pendingHostConnectionId = (values[6] as String).ifEmpty { null }
                    remoteIntegrationsSection = (values[7] as String).ifEmpty { null }
                    remoteIntegrationsConnectionId = (values[8] as String).ifEmpty { null }
                    showSettingsIntegrations = values[9] as Boolean
                    settingsIntegrationsProjectId = (values[10] as String).ifEmpty { null }
                    settingsIntegrationsConnectionId = (values[11] as String).ifEmpty { null }
                    showAdvancedOperations = values[12] as Boolean
                    advancedOperationsConnectionId = (values[13] as String).ifEmpty { null }
                    showBrowserMirror = values[14] as Boolean
                    browserMirrorConnectionId = (values[15] as String).ifEmpty { null }
                    projectUtilityProjectId = (values[16] as String).ifEmpty { null }
                    projectUtilityConnectionId = (values[17] as String).ifEmpty { null }
                    projectUtilityName = (values[18] as String).ifEmpty { null }
                    settingsIntegrationsPage = (values.getOrNull(19) as? String)
                        ?.ifEmpty { null }
                }
            },
        )
    }
}

@Composable
internal fun rememberPoracodeNavigationState(): PoracodeNavigationState =
    rememberSaveable(saver = PoracodeNavigationState.Saver) { PoracodeNavigationState() }

@Composable
internal fun ObservePoracodeNavigation(
    navigation: PoracodeNavigationState,
    rootPresentation: RootPresentation,
    state: AppSession.UiState,
    requestLocalNetworkPermission: (String, () -> Unit) -> Unit,
    onLocalNetworkPermissionGranted: () -> Unit,
) {
    LaunchedEffect(rootPresentation, state.phase, state.profile?.httpBaseUrl) {
        if (rootPresentation != RootPresentation.Home) {
            navigation.resetForRoot(
                preservePendingHostDestination =
                    state.phase == AppSession.Phase.LocalNetworkPermissionRequired,
            )
        }
        if (state.phase == AppSession.Phase.LocalNetworkPermissionRequired) {
            state.profile?.httpBaseUrl?.let { endpoint ->
                requestLocalNetworkPermission(endpoint, onLocalNetworkPermissionGranted)
            }
        }
    }
    LaunchedEffect(state.hostCatalog.selectedConnectionId, navigation.projectUtilityConnectionId) {
        val routeConnectionId = navigation.projectUtilityConnectionId
        if (routeConnectionId != null &&
            state.hostCatalog.selectedConnectionId?.value != routeConnectionId
        ) {
            navigation.clearProjectUtility()
        }
    }
    LaunchedEffect(
        state.hostCatalog.selectedConnectionId,
        navigation.settingsIntegrationsConnectionId,
        navigation.remoteIntegrationsConnectionId,
        navigation.advancedOperationsConnectionId,
        navigation.browserMirrorConnectionId,
    ) {
        val selected = state.hostCatalog.selectedConnectionId?.value
        if (navigation.settingsIntegrationsConnectionId?.let { it != selected } == true) {
            navigation.showSettingsIntegrations = false
            navigation.settingsIntegrationsProjectId = null
            navigation.settingsIntegrationsConnectionId = null
            navigation.settingsIntegrationsPage = null
        }
        if (navigation.remoteIntegrationsConnectionId?.let { it != selected } == true) {
            navigation.remoteIntegrationsSection = null
            navigation.remoteIntegrationsConnectionId = null
        }
        if (navigation.advancedOperationsConnectionId?.let { it != selected } == true) {
            navigation.showAdvancedOperations = false
            navigation.advancedOperationsConnectionId = null
        }
        if (navigation.browserMirrorConnectionId?.let { it != selected } == true) {
            navigation.showBrowserMirror = false
            navigation.browserMirrorConnectionId = null
        }
    }
    LaunchedEffect(
        state.hostCatalog.selectedConnectionId,
        state.phase,
        navigation.settingsConnectionId,
        navigation.pendingHostConnectionId,
        navigation.pendingHostDestination,
        state.profile,
        state.hostCatalog.hosts,
    ) {
        val selected = state.hostCatalog.selectedConnectionId?.value
        if (navigation.settingsConnectionId?.let { it != selected } == true) {
            navigation.settingsPane = null
            navigation.settingsConnectionId = null
        }
        val pendingId = navigation.pendingHostConnectionId
        val pendingHost = state.hostCatalog.hosts.firstOrNull {
            it.connectionId.value == pendingId
        }
        if (pendingId != null && pendingHost == null) {
            navigation.pendingHostConnectionId = null
            navigation.pendingHostDestination = null
        } else if (
            pendingId == selected &&
            state.phase == AppSession.Phase.Ready &&
            pendingHost?.asProfile() == state.profile
        ) {
            when (navigation.pendingHostDestination) {
                HostDestination.Projects.name -> {
                    navigation.showHosts = false
                    navigation.showProjects = true
                }
                HostDestination.DesktopSettings.name -> {
                    navigation.showHosts = false
                    navigation.settingsConnectionId = selected
                    navigation.settingsPane = SettingsPane.Host.name
                }
            }
            navigation.pendingHostConnectionId = null
            navigation.pendingHostDestination = null
        }
    }
}

internal enum class HostDestination { Projects, DesktopSettings }
