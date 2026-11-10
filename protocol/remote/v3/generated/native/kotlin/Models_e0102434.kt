// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RouteshellU2DSnapshotResponseU2DWorkspacesU2DItem_33250cfe65(
    @SerialName("id") val id: String,
    @SerialName("name") val name: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteshellU2DSnapshotResponse_893eca5a7b(
    @SerialName("gitState") val gitState: RemoteField<RouteshellU2DSnapshotResponseU2DGitState_039d29a220> = RemoteField.Missing,
    @SerialName("gitSummariesByThread") val gitSummariesByThread: RemoteField<RouteshellU2DSnapshotResponseU2DGitSummariesByThread_aca97eda78> = RemoteField.Missing,
    @SerialName("projects") val projects: List<RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_9ee4a9aa10>,
    @SerialName("projectsNextCursor") val projectsNextCursor: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("reads") val reads: RemoteField<RouteprojectU2DListQueryU2DReads_4659e6d395> = RemoteField.Missing,
    @SerialName("runtimeSummariesByThread") val runtimeSummariesByThread: RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThread_fc9d6f4c26,
    @SerialName("snapshotEpoch") val snapshotEpoch: RemoteField<String> = RemoteField.Missing,
    @SerialName("snapshotSeq") val snapshotSeq: Long,
    @SerialName("threads") val threads: List<RouteshellU2DSnapshotResponseU2DThreadsU2DItem_aae5723e41>,
    @SerialName("threadsNextCursor") val threadsNextCursor: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("updatedAt") val updatedAt: String,
    @SerialName("workspaces") val workspaces: RemoteField<List<RouteshellU2DSnapshotResponseU2DWorkspacesU2DItem_33250cfe65>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("gitState", "RouteshellU2DSnapshotResponseU2DGitState_039d29a220", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("gitSummariesByThread", "RouteshellU2DSnapshotResponseU2DGitSummariesByThread_aca97eda78", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projects", "List<RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_9ee4a9aa10>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectsNextCursor", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reads", "RouteprojectU2DListQueryU2DReads_4659e6d395", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeSummariesByThread", "RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThread_fc9d6f4c26", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("snapshotEpoch", "String", false, false, null, null, 1, 128, null, null, null, null, listOf()),
            RemoteFieldDescriptor("snapshotSeq", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threads", "List<RouteshellU2DSnapshotResponseU2DThreadsU2DItem_aae5723e41>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadsNextCursor", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("updatedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("workspaces", "List<RouteshellU2DSnapshotResponseU2DWorkspacesU2DItem_33250cfe65>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteterminalU2DStartRequestU2DWindowsShellRuntime_9368b22ce4 {
    @SerialName("preferred") PREFERRED,
    @SerialName("powershell") POWERSHELL,
}

@Serializable
data class RouteterminalU2DStartRequest_b03238f553(
    @SerialName("initialSize") val initialSize: RemoteField<ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("shellId") val shellId: String,
    @SerialName("startInHome") val startInHome: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("windowsShellRuntime") val windowsShellRuntime: RemoteField<RouteterminalU2DStartRequestU2DWindowsShellRuntime_9368b22ce4> = RemoteField.Missing,
    @SerialName("worktreePath") val worktreePath: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("initialSize", "ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("shellId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("startInHome", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("windowsShellRuntime", "RouteterminalU2DStartRequestU2DWindowsShellRuntime_9368b22ce4", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteterminalU2DWriteRequest_6c6fca7050(
    @SerialName("data") val data: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("data", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DAgentU2DVisionQueryU2DPreview_2eb2bd4b48 {
    @SerialName("0") N0,
    @SerialName("1") N1,
}

@Serializable
data class RoutethreadU2DAgentU2DVisionQuery_5ffd0d821b(
    @SerialName("preview") val preview: RemoteField<RoutethreadU2DAgentU2DVisionQueryU2DPreview_2eb2bd4b48> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("preview", "RoutethreadU2DAgentU2DVisionQueryU2DPreview_2eb2bd4b48", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DAgentU2DVisionResponseU2DOptionU2D1U2DSource_9addfc34d2 {
    @SerialName("browser") BROWSER,
    @SerialName("chrome") CHROME,
    @SerialName("computer") COMPUTER,
}

@Serializable
enum class RoutethreadU2DAgentU2DVisionResponseU2DOptionU2D1U2DStatus_cf7eae9345 {
    @SerialName("running") RUNNING,
    @SerialName("idle") IDLE,
    @SerialName("error") ERROR,
}

@Serializable
data class RoutethreadU2DAgentU2DVisionResponseU2DOptionU2D1_1e25c599a6(
    @SerialName("capturedAt") val capturedAt: RemoteField<Double> = RemoteField.Missing,
    @SerialName("image") val image: RemoteField<String> = RemoteField.Missing,
    @SerialName("source") val source: RoutethreadU2DAgentU2DVisionResponseU2DOptionU2D1U2DSource_9addfc34d2,
    @SerialName("status") val status: RoutethreadU2DAgentU2DVisionResponseU2DOptionU2D1U2DStatus_cf7eae9345,
    @SerialName("streamVersion") val streamVersion: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72> = RemoteField.Missing,
    @SerialName("target") val target: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("toolName") val toolName: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("updatedAt") val updatedAt: Double,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("capturedAt", "Double", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("image", "String", false, false, null, null, null, 3145728, null, null, "^data:image\\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$", null, listOf()),
            RemoteFieldDescriptor("source", "RoutethreadU2DAgentU2DVisionResponseU2DOptionU2D1U2DSource_9addfc34d2", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "RoutethreadU2DAgentU2DVisionResponseU2DOptionU2D1U2DStatus_cf7eae9345", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("streamVersion", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("target", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("toolName", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("updatedAt", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RoutethreadU2DAgentU2DVisionResponse_af80d04059 = RoutethreadU2DAgentU2DVisionResponseU2DOptionU2D1_1e25c599a6?

@Serializable
data class RoutethreadU2DCheckpointU2DRevertRequest_40f9a6009b(
    @SerialName("checkpointItemId") val checkpointItemId: String,
    @SerialName("operationKey") val operationKey: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("checkpointItemId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("operationKey", "String", true, false, null, null, 8, 110, null, null, "^[A-Za-z0-9._:-]+$", null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCheckpointU2DRevertResponseU2DFilesPhase_efc124973b {
    @SerialName("pending") PENDING,
    @SerialName("completed") COMPLETED,
    @SerialName("failed") FAILED,
    @SerialName("skipped_no_location") SKIPPEDU5FNOU5FLOCATION,
    @SerialName("skipped_missing_checkpoint") SKIPPEDU5FMISSINGU5FCHECKPOINT,
}

@Serializable
enum class RoutethreadU2DCheckpointU2DRevertResponseU2DOutcome_08ce03e607 {
    @SerialName("completed") COMPLETED,
    @SerialName("completed_local_only") COMPLETEDU5FLOCALU5FONLY,
    @SerialName("ambiguous") AMBIGUOUS,
    @SerialName("failed") FAILED,
    @SerialName("noop") NOOP,
}

@Serializable
enum class RoutethreadU2DCheckpointU2DRevertResponseU2DProviderPhase_11ada4e73a {
    @SerialName("pending") PENDING,
    @SerialName("completed") COMPLETED,
    @SerialName("failed") FAILED,
    @SerialName("ambiguous") AMBIGUOUS,
    @SerialName("skipped_no_turns") SKIPPEDU5FNOU5FTURNS,
    @SerialName("skipped_missing_checkpoint") SKIPPEDU5FMISSINGU5FCHECKPOINT,
}

@Serializable
enum class RoutethreadU2DCheckpointU2DRevertResponseU2DTruncatePhase_35962a43ae {
    @SerialName("pending") PENDING,
    @SerialName("completed") COMPLETED,
    @SerialName("noop") NOOP,
}

@Serializable
data class RoutethreadU2DCheckpointU2DRevertResponse_8dfc34ff21(
    @SerialName("filesPhase") val filesPhase: RoutethreadU2DCheckpointU2DRevertResponseU2DFilesPhase_efc124973b,
    @SerialName("numTurns") val numTurns: Long,
    @SerialName("outcome") val outcome: RoutethreadU2DCheckpointU2DRevertResponseU2DOutcome_08ce03e607,
    @SerialName("providerPhase") val providerPhase: RoutethreadU2DCheckpointU2DRevertResponseU2DProviderPhase_11ada4e73a,
    @SerialName("removedCompletedTurnAnchors") val removedCompletedTurnAnchors: List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("replayed") val replayed: Boolean,
    @SerialName("truncatePhase") val truncatePhase: RoutethreadU2DCheckpointU2DRevertResponseU2DTruncatePhase_35962a43ae,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("filesPhase", "RoutethreadU2DCheckpointU2DRevertResponseU2DFilesPhase_efc124973b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("numTurns", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("outcome", "RoutethreadU2DCheckpointU2DRevertResponseU2DOutcome_08ce03e607", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerPhase", "RoutethreadU2DCheckpointU2DRevertResponseU2DProviderPhase_11ada4e73a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("removedCompletedTurnAnchors", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("replayed", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("truncatePhase", "RoutethreadU2DCheckpointU2DRevertResponseU2DTruncatePhase_35962a43ae", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D10U2DKind_833ef472e7 {
    @SerialName("set-starred") SETU2DSTARRED,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D10_ebd70a208b(
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D10U2DKind_833ef472e7,
    @SerialName("starred") val starred: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D10U2DKind_833ef472e7", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("starred", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D11U2DKind_49f72e8cc5 {
    @SerialName("set-worktree") SETU2DWORKTREE,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D11_b79d8f64de(
    @SerialName("isNewWorktree") val isNewWorktree: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D11U2DKind_49f72e8cc5,
    @SerialName("worktreeBranch") val worktreeBranch: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("worktreePath") val worktreePath: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("isNewWorktree", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D11U2DKind_49f72e8cc5", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeBranch", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D12U2DKind_6a0abedb39 {
    @SerialName("delete-worktree-group") DELETEU2DWORKTREEU2DGROUP,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D12_09765c7778(
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D12U2DKind_6a0abedb39,
    @SerialName("projectId") val projectId: String,
    @SerialName("threadIds") val threadIds: List<String>,
    @SerialName("worktreePath") val worktreePath: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D12U2DKind_6a0abedb39", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadIds", "List<String>", true, false, null, null, null, null, 1, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D13U2DKind_53ceafeed2 {
    @SerialName("archive") ARCHIVE,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D13_431be1ab7e(
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D13U2DKind_53ceafeed2,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D13U2DKind_53ceafeed2", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D14U2DKind_c7bfc39efc {
    @SerialName("unarchive") UNARCHIVE,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D14_a93ba7bf23(
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D14U2DKind_c7bfc39efc,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D14U2DKind_c7bfc39efc", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D15_370ff0ec0a(
    @SerialName("kind") val kind: RouteschedulesU2DCommandRequestU2DOptionU2D3U2DKind_4d5989d27d,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteschedulesU2DCommandRequestU2DOptionU2D3U2DKind_4d5989d27d", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D16_2062bc5ac9(
    @SerialName("kind") val kind: RouteprojectU2DCommandRequestU2DOptionU2D7U2DKind_701d7d6274,
    @SerialName("placement") val placement: RoutebrowserU2DCommandRequestU2DOptionU2D4U2DPosition_3512bd687e,
    @SerialName("projectId") val projectId: String,
    @SerialName("targetThreadId") val targetThreadId: String,
    @SerialName("threadIds") val threadIds: List<String>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteprojectU2DCommandRequestU2DOptionU2D7U2DKind_701d7d6274", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("placement", "RoutebrowserU2DCommandRequestU2DOptionU2D4U2DPosition_3512bd687e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("targetThreadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadIds", "List<String>", true, false, null, null, null, null, 1, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D17U2DKind_8e7b4d097a {
    @SerialName("reorder-flat") REORDERU2DFLAT,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D17_efd9410c75(
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D17U2DKind_8e7b4d097a,
    @SerialName("placement") val placement: RoutebrowserU2DCommandRequestU2DOptionU2D4U2DPosition_3512bd687e,
    @SerialName("projectId") val projectId: String,
    @SerialName("targetThreadId") val targetThreadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D17U2DKind_8e7b4d097a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("placement", "RoutebrowserU2DCommandRequestU2DOptionU2D4U2DPosition_3512bd687e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("targetThreadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
