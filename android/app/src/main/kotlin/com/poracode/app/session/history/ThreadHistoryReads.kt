package com.poracode.app.session.history

import com.poracode.app.model.RemoteBoundedReadResult
import com.poracode.app.model.RemoteCompletedTurn
import com.poracode.app.model.RemoteRuntimeItemsPage
import com.poracode.app.model.RemoteThreadSnapshot
import com.poracode.app.model.RemoteThreadTurnsPage
import com.poracode.app.model.boundedPageOrProtocolError
import com.poracode.app.transport.RemoteApiGateway
import com.poracode.app.transport.RemoteBoundedReadGateway
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext

/**
 * Thread-history reads with the negotiated bounded shapes. The caller owns the
 * legacy/bounded decision from the shell negotiation: a legacy host keeps the
 * existing `threadHistory`/`threadRuntimeItemsPage` calls, and a bounded host
 * gets the tail + `beforePosition`/`ct1.` continuations. A bounded host that
 * stops echoing the capability is a protocol error, never a silent downgrade.
 */
internal suspend fun loadThreadHistoryTail(
    api: RemoteApiGateway,
    threadId: String,
    targetTimelineEntryCount: Int?,
    bounded: Boolean,
    ioDispatcher: CoroutineDispatcher,
    completedTurnsLimit: Int = DEFAULT_COMPLETED_TURNS_LIMIT,
): RemoteThreadSnapshot {
    val gateway = api as? RemoteBoundedReadGateway
    if (!bounded || gateway == null) {
        return withContext(ioDispatcher) {
            api.threadHistory(threadId = threadId, targetTimelineEntryCount = targetTimelineEntryCount)
        }
    }
    return withContext(ioDispatcher) {
        gateway.boundedThreadHistory(
            threadId = threadId,
            completedTurnsLimit = completedTurnsLimit,
            targetTimelineEntryCount = targetTimelineEntryCount,
        ).boundedPageOrProtocolError()
    }
}

internal suspend fun loadOlderHistoryItems(
    api: RemoteApiGateway,
    threadId: String,
    beforePosition: Int,
    limit: Int,
    targetTimelineEntryCount: Int?,
    bounded: Boolean,
    ioDispatcher: CoroutineDispatcher,
): RemoteRuntimeItemsPage {
    val gateway = api as? RemoteBoundedReadGateway
    if (!bounded || gateway == null) {
        return withContext(ioDispatcher) {
            api.threadRuntimeItemsPage(
                threadId = threadId,
                beforePosition = beforePosition,
                limit = limit,
                targetTimelineEntryCount = targetTimelineEntryCount,
            )
        }
    }
    return withContext(ioDispatcher) {
        gateway.boundedThreadHistoryItems(
            threadId = threadId,
            beforePosition = beforePosition,
            limit = limit,
            targetTimelineEntryCount = targetTimelineEntryCount,
        ).boundedPageOrProtocolError()
    }
}

/** `thread-turns` exists only on declared hosts; older-turn continuation is bounded-only. */
internal suspend fun loadOlderCompletedTurns(
    api: RemoteApiGateway,
    threadId: String,
    cursor: String,
    limit: Int,
    ioDispatcher: CoroutineDispatcher,
): RemoteThreadTurnsPage = withContext(ioDispatcher) {
    api.historyTurns(threadId = threadId, cursor = cursor, limit = limit)
}

/**
 * One `ct1.` older-turn page. A legacy host never returned a continuation
 * cursor, so a call here is the declared-only route refusal, never a silent
 * downgrade to an assembled full read.
 */
internal suspend fun RemoteApiGateway.historyTurns(
    threadId: String,
    cursor: String,
    limit: Int,
): RemoteThreadTurnsPage {
    val gateway = this as? RemoteBoundedReadGateway
        ?: throw com.poracode.app.model.RemoteClientException(
            "This host does not provide older completed turns.",
            status = 404,
            code = com.poracode.app.model.RemoteBoundedReadCodes.ROUTE_UNAVAILABLE,
        )
    return gateway.boundedThreadTurns(threadId = threadId, cursor = cursor, limit = limit)
}

/**
 * In-place history refresh merge: the incoming tail replaces the tail level
 * while previously loaded older turns survive by `(startedAt, endedAt)`.
 */
internal fun mergeRefreshedHistory(
    current: RemoteThreadSnapshot?,
    incoming: RemoteThreadSnapshot,
): RemoteThreadSnapshot {
    if (current == null || current.thread.id != incoming.thread.id) return incoming
    if (current.completedTurns.isEmpty()) return incoming
    return incoming.copy(
        completedTurns = CompletedTurns.mergeTail(current.completedTurns, incoming.completedTurns),
    )
}

/** Appends one older `ct1.` page, preserving every already-loaded turn. */
internal fun appendOlderTurns(
    current: RemoteThreadSnapshot,
    older: List<RemoteCompletedTurn>,
    nextCursor: String?,
): RemoteThreadSnapshot = current.copy(
    completedTurns = CompletedTurns.mergeOlder(
        current.completedTurns,
        older.map(CompletedTurns::toJson),
    ),
    completedTurnsNextCursor = nextCursor,
)

internal const val DEFAULT_COMPLETED_TURNS_LIMIT = 200
internal const val OLDER_TURNS_PAGE_LIMIT = 200

/**
 * Bounded-aware history read: a bounded-capable transport negotiates the
 * bounded tail (byte budgets + `completedTurnsLimit`); an older host keeps the
 * existing `runtimePage=1` tail unchanged. Never a silent bulk downgrade: on a
 * declared host a missing echo is the client's protocol error.
 */
internal suspend fun RemoteApiGateway.historyTail(
    threadId: String,
    targetTimelineEntryCount: Int,
): com.poracode.app.model.RemoteThreadSnapshot {
    val bounded = this as? RemoteBoundedReadGateway
        ?: return threadHistory(threadId, targetTimelineEntryCount)
    return when (
        val result = bounded.boundedThreadHistory(
            threadId = threadId,
            targetTimelineEntryCount = targetTimelineEntryCount,
        )
    ) {
        is RemoteBoundedReadResult.Bounded -> result.page
        is RemoteBoundedReadResult.Legacy -> result.page
    }
}

/** Same negotiation for older runtime-item pages. */
internal suspend fun RemoteApiGateway.historyItems(
    threadId: String,
    beforePosition: Int,
    limit: Int,
    targetTimelineEntryCount: Int,
): com.poracode.app.model.RemoteRuntimeItemsPage {
    val bounded = this as? RemoteBoundedReadGateway
        ?: return threadRuntimeItemsPage(threadId, beforePosition, limit, targetTimelineEntryCount)
    return when (
        val result = bounded.boundedThreadHistoryItems(
            threadId = threadId,
            beforePosition = beforePosition,
            limit = limit,
            targetTimelineEntryCount = targetTimelineEntryCount,
        )
    ) {
        is RemoteBoundedReadResult.Bounded -> result.page
        is RemoteBoundedReadResult.Legacy -> result.page
    }
}
