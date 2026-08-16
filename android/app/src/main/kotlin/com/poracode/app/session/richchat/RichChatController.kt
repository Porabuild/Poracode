package com.poracode.app.session.richchat

import com.poracode.app.chat.RichPendingSteerEnvelope
import com.poracode.app.chat.RichReducer
import com.poracode.app.chat.RichRequestQueue
import com.poracode.app.chat.RichRuntimeEvent
import com.poracode.app.chat.RichThreadState
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
    private val session: StateFlow<RichChatHostLease?>,
    private val gateway: RichChatSessionGateway,
    private val lifecycle: ForegroundOperationRegistry = ForegroundOperationRegistry(),
) : RichChatEventSink {
    private val mutableState = MutableStateFlow(RichChatControllerState())
    val state: StateFlow<RichChatControllerState> = mutableState.asStateFlow()
    private val mutableSelection = MutableStateFlow<RichChatThreadLease?>(null)
    val selection: StateFlow<RichChatThreadLease?> = mutableSelection.asStateFlow()
    private val owner = RichChatOperationOwner()
    private val sendMutex = Mutex()
    private var threadGeneration = 0L
    private val bufferedFrames = ArrayDeque<RichChatLiveFrame>()
    private var bufferedFrameOverflow = false
    private var lastAcceptedSequence: Int? = null

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
        resetLiveTracking()
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
        resetLiveTracking()
        mutableSelection.value = null
        mutableState.value = RichChatControllerState()
    }

    fun reconcileSession() {
        val selected = mutableSelection.value ?: return
        val current = session.value
        if (current == null || current.key != selected.host.key || !current.ready) closeThread()
    }

    suspend fun refreshHistory(): RichChatOperationResult<RichChatHistorySnapshot> {
        val prepared = prepare(RichChatCapability.Read) ?: return currentRejection()
        val token = owner.begin(OP_HISTORY, prepared)
        markActive(OP_HISTORY)
        return runOperation(prepared, token, RichChatCapability.Read, false) {
            val snapshot = gateway.history(prepared.host, prepared.threadId)
            if (!canPublish(prepared, token)) return@runOperation RichChatOperationResult.Stale
            if (!installAuthoritativeSnapshot(prepared, snapshot)) {
                return@runOperation RichChatOperationResult.Stale
            }
            RichChatOperationResult.Success(snapshot)
        }
    }

    suspend fun loadOlder(): RichChatOperationResult<Int> {
        val prepared = prepare(RichChatCapability.Read) ?: return currentRejection()
        val cursor = mutableState.value.olderCursor
            ?: return RichChatOperationResult.Success(0)
        val token = owner.begin(OP_OLDER, prepared)
        mutableState.update { it.copy(loadingOlder = true, failure = null) }
        return runOperation(prepared, token, RichChatCapability.Read, false) {
            val page = gateway.olderItems(prepared.host, prepared.threadId, cursor)
            if (!canPublish(prepared, token)) return@runOperation RichChatOperationResult.Stale
            var added = 0
            mutableState.update { current ->
                val live = current.transcript ?: return@update current
                val older = page.items.filterNot { it.id in live.itemsById }
                added = older.size
                val all = older + live.itemsInOrder
                val hydrated = RichThreadState.hydrate(
                    key = live.key,
                    items = all,
                    completedTurns = live.completedTurns,
                    contextUsage = live.contextUsage,
                ).copy(
                    pendingSteer = live.pendingSteer,
                    openTurn = live.openTurn,
                    lastUsageSpent = live.lastUsageSpent,
                    structuralVersion = live.structuralVersion + if (older.isEmpty()) 0 else 1,
                    syntheticErrorSequence = live.syntheticErrorSequence,
                )
                current.copy(
                    transcript = hydrated,
                    olderCursor = page.nextCursor,
                    loadingOlder = false,
                    loadPhase = if (all.isEmpty()) RichChatLoadPhase.Empty else RichChatLoadPhase.Loaded,
                )
            }
            RichChatOperationResult.Success(added)
        }
    }

    @Synchronized
    fun installAuthoritativeSnapshot(
        source: RichChatThreadLease,
        snapshot: RichChatHistorySnapshot,
    ): Boolean {
        if (!isSelected(source) || snapshot.key != source.key || !session.isCurrent(source.host)) {
            return false
        }
        val replay = bufferedFrames.toList()
        val needsFollowUp = bufferedFrameOverflow
        bufferedFrames.clear()
        bufferedFrameOverflow = false
        var transcript = snapshot.state
        replay.forEach { frame ->
            if (frame.sequence == null || frame.sequence > snapshot.snapshotSeq) {
                transcript = reduceLiveFrame(transcript, frame)
            }
        }
        lastAcceptedSequence = maxOf(
            snapshot.snapshotSeq,
            lastAcceptedSequence ?: snapshot.snapshotSeq,
        )
        mutableState.update {
            it.copy(
                transcript = transcript,
                snapshotSeq = snapshot.snapshotSeq,
                olderCursor = snapshot.olderCursor,
                config = snapshot.config,
                terminalScrollback = snapshot.terminalScrollback,
                activeOperations = it.activeOperations - OP_HISTORY,
                loadPhase = if (transcript.orderedItemIds.isEmpty()) {
                    RichChatLoadPhase.Empty
                } else {
                    RichChatLoadPhase.Loaded
                },
                failure = null,
                needsAuthoritativeRefresh = needsFollowUp,
            )
        }
        return true
    }

    override fun apply(lease: RichChatThreadLease, event: RichRuntimeEvent): Boolean {
        return applyServerFrame(lease, sequence = null, events = listOf(event))
    }

    @Synchronized
    fun applyServerFrame(
        lease: RichChatThreadLease,
        sequence: Int?,
        events: List<RichRuntimeEvent>,
        pendingSteer: RichPendingSteerEnvelope? = null,
    ): Boolean {
        if (!lifecycle.isForeground || !isSelected(lease) || !session.isCurrent(lease.host)) {
            return false
        }
        if (events.isEmpty() && pendingSteer == null) return false
        if (events.any { it.threadKey != lease.key } ||
            pendingSteer?.let { it.threadKey != lease.key } == true
        ) {
            return false
        }
        if (sequence != null && lastAcceptedSequence?.let { sequence <= it } == true) {
            return false
        }
        val frame = RichChatLiveFrame(sequence, events, pendingSteer)
        var accepted = false
        mutableState.update { current ->
            val transcript = current.transcript
            if (transcript == null) {
                buffer(frame)
                accepted = true
                return@update current.copy(
                    needsAuthoritativeRefresh = current.needsAuthoritativeRefresh ||
                        bufferedFrameOverflow,
                )
            }
            if (OP_HISTORY in current.activeOperations) buffer(frame)
            accepted = true
            val next = reduceLiveFrame(transcript, frame)
            current.copy(
                transcript = next,
                needsAuthoritativeRefresh = current.needsAuthoritativeRefresh ||
                    bufferedFrameOverflow,
            )
        }
        if (accepted && sequence != null) lastAcceptedSequence = sequence
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

    suspend fun truncate(itemId: String): RichChatOperationResult<Unit> =
        mutate(OP_TRUNCATE, RichChatCapability.Operate) {
            if (itemId.isEmpty()) throw RichChatGatewayException(400, "invalid_request", false)
            gateway.truncate(it.host, it.threadId, itemId)
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
        resetLiveTracking()
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

    private suspend fun mutate(
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

    private suspend fun <T> runOperation(
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
        if (canPublish(lease, ownerToken)) clearActive(ownerToken.kind)
        throw error
    } catch (_: RichChatBackgroundException) {
        rejected(RichChatOperationFailure.Backgrounded)
    } catch (error: Exception) {
        if (!canPublish(lease, ownerToken)) {
            RichChatOperationResult.Stale
        } else {
            val failure = error.asRichChatFailure(capability, mutation)
            mutableState.update {
                it.copy(
                    activeOperations = it.activeOperations - ownerToken.kind,
                    loadingOlder = if (ownerToken.kind == OP_OLDER) false else it.loadingOlder,
                    loadPhase = if (ownerToken.kind == OP_HISTORY) {
                        when {
                            it.transcript == null -> RichChatLoadPhase.Failed
                            it.transcript.orderedItemIds.isEmpty() -> RichChatLoadPhase.Empty
                            else -> RichChatLoadPhase.Loaded
                        }
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

    private fun prepare(capability: RichChatCapability): RichChatThreadLease? {
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

    private fun currentRejection(): RichChatOperationResult.Failed =
        RichChatOperationResult.Failed(
            mutableState.value.failure ?: RichChatOperationFailure.NoThread,
        )

    private fun canPublish(
        lease: RichChatThreadLease,
        token: RichChatOperationOwner.Token,
    ): Boolean = lifecycle.isForeground &&
        owner.isCurrent(token) &&
        isSelected(lease) &&
        session.isCurrent(lease.host)

    private fun isSelected(lease: RichChatThreadLease): Boolean {
        val current = mutableSelection.value ?: return false
        return current.host.key == lease.host.key &&
            current.threadId == lease.threadId &&
            current.generation == lease.generation
    }

    private fun markActive(kind: String) {
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

    private fun buffer(frame: RichChatLiveFrame) {
        if (bufferedFrames.size == MAX_BUFFERED_LIVE_FRAMES) {
            bufferedFrameOverflow = true
            return
        }
        bufferedFrames.addLast(frame)
    }

    private fun resetLiveTracking() {
        bufferedFrames.clear()
        bufferedFrameOverflow = false
        lastAcceptedSequence = null
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
        const val OP_HISTORY = "history"
        const val OP_OLDER = "older"
        const val OP_SEND = "send"
        const val OP_INTERRUPT = "interrupt"
        const val OP_TRUNCATE = "truncate"
        const val OP_GOAL = "goal"
        const val OP_STEER = "steer"
        const val OP_COMMAND = "command"
        const val OP_CLOSE = "thread-close"
        const val OP_REQUEST = "request"
        private const val MAX_BUFFERED_LIVE_FRAMES = 512
    }
}
