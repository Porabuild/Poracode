package com.poracode.app.session

import com.poracode.app.protocol.AppLifecycleGate
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/**
 * Background/foreground reconciliation for the live connection, extracted so
 * [LiveConnectionController] stays focused on connection ownership and
 * capability authority. Gate close/open, socket suspend/resume, and the
 * exactly-once restart decisions after foreground recovery live here; the
 * capability cache they invalidate stays behind
 * [LiveConnectionController.invalidateInitialCapabilityVersions].
 */
internal class LiveForegroundRecovery(
    private val controller: LiveConnectionController,
    private val lifecycleGate: AppLifecycleGate,
    private val scope: CoroutineScope,
    private val jobs: SessionLifecycleJobs,
    private val state: () -> AppSession.UiState,
) {
    /** Step 1 of background: close the lifecycle gate (no network cancel yet). */
    fun closeLifecycleGate() {
        lifecycleGate.onBackground()
        // Suspension defers the next Online indefinitely, so a connect-time
        // capability snapshot is no longer fresh enough to reuse — the deferred
        // first Online must re-read the environment and fail closed on error.
        controller.invalidateInitialCapabilityVersions()
    }

    /** Must run synchronously at the start of every foreground recovery branch. */
    fun openLifecycleGate() {
        lifecycleGate.onForeground()
    }

    /**
     * Cancel foreground network work, then suspend socket
     * (ticket/connect/reconnect/health). Unpair is preserved by [SessionLifecycleJobs].
     * @return cancelled jobs for join.
     */
    fun cancelAndSuspendForBackground(): List<Job> {
        val cancelled = jobs.cancelForegroundNetwork()
        controller.webSocket?.suspendForBackground()
        return cancelled
    }

    fun onBackground() {
        closeLifecycleGate()
        cancelAndSuspendForBackground()
    }

    fun onForeground(
        resyncEngine: ResyncEngine,
        refreshSnapshot: () -> Unit,
    ) {
        if (!lifecycleGate.isForeground) {
            lifecycleGate.onForeground()
        }
        // Authoritative recovery when background abandoned a resync gate.
        // Must clear suspended and reconnect exactly once after success (no early deadlock).
        if (resyncEngine.authoritativeRefreshRequired) {
            resyncEngine.launchAuthoritativeForegroundRefreshIfNeeded()
        }
        // Reconcile socket: never leave ReconnectingStored/Connecting forever.
        // Gate open alone does not reconnect — restart happens here.
        when {
            resyncEngine.pending -> {
                // In-flight authoritative resync will resume the captured socket once.
            }
            controller.webSocket != null -> {
                controller.webSocket?.resumeFromForeground()
            }
            controller.api != null -> {
                // Cold stored-session / pair snapshot background before socket creation,
                // or cancelled mid-start: create/start exactly one socket.
                val client = controller.api
                val phase = state().phase
                val needsFullStart =
                    state().snapshot == null ||
                        phase == AppSession.Phase.ReconnectingStored ||
                        phase == AppSession.Phase.Connecting ||
                        phase == AppSession.Phase.Launching
                if (needsFullStart) {
                    lifecycleGate.noteLiveSessionDesired(true)
                    val job = scope.launch { controller.startLiveSession() }
                    jobs.replace(SessionLifecycleJobs.LIVE_START, job)
                } else if (lifecycleGate.liveSessionDesired && client != null) {
                    controller.startWebSocket(client)
                } else if (phase == AppSession.Phase.Ready) {
                    refreshSnapshot()
                }
            }
        }
    }

    /**
     * After authoritative resync/foreground commit succeeds with no live socket
     * (e.g. cold stored-session backgrounded mid-bootstrap), install exactly one.
     */
    fun ensureLiveSocketAfterAuthoritativeCommit() {
        val client = controller.api ?: return
        if (controller.webSocket != null) return
        if (!lifecycleGate.isForeground) return
        lifecycleGate.noteLiveSessionDesired(true)
        controller.startWebSocket(client)
    }
}
