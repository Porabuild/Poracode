// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RouteshellU2DSnapshotResponseU2DThreadsU2DItem_85fe4f2f37(
    @SerialName("activeTurnStartedAt") val activeTurnStartedAt: RemoteField<String> = RemoteField.Missing,
    @SerialName("agentInstanceId") val agentInstanceId: RemoteField<String> = RemoteField.Missing,
    @SerialName("agentKind") val agentKind: String,
    @SerialName("archived") val archived: Boolean,
    @SerialName("attention") val attention: RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAttention_58edfaf9f7,
    @SerialName("canResumeWithConfig") val canResumeWithConfig: Boolean,
    @SerialName("config") val config: ProcedurerollbackThreadConversationRequestU2DConfig_03b0262a8a,
    @SerialName("createdAt") val createdAt: String,
    @SerialName("done") val done: Boolean,
    @SerialName("doneAt") val doneAt: RemoteField<String> = RemoteField.Missing,
    @SerialName("errorMessage") val errorMessage: RemoteField<String> = RemoteField.Missing,
    @SerialName("groupId") val groupId: RemoteField<String> = RemoteField.Missing,
    @SerialName("groupName") val groupName: RemoteField<String> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("lastTurnEndedAt") val lastTurnEndedAt: RemoteField<String> = RemoteField.Missing,
    @SerialName("lastTurnStartedAt") val lastTurnStartedAt: RemoteField<String> = RemoteField.Missing,
    @SerialName("parentThreadId") val parentThreadId: RemoteField<String> = RemoteField.Missing,
    @SerialName("prNumber") val prNumber: RemoteField<Double> = RemoteField.Missing,
    @SerialName("presentationMode") val presentationMode: RemoteField<ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6> = RemoteField.Missing,
    @SerialName("projectId") val projectId: String,
    @SerialName("remoteId") val remoteId: RemoteField<String> = RemoteField.Missing,
    @SerialName("remoteServerId") val remoteServerId: RemoteField<String> = RemoteField.Missing,
    @SerialName("sessionRef") val sessionRef: RemoteField<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionRef_3b70e9f118> = RemoteField.Missing,
    @SerialName("slashCommands") val slashCommands: RemoteField<List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSlashCommandsU2DItem_7324613e41>> = RemoteField.Missing,
    @SerialName("starred") val starred: Boolean,
    @SerialName("status") val status: RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DStatus_8c61ed237d,
    @SerialName("threadStatusSource") val threadStatusSource: RemoteField<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DThreadStatusSource_8f73948792> = RemoteField.Missing,
    @SerialName("title") val title: String,
    @SerialName("updatedAt") val updatedAt: String,
    @SerialName("worktreeBranch") val worktreeBranch: RemoteField<String> = RemoteField.Missing,
    @SerialName("worktreePath") val worktreePath: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("activeTurnStartedAt", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("agentInstanceId", "String", false, false, null, null, 1, 120, null, null, "^[a-z0-9][a-z0-9_\\-:.]*$", null, listOf()),
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("archived", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("attention", "RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAttention_58edfaf9f7", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("canResumeWithConfig", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("config", "ProcedurerollbackThreadConversationRequestU2DConfig_03b0262a8a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("createdAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("done", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("doneAt", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("errorMessage", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("groupId", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("groupName", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastTurnEndedAt", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastTurnStartedAt", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("parentThreadId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prNumber", "Double", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationMode", "ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remoteId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remoteServerId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sessionRef", "RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionRef_3b70e9f118", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("slashCommands", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSlashCommandsU2DItem_7324613e41>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("starred", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DStatus_8c61ed237d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadStatusSource", "RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DThreadStatusSource_8f73948792", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("updatedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeBranch", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteshellU2DSnapshotResponse_611f9fdfa6(
    @SerialName("gitState") val gitState: RemoteField<RouteshellU2DSnapshotResponseU2DGitState_4331716fe2> = RemoteField.Missing,
    @SerialName("gitSummariesByThread") val gitSummariesByThread: RemoteField<RouteshellU2DSnapshotResponseU2DGitSummariesByThread_aca97eda78> = RemoteField.Missing,
    @SerialName("projects") val projects: List<RouteprojectU2DCommandResponseU2DProject_1bee38d9c4>,
    @SerialName("runtimeSummariesByThread") val runtimeSummariesByThread: RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThread_fc9d6f4c26,
    @SerialName("snapshotSeq") val snapshotSeq: Long,
    @SerialName("threads") val threads: List<RouteshellU2DSnapshotResponseU2DThreadsU2DItem_85fe4f2f37>,
    @SerialName("updatedAt") val updatedAt: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("gitState", "RouteshellU2DSnapshotResponseU2DGitState_4331716fe2", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("gitSummariesByThread", "RouteshellU2DSnapshotResponseU2DGitSummariesByThread_aca97eda78", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projects", "List<RouteprojectU2DCommandResponseU2DProject_1bee38d9c4>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeSummariesByThread", "RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThread_fc9d6f4c26", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("snapshotSeq", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threads", "List<RouteshellU2DSnapshotResponseU2DThreadsU2DItem_85fe4f2f37>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("updatedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteterminalU2DResizeRequest_55ee222c09(
    @SerialName("cols") val cols: Long,
    @SerialName("rows") val rows: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cols", "Long", true, false, 20.0, 400.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("rows", "Long", true, false, 5.0, 200.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteterminalU2DStartRequest_142a10f7fa(
    @SerialName("initialSize") val initialSize: RemoteField<RouteterminalU2DResizeRequest_55ee222c09> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("shellId") val shellId: String,
    @SerialName("startInHome") val startInHome: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("worktreePath") val worktreePath: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("initialSize", "RouteterminalU2DResizeRequest_55ee222c09", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("shellId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("startInHome", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
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
enum class RoutethreadU2DCommandRequestU2DOptionU2D10U2DKind_6a0abedb39 {
    @SerialName("delete-worktree-group") DELETEU2DWORKTREEU2DGROUP,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D10_09765c7778(
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D10U2DKind_6a0abedb39,
    @SerialName("projectId") val projectId: String,
    @SerialName("threadIds") val threadIds: List<String>,
    @SerialName("worktreePath") val worktreePath: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D10U2DKind_6a0abedb39", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadIds", "List<String>", true, false, null, null, null, null, 1, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D11U2DKind_53ceafeed2 {
    @SerialName("archive") ARCHIVE,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D11_431be1ab7e(
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D11U2DKind_53ceafeed2,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D11U2DKind_53ceafeed2", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D12U2DKind_c7bfc39efc {
    @SerialName("unarchive") UNARCHIVE,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D12_a93ba7bf23(
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D12U2DKind_c7bfc39efc,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D12U2DKind_c7bfc39efc", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D13_370ff0ec0a(
    @SerialName("kind") val kind: RouteschedulesU2DCommandRequestU2DOptionU2D3U2DKind_4d5989d27d,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteschedulesU2DCommandRequestU2DOptionU2D3U2DKind_4d5989d27d", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D1U2DKind_a1f40266b6 {
    @SerialName("prepare-worktree") PREPAREU2DWORKTREE,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D1_b01e26e043(
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D1U2DKind_a1f40266b6,
    @SerialName("projectId") val projectId: String,
    @SerialName("worktreePath") val worktreePath: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D1U2DKind_a1f40266b6", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D2U2DKind_60fc988aef {
    @SerialName("start") START,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D2_1abd482e22(
    @SerialName("agentInstanceId") val agentInstanceId: RemoteField<String> = RemoteField.Missing,
    @SerialName("agentKind") val agentKind: String,
    @SerialName("config") val config: ProcedurerollbackThreadConversationRequestU2DConfig_03b0262a8a,
    @SerialName("focus") val focus: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("groupId") val groupId: RemoteField<String> = RemoteField.Missing,
    @SerialName("groupName") val groupName: RemoteField<String> = RemoteField.Missing,
    @SerialName("isNewWorktree") val isNewWorktree: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D2U2DKind_60fc988aef,
    @SerialName("launchRuntime") val launchRuntime: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("parentThreadId") val parentThreadId: RemoteField<String> = RemoteField.Missing,
    @SerialName("prNumber") val prNumber: RemoteField<Long> = RemoteField.Missing,
    @SerialName("presentationMode") val presentationMode: RemoteField<ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6> = RemoteField.Missing,
    @SerialName("projectId") val projectId: String,
    @SerialName("prompt") val prompt: String,
    @SerialName("segments") val segments: RemoteField<List<ProcedurestageThreadInputRequestU2DSegmentsU2DItem_99d0ed7b00>> = RemoteField.Missing,
    @SerialName("title") val title: RemoteField<String> = RemoteField.Missing,
    @SerialName("userMessageItemId") val userMessageItemId: RemoteField<String> = RemoteField.Missing,
    @SerialName("worktreeBranch") val worktreeBranch: RemoteField<String> = RemoteField.Missing,
    @SerialName("worktreePath") val worktreePath: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentInstanceId", "String", false, false, null, null, 1, 120, null, null, "^[a-z0-9][a-z0-9_\\-:.]*$", null, listOf()),
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("config", "ProcedurerollbackThreadConversationRequestU2DConfig_03b0262a8a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("focus", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("groupId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("groupName", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("isNewWorktree", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D2U2DKind_60fc988aef", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("launchRuntime", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("parentThreadId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prNumber", "Long", false, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationMode", "ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prompt", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("segments", "List<ProcedurestageThreadInputRequestU2DSegmentsU2DItem_99d0ed7b00>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("userMessageItemId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeBranch", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D3U2DKind_f399af5f8d {
    @SerialName("set-group") SETU2DGROUP,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D3_a656e9f996(
    @SerialName("groupId") val groupId: String,
    @SerialName("groupName") val groupName: String,
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D3U2DKind_f399af5f8d,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("groupId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("groupName", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D3U2DKind_f399af5f8d", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D4U2DKind_03fdf2ff7a {
    @SerialName("clear-group") CLEARU2DGROUP,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D4_1ae7de2180(
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D4U2DKind_03fdf2ff7a,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D4U2DKind_03fdf2ff7a", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D5U2DKind_356ae1fc45 {
    @SerialName("rename") RENAME,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D5_2e4d2aaed0(
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D5U2DKind_356ae1fc45,
    @SerialName("title") val title: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D5U2DKind_356ae1fc45", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D6U2DKind_4ec1299a98 {
    @SerialName("acknowledge") ACKNOWLEDGE,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D6_c3363423bb(
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D6U2DKind_4ec1299a98,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D6U2DKind_4ec1299a98", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D7U2DKind_a9e065ca18 {
    @SerialName("set-done") SETU2DDONE,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D7_80906c6ddc(
    @SerialName("done") val done: Boolean,
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D7U2DKind_a9e065ca18,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("done", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D7U2DKind_a9e065ca18", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D8U2DKind_833ef472e7 {
    @SerialName("set-starred") SETU2DSTARRED,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D8_ebd70a208b(
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D8U2DKind_833ef472e7,
    @SerialName("starred") val starred: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D8U2DKind_833ef472e7", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("starred", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D9U2DKind_49f72e8cc5 {
    @SerialName("set-worktree") SETU2DWORKTREE,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D9_b79d8f64de(
    @SerialName("isNewWorktree") val isNewWorktree: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D9U2DKind_49f72e8cc5,
    @SerialName("worktreeBranch") val worktreeBranch: RemoteField<String> = RemoteField.Missing,
    @SerialName("worktreePath") val worktreePath: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("isNewWorktree", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D9U2DKind_49f72e8cc5", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeBranch", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
