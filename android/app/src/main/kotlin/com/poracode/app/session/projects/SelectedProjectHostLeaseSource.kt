package com.poracode.app.session.projects

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.session.AppSession
import com.poracode.app.transport.RemoteWebSocketClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Converts selected app-session state into a monotonic, project-only host lease. */
class SelectedProjectHostLeaseSource(initial: AppSession.UiState) {
    private data class HostBinding(
        val connectionId: ClientConnectionId,
        val endpoint: String,
        val pairedAtEpochMs: Long,
        val protocolVersion: Int,
        val tokenExpiresAt: String?,
    )

    private val mutableState = MutableStateFlow<ProjectHostLease?>(null)
    val state: StateFlow<ProjectHostLease?> = mutableState.asStateFlow()
    private var generation = 0L
    private var binding: HostBinding? = null

    init {
        update(initial)
    }

    @Synchronized
    fun update(appState: AppSession.UiState) {
        val connectionId = appState.hostCatalog.selectedConnectionId
        val profile = appState.profile
        if (connectionId == null || profile == null) {
            if (binding != null || mutableState.value != null) generation += 1
            binding = null
            mutableState.value = null
            return
        }
        val nextBinding = HostBinding(
            connectionId = connectionId,
            endpoint = profile.httpBaseUrl,
            pairedAtEpochMs = profile.pairedAtEpochMs,
            protocolVersion = profile.protocolVersion,
            tokenExpiresAt = profile.tokenExpiresAt,
        )
        val ready = appState.phase == AppSession.Phase.Ready && !appState.sessionExpired
        val online = ready &&
            appState.socketState == RemoteWebSocketClient.ConnectionState.Online
        val previous = mutableState.value
        if (binding != nextBinding ||
            (previous != null && (previous.online && !online || previous.ready && !ready))
        ) {
            generation += 1
        }
        if (generation == 0L) generation = 1L
        binding = nextBinding
        mutableState.value = ProjectHostLease(
            connectionId = connectionId,
            generation = generation,
            scopes = profile.scopes.toSet(),
            online = online,
            ready = ready,
        )
    }
}
