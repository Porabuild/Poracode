package com.poracode.app.transport.threads

import com.poracode.app.model.threads.ExistingThreadStartRequest
import com.poracode.app.model.threads.ThreadLifecycleCommand
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.protocol.threads.GeneratedRemoteV3ThreadLifecycleContract
import com.poracode.app.transport.ForegroundNetworkGate
import com.poracode.app.transport.RemoteApiClient
import java.net.URLEncoder
import okhttp3.OkHttpClient

/** Generated-codec-validated thread lifecycle client with automatic retries disabled. */
class ThreadLifecycleRemoteApiClient private constructor(
    private val http: RemoteApiClient,
) : ThreadLifecycleRemoteGateway {
    constructor(
        endpoint: String,
        accessToken: String,
        client: OkHttpClient = RemoteApiClient.defaultClient(),
        networkGate: ForegroundNetworkGate = ForegroundNetworkGate.shared,
    ) : this(
        RemoteApiClient(
            endpoint = endpoint,
            accessToken = accessToken,
            client = client.newBuilder().retryOnConnectionFailure(false).build(),
            networkGate = networkGate,
        ),
    )

    override suspend fun startExisting(request: ExistingThreadStartRequest): String {
        val response = http.requestText(
            path = "/api/threads/start",
            method = "POST",
            jsonBody = GeneratedRemoteV3ThreadLifecycleContract.startExistingRequest(request),
            extraHeaders = mapOf(
                ProtocolConstants.COMMAND_ID_HEADER to request.commandId.value,
            ),
        )
        return GeneratedRemoteV3ThreadLifecycleContract.startExistingResponse(response)
    }

    override suspend fun command(command: ThreadLifecycleCommand) {
        val threadId = GeneratedRemoteV3ThreadLifecycleContract.commandPath(command.threadId)
        val response = http.requestText(
            path = "/api/threads/${encodePath(threadId)}/command",
            method = "POST",
            jsonBody = GeneratedRemoteV3ThreadLifecycleContract.commandRequest(command),
            extraHeaders = command.commandId?.let {
                mapOf(ProtocolConstants.COMMAND_ID_HEADER to it.value)
            }.orEmpty(),
        )
        GeneratedRemoteV3ThreadLifecycleContract.commandResponse(response)
    }

    private fun encodePath(value: String): String =
        URLEncoder.encode(value, Charsets.UTF_8.name()).replace("+", "%20")
}
