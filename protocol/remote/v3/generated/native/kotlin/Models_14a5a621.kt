// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D1_8c167fc288(
    @SerialName("columnChanges") val columnChanges: RemoteField<List<ProcedurereadTerminalSnapshotResultU2DOptionU2D1U2DColumnChangesU2DItem_fc33becf88>> = RemoteField.Missing,
    @SerialName("data") val data: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("fromCursor") val fromCursor: Long,
    @SerialName("generation") val generation: RemoteField<String>,
    @SerialName("processState") val processState: ProcedurereadTerminalSnapshotResultU2DOptionU2D1U2DProcessState_f156a9bc12,
    @SerialName("status") val status: ProcedureghPollPullRequestsResultU2DOptionU2D1U2DStatus_0200f968d2,
    @SerialName("terminalSize") val terminalSize: RemoteField<ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09>,
    @SerialName("toCursor") val toCursor: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("columnChanges", "List<ProcedurereadTerminalSnapshotResultU2DOptionU2D1U2DColumnChangesU2DItem_fc33becf88>", false, false, null, null, null, null, null, 2049, null, null, listOf()),
            RemoteFieldDescriptor("data", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
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

@Serializable(with = WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_5fa6bc3b9f.Serializer::class)
sealed interface WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_5fa6bc3b9f {
    data class Option1(val value: WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D1_8c167fc288) : WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_5fa6bc3b9f
    data class Option2(val value: WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D2_b9d24da842) : WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_5fa6bc3b9f
    object Serializer : KSerializer<WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_5fa6bc3b9f> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_5fa6bc3b9f")
        override fun deserialize(decoder: Decoder): WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_5fa6bc3b9f {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_5fa6bc3b9f supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_5fa6bc3b9f>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("ready")))) { Option1(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D1_8c167fc288>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("error")))) { Option2(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D2_b9d24da842>(element)) }
            return RemoteUnionCodec.single("WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_5fa6bc3b9f", matches)
        }
        override fun serialize(encoder: Encoder, value: WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_5fa6bc3b9f) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_5fa6bc3b9f supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D1_8c167fc288>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D2_b9d24da842>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D10U2DCursorSync_e8eddc5ea5(
    @SerialName("result") val result: WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_5fa6bc3b9f,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72,
    @SerialName("watchId") val watchId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("result", "WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_5fa6bc3b9f", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("watchId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D10U2DType_0797160858 {
    @SerialName("terminal-watch-result") TERMINALU2DWATCHU2DRESULT,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D10_ae488cfbae(
    @SerialName("cursorSync") val cursorSync: WebSocketServerMessageU2DOptionU2D10U2DCursorSync_e8eddc5ea5,
    @SerialName("id") val id: String,
    @SerialName("type") val type: WebSocketServerMessageU2DOptionU2D10U2DType_0797160858,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cursorSync", "WebSocketServerMessageU2DOptionU2D10U2DCursorSync_e8eddc5ea5", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketServerMessageU2DOptionU2D10U2DType_0797160858", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D11U2DCursorSync_b09ca5e547(
    @SerialName("chunkCount") val chunkCount: Long,
    @SerialName("chunkIndex") val chunkIndex: Long,
    @SerialName("data") val data: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("fromCursor") val fromCursor: Long,
    @SerialName("generation") val generation: RemoteField<String>,
    @SerialName("processState") val processState: ProcedurereadTerminalSnapshotResultU2DOptionU2D1U2DProcessState_f156a9bc12,
    @SerialName("resumeServed") val resumeServed: Boolean,
    @SerialName("terminalColumns") val terminalColumns: RemoteField<Long> = RemoteField.Missing,
    @SerialName("terminalSize") val terminalSize: RemoteField<ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09>,
    @SerialName("toCursor") val toCursor: Long,
    @SerialName("version") val version: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D2U2DVersion_f8ba039a2f,
    @SerialName("watchId") val watchId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("chunkCount", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("chunkIndex", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("data", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fromCursor", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("generation", "String", true, true, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("processState", "ProcedurereadTerminalSnapshotResultU2DOptionU2D1U2DProcessState_f156a9bc12", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("resumeServed", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("terminalColumns", "Long", false, false, 20.0, 400.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("terminalSize", "ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("toCursor", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D2U2DVersion_f8ba039a2f", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("watchId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf("terminal.cursor.baseline-chunk-utf16"))
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D11U2DType_114549e732 {
    @SerialName("terminal-watch-baseline-chunk") TERMINALU2DWATCHU2DBASELINEU2DCHUNK,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D11_be70182f42(
    @SerialName("cursorSync") val cursorSync: WebSocketServerMessageU2DOptionU2D11U2DCursorSync_b09ca5e547,
    @SerialName("id") val id: String,
    @SerialName("type") val type: WebSocketServerMessageU2DOptionU2D11U2DType_114549e732,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cursorSync", "WebSocketServerMessageU2DOptionU2D11U2DCursorSync_b09ca5e547", true, false, null, null, null, null, null, null, null, null, listOf("terminal.cursor.baseline-chunk-utf16")),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketServerMessageU2DOptionU2D11U2DType_114549e732", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D12U2DSpace_22c1b4b934 {
    @SerialName("ipc") IPC,
    @SerialName("loopback") LOOPBACK,
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D12U2DType_829c74ec0a {
    @SerialName("desktop-event") DESKTOPU2DEVENT,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D12_f1c1581e17(
    @SerialName("event") val event: JsonElement,
    @SerialName("seq") val seq: Long,
    @SerialName("space") val space: RemoteField<WebSocketServerMessageU2DOptionU2D12U2DSpace_22c1b4b934> = RemoteField.Missing,
    @SerialName("type") val type: WebSocketServerMessageU2DOptionU2D12U2DType_829c74ec0a,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("event", "JsonElement", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("seq", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("space", "WebSocketServerMessageU2DOptionU2D12U2DSpace_22c1b4b934", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketServerMessageU2DOptionU2D12U2DType_829c74ec0a", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D1U2DType_83c210ec93 {
    @SerialName("agent-vision-frame") AGENTU2DVISIONU2DFRAME,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D1_48916cddaa(
    @SerialName("type") val type: WebSocketServerMessageU2DOptionU2D1U2DType_83c210ec93,
    @SerialName("vision") val vision: RemoteField<RoutethreadU2DAgentU2DVisionResponseU2DOptionU2D1_1e25c599a6>,
    @SerialName("watchId") val watchId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("type", "WebSocketServerMessageU2DOptionU2D1U2DType_83c210ec93", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("vision", "RoutethreadU2DAgentU2DVisionResponseU2DOptionU2D1_1e25c599a6", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("watchId", "String", true, false, null, null, 1, 128, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D2_dade9637ae(
    @SerialName("epoch") val epoch: RemoteField<String> = RemoteField.Missing,
    @SerialName("seq") val seq: Long,
    @SerialName("type") val type: ProcedureghPollPullRequestsResultU2DOptionU2D1U2DStatus_0200f968d2,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("epoch", "String", false, false, null, null, 1, 128, null, null, null, null, listOf()),
            RemoteFieldDescriptor("seq", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedureghPollPullRequestsResultU2DOptionU2D1U2DStatus_0200f968d2", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D3U2DType_1aa020e871 {
    @SerialName("event") EVENT,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D3_3897f50212(
    @SerialName("event") val event: JsonElement,
    @SerialName("omittedRuntimeThreadIds") val omittedRuntimeThreadIds: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("seq") val seq: Long,
    @SerialName("space") val space: RemoteField<WebSocketServerMessageU2DOptionU2D12U2DSpace_22c1b4b934> = RemoteField.Missing,
    @SerialName("type") val type: WebSocketServerMessageU2DOptionU2D3U2DType_1aa020e871,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("event", "JsonElement", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("omittedRuntimeThreadIds", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("seq", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("space", "WebSocketServerMessageU2DOptionU2D12U2DSpace_22c1b4b934", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketServerMessageU2DOptionU2D3U2DType_1aa020e871", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D4U2DType_d9640543f6 {
    @SerialName("resync-required") RESYNCU2DREQUIRED,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D4_a633f9a256(
    @SerialName("reason") val reason: String,
    @SerialName("seq") val seq: Long,
    @SerialName("space") val space: RemoteField<WebSocketServerMessageU2DOptionU2D12U2DSpace_22c1b4b934> = RemoteField.Missing,
    @SerialName("type") val type: WebSocketServerMessageU2DOptionU2D4U2DType_d9640543f6,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("reason", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("seq", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("space", "WebSocketServerMessageU2DOptionU2D12U2DSpace_22c1b4b934", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketServerMessageU2DOptionU2D4U2DType_d9640543f6", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D5U2DType_d8768c073f {
    @SerialName("pong") PONG,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D5_17b50a5a25(
    @SerialName("id") val id: RemoteField<String> = RemoteField.Missing,
    @SerialName("receivedAt") val receivedAt: Double,
    @SerialName("sentAt") val sentAt: RemoteField<Double> = RemoteField.Missing,
    @SerialName("type") val type: WebSocketServerMessageU2DOptionU2D5U2DType_d8768c073f,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("receivedAt", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sentAt", "Double", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketServerMessageU2DOptionU2D5U2DType_d8768c073f", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D6U2DType_47e02a8368 {
    @SerialName("browser-state") BROWSERU2DSTATE,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D6_bd23acb1d6(
    @SerialName("state") val state: RoutebrowserU2DCommandResponseU2DState_ecc6edb616,
    @SerialName("type") val type: WebSocketServerMessageU2DOptionU2D6U2DType_47e02a8368,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("state", "RoutebrowserU2DCommandResponseU2DState_ecc6edb616", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketServerMessageU2DOptionU2D6U2DType_47e02a8368", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D7U2DMetadata_7d9e4e8a68(
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
