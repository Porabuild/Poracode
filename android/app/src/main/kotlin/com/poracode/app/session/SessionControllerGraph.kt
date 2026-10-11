package com.poracode.app.session

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.protocol.AppLifecycleGate
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.protocol.ThreadHydrationCoordinator
import com.poracode.app.session.catalog.CatalogSyncController
import com.poracode.app.session.history.loadThreadHistoryTail
import com.poracode.app.storage.SessionCredentialRepository
import com.poracode.app.storage.SessionCredentials
import com.poracode.app.transport.ForegroundNetworkGate
import com.poracode.app.transport.RemoteApiGatewayFactory
import com.poracode.app.transport.RemoteEventSocketFactory
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.withContext

/** One cohesive controller graph for [AppSession]; see the factory below. */
internal data class SessionControllerGraph(
    val live: LiveConnectionController,
    val catalog: CatalogSyncController,
    val events: SessionEventRouter,
    val threads: ThreadController,
    val resync: ResyncEngine,
    val pairing: PairingCoordinator,
    val hosts: HostSessionController,
    val bootstrapController: SessionBootstrapController,
    val lifecycleCoordinator: AppSessionLifecycleCoordinator,
)

/**
 * Builds the session's controller graph. Extracted from [AppSession] so the
 * session class stays composition-focused and under the source-size gate. All
 * cross-controller references are late-bound lambdas; the returned graph is
 * fully wired before any callback can run.
 */
