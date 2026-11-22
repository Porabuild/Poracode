package com.poracode.app.transport

import com.poracode.app.model.RemoteBoundedReadCodes
import com.poracode.app.model.RemoteBoundedReadResult
import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteRuntimeItemsPage
import com.poracode.app.model.RemoteThreadSnapshot
import com.poracode.app.model.RemoteThreadTurnsPage
import com.poracode.app.session.history.NativeHistoryReadRetry
import com.poracode.app.session.history.NativeRecentHistoryCache
import com.poracode.app.session.history.NativeRecentHistoryTail
import com.poracode.app.transport.environments.EnvironmentRequestCoordinator
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull

/**
 * Interactive GUI history reads on top of [RemoteApiClient] and
 * [RemoteBoundedReadClient], matching iOS `RemoteBoundedTransport` +
 * `RemoteHistoryItemTransport`:
 *
 * - Durable recent-history tail validation (`historyCache=v1`, `historyRevision`)
 *   with SHA-256 authority-scoped namespaces and coalesced background disk writes
 * - Compact deferred-body projection (`projection=details-v1`, `deferBodies=file_change`)
 *   on initial tail, warm resume, and older next-pages
 * - Incremental warm resume (`GET /api/threads/:id/history/changes`)
 * - Automatic `omitScrollback=true` when `terminalCursorSync` v2 is advertised
 * - Bounded read-only transient retries (`NativeHistoryReadRetry`)
 */
