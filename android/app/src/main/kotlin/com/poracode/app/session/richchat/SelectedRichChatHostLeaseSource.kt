package com.poracode.app.session.richchat

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.session.AppSession
import com.poracode.app.transport.RemoteWebSocketClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Converts the selected app session into a monotonic rich-chat host lease. */
class SelectedRichChatHostLeaseSource(initial: AppSession.UiState) {
    private data class HostBinding(
        val connectionId: ClientConnectionId,
        val endpoint: String,
        val websocketEndpoint: String,
        val pairedAtEpochMs: Long,
        val protocolVersion: Int,
        val tokenExpiresAt: String?,
        val scopes: Set<String>,
    )

    private val mutableState = MutableStateFlow<RichChatHostLease?>(null)
    val state: StateFlow<RichChatHostLease?> = mutableState.asStateFlow()
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
            if (binding != null || mutableState.value != null) generation += 1L
            binding = null
            mutableState.value = null
            return
        }
        val nextBinding = HostBinding(
            connectionId = connectionId,
            endpoint = profile.httpBaseUrl,
            websocketEndpoint = profile.wsBaseUrl,
            pairedAtEpochMs = profile.pairedAtEpochMs,
            protocolVersion = profile.protocolVersion,
            tokenExpiresAt = profile.tokenExpiresAt,
            scopes = profile.scopes.toSet(),
        )
        val ready = appState.phase == AppSession.Phase.Ready && !appState.sessionExpired
        val online = ready &&
            appState.socketState == RemoteWebSocketClient.ConnectionState.Online
        val previous = mutableState.value
        if (
            binding != nextBinding ||
            (previous != null && (previous.online && !online || previous.ready && !ready))
        ) {
            generation += 1L
        }
        if (generation == 0L) generation = 1L
        binding = nextBinding
        mutableState.value = RichChatHostLease(
            connectionId = connectionId,
            generation = generation,
            scopes = nextBinding.scopes,
            online = online,
            ready = ready,
        )
    }
}
