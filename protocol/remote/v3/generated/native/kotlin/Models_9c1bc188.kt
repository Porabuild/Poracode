// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RoutemcpU2DSettingsU2DCommandResponseU2DServersU2DItem_d66267c393(
    @SerialName("description") val description: String,
    @SerialName("disabledTools") val disabledTools: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("enabled") val enabled: Boolean,
    @SerialName("id") val id: String,
    @SerialName("name") val name: String,
    @SerialName("timeoutMs") val timeoutMs: Long,
    @SerialName("transport") val transport: ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransport_5296d6b04d,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("description", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledTools", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("enabled", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, "^[A-Za-z0-9][A-Za-z0-9_.-]*$", null, listOf()),
            RemoteFieldDescriptor("timeoutMs", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("transport", "ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransport_5296d6b04d", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf("mcp.reserved-name"))
    }
}

@Serializable
data class RoutemcpU2DSettingsU2DCommandResponse_e761211b82(
    @SerialName("servers") val servers: List<RoutemcpU2DSettingsU2DCommandResponseU2DServersU2DItem_d66267c393>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("servers", "List<RoutemcpU2DSettingsU2DCommandResponseU2DServersU2DItem_d66267c393>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D1U2DKind_4d34acc64d {
    @SerialName("probe") PROBE,
}

@Serializable
data class RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D1_20d706a189(
    @SerialName("kind") val kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D1U2DKind_4d34acc64d,
    @SerialName("scope") val scope: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951,
    @SerialName("serverId") val serverId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D1U2DKind_4d34acc64d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scope", "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("serverId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D2U2DKind_274e069cdc {
    @SerialName("oauth-status") OAUTHU2DSTATUS,
}

@Serializable
data class RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D2_37eeca9f53(
    @SerialName("kind") val kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D2U2DKind_274e069cdc,
    @SerialName("scope") val scope: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D2U2DKind_274e069cdc", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scope", "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D3U2DKind_3d1908a6bc {
    @SerialName("oauth-begin") OAUTHU2DBEGIN,
}

@Serializable
data class RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D3_6602194087(
    @SerialName("kind") val kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D3U2DKind_3d1908a6bc,
    @SerialName("scope") val scope: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951,
    @SerialName("serverId") val serverId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D3U2DKind_3d1908a6bc", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scope", "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("serverId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D4U2DKind_04569d9eea {
    @SerialName("oauth-wait") OAUTHU2DWAIT,
}

@Serializable
data class RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D4_7a00457b3e(
    @SerialName("flowId") val flowId: String,
    @SerialName("kind") val kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D4U2DKind_04569d9eea,
    @SerialName("scope") val scope: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("flowId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D4U2DKind_04569d9eea", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scope", "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D5U2DKind_61fc4b3eae {
    @SerialName("oauth-clear") OAUTHU2DCLEAR,
}

@Serializable
data class RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D5_81440643a0(
    @SerialName("kind") val kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D5U2DKind_61fc4b3eae,
    @SerialName("scope") val scope: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951,
    @SerialName("serverId") val serverId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D5U2DKind_61fc4b3eae", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scope", "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("serverId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb.Serializer::class)
sealed interface RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb {
    data class Option1(val value: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D1_20d706a189) : RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb
    data class Option2(val value: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D2_37eeca9f53) : RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb
    data class Option3(val value: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D3_6602194087) : RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb
    data class Option4(val value: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D4_7a00457b3e) : RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb
    data class Option5(val value: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D5_81440643a0) : RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb
    object Serializer : KSerializer<RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb")
        override fun deserialize(decoder: Decoder): RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("probe")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D1_20d706a189>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("oauth-status")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D2_37eeca9f53>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("oauth-begin")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D3_6602194087>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("oauth-wait")))) { Option4(jsonDecoder.json.decodeFromJsonElement<RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D4_7a00457b3e>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("oauth-clear")))) { Option5(jsonDecoder.json.decodeFromJsonElement<RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D5_81440643a0>(element)) }
            return RemoteUnionCodec.single("RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D1_20d706a189>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D2_37eeca9f53>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D3_6602194087>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D4_7a00457b3e>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D5_81440643a0>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D1_bb3cd72cf9(
    @SerialName("kind") val kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D1U2DKind_4d34acc64d,
    @SerialName("result") val result: ProcedureprobeMcpServerResult_bea1bdef18,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D1U2DKind_4d34acc64d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("result", "ProcedureprobeMcpServerResult_bea1bdef18", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D2_560a7abcaf(
    @SerialName("authenticatedServerIds") val authenticatedServerIds: List<String>,
    @SerialName("kind") val kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D2U2DKind_274e069cdc,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("authenticatedServerIds", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D2U2DKind_274e069cdc", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D3_2798cb9d2d(
    @SerialName("kind") val kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D3U2DKind_3d1908a6bc,
    @SerialName("result") val result: ProcedurebeginMcpServerOauthResult_6a2d40d38c,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D3U2DKind_3d1908a6bc", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("result", "ProcedurebeginMcpServerOauthResult_6a2d40d38c", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
