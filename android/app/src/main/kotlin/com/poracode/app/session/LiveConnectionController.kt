package com.poracode.app.session

import com.poracode.app.model.ConnectionProfile
import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteEnvironmentDescriptor
import com.poracode.app.model.RemoteShellSnapshot
import com.poracode.app.model.RemoteWebSocketServerMessage
import com.poracode.app.protocol.AppLifecycleGate
import com.poracode.app.protocol.RemoteAccessScopes
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
    /**
     * Bounded-catalog bootstrap: installs the first shell page (bounded or the
     * legacy full shell when the host never echoed the capability) before the
     * socket starts, then continues its walks in the background.
     */
    private val bootstrapShell: suspend (RemoteApiGateway, Long) -> Unit = { _, _ -> },
    /** Bounded foreground/manual shell refresh; returns true when it installed. */
    private val refreshShell: suspend (RemoteApiGateway, Long) -> Boolean = { _, _ -> false },
) {
    var api: RemoteApiGateway? = null
        private set
    var webSocket: RemoteEventSocket? = null
        private set
    var accessToken: String? = null
    @Volatile var lastSeenSeq: Int? = null // reader-thread writes, Main reads
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
            api = { api },
            readScopes = { state().profile?.scopes.orEmpty() },
            updateState = updateState,
            refreshShell = { client, attemptSeq -> refreshShell(client, attemptSeq) },
            handleApiException = failures::handleApiException,
            events = connectionEvents,
        )
    }

    /** Guard shared with [LiveCapabilityAuthority]: socket identity + epoch transitions. */
    private val capabilityLock = Any()
    private val capability = LiveCapabilityAuthority(capabilityLock, updateState)
    internal val failures =
        LiveFailureSurface(jobs, { webSocket }, lifecycleGate, connectionEvents, updateState)

    /**
     * Drop the connect-time capability cache under the capability guard (see
     * [capabilityLock]); entry point for [LiveForegroundRecovery] on background.
     */
    internal fun invalidateInitialCapabilityVersions() = capability.invalidateInitial()

    fun installApi(endpoint: String, token: String): RemoteApiGateway {
        val client = apiFactory.create(endpoint, token)
        api = client
        capability.invalidate()
        owner.bumpApiIdentity()
        accessToken = token
        return client
    }

    fun destroyLiveForHostSwap() {
        capability.invalidate()
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
        capability.invalidate()
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
            capability.cacheInitial(environment.capabilities)
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
                failures.surfaceSessionExpired(e.message)
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

    /**
     * B1 first-connection coherence: observe the authority descriptor through
     * the *same* client before the first upgrade, so a fresh pair or catalog
     * host switch opens its first socket with the declaration the host
     * advertises (the observation also primes the Online observer's one-fetch
     * cache). A failed preflight is not an answer: the socket still starts
     * undeclared and the Online observer reconciles or stays truthfully
     * undeclared. A superseded client never starts a socket.
     */
    suspend fun preflightCapabilitiesAndStart(client: RemoteApiGateway) {
        val environment = try {
            withContext(ioDispatcher) { client.environment() }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            null
        }
        if (environment != null) {
            synchronized(capabilityLock) {
                if (api === client) capability.cacheInitial(environment.capabilities)
            }
        }
        if (api !== client) return
        startLiveSession()
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
            bootstrapShell(client, attemptSeq)
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
                failures.surfaceSessionExpired(e.message)
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
        // Declare bounded catalog changes before this socket's first upgrade iff
        // the catalog controller actually negotiated bounded reads; the client
        // itself still requires the authoritative descriptor to have advertised
        // the capability, so an incapable host can never be declared to.
        client.declareBoundedCatalogChanges(
            state().catalog.negotiated && !state().catalog.legacy,
        )
        pendingLiveClient = client
        val bindSessionGen = owner.sessionGeneration
        val prev = webSocket
        prev?.setListener(null)
        prev?.stop()
        prev?.destroy()
        val socket = socketFactory.create(client)
        val sockId = owner.bumpSocketIdentity()
        // Per-socket one-shot: a declaration reconciliation is issued at most
        // once per installed socket, so a repeated same-capability descriptor
        // can never reconnect-loop.
        val declaration = LiveCapabilityReconciliation(client) {
            state().catalog.negotiated && !state().catalog.legacy
        }
        // A newly installed socket opens a fresh capability transition: any
        // in-flight refresh from a previous socket is stale by definition.
        synchronized(capabilityLock) {
            capability.beginSocket()
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
                    capabilityEpoch = capability.beginObservation()
                    if (state == RemoteWebSocketClient.ConnectionState.Suspended) {
                        // Suspension defers the next Online indefinitely: a
                        // connect-time capability snapshot carries no freshness
                        // guarantee across the suspension.
                        capability.invalidateInitial()
                    }
                    updateState {
                        LiveSessionStateTransitions.socketStateChanged(it, state, detail)
                    }
                }
                if (state == RemoteWebSocketClient.ConnectionState.Online) {
                    val cachedCapabilities: RemoteEnvironmentDescriptor.Capabilities?
                    synchronized(capabilityLock) {
                        if (!capability.isCurrentEpoch(capabilityEpoch) ||
                            !isCurrentLiveSocket(webSocket, socket, owner, bindSessionGen, sockId)
                        ) return
                        cachedCapabilities = capability.consumeInitial()
                    }
                    scope.launch {
                        // One descriptor fetch publishes every live capability;
                        // a failed fetch publishes nothing (absence is not an answer).
                        val capabilities = try {
                            cachedCapabilities ?: withContext(ioDispatcher) {
                                client.environment().capabilities
                            }
                        } catch (e: CancellationException) {
                            throw e
                        } catch (_: Exception) {
                            null
                        }
                        val versions = capabilities?.browserForward?.versions.orEmpty().toSet()
                        val noticeVersions =
                            capabilities?.runtimeHistoryNotices?.versions.orEmpty().toSet()
                        val projectCommandResultVersions =
                            capabilities?.projectCommandResults?.versions.orEmpty().toSet()
                        var reconcileReason: String? = null
                        // Guard + publication are one indivisible transition:
                        // a concurrent change either runs entirely before the
                        // guard read (rejected) or entirely after the publish
                        // (its own clear supersedes). Identity rejects socket
                        // swaps; the epoch carries same-socket reconnects.
                        synchronized(capabilityLock) {
                            if (capability.isCurrentEpoch(capabilityEpoch) &&
                                isCurrentLiveSocket(
                                    webSocket,
                                    socket,
                                    owner,
                                    bindSessionGen,
                                    sockId,
                                )
                            ) {
                                updateState {
                                    it.copy(
                                        liveBrowserForwardVersions = versions,
                                        liveRuntimeHistoryNoticeVersions = noticeVersions,
                                        liveProjectCommandResultVersions =
                                            projectCommandResultVersions,
                                    )
                                }
                                // B1: a capable descriptor for a connection
                                // whose real upgrade omitted the declaration
                                // must not be left silently incapable. Declare
                                // on the same client and run the authoritative
                                // shell+history barrier before the socket
                                // reconnects: an incapable connection had its
                                // canonical frames emptied while the cursor
                                // advanced, so a bare reconnect could skip
                                // content. One attempt per installed socket;
                                // the bounded catalog-change declaration follows
                                // the same rule.
                                reconcileReason = declaration.reconcile(capabilities, socket)
                            }
                        }
                        reconcileReason?.let { requestResync(it) }
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
                failures.surfaceSessionExpired(reason)
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
                capability.invalidateInitial()
            }
            AppLifecycleGate.StartAction.LeaveSuspendedUntilForeground -> {
                pendingLiveClient = client
                // Deferred start carries no freshness guarantee for a cache
                // captured before suspension (see closeLifecycleGate).
                capability.invalidateInitial()
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
        lastSeenSeq = ShellSnapshotMerger.nextGlobalCursor(lastSeenSeq, snap.snapshotSeq, advanceGlobalCursor)
        if (advanceGlobalCursor) webSocket?.noteAuthoritativeSnapshot(snap.snapshotSeq)
        updateState { ShellSnapshotMerger.replace(it, snap, recoveryAttemptSeq) }
    }

    /**
     * Bounded page-1 install: merge the page into the existing catalog (keeping
     * continuation rows, pins and per-row guards) instead of replacing it. Only
     * a first-page install may advance the global replay cursor.
     */
    fun mergeShellSnapshot(
        snap: RemoteShellSnapshot,
        advanceGlobalCursor: Boolean,
        recoveryAttemptSeq: Long? = null,
        pageStartedSeq: Long = 0L,
    ) {
        lastSeenSeq = ShellSnapshotMerger.nextGlobalCursor(lastSeenSeq, snap.snapshotSeq, advanceGlobalCursor)
        if (advanceGlobalCursor) webSocket?.noteAuthoritativeSnapshot(snap.snapshotSeq)
        updateState { ShellSnapshotMerger.merge(it, snap, pageStartedSeq, recoveryAttemptSeq) }
    }

    fun applyThreadInterests(ids: List<String>, epoch: Int) {
        if (!interestEpoch.isCurrent(epoch)) return
        webSocket?.setThreadItemInterests(ids)
    }

    fun refreshSnapshot(onResult: ((Boolean) -> Unit)? = null): kotlinx.coroutines.Job? =
        snapshotRefresher.refresh(onResult)
}
