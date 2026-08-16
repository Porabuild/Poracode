// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D4_eb2405f61b(
    @SerialName("bytesPerSecond") val bytesPerSecond: Double,
    @SerialName("percent") val percent: Double,
    @SerialName("total") val total: Double,
    @SerialName("transferred") val transferred: Double,
    @SerialName("type") val type: RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D4U2DType_bd136ee4bc,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("bytesPerSecond", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("percent", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("total", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("transferred", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D4U2DType_bd136ee4bc", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D5U2DType_eb148d7195 {
    @SerialName("downloaded") DOWNLOADED,
}

@Serializable
data class RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D5_ec76fa076d(
    @SerialName("type") val type: RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D5U2DType_eb148d7195,
    @SerialName("version") val version: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("type", "RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D5U2DType_eb148d7195", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D6_d1df243f45(
    @SerialName("message") val message: RemoteField<String> = RemoteField.Missing,
    @SerialName("messageKey") val messageKey: RemoteField<String> = RemoteField.Missing,
    @SerialName("type") val type: ProcedurebeginMcpServerOauthResultU2DOptionU2D3U2DStatus_c086073e61,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("message", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("messageKey", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurebeginMcpServerOauthResultU2DOptionU2D3U2DStatus_c086073e61", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6.Serializer::class)
sealed interface RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6 {
    data class Option1(val value: RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D1_c6b76607f4) : RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6
    data class Option2(val value: RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D2_ca0c8b8a7f) : RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6
    data class Option3(val value: RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D3_f04c7b0573) : RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6
    data class Option4(val value: RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D4_eb2405f61b) : RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6
    data class Option5(val value: RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D5_ec76fa076d) : RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6
    data class Option6(val value: RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D6_d1df243f45) : RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6
    object Serializer : KSerializer<RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6")
        override fun deserialize(decoder: Decoder): RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("checking")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D1_c6b76607f4>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("update-available")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D2_ca0c8b8a7f>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("update-not-available")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D3_f04c7b0573>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("downloading")))) { Option4(jsonDecoder.json.decodeFromJsonElement<RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D4_eb2405f61b>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("downloaded")))) { Option5(jsonDecoder.json.decodeFromJsonElement<RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D5_ec76fa076d>(element)) }
            RemoteUnionCodec.tryOption(matches, 6, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("error")))) { Option6(jsonDecoder.json.decodeFromJsonElement<RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D6_d1df243f45>(element)) }
            return RemoteUnionCodec.single("RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D1_c6b76607f4>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D2_ca0c8b8a7f>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D3_f04c7b0573>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D4_eb2405f61b>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D5_ec76fa076d>(value.value)
                is Option6 -> jsonEncoder.json.encodeToJsonElement<RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D6_d1df243f45>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

typealias RoutehostU2DUpdateU2DCheckResponseU2DStatus_ffdf9008e6 = RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6?

@Serializable
data class RoutehostU2DUpdateU2DCheckResponse_5f2c2d7fde(
    @SerialName("currentVersion") val currentVersion: String,
    @SerialName("status") val status: RemoteField<RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("currentVersion", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6", true, true, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
class RoutehostU2DUpdateU2DInstallResponse_81055c9199 {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
        ), listOf())
    }
}

@Serializable
data class RoutelocalU2DImageQuery_59a69c0935(
    @SerialName("access_token") val accessU5FToken: RemoteField<String> = RemoteField.Missing,
    @SerialName("path") val path: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("access_token", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
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
data class RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DConfig_048d1517dd(
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
data class RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_f0266e8ace(
    @SerialName("activeThreadId") val activeThreadId: RemoteField<String>,
    @SerialName("agentKind") val agentKind: RemoteField<String> = RemoteField.Missing,
    @SerialName("autoMerge") val autoMerge: Boolean,
    @SerialName("config") val config: RemoteField<RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DConfig_048d1517dd> = RemoteField.Missing,
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
            RemoteFieldDescriptor("config", "RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DConfig_048d1517dd", false, false, null, null, null, null, null, null, null, null, listOf()),
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

typealias RouteprU2DWatchU2DReadResponseU2DWatch_f2d9607a69 = RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_f0266e8ace?

@Serializable
data class RouteprU2DWatchU2DReadResponse_6a3696f049(
    @SerialName("watch") val watch: RemoteField<RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_f0266e8ace>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("watch", "RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_f0266e8ace", true, true, null, null, null, null, null, null, null, null, listOf("pr-watch.agent-required-when-enabled")),
        ), listOf())
    }
}

@Serializable
data class RouteprU2DWatchU2DUpsertRequest_8be1194a62(
    @SerialName("agentKind") val agentKind: RemoteField<String> = RemoteField.Missing,
    @SerialName("autoMerge") val autoMerge: Boolean,
    @SerialName("config") val config: RemoteField<RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DConfig_048d1517dd> = RemoteField.Missing,
    @SerialName("headBranch") val headBranch: String,
    @SerialName("prNumber") val prNumber: Long,
    @SerialName("projectId") val projectId: String,
    @SerialName("watchEnabled") val watchEnabled: Boolean,
    @SerialName("worktreePath") val worktreePath: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKind", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("autoMerge", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("config", "RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DConfig_048d1517dd", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("headBranch", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prNumber", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("watchEnabled", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf("pr-watch.agent-required-when-enabled"))
    }
}

@Serializable
data class RouteprU2DWatchU2DUpsertResponse_52bd1574b5(
    @SerialName("watch") val watch: RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_f0266e8ace,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("watch", "RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_f0266e8ace", true, false, null, null, null, null, null, null, null, null, listOf("pr-watch.agent-required-when-enabled")),
        ), listOf())
    }
}

