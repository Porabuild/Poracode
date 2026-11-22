package com.poracode.app.session.richchat

import com.poracode.app.chat.RichCompletedTurn
import com.poracode.app.chat.RichContextUsage
import com.poracode.app.chat.RichEventDecoder
import com.poracode.app.chat.RichFollowUpQueue
import com.poracode.app.chat.RichFollowUpQueueDecoder
import com.poracode.app.chat.RichRuntimeEvent
import com.poracode.app.chat.RichSnapshotMapping
import com.poracode.app.chat.RichThreadKey
import com.poracode.app.chat.RichThreadState
import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.RemoteRuntimeHistoryNotice
import com.poracode.app.model.ThreadConfig
import com.poracode.app.protocol.BackgroundTask
import com.poracode.app.protocol.RuntimeBackgroundTaskDecoder
import com.poracode.app.protocol.RuntimeEventReducer
import com.poracode.app.transport.RemoteHistoryResumeOutcome
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

data class RichChatHistoryResumeBatch(
    val seq: Int,
    val events: List<RichRuntimeEvent>,
    val backgroundTaskChanges: List<RichChatBackgroundTaskChange> = emptyList(),
)

data class RichChatHistoryResumeEvents(
    val key: RichThreadKey,
    val snapshotSeq: Int,
    val runtimeResumeCursor: String,
    val config: ThreadConfig,
    val completedTurns: List<RichCompletedTurn>,
    val completedTurnsNextCursor: String?,
    val contextUsage: RichContextUsage?,
    val backgroundTasksPresent: Boolean,
    val backgroundTasks: List<BackgroundTask>?,
    val followUpQueuePresent: Boolean,
    val followUpQueue: RichFollowUpQueue?,
    val runtimeNotice: RemoteRuntimeHistoryNotice?,
    val batches: List<RichChatHistoryResumeBatch>,
)

sealed interface RichChatHistoryResumeOutcome {
    data class Events(val resumed: RichChatHistoryResumeEvents) : RichChatHistoryResumeOutcome
    data class Snapshot(val snapshot: RichChatHistorySnapshot) : RichChatHistoryResumeOutcome
}

internal object RichChatHistoryResumeMapper {
    fun outcome(
        connectionId: ClientConnectionId,
        raw: RemoteHistoryResumeOutcome,
        receivedAtEpochMs: Long,
    ): RichChatHistoryResumeOutcome = when (raw) {
        is RemoteHistoryResumeOutcome.Snapshot -> RichChatHistoryResumeOutcome.Snapshot(
            RichChatHistoryMapper.snapshot(connectionId, raw.snapshot, receivedAtEpochMs),
        )
        is RemoteHistoryResumeOutcome.Events -> {
            val key = RichThreadKey(connectionId, raw.thread.id)
            val turns = raw.completedTurns.map {
                RichSnapshotMapping.decodeCompletedTurn(it) ?: invalid("completed turn")
            }
            val context = raw.contextUsage?.let {
                RichSnapshotMapping.decodeContextUsage(it) ?: invalid("context usage")
            }
            val followUpQueue = if (raw.followUpQueuePresent) {
                when (val q = raw.followUpQueue) {
                    null, is JsonNull -> null
                    else -> RichFollowUpQueueDecoder.decodeQueue(q) ?: invalid("follow-up queue")
                }
            } else {
                null
            }
            val backgroundTasks = if (raw.backgroundTasksPresent) {
                val arr = raw.backgroundTasks ?: invalid("background tasks")
                RuntimeBackgroundTaskDecoder.decode(arr) ?: invalid("background tasks")
            } else {
                null
            }
            val batches = raw.batches.map { batch ->
                val decodedEvents = mutableListOf<RichRuntimeEvent>()
                val bgChanges = mutableListOf<RichChatBackgroundTaskChange>()
                for (rawEvent in batch.events) {
                    RuntimeEventReducer.parseRuntimeEvent(rawEvent)
                        ?.takeIf { it.threadId == raw.thread.id }
                        ?.asBackgroundTaskChange()
                        ?.let(bgChanges::add)
                    val withThread = JsonObject(rawEvent + ("threadId" to JsonPrimitive(raw.thread.id)))
                    RichEventDecoder.decode(connectionId, withThread)
                        ?.takeIf { it.threadKey == key }
                        ?.let(decodedEvents::add)
                }
                RichChatHistoryResumeBatch(
                    seq = batch.seq,
                    events = decodedEvents,
                    backgroundTaskChanges = bgChanges,
                )
            }
            RichChatHistoryResumeOutcome.Events(
                RichChatHistoryResumeEvents(
                    key = key,
                    snapshotSeq = raw.snapshotSeq,
                    runtimeResumeCursor = raw.runtimeResumeCursor,
                    config = raw.thread.config,
                    completedTurns = turns,
                    completedTurnsNextCursor = raw.completedTurnsNextCursor,
                    contextUsage = context,
                    backgroundTasksPresent = raw.backgroundTasksPresent,
                    backgroundTasks = backgroundTasks,
                    followUpQueuePresent = raw.followUpQueuePresent,
                    followUpQueue = followUpQueue,
                    runtimeNotice = raw.runtimeNotice,
                    batches = batches,
                ),
            )
        }
    }

