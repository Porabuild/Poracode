// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
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

@Serializable
data class RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D4_f2e3da83f3(
    @SerialName("kind") val kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D4U2DKind_04569d9eea,
    @SerialName("result") val result: ProcedurewaitMcpServerOauthResult_51cc694dc5,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D4U2DKind_04569d9eea", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("result", "ProcedurewaitMcpServerOauthResult_51cc694dc5", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D5_3ac3526f6a(
    @SerialName("kind") val kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D5U2DKind_61fc4b3eae,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D5U2DKind_61fc4b3eae", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RoutemcpU2DSettingsU2DOperationResponse_20b48750f1.Serializer::class)
sealed interface RoutemcpU2DSettingsU2DOperationResponse_20b48750f1 {
    data class Option1(val value: RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D1_bb3cd72cf9) : RoutemcpU2DSettingsU2DOperationResponse_20b48750f1
    data class Option2(val value: RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D2_560a7abcaf) : RoutemcpU2DSettingsU2DOperationResponse_20b48750f1
    data class Option3(val value: RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D3_2798cb9d2d) : RoutemcpU2DSettingsU2DOperationResponse_20b48750f1
    data class Option4(val value: RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D4_f2e3da83f3) : RoutemcpU2DSettingsU2DOperationResponse_20b48750f1
    data class Option5(val value: RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D5_3ac3526f6a) : RoutemcpU2DSettingsU2DOperationResponse_20b48750f1
    object Serializer : KSerializer<RoutemcpU2DSettingsU2DOperationResponse_20b48750f1> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutemcpU2DSettingsU2DOperationResponse_20b48750f1")
        override fun deserialize(decoder: Decoder): RoutemcpU2DSettingsU2DOperationResponse_20b48750f1 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutemcpU2DSettingsU2DOperationResponse_20b48750f1 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutemcpU2DSettingsU2DOperationResponse_20b48750f1>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("probe")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D1_bb3cd72cf9>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("oauth-status")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D2_560a7abcaf>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("oauth-begin")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D3_2798cb9d2d>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("oauth-wait")))) { Option4(jsonDecoder.json.decodeFromJsonElement<RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D4_f2e3da83f3>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("oauth-clear")))) { Option5(jsonDecoder.json.decodeFromJsonElement<RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D5_3ac3526f6a>(element)) }
            return RemoteUnionCodec.single("RoutemcpU2DSettingsU2DOperationResponse_20b48750f1", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutemcpU2DSettingsU2DOperationResponse_20b48750f1) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutemcpU2DSettingsU2DOperationResponse_20b48750f1 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D1_bb3cd72cf9>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D2_560a7abcaf>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D3_2798cb9d2d>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D4_f2e3da83f3>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D5_3ac3526f6a>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class RouteportU2DEnterRequest_4067ad04bf(
    @SerialName("id") val id: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteportU2DEnterResponse_72ce7899de(
    @SerialName("enterPath") val enterPath: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("enterPath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteportU2DForwardRequest_a26f77dd4a(
    @SerialName("targetPort") val targetPort: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("targetPort", "Long", true, false, 1.0, 65535.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteportU2DForwardResponseU2DForward_247ec4acb4(
    @SerialName("createdAt") val createdAt: Long,
    @SerialName("id") val id: String,
    @SerialName("listenPort") val listenPort: Long,
    @SerialName("targetPort") val targetPort: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("createdAt", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("listenPort", "Long", true, false, 1.0, 65535.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("targetPort", "Long", true, false, 1.0, 65535.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteportU2DForwardResponse_3d1d59fe1c(
    @SerialName("enterPath") val enterPath: RemoteField<String> = RemoteField.Missing,
    @SerialName("forward") val forward: RouteportU2DForwardResponseU2DForward_247ec4acb4,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("enterPath", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("forward", "RouteportU2DForwardResponseU2DForward_247ec4acb4", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteportU2DUnforwardResponseU2DOk_d2dd3595e1 = Boolean

@Serializable
data class RouteportU2DUnforwardResponse_badd682f35(
    @SerialName("ok") val ok: RouteportU2DUnforwardResponseU2DOk_d2dd3595e1,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("ok", "RouteportU2DUnforwardResponseU2DOk_d2dd3595e1", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteportsU2DReadResponseU2DDetectedU2DItemU2DProtocol_cb34d50832 {
    @SerialName("http") HTTP,
    @SerialName("unknown") UNKNOWN,
}

@Serializable
data class RouteportsU2DReadResponseU2DDetectedU2DItem_40aab29508(
    @SerialName("label") val label: RemoteField<String> = RemoteField.Missing,
    @SerialName("port") val port: Long,
    @SerialName("protocol") val protocol: RouteportsU2DReadResponseU2DDetectedU2DItemU2DProtocol_cb34d50832,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("label", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("port", "Long", true, false, 1.0, 65535.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("protocol", "RouteportsU2DReadResponseU2DDetectedU2DItemU2DProtocol_cb34d50832", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteportsU2DReadResponse_ea993e5b2d(
    @SerialName("detected") val detected: List<RouteportsU2DReadResponseU2DDetectedU2DItem_40aab29508>,
    @SerialName("forwards") val forwards: List<RouteportU2DForwardResponseU2DForward_247ec4acb4>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("detected", "List<RouteportsU2DReadResponseU2DDetectedU2DItem_40aab29508>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("forwards", "List<RouteportU2DForwardResponseU2DForward_247ec4acb4>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprU2DWatchU2DAgentU2DSyncRequestU2DConfig_048d1517dd(
    @SerialName("effort") val effort: RemoteField<String> = RemoteField.Missing,
    @SerialName("fast") val fast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("model") val model: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("effort", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprU2DWatchU2DAgentU2DSyncRequest_43aa74a688(
    @SerialName("agentKind") val agentKind: String,
    @SerialName("config") val config: RouteprU2DWatchU2DAgentU2DSyncRequestU2DConfig_048d1517dd,
    @SerialName("projectId") val projectId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("config", "RouteprU2DWatchU2DAgentU2DSyncRequestU2DConfig_048d1517dd", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprU2DWatchU2DCheckRequest_22fb635ee9(
    @SerialName("prNumber") val prNumber: Long,
    @SerialName("projectId") val projectId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("prNumber", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DBlockedReasonU2DOptionU2D1_f434bf2c3d {
    @SerialName("agent-unavailable") AGENTU2DUNAVAILABLE,
    @SerialName("worktree-unavailable") WORKTREEU2DUNAVAILABLE,
}

typealias RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DBlockedReason_6a323d2278 = RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DBlockedReasonU2DOptionU2D1_f434bf2c3d?

@Serializable
data class RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_4e69a9e250(
    @SerialName("activeThreadId") val activeThreadId: RemoteField<String>,
    @SerialName("agentKind") val agentKind: RemoteField<String> = RemoteField.Missing,
    @SerialName("autoMerge") val autoMerge: Boolean,
    @SerialName("blockedReason") val blockedReason: RemoteField<RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DBlockedReasonU2DOptionU2D1_f434bf2c3d>,
    @SerialName("config") val config: RemoteField<RouteprU2DWatchU2DAgentU2DSyncRequestU2DConfig_048d1517dd> = RemoteField.Missing,
    @SerialName("headBranch") val headBranch: String,
    @SerialName("lastCheckKey") val lastCheckKey: RemoteField<String>,
    @SerialName("lastCommentCursor") val lastCommentCursor: RemoteField<String>,
    @SerialName("lastError") val lastError: RemoteField<String>,
    @SerialName("lastReviewCommentCursor") val lastReviewCommentCursor: RemoteField<String>,
    @SerialName("lastReviewCursor") val lastReviewCursor: RemoteField<String>,
    @SerialName("prNumber") val prNumber: Long,
    @SerialName("projectId") val projectId: String,
    @SerialName("watchEnabled") val watchEnabled: Boolean,
    @SerialName("worktreePath") val worktreePath: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("activeThreadId", "String", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("agentKind", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("autoMerge", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("blockedReason", "RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DBlockedReasonU2DOptionU2D1_f434bf2c3d", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("config", "RouteprU2DWatchU2DAgentU2DSyncRequestU2DConfig_048d1517dd", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("headBranch", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastCheckKey", "String", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastCommentCursor", "String", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastError", "String", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastReviewCommentCursor", "String", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastReviewCursor", "String", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prNumber", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("watchEnabled", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf("pr-watch.agent-required-when-enabled"))
    }
}

typealias RouteprU2DWatchU2DReadResponseU2DWatch_1cd9a2d7dc = RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_4e69a9e250?

@Serializable
data class RouteprU2DWatchU2DReadResponse_d5dfa02f74(
    @SerialName("watch") val watch: RemoteField<RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_4e69a9e250>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("watch", "RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_4e69a9e250", true, true, null, null, null, null, null, null, null, null, listOf("pr-watch.agent-required-when-enabled")),
        ), listOf())
    }
}
