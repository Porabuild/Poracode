// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class WebSocketClientMessageU2DOptionU2D4_d550ef9994(
    @SerialName("input") val input: WebSocketClientMessageU2DOptionU2D4U2DInput_2c0b30d69c,
    @SerialName("type") val type: WebSocketClientMessageU2DOptionU2D4U2DType_64570e2249,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("input", "WebSocketClientMessageU2DOptionU2D4U2DInput_2c0b30d69c", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketClientMessageU2DOptionU2D4U2DType_64570e2249", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D5U2DCursorSyncU2DResume_9997128f83(
    @SerialName("cursor") val cursor: Long,
    @SerialName("generation") val generation: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cursor", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("generation", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D5U2DCursorSync_3975ceeb37(
    @SerialName("maxChunkBytes") val maxChunkBytes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("maxWindowBytes") val maxWindowBytes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("resume") val resume: RemoteField<WebSocketClientMessageU2DOptionU2D5U2DCursorSyncU2DResume_9997128f83> = RemoteField.Missing,
    @SerialName("version") val version: Long,
    @SerialName("watchId") val watchId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("maxChunkBytes", "Long", false, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxWindowBytes", "Long", false, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("resume", "WebSocketClientMessageU2DOptionU2D5U2DCursorSyncU2DResume_9997128f83", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("watchId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D5U2DType_c64b38404f {
    @SerialName("terminal-watch") TERMINALU2DWATCH,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D5_838adcbcaf(
    @SerialName("cursorSync") val cursorSync: RemoteField<WebSocketClientMessageU2DOptionU2D5U2DCursorSync_3975ceeb37> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("type") val type: WebSocketClientMessageU2DOptionU2D5U2DType_c64b38404f,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cursorSync", "WebSocketClientMessageU2DOptionU2D5U2DCursorSync_3975ceeb37", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketClientMessageU2DOptionU2D5U2DType_c64b38404f", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D6U2DType_af6b6f72d4 {
    @SerialName("terminal-unwatch") TERMINALU2DUNWATCH,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D6_5af10e67b4(
    @SerialName("id") val id: String,
    @SerialName("type") val type: WebSocketClientMessageU2DOptionU2D6U2DType_af6b6f72d4,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketClientMessageU2DOptionU2D6U2DType_af6b6f72d4", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D7U2DCursorSync_23a1c447c0(
    @SerialName("throughCursor") val throughCursor: Long,
    @SerialName("version") val version: RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D3_f8ba039a2f,
    @SerialName("watchId") val watchId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("throughCursor", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D3_f8ba039a2f", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("watchId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D7U2DType_740c7dc82a {
    @SerialName("terminal-watch-baseline-ack") TERMINALU2DWATCHU2DBASELINEU2DACK,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D7_3f58316dbb(
    @SerialName("cursorSync") val cursorSync: WebSocketClientMessageU2DOptionU2D7U2DCursorSync_23a1c447c0,
    @SerialName("id") val id: String,
    @SerialName("type") val type: WebSocketClientMessageU2DOptionU2D7U2DType_740c7dc82a,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cursorSync", "WebSocketClientMessageU2DOptionU2D7U2DCursorSync_23a1c447c0", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketClientMessageU2DOptionU2D7U2DType_740c7dc82a", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D1U2DKind_fc779c522d {
    @SerialName("target") TARGET,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D1_e2d96ee09e(
    @SerialName("branch") val branch: RemoteField<String> = RemoteField.Missing,
    @SerialName("includePrDetails") val includePrDetails: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("kind") val kind: WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D1U2DKind_fc779c522d,
    @SerialName("projectId") val projectId: String,
    @SerialName("worktreePath") val worktreePath: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("branch", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("includePrDetails", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D1U2DKind_fc779c522d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D2U2DKind_c975fc7daa {
    @SerialName("pull-request") PULLU2DREQUEST,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D2_d95fd60152(
    @SerialName("branch") val branch: RemoteField<String> = RemoteField.Missing,
    @SerialName("includeReviewBundle") val includeReviewBundle: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("kind") val kind: WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D2U2DKind_c975fc7daa,
    @SerialName("prNumber") val prNumber: Long,
    @SerialName("projectId") val projectId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("branch", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("includeReviewBundle", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D2U2DKind_c975fc7daa", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prNumber", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D3U2DKind_6b98eaede5 {
    @SerialName("project-pull-requests") PROJECTU2DPULLU2DREQUESTS,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D3_591e7e71be(
    @SerialName("kind") val kind: WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D3U2DKind_6b98eaede5,
    @SerialName("projectId") val projectId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D3U2DKind_6b98eaede5", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3.Serializer::class)
sealed interface WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3 {
    data class Option1(val value: WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D1_e2d96ee09e) : WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3
    data class Option2(val value: WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D2_d95fd60152) : WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3
    data class Option3(val value: WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D3_591e7e71be) : WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3
    object Serializer : KSerializer<WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3")
        override fun deserialize(decoder: Decoder): WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("target")))) { Option1(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D1_e2d96ee09e>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("pull-request")))) { Option2(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D2_d95fd60152>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("project-pull-requests")))) { Option3(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D3_591e7e71be>(element)) }
            return RemoteUnionCodec.single("WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3", matches)
        }
        override fun serialize(encoder: Encoder, value: WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D1_e2d96ee09e>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D2_d95fd60152>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D3_591e7e71be>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D8U2DType_9f1edfda19 {
    @SerialName("git-state-interests") GITU2DSTATEU2DINTERESTS,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D8_d2299af726(
    @SerialName("interests") val interests: List<WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3>,
    @SerialName("type") val type: WebSocketClientMessageU2DOptionU2D8U2DType_9f1edfda19,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("interests", "List<WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3>", true, false, null, null, null, null, null, 500, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketClientMessageU2DOptionU2D8U2DType_9f1edfda19", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D9U2DType_25e47114d3 {
    @SerialName("thread-item-interests") THREADU2DITEMU2DINTERESTS,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D9_93bef3a552(
    @SerialName("threadIds") val threadIds: List<String>,
    @SerialName("type") val type: WebSocketClientMessageU2DOptionU2D9U2DType_25e47114d3,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("threadIds", "List<String>", true, false, null, null, null, null, null, 200, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketClientMessageU2DOptionU2D9U2DType_25e47114d3", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = WebSocketClientMessage_872dc7baba.Serializer::class)
sealed interface WebSocketClientMessage_872dc7baba {
    data class Option1(val value: WebSocketClientMessageU2DOptionU2D1_1709690cf0) : WebSocketClientMessage_872dc7baba
    data class Option2(val value: WebSocketClientMessageU2DOptionU2D2_2b7b34c95b) : WebSocketClientMessage_872dc7baba
    data class Option3(val value: WebSocketClientMessageU2DOptionU2D3_0e8f58f429) : WebSocketClientMessage_872dc7baba
    data class Option4(val value: WebSocketClientMessageU2DOptionU2D4_d550ef9994) : WebSocketClientMessage_872dc7baba
    data class Option5(val value: WebSocketClientMessageU2DOptionU2D5_838adcbcaf) : WebSocketClientMessage_872dc7baba
    data class Option6(val value: WebSocketClientMessageU2DOptionU2D6_5af10e67b4) : WebSocketClientMessage_872dc7baba
    data class Option7(val value: WebSocketClientMessageU2DOptionU2D7_3f58316dbb) : WebSocketClientMessage_872dc7baba
    data class Option8(val value: WebSocketClientMessageU2DOptionU2D8_d2299af726) : WebSocketClientMessage_872dc7baba
    data class Option9(val value: WebSocketClientMessageU2DOptionU2D9_93bef3a552) : WebSocketClientMessage_872dc7baba
    object Serializer : KSerializer<WebSocketClientMessage_872dc7baba> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("WebSocketClientMessage_872dc7baba")
        override fun deserialize(decoder: Decoder): WebSocketClientMessage_872dc7baba {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("WebSocketClientMessage_872dc7baba supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<WebSocketClientMessage_872dc7baba>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("ping")))) { Option1(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D1_1709690cf0>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("browser-watch")))) { Option2(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D2_2b7b34c95b>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("browser-unwatch")))) { Option3(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D3_0e8f58f429>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("browser-input")))) { Option4(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D4_d550ef9994>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("terminal-watch")))) { Option5(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D5_838adcbcaf>(element)) }
            RemoteUnionCodec.tryOption(matches, 6, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("terminal-unwatch")))) { Option6(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D6_5af10e67b4>(element)) }
            RemoteUnionCodec.tryOption(matches, 7, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("terminal-watch-baseline-ack")))) { Option7(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D7_3f58316dbb>(element)) }
            RemoteUnionCodec.tryOption(matches, 8, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("git-state-interests")))) { Option8(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D8_d2299af726>(element)) }
            RemoteUnionCodec.tryOption(matches, 9, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("thread-item-interests")))) { Option9(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D9_93bef3a552>(element)) }
            return RemoteUnionCodec.single("WebSocketClientMessage_872dc7baba", matches)
        }
        override fun serialize(encoder: Encoder, value: WebSocketClientMessage_872dc7baba) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("WebSocketClientMessage_872dc7baba supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D1_1709690cf0>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D2_2b7b34c95b>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D3_0e8f58f429>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D4_d550ef9994>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D5_838adcbcaf>(value.value)
                is Option6 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D6_5af10e67b4>(value.value)
                is Option7 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D7_3f58316dbb>(value.value)
                is Option8 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D8_d2299af726>(value.value)
                is Option9 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D9_93bef3a552>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DProcessState_f156a9bc12 {
    @SerialName("running") RUNNING,
    @SerialName("exited") EXITED,
}

typealias WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DTerminalSize_2d2a48957e = RouteterminalU2DResizeRequest_55ee222c09?

@Serializable
data class WebSocketServerMessageU2DOptionU2D10U2DCursorSync_9dd9855628(
    @SerialName("chunkCount") val chunkCount: Long,
    @SerialName("chunkIndex") val chunkIndex: Long,
    @SerialName("data") val data: String,
    @SerialName("fromCursor") val fromCursor: Long,
    @SerialName("generation") val generation: RemoteField<String>,
    @SerialName("processState") val processState: WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DProcessState_f156a9bc12,
    @SerialName("resumeServed") val resumeServed: Boolean,
    @SerialName("terminalSize") val terminalSize: RemoteField<RouteterminalU2DResizeRequest_55ee222c09>,
    @SerialName("toCursor") val toCursor: Long,
    @SerialName("version") val version: RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D3_f8ba039a2f,
    @SerialName("watchId") val watchId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("chunkCount", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("chunkIndex", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("data", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fromCursor", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("generation", "String", true, true, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("processState", "WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DProcessState_f156a9bc12", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("resumeServed", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("terminalSize", "RouteterminalU2DResizeRequest_55ee222c09", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("toCursor", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D3_f8ba039a2f", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("watchId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf("terminal.cursor.baseline-chunk-utf16"))
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D10U2DType_114549e732 {
    @SerialName("terminal-watch-baseline-chunk") TERMINALU2DWATCHU2DBASELINEU2DCHUNK,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D10_e65689e97e(
    @SerialName("cursorSync") val cursorSync: WebSocketServerMessageU2DOptionU2D10U2DCursorSync_9dd9855628,
    @SerialName("id") val id: String,
    @SerialName("type") val type: WebSocketServerMessageU2DOptionU2D10U2DType_114549e732,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cursorSync", "WebSocketServerMessageU2DOptionU2D10U2DCursorSync_9dd9855628", true, false, null, null, null, null, null, null, null, null, listOf("terminal.cursor.baseline-chunk-utf16")),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketServerMessageU2DOptionU2D10U2DType_114549e732", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D1U2DType_0200f968d2 {
    @SerialName("ready") READY,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D1_13762c62f0(
    @SerialName("seq") val seq: Long,
    @SerialName("type") val type: WebSocketServerMessageU2DOptionU2D1U2DType_0200f968d2,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("seq", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketServerMessageU2DOptionU2D1U2DType_0200f968d2", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D2U2DType_1aa020e871 {
    @SerialName("event") EVENT,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D2_8f72d27346(
    @SerialName("event") val event: JsonElement,
    @SerialName("seq") val seq: Long,
    @SerialName("type") val type: WebSocketServerMessageU2DOptionU2D2U2DType_1aa020e871,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("event", "JsonElement", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("seq", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketServerMessageU2DOptionU2D2U2DType_1aa020e871", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D3U2DType_d9640543f6 {
    @SerialName("resync-required") RESYNCU2DREQUIRED,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D3_67185a3945(
    @SerialName("reason") val reason: String,
    @SerialName("seq") val seq: Long,
    @SerialName("type") val type: WebSocketServerMessageU2DOptionU2D3U2DType_d9640543f6,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("reason", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("seq", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketServerMessageU2DOptionU2D3U2DType_d9640543f6", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D4U2DType_d8768c073f {
    @SerialName("pong") PONG,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D4_17b50a5a25(
    @SerialName("id") val id: RemoteField<String> = RemoteField.Missing,
    @SerialName("receivedAt") val receivedAt: Double,
    @SerialName("sentAt") val sentAt: RemoteField<Double> = RemoteField.Missing,
    @SerialName("type") val type: WebSocketServerMessageU2DOptionU2D4U2DType_d8768c073f,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("receivedAt", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sentAt", "Double", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketServerMessageU2DOptionU2D4U2DType_d8768c073f", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D5U2DType_47e02a8368 {
    @SerialName("browser-state") BROWSERU2DSTATE,
}
