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
    @SerialName("content") val content: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("modifiedAtMs") val modifiedAtMs: RemoteField<Double> = RemoteField.Missing,
    @SerialName("status") val status: ProcedurereadAbsoluteFileResultU2DStatus_949f0ec1c2,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("content", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
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
    @SerialName("content") val content: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("contentBase64") val contentBase64: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("hasBom") val hasBom: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("lineEnding") val lineEnding: RemoteField<ProcedurereadExternalFileResultU2DLineEnding_6d6f1fde73> = RemoteField.Missing,
    @SerialName("modifiedAtMs") val modifiedAtMs: Double,
    @SerialName("path") val path: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("status") val status: ProcedurereadAbsoluteFileResultU2DStatus_949f0ec1c2,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("content", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("contentBase64", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("hasBom", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lineEnding", "ProcedurereadExternalFileResultU2DLineEnding_6d6f1fde73", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modifiedAtMs", "Double", true, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
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
    @SerialName("content") val content: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("contentBase64") val contentBase64: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("hasBom") val hasBom: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("lineEnding") val lineEnding: RemoteField<ProcedurereadExternalFileResultU2DLineEnding_6d6f1fde73> = RemoteField.Missing,
    @SerialName("modifiedAtMs") val modifiedAtMs: Double,
    @SerialName("path") val path: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("status") val status: ProcedurereadProjectFileResultU2DStatus_620971ca17,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("content", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("contentBase64", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("hasBom", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lineEnding", "ProcedurereadExternalFileResultU2DLineEnding_6d6f1fde73", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modifiedAtMs", "Double", true, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedurereadProjectFileResultU2DStatus_620971ca17", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedurereadTerminalSizeResult_2d2a48957e = ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09?

typealias ProcedurereadTerminalSnapshotResultU2DOptionU2D1U2DColumnChangesU2DItemU2DColumns_7b1fe7d08a = Long?

@Serializable
data class ProcedurereadTerminalSnapshotResultU2DOptionU2D1U2DColumnChangesU2DItem_fc33becf88(
    @SerialName("columns") val columns: RemoteField<Long>,
    @SerialName("fromCursor") val fromCursor: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("columns", "Long", true, true, 20.0, 400.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fromCursor", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurereadTerminalSnapshotResultU2DOptionU2D1U2DProcessState_f156a9bc12 {
    @SerialName("running") RUNNING,
    @SerialName("exited") EXITED,
}

@Serializable
data class ProcedurereadTerminalSnapshotResultU2DOptionU2D1_95daca4313(
    @SerialName("columnChanges") val columnChanges: RemoteField<List<ProcedurereadTerminalSnapshotResultU2DOptionU2D1U2DColumnChangesU2DItem_fc33becf88>> = RemoteField.Missing,
    @SerialName("data") val data: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("fromCursor") val fromCursor: Long,
    @SerialName("generation") val generation: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>,
    @SerialName("processState") val processState: ProcedurereadTerminalSnapshotResultU2DOptionU2D1U2DProcessState_f156a9bc12,
    @SerialName("terminalSize") val terminalSize: RemoteField<ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09>,
    @SerialName("toCursor") val toCursor: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("columnChanges", "List<ProcedurereadTerminalSnapshotResultU2DOptionU2D1U2DColumnChangesU2DItem_fc33becf88>", false, false, null, null, null, null, null, 2049, null, null, listOf()),
            RemoteFieldDescriptor("data", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fromCursor", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("generation", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("processState", "ProcedurereadTerminalSnapshotResultU2DOptionU2D1U2DProcessState_f156a9bc12", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("terminalSize", "ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("toCursor", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedurereadTerminalSnapshotResult_575ba25e2b = ProcedurereadTerminalSnapshotResultU2DOptionU2D1_95daca4313?

@Serializable
enum class ProcedurereadThreadBackgroundTasksResultU2DItemU2DCategory_6d7393f750 {
    @SerialName("command") COMMAND,
    @SerialName("monitor") MONITOR,
    @SerialName("tool") TOOL,
    @SerialName("agent") AGENT,
    @SerialName("workflow") WORKFLOW,
    @SerialName("other") OTHER,
}
