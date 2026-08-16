// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RoutesettingsU2DWriteRequest_742bf6f434(
    @SerialName("agentSettings") val agentSettings: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DAgentSettings_deb61378c1> = RemoteField.Missing,
    @SerialName("commitGenEffort") val commitGenEffort: RemoteField<String> = RemoteField.Missing,
    @SerialName("commitGenFast") val commitGenFast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("commitGenModel") val commitGenModel: RemoteField<String> = RemoteField.Missing,
    @SerialName("commitGenProvider") val commitGenProvider: RemoteField<String> = RemoteField.Missing,
    @SerialName("conflictResolverEffort") val conflictResolverEffort: RemoteField<String> = RemoteField.Missing,
    @SerialName("conflictResolverFast") val conflictResolverFast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("conflictResolverModel") val conflictResolverModel: RemoteField<String> = RemoteField.Missing,
    @SerialName("conflictResolverPresentationMode") val conflictResolverPresentationMode: RemoteField<ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6> = RemoteField.Missing,
    @SerialName("conflictResolverProvider") val conflictResolverProvider: RemoteField<String> = RemoteField.Missing,
    @SerialName("disabledAgents") val disabledAgents: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("disabledBuiltInMcpServers") val disabledBuiltInMcpServers: RemoteField<RoutesettingsU2DWriteRequestU2DDisabledBuiltInMcpServers_79608b5ece> = RemoteField.Missing,
    @SerialName("enabledMcpServers") val enabledMcpServers: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1U2DExclude_cda18ebe4a> = RemoteField.Missing,
    @SerialName("hiddenModels") val hiddenModels: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DHiddenModels_86d5d72e84> = RemoteField.Missing,
    @SerialName("prAutomationDefault") val prAutomationDefault: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DPrAutomationDefault_6df05d56a8> = RemoteField.Missing,
    @SerialName("prMergeMethod") val prMergeMethod: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DPrMergeMethod_9c01de6b08> = RemoteField.Missing,
    @SerialName("providerOrder") val providerOrder: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("titleGenEffort") val titleGenEffort: RemoteField<String> = RemoteField.Missing,
    @SerialName("titleGenFast") val titleGenFast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("titleGenModel") val titleGenModel: RemoteField<String> = RemoteField.Missing,
    @SerialName("titleGenProvider") val titleGenProvider: RemoteField<String> = RemoteField.Missing,
    @SerialName("worktreeBasePath") val worktreeBasePath: RemoteField<String> = RemoteField.Missing,
    @SerialName("worktreeStorageMode") val worktreeStorageMode: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1U2DMode_953c573b19> = RemoteField.Missing,
    @SerialName("wslCommitGenEffort") val wslCommitGenEffort: RemoteField<String> = RemoteField.Missing,
    @SerialName("wslCommitGenFast") val wslCommitGenFast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("wslCommitGenModel") val wslCommitGenModel: RemoteField<String> = RemoteField.Missing,
    @SerialName("wslCommitGenProvider") val wslCommitGenProvider: RemoteField<String> = RemoteField.Missing,
    @SerialName("wslConflictResolverEffort") val wslConflictResolverEffort: RemoteField<String> = RemoteField.Missing,
    @SerialName("wslConflictResolverFast") val wslConflictResolverFast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("wslConflictResolverModel") val wslConflictResolverModel: RemoteField<String> = RemoteField.Missing,
    @SerialName("wslConflictResolverPresentationMode") val wslConflictResolverPresentationMode: RemoteField<ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6> = RemoteField.Missing,
    @SerialName("wslConflictResolverProvider") val wslConflictResolverProvider: RemoteField<String> = RemoteField.Missing,
    @SerialName("wslTitleGenEffort") val wslTitleGenEffort: RemoteField<String> = RemoteField.Missing,
    @SerialName("wslTitleGenFast") val wslTitleGenFast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("wslTitleGenModel") val wslTitleGenModel: RemoteField<String> = RemoteField.Missing,
    @SerialName("wslTitleGenProvider") val wslTitleGenProvider: RemoteField<String> = RemoteField.Missing,
    @SerialName("wslWorktreeBasePath") val wslWorktreeBasePath: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentSettings", "RoutesettingsU2DReadResponseU2DSettingsU2DAgentSettings_deb61378c1", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commitGenEffort", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commitGenFast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commitGenModel", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commitGenProvider", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverEffort", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverFast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverModel", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverPresentationMode", "ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverProvider", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledAgents", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledBuiltInMcpServers", "RoutesettingsU2DWriteRequestU2DDisabledBuiltInMcpServers_79608b5ece", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("enabledMcpServers", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1U2DExclude_cda18ebe4a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("hiddenModels", "RoutesettingsU2DReadResponseU2DSettingsU2DHiddenModels_86d5d72e84", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prAutomationDefault", "RoutesettingsU2DReadResponseU2DSettingsU2DPrAutomationDefault_6df05d56a8", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prMergeMethod", "RoutesettingsU2DReadResponseU2DSettingsU2DPrMergeMethod_9c01de6b08", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerOrder", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("titleGenEffort", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("titleGenFast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("titleGenModel", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("titleGenProvider", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeBasePath", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeStorageMode", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1U2DMode_953c573b19", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCommitGenEffort", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCommitGenFast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCommitGenModel", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCommitGenProvider", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverEffort", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverFast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverModel", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverPresentationMode", "ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverProvider", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslTitleGenEffort", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslTitleGenFast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslTitleGenModel", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslTitleGenProvider", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslWorktreeBasePath", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestListsU2DValueU2DProject_83470ce639(
    @SerialName("hostId") val hostId: String,
    @SerialName("projectId") val projectId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("hostId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestListsU2DValue_a20681cb35(
    @SerialName("project") val project: RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestListsU2DValueU2DProject_83470ce639,
    @SerialName("pullRequestKeys") val pullRequestKeys: List<String>,
    @SerialName("refreshedAt") val refreshedAt: String,
    @SerialName("viewerLogin") val viewerLogin: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("project", "RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestListsU2DValueU2DProject_83470ce639", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pullRequestKeys", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("refreshedAt", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("viewerLogin", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestLists_d8ae5c3a60 = Map<String, RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestListsU2DValue_a20681cb35>

@Serializable
data class RouteshellU2DSnapshotResponseU2DGitStateU2DProjectsU2DValue_18a5d3fa6e(
    @SerialName("branches") val branches: RemoteField<ProceduregitListBranchesResult_458a450839> = RemoteField.Missing,
    @SerialName("ghAvailable") val ghAvailable: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("ref") val ref: RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestListsU2DValueU2DProject_83470ce639,
    @SerialName("refreshedAt") val refreshedAt: String,
    @SerialName("status") val status: RemoteField<ProceduregetGitStatusResult_c1d4a9f752> = RemoteField.Missing,
    @SerialName("worktrees") val worktrees: RemoteField<List<ProceduregitListWorktreesResultU2DWorktreesU2DItem_0288aefad6>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("branches", "ProceduregitListBranchesResult_458a450839", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ghAvailable", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ref", "RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestListsU2DValueU2DProject_83470ce639", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("refreshedAt", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProceduregetGitStatusResult_c1d4a9f752", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktrees", "List<ProceduregitListWorktreesResultU2DWorktreesU2DItem_0288aefad6>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteshellU2DSnapshotResponseU2DGitStateU2DProjects_1da8031b61 = Map<String, RouteshellU2DSnapshotResponseU2DGitStateU2DProjectsU2DValue_18a5d3fa6e>

@Serializable
data class RouteshellU2DSnapshotResponseU2DGitStateU2DPullRequestsU2DValueU2DFreshness_0bd7710eac(
    @SerialName("core") val core: RemoteField<String> = RemoteField.Missing,
    @SerialName("details") val details: RemoteField<String> = RemoteField.Missing,
    @SerialName("diff") val diff: RemoteField<String> = RemoteField.Missing,
    @SerialName("files") val files: RemoteField<String> = RemoteField.Missing,
    @SerialName("reviewThreads") val reviewThreads: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("core", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("details", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("diff", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("files", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reviewThreads", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DGitStateU2DPullRequestsU2DValueU2DRef_2558986145(
    @SerialName("hostId") val hostId: String,
    @SerialName("prNumber") val prNumber: Long,
    @SerialName("projectId") val projectId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("hostId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prNumber", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

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
