package com.poracode.app.session.browsermirror

import com.poracode.app.session.AppSession
import com.poracode.app.storage.MultiHostCredentialRepository
import com.poracode.app.transport.browsermirror.BrowserMirrorSocketIngress
import com.poracode.app.transport.browsermirror.BrowserMirrorWireSocket
import com.poracode.app.transport.browsermirror.RepositoryBrowserMirrorTransportProvider
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/**
 * App-shell composition for the browser mirror. Owns the [BrowserMirrorController] bound to
 * the live host lease, drives the lease source from [AppSession.state], and bridges inbound
 * socket frames (delivered by [AppSession]'s browser-mirror sink) into the controller.
 *
 * The controller is the only state the UI consumes; no credential material is exposed.
 */
class BrowserMirrorComposition(
    appState: StateFlow<AppSession.UiState>,
    repository: MultiHostCredentialRepository,
    private val scope: CoroutineScope,
    dispatcher: CoroutineDispatcher,
    wireSocketProvider: () -> BrowserMirrorWireSocket?,
    socketGenerationSupplier: () -> Long,
) {
    private val leaseSource = SelectedBrowserMirrorHostLeaseSource(
        initial = appState.value,
        socketGenerationSupplier = socketGenerationSupplier,
    )
    val hostLease: StateFlow<BrowserMirrorHostLease?> = leaseSource.state
    private val provider = RepositoryBrowserMirrorTransportProvider(
        repository = repository,
        ioDispatcher = dispatcher,
        wireSocketProvider = wireSocketProvider,
    )
    private val gateway = GeneratedBrowserMirrorSessionGateway(hostLease, provider)
    val controller = BrowserMirrorController(hostLease, gateway, scope)

    private val observation: Job = scope.launch {
        appState.collect { leaseSource.update(it) }
    }

    /**
     * Inbound browser-mirror frame, already cleared by the WS frame router's early return.
     * [generation] is the socket generation the frame arrived on; the envelope is stamped with
     * the current host lease so the controller can reject frames from a prior socket/tab.
     */
    fun deliverSocketFrame(generation: Int, raw: String) {
        val lease = hostLease.value ?: return
        val socketKey = BrowserMirrorSocketKey(
            connectionId = lease.connectionId,
            generation = lease.generation,
            socketGeneration = generation.toLong(),
        )
        val envelope = runCatching { BrowserMirrorSocketIngress.decode(socketKey, raw) }
            .getOrNull() ?: return
        controller.onSocketMessage(envelope)
    }

    fun enterBackground() {
        // Let the controller attempt a best-effort unwatch while the lease is still foreground,
        // then regress the lease so further sends are rejected as stale.
        controller.onBackground()
        leaseSource.setForeground(false)
    }

    fun enterForeground() {
        leaseSource.setForeground(true)
        controller.onForeground()
    }

    fun close() {
        observation.cancel()
        controller.close()
    }
}
