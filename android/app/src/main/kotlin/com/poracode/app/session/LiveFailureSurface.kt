package com.poracode.app.session

import com.poracode.app.model.RemoteClientException
import com.poracode.app.protocol.AppLifecycleGate
import com.poracode.app.protocol.RemoteSocketPolicy
import com.poracode.app.transport.RemoteEventSocket

/**
 * Unauthorized and transport-failure surface for the live connection,
 * extracted so [LiveConnectionController] stays under the source-size gate.
 * The socket is resolved lazily because install/destroy replace it.
 */
internal class LiveFailureSurface(
    private val jobs: SessionLifecycleJobs,
    private val socket: () -> RemoteEventSocket?,
    private val lifecycleGate: AppLifecycleGate,
    private val connectionEvents: ConnectionEventSequencer,
    private val updateState: ((AppSession.UiState) -> AppSession.UiState) -> Unit,
) {
    fun handleUnauthorized(message: String?) {
        jobs.cancel(SessionLifecycleJobs.RESYNC)
        jobs.cancel(SessionLifecycleJobs.RESYNC_HISTORY)
        jobs.cancel(SessionLifecycleJobs.SHELL_REFRESH)
        jobs.cancel(SessionLifecycleJobs.THREAD_META)
        jobs.cancel(SessionLifecycleJobs.SNAPSHOT)
        val detail = message?.takeIf { it.isNotBlank() }
            ?: RemoteSocketPolicy.SESSION_EXPIRED_REASON
        // Never reset the cursor to 0 — require an authoritative transaction.
        socket()?.markResyncPending()
        if (lifecycleGate.isForeground) {
            socket()?.noteHttpUnauthorized(detail)
        }
        surfaceSessionExpired(detail)
    }

    fun handleApiException(e: RemoteClientException) {
        if (e.isUnauthorized) {
            handleUnauthorized(e.message)
        } else if (e.isTransportFailure) {
            // Transient transport failure: claim it as connection scope so a
            // later authoritative snapshot can retire the banner. Host domain
            // failures are not connection-health evidence and stay on
            // globalError.
            connectionEvents.publishFailure(e.message)
        } else {
            updateState { it.copy(globalError = e.message) }
        }
    }

    fun surfaceSessionExpired(message: String?) {
        updateState { it.withExpiredSession(message) }
    }
}
