package com.poracode.app.session.threads

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.session.AppSession
import com.poracode.app.transport.RemoteWebSocketClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Converts selected app state into a monotonic lease for thread lifecycle mutations. */
class SelectedThreadHostLeaseSource(initial: AppSession.UiState) {
    private data class Binding(
        val connectionId: ClientConnectionId,
        val endpoint: String,
        val pairedAt: Long,
        val protocolVersion: Int,
        val scopes: Set<String>,
    )

    private val mutableState = MutableStateFlow<ThreadHostLease?>(null)
    val state: StateFlow<ThreadHostLease?> = mutableState.asStateFlow()
    private var generation = 0L
    private var binding: Binding? = null

    init {
        update(initial)
    }

    @Synchronized
    fun update(state: AppSession.UiState) {
        val connectionId = state.hostCatalog.selectedConnectionId
        val profile = state.profile
        if (connectionId == null || profile == null) {
            if (binding != null || mutableState.value != null) generation += 1L
            binding = null
            mutableState.value = null
            return
        }
        val next = Binding(
            connectionId,
            profile.httpBaseUrl,
            profile.pairedAtEpochMs,
            profile.protocolVersion,
            profile.scopes.toSet(),
        )
        val ready = state.phase == AppSession.Phase.Ready && !state.sessionExpired
        val online = ready && state.socketState == RemoteWebSocketClient.ConnectionState.Online
        val previous = mutableState.value
        if (
            binding != next ||
            (previous != null && (previous.online && !online || previous.ready && !ready))
        ) {
            generation += 1L
        }
        if (generation == 0L) generation = 1L
        binding = next
        mutableState.value = ThreadHostLease(
            connectionId,
            generation,
            next.scopes,
            online,
            ready,
        )
    }
}
