// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D1_ab08aad343(
    @SerialName("data") val data: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("fromCursor") val fromCursor: Long,
    @SerialName("generation") val generation: RemoteField<String>,
    @SerialName("processState") val processState: ProcedurereadTerminalSnapshotResultU2DOptionU2D1U2DProcessState_f156a9bc12,
    @SerialName("status") val status: ProcedureghPollPullRequestsResultU2DOptionU2D1U2DStatus_0200f968d2,
    @SerialName("terminalSize") val terminalSize: RemoteField<ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09>,
    @SerialName("toCursor") val toCursor: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("data", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fromCursor", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("generation", "String", true, true, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("processState", "ProcedurereadTerminalSnapshotResultU2DOptionU2D1U2DProcessState_f156a9bc12", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedureghPollPullRequestsResultU2DOptionU2D1U2DStatus_0200f968d2", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("terminalSize", "ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("toCursor", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf("terminal.cursor.ready-range-utf16"))
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D2U2DCode_c8425979fd {
    @SerialName("forbidden") FORBIDDEN,
    @SerialName("not-found") NOTU2DFOUND,
    @SerialName("unavailable") UNAVAILABLE,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D2_b9d24da842(
    @SerialName("code") val code: WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D2U2DCode_c8425979fd,
    @SerialName("reason") val reason: RemoteField<String> = RemoteField.Missing,
    @SerialName("retryable") val retryable: Boolean,
    @SerialName("status") val status: ProcedurebeginMcpServerOauthResultU2DOptionU2D3U2DStatus_c086073e61,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("code", "WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D2U2DCode_c8425979fd", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reason", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("retryable", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedurebeginMcpServerOauthResultU2DOptionU2D3U2DStatus_c086073e61", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_80f7976aee.Serializer::class)
sealed interface WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_80f7976aee {
    data class Option1(val value: WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D1_ab08aad343) : WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_80f7976aee
    data class Option2(val value: WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D2_b9d24da842) : WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_80f7976aee
    object Serializer : KSerializer<WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_80f7976aee> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_80f7976aee")
        override fun deserialize(decoder: Decoder): WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_80f7976aee {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_80f7976aee supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_80f7976aee>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("ready")))) { Option1(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D1_ab08aad343>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("error")))) { Option2(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D2_b9d24da842>(element)) }
            return RemoteUnionCodec.single("WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_80f7976aee", matches)
        }
        override fun serialize(encoder: Encoder, value: WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_80f7976aee) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_80f7976aee supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D1_ab08aad343>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D2_b9d24da842>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D10U2DCursorSync_c533fb8759(
    @SerialName("result") val result: WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_80f7976aee,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72,
    @SerialName("watchId") val watchId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("result", "WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_80f7976aee", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("watchId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
