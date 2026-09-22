package com.poracode.app.session.richchat

import com.poracode.app.chat.RichThreadState
import com.poracode.app.session.history.CompletedTurns
import kotlinx.coroutines.flow.update

internal const val OP_HISTORY = "history"
internal const val OP_OLDER = "older"

/**
 * Authoritative history reads, split from [RichChatController] below the
 * source-size gate. Live-frame buffering and dedup stay in
 * [RichChatLiveFrameBuffer]; these functions own the read lifecycle and the
 * load phase it settles into.
 */

suspend fun RichChatController.refreshHistory(): RichChatOperationResult<RichChatHistorySnapshot> {
    val prepared = prepare(RichChatCapability.Read) ?: return currentRejection()
    val token = owner.begin(OP_HISTORY, prepared)
    markActive(OP_HISTORY)
    val result = runOperation(prepared, token, RichChatCapability.Read, false) {
        val snapshot = sessionGateway.history(prepared.host, prepared.threadId)
        if (!canPublish(prepared, token)) return@runOperation RichChatOperationResult.Stale
        if (!installAuthoritativeSnapshot(prepared, snapshot)) {
            return@runOperation settleRefusedHistorySnapshot(prepared, token)
        }
        RichChatOperationResult.Success(snapshot)
    }
    if (result is RichChatOperationResult.Failed) {
        // B1: a failed declared read offers recovery only after the same
        // authority advertised notices v1 and an actual descriptor comes back.
        readHistoryGapIfSupported(prepared)
    }
    return result
}

/**
 * The production load-older action (timeline scroll and "Load older messages"
 * tap). One invocation advances both continuations the host advertised: older
 * runtime items (`ti1./pi1.`) and older completed turns (`ct1.`, declared-only
 * `thread-turns`). Turns merge by `(startedAt, endedAt)`, so a >500-turn thread
 * stays lossless and anchorless turns are never dropped; a thread whose item
 * pages are exhausted — or that has no runtime items at all — keeps the action
 * while a turn cursor remains.
 *
 * `route_unavailable` (a host that never negotiated bounded reads) and
 * `invalid_thread_cursor` (a continuation invalidated by truncate/reset) end
 * the turn walk without a user-facing failure. Any page that lands after an
 * authoritative install, truncate or selection change is fenced by
 * [RichChatController.olderPagingEpoch] and dropped.
 */
suspend fun RichChatController.loadOlderPage(): RichChatOperationResult<Int> {
    val prepared = prepare(RichChatCapability.Read) ?: return currentRejection()
    val current = mutableState.value
    val itemCursor = current.olderCursor
    val turnsCursor = current.olderTurnsCursor
    if (itemCursor == null && turnsCursor == null) return RichChatOperationResult.Success(0)
    val token = owner.begin(OP_OLDER, prepared)
    val pagingEpoch = olderPagingEpoch.get()
    mutableState.update { it.copy(loadingOlder = true, failure = null) }
    return runOperation(prepared, token, RichChatCapability.Read, false) {
        val itemPage = if (itemCursor != null) {
            sessionGateway.olderItems(prepared.host, prepared.threadId, itemCursor)
        } else {
            null
        }
        var turnsPage: RichChatTurnsPage? = null
        var turnsEnded = false
        if (turnsCursor != null) {
            try {
                turnsPage = sessionGateway.olderTurns(prepared.host, prepared.threadId, turnsCursor)
            } catch (error: RichChatGatewayException) {
                if (!error.endsOlderTurnsContinuation()) throw error
                turnsEnded = true
            }
        }
        if (!canPublish(prepared, token)) return@runOperation RichChatOperationResult.Stale
        if (pagingEpoch != olderPagingEpoch.get()) {
            // Truncate/reset/refresh raced this page: it no longer belongs to
            // the installed transcript. Drop it and re-enable the affordance.
            mutableState.update { it.copy(loadingOlder = false) }
            return@runOperation RichChatOperationResult.Stale
        }
        var added = 0
        mutableState.update { state ->
            val live = state.transcript ?: return@update state
            val olderItems = itemPage?.items?.filterNot { it.id in live.itemsById }.orEmpty()
            val allItems = olderItems + live.itemsInOrder
            val turns = turnsPage?.let { CompletedTurns.mergeOlder(live.completedTurns, it.turns) }
                ?: live.completedTurns
            added = olderItems.size + (turns.size - live.completedTurns.size)
            val hydrated = RichThreadState.hydrate(
                key = live.key,
                items = allItems,
                completedTurns = turns,
                contextUsage = live.contextUsage,
            ).copy(
                pendingSteer = live.pendingSteer,
                followUpQueue = live.followUpQueue,
                openTurn = live.openTurn,
                lastUsageSpent = live.lastUsageSpent,
                structuralVersion = live.structuralVersion + if (olderItems.isEmpty()) 0 else 1,
                syntheticErrorSequence = live.syntheticErrorSequence,
            )
            state.copy(
                transcript = hydrated,
                olderCursor = if (itemPage != null) itemPage.nextCursor else state.olderCursor,
                olderTurnsCursor = when {
                    turnsEnded -> null
                    turnsPage != null -> turnsPage.nextCursor
                    else -> state.olderTurnsCursor
                },
                loadingOlder = false,
                loadPhase = richChatLoadPhase(hydrated),
                // A served item page is authoritative transcript content: it
                // carries the notice when one exists and proves no open gap
                // blocks reads. A turns-only walk reads no item page and must
                // not touch the notice state.
                historyNotice = if (itemPage != null) {
                    state.historyNotice.afterAuthoritativeRead(itemPage.runtimeNotice)
                } else {
                    state.historyNotice
                },
            )
        }
        RichChatOperationResult.Success(added)
    }
}