@Suppress("LongParameterList", "LongMethod")
internal fun buildSessionControllerGraph(
    credentials: SessionCredentialRepository,
    scope: CoroutineScope,
    jobs: SessionLifecycleJobs,
    owner: SessionOperationOwner,
    lifecycleGate: AppLifecycleGate,
    hydration: ThreadHydrationCoordinator,
    interestEpoch: InterestEpochGate,
    sessionPool: SessionPool,
    apiFactory: RemoteApiGatewayFactory,
    socketFactory: RemoteEventSocketFactory,
    ioDispatcher: CoroutineDispatcher,
    networkGate: ForegroundNetworkGate,
    hasEndpointPermission: (String) -> Boolean,
    beforeHostRemoval: suspend (ClientConnectionId, SessionCredentials) -> Unit,
    notificationBridge: AppSessionRemoteNotifications,
    browserMirrorBridge: BrowserMirrorSessionBridge,
    sinks: SessionSinks,
    pendingOpen: PendingThreadOpenState,
    state: () -> AppSession.UiState,
    updateState: ((AppSession.UiState) -> AppSession.UiState) -> Unit,
): SessionControllerGraph {
    lateinit var live: LiveConnectionController
    lateinit var catalog: CatalogSyncController
    lateinit var events: SessionEventRouter
    lateinit var threads: ThreadController
    lateinit var resync: ResyncEngine
    lateinit var pairing: PairingCoordinator
    lateinit var hosts: HostSessionController
    lateinit var bootstrapController: SessionBootstrapController
    lateinit var lifecycleCoordinator: AppSessionLifecycleCoordinator

    fun requestResync(reason: String) {
        catalog.onGap()
        resync.launchResync(reason)
    }

    suspend fun installSelected(selected: SessionCredentials) {
        resync.reset()
        events.bindReplayHost(selected.profile.desktopId)
        catalog.onHostChange()
        live.destroyLiveForHostSwap()
        owner.bumpSessionGeneration()
        updateState { SessionStateTransitions.installingHost(it, selected.profile) }
        if (selected.profile.protocolVersion != ProtocolConstants.REMOTE_PROTOCOL_VERSION) {
            live.accessToken = null
            bootstrapController.start()
            return
        }
        live.accessToken = selected.accessToken
        if (!hasEndpointPermission(selected.profile.httpBaseUrl)) {
            updateState { it.copy(phase = AppSession.Phase.LocalNetworkPermissionRequired) }
            return
        }
        live.installApi(selected.profile.httpBaseUrl, selected.accessToken).let { client ->
            // B1: the first switched socket must declare from the authority
            // descriptor, not after an unrelated reconnect.
            live.preflightCapabilitiesAndStart(client)
        }
        pendingOpen.takeIfSelected(state().hostCatalog.selectedConnectionId)?.let { threadId ->
            threads.openThread(threadId)
        }
    }

    fun installEmptyCatalog() {
        resync.reset()
        events.clearReplayCache()
        catalog.onHostChange()
        live.destroyAllForUnpair()
        owner.bumpSessionGeneration()
        val hostCatalog = state().hostCatalog
        updateState {
            AppSession.UiState(phase = AppSession.Phase.NeedsPairing, hostCatalog = hostCatalog)
        }
    }

    live = LiveConnectionController(
        scope = scope,
        jobs = jobs,
        owner = owner,
        lifecycleGate = lifecycleGate,
        apiFactory = apiFactory,
        socketFactory = socketFactory,
        ioDispatcher = ioDispatcher,
        state = state,
        updateState = updateState,
        deliverServerMessage = { events.handleServerMessage(it) },
        requestResync = ::requestResync,
        interestEpoch = interestEpoch,
        onAuthoritativeBaseline = { resync.clearAuthoritativeRefreshRequired() },
        onLiveSocketInstalled = {
            browserMirrorBridge.installOnLiveSocket()
            catalog.onSocketInstalled()
        },
        agentStatusesBootstrap = AgentStatusesBootstrap(
            scope,
            ioDispatcher,
            begin = { events.beginAgentStatusesBase() },
        ) { native, wsl, generation -> events.seedAgentStatusesBase(native, wsl, generation) },
        bootstrapShell = { client, attemptSeq -> catalog.bootstrapShell(client, attemptSeq) },
        refreshShell = { client, attemptSeq -> catalog.refreshShell(client, attemptSeq) },
    )
    catalog = CatalogSyncController(
        scope = scope,
        jobs = jobs,
        owner = owner,
        lifecycleGate = lifecycleGate,
        ioDispatcher = ioDispatcher,
        state = state,
        updateState = updateState,
        api = { live.api },
        installShell = { snapshot, replaceRows, advance, recoveryAttemptSeq, pageStartedSeq ->
            if (replaceRows) {
                live.applyShellSnapshot(snapshot, advance, recoveryAttemptSeq)
            } else {
                live.mergeShellSnapshot(snapshot, advance, recoveryAttemptSeq, pageStartedSeq)
            }
        },
        handleApiException = { live.failures.handleApiException(it) },
        requestResync = ::requestResync,
        requestLegacyRefresh = { live.refreshSnapshot() },
        currentEventSeq = { live.lastSeenSeq?.toLong() ?: 0L },
    )
    resync = ResyncEngine(
        scope = scope,
        jobs = jobs,
        owner = owner,
        isForeground = { lifecycleGate.isForeground },
        currentApi = { live.api },
        currentSocket = { live.webSocket },
        openThreadId = { state().openThreadId },
        openThreadGeneration = { hydration.currentGeneration },
        hasAuthoritativeBaseline = {
            live.lastSeenSeq != null && state().snapshot != null
        },
        nextSnapshotAttemptSeq = { live.nextSnapshotAttemptSeq() },
        fetchShell = { api -> catalog.fetchAuthoritativeShell(api) },
        fetchHistory = { api, id ->
            loadThreadHistoryTail(
                api = api,
                threadId = id,
                targetTimelineEntryCount = 40,
                bounded = state().catalog.negotiated && !state().catalog.legacy,
                ioDispatcher = ioDispatcher,
            )
        },
        onCommit = { commit ->
            live.lastSeenSeq = commit.reconnectSeq
            updateState { s ->
                LiveSessionStateTransitions.authoritativeCommit(s, commit)
            }
            live.ensureLiveSocketAfterAuthoritativeCommit()
            events.seedReplayAuthoritative(commit.shell)
            catalog.onAuthoritativeCommit()
        },
        onUnauthorized = { msg -> live.failures.handleUnauthorized(msg) },
        onFailureMessage = { msg -> updateState { it.copy(globalError = msg) } },
        onBeginOpenThread = { id -> threads.beginOpenForResync(id) },
        hydration = hydration,
    )
    events = SessionEventRouter(
        scope = scope,
        jobs = jobs,
        hydration = hydration,
        isForeground = { lifecycleGate.isForeground },
        allowsLiveEvents = { resync.allowsLiveEvents },
        openThreadGeneration = { hydration.currentGeneration },
        state = state,
        updateState = updateState,
        setLastSeenSeq = { live.lastSeenSeq = it },
        refreshSnapshot = { live.refreshSnapshot() },
        refreshOpenThreadMetadata = { events.refreshOpenThreadMetadataImpl() },
        api = { live.api },
        ioDispatcher = ioDispatcher,
        handleUnauthorized = { msg -> live.failures.handleUnauthorized(msg) },
        requestResync = ::requestResync,
        richChatEventSink = { sequence, event ->
            sinks.richChatEventSink?.invoke(sequence, event)
        },
        applyGitInterests = { live.webSocket?.setGitInterests(it) },
        onReplaySideEffects = { outcome -> sinks.replaySideEffectSink?.invoke(outcome) },
        heavyReviewTarget = { sinks.heavyReviewTargetSupplier?.invoke() },
        presentRemoteNotification = { notification, replay ->
            notificationBridge.receive(notification, replay, state(), lifecycleGate.isForeground)
        },
        catalog = catalog,
    )
    threads = ThreadController(
        scope = scope,
        jobs = jobs,
        owner = owner,
        hydration = hydration,
        interestEpoch = interestEpoch,
        ioDispatcher = ioDispatcher,
        isForeground = { lifecycleGate.isForeground },
        state = state,
        updateState = updateState,
        api = { live.api },
        applyThreadInterests = { ids, epoch -> live.applyThreadInterests(ids, epoch) },
        handleApiException = { live.failures.handleApiException(it) },
        requestAuthoritativeRefresh = { resync.requestUserAuthoritativeRefresh() },
        applyLiveEvent = { event, seq -> events.applyLiveEvent(event, seq) },
        catalog = catalog,
        currentEventSeq = { live.lastSeenSeq?.toLong() ?: 0L },
    )
    hosts = HostSessionController(
        repository = credentials,
        scope = scope,
        ioDispatcher = ioDispatcher,
        owner = owner,
        pool = sessionPool,
        apiFactory = apiFactory,
        socketFactory = socketFactory,
        isForeground = { lifecycleGate.isForeground },
        hasEndpointPermission = hasEndpointPermission,
        state = state,
        updateState = updateState,
        installSelected = ::installSelected,
        installEmpty = ::installEmptyCatalog,
        beforeRemove = beforeHostRemoval,
    )
    pairing = PairingCoordinator(
        credentials = credentials,
        scope = scope,
        jobs = jobs,
        owner = owner,
        apiFactory = apiFactory,
        ioDispatcher = ioDispatcher,
        state = state,
        updateState = updateState,
        accessToken = { live.accessToken },
        setAccessToken = { live.accessToken = it },
        destroyLiveForHostSwap = {
            resync.reset()
            catalog.onHostChange()
            live.destroyLiveForHostSwap()
        },
        onPairCommitted = { profile, token ->
            events.bindReplayHost(profile.desktopId)
            hosts.refreshCatalog()
            val client = live.installApi(profile.httpBaseUrl, token)
            // B1: the first paired socket must declare from the authority
            // descriptor, not after an unrelated reconnect.
            live.preflightCapabilitiesAndStart(client)
            hosts.warmSecondary()
            hosts.refreshHostSnapshots()
        },
        onUnpairComplete = {
            resync.reset()
            catalog.onHostChange()
            events.clearReplayCache()
            live.destroyAllForUnpair()
        },
        onCatalogChanged = { hosts.reconcileSelected() },
    )
    bootstrapController = SessionBootstrapController(
        credentials = credentials,
        scope = scope,
        jobs = jobs,
        owner = owner,
        hosts = hosts,
        live = live,
        ioDispatcher = ioDispatcher,
        apiFactory = apiFactory,
        hasEndpointPermission = hasEndpointPermission,
        updateState = updateState,
    )
    lifecycleCoordinator = AppSessionLifecycleCoordinator(
        networkGate = networkGate,
        live = live,
        threads = threads,
        pairing = pairing,
        hosts = hosts,
        resync = resync,
        jobs = jobs,
        scope = scope,
        state = state,
        updateState = updateState,
        hasEndpointPermission = hasEndpointPermission,
        bootstrap = { bootstrapController.start() },
        catalog = catalog,
    )
    return SessionControllerGraph(
        live = live,
        catalog = catalog,
        events = events,
        threads = threads,
        resync = resync,
        pairing = pairing,
        hosts = hosts,
        bootstrapController = bootstrapController,
        lifecycleCoordinator = lifecycleCoordinator,
    )
}
