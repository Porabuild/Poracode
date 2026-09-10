// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RouteshellU2DSnapshotResponseU2DGitStateU2DPullRequestsU2DValue_5a8fe22d39(
    @SerialName("data") val data: ProcedureghCreatePrResult_a4457c545e,
    @SerialName("details") val details: RemoteField<ProcedureghGetPrDetailsResultU2DDetails_9f1da8cf54> = RemoteField.Missing,
    @SerialName("diff") val diff: RemoteField<String> = RemoteField.Missing,
    @SerialName("files") val files: RemoteField<List<ProcedureghGetPrFilesResultU2DFilesU2DItem_63c18b52ff>> = RemoteField.Missing,
    @SerialName("freshness") val freshness: RouteshellU2DSnapshotResponseU2DGitStateU2DPullRequestsU2DValueU2DFreshness_0bd7710eac,
    @SerialName("ref") val ref: RouteshellU2DSnapshotResponseU2DGitStateU2DPullRequestsU2DValueU2DRef_2558986145,
    @SerialName("reviewThreads") val reviewThreads: RemoteField<List<ProcedureghGetPrReviewCommentsResultU2DThreadsU2DItem_9199b6e9ea>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("data", "ProcedureghCreatePrResult_a4457c545e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("details", "ProcedureghGetPrDetailsResultU2DDetails_9f1da8cf54", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("diff", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("files", "List<ProcedureghGetPrFilesResultU2DFilesU2DItem_63c18b52ff>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("freshness", "RouteshellU2DSnapshotResponseU2DGitStateU2DPullRequestsU2DValueU2DFreshness_0bd7710eac", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ref", "RouteshellU2DSnapshotResponseU2DGitStateU2DPullRequestsU2DValueU2DRef_2558986145", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reviewThreads", "List<ProcedureghGetPrReviewCommentsResultU2DThreadsU2DItem_9199b6e9ea>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteshellU2DSnapshotResponseU2DGitStateU2DPullRequests_4c858ee6a4 = Map<String, RouteshellU2DSnapshotResponseU2DGitStateU2DPullRequestsU2DValue_5a8fe22d39>

@Serializable
data class RouteshellU2DSnapshotResponseU2DGitStateU2DTargetsU2DValueU2DRef_725be166aa(
    @SerialName("hostId") val hostId: String,
    @SerialName("projectId") val projectId: String,
    @SerialName("worktreePath") val worktreePath: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("hostId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DGitStateU2DTargetsU2DValue_d68bbd0856(
    @SerialName("pullRequestKey") val pullRequestKey: RemoteField<String> = RemoteField.Missing,
    @SerialName("ref") val ref: RouteshellU2DSnapshotResponseU2DGitStateU2DTargetsU2DValueU2DRef_725be166aa,
    @SerialName("refreshedAt") val refreshedAt: String,
    @SerialName("sourceInfo") val sourceInfo: RemoteField<ProceduregitGetWorktreeSourceBranchResult_4864c5f65a> = RemoteField.Missing,
    @SerialName("status") val status: RemoteField<ProceduregetGitStatusResult_c1d4a9f752> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("pullRequestKey", "String", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ref", "RouteshellU2DSnapshotResponseU2DGitStateU2DTargetsU2DValueU2DRef_725be166aa", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("refreshedAt", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sourceInfo", "ProceduregitGetWorktreeSourceBranchResult_4864c5f65a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProceduregetGitStatusResult_c1d4a9f752", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteshellU2DSnapshotResponseU2DGitStateU2DTargets_7675a7cd6a = Map<String, RouteshellU2DSnapshotResponseU2DGitStateU2DTargetsU2DValue_d68bbd0856>

@Serializable
data class RouteshellU2DSnapshotResponseU2DGitState_4331716fe2(
    @SerialName("projectPullRequestLists") val projectPullRequestLists: RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestLists_d8ae5c3a60,
    @SerialName("projects") val projects: RouteshellU2DSnapshotResponseU2DGitStateU2DProjects_1da8031b61,
    @SerialName("pullRequestKeyByBranch") val pullRequestKeyByBranch: ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67,
    @SerialName("pullRequests") val pullRequests: RouteshellU2DSnapshotResponseU2DGitStateU2DPullRequests_4c858ee6a4,
    @SerialName("revision") val revision: Long,
    @SerialName("targets") val targets: RouteshellU2DSnapshotResponseU2DGitStateU2DTargets_7675a7cd6a,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("projectPullRequestLists", "RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestLists_d8ae5c3a60", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projects", "RouteshellU2DSnapshotResponseU2DGitStateU2DProjects_1da8031b61", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pullRequestKeyByBranch", "ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pullRequests", "RouteshellU2DSnapshotResponseU2DGitStateU2DPullRequests_4c858ee6a4", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("revision", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("targets", "RouteshellU2DSnapshotResponseU2DGitStateU2DTargets_7675a7cd6a", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DGitSummariesByThreadU2DValueU2DPrU2DOptionU2D1_1c58197f24(
    @SerialName("checksStatus") val checksStatus: RemoteField<String> = RemoteField.Missing,
    @SerialName("isDraft") val isDraft: Boolean,
    @SerialName("number") val number: Long,
    @SerialName("state") val state: ProcedureghCreatePrResultU2DState_79fd49e14d,
    @SerialName("title") val title: String,
    @SerialName("url") val url: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("checksStatus", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("isDraft", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("number", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("state", "ProcedureghCreatePrResultU2DState_79fd49e14d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteshellU2DSnapshotResponseU2DGitSummariesByThreadU2DValueU2DPr_9d263023fc = RouteshellU2DSnapshotResponseU2DGitSummariesByThreadU2DValueU2DPrU2DOptionU2D1_1c58197f24?

@Serializable
data class RouteshellU2DSnapshotResponseU2DGitSummariesByThreadU2DValue_b2a9cad3f0(
    @SerialName("ahead") val ahead: Long,
    @SerialName("behind") val behind: Long,
    @SerialName("branch") val branch: String,
    @SerialName("isRepo") val isRepo: Boolean,
    @SerialName("pr") val pr: RemoteField<RouteshellU2DSnapshotResponseU2DGitSummariesByThreadU2DValueU2DPrU2DOptionU2D1_1c58197f24>,
    @SerialName("totalDeletions") val totalDeletions: Long,
    @SerialName("totalInsertions") val totalInsertions: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("ahead", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("behind", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("branch", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("isRepo", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pr", "RouteshellU2DSnapshotResponseU2DGitSummariesByThreadU2DValueU2DPrU2DOptionU2D1_1c58197f24", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("totalDeletions", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("totalInsertions", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteshellU2DSnapshotResponseU2DGitSummariesByThread_aca97eda78 = Map<String, RouteshellU2DSnapshotResponseU2DGitSummariesByThreadU2DValue_b2a9cad3f0>

typealias RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThreadU2DValueU2DContextUsage_e47ad2358c = ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b?

@Serializable
enum class RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThreadU2DValueU2DLatestItemState_2472eab79a {
    @SerialName("started") STARTED,
    @SerialName("updated") UPDATED,
    @SerialName("completed") COMPLETED,
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThreadU2DValue_5d401c152e(
    @SerialName("contextUsage") val contextUsage: RemoteField<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b> = RemoteField.Missing,
    @SerialName("itemCount") val itemCount: Long,
    @SerialName("latestItemId") val latestItemId: RemoteField<String> = RemoteField.Missing,
    @SerialName("latestItemState") val latestItemState: RemoteField<RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThreadU2DValueU2DLatestItemState_2472eab79a> = RemoteField.Missing,
    @SerialName("latestItemType") val latestItemType: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("contextUsage", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("itemCount", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("latestItemId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("latestItemState", "RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThreadU2DValueU2DLatestItemState_2472eab79a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("latestItemType", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThread_fc9d6f4c26 = Map<String, RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThreadU2DValue_5d401c152e>

@Serializable
enum class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAttention_58edfaf9f7 {
    @SerialName("none") NONE,
    @SerialName("working") WORKING,
    @SerialName("needs_approval") NEEDSU5FAPPROVAL,
    @SerialName("needs_reply") NEEDSU5FREPLY,
    @SerialName("error") ERROR,
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionRef_3b70e9f118(
    @SerialName("discoveredAt") val discoveredAt: String,
    @SerialName("providerSessionId") val providerSessionId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("discoveredAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerSessionId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DStatus_8c61ed237d {
    @SerialName("inactive") INACTIVE,
    @SerialName("launching") LAUNCHING,
    @SerialName("working") WORKING,
    @SerialName("idle") IDLE,
    @SerialName("finished") FINISHED,
    @SerialName("needs_approval") NEEDSU5FAPPROVAL,
    @SerialName("needs_reply") NEEDSU5FREPLY,
    @SerialName("error") ERROR,
}

@Serializable
enum class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DThreadStatusSource_8f73948792 {
    @SerialName("cli_hook") CLIU5FHOOK,
    @SerialName("terminal_parse") TERMINALU5FPARSE,
    @SerialName("server") SERVER,
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DThreadsU2DItem_9f0c1cf2ff(
    @SerialName("activeTurnStartedAt") val activeTurnStartedAt: RemoteField<String> = RemoteField.Missing,
    @SerialName("agentInstanceId") val agentInstanceId: RemoteField<String> = RemoteField.Missing,
    @SerialName("agentKind") val agentKind: String,
    @SerialName("archived") val archived: Boolean,
    @SerialName("archivedAt") val archivedAt: RemoteField<String> = RemoteField.Missing,
    @SerialName("attention") val attention: RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAttention_58edfaf9f7,
    @SerialName("canResumeWithConfig") val canResumeWithConfig: Boolean,
    @SerialName("config") val config: ProcedurerollbackThreadConversationRequestU2DConfig_023567f089,
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
    @SerialName("slashCommands") val slashCommands: RemoteField<List<RouteagentU2DSlashU2DCommandsResponseU2DCommandsU2DItem_7324613e41>> = RemoteField.Missing,
    @SerialName("starred") val starred: Boolean,
    @SerialName("status") val status: RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DStatus_8c61ed237d,
    @SerialName("threadStatusSource") val threadStatusSource: RemoteField<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DThreadStatusSource_8f73948792> = RemoteField.Missing,
    @SerialName("title") val title: String,
    @SerialName("updatedAt") val updatedAt: String,
    @SerialName("workspaceId") val workspaceId: RemoteField<String> = RemoteField.Missing,
    @SerialName("worktreeBranch") val worktreeBranch: RemoteField<String> = RemoteField.Missing,
    @SerialName("worktreePath") val worktreePath: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("activeTurnStartedAt", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("agentInstanceId", "String", false, false, null, null, 1, 120, null, null, "^[a-z0-9][a-z0-9_\\-:.]*$", null, listOf()),
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("archived", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("archivedAt", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("attention", "RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAttention_58edfaf9f7", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("canResumeWithConfig", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("config", "ProcedurerollbackThreadConversationRequestU2DConfig_023567f089", true, false, null, null, null, null, null, null, null, null, listOf()),
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
            RemoteFieldDescriptor("slashCommands", "List<RouteagentU2DSlashU2DCommandsResponseU2DCommandsU2DItem_7324613e41>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("starred", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DStatus_8c61ed237d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadStatusSource", "RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DThreadStatusSource_8f73948792", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("updatedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("workspaceId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeBranch", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteshellU2DSnapshotResponse_63de465359(
    @SerialName("gitState") val gitState: RemoteField<RouteshellU2DSnapshotResponseU2DGitState_4331716fe2> = RemoteField.Missing,
    @SerialName("gitSummariesByThread") val gitSummariesByThread: RemoteField<RouteshellU2DSnapshotResponseU2DGitSummariesByThread_aca97eda78> = RemoteField.Missing,
    @SerialName("projects") val projects: List<RouteprojectU2DCommandResponseU2DProject_e21c843ae3>,
    @SerialName("runtimeSummariesByThread") val runtimeSummariesByThread: RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThread_fc9d6f4c26,
    @SerialName("snapshotSeq") val snapshotSeq: Long,
    @SerialName("threads") val threads: List<RouteshellU2DSnapshotResponseU2DThreadsU2DItem_9f0c1cf2ff>,
    @SerialName("updatedAt") val updatedAt: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("gitState", "RouteshellU2DSnapshotResponseU2DGitState_4331716fe2", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("gitSummariesByThread", "RouteshellU2DSnapshotResponseU2DGitSummariesByThread_aca97eda78", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projects", "List<RouteprojectU2DCommandResponseU2DProject_e21c843ae3>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeSummariesByThread", "RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThread_fc9d6f4c26", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("snapshotSeq", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threads", "List<RouteshellU2DSnapshotResponseU2DThreadsU2DItem_9f0c1cf2ff>", true, false, null, null, null, null, null, null, null, null, listOf()),
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
enum class RouteterminalU2DStartRequestU2DWindowsShellRuntime_9368b22ce4 {
    @SerialName("preferred") PREFERRED,
    @SerialName("powershell") POWERSHELL,
}

@Serializable
data class RouteterminalU2DStartRequest_b03238f553(
    @SerialName("initialSize") val initialSize: RemoteField<RouteterminalU2DResizeRequest_55ee222c09> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("shellId") val shellId: String,
    @SerialName("startInHome") val startInHome: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("windowsShellRuntime") val windowsShellRuntime: RemoteField<RouteterminalU2DStartRequestU2DWindowsShellRuntime_9368b22ce4> = RemoteField.Missing,
    @SerialName("worktreePath") val worktreePath: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("initialSize", "RouteterminalU2DResizeRequest_55ee222c09", false, false, null, null, null, null, null, null, null, null, listOf()),
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
data class RoutethreadU2DCheckpointU2DRevertRequest_9f990932c5(
    @SerialName("checkpointItemId") val checkpointItemId: String,
    @SerialName("operationKey") val operationKey: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("checkpointItemId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("operationKey", "String", true, false, null, null, 8, 128, null, null, "^[A-Za-z0-9._:-]+$", null, listOf()),
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
    @SerialName("removedCompletedTurnAnchors") val removedCompletedTurnAnchors: List<String>,
    @SerialName("replayed") val replayed: Boolean,
    @SerialName("truncatePhase") val truncatePhase: RoutethreadU2DCheckpointU2DRevertResponseU2DTruncatePhase_35962a43ae,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("filesPhase", "RoutethreadU2DCheckpointU2DRevertResponseU2DFilesPhase_efc124973b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("numTurns", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("outcome", "RoutethreadU2DCheckpointU2DRevertResponseU2DOutcome_08ce03e607", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerPhase", "RoutethreadU2DCheckpointU2DRevertResponseU2DProviderPhase_11ada4e73a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("removedCompletedTurnAnchors", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("replayed", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("truncatePhase", "RoutethreadU2DCheckpointU2DRevertResponseU2DTruncatePhase_35962a43ae", true, false, null, null, null, null, null, null, null, null, listOf()),
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
