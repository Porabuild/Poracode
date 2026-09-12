package com.poracode.app.session.browsermirror

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.session.AppSession
import com.poracode.app.transport.RemoteWebSocketClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Converts the selected app session into a monotonic [BrowserMirrorHostLease].
 *
 * `generation` is the host epoch: it bumps when the resolved host binding changes or
 * when usability (online/ready/foreground) regresses, so stale leases are rejected by
 * [requireBrowserMirrorLease]. `socketGeneration` is sourced from the live socket's
 * generation gate so frames/inputs from a torn-down socket are rejected; it changes on
 * every reconnect, which the controller observes as a [BrowserMirrorSocketKey] change.
 */
class SelectedBrowserMirrorHostLeaseSource(
    initial: AppSession.UiState,
    private val socketGenerationSupplier: () -> Long,
) {
    private data class HostBinding(
        val connectionId: ClientConnectionId,
        val endpoint: String,
        val websocketEndpoint: String,
        val pairedAtEpochMs: Long,
        val protocolVersion: Int,
        val tokenExpiresAt: String?,
        val scopes: Set<String>,
    )

    private val mutableState = MutableStateFlow<BrowserMirrorHostLease?>(null)
    val state: StateFlow<BrowserMirrorHostLease?> = mutableState.asStateFlow()
    private var generation = 0L
    private var socketGeneration = 0L
    private var binding: HostBinding? = null
    private var foreground = true

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
            socketGeneration = socketGenerationSupplier()
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
        val online = ready && appState.socketState == RemoteWebSocketClient.ConnectionState.Online
        val previous = mutableState.value
        if (
            binding != nextBinding ||
            (previous != null && (previous.online && !online || previous.ready && !ready)) ||
            (previous != null && previous.foreground && !foreground)
        ) {
            generation += 1L
        }
        if (generation == 0L) generation = 1L
        binding = nextBinding
        socketGeneration = socketGenerationSupplier()
        mutableState.value = BrowserMirrorHostLease(
            connectionId = connectionId.value,
            generation = generation,
            socketGeneration = socketGeneration,
            scopes = nextBinding.scopes,
            foreground = foreground,
            online = online,
            ready = ready,
        )
    }

    @Synchronized
    fun setForeground(value: Boolean) {
        if (foreground == value) return
        foreground = value
        val current = mutableState.value
        if (current == null) return
        if (!value) generation += 1L
        mutableState.value = current.copy(
            generation = generation,
            foreground = value,
        )
    }
}
