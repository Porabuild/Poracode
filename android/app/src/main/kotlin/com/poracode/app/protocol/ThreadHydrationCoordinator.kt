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
class ThreadHydrationCoordinator {
    data class BufferedFrame(
        val seq: Int,
        val threadId: String,
        val event: JsonElement,
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

    val isHydrating: Boolean
        get() = hydrating

    val currentGeneration: Int
        get() = activeGeneration

    val activeThread: String?
        get() = activeThreadId

    fun bufferedCount(): Int = synchronized(lock) { buffer.size }

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
        buffer.clear()
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
        buffer.clear()
    }

    /** Background: keep accepted buffered seqs; restart history on foreground. */
    fun parkForBackground() = synchronized(lock) {
        if (hydrating) parked = true
    }

    fun terminateFailed() = synchronized(lock) {
        hydrating = false
        parked = false
        failed = true
        buffer.clear()
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
    ): BufferResult = synchronized(lock) {
        if (openGeneration != activeGeneration) return BufferResult.Rejected
        if (!hydrating || activeThreadId != threadId) return BufferResult.Rejected
        if (buffer.size >= MAX_BUFFERED_FRAMES) {
            hydrating = false
            parked = false
            failed = true
            buffer.clear()
            return BufferResult.Overflow
        }
        buffer.add(BufferedFrame(seq = seq, threadId = threadId, event = event))
        BufferResult.Accepted
    }

    /**
     * History arrived for [threadId]/[openGeneration].
     * Returns frames with seq > [snapshotSeq] in ascending seq order for replay,
     * or null when the open was cancelled/switched (caller must not install).
     */
    fun completeHistory(
        threadId: String,
        openGeneration: Int,
        snapshotSeq: Int,
    ): List<BufferedFrame>? = synchronized(lock) {
        if (openGeneration != activeGeneration) return null
        if (activeThreadId != threadId) return null
        if (!hydrating) {
            // Already completed or never hydrating — treat as stale for install.
            return null
        }
        hydrating = false
        val replay = buffer
            .filter { it.threadId == threadId && it.seq > snapshotSeq }
            .sortedBy { it.seq }
        buffer.clear()
        replay
    }

    /** Pure helper: which buffered frames survive a history snapshot. */
    companion object {
        const val MAX_BUFFERED_FRAMES = 256

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
