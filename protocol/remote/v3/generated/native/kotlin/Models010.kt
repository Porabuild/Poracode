// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class ProcedurepauseThreadFollowUpsRequest_d42717fff2(
    @SerialName("id") val id: String,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironmentU2DRuntime_1f6ff7bae5 {
    @SerialName("host") HOST,
    @SerialName("wsl") WSL,
}

@Serializable
data class ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironment_6b3ef80f7d(
    @SerialName("projectScoped") val projectScoped: Boolean,
    @SerialName("runtime") val runtime: ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironmentU2DRuntime_1f6ff7bae5,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("projectScoped", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtime", "ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironmentU2DRuntime_1f6ff7bae5", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureprobeMcpServerResultU2DOptionU2D1U2DServerInfo_820293e02a(
    @SerialName("name") val name: RemoteField<String> = RemoteField.Missing,
    @SerialName("version") val version: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("name", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureprobeMcpServerResultU2DOptionU2D1U2DStatus_7ce40fcb9f {
    @SerialName("available") AVAILABLE,
}

@Serializable
data class ProcedureprobeMcpServerResultU2DOptionU2D1_d92866345c(
    @SerialName("environment") val environment: ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironment_6b3ef80f7d,
    @SerialName("latencyMs") val latencyMs: Long,
    @SerialName("serverInfo") val serverInfo: RemoteField<ProcedureprobeMcpServerResultU2DOptionU2D1U2DServerInfo_820293e02a> = RemoteField.Missing,
    @SerialName("status") val status: ProcedureprobeMcpServerResultU2DOptionU2D1U2DStatus_7ce40fcb9f,
    @SerialName("toolCount") val toolCount: Long,
    @SerialName("tools") val tools: RemoteField<List<String>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("environment", "ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironment_6b3ef80f7d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("latencyMs", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("serverInfo", "ProcedureprobeMcpServerResultU2DOptionU2D1U2DServerInfo_820293e02a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedureprobeMcpServerResultU2DOptionU2D1U2DStatus_7ce40fcb9f", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("toolCount", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tools", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DAuthScheme_2d52ff1140 {
    @SerialName("oauth") OAUTH,
    @SerialName("bearer") BEARER,
    @SerialName("other") OTHER,
    @SerialName("unknown") UNKNOWN,
}

@Serializable
enum class ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DCode_e527c3ee29 {
    @SerialName("auth-required") AUTHU2DREQUIRED,
}

@Serializable
data class ProcedureprobeMcpServerResultU2DOptionU2D2U2DError_f145218b6d(
    @SerialName("authScheme") val authScheme: RemoteField<ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DAuthScheme_2d52ff1140> = RemoteField.Missing,
    @SerialName("code") val code: ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DCode_e527c3ee29,
    @SerialName("message") val message: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("authScheme", "ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DAuthScheme_2d52ff1140", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("code", "ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DCode_e527c3ee29", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("message", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedureprobeMcpServerResultU2DOptionU2D2U2DToolCount_499c88c1c5 = Double

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
data class ProcedurequeueThreadFollowUpRequest_9ae2178554(
    @SerialName("config") val config: ProcedureconnectThreadVoiceRequestU2DConfig_023567f089,
    @SerialName("prompt") val prompt: String,
    @SerialName("segments") val segments: RemoteField<List<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754>> = RemoteField.Missing,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("config", "ProcedureconnectThreadVoiceRequestU2DConfig_023567f089", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prompt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
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

@Serializable
enum class ProcedurereadAbsoluteFileResultU2DStatus_949f0ec1c2 {
    @SerialName("ready") READY,
    @SerialName("binary") BINARY,
    @SerialName("too_large") TOOU5FLARGE,
    @SerialName("unsupported") UNSUPPORTED,
    @SerialName("missing") MISSING,
}

@Serializable
data class ProcedurereadAbsoluteFileResult_eaf8a91849(
    @SerialName("content") val content: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("modifiedAtMs") val modifiedAtMs: RemoteField<Double> = RemoteField.Missing,
    @SerialName("status") val status: ProcedurereadAbsoluteFileResultU2DStatus_949f0ec1c2,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("content", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modifiedAtMs", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedurereadAbsoluteFileResultU2DStatus_949f0ec1c2", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurereadExternalFileResultU2DLineEnding_6d6f1fde73 {
    @SerialName("lf") LF,
    @SerialName("crlf") CRLF,
}

@Serializable
data class ProcedurereadExternalFileResult_9ba1e93599(
    @SerialName("content") val content: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("contentBase64") val contentBase64: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("hasBom") val hasBom: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("lineEnding") val lineEnding: RemoteField<ProcedurereadExternalFileResultU2DLineEnding_6d6f1fde73> = RemoteField.Missing,
    @SerialName("modifiedAtMs") val modifiedAtMs: Double,
    @SerialName("path") val path: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("status") val status: ProcedurereadAbsoluteFileResultU2DStatus_949f0ec1c2,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("content", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("contentBase64", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("hasBom", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lineEnding", "ProcedurereadExternalFileResultU2DLineEnding_6d6f1fde73", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modifiedAtMs", "Double", true, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedurereadAbsoluteFileResultU2DStatus_949f0ec1c2", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurereadProjectFileResultU2DStatus_620971ca17 {
    @SerialName("ready") READY,
    @SerialName("binary") BINARY,
    @SerialName("too_large") TOOU5FLARGE,
    @SerialName("unsupported") UNSUPPORTED,
}

@Serializable
data class ProcedurereadProjectFileResult_891e9ab241(
    @SerialName("content") val content: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("contentBase64") val contentBase64: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("hasBom") val hasBom: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("lineEnding") val lineEnding: RemoteField<ProcedurereadExternalFileResultU2DLineEnding_6d6f1fde73> = RemoteField.Missing,
    @SerialName("modifiedAtMs") val modifiedAtMs: Double,
    @SerialName("path") val path: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("status") val status: ProcedurereadProjectFileResultU2DStatus_620971ca17,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("content", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("contentBase64", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("hasBom", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lineEnding", "ProcedurereadExternalFileResultU2DLineEnding_6d6f1fde73", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modifiedAtMs", "Double", true, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedurereadProjectFileResultU2DStatus_620971ca17", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedurereadTerminalSizeResult_2d2a48957e = ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09?

@Serializable
enum class ProcedurereadTerminalSnapshotResultU2DOptionU2D1U2DProcessState_f156a9bc12 {
    @SerialName("running") RUNNING,
    @SerialName("exited") EXITED,
}

@Serializable
data class ProcedurereadTerminalSnapshotResultU2DOptionU2D1_ca5f8d6782(
    @SerialName("data") val data: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("fromCursor") val fromCursor: Long,
    @SerialName("generation") val generation: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("processState") val processState: ProcedurereadTerminalSnapshotResultU2DOptionU2D1U2DProcessState_f156a9bc12,
    @SerialName("terminalSize") val terminalSize: RemoteField<ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09>,
    @SerialName("toCursor") val toCursor: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("data", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fromCursor", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("generation", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("processState", "ProcedurereadTerminalSnapshotResultU2DOptionU2D1U2DProcessState_f156a9bc12", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("terminalSize", "ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("toCursor", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedurereadTerminalSnapshotResult_b67f4828f0 = ProcedurereadTerminalSnapshotResultU2DOptionU2D1_ca5f8d6782?

@Serializable
enum class ProcedurereadThreadBackgroundTasksResultU2DItemU2DKind_32b2db2eaa {
    @SerialName("command") COMMAND,
    @SerialName("other") OTHER,
}

@Serializable
data class ProcedurereadThreadBackgroundTasksResultU2DItem_1feabb5e4c(
    @SerialName("description") val description: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("kind") val kind: ProcedurereadThreadBackgroundTasksResultU2DItemU2DKind_32b2db2eaa,
    @SerialName("taskId") val taskId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("description", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "ProcedurereadThreadBackgroundTasksResultU2DItemU2DKind_32b2db2eaa", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("taskId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedurereadThreadBackgroundTasksResult_17dfab19af = List<ProcedurereadThreadBackgroundTasksResultU2DItem_1feabb5e4c>

@Serializable
data class ProcedurerelocateProjectRequest_51fc061b3e(
    @SerialName("newLocation") val newLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("projectId") val projectId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("newLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurerelocateProjectResult_c6ca4f58c0(
    @SerialName("repairedWorktrees") val repairedWorktrees: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("repairedWorktrees", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurerenameProjectEntryRequest_4a22ffc9b4(
    @SerialName("nextName") val nextName: String,
    @SerialName("path") val path: String,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("nextName", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedurereorderQueuedThreadFollowUpRequestU2DBeforeId_df704162f3 = String?

@Serializable
data class ProcedurereorderQueuedThreadFollowUpRequest_59599d21a2(
    @SerialName("beforeId") val beforeId: RemoteField<String>,
    @SerialName("id") val id: String,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("beforeId", "String", true, true, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurerestoreToRevertAnchorRequest_a6f03a5c40(
    @SerialName("anchor") val anchor: ProcedurecreateRevertAnchorResultU2DAnchor_98ef330d70,
    @SerialName("config") val config: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfig_023567f089> = RemoteField.Missing,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("anchor", "ProcedurecreateRevertAnchorResultU2DAnchor_98ef330d70", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("config", "ProcedureconnectThreadVoiceRequestU2DConfig_023567f089", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
