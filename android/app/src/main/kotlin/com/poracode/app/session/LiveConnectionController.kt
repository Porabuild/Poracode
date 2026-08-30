package com.poracode.app.session

import com.poracode.app.model.ConnectionProfile
import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteShellSnapshot
import com.poracode.app.model.RemoteWebSocketServerMessage
import com.poracode.app.protocol.AppLifecycleGate
import com.poracode.app.protocol.GlobalCursorPolicy
import com.poracode.app.protocol.RemoteAccessScopes
import com.poracode.app.protocol.RemoteSocketPolicy
import com.poracode.app.transport.RemoteApiGateway
import com.poracode.app.transport.RemoteApiGatewayFactory
import com.poracode.app.transport.RemoteEventSocket
import com.poracode.app.transport.RemoteEventSocketFactory
import com.poracode.app.transport.RemoteWebSocketClient
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Live session install, WebSocket lifecycle, bootstrap connect, unauthorized path.
 * Pair B success tears A down here before installing B.
 */
class LiveConnectionController(
    private val scope: CoroutineScope,
    private val jobs: SessionLifecycleJobs,
    private val owner: SessionOperationOwner,
    private val lifecycleGate: AppLifecycleGate,
    private val apiFactory: RemoteApiGatewayFactory,
    private val socketFactory: RemoteEventSocketFactory,
    private val ioDispatcher: CoroutineDispatcher,
    private val state: () -> AppSession.UiState,
    private val updateState: ((AppSession.UiState) -> AppSession.UiState) -> Unit,
    private val deliverServerMessage: (RemoteWebSocketServerMessage) -> Unit,
    private val requestResync: (String) -> Unit,
    private val interestEpoch: InterestEpochGate,
    private val onAuthoritativeBaseline: () -> Unit = {}, private val onLiveSocketInstalled: () -> Unit = {},
) {
    var api: RemoteApiGateway? = null
        private set
    var webSocket: RemoteEventSocket? = null
        private set
    var accessToken: String? = null
    var lastSeenSeq: Int? = null
    private var pendingLiveClient: RemoteApiGateway? = null

    fun installApi(endpoint: String, token: String): RemoteApiGateway {
        val client = apiFactory.create(endpoint, token)
        api = client
        owner.bumpApiIdentity()
        accessToken = token
        return client
    }

    fun destroyLiveForHostSwap() {
        // Must not cancel the exclusive PAIR/BOOTSTRAP job that is driving the swap.
        jobs.cancelLiveNetworkWork()
        owner.invalidateThread()
        interestEpoch.next()
        lastSeenSeq = null
        webSocket?.setListener(null)
        webSocket?.stop()
        webSocket?.destroy()
        webSocket = null
        owner.bumpSocketIdentity()
        pendingLiveClient = null
        api = null
        owner.bumpApiIdentity()
    }

    fun destroyAllForUnpair() {
        // Unpair job must keep running through durable clear — cancel live only.
        jobs.cancelLiveNetworkWork()
        owner.invalidateThread()
        interestEpoch.next()
        lifecycleGate.noteLiveSessionDesired(false)
        pendingLiveClient = null
        webSocket?.setListener(null)
        webSocket?.stop()
        webSocket?.destroy()
        webSocket = null
        api = null
        accessToken = null
        lastSeenSeq = null
    }

    suspend fun connectWithStoredSession(profile: ConnectionProfile, token: String) {
        updateState {
            it.copy(
                phase = AppSession.Phase.ReconnectingStored,
                socketState = RemoteWebSocketClient.ConnectionState.Connecting,
                sessionExpired = false,
                canSessionRead = RemoteAccessScopes.canRead(profile.scopes),
                canSessionOperate = RemoteAccessScopes.canOperate(profile.scopes),
            )
        }
        installApi(profile.httpBaseUrl, token)
        try {
            withContext(ioDispatcher) { api?.environment() }
            startLiveSession()
        } catch (e: CancellationException) {
            throw e
        } catch (e: RemoteClientException) {
            if (e.code == "protocol_version_mismatch") {
                updateState {
                    it.copy(
                        phase = AppSession.Phase.ProtocolIncompatible,
                        globalError = e.message,
                        projectsLoadState = AppSession.LoadState.Failed,
                        projectsLoadError = e.message,
                    )
                }
                return
            }
            if (e.isUnauthorized) {
                surfaceSessionExpired(e.message)
                startLiveSession()
            } else {
                updateState { it.copy(globalError = e.message) }
                startLiveSession()
            }
        } catch (e: Exception) {
            updateState { it.copy(globalError = e.message) }
            startLiveSession()
        }
    }

    suspend fun startLiveSession() {
        val client = api ?: return
        if (!RemoteAccessScopes.canRead(state().profile?.scopes.orEmpty())) {
            updateState {
                it.copy(
                    phase = AppSession.Phase.Ready,
                    projectsLoadState = AppSession.LoadState.Failed,
                    projectsLoadError = SessionPolicies.MISSING_SCOPE_READ_MESSAGE,
                    globalError = SessionPolicies.MISSING_SCOPE_READ_MESSAGE,
                )
            }
            return
        }
        lifecycleGate.noteLiveSessionDesired(true)
        updateState {
            it.copy(
                socketState = RemoteWebSocketClient.ConnectionState.Connecting,
                projectsLoadState = AppSession.LoadState.Loading,
            )
        }
        try {
            val snap = withContext(ioDispatcher) { client.snapshot() }
            applyShellSnapshot(
                snap,
                advanceGlobalCursor = GlobalCursorPolicy.bootstrapAdvancesGlobalCursor(),
            )
            onAuthoritativeBaseline()
            updateState {
                it.copy(
                    phase = AppSession.Phase.Ready,
                    sessionExpired = false,
                )
            }
            startWebSocket(client)
        } catch (e: CancellationException) {
            throw e
        } catch (e: RemoteClientException) {
            if (e.code == "protocol_version_mismatch") {
                updateState {
                    it.copy(
                        phase = AppSession.Phase.ProtocolIncompatible,
                        globalError = e.message,
                        projectsLoadState = AppSession.LoadState.Failed,
                        projectsLoadError = e.message,
                    )
                }
                return
            }
            if (e.isUnauthorized) {
                surfaceSessionExpired(e.message)
                lastSeenSeq = 0
                startWebSocket(client)
            } else {
                lastSeenSeq = 0
                webSocket?.markSnapshotFailed()
                updateState {
                    it.copy(
                        projectsLoadState = AppSession.LoadState.Failed,
                        projectsLoadError = e.message,
                        phase = AppSession.Phase.Ready,
                        globalError = e.message,
                    )
                }
                startWebSocket(client)
            }
        } catch (e: Exception) {
            lastSeenSeq = 0
            webSocket?.markSnapshotFailed()
            updateState {
                it.copy(
                    projectsLoadState = AppSession.LoadState.Failed,
                    projectsLoadError = e.message,
                    phase = AppSession.Phase.Ready,
                    globalError = e.message,
                )
            }
            startWebSocket(client)
        }
    }

    fun startWebSocket(client: RemoteApiGateway) {
        lifecycleGate.noteLiveSessionDesired(true)
        pendingLiveClient = client
        val bindSessionGen = owner.sessionGeneration
        val prev = webSocket
        prev?.setListener(null)
        prev?.stop()
        prev?.destroy()
        val socket = socketFactory.create(client)
        val sockId = owner.bumpSocketIdentity()
        webSocket = socket
        socket.setListener(object : RemoteEventSocket.Listener {
            override fun onStateChanged(
                state: RemoteWebSocketClient.ConnectionState,
                detail: String?,
            ) {
                if (!isCurrentLiveSocket(webSocket, socket, owner, bindSessionGen, sockId)) return
                if (!lifecycleGate.isForeground &&
                    state != RemoteWebSocketClient.ConnectionState.Suspended
                ) {
                    // No network result may mutate state after background unless restarted.
                    return
                }
                updateState {
                    it.copy(
                        socketState = state,
                        socketDetail = detail,
                        sessionExpired = state ==
                            RemoteWebSocketClient.ConnectionState.SessionExpired ||
                            (
                                it.sessionExpired &&
                                    state != RemoteWebSocketClient.ConnectionState.Online
                                ),
                        phase = when {
                            state == RemoteWebSocketClient.ConnectionState.SessionExpired ->
                                AppSession.Phase.SessionExpired
                            it.phase == AppSession.Phase.SessionExpired &&
                                state == RemoteWebSocketClient.ConnectionState.Online ->
                                AppSession.Phase.Ready
                            it.phase == AppSession.Phase.ProtocolIncompatible ->
                                AppSession.Phase.ProtocolIncompatible
                            it.phase == AppSession.Phase.LocalStoreInconsistent ->
                                AppSession.Phase.LocalStoreInconsistent
                            else -> it.phase
                        },
                    )
                }
                if (state == RemoteWebSocketClient.ConnectionState.Online) {
                    updateState {
                        if (it.sessionExpired || it.phase == AppSession.Phase.SessionExpired) {
                            it.copy(
                                sessionExpired = false,
                                phase = if (it.phase == AppSession.Phase.SessionExpired) {
                                    AppSession.Phase.Ready
                                } else {
                                    it.phase
                                },
                            )
                        } else {
                            it
                        }
                    }
                }
            }

            override fun onMessage(message: RemoteWebSocketServerMessage) {
                if (!isCurrentLiveSocket(webSocket, socket, owner, bindSessionGen, sockId)) return
                if (!lifecycleGate.isForeground) return
                deliverServerMessage(message)
            }

            override fun onResyncRequired(reason: String) {
                if (!isCurrentLiveSocket(webSocket, socket, owner, bindSessionGen, sockId)) return
                // Always deliver: ResyncEngine.noteNeedsResync is background-safe
                // (marks authoritative refresh; starts no network while background).
                requestResync(reason)
            }

            override fun onSessionExpired(reason: String) {
                if (!isCurrentLiveSocket(webSocket, socket, owner, bindSessionGen, sockId)) return
                surfaceSessionExpired(reason)
            }
        })
        val openId = state().openThreadId
        if (openId != null) {
            val epoch = interestEpoch.current()
            applyThreadInterests(listOf(openId), epoch)
        }
        val startSeq = when {
            lastSeenSeq != null -> lastSeenSeq
            else -> 0
        }

        when (lifecycleGate.actionForLiveStart()) {
            AppLifecycleGate.StartAction.DoNotStart -> Unit
            AppLifecycleGate.StartAction.LeaveSuspendedUntilForeground -> {
                pendingLiveClient = client
                socket.armSuspended(startSeq)
            }
            AppLifecycleGate.StartAction.StartNow -> {
                pendingLiveClient = null
                socket.start(startSeq)
            }
        }
        onLiveSocketInstalled()
    }

    /** Step 1 of background: close the lifecycle gate (no network cancel yet). */
    fun closeLifecycleGate() {
        lifecycleGate.onBackground()
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
    fun cancelAndSuspendForBackground(): List<kotlinx.coroutines.Job> {
        val cancelled = jobs.cancelForegroundNetwork()
        webSocket?.suspendForBackground()
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
        // Gate open alone does not reconnect — this controller owns restart.
        when {
            resyncEngine.pending -> {
                // In-flight authoritative resync will resume the captured socket once.
            }
            webSocket != null -> {
                webSocket?.resumeFromForeground()
            }
            api != null -> {
                // Cold stored-session / pair snapshot background before socket creation,
                // or cancelled mid-start: create/start exactly one socket.
                val client = api
                val phase = state().phase
                val needsFullStart =
                    state().snapshot == null ||
                        phase == AppSession.Phase.ReconnectingStored ||
                        phase == AppSession.Phase.Connecting ||
                        phase == AppSession.Phase.Launching
                if (needsFullStart) {
                    lifecycleGate.noteLiveSessionDesired(true)
                    val job = scope.launch { startLiveSession() }
                    jobs.replace(SessionLifecycleJobs.LIVE_START, job)
                } else if (lifecycleGate.liveSessionDesired && client != null) {
                    startWebSocket(client)
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
        val client = api ?: return
        if (webSocket != null) return
        if (!lifecycleGate.isForeground) return
        lifecycleGate.noteLiveSessionDesired(true)
        startWebSocket(client)
    }

    fun applyShellSnapshot(snap: RemoteShellSnapshot, advanceGlobalCursor: Boolean) {
        if (advanceGlobalCursor) {
            lastSeenSeq = when (val current = lastSeenSeq) {
                null -> snap.snapshotSeq
                else -> maxOf(current, snap.snapshotSeq)
            }
            webSocket?.noteAuthoritativeSnapshot(snap.snapshotSeq)
        }
        updateState {
            val connectionId = it.hostCatalog.selectedConnectionId
            it.copy(
                snapshot = snap,
                hostSnapshots = if (connectionId == null) {
                    it.hostSnapshots
                } else {
                    it.hostSnapshots + (connectionId to snap)
                },
                projectsLoadState = if (snap.projects.isEmpty() && snap.threads.isEmpty()) {
                    AppSession.LoadState.Empty
                } else {
                    AppSession.LoadState.Loaded
                },
                projectsLoadError = null,
            )
        }
    }

    fun handleUnauthorized(message: String?) {
        jobs.cancel(SessionLifecycleJobs.RESYNC)
        jobs.cancel(SessionLifecycleJobs.RESYNC_HISTORY)
        jobs.cancel(SessionLifecycleJobs.SHELL_REFRESH)
        jobs.cancel(SessionLifecycleJobs.THREAD_META)
        jobs.cancel(SessionLifecycleJobs.SNAPSHOT)
        val detail = message?.takeIf { it.isNotBlank() }
            ?: RemoteSocketPolicy.SESSION_EXPIRED_REASON
        // Never reset the cursor to 0 — require an authoritative transaction.
        webSocket?.markResyncPending()
        if (lifecycleGate.isForeground) {
            webSocket?.noteHttpUnauthorized(detail)
        }
        surfaceSessionExpired(detail)
    }

    fun handleApiException(e: RemoteClientException) {
        if (e.isUnauthorized) {
            handleUnauthorized(e.message)
        } else {
            updateState { it.copy(globalError = e.message) }
        }
    }

    fun surfaceSessionExpired(message: String?) {
        updateState { it.withExpiredSession(message) }
    }

    fun applyThreadInterests(ids: List<String>, epoch: Int) {
        if (!interestEpoch.isCurrent(epoch)) return
        webSocket?.setThreadItemInterests(ids)
    }

    fun refreshSnapshot(onResult: ((Boolean) -> Unit)? = null): kotlinx.coroutines.Job? {
        val client = api ?: return null
        val scopes = state().profile?.scopes.orEmpty()
        if (!RemoteAccessScopes.canRead(scopes)) {
            updateState { it.copy(globalError = SessionPolicies.MISSING_SCOPE_READ_MESSAGE) }
            return null
        }
        val job = scope.launch {
            var success = false
            try {
                val snap = withContext(ioDispatcher) { client.snapshot() }
                if (!lifecycleGate.isForeground) return@launch
                applyShellSnapshot(
                    snap,
                    advanceGlobalCursor =
                        GlobalCursorPolicy.ordinaryShellRefreshAdvancesGlobalCursor(),
                )
                success = true
            } catch (e: CancellationException) {
                throw e
            } catch (e: RemoteClientException) {
                if (!lifecycleGate.isForeground) return@launch
                handleApiException(e)
            } catch (e: Exception) {
                if (!lifecycleGate.isForeground) return@launch
                updateState { it.copy(globalError = e.message) }
            } finally {
                onResult?.invoke(success)
            }
        }
        jobs.replace(SessionLifecycleJobs.SNAPSHOT, job)
        return job
    }
}
