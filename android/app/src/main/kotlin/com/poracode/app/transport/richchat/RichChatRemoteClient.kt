package com.poracode.app.transport.richchat

import com.poracode.app.transport.ForegroundNetworkGate
import com.poracode.app.transport.RemoteApiClient
import com.poracode.app.transport.RemoteBinaryResponse
import okhttp3.OkHttpClient

/** Production rich-chat client. Its API client disables transparent connection retries. */
class RichChatRemoteClient(
    endpoint: String,
    accessToken: String,
    client: OkHttpClient = RemoteApiClient.defaultClient(),
    networkGate: ForegroundNetworkGate = ForegroundNetworkGate.shared,
) {
    private val http = RemoteApiClient(
        endpoint = endpoint,
        accessToken = accessToken,
        client = client,
        networkGate = networkGate,
    )
    private val bodyExecutor = RichChatRemoteBodyExecutor(http)
    val binary: RichChatBinaryBodyExecutor = bodyExecutor

    val transport: RichChatRemoteTransport = GeneratedRichChatRemoteTransport(http, bodyExecutor)

    suspend fun loadLocalImage(path: String): RemoteBinaryResponse {
        val plan = transport.localImageRequest(path)
        return bodyExecutor.execute(plan)
    }

    suspend fun loadRuntimeImage(
        threadId: String,
        itemId: String,
        path: List<RuntimeImagePathSegment>,
    ): RemoteBinaryResponse {
        val plan = transport.runtimeImageRequest(threadId, itemId, path)
        return bodyExecutor.execute(plan)
    }
}
