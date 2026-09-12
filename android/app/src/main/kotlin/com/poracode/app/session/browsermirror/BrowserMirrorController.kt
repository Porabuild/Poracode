package com.poracode.app.session.browsermirror

import com.poracode.app.model.browsermirror.BrowserCommand
import com.poracode.app.model.browsermirror.BrowserFrame
import com.poracode.app.model.browsermirror.BrowserInput
import com.poracode.app.model.browsermirror.BrowserMirrorAvailability
import com.poracode.app.model.browsermirror.BrowserMirrorStatus
import com.poracode.app.model.browsermirror.BrowserServerMessage
import com.poracode.app.model.browsermirror.BrowserState
import com.poracode.app.transport.browsermirror.BrowserMirrorSocketEnvelope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

enum class BrowserMirrorFailure {
    NoSession,
    Offline,
    NotReady,
    ReadDenied,
    OperateDenied,
    Remote,
    AmbiguousCommand,
}

data class BrowserMirrorUiState(
    val loading: Boolean = false,
    val browser: BrowserState = BrowserState(emptyList(), null),
    val frame: BrowserFrame? = null,
    val mirrorStatus: BrowserMirrorStatus? = null,
    val failure: BrowserMirrorFailure? = null,
    val watching: Boolean = false,
)

class BrowserMirrorController(
    private val leases: StateFlow<BrowserMirrorHostLease?>,
    private val gateway: BrowserMirrorSessionGateway,
    private val scope: CoroutineScope,
) {
    private val mutableState = MutableStateFlow(BrowserMirrorUiState())
    val state: StateFlow<BrowserMirrorUiState> = mutableState.asStateFlow()

    private val subscriptionMutex = Mutex()
    @Volatile
    private var closed = false
    private var foreground = true
    private var retainedWatchIntent = false
    private var subscribedSocket: BrowserMirrorSocketKey? = null
    private var observedSocket: BrowserMirrorSocketKey? = null
    private var refreshJob: Job? = null
    private var commandJob: Job? = null
    private val inputJobs = mutableSetOf<Job>()

    /**
     * Child scope that parents every coroutine this controller launches (lease observer,
     * refresh, command, input, subscription). Cancelling it from [close] tears down all
     * controller-owned work in one deterministic step while preserving structured
     * concurrency with [scope].
     */
    private val workScope: CoroutineScope =
        CoroutineScope(scope.coroutineContext + SupervisorJob(scope.coroutineContext[Job]))
    private fun launch(block: suspend CoroutineScope.() -> Unit): Job = workScope.launch(block = block)

    private val observerJob: Job = launch {
        leases.collectLatest { lease ->
            if (closed) return@collectLatest
            val socket = lease?.socketKey
            if (socket != observedSocket) {
                observedSocket = socket
                subscribedSocket = null
                mutableState.update {
                    it.copy(
                        browser = BrowserState(emptyList(), null),
                        frame = null,
                        mirrorStatus = null,
                        watching = false,
                    )
                }
            }
            if (lease == null || !lease.foreground || !lease.online || !lease.ready) {
                cancelWork()
                subscribedSocket = null
                mutableState.update { it.copy(frame = null, watching = false) }
            } else {
                reconcileSubscription()
            }
        }
    }

    init {
        observerJob.invokeOnCompletion { close() }
    }

    /**
     * Idempotent teardown. Cancels the lease observer and any refresh/command/input/
     * subscription work, drops the retained watch intent, and clears the frame bytes
     * so the JPEG does not outlive the surface. Late lease changes after [close] are
     * dropped by the [closed] gate and the observer cancellation. Safe to call from
     * any thread; repeated calls are no-ops.
     */
    fun close() {
        if (closed) return
        closed = true
        retainedWatchIntent = false
        cancelWork()
        // Cancel the work scope last so per-job cancel above is observable before the
        // supervisor rips down the whole subtree.
        workScope.cancel()
        subscribedSocket = null
        observedSocket = null
        mutableState.update {
            it.copy(
                browser = BrowserState(emptyList(), null),
                frame = null,
                mirrorStatus = null,
                watching = false,
                loading = false,
                failure = null,
            )
        }
    }

    fun launchRefresh() {
        if (closed) return
        refreshJob?.cancel()
        refreshJob = launch { refreshNow() }
    }

    fun launchCommand(command: BrowserCommand) {
        if (closed) return
        commandJob?.cancel()
        commandJob = launch { executeNow(command) }
    }

    fun launchInput(input: BrowserInput) {
        if (closed) return
        val job = launch { sendInputNow(input) }
        inputJobs += job
        job.invokeOnCompletion { inputJobs -= job }
    }

    fun requestWatch() {
        if (closed) return
        retainedWatchIntent = true
        launch { reconcileSubscription() }
    }

    fun stopWatch() {
        if (closed) return
        retainedWatchIntent = false
        val lease = leases.value
        subscribedSocket = null
        mutableState.update { it.copy(frame = null, watching = false) }
        if (lease != null && lease.isUsable(BrowserMirrorCapability.Read)) {
            launch { runCatching { gateway.unwatch(lease) } }
        }
    }

    /** Call before the app's shared foreground gate is closed. */
    fun onBackground() {
        if (closed) return
        foreground = false
        cancelWork()
        val lease = leases.value
        val wasSubscribed = subscribedSocket == lease?.socketKey
        subscribedSocket = null
        mutableState.update { it.copy(frame = null, watching = false) }
        if (wasSubscribed && lease != null && lease.isUsable(BrowserMirrorCapability.Read)) {
            launch { runCatching { gateway.unwatch(lease) } }
        }
    }

    fun onForeground() {
        if (closed) return
        foreground = true
        launch {
            // Authoritative state refresh before re-subscribing, so a watch replays against
            // current host state rather than a stale background snapshot.
            refreshNow()
            reconcileSubscription()
        }
    }

    fun onSocketMessage(envelope: BrowserMirrorSocketEnvelope) {
        if (closed) return
        val lease = leases.value ?: return
        if (!foreground || !lease.foreground || envelope.socketKey != lease.socketKey) return
        if (subscribedSocket != lease.socketKey || !retainedWatchIntent) return
        when (val message = envelope.message) {
            is BrowserServerMessage.State -> applyBrowserState(message.state)
            is BrowserServerMessage.Frame -> applyFrame(message.frame)
            is BrowserServerMessage.Status -> applyStatus(message.status)
        }
    }

    suspend fun refreshNow() {
        val lease = eligibleLease(BrowserMirrorCapability.Read) ?: return
        mutableState.update { it.copy(loading = true, failure = null) }
        try {
            val browser = gateway.state(lease)
            if (!isCurrent(lease)) return
            applyBrowserState(browser)
            mutableState.update { it.copy(loading = false, failure = null) }
        } catch (error: CancellationException) {
            mutableState.update { it.copy(loading = false) }
            throw error
        } catch (error: BrowserMirrorGatewayException) {
            if (!isSameHost(lease)) return
            mutableState.update { it.copy(loading = false, failure = error.toFailure(false)) }
        }
    }

    suspend fun executeNow(command: BrowserCommand) {
        val lease = eligibleLease(BrowserMirrorCapability.Operate) ?: return
        mutableState.update { it.copy(loading = true, failure = null) }
        try {
            val browser = gateway.command(lease, command)
            if (!isCurrent(lease)) return
            applyBrowserState(browser)
            mutableState.update { it.copy(loading = false, failure = null) }
        } catch (error: CancellationException) {
            mutableState.update { it.copy(loading = false) }
            throw error
        } catch (error: BrowserMirrorGatewayException) {
            if (!isSameHost(lease)) return
            val ambiguous = error.ambiguousMutation
            mutableState.update {
                it.copy(
                    loading = ambiguous,
                    failure = error.toFailure(mutation = true),
                )
            }
            if (ambiguous) authoritativeRefreshAfterAmbiguity(lease)
        }
    }

    suspend fun sendInputNow(input: BrowserInput) {
        val lease = eligibleLease(BrowserMirrorCapability.Operate) ?: return
        if (subscribedSocket != lease.socketKey) return
        try {
            gateway.input(lease, input)
        } catch (error: CancellationException) {
            throw error
        } catch (error: BrowserMirrorGatewayException) {
            if (isSameHost(lease)) {
                mutableState.update { it.copy(failure = error.toFailure(false)) }
            }
        }
    }

    private suspend fun authoritativeRefreshAfterAmbiguity(lease: BrowserMirrorHostLease) {
        if (!isCurrent(lease)) return
        try {
            val browser = gateway.state(lease)
            if (!isCurrent(lease)) return
            applyBrowserState(browser)
            mutableState.update { it.copy(loading = false) }
        } catch (error: CancellationException) {
            mutableState.update { it.copy(loading = false) }
            throw error
        } catch (_: BrowserMirrorGatewayException) {
            if (isSameHost(lease)) mutableState.update { it.copy(loading = false) }
        }
    }

    private suspend fun reconcileSubscription() = subscriptionMutex.withLock {
        if (!foreground || !retainedWatchIntent) return@withLock
        val lease = leases.value ?: return@withLock
        if (!lease.isUsable(BrowserMirrorCapability.Read)) return@withLock
        if (subscribedSocket == lease.socketKey) return@withLock
        try {
            gateway.watch(lease)
            if (isCurrent(lease) && foreground && retainedWatchIntent) {
                subscribedSocket = lease.socketKey
                mutableState.update { it.copy(watching = true) }
            }
        } catch (_: CancellationException) {
            // A lifecycle/ownership change intentionally abandons this subscription.
        } catch (error: BrowserMirrorGatewayException) {
            if (isSameHost(lease)) {
                mutableState.update { it.copy(failure = error.toFailure(false), watching = false) }
            }
        }
    }

    private fun applyBrowserState(browser: BrowserState) {
        mutableState.update { current ->
            current.copy(
                browser = browser,
                frame = current.frame?.takeIf { it.tabId == browser.activeTabId },
            )
        }
    }

    private fun applyFrame(frame: BrowserFrame) {
        mutableState.update { current ->
            if (frame.tabId == current.browser.activeTabId) current.copy(frame = frame) else current
        }
    }

    private fun applyStatus(status: BrowserMirrorStatus) {
        mutableState.update { current ->
            current.copy(
                mirrorStatus = status,
                frame = current.frame.takeUnless {
                    status.availability == BrowserMirrorAvailability.Unavailable ||
                        status.tabId != null && status.tabId != current.browser.activeTabId
                },
            )
        }
    }

    private fun eligibleLease(capability: BrowserMirrorCapability): BrowserMirrorHostLease? {
        val lease = leases.value
        val failure = when {
            lease == null -> BrowserMirrorFailure.NoSession
            !foreground || !lease.foreground || !lease.online -> BrowserMirrorFailure.Offline
            !lease.ready -> BrowserMirrorFailure.NotReady
            capability.scope !in lease.scopes -> if (capability == BrowserMirrorCapability.Read) {
                BrowserMirrorFailure.ReadDenied
            } else {
                BrowserMirrorFailure.OperateDenied
            }
            else -> null
        }
        if (failure != null) mutableState.update { it.copy(loading = false, failure = failure) }
        return lease.takeIf { failure == null }
    }

    private fun BrowserMirrorHostLease.isUsable(capability: BrowserMirrorCapability): Boolean =
        foreground && online && ready && capability.scope in scopes

    private fun isCurrent(lease: BrowserMirrorHostLease): Boolean =
        foreground && leases.value?.socketKey == lease.socketKey &&
            leases.value?.isUsable(BrowserMirrorCapability.Read) == true

    private fun isSameHost(lease: BrowserMirrorHostLease): Boolean =
        leases.value?.hostKey == lease.hostKey

    private fun BrowserMirrorGatewayException.toFailure(mutation: Boolean): BrowserMirrorFailure =
        when {
            mutation && ambiguousMutation -> BrowserMirrorFailure.AmbiguousCommand
            code == "no_session" || code == "stale_lease" -> BrowserMirrorFailure.NoSession
            code == "offline" || code == "background" -> BrowserMirrorFailure.Offline
            code == "session_not_ready" -> BrowserMirrorFailure.NotReady
            statusCode == 403 -> BrowserMirrorFailure.OperateDenied
            else -> BrowserMirrorFailure.Remote
        }

    private fun cancelWork() {
        refreshJob?.cancel()
        commandJob?.cancel()
        inputJobs.toList().forEach(Job::cancel)
        refreshJob = null
        commandJob = null
        inputJobs.clear()
    }
}
