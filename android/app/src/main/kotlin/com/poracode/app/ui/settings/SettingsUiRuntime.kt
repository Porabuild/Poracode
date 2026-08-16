package com.poracode.app.ui.settings

import com.poracode.app.model.settings.HostSettingsPatch
import com.poracode.app.model.settings.ProfileIdentityRequest
import com.poracode.app.model.settings.ProfileStatsRequest
import com.poracode.app.model.settings.ProfileStatsScope
import com.poracode.app.model.settings.ProfileStatsWindow
import com.poracode.app.session.AppSession
import com.poracode.app.session.replay.HostReplayCacheUi
import com.poracode.app.session.settings.GeneratedSettingsSessionGateway
import com.poracode.app.session.settings.SettingsHostBinding
import com.poracode.app.session.settings.SettingsHostInformationController
import com.poracode.app.session.settings.SettingsHostLease
import com.poracode.app.session.settings.SettingsHostLeaseSource
import com.poracode.app.session.settings.SettingsOperationResult
import com.poracode.app.storage.MultiHostCredentialRepository
import com.poracode.app.transport.RemoteWebSocketClient
import com.poracode.app.transport.settings.RepositorySettingsRemoteGatewayProvider
import com.poracode.app.transport.settings.SettingsRemoteApiClient
import com.poracode.app.transport.settings.SettingsRemoteGatewayFactory
import java.time.Instant
import java.time.ZoneId
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.supervisorScope

/**
 * App-shell integration seam for native settings. It intentionally owns no navigation and can be
 * created next to the other feature runtimes without changing [AppSession].
 */
class SettingsUiComposition(
    appState: StateFlow<AppSession.UiState>,
    repository: MultiHostCredentialRepository,
    scope: CoroutineScope,
    ioDispatcher: CoroutineDispatcher,
    remoteFactory: SettingsRemoteGatewayFactory = SettingsRemoteGatewayFactory { endpoint, token ->
        SettingsRemoteApiClient(endpoint, token)
    },
    statsRequest: () -> ProfileStatsRequest = ::localProfileStatsRequest,
) {
    private val owner = SupervisorJob(scope.coroutineContext[Job])
    private val runtimeScope = CoroutineScope(scope.coroutineContext + owner)
    private val leaseSource = SettingsHostLeaseSource(settingsBindingOf(appState.value))
    val hostLease: StateFlow<SettingsHostLease?> = leaseSource.state
    private val mutableHost = MutableStateFlow(settingsMetadataOf(appState.value))
    val host: StateFlow<SettingsHostMetadata?> = mutableHost.asStateFlow()
    private val mutableReplayCache = MutableStateFlow(appState.value.hostReplay)
    /** Authoritative agent cache (Windows/WSL scans) mirrored from the host replay stream. */
    val replayCache: StateFlow<HostReplayCacheUi> = mutableReplayCache.asStateFlow()
    private val provider = RepositorySettingsRemoteGatewayProvider(
        repository,
        remoteFactory,
        ioDispatcher,
    )
    private val gateway = GeneratedSettingsSessionGateway(hostLease, provider)
    val information = SettingsHostInformationController(hostLease, gateway)
    val controller = SettingsUiController(hostLease, information, runtimeScope, statsRequest)
    private val observation = runtimeScope.launch {
        appState.collect { state ->
            val previous = hostLease.value?.key
            leaseSource.update(settingsBindingOf(state))
            mutableHost.value = settingsMetadataOf(state)
            mutableReplayCache.value = state.hostReplay
            val current = hostLease.value?.key
            if (previous != current) {
                if (previous != null) information.invalidate(previous)
                controller.onLeaseChanged()
            }
        }
    }

    fun close() {
        observation.cancel()
        runtimeScope.cancel()
    }
}

