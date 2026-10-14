package com.poracode.app.session

import com.poracode.app.protocol.AppLifecycleGate
import com.poracode.app.protocol.ThreadHydrationCoordinator
import com.poracode.app.session.catalog.CatalogSyncController
import com.poracode.app.storage.SessionCredentialRepository
import com.poracode.app.storage.SessionCredentials
import com.poracode.app.transport.ForegroundNetworkGate
import com.poracode.app.transport.RemoteApiGatewayFactory
import com.poracode.app.transport.RemoteEventSocket
import com.poracode.app.transport.RemoteEventSocketFactory
import com.poracode.app.transport.RemoteWebSocketClient
import com.poracode.app.push.PushRouteV1
import com.poracode.app.push.RemoteUserNotificationPresentationCenter
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class AppSession(
    private val credentials: SessionCredentialRepository,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
    private val apiFactory: RemoteApiGatewayFactory = defaultRemoteApiFactory(),
    private val socketFactory: RemoteEventSocketFactory = defaultRemoteEventSocketFactory(),
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
    private val networkGate: ForegroundNetworkGate = ForegroundNetworkGate.shared,
    private val hasEndpointPermission: (String) -> Boolean = { true },
    private val beforeHostRemoval: suspend (com.poracode.app.model.ClientConnectionId, SessionCredentials) -> Unit = { _, _ -> },
    private val remoteNotifications: RemoteUserNotificationPresentationCenter =
        RemoteUserNotificationPresentationCenter(),
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
        val liveBrowserForwardVersions: Set<Int> = emptySet(),
        /** B1 live `capabilities.runtimeHistoryNotices.versions`; empty = undeclared. */
        val liveRuntimeHistoryNoticeVersions: Set<Int> = emptySet(),
        /**
         * Live `capabilities.projectCommandResults.versions` from this
         * connection's descriptor; empty = undeclared. Never persisted or
         * shared across hosts: the lease reads only this live value.
         */
        val liveProjectCommandResultVersions: Set<Int> = emptySet(),
        val snapshot: com.poracode.app.model.RemoteShellSnapshot? = null,
        val hostSnapshots: Map<
            com.poracode.app.model.ClientConnectionId,
            com.poracode.app.model.RemoteShellSnapshot,
        > = emptyMap(),
        val projectsLoadState: LoadState = LoadState.Idle,
        val projectsLoadError: String? = null,
        val globalError: String? = null,
        /**
         * Transient connection-health banner: transport failures published by
         * the connection scope. Structurally separate from [globalError] so
         * ownership is never decided by message text — a later authoritative
         * snapshot retires this field and can never touch [globalError], so
         * an unrelated thread/action failure (even with identical text)
         * survives connection recovery. In-memory only; rendered by the home
         * pane, never persisted.
         */
        val connectionError: String? = null,
        /**
         * Publication seq of [connectionError] from the connection event
         * counter; null when nothing is claimed. Recovery compares it against
         * the seq a snapshot attempt took at start, so a success that began
         * before a newer failure never retires that failure.
         */
        val connectionErrorSeq: Long? = null,
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
        /** Bounded catalog walk generation, per-row guards and pins. */
        val catalog: com.poracode.app.session.catalog.CatalogUiState =
            com.poracode.app.session.catalog.CatalogUiState(),
    )
    data class PairingInput(
        val pairingUrlOrEmpty: String = "",
        val manualBaseUrl: String = "",
        val manualToken: String = "",
    )
    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()
    private val notificationBridge = AppSessionRemoteNotifications(remoteNotifications)
    val notificationBanners = notificationBridge.banners
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
    private lateinit var lifecycleCoordinator: AppSessionLifecycleCoordinator
    private lateinit var catalog: CatalogSyncController
    private val sinks = SessionSinks()
    private val pendingOpen = PendingThreadOpenState()
    private val browserMirrorBridge = BrowserMirrorSessionBridge { live.webSocket }
    init {
        val graph = buildSessionControllerGraph(
            credentials = credentials,
            scope = scope,
            jobs = jobs,
            owner = owner,
            lifecycleGate = lifecycleGate,
            hydration = hydration,
            interestEpoch = interestEpoch,
            sessionPool = sessionPool,
            apiFactory = apiFactory,
            socketFactory = socketFactory,
            ioDispatcher = ioDispatcher,
            networkGate = networkGate,
            hasEndpointPermission = hasEndpointPermission,
            beforeHostRemoval = beforeHostRemoval,
            notificationBridge = notificationBridge,
            browserMirrorBridge = browserMirrorBridge,
            sinks = sinks,
            pendingOpen = pendingOpen,
            state = { _state.value },
            updateState = { _state.update(it) },
        )
        live = graph.live
        catalog = graph.catalog
        events = graph.events
        threads = graph.threads
        resync = graph.resync
        pairing = graph.pairing
        hosts = graph.hosts
        bootstrapController = graph.bootstrapController
        lifecycleCoordinator = graph.lifecycleCoordinator
    }

    fun bootstrap() = bootstrapController.start()
    internal fun resetBootstrapForTests() = bootstrapController.resetForTests()
    internal fun isBootstrappedForTests(): Boolean = bootstrapController.hasStartedForTests()
    internal fun bootstrapAttemptForTests(): Int = bootstrapController.attemptForTests()
    internal fun userInvokableAuthoritativeRefreshForTests(): Boolean =
        resync.userInvokableAuthoritativeRefresh
    fun retryAuthoritativeRefresh() = resync.requestUserAuthoritativeRefresh()

    internal fun openThreadGenerationForTests(): Int = hydration.currentGeneration
    internal fun lastSeenSeqForTests(): Int? = live.lastSeenSeq
    internal fun isForegroundForTests(): Boolean = lifecycleGate.isForeground
    internal fun resyncPendingForTests(): Boolean = resync.pending
    internal fun socketForTests(): RemoteEventSocket? = live.webSocket
    internal fun sessionGenerationForTests(): Int = owner.sessionGeneration
    internal fun authoritativeRefreshRequiredForTests(): Boolean =
        resync.authoritativeRefreshRequired

    fun onAppBackground() {
        notificationBridge.dismiss()
        lifecycleCoordinator.onBackground()
    }

    fun onAppForeground() =
        notificationBridge.onForeground(_state.value, lifecycleCoordinator::onForeground)

    fun dismissRemoteNotification(id: Long? = null) = notificationBridge.dismiss(id)

    fun openRemoteNotification(id: Long): Boolean =
        notificationBridge.open(id, _state.value, ::openThread)

    fun shouldPresentPush(route: PushRouteV1): Boolean =
        notificationBridge.shouldPresentPush(route)

    fun clearGlobalError() {
        _state.update { it.copy(globalError = null) }
    }
    fun onLocalNetworkPermissionGranted() = lifecycleCoordinator.onLocalNetworkPermissionGranted()

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

    fun unpair() = notificationBridge.dismiss().also {
        _state.value.hostCatalog.selectedConnectionId?.let(hosts::remove) ?: pairing.unpair() }
    fun selectHost(id: com.poracode.app.model.ClientConnectionId) =
        notificationBridge.dismiss().also { hosts.select(id) }
    fun removeHost(id: com.poracode.app.model.ClientConnectionId) =
        notificationBridge.dismiss().also { hosts.remove(id) }
    fun renameHost(id: com.poracode.app.model.ClientConnectionId, label: String) =
        hosts.rename(id, label)
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
            pendingOpen.set(parts.connectionId, parts.remoteId)
            hosts.select(parts.connectionId)
        }
    }
    fun closeThread() = threads.closeThread()
    fun loadOlderItems() = threads.loadOlderItems()

    /** Loads one older `ct1.` completed-turn page into the open thread's snapshot. */
    fun loadOlderCompletedTurns() = threads.loadOlderCompletedTurns()
    fun sendMessage(text: String, onResult: (Boolean) -> Unit = {}) =
        threads.sendMessage(text, onResult)
    fun interruptOpenThread() = threads.interruptOpenThread()

    fun setRichChatEventSink(
        sink: ((Int, kotlinx.serialization.json.JsonElement) -> Unit)?,
    ) {
        sinks.richChatEventSink = sink
    }

    /** Registers the receiver for sequenced-replay side effects (e.g. terminal fresh-baseline). */
    fun setReplaySideEffectSink(
        sink: ((com.poracode.app.session.replay.ReplayOutcome) -> Unit)?,
    ) {
        sinks.replaySideEffectSink = sink
    }

    fun setHeavyReviewTargetSource(
        supplier: (() -> HeavyReviewTarget?)?,
    ) {
        sinks.heavyReviewTargetSupplier = supplier
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
