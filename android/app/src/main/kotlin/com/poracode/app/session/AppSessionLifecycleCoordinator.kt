package com.poracode.app.session

import com.poracode.app.transport.ForegroundNetworkGate
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/** Owns foreground/background transitions so [AppSession] remains composition-focused. */
internal class AppSessionLifecycleCoordinator(
    private val networkGate: ForegroundNetworkGate,
    private val live: LiveConnectionController,
    private val threads: ThreadController,
    private val pairing: PairingCoordinator,
    private val hosts: HostSessionController,
    private val resync: ResyncEngine,
    private val jobs: SessionLifecycleJobs,
    private val scope: CoroutineScope,
    private val state: () -> AppSession.UiState,
    private val updateState: (((AppSession.UiState) -> AppSession.UiState) -> Unit),
    private val hasEndpointPermission: (String) -> Boolean,
    private val bootstrap: () -> Unit,
) {
    fun onBackground() {
        networkGate.closeAndCancelAll()
        live.closeLifecycleGate()
        threads.parkHydrationForBackground()
        pairing.clearPendingPairSecret()
        hosts.onBackground()
        val cancelled = live.cancelAndSuspendForBackground()
        resync.abandonForBackground()
        if (cancelled.isNotEmpty()) {
            scope.launch {
                cancelled.forEach { job -> runCatching { job.join() } }
            }
        }
    }

    fun onForeground() {
        val current = state()
        val token = live.accessToken
        val profile = current.profile
        if (profile != null && !hasEndpointPermission(profile.httpBaseUrl)) {
            networkGate.closeAndCancelAll()
            live.closeLifecycleGate()
            updateState { it.copy(phase = AppSession.Phase.LocalNetworkPermissionRequired) }
            return
        }
        networkGate.openForForeground()
        live.openLifecycleGate()
        hosts.onForeground()
        if (current.phase == AppSession.Phase.Launching &&
            profile == null &&
            live.api == null &&
            token.isNullOrBlank()
        ) {
            bootstrap()
            return
        }
        if (live.api == null && profile != null && !token.isNullOrBlank()) {
            val job = scope.launch { live.connectWithStoredSession(profile, token) }
            jobs.replace(SessionLifecycleJobs.LIVE_START, job)
            return
        }
        threads.restartHydrationIfNeeded()
        live.onForeground(resync) { live.refreshSnapshot() }
    }

    fun onLocalNetworkPermissionGranted() {
        val profile = state().profile ?: return
        val token = live.accessToken ?: return
        if (!hasEndpointPermission(profile.httpBaseUrl)) return
        networkGate.openForForeground()
        live.openLifecycleGate()
        hosts.onForeground()
        val job = scope.launch { live.connectWithStoredSession(profile, token) }
        jobs.replace(SessionLifecycleJobs.LIVE_START, job)
    }
}