private fun RichChatGatewayException.endsOlderTurnsContinuation(): Boolean =
    code == "route_unavailable" || code == "invalid_thread_cursor"

/**
 * A transcript with no runtime items but completed turns is not empty: the
 * timeline (and its load-older affordance) is the only way to reach the tail's
 * older turns.
 */
internal fun richChatLoadPhase(transcript: RichThreadState?): RichChatLoadPhase = when {
    transcript == null -> RichChatLoadPhase.Idle
    transcript.orderedItemIds.isEmpty() && transcript.completedTurns.isEmpty() ->
        RichChatLoadPhase.Empty
    else -> RichChatLoadPhase.Loaded
}

/**
 * A completed history read whose snapshot was refused for a still-valid owner
 * is a contract violation, not a stale result: settle the operation so the
 * surface leaves Loading and offers retry. The retained live window is
 * deliberately preserved — it stays dedup-filtered against the next installed
 * snapshot (the existing replay contract), and a superseded owner never
 * reaches this branch (it stays [RichChatOperationResult.Stale] and nothing is
 * cleared).
 */
private fun RichChatController.settleRefusedHistorySnapshot(
    lease: RichChatThreadLease,
    token: RichChatOperationOwner.Token,
): RichChatOperationResult<Nothing> = synchronized(this) {
    if (!canPublish(lease, token)) return@synchronized RichChatOperationResult.Stale
    val failure = RichChatOperationFailure.InvalidResponse
    mutableState.update {
        it.copy(
            activeOperations = it.activeOperations - OP_HISTORY,
            loadPhase = historySettledPhase(it.transcript, RichChatLoadPhase.Failed),
            failure = failure,
        )
    }
    RichChatOperationResult.Failed(failure)
}

fun RichChatController.installAuthoritativeSnapshot(
    source: RichChatThreadLease,
    snapshot: RichChatHistorySnapshot,
): Boolean = synchronized(this) {
    if (!isSelected(source) || snapshot.key != source.key || !session.isCurrent(source.host)) {
        return@synchronized false
    }
    // Buffered truncate whose checkpoint is outside the freshly installed
    // window needs one authoritative catchup. Frames at or below snapshotSeq
    // were already reflected in the snapshot and are dropped without catchup
    // (per-thread installed baseline gate). Absent queue field = the supervisor
    // read failed; the desktop contract keeps the previously projected queue
    // instead of silently clearing the strip. The substitution happens on the
    // replay base, not the result, so buffered queue frames newer than the
    // snapshot still win.
    val previousTranscript = mutableState.value.transcript
    val previousQueue = previousTranscript?.followUpQueue
    // Tail replacement: the authoritative tail level wins, while turns the
    // user already paged in survive by `(startedAt, endedAt)` — a refresh must
    // never drop loaded older turns, and replay below still prunes truncations.
    val snapshotState = snapshot.state.copy(
        completedTurns = CompletedTurns.mergeTail(
            loaded = previousTranscript?.completedTurns.orEmpty(),
            tail = snapshot.state.completedTurns,
        ),
    )
    val base = if (snapshot.followUpQueuePresent) {
        snapshotState
    } else {
        snapshotState.copy(followUpQueue = previousQueue)
    }
    val replayed = frameBuffer.replayAfterSnapshot(snapshot, base)
    val transcript = replayed.transcript
    val truncationCatchup = replayed.truncationCatchup
    val needsFollowUp = replayed.hadOverflow
    mutableState.update {
        it.copy(
            transcript = transcript,
            snapshotSeq = snapshot.snapshotSeq,
            olderCursor = snapshot.olderCursor,
            olderTurnsCursor = snapshot.completedTurnsNextCursor,
            config = snapshot.config,
            terminalScrollback = snapshot.terminalScrollback,
            activeOperations = it.activeOperations - OP_HISTORY,
            loadPhase = richChatLoadPhase(transcript),
            failure = null,
            needsAuthoritativeRefresh = needsFollowUp || truncationCatchup,
            // Projected with the transcript in the same update: buffered live
            // frames replay only afterwards, so no post-gap content renders
            // before/without its notice. Absence never clears a known notice.
            historyNotice = it.historyNotice.afterAuthoritativeRead(snapshot.runtimeNotice),
        )
    }
    // The installed transcript supersedes every page requested before it.
    invalidateOlderPaging()
    true
}

/**
 * F-D3: a failed or cancelled owner-valid history read releases the live
 * frames it buffered, so the frame buffer is only open while a read is
 * actually in flight. The per-thread sequence watermark survives the release —
 * it is dedup state, not replay payload, and clearing it would let a
 * retransmitted older frame reduce twice before the next authoritative install
 * re-seeds the window. Only the history operation may call this: failures of
 * unrelated operations must not touch frames, and a failure whose owner token
 * was invalidated belongs to a superseded generation whose successor already
 * reset the buffer.
 */
internal fun RichChatController.releaseHistoryFrameBuffer() {
    val watermark = frameBuffer.lastAcceptedSequence
    frameBuffer.reset()
    if (watermark != null) frameBuffer.markAccepted(watermark)
}

/**
 * Terminal history read without an installed transcript: a failure settles
 * [RichChatLoadPhase.Failed] (retry affordance), an owner-valid cancellation
 * settles [RichChatLoadPhase.Idle]. A transcript that is already present keeps
 * its loaded/empty shape, so an interrupted refresh never hides it.
 */
internal fun RichChatController.historySettledPhase(
    transcript: RichThreadState?,
    missingTranscriptPhase: RichChatLoadPhase,
): RichChatLoadPhase =
    if (transcript == null) missingTranscriptPhase else richChatLoadPhase(transcript)