class SettingsUiController internal constructor(
    private val lease: StateFlow<SettingsHostLease?>,
    private val information: SettingsHostInformationController,
    private val scope: CoroutineScope,
    private val statsRequest: () -> ProfileStatsRequest,
) {
    private val mutableMutation = MutableStateFlow(SettingsMutationState())
    val mutation: StateFlow<SettingsMutationState> = mutableMutation.asStateFlow()
    private val profileRevision = AtomicLong()
    private val settingsRevision = AtomicLong()

    fun refresh(pane: SettingsPane) {
        when (pane) {
            SettingsPane.Host -> Unit
            SettingsPane.Agents -> scope.launch { refreshAgents() }
            SettingsPane.Profile -> scope.launch { refreshProfile() }
            SettingsPane.Preferences -> scope.launch { information.loadSettings() }
        }
    }

    fun saveProfile(request: ProfileIdentityRequest) {
        if (mutableMutation.value.profileSaving) return
        val key = lease.value?.key
        val revision = profileRevision.incrementAndGet()
        mutableMutation.update {
            it.copy(profileSaving = true, profileOutcome = null)
        }
        scope.launch {
            val result = information.updateProfileIdentity(request)
            val ambiguous = (result as? SettingsOperationResult.Failed)
                ?.failure
                ?.isAmbiguousMutation() == true
            if (ambiguous) information.loadProfileCoreStats(statsRequest())
            if (lease.value?.key != key || profileRevision.get() != revision) return@launch
            mutableMutation.update {
                it.copy(
                    profileSaving = false,
                    profileOutcome = result.toMutationOutcome(ambiguous),
                )
            }
        }
    }

    fun saveSettings(patch: HostSettingsPatch) {
        if (mutableMutation.value.settingsSaving) return
        val key = lease.value?.key
        val revision = settingsRevision.incrementAndGet()
        mutableMutation.update {
            it.copy(settingsSaving = true, settingsOutcome = null)
        }
        scope.launch {
            val result = information.writeSettings(patch)
            val ambiguous = (result as? SettingsOperationResult.Failed)
                ?.failure
                ?.isAmbiguousMutation() == true
            if (ambiguous) information.loadSettings()
            if (lease.value?.key != key || settingsRevision.get() != revision) return@launch
            mutableMutation.update {
                it.copy(
                    settingsSaving = false,
                    settingsOutcome = result.toMutationOutcome(ambiguous),
                )
            }
        }
    }

    internal fun onLeaseChanged() {
        profileRevision.incrementAndGet()
        settingsRevision.incrementAndGet()
        mutableMutation.value = SettingsMutationState()
    }

    private suspend fun refreshAgents() = supervisorScope {
        val statuses = async { information.loadAgentStatuses() }
        val usage = async { information.loadProviderUsage() }
        statuses.await()
        usage.await()
    }

    private suspend fun refreshProfile() = supervisorScope {
        val request = statsRequest()
        val devices = async { information.loadProfileDevices() }
        val core = async { information.loadProfileCoreStats(request) }
        val tokens = async { information.loadProfileTokenStats(request) }
        devices.await()
        core.await()
        tokens.await()
    }
}

private fun SettingsOperationResult<*>.toMutationOutcome(
    refreshedAfterAmbiguousResult: Boolean,
): SettingsMutationOutcome = when (this) {
    is SettingsOperationResult.Success -> SettingsMutationOutcome.Applied
    is SettingsOperationResult.Failed -> SettingsMutationOutcome.Failed(
        failure,
        refreshedAfterAmbiguousResult,
    )
    SettingsOperationResult.Stale -> SettingsMutationOutcome.Stale
}

internal fun settingsBindingOf(state: AppSession.UiState): SettingsHostBinding? {
    val selectedId = state.hostCatalog.selectedConnectionId ?: return null
    val host = state.hostCatalog.hosts.firstOrNull { it.connectionId == selectedId } ?: return null
    val ready = state.phase == AppSession.Phase.Ready && !state.sessionExpired
    val online = ready && state.socketState == RemoteWebSocketClient.ConnectionState.Online
    return SettingsHostBinding(
        connectionId = selectedId,
        protocolVersion = host.protocolVersion,
        endpoint = host.httpBaseUrl,
        pairedAtEpochMs = host.pairedAtEpochMs,
        tokenExpiresAt = host.tokenExpiresAt,
        scopes = host.scopes.toSet(),
        online = online,
        ready = ready,
    )
}

internal fun settingsMetadataOf(state: AppSession.UiState): SettingsHostMetadata? {
    val selectedId = state.hostCatalog.selectedConnectionId ?: return null
    val host = state.hostCatalog.hosts.firstOrNull { it.connectionId == selectedId } ?: return null
    return SettingsHostMetadata(
        connectionId = selectedId,
        label = host.label,
        appVersion = host.appVersion,
        platform = host.platform,
        hostMode = host.hostMode,
    )
}

private fun localProfileStatsRequest(): ProfileStatsRequest {
    val offsetMinutes = ZoneId.systemDefault().rules.getOffset(Instant.now()).totalSeconds / 60.0
    return ProfileStatsRequest(
        utcOffsetMinutes = offsetMinutes,
        scope = ProfileStatsScope.Device,
        window = ProfileStatsWindow.ThirtyDays,
    )
}
