package com.poracode.app.transport.richchat

import com.poracode.remote.v3.generated.RemoteRootCodec
import com.poracode.remote.v3.generated.RemoteRootCodecs
import com.poracode.remote.v3.generated.procedureU2EInvokeThreadSessionActionU2ERequest
import com.poracode.remote.v3.generated.procedureU2EInvokeThreadSessionActionU2EResult
import com.poracode.remote.v3.generated.procedureU2EListThreadSessionActionsU2ERequest
import com.poracode.remote.v3.generated.procedureU2EListThreadSessionActionsU2EResult
import com.poracode.remote.v3.generated.routeU2EProcedureU2DCallU2ERequest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Canonical request/response codecs for the two optional session-action
 * procedure verbs. The shared hash-free facade owns the closed procedure set,
 * and these verbs are wired against the canonical generated types without
 * forking protocol shapes. A 2xx answer means the action ran, so an unusable
 * body is an invalid response — never a fake result and never a retry.
 */
internal object GeneratedRichChatSessionActionCodec {
    fun request(name: String, payload: JsonObject): String {
        val payloadCodec = when (name) {
            "listThreadSessionActions" -> RemoteRootCodecs.procedureU2EListThreadSessionActionsU2ERequest
            "invokeThreadSessionAction" -> RemoteRootCodecs.procedureU2EInvokeThreadSessionActionU2ERequest
            else -> throw RichChatInvalidRequestException("Unknown session-action procedure.")
        }
        val canonicalPayload = canonical(payloadCodec, payload.toString())
        return canonical(
            RemoteRootCodecs.routeU2EProcedureU2DCallU2ERequest,
            buildJsonObject {
                put("procedure", name)
                put("payload", Json.parseToJsonElement(canonicalPayload))
            }.toString(),
        )
    }

    fun response(name: String, raw: String): JsonObject {
        val envelope = elementOrInvalid(raw)
        if (envelope.keys != setOf("result")) {
            throw RichChatInvalidResponseException()
        }
        val resultCodec = when (name) {
            "listThreadSessionActions" -> RemoteRootCodecs.procedureU2EListThreadSessionActionsU2EResult
            "invokeThreadSessionAction" -> RemoteRootCodecs.procedureU2EInvokeThreadSessionActionU2EResult
            else -> throw RichChatInvalidRequestException("Unknown session-action procedure.")
        }
        val result = canonical(resultCodec, envelope.getValue("result").toString())
        return elementOrInvalid(result)
    }

    private fun canonical(codec: RemoteRootCodec<*>, raw: String): String = try {
        codec.decode(raw).validatedSnapshot.toString()
    } catch (_: Exception) {
        throw RichChatInvalidResponseException()
    }

    private fun elementOrInvalid(raw: String): JsonObject = try {
        Json.parseToJsonElement(raw) as? JsonObject
    } catch (_: Exception) {
        null
    } ?: throw RichChatInvalidResponseException()
}
