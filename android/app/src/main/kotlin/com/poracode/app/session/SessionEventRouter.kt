package com.poracode.app.session

import com.poracode.app.model.PersistedRuntimeItem
import com.poracode.app.model.RemoteJson
import com.poracode.app.model.RemoteWebSocketServerMessage
import com.poracode.app.model.asObjectOrNull
import com.poracode.app.model.obj
import com.poracode.app.model.string
import com.poracode.app.protocol.RuntimeEventReducer
import com.poracode.app.protocol.ThreadHydrationCoordinator
import com.poracode.app.protocol.ThreadRuntimeDomainState
import com.poracode.app.session.replay.HostReplayCacheUi
import com.poracode.app.session.replay.ReplayOutcome
import com.poracode.app.session.replay.SequencedEventApplier
import com.poracode.app.session.replay.SequencedReplayController
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/**
 * Routes live WebSocket events into thread items + domain state.
 * Screens never own decoding.
 */
class SessionEventRouter(
    private val scope: CoroutineScope,
    private val jobs: SessionLifecycleJobs,
    private val hydration: ThreadHydrationCoordinator,
    private val isForeground: () -> Boolean,
    private val allowsLiveEvents: () -> Boolean,
    private val openThreadGeneration: () -> Int,
    private val state: () -> AppSession.UiState,
    private val updateState: ((AppSession.UiState) -> AppSession.UiState) -> Unit,
    private val setLastSeenSeq: (Int) -> Unit,
    private val refreshSnapshot: () -> Unit,
    private val refreshOpenThreadMetadata: suspend () -> Unit,
    private val api: () -> com.poracode.app.transport.RemoteApiGateway?,
    private val ioDispatcher: CoroutineDispatcher,
    private val handleUnauthorized: (String?) -> Unit,
    private val requestResync: (String) -> Unit = {},
    private val richChatEventSink: (Int, JsonElement) -> Unit = { _, _ -> },
    private val replayController: SequencedReplayController = SequencedReplayController(
        com.poracode.app.session.replay.HostStateCache(),
    ),
    private val onReplaySideEffects: (ReplayOutcome) -> Unit = {},
    private val applyGitInterests: (List<com.poracode.app.protocol.git.GitInterest>) -> Unit = {},
    private val heavyReviewTarget: () -> HeavyReviewTarget? = { null },
) {
    private var lastSeededSnapshotSeq: Int? = null
    fun handleServerMessage(message: RemoteWebSocketServerMessage) {
        seedFromLatestSnapshotIfNeeded()
        if (!allowsLiveEvents()) {
            if (message is RemoteWebSocketServerMessage.ResyncRequired) {
                setLastSeenSeq(message.seq)
            }
            return
        }
        when (message) {
            is RemoteWebSocketServerMessage.Ready -> Unit
            is RemoteWebSocketServerMessage.Event -> {
                // The seven sequenced replay transitions own strict
                // apply-before-cursor semantics: apply transactionally first,
                // and only advance the cursor after a successful apply. A stale
                // host or failed decode never mutates state or advances.
                val replayOutcome = replayController.handle(message.event)
                if (replayOutcome.handled) {
                    if (replayOutcome.applied) {
                        mirrorReplayIntoState(replayOutcome)
                        onReplaySideEffects(replayOutcome)
                        richChatEventSink(message.seq, message.event)
                        setLastSeenSeq(message.seq)
                    }
                    return
                }
                richChatEventSink(message.seq, message.event)
                val openId = state().openThreadId
                val gen = openThreadGeneration()
                if (openId != null && hydration.isHydrating) {
                    val batches = RuntimeEventReducer.collectRuntimeEvents(message.event)
                    val targetsOpen = batches.any { it.threadId == openId } ||
                        eventTargetsThread(message.event, openId) ||
                        (batches.isEmpty() && legacyFlatAffectsOpenThread(message.event))
                    if (targetsOpen) {
                        val disposition = hydration.dispositionForLive(
                            eventThreadId = openId,
                            openThreadId = openId,
                            openGeneration = gen,
                        )
                        if (disposition == ThreadHydrationCoordinator.LiveDisposition.Buffer) {
                            val buffered = hydration.bufferFrame(
                                seq = message.seq,
                                threadId = openId,
                                event = message.event,
                                openGeneration = gen,
                            )
                            if (buffered ==
                                ThreadHydrationCoordinator.BufferResult.Overflow
                            ) {
                                requestResync("hydration_buffer_overflow")
                                return
                            }
                            if (RuntimeEventReducer.shouldRefreshShell(message.event)) {
                                scheduleShellRefresh()
                            }
                            setLastSeenSeq(message.seq)
                            return
                        }
                    }
                }
                applyLiveEvent(message.event)
                setLastSeenSeq(message.seq)
            }
            is RemoteWebSocketServerMessage.ResyncRequired -> {
                setLastSeenSeq(message.seq)
            }
            is RemoteWebSocketServerMessage.Pong,
            is RemoteWebSocketServerMessage.TerminalOutput,
            is RemoteWebSocketServerMessage.Unknown,
            -> Unit
        }
    }

    fun applyLiveEvent(event: JsonElement) {
        val batches = RuntimeEventReducer.collectRuntimeEvents(event)
        if (batches.isNotEmpty()) {
            updateState { s ->
                val openId = s.openThreadId
                var items = s.threadItems.toMutableList()
                var loadState = s.threadLoadState
                var domain = s.threadDomain
                for (batch in batches) {
                    if (openId == null || batch.threadId != openId) continue
                    domain = RuntimeEventReducer.applyBatch(
                        events = batch.events,
                        threadId = batch.threadId,
                        items = items,
                        domain = domain,
                    )
                    if (loadState == AppSession.LoadState.Empty ||
                        loadState == AppSession.LoadState.Loading
                    ) {
                        loadState = if (items.isEmpty()) {
                            AppSession.LoadState.Empty
                        } else {
                            AppSession.LoadState.Loaded
                        }
                    }
                }
                s.copy(
                    threadItems = items,
                    threadLoadState = loadState,
                    threadDomain = domain,
                )
            }
            if (RuntimeEventReducer.shouldRefreshOpenThreadMetadata(event)) {
                scheduleOpenThreadMetadataRefresh()
            }
            if (RuntimeEventReducer.shouldRefreshShell(event)) {
                scheduleShellRefresh()
            }
            return
        }

        val objectMap = event.asObjectOrNull() ?: return
        val type = objectMap.string("type")

        if (type == "remote-projects-changed" || type == "remote-threads-changed") {
            scheduleShellRefresh()
            return
        }

        val openId = state().openThreadId
        if (openId == null) {
            if (type == "thread-state" ||
                type?.startsWith("turn.") == true ||
                type?.startsWith("session.") == true ||
                type?.startsWith("item.") == true ||
                type?.startsWith("request.") == true
            ) {
                scheduleShellRefresh()
            }
            return
        }
        val threadId = objectMap.string("threadId")
            ?: objectMap.obj("thread")?.string("id")
        if (threadId != null && threadId != openId) {
            if (type == "thread-state" || type == "remote-threads-changed") {
                scheduleShellRefresh()
            }
            return
        }

        val itemObject = objectMap.obj("item")
            ?: objectMap.obj("runtimeItem")
        if (itemObject != null) {
            decodeRuntimeItem(itemObject)?.let { upsertThreadItem(it) }
        }

        val itemId = objectMap.string("itemId")
        val stream = objectMap.string("stream")
        val delta = objectMap.string("delta") ?: objectMap.string("text")
        if (itemId != null && stream != null && delta != null) {
            updateState { s ->
                val items = s.threadItems.toMutableList()
                RuntimeEventReducer.apply(
                    RuntimeEventReducer.contentDeltaEvent(
                        threadId = openId,
                        itemId = itemId,
                        stream = stream,
                        delta = delta,
                        raw = objectMap,
                    ),
                    items,
                )
                s.copy(
                    threadItems = items,
                    threadLoadState = if (s.threadLoadState == AppSession.LoadState.Empty) {
                        AppSession.LoadState.Loaded
                    } else {
                        s.threadLoadState
                    },
                )
            }
        }

        if (type == "thread-state" ||
            type?.startsWith("turn.") == true ||
            type?.startsWith("session.") == true ||
            type == "error" ||
            type == "warning" ||
            type?.startsWith("request.") == true
        ) {
            scheduleOpenThreadMetadataRefresh()
            scheduleShellRefresh()
        }
    }

    fun scheduleShellRefresh() {
        if (!isForeground()) return
        val job = scope.launch {
            delay(250)
            if (isForeground()) refreshSnapshot()
        }
        jobs.replace(SessionLifecycleJobs.SHELL_REFRESH, job)
    }

    fun scheduleOpenThreadMetadataRefresh() {
        if (!isForeground()) return
        val job = scope.launch {
            delay(250)
            if (isForeground()) refreshOpenThreadMetadata()
        }
        jobs.replace(SessionLifecycleJobs.THREAD_META, job)
    }

    suspend fun refreshOpenThreadMetadataImpl() {
        val client = api() ?: return
        val openId = state().openThreadId ?: return
        if (!com.poracode.app.protocol.RemoteAccessScopes.canRead(
                state().profile?.scopes.orEmpty(),
            )
        ) {
            return
        }
        try {
            val history = withContext(ioDispatcher) {
                client.threadHistory(threadId = openId, targetTimelineEntryCount = 1)
            }
            if (!isForeground() || state().openThreadId != openId) return
            updateState { it.copy(threadSnapshot = history) }
            scheduleShellRefresh()
        } catch (e: CancellationException) {
            throw e
        } catch (e: com.poracode.app.model.RemoteClientException) {
            if (e.isUnauthorized) handleUnauthorized(e.message)
        } catch (_: Exception) {
            // Ignore transient failures.
        }
    }

    private fun eventTargetsThread(event: JsonElement, openId: String): Boolean {
        val objectMap = event.asObjectOrNull() ?: return false
        val threadId = objectMap.string("threadId")
            ?: objectMap.obj("thread")?.string("id")
        return threadId == openId
    }

    private fun legacyFlatAffectsOpenThread(event: JsonElement): Boolean {
        val objectMap = event.asObjectOrNull() ?: return false
        return objectMap.obj("item") != null ||
            objectMap.obj("runtimeItem") != null ||
            (objectMap.string("itemId") != null && objectMap.string("stream") != null)
    }

    private fun decodeRuntimeItem(obj: JsonObject): PersistedRuntimeItem? =
        runCatching {
            RemoteJson.decodeFromJsonElement(PersistedRuntimeItem.serializer(), obj)
        }.getOrNull()

    private fun upsertThreadItem(item: PersistedRuntimeItem) {
        updateState { s ->
            val items = s.threadItems.toMutableList()
            val index = items.indexOfFirst { it.id == item.id }
            if (index >= 0) {
                val existing = items[index]
                val mergedStreams = existing.streams.toMutableMap()
                for ((k, v) in item.streams) {
                    val prev = mergedStreams[k]
                    mergedStreams[k] = if (prev == null || v.length >= prev.length) v else prev
                }
                val nextState = when {
                    item.state == "completed" || existing.state == "completed" -> "completed"
                    else -> item.state
                }
                items[index] = existing.copy(
                    streams = mergedStreams,
                    state = nextState,
                    payload = RuntimeEventReducer.mergePayload(existing.payload, item.payload),
                    type = if (existing.type == "unknown" || existing.type.isEmpty()) {
                        item.type
                    } else {
                        existing.type
                    },
                )
            } else {
                items.add(item)
            }
            s.copy(
                threadItems = items,
                threadLoadState = if (s.threadLoadState == AppSession.LoadState.Empty) {
                    AppSession.LoadState.Loaded
                } else {
                    s.threadLoadState
                },
            )
        }
    }

    private fun seedFromLatestSnapshotIfNeeded() {
        val snap = state().snapshot ?: return
        if (lastSeededSnapshotSeq == snap.snapshotSeq) return
        replayController.seedFromShell(snap, authoritative = false)
        lastSeededSnapshotSeq = snap.snapshotSeq
        recomputeGitInterests()
    }

    /**
     * Recompute the merged Git-interest set (passive targets plus any heavy-review
     * variant a visible surface owns) and push it to the single authenticated
     * socket. Called on snapshot seed and whenever the heavy-review target or the
     * selected host/thread changes. Dedup/flush-on-ready is handled by the socket;
     * there is no second socket and no retry loop here.
     */
    internal fun recomputeGitInterests() {
        val snap = state().snapshot
        val interests = GitInterestComposer.compose(
            threads = snap?.threads.orEmpty(),
            selectedThreadId = state().openThreadId,
            connectionId = state().hostCatalog.selectedConnectionId,
            heavyReview = heavyReviewTarget(),
        )
        applyGitInterests(interests)
    }

    /** Exact-host binding; a host change clears the whole cache (no leakage). */
    fun bindReplayHost(hostId: String) {
        val cleared = replayController.bindHost(hostId)
        if (cleared) {
            lastSeededSnapshotSeq = null
            updateState { it.copy(hostReplay = HostReplayCacheUi.EMPTY) }
        }
    }

    /** Clear all host caches (unpair / host switch to a brand-new identity). */
    fun clearReplayCache() {
        replayController.clear()
        lastSeededSnapshotSeq = null
        updateState { it.copy(hostReplay = HostReplayCacheUi.EMPTY) }
    }

    /** Authoritative resync transaction: force-replace Git cache from the shell. */
    fun seedReplayAuthoritative(shell: com.poracode.app.model.RemoteShellSnapshot) {
        replayController.seedFromShell(shell, authoritative = true)
        lastSeededSnapshotSeq = shell.snapshotSeq
    }

    /**
     * Mirror replay-cache effects into visible [AppSession.UiState]: thread-list
     * and rich-chat Git summaries, agent-status projection, and coalesced Git
     * refresh. Transcript clears / fresh terminal baselines are delivered through
     * [onReplaySideEffects] so terminal/rich-chat controllers own their buffers.
     */
    private fun mirrorReplayIntoState(outcome: ReplayOutcome) {
        val replay = replayController.state
        updateState { s ->
            val cache = HostReplayCacheUi(
                gitSummariesByThread = replay.gitSummaries,
                agentMergedStatuses = replay.mergedByUpdate,
                agentWindowsStatuses = replay.windowsList,
                agentWindowsLoaded = replay.windowsLoaded,
                agentWslStatuses = replay.wslList,
                agentWslLoaded = replay.wslLoaded,
                gitStateRevision = replay.gitState.revision,
            )
            var next = s.copy(hostReplay = cache)
            val openId = s.openThreadId
            if (outcome.resetThreadIds.contains(openId)) {
                next = next.copy(
                    threadItems = emptyList(),
                    threadLoadState = AppSession.LoadState.Loading,
                    threadDomain = ThreadRuntimeDomainState(),
                )
            }
            next
        }
    }
}
