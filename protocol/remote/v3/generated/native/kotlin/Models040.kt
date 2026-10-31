// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
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

@Serializable
enum class WebSocketServerMessageU2DOptionU2D10U2DType_0797160858 {
    @SerialName("terminal-watch-result") TERMINALU2DWATCHU2DRESULT,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D10_4655073d71(
    @SerialName("cursorSync") val cursorSync: WebSocketServerMessageU2DOptionU2D10U2DCursorSync_c533fb8759,
    @SerialName("id") val id: String,
    @SerialName("type") val type: WebSocketServerMessageU2DOptionU2D10U2DType_0797160858,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cursorSync", "WebSocketServerMessageU2DOptionU2D10U2DCursorSync_c533fb8759", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketServerMessageU2DOptionU2D10U2DType_0797160858", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D11U2DCursorSync_9dd9855628(
    @SerialName("chunkCount") val chunkCount: Long,
    @SerialName("chunkIndex") val chunkIndex: Long,
    @SerialName("data") val data: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("fromCursor") val fromCursor: Long,
    @SerialName("generation") val generation: RemoteField<String>,
    @SerialName("processState") val processState: ProcedurereadTerminalSnapshotResultU2DOptionU2D1U2DProcessState_f156a9bc12,
    @SerialName("resumeServed") val resumeServed: Boolean,
    @SerialName("terminalSize") val terminalSize: RemoteField<ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09>,
    @SerialName("toCursor") val toCursor: Long,
    @SerialName("version") val version: RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D3_f8ba039a2f,
    @SerialName("watchId") val watchId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("chunkCount", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("chunkIndex", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("data", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fromCursor", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("generation", "String", true, true, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("processState", "ProcedurereadTerminalSnapshotResultU2DOptionU2D1U2DProcessState_f156a9bc12", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("resumeServed", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("terminalSize", "ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("toCursor", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D3_f8ba039a2f", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("watchId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf("terminal.cursor.baseline-chunk-utf16"))
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D11U2DType_114549e732 {
    @SerialName("terminal-watch-baseline-chunk") TERMINALU2DWATCHU2DBASELINEU2DCHUNK,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D11_e65689e97e(
    @SerialName("cursorSync") val cursorSync: WebSocketServerMessageU2DOptionU2D11U2DCursorSync_9dd9855628,
    @SerialName("id") val id: String,
    @SerialName("type") val type: WebSocketServerMessageU2DOptionU2D11U2DType_114549e732,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cursorSync", "WebSocketServerMessageU2DOptionU2D11U2DCursorSync_9dd9855628", true, false, null, null, null, null, null, null, null, null, listOf("terminal.cursor.baseline-chunk-utf16")),
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
    @SerialName("type") val type: WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D1U2DStatus_0200f968d2,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("epoch", "String", false, false, null, null, 1, 128, null, null, null, null, listOf()),
            RemoteFieldDescriptor("seq", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D1U2DStatus_0200f968d2", true, false, null, null, null, null, null, null, null, null, listOf()),
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

@Serializable
enum class WebSocketServerMessageU2DOptionU2D7U2DType_c2894654f1 {
    @SerialName("browser-frame") BROWSERU2DFRAME,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D7_8f58c1d1ac(
    @SerialName("data") val data: String,
    @SerialName("metadata") val metadata: WebSocketServerMessageU2DOptionU2D7U2DMetadata_7d9e4e8a68,
    @SerialName("tabId") val tabId: String,
    @SerialName("type") val type: WebSocketServerMessageU2DOptionU2D7U2DType_c2894654f1,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("data", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("metadata", "WebSocketServerMessageU2DOptionU2D7U2DMetadata_7d9e4e8a68", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tabId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketServerMessageU2DOptionU2D7U2DType_c2894654f1", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D8U2DStatusU2DStatus_c1f357f1f8 {
    @SerialName("starting") STARTING,
    @SerialName("active") ACTIVE,
    @SerialName("unavailable") UNAVAILABLE,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D8U2DStatus_018e665246(
    @SerialName("reason") val reason: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("status") val status: WebSocketServerMessageU2DOptionU2D8U2DStatusU2DStatus_c1f357f1f8,
    @SerialName("tabId") val tabId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("reason", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "WebSocketServerMessageU2DOptionU2D8U2DStatusU2DStatus_c1f357f1f8", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tabId", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, true, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D8U2DType_ab6b873225 {
    @SerialName("browser-mirror-status") BROWSERU2DMIRRORU2DSTATUS,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D8_0ad133ee58(
    @SerialName("status") val status: WebSocketServerMessageU2DOptionU2D8U2DStatus_018e665246,
    @SerialName("type") val type: WebSocketServerMessageU2DOptionU2D8U2DType_ab6b873225,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("status", "WebSocketServerMessageU2DOptionU2D8U2DStatus_018e665246", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketServerMessageU2DOptionU2D8U2DType_ab6b873225", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D9U2DCursorSync_2cfe911595(
    @SerialName("fromCursor") val fromCursor: Long,
    @SerialName("generation") val generation: String,
    @SerialName("toCursor") val toCursor: Long,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72,
    @SerialName("watchId") val watchId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("fromCursor", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("generation", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("toCursor", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("watchId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf("terminal.cursor.output-range"))
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D9U2DType_d8b225d7de {
    @SerialName("terminal-output") TERMINALU2DOUTPUT,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D9_95d0adeb5b(
    @SerialName("cursorSync") val cursorSync: RemoteField<WebSocketServerMessageU2DOptionU2D9U2DCursorSync_2cfe911595> = RemoteField.Missing,
    @SerialName("data") val data: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("id") val id: String,
    @SerialName("type") val type: WebSocketServerMessageU2DOptionU2D9U2DType_d8b225d7de,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cursorSync", "WebSocketServerMessageU2DOptionU2D9U2DCursorSync_2cfe911595", false, false, null, null, null, null, null, null, null, null, listOf("terminal.cursor.output-range")),
            RemoteFieldDescriptor("data", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketServerMessageU2DOptionU2D9U2DType_d8b225d7de", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf("terminal.cursor.output-data-utf16"))
    }
}

@Serializable(with = WebSocketServerMessage_b176186fb3.Serializer::class)
sealed interface WebSocketServerMessage_b176186fb3 {
    data class Option1(val value: WebSocketServerMessageU2DOptionU2D1_48916cddaa) : WebSocketServerMessage_b176186fb3
    data class Option2(val value: WebSocketServerMessageU2DOptionU2D2_dade9637ae) : WebSocketServerMessage_b176186fb3
    data class Option3(val value: WebSocketServerMessageU2DOptionU2D3_3897f50212) : WebSocketServerMessage_b176186fb3
    data class Option4(val value: WebSocketServerMessageU2DOptionU2D4_a633f9a256) : WebSocketServerMessage_b176186fb3
    data class Option5(val value: WebSocketServerMessageU2DOptionU2D5_17b50a5a25) : WebSocketServerMessage_b176186fb3
    data class Option6(val value: WebSocketServerMessageU2DOptionU2D6_bd23acb1d6) : WebSocketServerMessage_b176186fb3
    data class Option7(val value: WebSocketServerMessageU2DOptionU2D7_8f58c1d1ac) : WebSocketServerMessage_b176186fb3
    data class Option8(val value: WebSocketServerMessageU2DOptionU2D8_0ad133ee58) : WebSocketServerMessage_b176186fb3
    data class Option9(val value: WebSocketServerMessageU2DOptionU2D9_95d0adeb5b) : WebSocketServerMessage_b176186fb3
    data class Option10(val value: WebSocketServerMessageU2DOptionU2D10_4655073d71) : WebSocketServerMessage_b176186fb3
    data class Option11(val value: WebSocketServerMessageU2DOptionU2D11_e65689e97e) : WebSocketServerMessage_b176186fb3
    data class Option12(val value: WebSocketServerMessageU2DOptionU2D12_f1c1581e17) : WebSocketServerMessage_b176186fb3
    object Serializer : KSerializer<WebSocketServerMessage_b176186fb3> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("WebSocketServerMessage_b176186fb3")
        override fun deserialize(decoder: Decoder): WebSocketServerMessage_b176186fb3 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("WebSocketServerMessage_b176186fb3 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<WebSocketServerMessage_b176186fb3>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("agent-vision-frame")))) { Option1(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D1_48916cddaa>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("ready")))) { Option2(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D2_dade9637ae>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("event")))) { Option3(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D3_3897f50212>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("resync-required")))) { Option4(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D4_a633f9a256>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("pong")))) { Option5(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D5_17b50a5a25>(element)) }
            RemoteUnionCodec.tryOption(matches, 6, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("browser-state")))) { Option6(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D6_bd23acb1d6>(element)) }
            RemoteUnionCodec.tryOption(matches, 7, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("browser-frame")))) { Option7(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D7_8f58c1d1ac>(element)) }
            RemoteUnionCodec.tryOption(matches, 8, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("browser-mirror-status")))) { Option8(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D8_0ad133ee58>(element)) }
            RemoteUnionCodec.tryOption(matches, 9, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("terminal-output")))) { Option9(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D9_95d0adeb5b>(element)) }
            RemoteUnionCodec.tryOption(matches, 10, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("terminal-watch-result")))) { Option10(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D10_4655073d71>(element)) }
            RemoteUnionCodec.tryOption(matches, 11, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("terminal-watch-baseline-chunk")))) { Option11(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D11_e65689e97e>(element)) }
            RemoteUnionCodec.tryOption(matches, 12, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("desktop-event")))) { Option12(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D12_f1c1581e17>(element)) }
            return RemoteUnionCodec.single("WebSocketServerMessage_b176186fb3", matches)
        }
        override fun serialize(encoder: Encoder, value: WebSocketServerMessage_b176186fb3) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("WebSocketServerMessage_b176186fb3 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D1_48916cddaa>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D2_dade9637ae>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D3_3897f50212>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D4_a633f9a256>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D5_17b50a5a25>(value.value)
                is Option6 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D6_bd23acb1d6>(value.value)
                is Option7 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D7_8f58c1d1ac>(value.value)
                is Option8 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D8_0ad133ee58>(value.value)
                is Option9 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D9_95d0adeb5b>(value.value)
                is Option10 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D10_4655073d71>(value.value)
                is Option11 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D11_e65689e97e>(value.value)
                is Option12 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D12_f1c1581e17>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}
