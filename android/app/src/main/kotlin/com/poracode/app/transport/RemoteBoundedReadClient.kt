package com.poracode.app.transport

import com.poracode.app.model.RemoteBoundedReadResult
import com.poracode.app.model.RemoteCatalogMembership
import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteProjectPage
import com.poracode.app.model.RemoteRuntimeItemsPage
import com.poracode.app.model.RemoteShellSnapshot
import com.poracode.app.model.RemoteThreadPage
import com.poracode.app.model.RemoteThreadSnapshot
import com.poracode.app.model.RemoteThreadTurnsPage

/**
 * B4 bounded reads over one [RemoteApiClient] endpoint. Inherits C1 dual
 * authority, bearer/token handling, certificate pinning, ETag revalidation,
 * timeouts, caller cancellation and response-evidence attribution from the
 * transport; no method is a mutation and none sends a command id.
 *
 * Caller mistakes (range, budget, duplicate membership ids) are typed local
 * 400 `invalid_reads_request` refusals before dispatch; host contract
 * violations remain `bounded_read_protocol_error`.
 */
internal class RemoteBoundedReadClient(
    private val client: RemoteApiClient,
) : RemoteBoundedReadGateway {

    override suspend fun boundedShellSnapshot(
        order: String,
        threadLimit: Int?,
        projectLimit: Int,
        summaries: Boolean,
        maxBytes: Long,
        maxDecodeBytes: Long,
    ): RemoteBoundedReadResult<RemoteShellSnapshot, RemoteShellSnapshot> {
        requireBudget(maxBytes, maxDecodeBytes)
        requireOrder(order)
        threadLimit?.let { requireRange(it, 1, RemoteBoundedWire.MAX_THREAD_LIMIT, "threadLimit") }
        requireRange(projectLimit, 1, RemoteBoundedWire.MAX_PROJECT_LIMIT, "projectLimit")
        val raw = client.requestText(
            path = RemoteBoundedWire.shellSnapshotPath,
            query = RemoteBoundedWire.shellSnapshotQuery(
                order = order,
                threadLimit = threadLimit,
                projectLimit = projectLimit,
                summaries = summaries,
                maxBytes = maxBytes,
                maxDecodeBytes = maxDecodeBytes,
            ),
        )
        return RemoteBoundedWire.shellSnapshot(raw)
    }

    override suspend fun boundedThreadPage(
        mode: String,
        order: String,
        cursor: String?,
        limit: Int,
        summaries: Boolean,
        maxBytes: Long,
        maxDecodeBytes: Long,
    ): RemoteBoundedReadResult<RemoteThreadPage, RemoteThreadPage> {
        requireBudget(maxBytes, maxDecodeBytes)
        requireMode(mode)
        if (mode != "inventory") requireOrder(order)
        requireRange(limit, 1, RemoteBoundedWire.MAX_THREAD_LIMIT, "limit")
        if (cursor != null && !RemoteBoundedWire.cursorPrefixMatches(
                cursor,
                if (mode == "inventory") RemoteBoundedWire.THREAD_INVENTORY
                else orderPrefix(order),
            )
        ) {
            throw RemoteBoundedWire.protocolError("cursor_mismatch")
        }
        val raw = client.requestText(
            path = RemoteBoundedWire.threadListPath,
            query = RemoteBoundedWire.threadListQuery(
                mode = mode,
                order = order,
                cursor = cursor,
                limit = limit,
                summaries = summaries,
                maxBytes = maxBytes,
                maxDecodeBytes = maxDecodeBytes,
            ),
        )
        return mapRouteUnavailable("thread-list") {
            RemoteBoundedWire.threadPage(raw, mode = mode, order = order, firstPage = cursor == null)
        }
    }

    override suspend fun boundedProjectPage(
        mode: String,
        cursor: String?,
        projectLimit: Int,
        maxBytes: Long,
        maxDecodeBytes: Long,
    ): RemoteProjectPage {
        requireBudget(maxBytes, maxDecodeBytes)
        requireMode(mode)
        requireRange(projectLimit, 1, RemoteBoundedWire.MAX_PROJECT_LIMIT, "projectLimit")
        if (cursor != null && !RemoteBoundedWire.cursorPrefixMatches(
                cursor,
                if (mode == "inventory") RemoteBoundedWire.PROJECT_INVENTORY
                else RemoteBoundedWire.PROJECT_PAINT,
            )
        ) {
            throw RemoteBoundedWire.protocolError("cursor_mismatch")
        }
        return mapRouteUnavailable("project-list") {
            val raw = client.requestText(
                path = RemoteBoundedWire.projectListPath,
                query = RemoteBoundedWire.projectListQuery(
                    mode = mode,
                    cursor = cursor,
                    projectLimit = projectLimit,
                    maxBytes = maxBytes,
                    maxDecodeBytes = maxDecodeBytes,
                ),
            )
            RemoteBoundedWire.projectPage(raw, mode = mode)
        }
    }

    override suspend fun boundedCatalogMembership(
        threadIds: List<String>,
        projectIds: List<String>,
    ): RemoteCatalogMembership {
        requireMembership(threadIds, "threadIds")
        requireMembership(projectIds, "projectIds")
        if (threadIds.isEmpty() && projectIds.isEmpty()) {
            throw invalidRequest("membership request must contain at least one id")
        }
        val raw = client.requestText(
            path = RemoteBoundedWire.membershipPath,
            method = "POST",
            jsonBody = RemoteBoundedWire.membershipRequestJson(threadIds, projectIds),
        )
        val page = RemoteBoundedWire.membership(raw)
        val allowedThreads = threadIds.toHashSet()
        val allowedProjects = projectIds.toHashSet()
        if (page.existingThreadIds.any { it !in allowedThreads } ||
            page.existingProjectIds.any { it !in allowedProjects }
        ) {
            throw RemoteBoundedWire.protocolError("membership_response_invalid")
        }
        return page
    }

    override suspend fun boundedThreadHistory(
        threadId: String,
        completedTurnsLimit: Int,
        targetTimelineEntryCount: Int?,
        omitScrollback: Boolean?,
        maxBytes: Long,
        maxDecodeBytes: Long,
    ): RemoteBoundedReadResult<RemoteThreadSnapshot, RemoteThreadSnapshot> {
        requireBudget(maxBytes, maxDecodeBytes)
        requireRange(completedTurnsLimit, 1, 500, "completedTurnsLimit")
        targetTimelineEntryCount?.let { requireRange(it, 1, 100, "targetTimelineEntryCount") }
        val raw = client.requestText(
            path = RemoteBoundedWire.threadHistoryPath(threadId),
            query = RemoteBoundedWire.threadHistoryQuery(
                completedTurnsLimit = completedTurnsLimit,
                targetTimelineEntryCount = targetTimelineEntryCount,
                omitScrollback = omitScrollback,
                maxBytes = maxBytes,
                maxDecodeBytes = maxDecodeBytes,
                notices = client.runtimeHistoryNoticesSupported,
            ),
        )
        return RemoteBoundedWire.threadHistory(raw)
    }

    override suspend fun boundedThreadHistoryItems(
        threadId: String,
        beforePosition: Int?,
        limit: Int,
        targetTimelineEntryCount: Int?,
        maxBytes: Long,
        maxDecodeBytes: Long,
    ): RemoteBoundedReadResult<RemoteRuntimeItemsPage, RemoteRuntimeItemsPage> {
        requireBudget(maxBytes, maxDecodeBytes)
        requireRange(limit, 1, 500, "limit")
        beforePosition?.let { requireRange(it, 0, Int.MAX_VALUE, "beforePosition") }
        targetTimelineEntryCount?.let { requireRange(it, 1, 100, "targetTimelineEntryCount") }
        val raw = client.requestText(
            path = RemoteBoundedWire.historyItemsPath(threadId),
            query = RemoteBoundedWire.historyItemsQuery(
                beforePosition = beforePosition,
                limit = limit,
                targetTimelineEntryCount = targetTimelineEntryCount,
                maxBytes = maxBytes,
                maxDecodeBytes = maxDecodeBytes,
                notices = client.runtimeHistoryNoticesSupported,
            ),
        )
        return RemoteBoundedWire.historyItems(raw, firstPage = beforePosition == null)
    }

    override suspend fun boundedThreadTurns(
        threadId: String,
        cursor: String?,
        limit: Int,
        maxBytes: Long,
        maxDecodeBytes: Long,
    ): RemoteThreadTurnsPage {
        requireBudget(maxBytes, maxDecodeBytes)
        requireRange(limit, 1, RemoteBoundedWire.MAX_TURNS_LIMIT, "limit")
        if (cursor != null && !RemoteBoundedWire.cursorPrefixMatches(cursor, RemoteBoundedWire.TURNS)) {
            throw RemoteBoundedWire.protocolError("cursor_mismatch")
        }
        return mapRouteUnavailable("thread-turns") {
            val raw = client.requestText(
                path = RemoteBoundedWire.threadTurnsPath(threadId),
                query = RemoteBoundedWire.threadTurnsQuery(
                    cursor = cursor,
                    limit = limit,
                    maxBytes = maxBytes,
                    maxDecodeBytes = maxDecodeBytes,
                    notices = client.runtimeHistoryNoticesSupported,
                ),
            )
            RemoteBoundedWire.threadTurns(raw)
        }
    }

    private suspend fun <T> mapRouteUnavailable(route: String, block: suspend () -> T): T = try {
        block()
    } catch (error: RemoteClientException) {
        if (error.isNotFound || error.code == "invalid_reads_capability") {
            throw RemoteBoundedWire.routeUnavailable(route)
        }
        throw error
    }

    private fun orderPrefix(order: String): String = when (order) {
        "updated" -> RemoteBoundedWire.THREAD_PAINT_UPDATED
        "created" -> RemoteBoundedWire.THREAD_PAINT_CREATED
        else -> RemoteBoundedWire.THREAD_PAINT_MANUAL
    }

    private fun requireOrder(order: String) {
        if (order !in setOf("manual", "updated", "created")) {
            throw invalidRequest("unsupported order: $order")
        }
    }

    private fun requireMode(mode: String) {
        if (mode !in setOf("page", "inventory")) {
            throw invalidRequest("unsupported mode: $mode")
        }
    }

    private fun requireBudget(maxBytes: Long, maxDecodeBytes: Long) {
        if (maxBytes < 1 || maxDecodeBytes < 1) {
            throw invalidRequest("byte budgets must be positive")
        }
    }

    private fun requireRange(value: Int, min: Int, max: Int, name: String) {
        if (value < min || value > max) {
            throw invalidRequest("$name is outside $min..$max")
        }
    }

    private fun requireMembership(ids: List<String>, name: String) {
        if (ids.size > RemoteBoundedWire.MAX_MEMBERSHIP_IDS) {
            throw invalidRequest("$name exceeds ${RemoteBoundedWire.MAX_MEMBERSHIP_IDS} ids")
        }
        if (ids.any { it.isEmpty() }) throw invalidRequest("$name contains an empty id")
        if (ids.toHashSet().size != ids.size) throw invalidRequest("$name contains duplicate ids")
    }

    private fun invalidRequest(message: String): RemoteClientException =
        RemoteClientException(message, status = 400, code = "invalid_reads_request")
}
