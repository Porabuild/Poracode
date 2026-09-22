package com.poracode.app.protocol

import kotlinx.serialization.json.JsonElement

/**
 * Coordinates HTTP thread-history install with live seq-tagged runtime events
 * for an opening thread.
 *
 * Problem: [AppSession.openThread] subscribes and loads history asynchronously.
 * Live WS events with seq > N can apply while history for snapshotSeq N is in
 * flight; a blind replace of [threadItems] with history permanently loses live
 * content even though the global cursor remains > N.
 *
 * Solution: while hydrating, buffer accepted seq-tagged events for the opening
 * thread. On history success, atomically install history then replay buffered
 * frames whose seq > history.snapshotSeq in order. Thread switch / cancel /
 * generation bump discards the stale buffer.
 */
class ThreadHydrationCoordinator(
    private val bounds: Bounds = Bounds(),
    private val arrivalClockMs: () -> Long = { System.nanoTime() / 1_000_000L },
) {
    /**
     * Count/byte/age bounds over the buffered replay window. All three are
     * hard: the oldest frames are evicted oldest-first until the window fits,
     * and any eviction means the replay lost coverage. A single frame larger
     * than [maxBytes] is never retained.
     *
     * [maxAgeMs] is retained age against the monotonic [arrivalClockMs], not an
     * arrival span: expiry is checked at append and again when history
     * completes, so a hung or quiet read cannot replay a frame retained past
     * the budget.
     */
    data class Bounds(
        val maxFrames: Int = MAX_BUFFERED_FRAMES,
        val maxBytes: Long = MAX_BUFFERED_BYTES,
        val maxAgeMs: Long = MAX_BUFFERED_AGE_MS,
    )

    data class BufferedFrame(
        val seq: Int,
        val threadId: String,
        val event: JsonElement,
        val estimatedBytes: Long = 0L,
        /** Monotonic arrival; shares its base with [arrivalClockMs]. */
        val arrivalMs: Long = 0L,
    )

    /**
     * Outcome of consuming the buffer when history lands. [coverageLost] covers
     * every eviction, including frames dropped for expiry at completion.
     */
    data class Completion(
        val replay: List<BufferedFrame>,
        val coverageLost: Boolean,
    )

    enum class LiveDisposition {
        /** History is loaded — apply to thread items immediately. */
        Apply,

        /** History still in flight for this thread/generation — buffer. */
        Buffer,

        /** Wrong thread, stale generation, or no open thread — ignore. */
        Ignore,
    }

    enum class BufferResult {
        Accepted,
        Rejected,
        Overflow,
    }

    @Volatile
    private var generation: Int = 0

    @Volatile
    private var activeThreadId: String? = null

    @Volatile
    private var activeGeneration: Int = 0

    @Volatile
    private var hydrating: Boolean = false

    @Volatile
    private var parked: Boolean = false

    @Volatile
    private var failed: Boolean = false

    private val buffer = ArrayList<BufferedFrame>()
    private val lock = Any()
    private var bufferedBytes: Long = 0L

    /** Any eviction lost replay coverage; the caller must request recovery. */
    @Volatile
    private var coverageLost: Boolean = false

    val isHydrating: Boolean
        get() = hydrating

    val currentGeneration: Int
        get() = activeGeneration

    val activeThread: String?
        get() = activeThreadId

    val overflowed: Boolean
        get() = coverageLost

    fun bufferedCount(): Int = synchronized(lock) { buffer.size }

    fun bufferedBytes(): Long = synchronized(lock) { bufferedBytes }

    /** Retained seqs in arrival order (accounting; exposed for tests). */
    fun bufferedSeqs(): List<Int> = synchronized(lock) { buffer.map { it.seq } }

    /**
     * Begin opening [threadId]. Bumps generation, clears any prior buffer, and
     * enters hydrating mode. Returns the generation that must be presented with
     * subsequent buffer/complete calls.
     */
    fun beginOpen(threadId: String): Int = synchronized(lock) {
        generation += 1
        activeThreadId = threadId
        activeGeneration = generation
        hydrating = true
        parked = false
        failed = false
        clearBuffer()
        activeGeneration
    }

    /** Discard buffer and leave hydrating (close, switch, or cancel). */
    fun cancel() = synchronized(lock) {
        generation += 1
        activeThreadId = null
        activeGeneration = generation
        hydrating = false
        parked = false
        failed = false
        clearBuffer()
    }

    /** Caller holds [lock]. */
    private fun clearBuffer() {
        buffer.clear()
        bufferedBytes = 0L
        coverageLost = false
    }

    /** Background: keep accepted buffered seqs; restart history on foreground. */
    fun parkForBackground() = synchronized(lock) {
        if (hydrating) parked = true
    }

    fun terminateFailed() = synchronized(lock) {
        hydrating = false
        parked = false
        failed = true
        clearBuffer()
    }

    fun needsHistoryRestart(): Boolean = synchronized(lock) {
        activeThreadId != null && (parked || failed)
    }

    fun noteHistoryRestarting() = synchronized(lock) {
        parked = false
        failed = false
        hydrating = true
    }

    /**
     * Decide whether a live frame that may affect the open thread should apply or buffer.
     *
     * [eventThreadId] may be null for legacy flat item/runtimeItem payloads without an
     * explicit threadId — those are attributed to the open thread when hydrating.
     */
    fun dispositionForLive(
        eventThreadId: String?,
        openThreadId: String?,
        openGeneration: Int,
    ): LiveDisposition {
        if (openThreadId == null) return LiveDisposition.Ignore
        if (openGeneration != activeGeneration) return LiveDisposition.Ignore
        // Explicit other-thread id → ignore. Null id → treat as open-thread legacy payload.
        if (eventThreadId != null && eventThreadId != openThreadId) return LiveDisposition.Ignore
        val attributed = eventThreadId ?: openThreadId
        return if (hydrating && activeThreadId == openThreadId && attributed == openThreadId) {
            LiveDisposition.Buffer
        } else if (activeThreadId == openThreadId) {
            LiveDisposition.Apply
        } else {
            LiveDisposition.Ignore
        }
    }

    /**
     * Buffer a live frame for the active hydrating thread.
     * @return true when buffered; false when generation/thread no longer match.
     */
    fun buffer(
        seq: Int,
        threadId: String,
        event: JsonElement,
        openGeneration: Int,
    ): Boolean = bufferFrame(seq, threadId, event, openGeneration) == BufferResult.Accepted

    fun bufferFrame(
        seq: Int,
        threadId: String,
        event: JsonElement,
        openGeneration: Int,
        arrivalMs: Long = arrivalClockMs(),
    ): BufferResult = synchronized(lock) {
        if (openGeneration != activeGeneration) return BufferResult.Rejected
        if (!hydrating || activeThreadId != threadId) return BufferResult.Rejected
        val frame = BufferedFrame(
            seq = seq,
            threadId = threadId,
            event = event,
            estimatedBytes = estimateJsonBytes(event),
            arrivalMs = arrivalMs,
        )
        buffer.add(frame)
        bufferedBytes += frame.estimatedBytes
        var evicted = false
        while (buffer.isNotEmpty()) {
            val head = buffer.first()
            val overCount = buffer.size > bounds.maxFrames
            val overBytes = bufferedBytes > bounds.maxBytes
            // Retained age against the append-time monotonic clock, not the
            // arrival span: an old head is dropped even if no newer frame has
            // arrived to widen a span.
            val overAge = arrivalMs - head.arrivalMs > bounds.maxAgeMs
            if (!overCount && !overBytes && !overAge) break
            buffer.removeAt(0)
            bufferedBytes -= head.estimatedBytes
            evicted = true
        }
        if (evicted) {
            // Oldest-first eviction lost replay coverage: keep the bounded
            // newest window (so a later install can still replay what
            // survived) but report overflow so the caller requests an
            // authoritative refresh. Never claim a converged replay.
            coverageLost = true
            return BufferResult.Overflow
        }
        BufferResult.Accepted
    }

    /**
     * Conservative decoded-payload estimate: `toString` renders this element's
     * JSON once (never retained history), and UTF-16 length × 3 upper-bounds
     * its UTF-8 size. Computed once per arrival for accounting only.
     */
    private fun estimateJsonBytes(element: JsonElement): Long =
        element.toString().length.toLong() * 3L + 32L

    /**
     * History arrived for [threadId]/[openGeneration].
     * Returns frames with seq > [snapshotSeq] in ascending seq order for replay,
     * or null when the open was cancelled/switched (caller must not install).
     *
     * Expired frames are dropped first against the monotonic clock: a read that
     * outlived [Bounds.maxAgeMs] releases its payload and reports coverage loss
     * so the caller runs the existing authoritative recovery instead of
     * replaying an arbitrarily stale frame.
     */
    fun completeHistory(
        threadId: String,
        openGeneration: Int,
        snapshotSeq: Int,
    ): Completion? = synchronized(lock) {
        if (openGeneration != activeGeneration) return null
        if (activeThreadId != threadId) return null
        if (!hydrating) {
            // Already completed or never hydrating — treat as stale for install.
            return null
        }
        hydrating = false
        val now = arrivalClockMs()
        while (buffer.isNotEmpty() && now - buffer.first().arrivalMs > bounds.maxAgeMs) {
            val expired = buffer.removeAt(0)
            bufferedBytes -= expired.estimatedBytes
            coverageLost = true
        }
        val replay = buffer
            .filter { it.threadId == threadId && it.seq > snapshotSeq }
            .sortedBy { it.seq }
        val completion = Completion(replay = replay, coverageLost = coverageLost)
        clearBuffer()
        completion
    }

    /** Pure helper: which buffered frames survive a history snapshot. */
    companion object {
        const val MAX_BUFFERED_FRAMES = 256

        /** Host WebSocket frames are capped at 1 MiB; this bounds retention. */
        const val MAX_BUFFERED_BYTES = 4L * 1024 * 1024

        /** Retained-age bound; a read stalling longer than this recovers. */
        const val MAX_BUFFERED_AGE_MS = 120_000L

        fun framesAfterSnapshot(
            frames: List<BufferedFrame>,
            threadId: String,
            snapshotSeq: Int,
        ): List<BufferedFrame> =
            frames
                .filter { it.threadId == threadId && it.seq > snapshotSeq }
                .sortedBy { it.seq }
    }
}

