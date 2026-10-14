package com.poracode.app.session.richchat

import com.poracode.app.chat.RichFollowUpQueueEnvelope
import com.poracode.app.chat.RichPendingSteerEnvelope
import com.poracode.app.chat.RichReducer
import com.poracode.app.chat.RichRequestQueue
import com.poracode.app.chat.RichRuntimeEvent
import com.poracode.app.model.ThreadConfig
import com.poracode.app.transport.richchat.RequestResolution
import com.poracode.app.transport.richchat.ThreadGoalUpdate
import com.poracode.app.transport.richchat.ThreadSteerInput
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject

/** Selected-thread state machine. Live events and HTTP history share one rich domain reducer. */
class RichChatController(
    internal val session: StateFlow<RichChatHostLease?>,
    private val gateway: RichChatSessionGateway,
    private val lifecycle: ForegroundOperationRegistry = ForegroundOperationRegistry(),
) : RichChatEventSink {
    internal val mutableState = MutableStateFlow(RichChatControllerState())
    val state: StateFlow<RichChatControllerState> = mutableState.asStateFlow()
    private val mutableSelection = MutableStateFlow<RichChatThreadLease?>(null)
    val selection: StateFlow<RichChatThreadLease?> = mutableSelection.asStateFlow()
    internal val owner = RichChatOperationOwner()
    private val sendMutex = Mutex()

    /** Seam for the queue-operation and history extension files (size-gate split). */
    internal val sessionGateway: RichChatSessionGateway
        get() = gateway
    private var threadGeneration = 0L
    internal val frameBuffer = RichChatLiveFrameBuffer()

    /**
     * Fences older-history paging against authoritative installs, truncation
     * and selection changes: a page requested before the transcript changed
     * must never publish (or move the cursor backwards) afterwards.
     */
    internal val olderPagingEpoch = java.util.concurrent.atomic.AtomicLong(0L)

    internal fun invalidateOlderPaging() {
        olderPagingEpoch.incrementAndGet()
    }

    @Synchronized
    fun selectThread(threadId: String): RichChatOperationResult<RichChatThreadLease> {
        if (threadId.isEmpty()) return rejected(RichChatOperationFailure.InvalidRequest)
        if (!lifecycle.isForeground) {
            return rejected(RichChatOperationFailure.Backgrounded)
        }
        val (host, failure) = session.currentLease(RichChatCapability.Read)
        if (failure != null || host == null) return rejected(failure!!)
        threadGeneration += 1L
        val lease = RichChatThreadLease(host, threadId, threadGeneration)
        owner.invalidateAll()
        invalidateOlderPaging()
        frameBuffer.reset()
        mutableSelection.value = lease
        mutableState.value = RichChatControllerState(
            selection = lease,
            loadPhase = RichChatLoadPhase.Loading,
        )
        return RichChatOperationResult.Success(lease)
    }

    @Synchronized
    fun closeThread() {
        threadGeneration += 1L
        owner.invalidateAll()
        invalidateOlderPaging()
        frameBuffer.reset()
        mutableSelection.value = null
        mutableState.value = RichChatControllerState()
    }

    fun reconcileSession() {
        val selected = mutableSelection.value ?: return
        val current = session.value
        if (current == null || current.key != selected.host.key || !current.ready) closeThread()
    }

    /** Loads the next older runtime-item and/or completed-turn page. */
    suspend fun loadOlder(): RichChatOperationResult<Int> = loadOlderPage()

    override fun apply(lease: RichChatThreadLease, event: RichRuntimeEvent): Boolean {
        return applyServerFrame(lease, sequence = null, events = listOf(event))
    }

    @Synchronized
    fun applyServerFrame(
        lease: RichChatThreadLease,
        sequence: Int?,
        events: List<RichRuntimeEvent>,
        pendingSteer: RichPendingSteerEnvelope? = null,
        followUpQueue: RichFollowUpQueueEnvelope? = null,
    ): Boolean {
        if (!lifecycle.isForeground || !isSelected(lease) || !session.isCurrent(lease.host)) {
            return false
        }
        if (events.isEmpty() && pendingSteer == null && followUpQueue == null) return false
        if (events.any { it.threadKey != lease.key } ||
            pendingSteer?.let { it.threadKey != lease.key } == true ||
            followUpQueue?.let { it.threadKey != lease.key } == true
        ) {
            return false
        }
        if (frameBuffer.isStale(sequence)) {
            return false
        }
        val frame = RichChatLiveFrame(sequence, events, pendingSteer, followUpQueue)
        var accepted = false
        val truncated = events.any { it is RichRuntimeEvent.RuntimeTruncated }
        mutableState.update { current ->
            val transcript = current.transcript
            if (transcript == null) {
                frameBuffer.buffer(frame)
                accepted = true
                return@update current.copy(
                    needsAuthoritativeRefresh = current.needsAuthoritativeRefresh ||
                        frameBuffer.overflow,
                )
            }
            if (OP_HISTORY in current.activeOperations) frameBuffer.buffer(frame)
            accepted = true
            val next = reduceLiveFrame(transcript, frame)
            // Missing checkpoint on a loaded transcript → one authoritative
            // catchup via the existing flag. Deduped (boolean OR) and bounded
            // downstream by MAX_CONSECUTIVE_REFRESHES; the install path clears
            // it on success and replays buffered frames with the snapshotSeq
            // filter, so no loops and no lost newer events. Old replays never
            // reach here (sequence <= lastAcceptedSequence dropped above).
            // While OP_HISTORY is active the frame is also buffered, and the
            // post-install replay recomputes this flag from the fresh window,
            // so a stale-window false positive is discarded, not re-requested.
            val truncationCatchup = frameNeedsTruncationCatchup(next, frame)
            current.copy(
                transcript = next,
                // A truncate renumbers/removes turn rows: the held `ct1.`
                // continuation is dropped and in-flight older pages are fenced.
                olderTurnsCursor = if (truncated) null else current.olderTurnsCursor,
                needsAuthoritativeRefresh = current.needsAuthoritativeRefresh ||
                    frameBuffer.overflow ||
                    truncationCatchup,
            )
        }
        if (accepted && truncated) invalidateOlderPaging()
        if (accepted) frameBuffer.markAccepted(sequence)
        return accepted
    }

    fun applyPendingSteer(
        lease: RichChatThreadLease,
        envelope: RichPendingSteerEnvelope,
    ): Boolean = applyServerFrame(lease, sequence = null, events = emptyList(), envelope)

    suspend fun send(
        prompt: String,
        config: ThreadConfig? = null,
        segments: JsonArray? = null,
        userMessageItemId: String? = null,
    ): RichChatOperationResult<Unit> = sendMutex.withLock {
        val trimmed = prompt.trim()
        if (trimmed.isEmpty()) return@withLock rejected(RichChatOperationFailure.InvalidRequest)
        val effectiveConfig = config ?: mutableState.value.config
            ?: return@withLock rejected(RichChatOperationFailure.InvalidRequest)
        mutate(OP_SEND, RichChatCapability.Operate) { lease ->
            gateway.send(
                lease.host,
                lease.threadId,
                trimmed,
                effectiveConfig,
                segments,
                userMessageItemId,
            )
        }
    }

    suspend fun interrupt(): RichChatOperationResult<Unit> =
        mutate(OP_INTERRUPT, RichChatCapability.Operate) { gateway.interrupt(it.host, it.threadId) }

    suspend fun truncate(itemId: String): RichChatOperationResult<Unit> {
        val result = mutate(OP_TRUNCATE, RichChatCapability.Operate) {
            if (itemId.isEmpty()) throw RichChatGatewayException(400, "invalid_request", false)
            gateway.truncate(it.host, it.threadId, itemId)
        }
        if (result is RichChatOperationResult.Success) {
            // The host removed/renumbered turn rows; the held continuation must
            // not be used again, any in-flight older page is fenced, and one
            // authoritative read reinstates the tail with a fresh cursor.
            invalidateOlderPaging()
            mutableState.update {
                it.copy(olderTurnsCursor = null, needsAuthoritativeRefresh = true)
            }
        }
        return result
    }

    suspend fun updateGoal(update: ThreadGoalUpdate): RichChatOperationResult<Unit> =
        mutate(OP_GOAL, RichChatCapability.Operate) {
            gateway.updateGoal(it.host, it.threadId, update)
        }

    suspend fun setSteer(input: ThreadSteerInput): RichChatOperationResult<Unit> =
        mutate(OP_STEER, RichChatCapability.Operate) {
            gateway.setSteer(it.host, it.threadId, input)
        }

    suspend fun clearSteer(): RichChatOperationResult<Unit> =
        mutate(OP_STEER, RichChatCapability.Operate) {
            gateway.clearSteer(it.host, it.threadId)
        }

    suspend fun threadCommand(command: JsonObject): RichChatOperationResult<Unit> =
        mutate(OP_COMMAND, RichChatCapability.Operate) {
            gateway.threadCommand(it.host, it.threadId, command)
        }

    /**
     * Delivers the remote thread-close mutation exactly once. On a confirmed
     * delivery the local selection is torn down only when this thread is still
     * the active one; an ambiguous outcome defers to the authoritative feed.
     */
    suspend fun closeThreadRuntime(): RichChatOperationResult<Unit> {
        val prepared = prepare(RichChatCapability.Operate) ?: return currentRejection()
        val token = owner.begin(OP_CLOSE, prepared)
        markActive(OP_CLOSE)
        return runOperation(prepared, token, RichChatCapability.Operate, true) {
            gateway.closeThread(prepared.host, prepared.threadId)
            if (!canPublish(prepared, token)) return@runOperation RichChatOperationResult.Stale
            closeThread()
            RichChatOperationResult.Success(Unit)
        }
    }

    suspend fun resolveRequest(resolution: RequestResolution): RichChatOperationResult<Unit> =
        mutate(OP_REQUEST, RichChatCapability.ResolveRequests) { lease ->
            gateway.resolveRequest(lease.host, lease.threadId, resolution)
            if (isSelected(lease)) {
                mutableState.update { current ->
                    val transcript = current.transcript ?: return@update current
                    val id = transcript.openRequests.firstOrNull {
                        it.id.jsonValue == resolution.requestId
                    }?.id ?: return@update current
                    current.copy(
                        transcript = transcript.copy(
                            openRequests = RichRequestQueue.resolve(transcript.openRequests, id),
                        ),
                    )
                }
            }
        }

    @Synchronized
    fun enterBackground() {
        lifecycle.enterBackground()
        owner.invalidateAll()
        frameBuffer.reset()
        val selected = mutableSelection.value?.let {
            threadGeneration += 1L
            it.copy(generation = threadGeneration)
        }
        mutableSelection.value = selected
        mutableState.update {
            it.copy(
                selection = selected,
                activeOperations = emptySet(),
                loadingOlder = false,
                failure = null,
                needsAuthoritativeRefresh = it.selection != null,
            )
        }
    }

    fun enterForeground() {
        lifecycle.enterForeground()
        if (mutableSelection.value != null) {
            mutableState.update { it.copy(needsAuthoritativeRefresh = true) }
        }
    }

    internal suspend fun mutate(
        kind: String,
        capability: RichChatCapability,
        operation: suspend (RichChatThreadLease) -> Unit,
    ): RichChatOperationResult<Unit> {
        val prepared = prepare(capability) ?: return currentRejection()
        val token = owner.begin(kind, prepared)
        markActive(kind)
        return runOperation(prepared, token, capability, true) {
            operation(prepared)
            if (!canPublish(prepared, token)) return@runOperation RichChatOperationResult.Stale
            clearActive(kind)
            RichChatOperationResult.Success(Unit)
        }
    }

    internal suspend fun <T> runOperation(
        lease: RichChatThreadLease,
        ownerToken: RichChatOperationOwner.Token,
        capability: RichChatCapability,
        mutation: Boolean,
        operation: suspend () -> RichChatOperationResult<T>,
    ): RichChatOperationResult<T> = try {
        lifecycle.run { lifecycleToken ->
            val result = operation()
            if (!lifecycle.isCurrent(lifecycleToken)) RichChatOperationResult.Stale else result
        }
    } catch (error: CancellationException) {
        if (canPublish(lease, ownerToken)) {
            if (ownerToken.kind == OP_HISTORY) {
                releaseHistoryFrameBuffer()
                mutableState.update {
                    it.copy(
                        loadPhase = historySettledPhase(
                            it.transcript,
                            RichChatLoadPhase.Idle,
                        ),
                    )
                }
            }
            clearActive(ownerToken.kind)
        }
        throw error
    } catch (_: RichChatBackgroundException) {
        rejected(RichChatOperationFailure.Backgrounded)
    } catch (error: Exception) {
        if (!canPublish(lease, ownerToken)) {
            RichChatOperationResult.Stale
        } else {
            if (ownerToken.kind == OP_HISTORY) releaseHistoryFrameBuffer()
            val failure = error.asRichChatFailure(capability, mutation)
            mutableState.update {
                it.copy(
                    activeOperations = it.activeOperations - ownerToken.kind,
                    loadingOlder = if (ownerToken.kind == OP_OLDER) false else it.loadingOlder,
                    loadPhase = if (ownerToken.kind == OP_HISTORY) {
                        historySettledPhase(it.transcript, RichChatLoadPhase.Failed)
                    } else {
                        it.loadPhase
                    },
                    failure = failure,
                    needsAuthoritativeRefresh = it.needsAuthoritativeRefresh ||
                        (failure as? RichChatOperationFailure.Remote)?.requestMayHaveCommitted == true,
                )
            }
            RichChatOperationResult.Failed(failure)
        }
    }

    internal fun prepare(capability: RichChatCapability): RichChatThreadLease? {
        if (!lifecycle.isForeground) {
            rejected<Unit>(RichChatOperationFailure.Backgrounded)
            return null
        }
        val (host, failure) = session.currentLease(capability)
        if (failure != null || host == null) {
            rejected<Unit>(failure!!)
            return null
        }
        val selected = mutableSelection.value
        if (selected == null || selected.host.key != host.key) {
            rejected<Unit>(RichChatOperationFailure.NoThread)
            return null
        }
        return selected.copy(host = host)
    }

    internal fun currentRejection(): RichChatOperationResult.Failed =
        RichChatOperationResult.Failed(
            mutableState.value.failure ?: RichChatOperationFailure.NoThread,
        )

    internal fun canPublish(
        lease: RichChatThreadLease,
        token: RichChatOperationOwner.Token,
    ): Boolean = lifecycle.isForeground &&
        owner.isCurrent(token) &&
        isSelected(lease) &&
        session.isCurrent(lease.host)

    internal fun isSelected(lease: RichChatThreadLease): Boolean {
        val current = mutableSelection.value ?: return false
        return current.host.key == lease.host.key &&
            current.threadId == lease.threadId &&
            current.generation == lease.generation
    }

    internal fun markActive(kind: String) {
        mutableState.update {
            it.copy(
                activeOperations = it.activeOperations + kind,
                failure = null,
                loadPhase = if (kind == OP_HISTORY && it.transcript == null) {
                    RichChatLoadPhase.Loading
                } else {
                    it.loadPhase
                },
            )
        }
    }

    private fun clearActive(kind: String) {
        mutableState.update {
            it.copy(
                activeOperations = it.activeOperations - kind,
                loadingOlder = if (kind == OP_OLDER) false else it.loadingOlder,
                failure = null,
            )
        }
    }

    private fun <T> rejected(failure: RichChatOperationFailure): RichChatOperationResult<T> {
        mutableState.update { it.copy(failure = failure) }
        return RichChatOperationResult.Failed(failure)
    }

    private companion object {
        const val OP_SEND = "send"
        const val OP_INTERRUPT = "interrupt"
        const val OP_TRUNCATE = "truncate"
        const val OP_GOAL = "goal"
        const val OP_STEER = "steer"
        const val OP_COMMAND = "command"
        const val OP_CLOSE = "thread-close"
        const val OP_REQUEST = "request"
    }
}
