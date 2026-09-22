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
 *
 * Bounded by count, estimated retained bytes, and retained age against the
 * monotonic clock. The oldest frames are evicted oldest-first until every bound
 * holds, matching the other incremental recovery buffers and the shared
 * bounded-recovery tape: the retained window is the newest one, never the
 * oldest. Any eviction raises [overflow], and expiry is re-checked when the
 * window is consumed (a quiet stream that outlives the budget is released
 * there) so a stale frame is never replayed. The controller folds [overflow]
 * into `needsAuthoritativeRefresh`: the replay is incomplete, so it must be
 * repaired by an authoritative snapshot rather than silently claimed
 * converged. A single frame may be large; the host caps every WebSocket frame
 * at 1 MiB, and a frame larger than the byte budget is evicted, not retained.
 */
internal class RichChatLiveFrameBuffer(
    private val maxFrames: Int = MAX_BUFFERED_LIVE_FRAMES,
    private val maxBytes: Long = MAX_BUFFERED_LIVE_BYTES,
    private val maxAgeMs: Long = MAX_BUFFERED_LIVE_AGE_MS,
    private val arrivalClockMs: () -> Long = { System.nanoTime() / 1_000_000L },
) {
    private data class Retained(
        val frame: RichChatLiveFrame,
        val estimatedBytes: Long,
        val arrivalMs: Long,
    )

    private val retained = ArrayDeque<Retained>()
    private var bufferedBytes: Long = 0L
    var overflow: Boolean = false
        private set
    var lastAcceptedSequence: Int? = null
        private set

    /** Old replays never reduce: `sequence <= lastAcceptedSequence` is stale. */
    fun isStale(sequence: Int?): Boolean =
        sequence != null && lastAcceptedSequence?.let { sequence <= it } == true

    fun buffer(frame: RichChatLiveFrame) {
        val arrivalMs = arrivalClockMs()
        retained.addLast(
            Retained(
                frame = frame,
                estimatedBytes = frame.estimatedRecoveryBytes(),
                arrivalMs = arrivalMs,
            )
        )
        bufferedBytes += retained.last().estimatedBytes
        var evicted = false
        while (retained.isNotEmpty()) {
            val head = retained.first()
            val overCount = retained.size > maxFrames
            val overBytes = bufferedBytes > maxBytes
            val overAge = arrivalMs - head.arrivalMs > maxAgeMs
            if (!overCount && !overBytes && !overAge) break
            retained.removeFirst()
            bufferedBytes -= head.estimatedBytes
            evicted = true
        }
        if (evicted) overflow = true
    }

    fun markAccepted(sequence: Int?) {
        if (sequence != null) lastAcceptedSequence = sequence
    }

    /** Retained frame count (accounting; exposed for tests). */
    internal fun bufferedCount(): Int = retained.size

    /** Retained estimated bytes (accounting; exposed for tests). */
    internal fun bufferedEstimatedBytes(): Long = bufferedBytes

    /** Retained sequence numbers in arrival order (accounting; exposed for tests). */
    internal fun bufferedSequences(): List<Int?> = retained.map { it.frame.sequence }

    fun reset() {
        retained.clear()
        bufferedBytes = 0L
        overflow = false
        lastAcceptedSequence = null
    }

    /**
     * Replays frames newer than the installed snapshot (`sequence == null ||
     * `> snapshotSeq`); frames at or below the baseline were already reflected
     * in the snapshot and are dropped without catchup. `base` overrides the
     * replay starting transcript for snapshot-field substitutions that must
     * not clobber buffered frames. Checked incrementally per replayed frame
     * so a later frame pruning an earlier checkpoint cannot false-positive an
     * already-correct apply.
     *
     * Expired frames are dropped before replay against the monotonic clock and
     * report [RichChatBufferedReplay.hadOverflow], so a hung/quiet read
     * releases its payload and demands the existing authoritative refresh
     * instead of replaying an arbitrarily stale frame.
     */
    fun replayAfterSnapshot(
        snapshot: RichChatHistorySnapshot,
        base: RichThreadState = snapshot.state,
    ): RichChatBufferedReplay {
        val now = arrivalClockMs()
        var hadOverflow = overflow
        while (retained.isNotEmpty() && now - retained.first().arrivalMs > maxAgeMs) {
            val expired = retained.removeFirst()
            bufferedBytes -= expired.estimatedBytes
            hadOverflow = true
        }
        val replay = retained.map { it.frame }
        retained.clear()
        bufferedBytes = 0L
        overflow = false
        var transcript = base
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

        /** Estimated-byte bound over retained frames (host frames ≤ 1 MiB). */
        const val MAX_BUFFERED_LIVE_BYTES = 8L * 1024 * 1024

        /** Retained-age bound; a read stalling longer than this recovers. */
        const val MAX_BUFFERED_LIVE_AGE_MS = 120_000L
    }
}

/**
 * Conservative decoded-payload estimate for accounting only. `toString`
 * renders this frame's decoded content once (never retained history), and
 * UTF-16 length × 3 upper-bounds its UTF-8 size.
 */
internal fun RichChatLiveFrame.estimatedRecoveryBytes(): Long =
    toString().length.toLong() * 3L + 64L