/**
 * Global replay cursor ownership rules.
 * Ordinary per-thread history must never advance the session/socket cursor;
 * transactional resync reconnects from the shell snapshot seq only.
 * Ordinary/manual/debounced shell snapshots never advance the global cursor;
 * only bootstrap or atomic shell+history resync may.
 */
object GlobalCursorPolicy {
    /** Ordinary [loadThreadHistory] must not advance lastSeenSeq. */
    fun ordinaryThreadHistoryAdvancesGlobalCursor(): Boolean = false

    /** Debounced/manual shell refresh must not advance lastSeenSeq. */
    fun ordinaryShellRefreshAdvancesGlobalCursor(): Boolean = false

    /** Initial full bootstrap may establish the global cursor from shell.snapshotSeq. */
    fun bootstrapAdvancesGlobalCursor(): Boolean = true

    /** A bounded shell first page IS the authoritative baseline; only it may advance. */
    fun boundedFirstPageAdvancesGlobalCursor(): Boolean = true

    /** Bounded paint/inventory continuation pages never advance the global cursor. */
    fun boundedContinuationAdvancesGlobalCursor(): Boolean = false

    /**
     * After a successful resync transaction, reconnect from the shell snapshot
     * baseline — never a later thread-history seq alone.
     */
    fun resyncReconnectSeq(shellSnapshotSeq: Int, historySnapshotSeq: Int?): Int {
        @Suppress("UNUSED_VARIABLE")
        val ignored = historySnapshotSeq
        return shellSnapshotSeq
    }
}