@Serializable
data class RouteprocedureU2DCallRequest_d566f2fb6a(
    @SerialName("payload") val payload: JsonElement,
    @SerialName("procedure") val procedure: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("payload", "JsonElement", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("procedure", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteprofileU2DCoreU2DStatsRequestU2DScope_b99ee3af30 {
    @SerialName("device") DEVICE,
    @SerialName("all") ALL,
}

@Serializable
enum class RouteprofileU2DCoreU2DStatsRequestU2DWindow_ae26bc52b7 {
    @SerialName("7d") N7D,
    @SerialName("30d") N30D,
    @SerialName("all") ALL,
}

@Serializable
data class RouteprofileU2DCoreU2DStatsRequest_f76e77baae(
    @SerialName("deviceId") val deviceId: RemoteField<String> = RemoteField.Missing,
    @SerialName("provider") val provider: RemoteField<String> = RemoteField.Missing,
    @SerialName("scope") val scope: RemoteField<RouteprofileU2DCoreU2DStatsRequestU2DScope_b99ee3af30> = RemoteField.Missing,
    @SerialName("utcOffsetMinutes") val utcOffsetMinutes: Double,
    @SerialName("window") val window: RemoteField<RouteprofileU2DCoreU2DStatsRequestU2DWindow_ae26bc52b7> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("deviceId", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("provider", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scope", "RouteprofileU2DCoreU2DStatsRequestU2DScope_b99ee3af30", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("utcOffsetMinutes", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("window", "RouteprofileU2DCoreU2DStatsRequestU2DWindow_ae26bc52b7", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc(
    @SerialName("count") val count: Double,
    @SerialName("key") val key: String,
    @SerialName("label") val label: String,
    @SerialName("percent") val percent: Double,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("count", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("key", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("percent", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteprofileU2DCoreU2DStatsResponseU2DAiActionsU2DItemU2DType_645d18fd9a {
    @SerialName("commit") COMMIT,
    @SerialName("pr") PR,
    @SerialName("conflict") CONFLICT,
}

@Serializable
data class RouteprofileU2DCoreU2DStatsResponseU2DAiActionsU2DItem_bb42560f34(
    @SerialName("count") val count: Long,
    @SerialName("label") val label: String,
    @SerialName("topModel") val topModel: RemoteField<String> = RemoteField.Missing,
    @SerialName("topProvider") val topProvider: RemoteField<String> = RemoteField.Missing,
    @SerialName("type") val type: RouteprofileU2DCoreU2DStatsResponseU2DAiActionsU2DItemU2DType_645d18fd9a,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("count", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("topModel", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("topProvider", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "RouteprofileU2DCoreU2DStatsResponseU2DAiActionsU2DItemU2DType_645d18fd9a", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
