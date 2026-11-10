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
