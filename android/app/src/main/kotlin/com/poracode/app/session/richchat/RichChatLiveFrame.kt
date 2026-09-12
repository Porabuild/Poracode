package com.poracode.app.session.richchat

import com.poracode.app.chat.RichFollowUpQueueEnvelope
import com.poracode.app.chat.RichPendingSteerEnvelope
import com.poracode.app.chat.RichReducer
import com.poracode.app.chat.RichRuntimeEvent
import com.poracode.app.chat.RichThreadState

/** Decoded live events and their server sequence for the selected thread. */
internal data class RichChatLiveFrame(
    val sequence: Int?,
    val events: List<RichRuntimeEvent>,
    val pendingSteer: RichPendingSteerEnvelope? = null,
    val followUpQueue: RichFollowUpQueueEnvelope? = null,
)

internal fun reduceLiveFrame(state: RichThreadState, frame: RichChatLiveFrame): RichThreadState {
    val stateEvents = frame.events.filterNot {
        it is RichRuntimeEvent.Warning || it is RichRuntimeEvent.UsageSpent
    }
    var next = RichReducer.reduceAll(state, stateEvents)
    frame.pendingSteer?.let { next = RichReducer.applyPendingSteer(next, it) }
    frame.followUpQueue?.let { next = RichReducer.applyFollowUpQueue(next, it) }
    return next
}

/**
 * Missing-checkpoint detection for `runtime.truncated`: a paged client that
 * does not hold the checkpoint cannot identify the deleted tail locally, so
 * the controller must request one authoritative catchup via the existing
 * `needsAuthoritativeRefresh` plumbing. Checked against the transcript AFTER
 * the frame reduced (the checkpoint survives its own truncate, so absent
 * after == absent before, modulo an earlier truncate in the same frame
 * pruning it — in which case catchup is still the safe outcome).
 */
internal fun frameNeedsTruncationCatchup(
    transcriptAfter: RichThreadState,
    frame: RichChatLiveFrame,
): Boolean {
    for (event in frame.events) {
        if (event is RichRuntimeEvent.RuntimeTruncated &&
            event.itemId !in transcriptAfter.itemsById
        ) {
            return true
        }
    }
    return false
}

/** Outcome of replaying buffered frames against a fresh authoritative snapshot. */
internal data class RichChatBufferedReplay(
    val transcript: RichThreadState,
    val hadOverflow: Boolean,
    val truncationCatchup: Boolean,
)

/**
 * Pending live frames plus the per-thread sequence watermark. All access is
 * confined to the controller's synchronized methods, so no internal locking.
 */
internal class RichChatLiveFrameBuffer(
    private val maxFrames: Int = MAX_BUFFERED_LIVE_FRAMES,
) {
    private val frames = ArrayDeque<RichChatLiveFrame>()
    var overflow: Boolean = false
        private set
    var lastAcceptedSequence: Int? = null
        private set

    /** Old replays never reduce: `sequence <= lastAcceptedSequence` is stale. */
    fun isStale(sequence: Int?): Boolean =
        sequence != null && lastAcceptedSequence?.let { sequence <= it } == true

    fun buffer(frame: RichChatLiveFrame) {
        if (frames.size == maxFrames) {
            overflow = true
            return
        }
        frames.addLast(frame)
    }

    fun markAccepted(sequence: Int?) {
        if (sequence != null) lastAcceptedSequence = sequence
    }

    fun reset() {
        frames.clear()
        overflow = false
        lastAcceptedSequence = null
    }

    /**
     * Replays frames newer than the installed snapshot (`sequence == null ||
     * `> snapshotSeq`); frames at or below the baseline were already reflected
     * in the snapshot and are dropped without catchup. Checked incrementally
     * per replayed frame so a later frame pruning an earlier checkpoint cannot
     * false-positive an already-correct apply.
     */
    fun replayAfterSnapshot(snapshot: RichChatHistorySnapshot): RichChatBufferedReplay {
        val replay = frames.toList()
        val hadOverflow = overflow
        frames.clear()
        overflow = false
        var transcript = snapshot.state
        var truncationCatchup = false
        replay.forEach { frame ->
            if (frame.sequence == null || frame.sequence > snapshot.snapshotSeq) {
                transcript = reduceLiveFrame(transcript, frame)
                if (!truncationCatchup && frameNeedsTruncationCatchup(transcript, frame)) {
                    truncationCatchup = true
                }
            }
        }
        lastAcceptedSequence = maxOf(
            snapshot.snapshotSeq,
            lastAcceptedSequence ?: snapshot.snapshotSeq,
        )
        return RichChatBufferedReplay(transcript, hadOverflow, truncationCatchup)
    }

    companion object {
        const val MAX_BUFFERED_LIVE_FRAMES = 512
    }
}
