package com.poracode.app.transport

import com.poracode.app.model.RemoteAccessTokenResult
import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteEnvironmentDescriptor
import com.poracode.app.model.RemoteJson
import com.poracode.app.model.RemoteRuntimeItemsPage
import com.poracode.app.model.RemoteShellSnapshot
import com.poracode.app.model.RemoteThreadSnapshot
import com.poracode.app.model.RemoteWebSocketTicketResult
import com.poracode.app.protocol.GeneratedRemoteV3Contract
import kotlinx.serialization.KSerializer

/** Projects canonical generated snapshots into the app's stable transport domain. */
internal object RemoteV3TransportAdapters {
    fun environment(raw: String, legacy: Boolean): RemoteEnvironmentDescriptor = project(
        GeneratedRemoteV3Contract.environmentResponse(raw, legacy),
        RemoteEnvironmentDescriptor.serializer(),
        "environment",
    )

    fun token(raw: String): RemoteAccessTokenResult = project(
        GeneratedRemoteV3Contract.tokenExchangeResponse(raw),
        RemoteAccessTokenResult.serializer(),
        "token exchange",
    )

    fun snapshot(raw: String): RemoteShellSnapshot = project(
        GeneratedRemoteV3Contract.shellSnapshotResponse(raw),
        RemoteShellSnapshot.serializer(),
        "shell snapshot",
    )

    fun threadHistory(raw: String): RemoteThreadSnapshot = project(
        GeneratedRemoteV3Contract.threadHistoryResponse(raw),
        RemoteThreadSnapshot.serializer(),
        "thread history",
    )

    fun historyItems(raw: String): RemoteRuntimeItemsPage = project(
        GeneratedRemoteV3Contract.historyItemsResponse(raw),
        RemoteRuntimeItemsPage.serializer(),
        "thread history items",
    )

    fun websocketTicket(raw: String): RemoteWebSocketTicketResult = project(
        GeneratedRemoteV3Contract.websocketTicketResponse(raw),
        RemoteWebSocketTicketResult.serializer(),
        "websocket ticket",
    )

    private fun <T> project(raw: String, serializer: KSerializer<T>, boundary: String): T = try {
        RemoteJson.decodeFromString(serializer, raw)
    } catch (_: Exception) {
        throw RemoteClientException.invalidResponse(
            "Remote contract projection failed at $boundary.",
        )
    }
}
