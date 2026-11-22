package com.poracode.app.transport.settings

import com.poracode.app.protocol.settings.RefreshAgentStatusesContract
import com.poracode.app.transport.RemoteApiClient
import kotlinx.serialization.json.JsonObject

/**
 * Generated-codec HTTP client for the `refreshAgentStatuses` desktop procedure.
 */
class RefreshAgentStatusesClient(
    private val http: RemoteApiClient,
) {
    suspend fun refresh(): JsonObject {
        val body = RefreshAgentStatusesContract.encodeRequest()
        val raw = http.requestText(
            path = RefreshAgentStatusesContract.PROCEDURE_PATH,
            method = "POST",
            jsonBody = body,
            timeoutMs = 30_000L,
            retryableRead = false,
        )
        return RefreshAgentStatusesContract.decodeResponse(raw)
    }
}
