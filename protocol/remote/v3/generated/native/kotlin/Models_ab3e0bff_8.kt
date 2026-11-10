// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
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
enum class ProcedurereadThreadBackgroundTasksResultU2DItemU2DCategory_6d7393f750 {
    @SerialName("command") COMMAND,
    @SerialName("monitor") MONITOR,
    @SerialName("tool") TOOL,
    @SerialName("agent") AGENT,
    @SerialName("workflow") WORKFLOW,
    @SerialName("other") OTHER,
}

@Serializable
enum class ProcedurereadThreadBackgroundTasksResultU2DItemU2DKind_32b2db2eaa {
    @SerialName("command") COMMAND,
    @SerialName("other") OTHER,
}

typealias ProcedurereadThreadBackgroundTasksResultU2DItemU2DOutputActionU2DPayload_5cb1759d88 = Map<String, String>

@Serializable
data class ProcedurereadThreadBackgroundTasksResultU2DItemU2DOutputAction_4f39907576(
    @SerialName("id") val id: String,
    @SerialName("payload") val payload: ProcedurereadThreadBackgroundTasksResultU2DItemU2DOutputActionU2DPayload_5cb1759d88,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, 120, null, null, null, null, listOf()),
            RemoteFieldDescriptor("payload", "ProcedurereadThreadBackgroundTasksResultU2DItemU2DOutputActionU2DPayload_5cb1759d88", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurereadThreadBackgroundTasksResultU2DItem_ebe931a38f(
    @SerialName("category") val category: RemoteField<ProcedurereadThreadBackgroundTasksResultU2DItemU2DCategory_6d7393f750> = RemoteField.Missing,
    @SerialName("command") val command: RemoteField<String> = RemoteField.Missing,
    @SerialName("description") val description: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("kind") val kind: ProcedurereadThreadBackgroundTasksResultU2DItemU2DKind_32b2db2eaa,
    @SerialName("lastProgressAt") val lastProgressAt: RemoteField<Double> = RemoteField.Missing,
    @SerialName("outputAction") val outputAction: RemoteField<ProcedurereadThreadBackgroundTasksResultU2DItemU2DOutputAction_4f39907576> = RemoteField.Missing,
    @SerialName("progress") val progress: RemoteField<String> = RemoteField.Missing,
    @SerialName("startedAt") val startedAt: RemoteField<Double> = RemoteField.Missing,
    @SerialName("stopAction") val stopAction: RemoteField<ProcedurereadThreadBackgroundTasksResultU2DItemU2DOutputAction_4f39907576> = RemoteField.Missing,
    @SerialName("taskId") val taskId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("category", "ProcedurereadThreadBackgroundTasksResultU2DItemU2DCategory_6d7393f750", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("command", "String", false, false, null, null, null, 16384, null, null, null, null, listOf()),
            RemoteFieldDescriptor("description", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "ProcedurereadThreadBackgroundTasksResultU2DItemU2DKind_32b2db2eaa", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastProgressAt", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("outputAction", "ProcedurereadThreadBackgroundTasksResultU2DItemU2DOutputAction_4f39907576", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("progress", "String", false, false, null, null, null, 4096, null, null, null, null, listOf()),
            RemoteFieldDescriptor("startedAt", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("stopAction", "ProcedurereadThreadBackgroundTasksResultU2DItemU2DOutputAction_4f39907576", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("taskId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedurereadThreadBackgroundTasksResult_f5906c75b7 = List<ProcedurereadThreadBackgroundTasksResultU2DItem_ebe931a38f>

@Serializable
enum class ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItemU2DOptionU2D1U2DKind_236d6f96ed {
    @SerialName("native") NATIVE,
}

@Serializable
data class ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItemU2DOptionU2D1_c538d0467a(
    @SerialName("kind") val kind: ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItemU2DOptionU2D1U2DKind_236d6f96ed,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItemU2DOptionU2D1U2DKind_236d6f96ed", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992.Serializer::class)
sealed interface ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992 {
    data class Option1(val value: ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItemU2DOptionU2D1_c538d0467a) : ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992
    data class Option2(val value: ProcedureconnectThreadVoiceRequestU2DConfigU2DExecutionEnvironment_4cd2587996) : ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992
    object Serializer : KSerializer<ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992")
        override fun deserialize(decoder: Decoder): ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("native")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItemU2DOptionU2D1_c538d0467a>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("wsl")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedureconnectThreadVoiceRequestU2DConfigU2DExecutionEnvironment_4cd2587996>(element)) }
            return RemoteUnionCodec.single("ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItemU2DOptionU2D1_c538d0467a>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedureconnectThreadVoiceRequestU2DConfigU2DExecutionEnvironment_4cd2587996>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class ProcedurerefreshAgentStatusesRequestU2DScope_be6dbda06a(
    @SerialName("agentKinds") val agentKinds: List<String>,
    @SerialName("envs") val envs: RemoteField<List<ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKinds", "List<String>", true, false, null, null, null, null, 1, null, null, null, listOf()),
            RemoteFieldDescriptor("envs", "List<ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurerefreshAgentStatusesRequest_0cf7156720(
    @SerialName("scope") val scope: RemoteField<ProcedurerefreshAgentStatusesRequestU2DScope_be6dbda06a> = RemoteField.Missing,
    @SerialName("wslDistros") val wslDistros: RemoteField<List<String>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("scope", "ProcedurerefreshAgentStatusesRequestU2DScope_be6dbda06a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslDistros", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1U2DType_aaf42afe3b {
    @SerialName("env_var") ENVU5FVAR,
}

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1U2DVarsU2DItem_8103808258(
    @SerialName("label") val label: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("name") val name: String,
    @SerialName("optional") val optional: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("secret") val secret: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("label", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("optional", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("secret", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1_cdc63841ca(
    @SerialName("description") val description: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("link") val link: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("name") val name: String,
    @SerialName("type") val type: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1U2DType_aaf42afe3b,
    @SerialName("vars") val vars: List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1U2DVarsU2DItem_8103808258>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("description", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("link", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1U2DType_aaf42afe3b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("vars", "List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1U2DVarsU2DItem_8103808258>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D2U2DType_c4197e46f3 {
    @SerialName("terminal") TERMINAL,
}

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D2_8ab3ef50fe(
    @SerialName("args") val args: RemoteField<List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>> = RemoteField.Missing,
    @SerialName("description") val description: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("env") val env: RemoteField<ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("name") val name: String,
    @SerialName("type") val type: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D2U2DType_c4197e46f3,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("args", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("description", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("env", "ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D2U2DType_c4197e46f3", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D3U2DType_a5b7c88e39 {
    @SerialName("agent") AGENT,
}

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D3_0fd7e0ac40(
    @SerialName("description") val description: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("name") val name: String,
    @SerialName("type") val type: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D3U2DType_a5b7c88e39> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("description", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D3U2DType_a5b7c88e39", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966.Serializer::class)
sealed interface ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966 {
    data class Option1(val value: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1_cdc63841ca) : ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966
    data class Option2(val value: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D2_8ab3ef50fe) : ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966
    data class Option3(val value: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D3_0fd7e0ac40) : ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966
    object Serializer : KSerializer<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966")
        override fun deserialize(decoder: Decoder): ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966>>()
            RemoteUnionCodec.tryOption(matches, 1, element is JsonObject) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1_cdc63841ca>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, element is JsonObject) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D2_8ab3ef50fe>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, element is JsonObject) { Option3(jsonDecoder.json.decodeFromJsonElement<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D3_0fd7e0ac40>(element)) }
            return RemoteUnionCodec.first("ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1_cdc63841ca>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D2_8ab3ef50fe>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D3_0fd7e0ac40>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthState_2363c4dd0a {
    @SerialName("authenticated") AUTHENTICATED,
    @SerialName("missing") MISSING,
    @SerialName("unknown") UNKNOWN,
}

@Serializable(with = ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b.Serializer::class)
sealed interface ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b {
    data class Option1(val value: Boolean) : ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b
    data class Option2(val value: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b) : ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b
    object Serializer : KSerializer<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b")
        override fun deserialize(decoder: Decoder): ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesBoolean(element)) { Option1(jsonDecoder.json.decodeFromJsonElement<Boolean>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesString(element)) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>(element)) }
            return RemoteUnionCodec.first("ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<Boolean>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

typealias ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaults_cff1242509 = Map<String, ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b>

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd(
    @SerialName("description") val description: RemoteField<String> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("label") val label: String,
    @SerialName("tooltipDescription") val tooltipDescription: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("description", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tooltipDescription", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DBypassPermissions_97dee2d496(
    @SerialName("approvalPolicy") val approvalPolicy: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("sandboxMode") val sandboxMode: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("approvalPolicy", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sandboxMode", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DCrossagentMcpRouting_d1d29954f5 {
    @SerialName("thread-token") THREADU2DTOKEN,
    @SerialName("provider-session") PROVIDERU2DSESSION,
}

@Serializable
enum class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DLiveInputMode_88480e7409 {
    @SerialName("terminal") TERMINAL,
    @SerialName("server") SERVER,
}

@Serializable
enum class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DLiveVoiceU2DTransport_9a8b3412f7 {
    @SerialName("webrtc") WEBRTC,
}
