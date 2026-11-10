// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class ProcedureprobeMcpServerResultU2DOptionU2D2_8ace86d01d(
    @SerialName("environment") val environment: ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironment_6b3ef80f7d,
    @SerialName("error") val error: ProcedureprobeMcpServerResultU2DOptionU2D2U2DError_f145218b6d,
    @SerialName("latencyMs") val latencyMs: Long,
    @SerialName("status") val status: ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DCode_e527c3ee29,
    @SerialName("toolCount") val toolCount: ProcedureprobeMcpServerResultU2DOptionU2D2U2DToolCount_499c88c1c5,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("environment", "ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironment_6b3ef80f7d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("error", "ProcedureprobeMcpServerResultU2DOptionU2D2U2DError_f145218b6d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("latencyMs", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DCode_e527c3ee29", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("toolCount", "ProcedureprobeMcpServerResultU2DOptionU2D2U2DToolCount_499c88c1c5", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureprobeMcpServerResultU2DOptionU2D3U2DErrorU2DCode_2fb9be13c5 {
    @SerialName("auth-required") AUTHU2DREQUIRED,
    @SerialName("timeout") TIMEOUT,
    @SerialName("command-not-found") COMMANDU2DNOTU2DFOUND,
    @SerialName("connection-failed") CONNECTIONU2DFAILED,
    @SerialName("protocol-error") PROTOCOLU2DERROR,
    @SerialName("invalid-config") INVALIDU2DCONFIG,
    @SerialName("probe-unavailable") PROBEU2DUNAVAILABLE,
}

@Serializable
data class ProcedureprobeMcpServerResultU2DOptionU2D3U2DError_5cb704413f(
    @SerialName("authScheme") val authScheme: RemoteField<ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DAuthScheme_2d52ff1140> = RemoteField.Missing,
    @SerialName("code") val code: ProcedureprobeMcpServerResultU2DOptionU2D3U2DErrorU2DCode_2fb9be13c5,
    @SerialName("message") val message: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("authScheme", "ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DAuthScheme_2d52ff1140", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("code", "ProcedureprobeMcpServerResultU2DOptionU2D3U2DErrorU2DCode_2fb9be13c5", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("message", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureprobeMcpServerResultU2DOptionU2D3U2DStatus_fd6258ac65 {
    @SerialName("unavailable") UNAVAILABLE,
}

@Serializable
data class ProcedureprobeMcpServerResultU2DOptionU2D3_2a43ea36a6(
    @SerialName("environment") val environment: ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironment_6b3ef80f7d,
    @SerialName("error") val error: ProcedureprobeMcpServerResultU2DOptionU2D3U2DError_5cb704413f,
    @SerialName("latencyMs") val latencyMs: Long,
    @SerialName("status") val status: ProcedureprobeMcpServerResultU2DOptionU2D3U2DStatus_fd6258ac65,
    @SerialName("toolCount") val toolCount: ProcedureprobeMcpServerResultU2DOptionU2D2U2DToolCount_499c88c1c5,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("environment", "ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironment_6b3ef80f7d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("error", "ProcedureprobeMcpServerResultU2DOptionU2D3U2DError_5cb704413f", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("latencyMs", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedureprobeMcpServerResultU2DOptionU2D3U2DStatus_fd6258ac65", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("toolCount", "ProcedureprobeMcpServerResultU2DOptionU2D2U2DToolCount_499c88c1c5", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedureprobeMcpServerResult_bea1bdef18.Serializer::class)
sealed interface ProcedureprobeMcpServerResult_bea1bdef18 {
    data class Option1(val value: ProcedureprobeMcpServerResultU2DOptionU2D1_d92866345c) : ProcedureprobeMcpServerResult_bea1bdef18
    data class Option2(val value: ProcedureprobeMcpServerResultU2DOptionU2D2_8ace86d01d) : ProcedureprobeMcpServerResult_bea1bdef18
    data class Option3(val value: ProcedureprobeMcpServerResultU2DOptionU2D3_2a43ea36a6) : ProcedureprobeMcpServerResult_bea1bdef18
    object Serializer : KSerializer<ProcedureprobeMcpServerResult_bea1bdef18> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedureprobeMcpServerResult_bea1bdef18")
        override fun deserialize(decoder: Decoder): ProcedureprobeMcpServerResult_bea1bdef18 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedureprobeMcpServerResult_bea1bdef18 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedureprobeMcpServerResult_bea1bdef18>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("available")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedureprobeMcpServerResultU2DOptionU2D1_d92866345c>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("auth-required")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedureprobeMcpServerResultU2DOptionU2D2_8ace86d01d>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("unavailable")))) { Option3(jsonDecoder.json.decodeFromJsonElement<ProcedureprobeMcpServerResultU2DOptionU2D3_2a43ea36a6>(element)) }
            return RemoteUnionCodec.single("ProcedureprobeMcpServerResult_bea1bdef18", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedureprobeMcpServerResult_bea1bdef18) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedureprobeMcpServerResult_bea1bdef18 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedureprobeMcpServerResultU2DOptionU2D1_d92866345c>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedureprobeMcpServerResultU2DOptionU2D2_8ace86d01d>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<ProcedureprobeMcpServerResultU2DOptionU2D3_2a43ea36a6>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class ProcedurequeueThreadFollowUpRequest_b6f2d95e2b(
    @SerialName("clientContext") val clientContext: RemoteField<ProcedureensureThreadRunningRequestU2DClientContext_b23ca9582f> = RemoteField.Missing,
    @SerialName("config") val config: ProcedureconnectThreadVoiceRequestU2DConfig_281d24bbba,
    @SerialName("prompt") val prompt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("segments") val segments: RemoteField<List<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754>> = RemoteField.Missing,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("clientContext", "ProcedureensureThreadRunningRequestU2DClientContext_b23ca9582f", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("config", "ProcedureconnectThreadVoiceRequestU2DConfig_281d24bbba", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prompt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("segments", "List<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurereadAbsoluteFileRequest_f6983a322f(
    @SerialName("absolutePath") val absolutePath: String,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("absolutePath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
