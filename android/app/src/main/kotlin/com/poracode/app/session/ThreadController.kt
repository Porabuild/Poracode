package com.poracode.app.session

import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteThreadSnapshot
import com.poracode.app.protocol.GlobalCursorPolicy
import com.poracode.app.protocol.RemoteAccessScopes
import com.poracode.app.protocol.ThreadHydrationCoordinator
import com.poracode.app.protocol.ThreadRuntimeDomainState
import com.poracode.app.session.history.OLDER_TURNS_PAGE_LIMIT
import com.poracode.app.session.history.appendOlderTurns
import com.poracode.app.session.history.loadOlderCompletedTurns
import com.poracode.app.session.history.loadOlderHistoryItems
import com.poracode.app.session.history.loadThreadHistoryTail
import com.poracode.app.transport.RemoteApiGateway
import com.poracode.app.transport.RemoteMutationClassification
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Open-thread history, paging, send, interrupt. Carries thread epoch for stale rejection.
 */
class ThreadController(
    private val scope: CoroutineScope,
    private val jobs: SessionLifecycleJobs,
    private val owner: SessionOperationOwner,
    private val hydration: ThreadHydrationCoordinator,
    private val interestEpoch: InterestEpochGate,
    private val ioDispatcher: CoroutineDispatcher,
    private val isForeground: () -> Boolean,
    private val state: () -> AppSession.UiState,
    private val updateState: ((AppSession.UiState) -> AppSession.UiState) -> Unit,
    private val api: () -> RemoteApiGateway?,
    private val applyThreadInterests: (List<String>, Int) -> Unit,
    private val handleApiException: (RemoteClientException) -> Unit,
    private val requestAuthoritativeRefresh: () -> Unit,
    private val applyLiveEvent: (kotlinx.serialization.json.JsonElement, Long) -> Unit,
    /** Bounded catalog owner: pins the open row and picks bounded history reads. */
    private val catalog: com.poracode.app.session.catalog.CatalogSyncController? = null,
    /** Newest live event seq; fences a history row install against a newer live row. */
    private val currentEventSeq: () -> Long = { 0L },
) {
    fun openThread(id: String) {
        if (!requireSessionRead()) return
        val presentation = state().snapshot?.threads
            ?.firstOrNull { it.id == id }
            ?.presentationMode
        if (SessionPolicies.shouldRejectTerminalOpen(presentation)) {
            updateState {
                it.copy(globalError = SessionPolicies.TERMINAL_THREAD_UNSUPPORTED_MESSAGE)
            }
            return
        }
        jobs.cancel(SessionLifecycleJobs.THREAD_HISTORY)
        owner.beginOpenThread(id)
        // The pin belongs to the open-thread owner only; switching releases the
        // previous selection so a host-deleted old row can still be confirmed
        // absent. A same-id reopen keeps its single pin (set semantics).
        state().openThreadId?.takeIf { it != id }?.let { catalog?.releaseThreadPin(it) }
        catalog?.pinThread(id)
        // Hydration generation is the source of truth for buffer/apply disposition.
        val openGen = hydration.beginOpen(id)
        val epoch = interestEpoch.next()
        updateState {
            it.copy(
                openThreadId = id,
                threadSnapshot = null,
                threadItems = emptyList(),
                threadOlderCursor = null,
                threadLoadState = AppSession.LoadState.Loading,
                threadLoadError = null,
                threadDomain = ThreadRuntimeDomainState(),
            )
        }
        applyThreadInterests(listOf(id), epoch)
        val job = scope.launch {
            loadThreadHistory(id, openGeneration = openGen)
        }
        jobs.replace(SessionLifecycleJobs.THREAD_HISTORY, job)
    }

    fun closeThread() {
        jobs.cancel(SessionLifecycleJobs.THREAD_HISTORY)
        jobs.cancel(SessionLifecycleJobs.THREAD_META)
        hydration.cancel()
        state().openThreadId?.let { catalog?.releaseThreadPin(it) }
        owner.closeThread()
        val epoch = interestEpoch.next()
        updateState {
            it.copy(
                openThreadId = null,
                threadSnapshot = null,
                threadItems = emptyList(),
                threadOlderCursor = null,
                threadLoadState = AppSession.LoadState.Idle,
                threadLoadError = null,
                threadDomain = ThreadRuntimeDomainState(),
            )
        }
        applyThreadInterests(emptyList(), epoch)
    }

    fun loadOlderItems() {
        if (!requireSessionRead()) return
        val client = api() ?: return
        val current = state()
        val openId = current.openThreadId ?: return
        val cursor = current.threadOlderCursor ?: return
        if (current.isLoadingOlder) return
        val threadGen = owner.threadGeneration

        val job = scope.launch {
            updateState { it.copy(isLoadingOlder = true) }
            try {
                val page = loadOlderHistoryItems(
                    api = client,
                    threadId = openId,
                    beforePosition = cursor,
                    limit = 100,
                    targetTimelineEntryCount = 40,
                    bounded = boundedHistoryReads(),
                    ioDispatcher = ioDispatcher,
                )
                if (!isForeground()) return@launch
                if (!owner.isCurrentThread(threadGen, openId)) return@launch
                updateState { s ->
                    val seen = s.threadItems.map { it.id }.toMutableSet()
                    val older = page.items.filter { seen.add(it.id) }
                    s.copy(
                        threadItems = older + s.threadItems,
                        threadOlderCursor = page.nextCursor,
                        threadLoadState = if ((older + s.threadItems).isEmpty()) {
                            AppSession.LoadState.Empty
                        } else {
                            AppSession.LoadState.Loaded
                        },
                        isLoadingOlder = false,
                    )
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: RemoteClientException) {
                if (!isForeground() || !owner.isCurrentThread(threadGen, openId)) return@launch
                updateState { it.copy(isLoadingOlder = false) }
                handleApiException(e)
            } catch (e: Exception) {
                if (!isForeground() || !owner.isCurrentThread(threadGen, openId)) return@launch
                updateState {
                    it.copy(
                        isLoadingOlder = false,
                        globalError = e.message,
                    )
                }
            }
        }
        jobs.replace(SessionLifecycleJobs.THREAD_PAGE, job)
    }

    fun sendMessage(text: String, onResult: (Boolean) -> Unit) {
        val prompt = text.trim()
        if (prompt.isEmpty()) {
            onResult(false)
            return
        }
        if (!requireSessionOperate()) {
            onResult(false)
            return
        }
        val client = api()
        if (client == null) {
            updateState { it.copy(globalError = "Not connected.") }
            onResult(false)
            return
        }
        val openId = state().openThreadId
        if (openId == null) {
            updateState { it.copy(globalError = "No thread is open.") }
            onResult(false)
            return
        }
        val config = state().threadSnapshot?.thread?.config
            ?: state().snapshot?.threads?.firstOrNull { it.id == openId }?.config
        if (config == null) {
            updateState {
                it.copy(globalError = AppSession.SEND_MISSING_THREAD_CONFIG_MESSAGE)
            }
            onResult(false)
            return
        }
        val threadGen = owner.threadGeneration
        val job = scope.launch {
            updateState { it.copy(isSending = true) }
            try {
                withContext(ioDispatcher) {
                    client.sendThreadInput(
                        threadId = openId,
                        prompt = prompt,
                        config = config,
                    )
                }
                if (!isForeground() || !owner.isCurrentThread(threadGen, openId)) {
                    updateState { it.copy(isSending = false) }
                    // Stale/background: no late success mutation.
                    return@launch
                }
                updateState { it.copy(isSending = false) }
                onResult(true)
            } catch (e: CancellationException) {
                updateState { it.copy(isSending = false) }
                // Cancellation creates no user error and no failure callback.
                throw e
            } catch (e: RemoteClientException) {
                updateState { it.copy(isSending = false) }
                if (isForeground()) {
                    handleApiException(e)
                    if (
                        RemoteMutationClassification.requestMayHaveCommitted(e, mutation = true) &&
                        owner.isCurrentThread(threadGen, openId)
                    ) {
                        // Outcome unknown: resync authoritatively once; never replay the send.
                        requestAuthoritativeRefresh()
                    }
                }
                onResult(false)
            } catch (e: Exception) {
                updateState { it.copy(isSending = false) }
                if (isForeground()) updateState { it.copy(globalError = e.message) }
                onResult(false)
            }
        }
        jobs.replace(SessionLifecycleJobs.SEND, job)
    }

    fun interruptOpenThread() {
        if (!requireSessionOperate()) return
        val client = api() ?: return
        val openId = state().openThreadId ?: return
        val threadGen = owner.threadGeneration
        val job = scope.launch {
            try {
                withContext(ioDispatcher) { client.interruptThread(openId) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: RemoteClientException) {
                if (!isForeground() || !owner.isCurrentThread(threadGen, openId)) return@launch
                handleApiException(e)
                if (RemoteMutationClassification.requestMayHaveCommitted(e, mutation = true)) {
                    // Outcome unknown: resync authoritatively once; never replay the interrupt.
                    requestAuthoritativeRefresh()
                }
            } catch (e: Exception) {
                if (!isForeground() || !owner.isCurrentThread(threadGen, openId)) return@launch
                updateState { it.copy(globalError = e.message) }
            }
        }
        jobs.replace(SessionLifecycleJobs.INTERRUPT, job)
    }

    suspend fun loadThreadHistory(id: String, openGeneration: Int): Boolean {
        val client = api() ?: return false
        val startedSeq = currentEventSeq()
        try {
            val history = loadThreadHistoryTail(
                api = client,
                threadId = id,
                targetTimelineEntryCount = 40,
                bounded = boundedHistoryReads(),
                ioDispatcher = ioDispatcher,
            )
            if (!isForeground()) return false
            if (state().openThreadId != id) return false
            check(!GlobalCursorPolicy.ordinaryThreadHistoryAdvancesGlobalCursor())

            val completion = hydration.completeHistory(
                threadId = id,
                openGeneration = openGeneration,
                snapshotSeq = history.snapshotSeq,
            )
            if (completion == null) return false
            if (completion.coverageLost) {
                // The buffered replay lost its oldest coverage (count/byte
                // eviction or age expiry at completion); install what survived
                // but request the authoritative pass that repairs it.
                requestAuthoritativeRefresh()
            }

            // Hydrate: hide pending_request; recover open requests; seed context/openTurn
            // from authoritative history (same path as resync commit).
            val hydrated = hydrateFromHistory(history = history, threadId = id)
            history.thread.takeIf { it.id == id }?.let { catalog?.pinThreadRow(it, startedSeq) }

            updateState {
                it.copy(
                    threadSnapshot = history,
                    threadItems = hydrated.visible,
                    threadOlderCursor = history.runtimeNextCursor,
                    threadLoadState = if (hydrated.visible.isEmpty()) {
                        AppSession.LoadState.Empty
                    } else {
                        AppSession.LoadState.Loaded
                    },
                    threadLoadError = null,
                    threadDomain = hydrated.domain,
                )
            }
            // Replay buffered live events exactly once after history install.
            for (frame in completion.replay) {
                applyLiveEvent(frame.event, frame.seq.toLong())
            }
            return true
        } catch (e: CancellationException) {
            if (!isForeground()) {
                hydration.parkForBackground()
            } else {
                hydration.terminateFailed()
            }
            throw e
        } catch (e: RemoteClientException) {
            hydration.terminateFailed()
            if (state().openThreadId != id || !isForeground()) return false
            if (e.isUnauthorized) {
                handleApiException(e)
            } else {
                updateState {
                    it.copy(
                        threadLoadState = AppSession.LoadState.Failed,
                        threadLoadError = e.message,
                    )
                }
            }
            return false
        } catch (e: Exception) {
            hydration.terminateFailed()
            if (state().openThreadId != id || !isForeground()) return false
            updateState {
                it.copy(
                    threadLoadState = AppSession.LoadState.Failed,
                    threadLoadError = e.message,
                )
            }
            return false
        }
    }

    suspend fun fetchThreadHistory(id: String): RemoteThreadSnapshot {
        val client = api()
            ?: throw RemoteClientException("No API client.", status = 500, code = "no_client")
        return loadThreadHistoryTail(
            api = client,
            threadId = id,
            targetTimelineEntryCount = 40,
            bounded = boundedHistoryReads(),
            ioDispatcher = ioDispatcher,
        )
    }

    /**
     * Loads one older `ct1.` completed-turn page and merges it into the open
     * thread's snapshot. Previously loaded older turns are preserved by
     * `(startedAt, endedAt)`; anchorless turns are never dropped.
     */
    fun loadOlderCompletedTurns() {
        if (!requireSessionRead()) return
        val client = api() ?: return
        val current = state()
        val openId = current.openThreadId ?: return
        val snapshot = current.threadSnapshot ?: return
        val cursor = snapshot.completedTurnsNextCursor ?: return
        if (isLoadingOlderTurns) return
        val threadGen = owner.threadGeneration
        val job = scope.launch {
            isLoadingOlderTurns = true
            try {
                val page = loadOlderCompletedTurns(
                    api = client,
                    threadId = openId,
                    cursor = cursor,
                    limit = OLDER_TURNS_PAGE_LIMIT,
                    ioDispatcher = ioDispatcher,
                )
                if (!isForeground() || !owner.isCurrentThread(threadGen, openId)) return@launch
                updateState { s ->
                    val loaded = s.threadSnapshot ?: return@updateState s
                    s.copy(threadSnapshot = appendOlderTurns(loaded, page.turns, page.completedTurnsNextCursor))
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: RemoteClientException) {
                if (isForeground() && owner.isCurrentThread(threadGen, openId)) handleApiException(e)
            } finally {
                isLoadingOlderTurns = false
            }
        }
        jobs.replace(SessionLifecycleJobs.THREAD_PAGE, job)
    }

    private fun boundedHistoryReads(): Boolean {
        val current = state().catalog
        return current.negotiated && !current.legacy
    }

    @Volatile
    private var isLoadingOlderTurns: Boolean = false

    fun beginOpenForResync(threadId: String): Int {
        owner.beginOpenThread(threadId)
        return hydration.beginOpen(threadId)
    }

    fun parkHydrationForBackground() {
        hydration.parkForBackground()
    }

    fun restartHydrationIfNeeded() {
        if (!hydration.needsHistoryRestart()) return
        val id = state().openThreadId ?: return
        val gen = hydration.currentGeneration
        hydration.noteHistoryRestarting()
        updateState {
            if (it.threadLoadState == AppSession.LoadState.Failed) {
                it.copy(threadLoadState = AppSession.LoadState.Loading, threadLoadError = null)
            } else {
                it
            }
        }
        val job = scope.launch { loadThreadHistory(id, openGeneration = gen) }
        jobs.replace(SessionLifecycleJobs.THREAD_HISTORY, job)
    }

    private fun requireSessionRead(): Boolean {
        val scopes = state().profile?.scopes.orEmpty()
        if (RemoteAccessScopes.canRead(scopes)) return true
        updateState { it.copy(globalError = SessionPolicies.MISSING_SCOPE_READ_MESSAGE) }
        return false
    }

    private fun requireSessionOperate(): Boolean {
        val scopes = state().profile?.scopes.orEmpty()
        if (RemoteAccessScopes.canOperate(scopes)) return true
        updateState { it.copy(globalError = SessionPolicies.MISSING_SCOPE_OPERATE_MESSAGE) }
        return false
    }

}