    private fun invalid(boundary: String): Nothing = throw RichChatGatewayException(
        statusCode = 500,
        code = "invalid_response",
        requestMayHaveCommitted = false,
        cause = IllegalArgumentException("Invalid $boundary."),
    )
}

/**
 * Bounded per-host-binding in-memory warm transcript cache (PWA `#1361` parity).
 * Keeps recently visited / running threads warm across quick tab/thread switches
 * so reopening renders immediately while `thread-history-changes` catches up deltas.
 * Evicted on host binding change, background/unpair, or memory pressure.
 */
internal class RichChatWarmThreadCache(
    private val maxEntries: Int = MAX_WARM_THREADS,
) {
    data class Key(
        val connectionId: ClientConnectionId,
        val bindingGeneration: Long,
        val threadId: String,
    )

    data class Entry(
        val transcript: RichThreadState,
        val snapshotSeq: Int,
        val lastAcceptedSeq: Int?,
        val olderCursor: Int?,
        val olderTurnsCursor: String?,
        val runtimeResumeCursor: String?,
        val config: ThreadConfig?,
        val terminalScrollback: String?,
        val historyNotice: RichChatHistoryNoticeState,
        val backgroundTasks: List<BackgroundTask>?,
        val backgroundTaskSequence: Int?,
    )

    private val entries = LinkedHashMap<Key, Entry>(8, 0.75f, true)

    @Synchronized
    fun put(lease: RichChatThreadLease, state: RichChatControllerState, lastAcceptedSeq: Int?) {
        val transcript = state.transcript ?: return
        val snapshotSeq = state.snapshotSeq ?: return
        if (state.needsAuthoritativeRefresh || state.failure != null) return
        val key = Key(lease.host.connectionId, lease.host.bindingGeneration, lease.threadId)
        entries.remove(key)
        while (entries.size >= maxEntries && entries.isNotEmpty()) {
            val oldest = entries.entries.iterator()
            oldest.next()
            oldest.remove()
        }
        entries[key] = Entry(
            transcript = transcript,
            snapshotSeq = snapshotSeq,
            lastAcceptedSeq = lastAcceptedSeq,
            olderCursor = state.olderCursor,
            olderTurnsCursor = state.olderTurnsCursor,
            runtimeResumeCursor = state.runtimeResumeCursor,
            config = state.config,
            terminalScrollback = state.terminalScrollback,
            historyNotice = state.historyNotice,
            backgroundTasks = state.backgroundTasks,
            backgroundTaskSequence = state.backgroundTaskSequence,
        )
    }

    @Synchronized
    fun get(host: RichChatHostLease, threadId: String): Entry? =
        entries[Key(host.connectionId, host.bindingGeneration, threadId)]

    fun initialStateFor(
        lease: RichChatThreadLease,
        host: RichChatHostLease,
        threadId: String,
        onMarkAccepted: (Int?) -> Unit,
    ): RichChatControllerState {
        val warm = get(host, threadId)
            ?: return RichChatControllerState(selection = lease, loadPhase = RichChatLoadPhase.Loading)
        onMarkAccepted(warm.lastAcceptedSeq)
        return RichChatControllerState(
            selection = lease,
            transcript = warm.transcript,
            snapshotSeq = warm.snapshotSeq,
            olderCursor = warm.olderCursor,
            olderTurnsCursor = warm.olderTurnsCursor,
            runtimeResumeCursor = warm.runtimeResumeCursor,
            config = warm.config,
            terminalScrollback = warm.terminalScrollback,
            loadPhase = richChatLoadPhase(warm.transcript),
            historyNotice = warm.historyNotice,
            backgroundTasks = warm.backgroundTasks,
            backgroundTaskSequence = warm.backgroundTaskSequence,
        )
    }

    @Synchronized
    fun evictHostMismatch(activeHost: RichChatHostLease?) {
        if (activeHost == null) {
            entries.clear()
            return
        }
        entries.keys.retainAll { key ->
            key.connectionId == activeHost.connectionId &&
                key.bindingGeneration == activeHost.bindingGeneration
        }
    }

    @Synchronized
    fun clear() {
        entries.clear()
    }

    companion object {
        const val MAX_WARM_THREADS = 6
    }
}