/** Composer draft clear policy — never clear preemptively. */
object ComposerDraftPolicy {
    fun nextDraftAfterSendAttempt(currentDraft: String, sendSucceeded: Boolean): String =
        if (sendSucceeded) "" else currentDraft

    fun shouldClearDraft(sendSucceeded: Boolean): Boolean = sendSucceeded
}

/** Onboarding field persistence: secrets must not survive saved-instance state. */
object OnboardingFieldPersistence {
    enum class Field {
        PairingLink,
        OneTimeToken,
        BaseUrl,
    }

    fun shouldSurviveSavedInstance(field: Field): Boolean = when (field) {
        Field.PairingLink, Field.OneTimeToken -> false
        Field.BaseUrl -> true
    }
}

/**
 * Terminal presentation is unsupported on the native Android chat slice until
 * native PTY lands. Hide those threads from list/detail rather than showing
 * broken GUI transcripts.
 */
object ThreadPresentationPolicy {
    const val MODE_TERMINAL = "terminal"
    const val MODE_GUI = "gui"

    fun isTerminal(presentationMode: String?): Boolean =
        presentationMode?.equals(MODE_TERMINAL, ignoreCase = true) == true

    fun isChatListVisible(presentationMode: String?): Boolean =
        !isTerminal(presentationMode)

    fun filterChatThreads(
        threads: List<com.poracode.app.model.RemoteThread>,
    ): List<com.poracode.app.model.RemoteThread> =
        threads.filter { isChatListVisible(it.presentationMode) }
}

/**
 * Lifecycle gate so a slow bootstrap/pair/snapshot cannot create/start a WS
 * after the app has moved to background.
 */
class AppLifecycleGate {
    @Volatile
    var isForeground: Boolean = true
        private set

    @Volatile
    var liveSessionDesired: Boolean = false
        private set

    fun onBackground() {
        isForeground = false
    }

    fun onForeground() {
        isForeground = true
    }

    fun noteLiveSessionDesired(desired: Boolean) {
        liveSessionDesired = desired
    }

    /**
     * Whether [startWebSocket] may call [RemoteWebSocketClient.start] now.
     * When backgrounded, the session must leave the socket suspended and
     * connect on the next foreground.
     */
    fun mayConnectLiveSocket(): Boolean = isForeground && liveSessionDesired

    /** After building a socket while backgrounded: start now or leave suspended. */
    enum class StartAction {
        StartNow,
        LeaveSuspendedUntilForeground,
        DoNotStart,
    }

    fun actionForLiveStart(): StartAction = when {
        !liveSessionDesired -> StartAction.DoNotStart
        isForeground -> StartAction.StartNow
        else -> StartAction.LeaveSuspendedUntilForeground
    }
}