internal class RemoteInteractiveHistoryClient(
    private val client: RemoteApiClient,
    private val boundedClient: RemoteBoundedReadClient,
    private val environment: EnvironmentRequestCoordinator,
    private val recentHistoryCache: NativeRecentHistoryCache,
    private val readAuthorityEpoch: () -> Long,
    private val readDesktopId: () -> String?,
    private val readAccessToken: () -> String?,
) {
    private data class ReadContext(
        val epoch: Long,
        val namespace: String?,
        val candidate: NativeRecentHistoryTail?,
        val cacheGeneration: Long?,
    )

    suspend fun interactiveThreadHistory(
        threadId: String,
        targetTimelineEntryCount: Int?,
    ): RemoteBoundedReadResult<RemoteThreadSnapshot, RemoteThreadSnapshot> {
        val context = beginRead(threadId, includeCandidate = true)
        val outcome = NativeHistoryReadRetry.run(
            validateBeforeAttempt = { validateRead(context) },
        ) {
            boundedClient.readBoundedThreadHistory(
                threadId = threadId,
                completedTurnsLimit = RemoteBoundedReadGateway.DEFAULT_COMPLETED_TURNS_LIMIT,
                targetTimelineEntryCount = targetTimelineEntryCount,
                omitScrollback = if (client.terminalCursorSyncV2Advertised) true else null,
                historyCache = context.namespace != null,
                historyRevision = context.candidate?.revision,
                compactDetails = true,
            )
        }
        currentCoroutineContext().ensureActive()
        return when (outcome) {
            is RemoteBoundedReadResult.Bounded -> {
                var page = outcome.page
                if (page.thread.id != threadId) {
                    throw RemoteBoundedWire.protocolError("history_thread_mismatch")
                }
                if (isCacheUnchanged(page)) {
                    val candidate = context.candidate
                        ?: throw RemoteBoundedWire.protocolError("history_cache_missing_candidate")
                    page = candidate.mergingValidated(page, expectedThreadId = threadId)
                }
                finishRead(context, page)
                RemoteBoundedReadResult.Bounded(page)
            }
            is RemoteBoundedReadResult.Legacy -> {
                val snapshot = outcome.page
                if (isCacheUnchanged(snapshot) || snapshot.thread.id != threadId) {
                    throw RemoteBoundedWire.protocolError("legacy_history_invalid")
                }
                finishRead(context, snapshot)
                RemoteBoundedReadResult.Legacy(snapshot)
            }
        }
    }

    suspend fun interactiveHistoryItems(
        threadId: String,
        beforePosition: Int?,
        limit: Int,
        targetTimelineEntryCount: Int?,
    ): RemoteBoundedReadResult<RemoteRuntimeItemsPage, RemoteRuntimeItemsPage> {
        val context = beginRead(threadId, includeCandidate = false)
        val outcome = NativeHistoryReadRetry.run(
            validateBeforeAttempt = { validateRead(context) },
        ) {
            boundedClient.readBoundedHistoryItems(
                threadId = threadId,
                beforePosition = beforePosition,
                limit = limit,
                targetTimelineEntryCount = targetTimelineEntryCount,
                compactDetails = true,
            )
        }
        validateRead(context)
        return outcome
    }

    suspend fun interactiveThreadTurns(
        threadId: String,
        cursor: String?,
        limit: Int,
    ): RemoteThreadTurnsPage {
        val context = beginRead(threadId, includeCandidate = false)
        val page = NativeHistoryReadRetry.run(
            validateBeforeAttempt = { validateRead(context) },
        ) {
            boundedClient.boundedThreadTurns(
                threadId = threadId,
                cursor = cursor,
                limit = limit,
            )
        }
        validateRead(context)
        return page
    }

    suspend fun threadHistoryChanges(
        threadId: String,
        cursor: String,
        afterSeq: Int?,
        targetTimelineEntryCount: Int?,
    ): RemoteHistoryResumeOutcome {
        val context = beginRead(threadId, includeCandidate = false)
        val path = RemoteHistoryChangesContract.path(threadId)
        val query = RemoteHistoryChangesContract.query(
            cursor = cursor,
            afterSeq = afterSeq,
            targetTimelineEntryCount = targetTimelineEntryCount,
            omitScrollback = if (client.terminalCursorSyncV2Advertised) true else null,
            maxBytes = RemoteBoundedReadGateway.DEFAULT_MAX_WIRE_BYTES,
            maxDecodeBytes = RemoteBoundedReadGateway.DEFAULT_MAX_DECODE_BYTES,
        )
        val raw = NativeHistoryReadRetry.run(
            validateBeforeAttempt = { validateRead(context) },
        ) {
            client.requestText(
                path = path,
                query = query,
                retryableRead = true,
            )
        }
        val outcome = RemoteHistoryChangesContract.parseResponse(raw, expectedThreadId = threadId)
        when (outcome) {
            is RemoteHistoryResumeOutcome.Snapshot -> finishRead(context, outcome.snapshot)
            is RemoteHistoryResumeOutcome.Events -> validateRead(context)
        }
        return outcome
    }

    private suspend fun beginRead(threadId: String, includeCandidate: Boolean): ReadContext {
        val epoch = readAuthorityEpoch()
        val namespace = recentHistoryNamespace()
        currentCoroutineContext().ensureActive()
        if (epoch != readAuthorityEpoch()) throw CancellationException("Authority changed")
        val candidate = if (includeCandidate && namespace != null) {
            recentHistoryCache.candidate(namespace, threadId)
        } else {
            null
        }
        currentCoroutineContext().ensureActive()
        if (epoch != readAuthorityEpoch()) throw CancellationException("Authority changed")
        return ReadContext(
            epoch = epoch,
            namespace = namespace,
            candidate = candidate?.tail,
            cacheGeneration = candidate?.generation,
        )
    }

    private suspend fun finishRead(context: ReadContext, snapshot: RemoteThreadSnapshot) {
        validateRead(context)
        if (!isCacheUnchanged(snapshot)) {
            val namespace = context.namespace
            val tail = if (namespace != null) NativeRecentHistoryTail.fromSnapshot(snapshot) else null
            if (namespace != null && tail != null) {
                recentHistoryCache.enqueue(
                    tail = tail,
                    namespace = namespace,
                    threadId = snapshot.thread.id,
                    expectedGeneration = context.cacheGeneration,
                )
            }
        }
        validateRead(context)
    }

    private suspend fun validateRead(context: ReadContext) {
        currentCoroutineContext().ensureActive()
        val namespace = recentHistoryNamespace()
        if (context.epoch != readAuthorityEpoch() || context.namespace != namespace) {
            throw CancellationException("History read authority changed")
        }
    }

    private suspend fun recentHistoryNamespace(): String? {
        val token = readAccessToken()?.takeIf { it.isNotEmpty() } ?: return null
        val desktopId = readDesktopId()?.takeIf { it.isNotEmpty() } ?: return null
        val components = mutableListOf(client.httpEndpoint, desktopId, token)
        val envAuthority = environment.authority()
        if (envAuthority != null) {
            val parentToken = envAuthority.parentAccessToken()?.takeIf { it.isNotEmpty() }
                ?: return null
            components += envAuthority.environmentId
            components += envAuthority.childDesktopId.orEmpty()
            components += parentToken
        }
        return NativeRecentHistoryCache.digest(components)
    }

    private fun isCacheUnchanged(snapshot: RemoteThreadSnapshot): Boolean =
        (snapshot.historyCache?.get("unchanged") as? JsonPrimitive)?.booleanOrNull == true
}
