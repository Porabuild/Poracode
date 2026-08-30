// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
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

typealias WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D1U2DGeneration_df704162f3 = String?

@Serializable
enum class WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D1U2DProcessState_f156a9bc12 {
    @SerialName("running") RUNNING,
    @SerialName("exited") EXITED,
}

typealias WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D1U2DTerminalSize_2d2a48957e = RouteterminalU2DResizeRequest_55ee222c09?

@Serializable
data class WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D1_ab08aad343(
    @SerialName("data") val data: String,
    @SerialName("fromCursor") val fromCursor: Long,
    @SerialName("generation") val generation: RemoteField<String>,
    @SerialName("processState") val processState: WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D1U2DProcessState_f156a9bc12,
    @SerialName("status") val status: WebSocketServerMessageU2DOptionU2D1U2DType_0200f968d2,
    @SerialName("terminalSize") val terminalSize: RemoteField<RouteterminalU2DResizeRequest_55ee222c09>,
    @SerialName("toCursor") val toCursor: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("data", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fromCursor", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("generation", "String", true, true, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("processState", "WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D1U2DProcessState_f156a9bc12", true, false, null, null, null, null, null, null, null, null, listOf()),
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
data class WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D2_f102557cc2(
    @SerialName("code") val code: WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D2U2DCode_c8425979fd,
    @SerialName("retryable") val retryable: Boolean,
    @SerialName("status") val status: ProcedurebeginMcpServerOauthResultU2DOptionU2D3U2DStatus_c086073e61,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("code", "WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D2U2DCode_c8425979fd", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("retryable", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedurebeginMcpServerOauthResultU2DOptionU2D3U2DStatus_c086073e61", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResult_f030d36eb7.Serializer::class)
sealed interface WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResult_f030d36eb7 {
    data class Option1(val value: WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D1_ab08aad343) : WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResult_f030d36eb7
    data class Option2(val value: WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D2_f102557cc2) : WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResult_f030d36eb7
    object Serializer : KSerializer<WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResult_f030d36eb7> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResult_f030d36eb7")
        override fun deserialize(decoder: Decoder): WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResult_f030d36eb7 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResult_f030d36eb7 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResult_f030d36eb7>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("ready")))) { Option1(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D1_ab08aad343>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("error")))) { Option2(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D2_f102557cc2>(element)) }
            return RemoteUnionCodec.single("WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResult_f030d36eb7", matches)
        }
        override fun serialize(encoder: Encoder, value: WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResult_f030d36eb7) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResult_f030d36eb7 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D1_ab08aad343>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D2_f102557cc2>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D9U2DCursorSync_3252cdd519(
    @SerialName("result") val result: WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResult_f030d36eb7,
    @SerialName("version") val version: RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D2_7f9f5a0d72,
    @SerialName("watchId") val watchId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("result", "WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResult_f030d36eb7", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D2_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("watchId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D9U2DType_0797160858 {
    @SerialName("terminal-watch-result") TERMINALU2DWATCHU2DRESULT,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D9_a7af012dd2(
    @SerialName("cursorSync") val cursorSync: WebSocketServerMessageU2DOptionU2D9U2DCursorSync_3252cdd519,
    @SerialName("id") val id: String,
    @SerialName("type") val type: WebSocketServerMessageU2DOptionU2D9U2DType_0797160858,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cursorSync", "WebSocketServerMessageU2DOptionU2D9U2DCursorSync_3252cdd519", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketServerMessageU2DOptionU2D9U2DType_0797160858", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = WebSocketServerMessage_c2dab68871.Serializer::class)
sealed interface WebSocketServerMessage_c2dab68871 {
    data class Option1(val value: WebSocketServerMessageU2DOptionU2D1_13762c62f0) : WebSocketServerMessage_c2dab68871
    data class Option2(val value: WebSocketServerMessageU2DOptionU2D2_8f72d27346) : WebSocketServerMessage_c2dab68871
    data class Option3(val value: WebSocketServerMessageU2DOptionU2D3_67185a3945) : WebSocketServerMessage_c2dab68871
    data class Option4(val value: WebSocketServerMessageU2DOptionU2D4_17b50a5a25) : WebSocketServerMessage_c2dab68871
    data class Option5(val value: WebSocketServerMessageU2DOptionU2D5_bd23acb1d6) : WebSocketServerMessage_c2dab68871
    data class Option6(val value: WebSocketServerMessageU2DOptionU2D6_8f58c1d1ac) : WebSocketServerMessage_c2dab68871
    data class Option7(val value: WebSocketServerMessageU2DOptionU2D7_0ad133ee58) : WebSocketServerMessage_c2dab68871
    data class Option8(val value: WebSocketServerMessageU2DOptionU2D8_95d0adeb5b) : WebSocketServerMessage_c2dab68871
    data class Option9(val value: WebSocketServerMessageU2DOptionU2D9_a7af012dd2) : WebSocketServerMessage_c2dab68871
    object Serializer : KSerializer<WebSocketServerMessage_c2dab68871> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("WebSocketServerMessage_c2dab68871")
        override fun deserialize(decoder: Decoder): WebSocketServerMessage_c2dab68871 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("WebSocketServerMessage_c2dab68871 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<WebSocketServerMessage_c2dab68871>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("ready")))) { Option1(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D1_13762c62f0>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("event")))) { Option2(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D2_8f72d27346>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("resync-required")))) { Option3(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D3_67185a3945>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("pong")))) { Option4(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D4_17b50a5a25>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("browser-state")))) { Option5(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D5_bd23acb1d6>(element)) }
            RemoteUnionCodec.tryOption(matches, 6, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("browser-frame")))) { Option6(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D6_8f58c1d1ac>(element)) }
            RemoteUnionCodec.tryOption(matches, 7, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("browser-mirror-status")))) { Option7(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D7_0ad133ee58>(element)) }
            RemoteUnionCodec.tryOption(matches, 8, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("terminal-output")))) { Option8(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D8_95d0adeb5b>(element)) }
            RemoteUnionCodec.tryOption(matches, 9, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("terminal-watch-result")))) { Option9(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D9_a7af012dd2>(element)) }
            return RemoteUnionCodec.single("WebSocketServerMessage_c2dab68871", matches)
        }
        override fun serialize(encoder: Encoder, value: WebSocketServerMessage_c2dab68871) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("WebSocketServerMessage_c2dab68871 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D1_13762c62f0>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D2_8f72d27346>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D3_67185a3945>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D4_17b50a5a25>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D5_bd23acb1d6>(value.value)
                is Option6 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D6_8f58c1d1ac>(value.value)
                is Option7 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D7_0ad133ee58>(value.value)
                is Option8 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D8_95d0adeb5b>(value.value)
                is Option9 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D9_a7af012dd2>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}
