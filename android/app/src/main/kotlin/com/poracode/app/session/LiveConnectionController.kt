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
    private val agentStatusesBootstrap: AgentStatusesBootstrap? = null,
) {
    var api: RemoteApiGateway? = null
        private set
    var webSocket: RemoteEventSocket? = null
        private set
    var accessToken: String? = null
    var lastSeenSeq: Int? = null
    private var pendingLiveClient: RemoteApiGateway? = null

    /** Claim/recovery ids and failure publication; see [ConnectionEventSequencer]. */
    private val connectionEvents = ConnectionEventSequencer(updateState)
    /** Seq for an about-to-start resync fetch; see [ResyncEngine.ResyncCommit]. */
    internal fun nextSnapshotAttemptSeq(): Long = connectionEvents.next()

    // Foreground/background reconciliation. Lazy so `this` is never published
    // from the constructor.
    private val recovery: LiveForegroundRecovery by lazy {
        LiveForegroundRecovery(this, lifecycleGate, scope, jobs, state)
    }

    // Foreground snapshot refresh and connection-recovery evidence pipeline;
    // see [SnapshotRefresher]. Lazy so `this` is never published from the
    // constructor.
    private val snapshotRefresher by lazy {
        SnapshotRefresher(
            scope = scope,
            jobs = jobs,
            lifecycleGate = lifecycleGate,
            ioDispatcher = ioDispatcher,
            api = { api },
            readScopes = { state().profile?.scopes.orEmpty() },
            updateState = updateState,
            applyShellSnapshot = ShellSnapshotApplier(::applyShellSnapshot),
            handleApiException = ::handleApiException,
            events = connectionEvents,
        )
    }

    /**
     * Single owner for every browser-capability transition: connect-time cache
     * writes and invalidations, socket-state epoch bumps and clears, and
     * refresh publication. The socket listener fires on the client's
     * Dispatchers.IO scope while install/destroy paths and refresh completions
     * run on Main, so the epoch alone cannot guard results: a refresh that
     * reads a current epoch can still publish after a concurrent invalidation
     * (check-then-publish), and MutableStateFlow equality can suppress an
     * invalidation's clear emission while the external epoch moves. Holding
     * [capabilityLock] across {guard, publication} and across every bump makes
     * each transition indivisible: an invalidation either precedes the guard
     * read (result rejected) or follows the publication entirely (its own
     * emission supersedes). SessionOperationOwner identity does not
     * discriminate a same-socket reconnect (socket/session ids only move on
     * install/destroy), so within one socket the epoch — linearized here with
     * the publication it guards — is the only authority for staleness.
     */
    private val capabilityLock = Any()
    private var browserCapabilityEpoch = 0L
    private var initialBrowserVersions: Set<Int>? = null

    /** Capability from a previous connection/state is never authority for the next one. */
    private fun invalidateBrowserCapability() {
        synchronized(capabilityLock) {
            browserCapabilityEpoch += 1
            initialBrowserVersions = null
            updateState { it.copy(liveBrowserForwardVersions = emptySet()) }
        }
    }

    /**
     * Drop the connect-time capability cache under the capability guard (see
     * [capabilityLock]); entry point for [LiveForegroundRecovery] on background.
     */
    internal fun invalidateInitialCapabilityVersions() {
        synchronized(capabilityLock) { initialBrowserVersions = null }
    }

    fun installApi(endpoint: String, token: String): RemoteApiGateway {
        val client = apiFactory.create(endpoint, token)
        api = client
        invalidateBrowserCapability()
        owner.bumpApiIdentity()
        accessToken = token
        return client
    }

    fun destroyLiveForHostSwap() {
        invalidateBrowserCapability()
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
        invalidateBrowserCapability()
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
            LiveSessionStateTransitions.reconnectingStored(it, profile)
        }
        val client = installApi(profile.httpBaseUrl, token)
        try {
            val environment = withContext(ioDispatcher) { client.environment() }
            if (api !== client) return
            synchronized(capabilityLock) {
                initialBrowserVersions =
                    environment.capabilities?.browserForward?.versions.orEmpty().toSet()
            }
            startLiveSession()
        } catch (e: CancellationException) {
            throw e
        } catch (e: RemoteClientException) {
            if (e.code == "protocol_version_mismatch") {
                updateState {
                    LiveSessionStateTransitions.bootstrapProtocolIncompatible(it, e.message)
                }
                return
            }
            if (e.isUnauthorized) {
                surfaceSessionExpired(e.message)
                startLiveSession()
            } else {
                connectionEvents.publishFailure(e.message)
                startLiveSession()
            }
        } catch (e: Exception) {
            connectionEvents.publishFailure(e.message)
            startLiveSession()
        }
    }


    suspend fun startLiveSession() {
        val client = api ?: return
        if (!RemoteAccessScopes.canRead(state().profile?.scopes.orEmpty())) {
            updateState {
                LiveSessionStateTransitions.missingReadScope(
                    it,
                    SessionPolicies.MISSING_SCOPE_READ_MESSAGE,
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
            val attemptSeq = connectionEvents.next()
            val snap = withContext(ioDispatcher) { client.snapshot() }
            applyShellSnapshot(
                snap,
                advanceGlobalCursor = GlobalCursorPolicy.bootstrapAdvancesGlobalCursor(),
                recoveryAttemptSeq = attemptSeq,
            )
            onAuthoritativeBaseline()
            agentStatusesBootstrap?.start(client)
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
                    LiveSessionStateTransitions.bootstrapProtocolIncompatible(it, e.message)
                }
                return
            }
            if (e.isUnauthorized) {
                surfaceSessionExpired(e.message)
                lastSeenSeq = 0
                startWebSocket(client)
            } else {
                markBootstrapSnapshotFailed(e.message)
                startWebSocket(client)
            }
        } catch (e: Exception) {
            markBootstrapSnapshotFailed(e.message)
            startWebSocket(client)
        }
    }

    /** Bootstrap snapshot failed (no protocol mismatch/expiry); claims connection scope. */
    private fun markBootstrapSnapshotFailed(message: String?) {
        lastSeenSeq = 0
        webSocket?.markSnapshotFailed()
        updateState {
            LiveSessionStateTransitions.bootstrapSnapshotFailed(
                it, message, connectionEvents.next(),
            )
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
        // A newly installed socket opens a fresh capability transition: any
        // in-flight refresh from a previous socket is stale by definition.
        synchronized(capabilityLock) {
            browserCapabilityEpoch += 1
            webSocket = socket
        }
        socket.setListener(object : RemoteEventSocket.Listener {
            override fun onStateChanged(
                state: RemoteWebSocketClient.ConnectionState,
                detail: String?,
            ) {
                val capabilityEpoch: Long
                synchronized(capabilityLock) {
                    // Recheck ownership and lifecycle after acquiring the
                    // lock: either may have changed while this callback waited.
                    if (!isCurrentLiveSocket(webSocket, socket, owner, bindSessionGen, sockId)) return
                    if (!lifecycleGate.isForeground &&
                        state != RemoteWebSocketClient.ConnectionState.Suspended
                    ) return
                    capabilityEpoch = ++browserCapabilityEpoch
                    if (state == RemoteWebSocketClient.ConnectionState.Suspended) {
                        // Suspension defers the next Online indefinitely: a
                        // connect-time capability snapshot carries no freshness
                        // guarantee across the suspension.
                        initialBrowserVersions = null
                    }
                    updateState {
                        LiveSessionStateTransitions.socketStateChanged(it, state, detail)
                    }
                }
                if (state == RemoteWebSocketClient.ConnectionState.Online) {
                    val initialVersions: Set<Int>?
                    synchronized(capabilityLock) {
                        if (browserCapabilityEpoch != capabilityEpoch ||
                            !isCurrentLiveSocket(webSocket, socket, owner, bindSessionGen, sockId)
                        ) return
                        initialVersions = initialBrowserVersions
                        initialBrowserVersions = null
                    }
                    scope.launch {
                        val versions = try {
                            initialVersions ?: withContext(ioDispatcher) {
                                client.environment().capabilities?.browserForward?.versions
                                    .orEmpty().toSet()
                            }
                        } catch (e: CancellationException) {
                            throw e
                        } catch (_: Exception) {
                            emptySet()
                        }
                        // Guard + publication are one transition under the
                        // owner: a concurrent state change can never slip
                        // between the check and the write — it either runs
                        // entirely before the guard (result rejected) or
                        // entirely after the publication (its own clear
                        // supersedes). Also rejects non-current sockets:
                        // identity is stable across same-socket reconnects,
                        // so the epoch carries that case and identity carries
                        // socket swaps.
                        synchronized(capabilityLock) {
                            if (browserCapabilityEpoch == capabilityEpoch &&
                                isCurrentLiveSocket(
                                    webSocket,
                                    socket,
                                    owner,
                                    bindSessionGen,
                                    sockId,
                                )
                            ) {
                                updateState { it.copy(liveBrowserForwardVersions = versions) }
                            }
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
            AppLifecycleGate.StartAction.DoNotStart -> {
                // No start now and no bound on when (or from which host state)
                // the first Online arrives: never reuse the connect-time cache.
                synchronized(capabilityLock) { initialBrowserVersions = null }
            }
            AppLifecycleGate.StartAction.LeaveSuspendedUntilForeground -> {
                pendingLiveClient = client
                // Deferred start carries no freshness guarantee for a cache
                // captured before suspension (see closeLifecycleGate).
                synchronized(capabilityLock) { initialBrowserVersions = null }
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
    fun closeLifecycleGate() = recovery.closeLifecycleGate()

    /** Must run synchronously at the start of every foreground recovery branch. */
    fun openLifecycleGate() = recovery.openLifecycleGate()

    /** @see LiveForegroundRecovery.cancelAndSuspendForBackground */
    fun cancelAndSuspendForBackground(): List<kotlinx.coroutines.Job> =
        recovery.cancelAndSuspendForBackground()

    fun onBackground() = recovery.onBackground()

    /** @see LiveForegroundRecovery.onForeground */
    fun onForeground(
        resyncEngine: ResyncEngine,
        refreshSnapshot: () -> Unit,
    ) = recovery.onForeground(resyncEngine, refreshSnapshot)

    /**
     * After authoritative resync/foreground commit succeeds with no live socket
     * (e.g. cold stored-session backgrounded mid-bootstrap), install exactly one.
     */
    fun ensureLiveSocketAfterAuthoritativeCommit() =
        recovery.ensureLiveSocketAfterAuthoritativeCommit()

    fun applyShellSnapshot(
        snap: RemoteShellSnapshot,
        advanceGlobalCursor: Boolean,
        recoveryAttemptSeq: Long? = null,
    ) {
        if (advanceGlobalCursor) {
            lastSeenSeq = when (val current = lastSeenSeq) {
                null -> snap.snapshotSeq
                else -> maxOf(current, snap.snapshotSeq)
            }
            webSocket?.noteAuthoritativeSnapshot(snap.snapshotSeq)
        }
        updateState {
            val connectionId = it.hostCatalog.selectedConnectionId
            val base = it.copy(
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
            if (recoveryAttemptSeq == null) base
            else LiveSessionStateTransitions.connectionRecovered(base, recoveryAttemptSeq)
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

    fun applyThreadInterests(ids: List<String>, epoch: Int) {
        if (!interestEpoch.isCurrent(epoch)) return
        webSocket?.setThreadItemInterests(ids)
    }

    fun refreshSnapshot(onResult: ((Boolean) -> Unit)? = null): kotlinx.coroutines.Job? =
        snapshotRefresher.refresh(onResult)
}
