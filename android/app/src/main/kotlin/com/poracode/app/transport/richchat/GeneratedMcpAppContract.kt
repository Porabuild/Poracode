package com.poracode.app.transport.richchat

import com.poracode.remote.v3.generated.RemoteRootCodecs
import com.poracode.remote.v3.generated.procedureU2EControlMcpAppU2ERequest
import com.poracode.remote.v3.generated.procedureU2EControlMcpAppU2EResult
import com.poracode.remote.v3.generated.routeU2EProcedureU2DCallU2ERequest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

internal object GeneratedMcpAppContract {
    fun request(payload: JsonObject): String {
        val canonical = RemoteRootCodecs.procedureU2EControlMcpAppU2ERequest.decode(payload.toString()).validatedSnapshot
        return RemoteRootCodecs.routeU2EProcedureU2DCallU2ERequest.decode(buildJsonObject {
            put("procedure", "controlMcpApp")
            put("payload", canonical)
        }.toString()).validatedSnapshot.toString()
    }

    fun response(raw: String): JsonObject {
        val envelope = Json.parseToJsonElement(raw) as? JsonObject ?: throw RichChatInvalidResponseException()
        if (envelope.keys != setOf("result")) throw RichChatInvalidResponseException()
        return RemoteRootCodecs.procedureU2EControlMcpAppU2EResult.decode(envelope.getValue("result").toString()).validatedSnapshot as? JsonObject
            ?: throw RichChatInvalidResponseException()
    }
}
