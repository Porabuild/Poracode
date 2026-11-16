// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class WebSocketClientMessageU2DOptionU2D7U2DCursorSyncU2DResume_9997128f83(
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
data class WebSocketClientMessageU2DOptionU2D7U2DCursorSync_3975ceeb37(
    @SerialName("maxChunkBytes") val maxChunkBytes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("maxWindowBytes") val maxWindowBytes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("resume") val resume: RemoteField<WebSocketClientMessageU2DOptionU2D7U2DCursorSyncU2DResume_9997128f83> = RemoteField.Missing,
    @SerialName("version") val version: Long,
    @SerialName("watchId") val watchId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("maxChunkBytes", "Long", false, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxWindowBytes", "Long", false, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("resume", "WebSocketClientMessageU2DOptionU2D7U2DCursorSyncU2DResume_9997128f83", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("watchId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D7U2DType_c64b38404f {
    @SerialName("terminal-watch") TERMINALU2DWATCH,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D7_838adcbcaf(
    @SerialName("cursorSync") val cursorSync: RemoteField<WebSocketClientMessageU2DOptionU2D7U2DCursorSync_3975ceeb37> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("type") val type: WebSocketClientMessageU2DOptionU2D7U2DType_c64b38404f,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cursorSync", "WebSocketClientMessageU2DOptionU2D7U2DCursorSync_3975ceeb37", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketClientMessageU2DOptionU2D7U2DType_c64b38404f", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D8U2DType_af6b6f72d4 {
    @SerialName("terminal-unwatch") TERMINALU2DUNWATCH,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D8_5af10e67b4(
    @SerialName("id") val id: String,
    @SerialName("type") val type: WebSocketClientMessageU2DOptionU2D8U2DType_af6b6f72d4,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketClientMessageU2DOptionU2D8U2DType_af6b6f72d4", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D9U2DCursorSync_23a1c447c0(
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
enum class WebSocketClientMessageU2DOptionU2D9U2DType_740c7dc82a {
    @SerialName("terminal-watch-baseline-ack") TERMINALU2DWATCHU2DBASELINEU2DACK,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D9_3f58316dbb(
    @SerialName("cursorSync") val cursorSync: WebSocketClientMessageU2DOptionU2D9U2DCursorSync_23a1c447c0,
    @SerialName("id") val id: String,
    @SerialName("type") val type: WebSocketClientMessageU2DOptionU2D9U2DType_740c7dc82a,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cursorSync", "WebSocketClientMessageU2DOptionU2D9U2DCursorSync_23a1c447c0", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketClientMessageU2DOptionU2D9U2DType_740c7dc82a", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = WebSocketClientMessage_14ca57bfe9.Serializer::class)
sealed interface WebSocketClientMessage_14ca57bfe9 {
    data class Option1(val value: WebSocketClientMessageU2DOptionU2D1_9eaa25e68d) : WebSocketClientMessage_14ca57bfe9
    data class Option2(val value: WebSocketClientMessageU2DOptionU2D2_107db71e16) : WebSocketClientMessage_14ca57bfe9
    data class Option3(val value: WebSocketClientMessageU2DOptionU2D3_1709690cf0) : WebSocketClientMessage_14ca57bfe9
    data class Option4(val value: WebSocketClientMessageU2DOptionU2D4_2b7b34c95b) : WebSocketClientMessage_14ca57bfe9
    data class Option5(val value: WebSocketClientMessageU2DOptionU2D5_0e8f58f429) : WebSocketClientMessage_14ca57bfe9
    data class Option6(val value: WebSocketClientMessageU2DOptionU2D6_d550ef9994) : WebSocketClientMessage_14ca57bfe9
    data class Option7(val value: WebSocketClientMessageU2DOptionU2D7_838adcbcaf) : WebSocketClientMessage_14ca57bfe9
    data class Option8(val value: WebSocketClientMessageU2DOptionU2D8_5af10e67b4) : WebSocketClientMessage_14ca57bfe9
    data class Option9(val value: WebSocketClientMessageU2DOptionU2D9_3f58316dbb) : WebSocketClientMessage_14ca57bfe9
    data class Option10(val value: WebSocketClientMessageU2DOptionU2D10_d2299af726) : WebSocketClientMessage_14ca57bfe9
    data class Option11(val value: WebSocketClientMessageU2DOptionU2D11_93bef3a552) : WebSocketClientMessage_14ca57bfe9
    object Serializer : KSerializer<WebSocketClientMessage_14ca57bfe9> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("WebSocketClientMessage_14ca57bfe9")
        override fun deserialize(decoder: Decoder): WebSocketClientMessage_14ca57bfe9 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("WebSocketClientMessage_14ca57bfe9 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<WebSocketClientMessage_14ca57bfe9>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("agent-vision-watch")))) { Option1(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D1_9eaa25e68d>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("agent-vision-unwatch")))) { Option2(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D2_107db71e16>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("ping")))) { Option3(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D3_1709690cf0>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("browser-watch")))) { Option4(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D4_2b7b34c95b>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("browser-unwatch")))) { Option5(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D5_0e8f58f429>(element)) }
            RemoteUnionCodec.tryOption(matches, 6, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("browser-input")))) { Option6(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D6_d550ef9994>(element)) }
            RemoteUnionCodec.tryOption(matches, 7, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("terminal-watch")))) { Option7(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D7_838adcbcaf>(element)) }
            RemoteUnionCodec.tryOption(matches, 8, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("terminal-unwatch")))) { Option8(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D8_5af10e67b4>(element)) }
            RemoteUnionCodec.tryOption(matches, 9, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("terminal-watch-baseline-ack")))) { Option9(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D9_3f58316dbb>(element)) }
            RemoteUnionCodec.tryOption(matches, 10, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("git-state-interests")))) { Option10(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D10_d2299af726>(element)) }
            RemoteUnionCodec.tryOption(matches, 11, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("thread-item-interests")))) { Option11(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D11_93bef3a552>(element)) }
            return RemoteUnionCodec.single("WebSocketClientMessage_14ca57bfe9", matches)
        }
        override fun serialize(encoder: Encoder, value: WebSocketClientMessage_14ca57bfe9) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("WebSocketClientMessage_14ca57bfe9 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D1_9eaa25e68d>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D2_107db71e16>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D3_1709690cf0>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D4_2b7b34c95b>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D5_0e8f58f429>(value.value)
                is Option6 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D6_d550ef9994>(value.value)
                is Option7 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D7_838adcbcaf>(value.value)
                is Option8 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D8_5af10e67b4>(value.value)
                is Option9 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D9_3f58316dbb>(value.value)
                is Option10 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D10_d2299af726>(value.value)
                is Option11 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D11_93bef3a552>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}
