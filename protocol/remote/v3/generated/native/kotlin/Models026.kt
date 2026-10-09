// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RoutesettingsU2DWriteRequest_c0fd8ffb30(
    @SerialName("agentSettings") val agentSettings: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DAgentSettings_deb61378c1> = RemoteField.Missing,
    @SerialName("commitGenEffort") val commitGenEffort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("commitGenFast") val commitGenFast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("commitGenModel") val commitGenModel: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("commitGenProvider") val commitGenProvider: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("commitGenSelection") val commitGenSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = RemoteField.Missing,
    @SerialName("conflictResolverEffort") val conflictResolverEffort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("conflictResolverFast") val conflictResolverFast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("conflictResolverModel") val conflictResolverModel: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("conflictResolverPresentationMode") val conflictResolverPresentationMode: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6> = RemoteField.Missing,
    @SerialName("conflictResolverProvider") val conflictResolverProvider: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("conflictResolverSelection") val conflictResolverSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = RemoteField.Missing,
    @SerialName("disabledAgents") val disabledAgents: RemoteField<List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>> = RemoteField.Missing,
    @SerialName("disabledBuiltInMcpServers") val disabledBuiltInMcpServers: RemoteField<RoutesettingsU2DWriteRequestU2DDisabledBuiltInMcpServers_79608b5ece> = RemoteField.Missing,
    @SerialName("enabledMcpServers") val enabledMcpServers: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1U2DExclude_cda18ebe4a> = RemoteField.Missing,
    @SerialName("experimentJudgeSelection") val experimentJudgeSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = RemoteField.Missing,
    @SerialName("followUpBehavior") val followUpBehavior: RemoteField<RoutesettingsU2DWriteRequestU2DFollowUpBehavior_49162371ff> = RemoteField.Missing,
    @SerialName("hiddenModels") val hiddenModels: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DHiddenModels_86d5d72e84> = RemoteField.Missing,
    @SerialName("prAutomationDefault") val prAutomationDefault: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DPrAutomationDefault_6df05d56a8> = RemoteField.Missing,
    @SerialName("prMergeMethod") val prMergeMethod: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DPrMergeMethod_9c01de6b08> = RemoteField.Missing,
    @SerialName("providerOrder") val providerOrder: RemoteField<List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>> = RemoteField.Missing,
    @SerialName("searchExclude") val searchExclude: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1U2DExclude_cda18ebe4a> = RemoteField.Missing,
    @SerialName("searchUseIgnoreFiles") val searchUseIgnoreFiles: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("titleGenEffort") val titleGenEffort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("titleGenFast") val titleGenFast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("titleGenModel") val titleGenModel: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("titleGenProvider") val titleGenProvider: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("titleGenSelection") val titleGenSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = RemoteField.Missing,
    @SerialName("usage") val usage: RemoteField<RoutesettingsU2DWriteRequestU2DUsage_b6aaa17d32> = RemoteField.Missing,
    @SerialName("worktreeBasePath") val worktreeBasePath: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("worktreeStorageMode") val worktreeStorageMode: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1U2DMode_953c573b19> = RemoteField.Missing,
    @SerialName("wslCommitGenEffort") val wslCommitGenEffort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("wslCommitGenFast") val wslCommitGenFast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("wslCommitGenModel") val wslCommitGenModel: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("wslCommitGenProvider") val wslCommitGenProvider: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("wslCommitGenSelection") val wslCommitGenSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = RemoteField.Missing,
    @SerialName("wslConflictResolverEffort") val wslConflictResolverEffort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("wslConflictResolverFast") val wslConflictResolverFast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("wslConflictResolverModel") val wslConflictResolverModel: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("wslConflictResolverPresentationMode") val wslConflictResolverPresentationMode: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6> = RemoteField.Missing,
    @SerialName("wslConflictResolverProvider") val wslConflictResolverProvider: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("wslConflictResolverSelection") val wslConflictResolverSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = RemoteField.Missing,
    @SerialName("wslTitleGenEffort") val wslTitleGenEffort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("wslTitleGenFast") val wslTitleGenFast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("wslTitleGenModel") val wslTitleGenModel: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("wslTitleGenProvider") val wslTitleGenProvider: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("wslTitleGenSelection") val wslTitleGenSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = RemoteField.Missing,
    @SerialName("wslWorktreeBasePath") val wslWorktreeBasePath: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentSettings", "RoutesettingsU2DReadResponseU2DSettingsU2DAgentSettings_deb61378c1", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commitGenEffort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commitGenFast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commitGenModel", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commitGenProvider", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commitGenSelection", "ProcedureextractContextRequestU2DSelection_32c3720f64", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverEffort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverFast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverModel", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverPresentationMode", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverProvider", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverSelection", "ProcedureextractContextRequestU2DSelection_32c3720f64", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledAgents", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledBuiltInMcpServers", "RoutesettingsU2DWriteRequestU2DDisabledBuiltInMcpServers_79608b5ece", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("enabledMcpServers", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1U2DExclude_cda18ebe4a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("experimentJudgeSelection", "ProcedureextractContextRequestU2DSelection_32c3720f64", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("followUpBehavior", "RoutesettingsU2DWriteRequestU2DFollowUpBehavior_49162371ff", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("hiddenModels", "RoutesettingsU2DReadResponseU2DSettingsU2DHiddenModels_86d5d72e84", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prAutomationDefault", "RoutesettingsU2DReadResponseU2DSettingsU2DPrAutomationDefault_6df05d56a8", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prMergeMethod", "RoutesettingsU2DReadResponseU2DSettingsU2DPrMergeMethod_9c01de6b08", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerOrder", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("searchExclude", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1U2DExclude_cda18ebe4a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("searchUseIgnoreFiles", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("titleGenEffort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("titleGenFast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("titleGenModel", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("titleGenProvider", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("titleGenSelection", "ProcedureextractContextRequestU2DSelection_32c3720f64", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("usage", "RoutesettingsU2DWriteRequestU2DUsage_b6aaa17d32", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeBasePath", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeStorageMode", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1U2DMode_953c573b19", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCommitGenEffort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCommitGenFast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCommitGenModel", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCommitGenProvider", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCommitGenSelection", "ProcedureextractContextRequestU2DSelection_32c3720f64", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverEffort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverFast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverModel", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverPresentationMode", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverProvider", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverSelection", "ProcedureextractContextRequestU2DSelection_32c3720f64", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslTitleGenEffort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslTitleGenFast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslTitleGenModel", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslTitleGenProvider", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslTitleGenSelection", "ProcedureextractContextRequestU2DSelection_32c3720f64", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslWorktreeBasePath", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteshellU2DSnapshotQuery_b2ca36e3fa(
    @SerialName("maxBytes") val maxBytes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("maxDecodeBytes") val maxDecodeBytes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("order") val order: RemoteField<RouteprojectU2DListQueryU2DOrder_42146530bc> = RemoteField.Missing,
    @SerialName("projectLimit") val projectLimit: RemoteField<Long> = RemoteField.Missing,
    @SerialName("reads") val reads: RemoteField<RouteprojectU2DListQueryU2DReads_4659e6d395> = RemoteField.Missing,
    @SerialName("summaries") val summaries: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("threadLimit") val threadLimit: RemoteField<Long> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("maxBytes", "Long", false, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxDecodeBytes", "Long", false, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("order", "RouteprojectU2DListQueryU2DOrder_42146530bc", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLimit", "Long", false, false, 1.0, 200.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reads", "RouteprojectU2DListQueryU2DReads_4659e6d395", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("summaries", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadLimit", "Long", false, false, 1.0, 200.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestListsU2DValueU2DProject_83470ce639(
    @SerialName("hostId") val hostId: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("projectId") val projectId: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("hostId", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestListsU2DValue_a20681cb35(
    @SerialName("project") val project: RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestListsU2DValueU2DProject_83470ce639,
    @SerialName("pullRequestKeys") val pullRequestKeys: List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("refreshedAt") val refreshedAt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("viewerLogin") val viewerLogin: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("project", "RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestListsU2DValueU2DProject_83470ce639", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pullRequestKeys", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("refreshedAt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("viewerLogin", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestLists_d8ae5c3a60 = Map<String, RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestListsU2DValue_a20681cb35>

@Serializable
data class RouteshellU2DSnapshotResponseU2DGitStateU2DProjectsU2DValue_18a5d3fa6e(
    @SerialName("branches") val branches: RemoteField<ProceduregitListBranchesResult_458a450839> = RemoteField.Missing,
    @SerialName("ghAvailable") val ghAvailable: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("ref") val ref: RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestListsU2DValueU2DProject_83470ce639,
    @SerialName("refreshedAt") val refreshedAt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("status") val status: RemoteField<ProceduregetGitStatusResult_c1d4a9f752> = RemoteField.Missing,
    @SerialName("worktrees") val worktrees: RemoteField<List<ProceduregitListWorktreesResultU2DWorktreesU2DItem_0288aefad6>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("branches", "ProceduregitListBranchesResult_458a450839", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ghAvailable", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ref", "RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestListsU2DValueU2DProject_83470ce639", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("refreshedAt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProceduregetGitStatusResult_c1d4a9f752", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktrees", "List<ProceduregitListWorktreesResultU2DWorktreesU2DItem_0288aefad6>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteshellU2DSnapshotResponseU2DGitStateU2DProjects_1da8031b61 = Map<String, RouteshellU2DSnapshotResponseU2DGitStateU2DProjectsU2DValue_18a5d3fa6e>

@Serializable
data class RouteshellU2DSnapshotResponseU2DGitStateU2DPullRequestsU2DValueU2DFreshness_0bd7710eac(
    @SerialName("core") val core: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("details") val details: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("diff") val diff: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("files") val files: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("reviewThreads") val reviewThreads: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("core", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("details", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("diff", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("files", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reviewThreads", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DGitStateU2DPullRequestsU2DValueU2DRef_2558986145(
    @SerialName("hostId") val hostId: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("prNumber") val prNumber: Long,
    @SerialName("projectId") val projectId: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("hostId", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prNumber", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DGitStateU2DPullRequestsU2DValue_5a8fe22d39(
    @SerialName("data") val data: ProcedureghCreatePrResult_a4457c545e,
    @SerialName("details") val details: RemoteField<ProcedureghGetPrDetailsResultU2DDetails_9f1da8cf54> = RemoteField.Missing,
    @SerialName("diff") val diff: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("files") val files: RemoteField<List<ProcedureghGetPrFilesResultU2DFilesU2DItem_63c18b52ff>> = RemoteField.Missing,
    @SerialName("freshness") val freshness: RouteshellU2DSnapshotResponseU2DGitStateU2DPullRequestsU2DValueU2DFreshness_0bd7710eac,
    @SerialName("ref") val ref: RouteshellU2DSnapshotResponseU2DGitStateU2DPullRequestsU2DValueU2DRef_2558986145,
    @SerialName("reviewThreads") val reviewThreads: RemoteField<List<ProcedureghGetPrReviewCommentsResultU2DThreadsU2DItem_9199b6e9ea>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("data", "ProcedureghCreatePrResult_a4457c545e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("details", "ProcedureghGetPrDetailsResultU2DDetails_9f1da8cf54", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("diff", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
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
    @SerialName("hostId") val hostId: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("projectId") val projectId: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("worktreePath") val worktreePath: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("hostId", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DGitStateU2DTargetsU2DValue_d68bbd0856(
    @SerialName("pullRequestKey") val pullRequestKey: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("ref") val ref: RouteshellU2DSnapshotResponseU2DGitStateU2DTargetsU2DValueU2DRef_725be166aa,
    @SerialName("refreshedAt") val refreshedAt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("sourceInfo") val sourceInfo: RemoteField<ProceduregitGetWorktreeSourceBranchResult_4864c5f65a> = RemoteField.Missing,
    @SerialName("status") val status: RemoteField<ProceduregetGitStatusResult_c1d4a9f752> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("pullRequestKey", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ref", "RouteshellU2DSnapshotResponseU2DGitStateU2DTargetsU2DValueU2DRef_725be166aa", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("refreshedAt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
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
    @SerialName("checksStatus") val checksStatus: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("isDraft") val isDraft: Boolean,
    @SerialName("number") val number: Long,
    @SerialName("state") val state: ProcedureghCreatePrResultU2DState_79fd49e14d,
    @SerialName("title") val title: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("url") val url: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("checksStatus", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("isDraft", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("number", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("state", "ProcedureghCreatePrResultU2DState_79fd49e14d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteshellU2DSnapshotResponseU2DGitSummariesByThreadU2DValueU2DPr_9d263023fc = RouteshellU2DSnapshotResponseU2DGitSummariesByThreadU2DValueU2DPrU2DOptionU2D1_1c58197f24?

@Serializable
data class RouteshellU2DSnapshotResponseU2DGitSummariesByThreadU2DValue_b2a9cad3f0(
    @SerialName("ahead") val ahead: Long,
    @SerialName("behind") val behind: Long,
    @SerialName("branch") val branch: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("isRepo") val isRepo: Boolean,
    @SerialName("pr") val pr: RemoteField<RouteshellU2DSnapshotResponseU2DGitSummariesByThreadU2DValueU2DPrU2DOptionU2D1_1c58197f24>,
    @SerialName("totalDeletions") val totalDeletions: Long,
    @SerialName("totalInsertions") val totalInsertions: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("ahead", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("behind", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("branch", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
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
data class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D1_66504fdb43(
    @SerialName("kind") val kind: ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D1U2DKind_5465dd986b,
    @SerialName("path") val path: String,
    @SerialName("remoteServerId") val remoteServerId: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D1U2DKind_5465dd986b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, 4096, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remoteServerId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D2_8b72b09d5c(
    @SerialName("distro") val distro: String,
    @SerialName("kind") val kind: ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D2U2DKind_2d8274eae5,
    @SerialName("linuxPath") val linuxPath: String,
    @SerialName("remoteServerId") val remoteServerId: RemoteField<String> = RemoteField.Missing,
    @SerialName("uncPath") val uncPath: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("distro", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D2U2DKind_2d8274eae5", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("linuxPath", "String", true, false, null, null, 1, 4096, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remoteServerId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("uncPath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D3_8850f6c7f1(
    @SerialName("kind") val kind: ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D3U2DKind_835d30ad47,
    @SerialName("path") val path: String,
    @SerialName("remoteServerId") val remoteServerId: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
<<<<<<< HEAD
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
data class RoutethreadU2DCommandRequestU2DOptionU2D14_2062bc5ac9(
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
data class RoutethreadU2DCommandRequestU2DOptionU2D15_69af29ff38(
    @SerialName("kind") val kind: RouteprojectU2DCommandRequestU2DOptionU2D8U2DKind_96cd458fa9,
    @SerialName("workspaceId") val workspaceId: RemoteField<String>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteprojectU2DCommandRequestU2DOptionU2D8U2DKind_96cd458fa9", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("workspaceId", "String", true, true, null, null, 1, null, null, null, null, null, listOf()),
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
data class RoutethreadU2DCommandRequestU2DOptionU2D2_fa4864c798(
    @SerialName("agentInstanceId") val agentInstanceId: RemoteField<String> = RemoteField.Missing,
    @SerialName("agentKind") val agentKind: String,
    @SerialName("clientContext") val clientContext: RemoteField<ProcedureensureThreadRunningRequestU2DClientContext_b23ca9582f> = RemoteField.Missing,
    @SerialName("config") val config: ProcedureconnectThreadVoiceRequestU2DConfig_023567f089,
    @SerialName("focus") val focus: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("groupId") val groupId: RemoteField<String> = RemoteField.Missing,
    @SerialName("groupName") val groupName: RemoteField<String> = RemoteField.Missing,
    @SerialName("initialSize") val initialSize: RemoteField<ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09> = RemoteField.Missing,
    @SerialName("isNewWorktree") val isNewWorktree: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D2U2DKind_60fc988aef,
    @SerialName("launchRuntime") val launchRuntime: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("parentThreadId") val parentThreadId: RemoteField<String> = RemoteField.Missing,
    @SerialName("prNumber") val prNumber: RemoteField<Long> = RemoteField.Missing,
    @SerialName("presentationMode") val presentationMode: RemoteField<ProcedureensureThreadRunningRequestU2DPresentationMode_6508684ba6> = RemoteField.Missing,
    @SerialName("projectId") val projectId: String,
    @SerialName("prompt") val prompt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("providerSwitch") val providerSwitch: RemoteField<ProcedureensureThreadRunningRequestU2DProviderSwitch_06461b1492> = RemoteField.Missing,
    @SerialName("segments") val segments: RemoteField<List<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754>> = RemoteField.Missing,
    @SerialName("title") val title: RemoteField<String> = RemoteField.Missing,
    @SerialName("userMessageItemId") val userMessageItemId: RemoteField<String> = RemoteField.Missing,
    @SerialName("workspaceId") val workspaceId: RemoteField<String> = RemoteField.Missing,
    @SerialName("worktreeBranch") val worktreeBranch: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("worktreePath") val worktreePath: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentInstanceId", "String", false, false, null, null, 1, 120, null, null, "^[a-z0-9][a-z0-9_\\-:.]*$", null, listOf()),
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("clientContext", "ProcedureensureThreadRunningRequestU2DClientContext_b23ca9582f", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("config", "ProcedureconnectThreadVoiceRequestU2DConfig_023567f089", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("focus", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("groupId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("groupName", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("initialSize", "ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("isNewWorktree", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D2U2DKind_60fc988aef", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("launchRuntime", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("parentThreadId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prNumber", "Long", false, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationMode", "ProcedureensureThreadRunningRequestU2DPresentationMode_6508684ba6", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prompt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerSwitch", "ProcedureensureThreadRunningRequestU2DProviderSwitch_06461b1492", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("segments", "List<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("userMessageItemId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("workspaceId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeBranch", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D3U2DKind_f399af5f8d {
    @SerialName("set-group") SETU2DGROUP,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D3_21cd039cb3(
    @SerialName("groupId") val groupId: RemoteField<String> = RemoteField.Missing,
    @SerialName("groupName") val groupName: RemoteField<String> = RemoteField.Missing,
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D3U2DKind_f399af5f8d,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("groupId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("groupName", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
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
=======
            RemoteFieldDescriptor("kind", "ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D3U2DKind_835d30ad47", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, 4096, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remoteServerId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
>>>>>>> origin/poracode/v2
        ), listOf())
    }
}
