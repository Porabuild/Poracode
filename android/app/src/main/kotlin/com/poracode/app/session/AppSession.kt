package com.poracode.app.session

import com.poracode.app.protocol.AppLifecycleGate
import com.poracode.app.protocol.RemoteAccessScopes
import com.poracode.app.protocol.ThreadHydrationCoordinator
import com.poracode.app.storage.SessionCredentialRepository
import com.poracode.app.storage.SessionCredentials
import com.poracode.app.transport.ForegroundNetworkGate
import com.poracode.app.transport.RemoteApiGatewayFactory
import com.poracode.app.transport.RemoteEventSocket
import com.poracode.app.transport.RemoteEventSocketFactory
import com.poracode.app.transport.RemoteWebSocketClient
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class AppSession(
    private val credentials: SessionCredentialRepository,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
    private val apiFactory: RemoteApiGatewayFactory =
        RemoteApiGatewayFactory { endpoint, token ->
            com.poracode.app.transport.RemoteApiClient(
                endpoint = endpoint,
                accessToken = token,
                networkGate = ForegroundNetworkGate.shared,
            )
        },
    private val socketFactory: RemoteEventSocketFactory =
        RemoteEventSocketFactory { api ->
            RemoteWebSocketClient(api = api, networkGate = ForegroundNetworkGate.shared)
        },
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
    private val networkGate: ForegroundNetworkGate = ForegroundNetworkGate.shared,
    private val hasEndpointPermission: (String) -> Boolean = { true },
    private val beforeHostRemoval: suspend (com.poracode.app.model.ClientConnectionId, SessionCredentials) -> Unit = { _, _ -> },
) {
    enum class Phase {
        Launching,
        NeedsPairing,
        ReconnectingStored,
        Connecting,
        Ready,
        SessionExpired,
        ProtocolIncompatible,
        LocalStoreInconsistent,
        LocalNetworkPermissionRequired,
    }
    enum class LoadState {
        Idle,
        Loading,
        Loaded,
        Empty,
        Failed,
    }
    data class PendingPairConfirmUi(
        val sanitizedHost: String,
        val endpoint: String,
        val fingerprint: String,
    )
    data class UiState(
        val phase: Phase = Phase.Launching,
        val profile: com.poracode.app.model.ConnectionProfile? = null,
        val socketState: RemoteWebSocketClient.ConnectionState =
            RemoteWebSocketClient.ConnectionState.Idle,
        val socketDetail: String? = null,
        val snapshot: com.poracode.app.model.RemoteShellSnapshot? = null,
        val hostSnapshots: Map<
            com.poracode.app.model.ClientConnectionId,
            com.poracode.app.model.RemoteShellSnapshot,
        > = emptyMap(),
        val projectsLoadState: LoadState = LoadState.Idle,
        val projectsLoadError: String? = null,
        val globalError: String? = null,
        val sessionExpired: Boolean = false,
        val openThreadId: String? = null,
        val threadSnapshot: com.poracode.app.model.RemoteThreadSnapshot? = null,
        val threadItems: List<com.poracode.app.model.PersistedRuntimeItem> = emptyList(),
        val threadOlderCursor: Int? = null,
        val threadLoadState: LoadState = LoadState.Idle,
        val threadLoadError: String? = null,
        val isSending: Boolean = false,
        val isLoadingOlder: Boolean = false,
        val isPairing: Boolean = false,
        val pendingPairConfirm: PendingPairConfirmUi? = null,
        val canSessionRead: Boolean = false,
        val canSessionOperate: Boolean = false,
        val hostCatalog: HostUiCatalog = HostUiCatalog(),
        val threadDomain: com.poracode.app.protocol.ThreadRuntimeDomainState =
            com.poracode.app.protocol.ThreadRuntimeDomainState(),
        val hostReplay: com.poracode.app.session.replay.HostReplayCacheUi =
            com.poracode.app.session.replay.HostReplayCacheUi.EMPTY,
    )
    data class PairingInput(
        val pairingUrlOrEmpty: String = "",
        val manualBaseUrl: String = "",
        val manualToken: String = "",
    )
    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()
    private val owner = SessionOperationOwner()
    private val jobs = SessionLifecycleJobs()
    private val lifecycleGate = AppLifecycleGate()
    private val hydration = ThreadHydrationCoordinator()
    private val interestEpoch = InterestEpochGate()
    private val sessionPool = SessionPool()
    private lateinit var live: LiveConnectionController
    private lateinit var threads: ThreadController
    private lateinit var events: SessionEventRouter
    private lateinit var resync: ResyncEngine
    private lateinit var pairing: PairingCoordinator
    private lateinit var hosts: HostSessionController
    private lateinit var bootstrapController: SessionBootstrapController
    @Volatile
    private var richChatEventSink:
        ((Int, kotlinx.serialization.json.JsonElement) -> Unit)? = null
    @Volatile
    private var replaySideEffectSink:
        ((com.poracode.app.session.replay.ReplayOutcome) -> Unit)? = null
    @Volatile
    private var heavyReviewTargetSupplier:
        (() -> HeavyReviewTarget?)? = null
    private val browserMirrorBridge = BrowserMirrorSessionBridge { live.webSocket }
    private data class PendingThreadOpen(
        val connectionId: com.poracode.app.model.ClientConnectionId,
        val threadId: String,
    )
    private var pendingThreadOpen: PendingThreadOpen? = null
    init {
        live = LiveConnectionController(
            scope = scope,
            jobs = jobs,
            owner = owner,
            lifecycleGate = lifecycleGate,
            apiFactory = apiFactory,
            socketFactory = socketFactory,
            ioDispatcher = ioDispatcher,
            state = { _state.value },
            updateState = { _state.update(it) },
            deliverServerMessage = { events.handleServerMessage(it) },
            requestResync = { reason -> resync.launchResync(reason) },
            interestEpoch = interestEpoch,
            onAuthoritativeBaseline = { resync.clearAuthoritativeRefreshRequired() },
            onLiveSocketInstalled = { browserMirrorBridge.installOnLiveSocket() },
        )
        events = SessionEventRouter(
            scope = scope,
            jobs = jobs,
            hydration = hydration,
            isForeground = { lifecycleGate.isForeground },
            allowsLiveEvents = { resync.allowsLiveEvents },
            openThreadGeneration = { hydration.currentGeneration },
            state = { _state.value },
            updateState = { _state.update(it) },
            setLastSeenSeq = { live.lastSeenSeq = it },
            refreshSnapshot = { live.refreshSnapshot() },
            refreshOpenThreadMetadata = { events.refreshOpenThreadMetadataImpl() },
            api = { live.api },
            ioDispatcher = ioDispatcher,
            handleUnauthorized = { msg ->
                live.handleUnauthorized(msg)
            },
            requestResync = { reason -> resync.launchResync(reason) },
            richChatEventSink = { sequence, event ->
                richChatEventSink?.invoke(sequence, event)
            },
            applyGitInterests = { live.webSocket?.setGitInterests(it) },
            onReplaySideEffects = { outcome -> replaySideEffectSink?.invoke(outcome) },
            heavyReviewTarget = { heavyReviewTargetSupplier?.invoke() },
        )
        threads = ThreadController(
            scope = scope,
            jobs = jobs,
            owner = owner,
            hydration = hydration,
            interestEpoch = interestEpoch,
            ioDispatcher = ioDispatcher,
            isForeground = { lifecycleGate.isForeground },
            state = { _state.value },
            updateState = { _state.update(it) },
            api = { live.api },
            applyThreadInterests = { ids, epoch -> live.applyThreadInterests(ids, epoch) },
            handleApiException = { live.handleApiException(it) },
            requestAuthoritativeRefresh = { resync.requestUserAuthoritativeRefresh() },
            applyLiveEvent = { events.applyLiveEvent(it) },
        )
        resync = ResyncEngine(
            scope = scope,
            jobs = jobs,
            owner = owner,
            isForeground = { lifecycleGate.isForeground },
            currentApi = { live.api },
            currentSocket = { live.webSocket },
            openThreadId = { _state.value.openThreadId },
            openThreadGeneration = { hydration.currentGeneration },
            hasAuthoritativeBaseline = {
                live.lastSeenSeq != null && _state.value.snapshot != null
            },
            fetchShell = { api -> withContext(ioDispatcher) { api.snapshot() } },
            fetchHistory = { api, id ->
                withContext(ioDispatcher) {
                    api.threadHistory(threadId = id, targetTimelineEntryCount = 40)
                }
            },
            onCommit = { commit ->
                live.lastSeenSeq = commit.reconnectSeq
                _state.update { s ->
                    val base = s.copy(
                        phase = AppSession.Phase.Ready,
                        snapshot = commit.shell,
                        projectsLoadState = if (commit.shell.projects.isEmpty() &&
                            commit.shell.threads.isEmpty()
                        ) {
                            AppSession.LoadState.Empty
                        } else {
                            AppSession.LoadState.Loaded
                        },
                        projectsLoadError = null,
                    )
                    if (commit.history != null &&
                        commit.openThreadId != null &&
                        s.openThreadId == commit.openThreadId
                    ) {
                        val hydrated = ThreadController.hydrateFromHistory(
                            history = commit.history,
                            threadId = commit.openThreadId,
                        )
                        base.copy(
                            threadSnapshot = commit.history,
                            threadItems = hydrated.visible,
                            threadOlderCursor = commit.history.runtimeNextCursor,
                            threadLoadState = if (hydrated.visible.isEmpty()) {
                                AppSession.LoadState.Empty
                            } else {
                                AppSession.LoadState.Loaded
                            },
                            threadLoadError = null,
                            threadDomain = hydrated.domain,
                        )
                    } else {
                        base
                    }
                }
                live.ensureLiveSocketAfterAuthoritativeCommit()
                events.seedReplayAuthoritative(commit.shell)
            },
            onUnauthorized = { msg ->
                live.handleUnauthorized(msg)
            },
            onFailureMessage = { msg ->
                _state.update { it.copy(globalError = msg) }
            },
            onBeginOpenThread = { id -> threads.beginOpenForResync(id) },
            hydration = hydration,
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
            state = { _state.value },
            updateState = { _state.update(it) },
            installSelected = ::installSelectedCredentials,
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
            state = { _state.value },
            updateState = { _state.update(it) },
            accessToken = { live.accessToken },
            setAccessToken = { live.accessToken = it },
            destroyLiveForHostSwap = {
                resync.reset()
                live.destroyLiveForHostSwap()
            },
            onPairCommitted = { profile, token ->
                events.bindReplayHost(profile.desktopId)
                hosts.refreshCatalog()
                live.installApi(profile.httpBaseUrl, token)
                live.startLiveSession()
                hosts.warmSecondary()
                hosts.refreshHostSnapshots()
            },
            onUnpairComplete = {
                resync.reset()
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
            hasEndpointPermission = hasEndpointPermission,
            updateState = { _state.update(it) },
        )
        // Browser-mirror sink binding is driven by the live-socket lifecycle via onLiveSocketInstalled.
    }

    fun bootstrap() = bootstrapController.start()
    internal fun resetBootstrapForTests() {
        bootstrapController.resetForTests()
    }
    internal fun isBootstrappedForTests(): Boolean = bootstrapController.hasStartedForTests()
    internal fun bootstrapAttemptForTests(): Int = bootstrapController.attemptForTests()
    internal fun userInvokableAuthoritativeRefreshForTests(): Boolean =
        resync.userInvokableAuthoritativeRefresh
    fun retryAuthoritativeRefresh() {
        resync.requestUserAuthoritativeRefresh()
    }

    internal fun openThreadGenerationForTests(): Int = hydration.currentGeneration
    internal fun lastSeenSeqForTests(): Int? = live.lastSeenSeq
    internal fun isForegroundForTests(): Boolean = lifecycleGate.isForeground
    internal fun resyncPendingForTests(): Boolean = resync.pending
    internal fun socketForTests(): RemoteEventSocket? = live.webSocket
    internal fun sessionGenerationForTests(): Int = owner.sessionGeneration
    internal fun authoritativeRefreshRequiredForTests(): Boolean =
        resync.authoritativeRefreshRequired

    fun onAppBackground() {
        networkGate.closeAndCancelAll()
        live.closeLifecycleGate()
        threads.parkHydrationForBackground()
        pairing.clearPendingPairSecret()
        hosts.onBackground()
        val cancelled = live.cancelAndSuspendForBackground()
        resync.abandonForBackground()
        if (cancelled.isNotEmpty()) {
            scope.launch {
                cancelled.forEach { job ->
                    runCatching { job.join() }
                }
            }
        }
    }

    fun onAppForeground() {
        val s = _state.value
        val token = live.accessToken
        val profile = s.profile
        if (profile != null && !hasEndpointPermission(profile.httpBaseUrl)) {
            networkGate.closeAndCancelAll()
            live.closeLifecycleGate()
            _state.update { it.copy(phase = Phase.LocalNetworkPermissionRequired) }
            return
        }
        networkGate.openForForeground()
        live.openLifecycleGate()
        hosts.onForeground()
        if (s.phase == Phase.Launching &&
            profile == null &&
            live.api == null &&
            token.isNullOrBlank()
        ) {
            bootstrap()
            return
        }
        if (live.api == null && profile != null && !token.isNullOrBlank()) {
            val job = scope.launch {
                live.connectWithStoredSession(profile, token)
            }
            jobs.replace(SessionLifecycleJobs.LIVE_START, job)
            return
        }
        threads.restartHydrationIfNeeded()
        live.onForeground(resync) { live.refreshSnapshot() }
    }

    fun clearGlobalError() {
        _state.update { it.copy(globalError = null) }
    }
    fun onLocalNetworkPermissionGranted() {
        val profile = _state.value.profile ?: return
        val token = live.accessToken ?: return
        if (!hasEndpointPermission(profile.httpBaseUrl)) return
        networkGate.openForForeground()
        live.openLifecycleGate()
        hosts.onForeground()
        val job = scope.launch { live.connectWithStoredSession(profile, token) }
        jobs.replace(SessionLifecycleJobs.LIVE_START, job)
    }

    fun handleIncomingPairingUrl(raw: String, external: Boolean = true) {
        pairing.handleIncomingPairingUrl(raw, external = external)
    }

    fun confirmPendingPair() = pairing.confirmPendingPair()
    fun cancelPendingPair() = pairing.cancelPendingPair()

    fun pair(input: PairingInput, fingerprint: String? = null) =
        pairing.pair(
            PairingCoordinator.PairingInput(
                pairingUrlOrEmpty = input.pairingUrlOrEmpty,
                manualBaseUrl = input.manualBaseUrl,
                manualToken = input.manualToken,
            ),
            fingerprint = fingerprint,
        )

    fun unpair() = _state.value.hostCatalog.selectedConnectionId?.let(hosts::remove) ?: pairing.unpair()
    fun selectHost(id: com.poracode.app.model.ClientConnectionId) = hosts.select(id)
    fun removeHost(id: com.poracode.app.model.ClientConnectionId) = hosts.remove(id)
    fun refreshSnapshot() {
        live.refreshSnapshot()
        scope.launch { hosts.refreshHostSnapshots() }
    }
    internal suspend fun refreshSnapshotForPush(): Boolean = kotlinx.coroutines.CompletableDeferred<Boolean>().let { result -> live.refreshSnapshot { result.complete(it) } ?: return false; result.await() }
    fun openThread(id: String) {
        val parts = com.poracode.app.model.CompositeRemoteId(id).decode()
        if (parts == null) {
            threads.openThread(id)
        } else if (parts.connectionId == _state.value.hostCatalog.selectedConnectionId) {
            threads.openThread(parts.remoteId)
        } else {
            pendingThreadOpen = PendingThreadOpen(parts.connectionId, parts.remoteId)
            hosts.select(parts.connectionId)
        }
    }
    fun closeThread() = threads.closeThread()
    fun loadOlderItems() = threads.loadOlderItems()
    fun sendMessage(text: String, onResult: (Boolean) -> Unit = {}) =
        threads.sendMessage(text, onResult)
    fun interruptOpenThread() = threads.interruptOpenThread()

    fun setRichChatEventSink(
        sink: ((Int, kotlinx.serialization.json.JsonElement) -> Unit)?,
    ) {
        richChatEventSink = sink
    }

    /** Registers the receiver for sequenced-replay side effects (e.g. terminal fresh-baseline). */
    fun setReplaySideEffectSink(
        sink: ((com.poracode.app.session.replay.ReplayOutcome) -> Unit)?,
    ) {
        replaySideEffectSink = sink
    }

    fun setHeavyReviewTargetSource(
        supplier: (() -> HeavyReviewTarget?)?,
    ) {
        heavyReviewTargetSupplier = supplier
    }

    fun recomputeGitInterests() = events.recomputeGitInterests()

    /** Installs (or clears) the cursor-bypass receiver for browser-mirror server frames. */
    fun setBrowserMirrorEventSink(sink: ((Int, String) -> Unit)?) {
        browserMirrorBridge.setEventSink(sink)
    }

    /** Outbound browser-mirror wire socket bound to the current live socket, or null. */
    fun browserMirrorWireSocket(): com.poracode.app.transport.browsermirror.BrowserMirrorWireSocket? =
        browserMirrorBridge.wireSocket()

    /** Current fine-grained socket generation for the live socket, or null when offline. */
    fun browserMirrorSocketGeneration(): Int? = browserMirrorBridge.socketGeneration()

    fun projects() = HostPresentation.projects(_state.value)
    fun threadsFor(projectId: String) = HostPresentation.threads(_state.value, projectId)
    fun unifiedThreads() = HostPresentation.unifiedThreads(_state.value)

    private suspend fun installSelectedCredentials(credentials: SessionCredentials) {
        resync.reset()
        events.bindReplayHost(credentials.profile.desktopId)
        live.destroyLiveForHostSwap()
        owner.bumpSessionGeneration()
        live.accessToken = credentials.accessToken
        _state.update { SessionStateTransitions.installingHost(it, credentials.profile) }
        if (!hasEndpointPermission(credentials.profile.httpBaseUrl)) {
            _state.update { it.copy(phase = Phase.LocalNetworkPermissionRequired) }
            return
        }
        live.installApi(credentials.profile.httpBaseUrl, credentials.accessToken)
        live.startLiveSession()
        pendingThreadOpen?.takeIf {
            it.connectionId == _state.value.hostCatalog.selectedConnectionId
        }?.let { pending ->
            pendingThreadOpen = null
            threads.openThread(pending.threadId)
        }
    }

    private fun installEmptyCatalog() {
        resync.reset()
        events.clearReplayCache()
        live.destroyAllForUnpair()
        owner.bumpSessionGeneration()
        val catalog = _state.value.hostCatalog
        _state.value = UiState(phase = Phase.NeedsPairing, hostCatalog = catalog)
    }
    companion object {
        const val SEND_MISSING_THREAD_CONFIG_MESSAGE =
            "This thread is not ready to send yet. Wait for the transcript to load, or reopen the thread."

        const val NO_KNOWN_SCOPES_MESSAGE = PairingCoordinator.NO_KNOWN_SCOPES_MESSAGE

        internal fun mapPairingFailurePhase(
            previousPhase: AppSession.Phase,
            hasRetainedCredential: Boolean,
        ): AppSession.Phase =
            PairingCoordinator.mapPairingFailurePhase(previousPhase, hasRetainedCredential)
    }
}
