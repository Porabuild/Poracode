// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
enum class RoutesettingsU2DReadResponseU2DSettingsU2DPrAutomationDefault_6df05d56a8 {
    @SerialName("off") OFF,
    @SerialName("fix") FIX,
    @SerialName("merge") MERGE,
}

@Serializable
enum class RoutesettingsU2DReadResponseU2DSettingsU2DPrCreateMode_bed2580f4e {
    @SerialName("dialog") DIALOG,
    @SerialName("auto") AUTO,
}

typealias RoutesettingsU2DReadResponseU2DSettingsU2DUsageU2DProviderRefreshIntervals_ea08f63f22 = Map<String, Long>

@Serializable
data class RoutesettingsU2DReadResponseU2DSettingsU2DUsage_18dc352c9a(
    @SerialName("autoRefresh") val autoRefresh: Boolean,
    @SerialName("collapsedProviders") val collapsedProviders: List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>,
    @SerialName("disabledProviders") val disabledProviders: List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>,
    @SerialName("providerOrder") val providerOrder: List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>,
    @SerialName("providerRefreshIntervals") val providerRefreshIntervals: RoutesettingsU2DReadResponseU2DSettingsU2DUsageU2DProviderRefreshIntervals_ea08f63f22,
    @SerialName("refreshIntervalMinutes") val refreshIntervalMinutes: Long,
    @SerialName("selectedRingGroups") val selectedRingGroups: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986,
    @SerialName("showEstimatedCost") val showEstimatedCost: Boolean,
    @SerialName("showInSidebar") val showInSidebar: Boolean,
    @SerialName("sidebarHiddenProviders") val sidebarHiddenProviders: List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("autoRefresh", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("collapsedProviders", "List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledProviders", "List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerOrder", "List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerRefreshIntervals", "RoutesettingsU2DReadResponseU2DSettingsU2DUsageU2DProviderRefreshIntervals_ea08f63f22", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("refreshIntervalMinutes", "Long", true, false, 2.0, 120.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("selectedRingGroups", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("showEstimatedCost", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("showInSidebar", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sidebarHiddenProviders", "List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RoutesettingsU2DReadResponseU2DSettingsU2DWslCrews_1af2c4430c = Map<String, List<RoutesettingsU2DReadResponseU2DSettingsU2DCrewsU2DItem_261c257787>>

@Serializable
data class RoutesettingsU2DReadResponseU2DSettings_9e69a11cc2(
    @SerialName("agentSettings") val agentSettings: RoutesettingsU2DReadResponseU2DSettingsU2DAgentSettings_deb61378c1,
    @SerialName("autoArchiveDoneAfterDays") val autoArchiveDoneAfterDays: RemoteField<Long> = RemoteField.Missing,
    @SerialName("commitGenEffort") val commitGenEffort: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("commitGenFast") val commitGenFast: Boolean,
    @SerialName("commitGenModel") val commitGenModel: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("commitGenProvider") val commitGenProvider: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("commitGenSelection") val commitGenSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = RemoteField.Missing,
    @SerialName("conflictResolverEffort") val conflictResolverEffort: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("conflictResolverFast") val conflictResolverFast: Boolean,
    @SerialName("conflictResolverModel") val conflictResolverModel: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("conflictResolverPresentationMode") val conflictResolverPresentationMode: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6,
    @SerialName("conflictResolverProvider") val conflictResolverProvider: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("conflictResolverSelection") val conflictResolverSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = RemoteField.Missing,
    @SerialName("crews") val crews: RemoteField<List<RoutesettingsU2DReadResponseU2DSettingsU2DCrewsU2DItem_261c257787>> = RemoteField.Missing,
    @SerialName("crossagentHiddenModels") val crossagentHiddenModels: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DCrossagentHiddenModels_86d5d72e84> = RemoteField.Missing,
    @SerialName("crossagentPausedProviders") val crossagentPausedProviders: RemoteField<List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>> = RemoteField.Missing,
    @SerialName("disabledAgents") val disabledAgents: List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>,
    @SerialName("disabledBuiltInMcpServers") val disabledBuiltInMcpServers: RoutesettingsU2DReadResponseU2DSettingsU2DDisabledBuiltInMcpServers_65899fb957,
    @SerialName("enabledMcpServers") val enabledMcpServers: RoutesettingsU2DReadResponseU2DSettingsU2DEnabledMcpServers_2d677fb041,
    @SerialName("experimentJudgeSelection") val experimentJudgeSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = RemoteField.Missing,
    @SerialName("followUpBehavior") val followUpBehavior: RoutesettingsU2DReadResponseU2DSettingsU2DFollowUpBehavior_6fcb1a55c0,
    @SerialName("hiddenModels") val hiddenModels: RoutesettingsU2DReadResponseU2DSettingsU2DCrossagentHiddenModels_86d5d72e84,
    @SerialName("installedPlugins") val installedPlugins: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DInstalledPlugins_e356e4b5f6> = RemoteField.Missing,
    @SerialName("memory") val memory: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DMemory_df5d50a751> = RemoteField.Missing,
    @SerialName("prAutomationDefault") val prAutomationDefault: RoutesettingsU2DReadResponseU2DSettingsU2DPrAutomationDefault_6df05d56a8,
    @SerialName("prCreateMode") val prCreateMode: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DPrCreateMode_bed2580f4e> = RemoteField.Missing,
    @SerialName("prMergeMethod") val prMergeMethod: ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DMergeMethodsU2DItem_9c01de6b08,
    @SerialName("providerOrder") val providerOrder: List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>,
    @SerialName("searchExclude") val searchExclude: RemoteField<RouteagentU2DProfilesU2DCommandResponseU2DInstanceU2DAuthAcknowledgedU2DWsl_cda18ebe4a> = RemoteField.Missing,
    @SerialName("searchUseIgnoreFiles") val searchUseIgnoreFiles: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("titleGenEffort") val titleGenEffort: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("titleGenFast") val titleGenFast: Boolean,
    @SerialName("titleGenModel") val titleGenModel: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("titleGenProvider") val titleGenProvider: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("titleGenSelection") val titleGenSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = RemoteField.Missing,
    @SerialName("usage") val usage: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DUsage_18dc352c9a> = RemoteField.Missing,
    @SerialName("worktreeBasePath") val worktreeBasePath: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("worktreeStorageMode") val worktreeStorageMode: RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1U2DMode_953c573b19,
    @SerialName("wslCommitGenEffort") val wslCommitGenEffort: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("wslCommitGenFast") val wslCommitGenFast: Boolean,
    @SerialName("wslCommitGenModel") val wslCommitGenModel: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("wslCommitGenProvider") val wslCommitGenProvider: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("wslCommitGenSelection") val wslCommitGenSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = RemoteField.Missing,
    @SerialName("wslConflictResolverEffort") val wslConflictResolverEffort: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("wslConflictResolverFast") val wslConflictResolverFast: Boolean,
    @SerialName("wslConflictResolverModel") val wslConflictResolverModel: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("wslConflictResolverPresentationMode") val wslConflictResolverPresentationMode: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6,
    @SerialName("wslConflictResolverProvider") val wslConflictResolverProvider: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("wslConflictResolverSelection") val wslConflictResolverSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = RemoteField.Missing,
    @SerialName("wslCrews") val wslCrews: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DWslCrews_1af2c4430c> = RemoteField.Missing,
    @SerialName("wslTitleGenEffort") val wslTitleGenEffort: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("wslTitleGenFast") val wslTitleGenFast: Boolean,
    @SerialName("wslTitleGenModel") val wslTitleGenModel: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("wslTitleGenProvider") val wslTitleGenProvider: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("wslTitleGenSelection") val wslTitleGenSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = RemoteField.Missing,
    @SerialName("wslWorktreeBasePath") val wslWorktreeBasePath: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentSettings", "RoutesettingsU2DReadResponseU2DSettingsU2DAgentSettings_deb61378c1", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("autoArchiveDoneAfterDays", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commitGenEffort", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commitGenFast", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commitGenModel", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commitGenProvider", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commitGenSelection", "ProcedureextractContextRequestU2DSelection_32c3720f64", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverEffort", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverFast", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverModel", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverPresentationMode", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverProvider", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverSelection", "ProcedureextractContextRequestU2DSelection_32c3720f64", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("crews", "List<RoutesettingsU2DReadResponseU2DSettingsU2DCrewsU2DItem_261c257787>", false, false, null, null, null, null, null, 24, null, null, listOf()),
            RemoteFieldDescriptor("crossagentHiddenModels", "RoutesettingsU2DReadResponseU2DSettingsU2DCrossagentHiddenModels_86d5d72e84", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("crossagentPausedProviders", "List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledAgents", "List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledBuiltInMcpServers", "RoutesettingsU2DReadResponseU2DSettingsU2DDisabledBuiltInMcpServers_65899fb957", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("enabledMcpServers", "RoutesettingsU2DReadResponseU2DSettingsU2DEnabledMcpServers_2d677fb041", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("experimentJudgeSelection", "ProcedureextractContextRequestU2DSelection_32c3720f64", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("followUpBehavior", "RoutesettingsU2DReadResponseU2DSettingsU2DFollowUpBehavior_6fcb1a55c0", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("hiddenModels", "RoutesettingsU2DReadResponseU2DSettingsU2DCrossagentHiddenModels_86d5d72e84", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("installedPlugins", "RoutesettingsU2DReadResponseU2DSettingsU2DInstalledPlugins_e356e4b5f6", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("memory", "RoutesettingsU2DReadResponseU2DSettingsU2DMemory_df5d50a751", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prAutomationDefault", "RoutesettingsU2DReadResponseU2DSettingsU2DPrAutomationDefault_6df05d56a8", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prCreateMode", "RoutesettingsU2DReadResponseU2DSettingsU2DPrCreateMode_bed2580f4e", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prMergeMethod", "ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DMergeMethodsU2DItem_9c01de6b08", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerOrder", "List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("searchExclude", "RouteagentU2DProfilesU2DCommandResponseU2DInstanceU2DAuthAcknowledgedU2DWsl_cda18ebe4a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("searchUseIgnoreFiles", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("titleGenEffort", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("titleGenFast", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("titleGenModel", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("titleGenProvider", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("titleGenSelection", "ProcedureextractContextRequestU2DSelection_32c3720f64", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("usage", "RoutesettingsU2DReadResponseU2DSettingsU2DUsage_18dc352c9a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeBasePath", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeStorageMode", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1U2DMode_953c573b19", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCommitGenEffort", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCommitGenFast", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCommitGenModel", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCommitGenProvider", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCommitGenSelection", "ProcedureextractContextRequestU2DSelection_32c3720f64", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverEffort", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverFast", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverModel", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverPresentationMode", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverProvider", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverSelection", "ProcedureextractContextRequestU2DSelection_32c3720f64", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCrews", "RoutesettingsU2DReadResponseU2DSettingsU2DWslCrews_1af2c4430c", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslTitleGenEffort", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslTitleGenFast", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslTitleGenModel", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslTitleGenProvider", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslTitleGenSelection", "ProcedureextractContextRequestU2DSelection_32c3720f64", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslWorktreeBasePath", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutesettingsU2DReadResponse_0fd2c621ec(
    @SerialName("settings") val settings: RoutesettingsU2DReadResponseU2DSettings_9e69a11cc2,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("settings", "RoutesettingsU2DReadResponseU2DSettings_9e69a11cc2", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RoutesettingsU2DWriteRequestU2DDisabledBuiltInMcpServers_79608b5ece = Map<String, Boolean>

@Serializable
enum class RoutesettingsU2DWriteRequestU2DFollowUpBehavior_49162371ff {
    @SerialName("steer") STEER,
    @SerialName("queue") QUEUE,
}

@Serializable
data class RoutesettingsU2DWriteRequestU2DInstalledPluginsU2DValue_6d0b14c439(
    @SerialName("disabledMcpServerNames") val disabledMcpServerNames: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("disabledSkillIds") val disabledSkillIds: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("enabled") val enabled: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("version") val version: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("disabledMcpServerNames", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledSkillIds", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("enabled", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RoutesettingsU2DWriteRequestU2DInstalledPlugins_9ec28a7798 = Map<String, RoutesettingsU2DWriteRequestU2DInstalledPluginsU2DValue_6d0b14c439>

@Serializable
data class RoutesettingsU2DWriteRequestU2DMemory_5b89bc4512(
    @SerialName("archiveUnusedDays") val archiveUnusedDays: RemoteField<Long> = RemoteField.Missing,
    @SerialName("captureCustomMinutes") val captureCustomMinutes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("captureEffort") val captureEffort: RemoteField<String> = RemoteField.Missing,
    @SerialName("captureFast") val captureFast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("captureModel") val captureModel: RemoteField<String> = RemoteField.Missing,
    @SerialName("captureProvider") val captureProvider: RemoteField<String> = RemoteField.Missing,
    @SerialName("captureTiming") val captureTiming: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DMemoryU2DCaptureTiming_b0eed3c52a> = RemoteField.Missing,
    @SerialName("deletePolicy") val deletePolicy: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DMemoryU2DDeletePolicy_b5556f3ec1> = RemoteField.Missing,
    @SerialName("dreamCadence") val dreamCadence: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DMemoryU2DDreamCadence_51fc9e0635> = RemoteField.Missing,
    @SerialName("dreamEffort") val dreamEffort: RemoteField<String> = RemoteField.Missing,
    @SerialName("dreamFast") val dreamFast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("dreamModel") val dreamModel: RemoteField<String> = RemoteField.Missing,
    @SerialName("dreamProvider") val dreamProvider: RemoteField<String> = RemoteField.Missing,
    @SerialName("enabled") val enabled: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("learning") val learning: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("sessionTokenBudget") val sessionTokenBudget: RemoteField<Long> = RemoteField.Missing,
    @SerialName("skillThreshold") val skillThreshold: RemoteField<Long> = RemoteField.Missing,
    @SerialName("suggestSkills") val suggestSkills: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("suppressNative") val suppressNative: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("syncEnabled") val syncEnabled: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("archiveUnusedDays", "Long", false, false, 0.0, 3650.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("captureCustomMinutes", "Long", false, false, 1.0, 240.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("captureEffort", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("captureFast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("captureModel", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("captureProvider", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("captureTiming", "RoutesettingsU2DReadResponseU2DSettingsU2DMemoryU2DCaptureTiming_b0eed3c52a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("deletePolicy", "RoutesettingsU2DReadResponseU2DSettingsU2DMemoryU2DDeletePolicy_b5556f3ec1", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("dreamCadence", "RoutesettingsU2DReadResponseU2DSettingsU2DMemoryU2DDreamCadence_51fc9e0635", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("dreamEffort", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("dreamFast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("dreamModel", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("dreamProvider", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("enabled", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("learning", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sessionTokenBudget", "Long", false, false, 200.0, 8000.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("skillThreshold", "Long", false, false, 2.0, 20.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("suggestSkills", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("suppressNative", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("syncEnabled", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutesettingsU2DWriteRequestU2DUsage_b6aaa17d32(
    @SerialName("autoRefresh") val autoRefresh: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("collapsedProviders") val collapsedProviders: RemoteField<List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>> = RemoteField.Missing,
    @SerialName("disabledProviders") val disabledProviders: RemoteField<List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>> = RemoteField.Missing,
    @SerialName("providerOrder") val providerOrder: RemoteField<List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>> = RemoteField.Missing,
    @SerialName("providerRefreshIntervals") val providerRefreshIntervals: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DUsageU2DProviderRefreshIntervals_ea08f63f22> = RemoteField.Missing,
    @SerialName("refreshIntervalMinutes") val refreshIntervalMinutes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("selectedRingGroups") val selectedRingGroups: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986> = RemoteField.Missing,
    @SerialName("showEstimatedCost") val showEstimatedCost: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("showInSidebar") val showInSidebar: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("sidebarHiddenProviders") val sidebarHiddenProviders: RemoteField<List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("autoRefresh", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("collapsedProviders", "List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledProviders", "List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerOrder", "List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerRefreshIntervals", "RoutesettingsU2DReadResponseU2DSettingsU2DUsageU2DProviderRefreshIntervals_ea08f63f22", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("refreshIntervalMinutes", "Long", false, false, 2.0, 120.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("selectedRingGroups", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("showEstimatedCost", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("showInSidebar", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sidebarHiddenProviders", "List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutesettingsU2DWriteRequest_292a46aa73(
    @SerialName("agentSettings") val agentSettings: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DAgentSettings_deb61378c1> = RemoteField.Missing,
    @SerialName("autoArchiveDoneAfterDays") val autoArchiveDoneAfterDays: RemoteField<Long> = RemoteField.Missing,
    @SerialName("commitGenEffort") val commitGenEffort: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("commitGenFast") val commitGenFast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("commitGenModel") val commitGenModel: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("commitGenProvider") val commitGenProvider: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("commitGenSelection") val commitGenSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = RemoteField.Missing,
    @SerialName("conflictResolverEffort") val conflictResolverEffort: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("conflictResolverFast") val conflictResolverFast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("conflictResolverModel") val conflictResolverModel: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("conflictResolverPresentationMode") val conflictResolverPresentationMode: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6> = RemoteField.Missing,
    @SerialName("conflictResolverProvider") val conflictResolverProvider: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("conflictResolverSelection") val conflictResolverSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = RemoteField.Missing,
    @SerialName("crews") val crews: RemoteField<List<RoutesettingsU2DReadResponseU2DSettingsU2DCrewsU2DItem_261c257787>> = RemoteField.Missing,
    @SerialName("crossagentHiddenModels") val crossagentHiddenModels: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DCrossagentHiddenModels_86d5d72e84> = RemoteField.Missing,
    @SerialName("crossagentPausedProviders") val crossagentPausedProviders: RemoteField<List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>> = RemoteField.Missing,
    @SerialName("disabledAgents") val disabledAgents: RemoteField<List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>> = RemoteField.Missing,
    @SerialName("disabledBuiltInMcpServers") val disabledBuiltInMcpServers: RemoteField<RoutesettingsU2DWriteRequestU2DDisabledBuiltInMcpServers_79608b5ece> = RemoteField.Missing,
    @SerialName("enabledMcpServers") val enabledMcpServers: RemoteField<RouteagentU2DProfilesU2DCommandResponseU2DInstanceU2DAuthAcknowledgedU2DWsl_cda18ebe4a> = RemoteField.Missing,
    @SerialName("experimentJudgeSelection") val experimentJudgeSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = RemoteField.Missing,
    @SerialName("followUpBehavior") val followUpBehavior: RemoteField<RoutesettingsU2DWriteRequestU2DFollowUpBehavior_49162371ff> = RemoteField.Missing,
    @SerialName("hiddenModels") val hiddenModels: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DCrossagentHiddenModels_86d5d72e84> = RemoteField.Missing,
    @SerialName("installedPlugins") val installedPlugins: RemoteField<RoutesettingsU2DWriteRequestU2DInstalledPlugins_9ec28a7798> = RemoteField.Missing,
    @SerialName("memory") val memory: RemoteField<RoutesettingsU2DWriteRequestU2DMemory_5b89bc4512> = RemoteField.Missing,
    @SerialName("prAutomationDefault") val prAutomationDefault: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DPrAutomationDefault_6df05d56a8> = RemoteField.Missing,
    @SerialName("prCreateMode") val prCreateMode: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DPrCreateMode_bed2580f4e> = RemoteField.Missing,
    @SerialName("prMergeMethod") val prMergeMethod: RemoteField<ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DMergeMethodsU2DItem_9c01de6b08> = RemoteField.Missing,
    @SerialName("providerOrder") val providerOrder: RemoteField<List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>> = RemoteField.Missing,
    @SerialName("searchExclude") val searchExclude: RemoteField<RouteagentU2DProfilesU2DCommandResponseU2DInstanceU2DAuthAcknowledgedU2DWsl_cda18ebe4a> = RemoteField.Missing,
    @SerialName("searchUseIgnoreFiles") val searchUseIgnoreFiles: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("titleGenEffort") val titleGenEffort: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("titleGenFast") val titleGenFast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("titleGenModel") val titleGenModel: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("titleGenProvider") val titleGenProvider: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("titleGenSelection") val titleGenSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = RemoteField.Missing,
    @SerialName("usage") val usage: RemoteField<RoutesettingsU2DWriteRequestU2DUsage_b6aaa17d32> = RemoteField.Missing,
    @SerialName("worktreeBasePath") val worktreeBasePath: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("worktreeStorageMode") val worktreeStorageMode: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1U2DMode_953c573b19> = RemoteField.Missing,
    @SerialName("wslCommitGenEffort") val wslCommitGenEffort: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("wslCommitGenFast") val wslCommitGenFast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("wslCommitGenModel") val wslCommitGenModel: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("wslCommitGenProvider") val wslCommitGenProvider: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("wslCommitGenSelection") val wslCommitGenSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = RemoteField.Missing,
    @SerialName("wslConflictResolverEffort") val wslConflictResolverEffort: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("wslConflictResolverFast") val wslConflictResolverFast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("wslConflictResolverModel") val wslConflictResolverModel: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("wslConflictResolverPresentationMode") val wslConflictResolverPresentationMode: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6> = RemoteField.Missing,
    @SerialName("wslConflictResolverProvider") val wslConflictResolverProvider: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("wslConflictResolverSelection") val wslConflictResolverSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = RemoteField.Missing,
    @SerialName("wslCrews") val wslCrews: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DWslCrews_1af2c4430c> = RemoteField.Missing,
    @SerialName("wslTitleGenEffort") val wslTitleGenEffort: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("wslTitleGenFast") val wslTitleGenFast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("wslTitleGenModel") val wslTitleGenModel: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("wslTitleGenProvider") val wslTitleGenProvider: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("wslTitleGenSelection") val wslTitleGenSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = RemoteField.Missing,
    @SerialName("wslWorktreeBasePath") val wslWorktreeBasePath: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentSettings", "RoutesettingsU2DReadResponseU2DSettingsU2DAgentSettings_deb61378c1", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("autoArchiveDoneAfterDays", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commitGenEffort", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commitGenFast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commitGenModel", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commitGenProvider", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commitGenSelection", "ProcedureextractContextRequestU2DSelection_32c3720f64", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverEffort", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverFast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverModel", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverPresentationMode", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverProvider", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverSelection", "ProcedureextractContextRequestU2DSelection_32c3720f64", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("crews", "List<RoutesettingsU2DReadResponseU2DSettingsU2DCrewsU2DItem_261c257787>", false, false, null, null, null, null, null, 24, null, null, listOf()),
            RemoteFieldDescriptor("crossagentHiddenModels", "RoutesettingsU2DReadResponseU2DSettingsU2DCrossagentHiddenModels_86d5d72e84", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("crossagentPausedProviders", "List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledAgents", "List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledBuiltInMcpServers", "RoutesettingsU2DWriteRequestU2DDisabledBuiltInMcpServers_79608b5ece", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("enabledMcpServers", "RouteagentU2DProfilesU2DCommandResponseU2DInstanceU2DAuthAcknowledgedU2DWsl_cda18ebe4a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("experimentJudgeSelection", "ProcedureextractContextRequestU2DSelection_32c3720f64", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("followUpBehavior", "RoutesettingsU2DWriteRequestU2DFollowUpBehavior_49162371ff", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("hiddenModels", "RoutesettingsU2DReadResponseU2DSettingsU2DCrossagentHiddenModels_86d5d72e84", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("installedPlugins", "RoutesettingsU2DWriteRequestU2DInstalledPlugins_9ec28a7798", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("memory", "RoutesettingsU2DWriteRequestU2DMemory_5b89bc4512", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prAutomationDefault", "RoutesettingsU2DReadResponseU2DSettingsU2DPrAutomationDefault_6df05d56a8", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prCreateMode", "RoutesettingsU2DReadResponseU2DSettingsU2DPrCreateMode_bed2580f4e", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prMergeMethod", "ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DMergeMethodsU2DItem_9c01de6b08", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerOrder", "List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("searchExclude", "RouteagentU2DProfilesU2DCommandResponseU2DInstanceU2DAuthAcknowledgedU2DWsl_cda18ebe4a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("searchUseIgnoreFiles", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("titleGenEffort", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("titleGenFast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("titleGenModel", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("titleGenProvider", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("titleGenSelection", "ProcedureextractContextRequestU2DSelection_32c3720f64", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("usage", "RoutesettingsU2DWriteRequestU2DUsage_b6aaa17d32", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeBasePath", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeStorageMode", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1U2DMode_953c573b19", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCommitGenEffort", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCommitGenFast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCommitGenModel", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCommitGenProvider", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCommitGenSelection", "ProcedureextractContextRequestU2DSelection_32c3720f64", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverEffort", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverFast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverModel", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverPresentationMode", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverProvider", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverSelection", "ProcedureextractContextRequestU2DSelection_32c3720f64", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCrews", "RoutesettingsU2DReadResponseU2DSettingsU2DWslCrews_1af2c4430c", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslTitleGenEffort", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslTitleGenFast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslTitleGenModel", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslTitleGenProvider", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslTitleGenSelection", "ProcedureextractContextRequestU2DSelection_32c3720f64", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslWorktreeBasePath", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
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
    @SerialName("hostId") val hostId: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("projectId") val projectId: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("hostId", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
