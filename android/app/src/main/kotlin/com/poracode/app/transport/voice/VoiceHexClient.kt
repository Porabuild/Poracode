package com.poracode.app.transport.voice

import com.poracode.app.protocol.voice.HexVoiceContract
import com.poracode.app.transport.RemoteApiClient
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Generated-codec transport client for the `hexVoice` desktop procedure.
 */
class VoiceHexClient(
    private val http: RemoteApiClient,
) {
    suspend fun call(payload: JsonObject): JsonObject {
        val body = HexVoiceContract.encodeRequest(payload)
        val raw = http.requestText(
            path = HexVoiceContract.PROCEDURE_PATH,
            method = "POST",
            jsonBody = body,
            timeoutMs = 30_000L,
            retryableRead = false,
        )
        return HexVoiceContract.decodeResponse(raw)
    }

    suspend fun setup(): JsonObject = call(buildJsonObject { put("action", "setup") })
}
