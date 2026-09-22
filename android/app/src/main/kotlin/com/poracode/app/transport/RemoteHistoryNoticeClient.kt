package com.poracode.app.transport

import com.poracode.app.model.RemoteHistoryNoticeCodes
import com.poracode.app.model.RemoteRuntimeGapAck
import com.poracode.app.model.RemoteRuntimeGapRead
import com.poracode.app.protocol.GeneratedRemoteV3Contract
import java.net.URLEncoder

/**
 * B1 declared-only durable-gap recovery over one [RemoteApiClient] endpoint.
 *
 * Both routes require `notices=v1` (a writer is always a client that declared
 * it can render the notice) and the acknowledgement carries the standard
 * `x-poracode-command-id` receipt. Callers may only invoke these after the
 * host advertised `capabilities.runtimeHistoryNotices`; the capability itself
 * is observed on this same client by [RemoteApiClient.environment].
 */
internal class RemoteHistoryNoticeClient(
    private val client: RemoteApiClient,
) : RemoteHistoryNoticeGateway {

    override val runtimeHistoryNoticesSupported: Boolean
        get() = client.runtimeHistoryNoticesSupported

    override suspend fun threadRuntimeGap(threadId: String): RemoteRuntimeGapRead {
        val route = GeneratedRemoteV3Contract.runtimeGapRoute(threadId)
        val path = "/api/threads/${encodePath(route.threadId)}/runtime/gap"
        return RemoteV3TransportAdapters.runtimeGap(client.requestText(path, query = route.query))
    }

    override suspend fun acknowledgeThreadRuntimeGap(
        threadId: String,
        episodeToken: String,
        commandId: String,
    ): RemoteRuntimeGapAck {
        val path = "/api/threads/${encodePath(
            GeneratedRemoteV3Contract.runtimeGapAcknowledgePath(threadId),
        )}/runtime/gap/acknowledge"
        val raw = client.requestText(
            path = path,
            method = "POST",
            query = GeneratedRemoteV3Contract.runtimeGapAcknowledgeQuery(),
            jsonBody = GeneratedRemoteV3Contract.runtimeGapAcknowledgeRequest(threadId, episodeToken),
            extraHeaders = mapOf(RemoteHistoryNoticeCodes.COMMAND_ID_HEADER to commandId),
        )
        return RemoteV3TransportAdapters.runtimeGapAck(raw)
    }

    private fun encodePath(value: String): String =
        URLEncoder.encode(value, "UTF-8").replace("+", "%20")
}
