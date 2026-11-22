package com.poracode.app.protocol.settings

import com.poracode.app.model.RemoteClientException
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.remote.v3.generated.*
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

/**
 * Generated-codec contract for `refreshAgentStatuses` procedure (`POST /api/git/call`),
 * allowing Android Agents settings to trigger a fresh host CLI/auth discovery sweep.
 */
object RefreshAgentStatusesContract {
    const val PROCEDURE_NAME = "refreshAgentStatuses"
    const val PROCEDURE_PATH = "/api/git/call"
    private val json = Json { ignoreUnknownKeys = true; isLenient = false }

    fun encodeRequest(): String {
        if (RemoteContractMetadata.protocolVersion != ProtocolConstants.REMOTE_PROTOCOL_VERSION) {
            throw invalid("Incompatible protocol version.")
        }
        val canonicalPayload = canonical(
            RemoteRootCodecs.procedureU2ERefreshAgentStatusesU2ERequest,
            "{}",
        )
        val envelope = buildJsonObject {
            put("procedure", PROCEDURE_NAME)
            put("payload", json.parseToJsonElement(canonicalPayload))
        }
        return canonical(RemoteRootCodecs.routeU2EProcedureU2DCallU2ERequest, envelope.toString())
    }

    fun decodeResponse(rawJson: String): JsonObject {
        val root = json.parseToJsonElement(rawJson).jsonObject
        val resultElement = root["result"]
            ?: throw invalid("Missing result in refreshAgentStatuses response.")
        val canonicalResult = canonical(
            RemoteRootCodecs.procedureU2ERefreshAgentStatusesU2EResult,
            resultElement.toString(),
        )
        return json.parseToJsonElement(canonicalResult).jsonObject
    }

    private fun <T> canonical(codec: RemoteRootCodec<T>, rawJson: String): String = try {
        codec.encodeSnapshot(codec.decode(rawJson))
    } catch (error: Throwable) {
        throw invalid("Generated contract validation failed: ${error.message}")
    }

    private fun invalid(message: String): RemoteClientException =
        RemoteClientException(message = message, status = 400, code = "invalid_response")
}
