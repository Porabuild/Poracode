// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
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

@Serializable
data class WebSocketServerMessageU2DOptionU2D5_bd23acb1d6(
    @SerialName("state") val state: RoutebrowserU2DCommandResponseU2DState_ecc6edb616,
    @SerialName("type") val type: WebSocketServerMessageU2DOptionU2D5U2DType_47e02a8368,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("state", "RoutebrowserU2DCommandResponseU2DState_ecc6edb616", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketServerMessageU2DOptionU2D5U2DType_47e02a8368", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D6U2DMetadata_7d9e4e8a68(
    @SerialName("deviceHeight") val deviceHeight: Double,
    @SerialName("deviceWidth") val deviceWidth: Double,
    @SerialName("offsetTop") val offsetTop: Double,
    @SerialName("pageScaleFactor") val pageScaleFactor: Double,
    @SerialName("scrollOffsetX") val scrollOffsetX: Double,
    @SerialName("scrollOffsetY") val scrollOffsetY: Double,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("deviceHeight", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("deviceWidth", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("offsetTop", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pageScaleFactor", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scrollOffsetX", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scrollOffsetY", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D6U2DType_c2894654f1 {
    @SerialName("browser-frame") BROWSERU2DFRAME,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D6_8f58c1d1ac(
    @SerialName("data") val data: String,
    @SerialName("metadata") val metadata: WebSocketServerMessageU2DOptionU2D6U2DMetadata_7d9e4e8a68,
    @SerialName("tabId") val tabId: String,
    @SerialName("type") val type: WebSocketServerMessageU2DOptionU2D6U2DType_c2894654f1,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("data", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("metadata", "WebSocketServerMessageU2DOptionU2D6U2DMetadata_7d9e4e8a68", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tabId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketServerMessageU2DOptionU2D6U2DType_c2894654f1", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D7U2DStatusU2DStatus_c1f357f1f8 {
    @SerialName("starting") STARTING,
    @SerialName("active") ACTIVE,
    @SerialName("unavailable") UNAVAILABLE,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D7U2DStatus_018e665246(
    @SerialName("reason") val reason: RemoteField<String> = RemoteField.Missing,
    @SerialName("status") val status: WebSocketServerMessageU2DOptionU2D7U2DStatusU2DStatus_c1f357f1f8,
    @SerialName("tabId") val tabId: RemoteField<String>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("reason", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "WebSocketServerMessageU2DOptionU2D7U2DStatusU2DStatus_c1f357f1f8", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tabId", "String", true, true, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D7U2DType_ab6b873225 {
    @SerialName("browser-mirror-status") BROWSERU2DMIRRORU2DSTATUS,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D7_0ad133ee58(
    @SerialName("status") val status: WebSocketServerMessageU2DOptionU2D7U2DStatus_018e665246,
    @SerialName("type") val type: WebSocketServerMessageU2DOptionU2D7U2DType_ab6b873225,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("status", "WebSocketServerMessageU2DOptionU2D7U2DStatus_018e665246", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketServerMessageU2DOptionU2D7U2DType_ab6b873225", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D8U2DCursorSync_2cfe911595(
    @SerialName("fromCursor") val fromCursor: Long,
    @SerialName("generation") val generation: String,
    @SerialName("toCursor") val toCursor: Long,
    @SerialName("version") val version: RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D2_7f9f5a0d72,
    @SerialName("watchId") val watchId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("fromCursor", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("generation", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("toCursor", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D2_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("watchId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf("terminal.cursor.output-range"))
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D8U2DType_d8b225d7de {
    @SerialName("terminal-output") TERMINALU2DOUTPUT,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D8_95d0adeb5b(
    @SerialName("cursorSync") val cursorSync: RemoteField<WebSocketServerMessageU2DOptionU2D8U2DCursorSync_2cfe911595> = RemoteField.Missing,
    @SerialName("data") val data: String,
    @SerialName("id") val id: String,
    @SerialName("type") val type: WebSocketServerMessageU2DOptionU2D8U2DType_d8b225d7de,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cursorSync", "WebSocketServerMessageU2DOptionU2D8U2DCursorSync_2cfe911595", false, false, null, null, null, null, null, null, null, null, listOf("terminal.cursor.output-range")),
            RemoteFieldDescriptor("data", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketServerMessageU2DOptionU2D8U2DType_d8b225d7de", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf("terminal.cursor.output-data-utf16"))
    }
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D1_ab08aad343(
    @SerialName("data") val data: String,
    @SerialName("fromCursor") val fromCursor: Long,
    @SerialName("generation") val generation: RemoteField<String>,
    @SerialName("processState") val processState: WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DProcessState_f156a9bc12,
    @SerialName("status") val status: WebSocketServerMessageU2DOptionU2D1U2DType_0200f968d2,
    @SerialName("terminalSize") val terminalSize: RemoteField<RouteterminalU2DResizeRequest_55ee222c09>,
    @SerialName("toCursor") val toCursor: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("data", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fromCursor", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("generation", "String", true, true, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("processState", "WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DProcessState_f156a9bc12", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "WebSocketServerMessageU2DOptionU2D1U2DType_0200f968d2", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("terminalSize", "RouteterminalU2DResizeRequest_55ee222c09", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("toCursor", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf("terminal.cursor.ready-range-utf16"))
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D2U2DCode_c8425979fd {
    @SerialName("forbidden") FORBIDDEN,
    @SerialName("not-found") NOTU2DFOUND,
    @SerialName("unavailable") UNAVAILABLE,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D2_b9d24da842(
    @SerialName("code") val code: WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D2U2DCode_c8425979fd,
    @SerialName("reason") val reason: RemoteField<String> = RemoteField.Missing,
    @SerialName("retryable") val retryable: Boolean,
    @SerialName("status") val status: ProcedurebeginMcpServerOauthResultU2DOptionU2D3U2DStatus_c086073e61,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("code", "WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D2U2DCode_c8425979fd", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reason", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("retryable", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedurebeginMcpServerOauthResultU2DOptionU2D3U2DStatus_c086073e61", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResult_80f7976aee.Serializer::class)
sealed interface WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResult_80f7976aee {
    data class Option1(val value: WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D1_ab08aad343) : WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResult_80f7976aee
    data class Option2(val value: WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D2_b9d24da842) : WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResult_80f7976aee
    object Serializer : KSerializer<WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResult_80f7976aee> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResult_80f7976aee")
        override fun deserialize(decoder: Decoder): WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResult_80f7976aee {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResult_80f7976aee supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResult_80f7976aee>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("ready")))) { Option1(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D1_ab08aad343>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("error")))) { Option2(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D2_b9d24da842>(element)) }
            return RemoteUnionCodec.single("WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResult_80f7976aee", matches)
        }
        override fun serialize(encoder: Encoder, value: WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResult_80f7976aee) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResult_80f7976aee supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D1_ab08aad343>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D2_b9d24da842>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}
