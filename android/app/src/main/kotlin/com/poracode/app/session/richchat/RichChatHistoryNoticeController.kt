package com.poracode.app.session.richchat

import com.poracode.app.model.RemoteRuntimeGapAck
import com.poracode.app.model.RemoteRuntimeGapDescriptor
import com.poracode.app.model.RemoteRuntimeGapRead
import com.poracode.app.model.RemoteRuntimeHistoryNotice
import kotlinx.coroutines.flow.update

internal const val OP_GAP_READ = "runtime-gap-read"
internal const val OP_GAP_ACK = "runtime-gap-ack"

/**
 * B1 durable history-notice state. One cohesive owner per selected
 * thread/authority: the whole controller state (and this value with it) is
 * replaced by `selectThread`/`closeThread`, so a held reply from a replaced
 * selection can never paint into a successor.
 *
 * - [notice] is upsert-only from authoritative declared reads: a later page,
 *   turn page, reset/truncate or reconnect that omits the field never clears
 *   it. Only thread removal/authority replacement drops it.
 * - [descriptor] is the current unacknowledged episode from an actual
 *   declared gap read, and is cleared by an authoritative successful read
 *   (served content proves nothing blocks) or by `applied`/`already`.
 * - [ackCommandId]/[ackToken] retain the exact idempotency pair across an
 *   uncertain acknowledgement so a retry reuses it; a stale/new episode mints
 *   a new pair only on the next explicit user action.
 */
data class RichChatHistoryNoticeState(
    val notice: RemoteRuntimeHistoryNotice? = null,
    val descriptor: RemoteRuntimeGapDescriptor? = null,
    val readingGap: Boolean = false,
    val gapReadFailed: Boolean = false,
    val acknowledging: Boolean = false,
    val ackCommandId: String? = null,
    val ackToken: String? = null,
)

/**
 * A successful authoritative declared read (snapshot or item page) proves the
 * host served transcript content: any previously read unacknowledged episode
 * is no longer blocking, so the descriptor clears while the durable notice is
 * only ever upserted.
 */
internal fun RichChatHistoryNoticeState.afterAuthoritativeRead(
    notice: RemoteRuntimeHistoryNotice?,
): RichChatHistoryNoticeState = copy(
    notice = notice ?: this.notice,
    descriptor = null,
    readingGap = false,
    gapReadFailed = false,
)

internal fun RichChatHistoryNoticeState.afterGapRead(
    read: RemoteRuntimeGapRead,
): RichChatHistoryNoticeState = copy(
    notice = read.notice ?: notice,
    descriptor = read.gap,
    readingGap = false,
    gapReadFailed = false,
)

internal fun RichChatHistoryNoticeState.afterGapAck(
    outcome: RemoteRuntimeGapAck,
): RichChatHistoryNoticeState = when (outcome) {
    is RemoteRuntimeGapAck.Applied -> copy(
        notice = outcome.notice,
        descriptor = null,
        acknowledging = false,
        ackCommandId = null,
        ackToken = null,
        gapReadFailed = false,
    )
    is RemoteRuntimeGapAck.Already -> copy(
        notice = outcome.notice,
        descriptor = null,
        acknowledging = false,
        ackCommandId = null,
        ackToken = null,
    )
    is RemoteRuntimeGapAck.Stale -> copy(
        // The echoed token no longer matches: display the truthful current
        // episode (or clean) and never auto-acknowledge its replacement.
        descriptor = outcome.current,
        acknowledging = false,
        ackCommandId = null,
        ackToken = null,
    )
}

/**
 * Reads the actual unacknowledged episode after a failed declared history read.
 * Only ever dialed when the live environment advertised notices v1; the reply
 * is the recovery precondition and never an inferred descriptor.
 */
internal suspend fun RichChatController.readHistoryGapIfSupported(lease: RichChatThreadLease) {
    if (!lease.host.noticesSupported) return
    val token = owner.begin(OP_GAP_READ, lease)
    mutableState.update {
        it.copy(historyNotice = it.historyNotice.copy(readingGap = true, gapReadFailed = false))
    }
    val result = runOperation(lease, token, RichChatCapability.Read, false) {
        val read = sessionGateway.runtimeGap(lease.host, lease.threadId)
        if (!canPublish(lease, token)) return@runOperation RichChatOperationResult.Stale
        mutableState.update { it.copy(historyNotice = it.historyNotice.afterGapRead(read)) }
        RichChatOperationResult.Success(read)
    }
    if (result is RichChatOperationResult.Failed && isSelected(lease)) {
        mutableState.update {
            it.copy(historyNotice = it.historyNotice.copy(readingGap = false, gapReadFailed = true))
        }
    }
}

/**
 * The explicit acknowledgement action. The command id is derived from
 * `(connection, thread, episode token)` so an uncertain retry reuses exactly
 * the same pair; `already`/`stale` never replay, never auto-acknowledge a
 * replacement token, and never alter the transcript.
 */
internal suspend fun RichChatController.acknowledgeHistoryGap(): RichChatOperationResult<RemoteRuntimeGapAck> {
    val prepared = prepare(RichChatCapability.Operate) ?: return currentRejection()
    val descriptor = mutableState.value.historyNotice.descriptor
        ?: return RichChatOperationResult.Failed(RichChatOperationFailure.InvalidRequest)
    val commandId = gapAcknowledgeCommandId(prepared, descriptor.token)
    val token = owner.begin(OP_GAP_ACK, prepared)
    markActive(OP_GAP_ACK)
    mutableState.update {
        it.copy(
            historyNotice = it.historyNotice.copy(
                acknowledging = true,
                ackCommandId = commandId,
                ackToken = descriptor.token,
            ),
        )
    }
    val result = runOperation(prepared, token, RichChatCapability.Operate, true) {
        val outcome = sessionGateway.acknowledgeRuntimeGap(
            prepared.host,
            prepared.threadId,
            descriptor.token,
            commandId,
        )
        if (!canPublish(prepared, token)) return@runOperation RichChatOperationResult.Stale
        mutableState.update { state ->
            val applied = outcome is RemoteRuntimeGapAck.Applied
            state.copy(
                historyNotice = state.historyNotice.afterGapAck(outcome),
                activeOperations = state.activeOperations - OP_GAP_ACK,
                failure = null,
                // `applied` supersedes the accepted prefix host-side: one
                // authoritative re-read reinstates the tail with the notice.
                needsAuthoritativeRefresh = state.needsAuthoritativeRefresh || applied,
            )
        }
        RichChatOperationResult.Success(outcome)
    }
    if (result !is RichChatOperationResult.Success && isSelected(prepared)) {
        // Truthful and retryable: the descriptor and the retained command pair
        // stay visible; an uncertain outcome reuses the same command id.
        mutableState.update {
            it.copy(
                activeOperations = it.activeOperations - OP_GAP_ACK,
                historyNotice = it.historyNotice.copy(acknowledging = false),
            )
        }
    }
    return result
}

/** Stable per exact episode: a new token (or a post-`stale` re-read) is a new command. */
internal fun gapAcknowledgeCommandId(
    lease: RichChatThreadLease,
    episodeToken: String,
): String = "runtime-gap-ack.${lease.host.connectionId.value}.${lease.threadId}.$episodeToken"
