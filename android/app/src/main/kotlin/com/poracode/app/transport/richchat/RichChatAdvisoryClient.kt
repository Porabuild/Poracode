package com.poracode.app.transport.richchat

import com.poracode.app.chat.RichRuntimeItem
import com.poracode.app.model.RemoteClientException
import com.poracode.app.protocol.richchat.ResolvedToolBodyRecord
import com.poracode.app.protocol.richchat.RuntimeItemHeadingRecord
import com.poracode.app.protocol.richchat.RuntimeItemHeadingRequest
import com.poracode.app.protocol.richchat.RuntimeItemPresentationContract
import com.poracode.app.transport.RemoteApiClient
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/**
 * Generated-codec advisory read client for `thread-item-presentations` (V1-V5 headings,
 * resolved tool bodies, workflow plans) and `thread-history-item` (deferred large items).
 */
class RichChatAdvisoryClient(
    private val http: RemoteApiClient,
) {
    suspend fun readRuntimeItemHeadings(
        threadId: String,
        requests: List<RuntimeItemHeadingRequest>,
    ): List<RuntimeItemHeadingRecord> {
        if (requests.isEmpty()) return emptyList()
        val version = requests.first().version
        val prepared = RuntimeItemPresentationContract.presentationsRequest(threadId, requests)
        val encodedThreadId = URLEncoder.encode(
            prepared.pathValues.getValue("threadId"),
            StandardCharsets.UTF_8.name(),
        ).replace("+", "%20")
        val path = RuntimeItemPresentationContract.presentationsRoutePath
            .replace("{threadId}", encodedThreadId)
        val text = http.requestText(
            path = path,
            method = "POST",
            query = RuntimeItemPresentationContract.presentationsQuery(),
            jsonBody = prepared.body,
            retryableRead = true,
        )
        return RuntimeItemPresentationContract.parseHeadings(
            rawBytes = text.toByteArray(StandardCharsets.UTF_8),
            expectedVersion = version,
        )
    }

    suspend fun readRuntimeToolBodies(
        threadId: String,
        requests: List<RuntimeItemHeadingRequest>,
    ): List<ResolvedToolBodyRecord> {
        if (requests.isEmpty()) return emptyList()
        val v5 = requests.map { it.copy(version = 5) }
        val prepared = RuntimeItemPresentationContract.presentationsRequest(threadId, v5)
        val encodedThreadId = URLEncoder.encode(
            prepared.pathValues.getValue("threadId"),
            StandardCharsets.UTF_8.name(),
        ).replace("+", "%20")
        val path = RuntimeItemPresentationContract.presentationsRoutePath
            .replace("{threadId}", encodedThreadId)
        val text = http.requestText(
            path = path,
            method = "POST",
            query = RuntimeItemPresentationContract.presentationsQuery(),
            jsonBody = prepared.body,
            retryableRead = true,
        )
        return RuntimeItemPresentationContract.parseToolBodies(
            rawBytes = text.toByteArray(StandardCharsets.UTF_8),
        )
    }

    suspend fun readHistoryItem(
        threadId: String,
        itemId: String,
    ): RichRuntimeItem {
        val path = RuntimeItemPresentationContract.historyItemPath(threadId, itemId)
        val text = http.requestText(
            path = path,
            method = "GET",
            query = RuntimeItemPresentationContract.historyItemQuery(),
            retryableRead = true,
        )
        return RuntimeItemPresentationContract.parseHistoryItemResponse(
            text.toByteArray(StandardCharsets.UTF_8),
        )
    }

    companion object {
        fun isUnsupported(error: Throwable): Boolean =
            error is RemoteClientException && (error.status == 404 || error.status == 501)
    }
}
