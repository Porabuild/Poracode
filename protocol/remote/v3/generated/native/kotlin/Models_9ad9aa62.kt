// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilities_93a8d764db(
    @SerialName("gui") val gui: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGui_6d501e487e> = RemoteField.Missing,
    @SerialName("terminal") val terminal: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGui_6d501e487e> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("gui", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGui_6d501e487e", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("terminal", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGui_6d501e487e", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationMode_c9a954a3af {
    @SerialName("terminal") TERMINAL,
    @SerialName("gui") GUI,
}

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DThreadTitleCommandsU2DItem_8b1889f351(
    @SerialName("argumentSubcommands") val argumentSubcommands: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("command") val command: String,
    @SerialName("controlArguments") val controlArguments: RemoteField<List<String>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("argumentSubcommands", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("command", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("controlArguments", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilities_d4c662966d(
    @SerialName("agentSettingsDefaults") val agentSettingsDefaults: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaults_cff1242509> = RemoteField.Missing,
    @SerialName("approvalPolicies") val approvalPolicies: List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>,
    @SerialName("bypassPermissions") val bypassPermissions: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DBypassPermissions_edbbbb70d0> = RemoteField.Missing,
    @SerialName("contextSizeChangeReloadsSession") val contextSizeChangeReloadsSession: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("contextSizeReloadStopsSubagents") val contextSizeReloadStopsSubagents: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("contextSizes") val contextSizes: RemoteField<List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>> = RemoteField.Missing,
    @SerialName("crossagentMcpRouting") val crossagentMcpRouting: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DCrossagentMcpRouting_d1d29954f5> = RemoteField.Missing,
    @SerialName("defaultApprovalPolicy") val defaultApprovalPolicy: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("defaultApprovalsReviewer") val defaultApprovalsReviewer: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("defaultContextSize") val defaultContextSize: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("defaultEffort") val defaultEffort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("defaultHiddenModels") val defaultHiddenModels: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("defaultSandboxMode") val defaultSandboxMode: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("disabledSkillNames") val disabledSkillNames: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("efforts") val efforts: List<String>,
    @SerialName("fastDisabledReason") val fastDisabledReason: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("fastModels") val fastModels: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("liveInputMode") val liveInputMode: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DLiveInputMode_88480e7409,
    @SerialName("liveVoice") val liveVoice: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DLiveVoice_62c3e7fb25> = RemoteField.Missing,
    @SerialName("mcpConfigSource") val mcpConfigSource: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DMcpConfigSource_96776c817a> = RemoteField.Missing,
    @SerialName("mcpScope") val mcpScope: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DMcpScope_65e6698fa7> = RemoteField.Missing,
    @SerialName("modelContextSizes") val modelContextSizes: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelContextSizes_e163a1a222> = RemoteField.Missing,
    @SerialName("modelDefaultEfforts") val modelDefaultEfforts: RemoteField<ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67> = RemoteField.Missing,
    @SerialName("modelEfforts") val modelEfforts: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelEfforts_b4a8e17084,
    @SerialName("modelFamilies") val modelFamilies: RemoteField<List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItem_1be1630ac3>> = RemoteField.Missing,
    @SerialName("modelSubProvider") val modelSubProvider: RemoteField<ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67> = RemoteField.Missing,
    @SerialName("models") val models: List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>,
    @SerialName("modes") val modes: List<ProcedureconnectThreadVoiceRequestU2DConfigU2DMode_01e21946e9>,
    @SerialName("presentationCapabilities") val presentationCapabilities: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilities_93a8d764db> = RemoteField.Missing,
    @SerialName("presentationMode") val presentationMode: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationMode_c9a954a3af,
    @SerialName("presentationModes") val presentationModes: RemoteField<List<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6>> = RemoteField.Missing,
    @SerialName("readsImageAttachmentsFromHost") val readsImageAttachmentsFromHost: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("readsPdfAttachmentsFromHost") val readsPdfAttachmentsFromHost: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("reportsSkillCatalog") val reportsSkillCatalog: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("requiresTerminalFocusBeforeInput") val requiresTerminalFocusBeforeInput: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("requiresWorkspaceLocalAttachments") val requiresWorkspaceLocalAttachments: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("runtimeLabel") val runtimeLabel: RemoteField<String> = RemoteField.Missing,
    @SerialName("sandboxModes") val sandboxModes: List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>,
    @SerialName("settingDefs") val settingDefs: List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItem_97d27c4efa>,
    @SerialName("showRuntimeLabelInPicker") val showRuntimeLabelInPicker: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("slashCommands") val slashCommands: RemoteField<List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSlashCommandsU2DItem_7324613e41>> = RemoteField.Missing,
    @SerialName("subProviders") val subProviders: RemoteField<List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>> = RemoteField.Missing,
    @SerialName("supportsDirectInput") val supportsDirectInput: Boolean,
    @SerialName("supportsOneShot") val supportsOneShot: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("supportsReadOnlyOneShotWorkspace") val supportsReadOnlyOneShotWorkspace: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("supportsResume") val supportsResume: Boolean,
    @SerialName("supportsTextOnlyOneShot") val supportsTextOnlyOneShot: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("thinkingModels") val thinkingModels: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("threadTitleCommands") val threadTitleCommands: RemoteField<List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DThreadTitleCommandsU2DItem_8b1889f351>> = RemoteField.Missing,
    @SerialName("workflowLabel") val workflowLabel: RemoteField<String> = RemoteField.Missing,
    @SerialName("workflowModels") val workflowModels: RemoteField<List<String>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentSettingsDefaults", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaults_cff1242509", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("approvalPolicies", "List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("bypassPermissions", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DBypassPermissions_edbbbb70d0", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("contextSizeChangeReloadsSession", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("contextSizeReloadStopsSubagents", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("contextSizes", "List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("crossagentMcpRouting", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DCrossagentMcpRouting_d1d29954f5", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("defaultApprovalPolicy", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("defaultApprovalsReviewer", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("defaultContextSize", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("defaultEffort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("defaultHiddenModels", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("defaultSandboxMode", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledSkillNames", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("efforts", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fastDisabledReason", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fastModels", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("liveInputMode", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DLiveInputMode_88480e7409", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("liveVoice", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DLiveVoice_62c3e7fb25", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mcpConfigSource", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DMcpConfigSource_96776c817a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mcpScope", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DMcpScope_65e6698fa7", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modelContextSizes", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelContextSizes_e163a1a222", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modelDefaultEfforts", "ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modelEfforts", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelEfforts_b4a8e17084", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modelFamilies", "List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItem_1be1630ac3>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modelSubProvider", "ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("models", "List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modes", "List<ProcedureconnectThreadVoiceRequestU2DConfigU2DMode_01e21946e9>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationCapabilities", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilities_93a8d764db", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationMode", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationMode_c9a954a3af", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationModes", "List<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("readsImageAttachmentsFromHost", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("readsPdfAttachmentsFromHost", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reportsSkillCatalog", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("requiresTerminalFocusBeforeInput", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("requiresWorkspaceLocalAttachments", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeLabel", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sandboxModes", "List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("settingDefs", "List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItem_97d27c4efa>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("showRuntimeLabelInPicker", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("slashCommands", "List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSlashCommandsU2DItem_7324613e41>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("subProviders", "List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("supportsDirectInput", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("supportsOneShot", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("supportsReadOnlyOneShotWorkspace", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("supportsResume", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("supportsTextOnlyOneShot", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("thinkingModels", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadTitleCommands", "List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DThreadTitleCommandsU2DItem_8b1889f351>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("workflowLabel", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("workflowModels", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DEnvKind_9eed5c4959 {
    @SerialName("windows") WINDOWS,
    @SerialName("wsl") WSL,
    @SerialName("posix") POSIX,
}

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DPresentationAuthStates_678d084ee2(
    @SerialName("gui") val gui: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthState_2363c4dd0a> = RemoteField.Missing,
    @SerialName("terminal") val terminal: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthState_2363c4dd0a> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("gui", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthState_2363c4dd0a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("terminal", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthState_2363c4dd0a", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DPresentationAuthUsesProviderLogin_473e9b7f47(
    @SerialName("gui") val gui: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("terminal") val terminal: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("gui", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("terminal", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DProviderMetadataU2DConnectedProvidersU2DItem_0a5d0a3885(
    @SerialName("detail") val detail: RemoteField<String> = RemoteField.Missing,
    @SerialName("id") val id: RemoteField<String> = RemoteField.Missing,
    @SerialName("label") val label: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("detail", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DProviderMetadata_197c2b8c01(
    @SerialName("authMethod") val authMethod: RemoteField<String> = RemoteField.Missing,
    @SerialName("authenticatedAs") val authenticatedAs: RemoteField<String> = RemoteField.Missing,
    @SerialName("connectedProviders") val connectedProviders: RemoteField<List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DProviderMetadataU2DConnectedProvidersU2DItem_0a5d0a3885>> = RemoteField.Missing,
    @SerialName("organization") val organization: RemoteField<String> = RemoteField.Missing,
    @SerialName("plan") val plan: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("authMethod", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("authenticatedAs", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("connectedProviders", "List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DProviderMetadataU2DConnectedProvidersU2DItem_0a5d0a3885>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("organization", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("plan", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DRuntimeVariantsU2DValue_3f2f053441(
    @SerialName("authLogoutSupported") val authLogoutSupported: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("authMethods") val authMethods: RemoteField<List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966>> = RemoteField.Missing,
    @SerialName("authState") val authState: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthState_2363c4dd0a,
    @SerialName("authUsesProviderLogin") val authUsesProviderLogin: Boolean,
    @SerialName("capabilities") val capabilities: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilities_d4c662966d,
    @SerialName("installationSource") val installationSource: RemoteField<String> = RemoteField.Missing,
    @SerialName("installed") val installed: Boolean,
    @SerialName("loginCommand") val loginCommand: RemoteField<String> = RemoteField.Missing,
    @SerialName("loginCommandDisplay") val loginCommandDisplay: RemoteField<String> = RemoteField.Missing,
    @SerialName("preferTerminalLogin") val preferTerminalLogin: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("presentationMode") val presentationMode: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6,
    @SerialName("providerMetadata") val providerMetadata: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DProviderMetadata_197c2b8c01> = RemoteField.Missing,
    @SerialName("version") val version: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("authLogoutSupported", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("authMethods", "List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("authState", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthState_2363c4dd0a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("authUsesProviderLogin", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("capabilities", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilities_d4c662966d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("installationSource", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("installed", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("loginCommand", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("loginCommandDisplay", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("preferTerminalLogin", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationMode", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerMetadata", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DProviderMetadata_197c2b8c01", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
