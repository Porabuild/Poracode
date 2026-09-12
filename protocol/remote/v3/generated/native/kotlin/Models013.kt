// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilities_a9a1b48e45(
    @SerialName("agentSettingsDefaults") val agentSettingsDefaults: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaults_cff1242509> = RemoteField.Missing,
    @SerialName("approvalPolicies") val approvalPolicies: List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>,
    @SerialName("bypassPermissions") val bypassPermissions: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DBypassPermissions_97dee2d496> = RemoteField.Missing,
    @SerialName("contextSizes") val contextSizes: RemoteField<List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>> = RemoteField.Missing,
    @SerialName("crossagentMcpRouting") val crossagentMcpRouting: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DCrossagentMcpRouting_d1d29954f5> = RemoteField.Missing,
    @SerialName("defaultApprovalPolicy") val defaultApprovalPolicy: RemoteField<String> = RemoteField.Missing,
    @SerialName("defaultApprovalsReviewer") val defaultApprovalsReviewer: RemoteField<String> = RemoteField.Missing,
    @SerialName("defaultContextSize") val defaultContextSize: RemoteField<String> = RemoteField.Missing,
    @SerialName("defaultEffort") val defaultEffort: RemoteField<String> = RemoteField.Missing,
    @SerialName("defaultHiddenModels") val defaultHiddenModels: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("defaultSandboxMode") val defaultSandboxMode: RemoteField<String> = RemoteField.Missing,
    @SerialName("disabledSkillNames") val disabledSkillNames: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("efforts") val efforts: List<String>,
    @SerialName("fastDisabledReason") val fastDisabledReason: RemoteField<String> = RemoteField.Missing,
    @SerialName("fastModels") val fastModels: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("liveInputMode") val liveInputMode: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DLiveInputMode_88480e7409,
    @SerialName("liveVoice") val liveVoice: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DLiveVoice_62c3e7fb25> = RemoteField.Missing,
    @SerialName("mcpConfigSource") val mcpConfigSource: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DMcpConfigSource_96776c817a> = RemoteField.Missing,
    @SerialName("mcpScope") val mcpScope: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DMcpScope_65e6698fa7> = RemoteField.Missing,
    @SerialName("modelContextSizes") val modelContextSizes: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelContextSizes_e163a1a222> = RemoteField.Missing,
    @SerialName("modelDefaultEfforts") val modelDefaultEfforts: RemoteField<ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67> = RemoteField.Missing,
    @SerialName("modelEfforts") val modelEfforts: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelEfforts_b4a8e17084,
    @SerialName("modelSubProvider") val modelSubProvider: RemoteField<ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67> = RemoteField.Missing,
    @SerialName("models") val models: List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>,
    @SerialName("modes") val modes: List<ProcedurequeueThreadFollowUpRequestU2DConfigU2DMode_01e21946e9>,
    @SerialName("presentationCapabilities") val presentationCapabilities: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilities_baebb62c82> = RemoteField.Missing,
    @SerialName("presentationMode") val presentationMode: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationMode_c9a954a3af,
    @SerialName("presentationModes") val presentationModes: RemoteField<List<ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6>> = RemoteField.Missing,
    @SerialName("readsImageAttachmentsFromHost") val readsImageAttachmentsFromHost: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("readsPdfAttachmentsFromHost") val readsPdfAttachmentsFromHost: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("reportsSkillCatalog") val reportsSkillCatalog: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("requiresTerminalFocusBeforeInput") val requiresTerminalFocusBeforeInput: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("requiresWorkspaceLocalAttachments") val requiresWorkspaceLocalAttachments: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("runtimeLabel") val runtimeLabel: RemoteField<String> = RemoteField.Missing,
    @SerialName("sandboxModes") val sandboxModes: List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>,
    @SerialName("settingDefs") val settingDefs: List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItem_97d27c4efa>,
    @SerialName("showRuntimeLabelInPicker") val showRuntimeLabelInPicker: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("slashCommands") val slashCommands: RemoteField<List<RouteagentU2DSlashU2DCommandsResponseU2DCommandsU2DItem_7324613e41>> = RemoteField.Missing,
    @SerialName("subProviders") val subProviders: RemoteField<List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>> = RemoteField.Missing,
    @SerialName("supportsDirectInput") val supportsDirectInput: Boolean,
    @SerialName("supportsOneShot") val supportsOneShot: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("supportsResume") val supportsResume: Boolean,
    @SerialName("supportsTextOnlyOneShot") val supportsTextOnlyOneShot: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("thinkingModels") val thinkingModels: RemoteField<List<String>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentSettingsDefaults", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaults_cff1242509", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("approvalPolicies", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("bypassPermissions", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DBypassPermissions_97dee2d496", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("contextSizes", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("crossagentMcpRouting", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DCrossagentMcpRouting_d1d29954f5", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("defaultApprovalPolicy", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("defaultApprovalsReviewer", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("defaultContextSize", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("defaultEffort", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("defaultHiddenModels", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("defaultSandboxMode", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledSkillNames", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("efforts", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fastDisabledReason", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fastModels", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("liveInputMode", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DLiveInputMode_88480e7409", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("liveVoice", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DLiveVoice_62c3e7fb25", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mcpConfigSource", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DMcpConfigSource_96776c817a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mcpScope", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DMcpScope_65e6698fa7", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modelContextSizes", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelContextSizes_e163a1a222", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modelDefaultEfforts", "ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modelEfforts", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelEfforts_b4a8e17084", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modelSubProvider", "ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("models", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modes", "List<ProcedurequeueThreadFollowUpRequestU2DConfigU2DMode_01e21946e9>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationCapabilities", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilities_baebb62c82", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationMode", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationMode_c9a954a3af", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationModes", "List<ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("readsImageAttachmentsFromHost", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("readsPdfAttachmentsFromHost", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reportsSkillCatalog", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("requiresTerminalFocusBeforeInput", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("requiresWorkspaceLocalAttachments", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeLabel", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sandboxModes", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("settingDefs", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItem_97d27c4efa>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("showRuntimeLabelInPicker", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("slashCommands", "List<RouteagentU2DSlashU2DCommandsResponseU2DCommandsU2DItem_7324613e41>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("subProviders", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("supportsDirectInput", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("supportsOneShot", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("supportsResume", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("supportsTextOnlyOneShot", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("thinkingModels", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DEnvKind_9eed5c4959 {
    @SerialName("windows") WINDOWS,
    @SerialName("wsl") WSL,
    @SerialName("posix") POSIX,
}

@Serializable
data class RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DPresentationAuthStates_678d084ee2(
    @SerialName("gui") val gui: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthState_2363c4dd0a> = RemoteField.Missing,
    @SerialName("terminal") val terminal: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthState_2363c4dd0a> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("gui", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthState_2363c4dd0a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("terminal", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthState_2363c4dd0a", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DPresentationAuthUsesProviderLogin_473e9b7f47(
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
data class RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DProviderMetadataU2DConnectedProvidersU2DItem_0a5d0a3885(
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
data class RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DProviderMetadata_197c2b8c01(
    @SerialName("authMethod") val authMethod: RemoteField<String> = RemoteField.Missing,
    @SerialName("authenticatedAs") val authenticatedAs: RemoteField<String> = RemoteField.Missing,
    @SerialName("connectedProviders") val connectedProviders: RemoteField<List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DProviderMetadataU2DConnectedProvidersU2DItem_0a5d0a3885>> = RemoteField.Missing,
    @SerialName("organization") val organization: RemoteField<String> = RemoteField.Missing,
    @SerialName("plan") val plan: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("authMethod", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("authenticatedAs", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("connectedProviders", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DProviderMetadataU2DConnectedProvidersU2DItem_0a5d0a3885>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("organization", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("plan", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DRuntimeVariantsU2DValue_632220da28(
    @SerialName("authLogoutSupported") val authLogoutSupported: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("authMethods") val authMethods: RemoteField<List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966>> = RemoteField.Missing,
    @SerialName("authState") val authState: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthState_2363c4dd0a,
    @SerialName("authUsesProviderLogin") val authUsesProviderLogin: Boolean,
    @SerialName("capabilities") val capabilities: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilities_a9a1b48e45,
    @SerialName("installationSource") val installationSource: RemoteField<String> = RemoteField.Missing,
    @SerialName("installed") val installed: Boolean,
    @SerialName("loginCommand") val loginCommand: RemoteField<String> = RemoteField.Missing,
    @SerialName("loginCommandDisplay") val loginCommandDisplay: RemoteField<String> = RemoteField.Missing,
    @SerialName("preferTerminalLogin") val preferTerminalLogin: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("presentationMode") val presentationMode: ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6,
    @SerialName("providerMetadata") val providerMetadata: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DProviderMetadata_197c2b8c01> = RemoteField.Missing,
    @SerialName("version") val version: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("authLogoutSupported", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("authMethods", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("authState", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthState_2363c4dd0a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("authUsesProviderLogin", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("capabilities", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilities_a9a1b48e45", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("installationSource", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("installed", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("loginCommand", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("loginCommandDisplay", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("preferTerminalLogin", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationMode", "ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerMetadata", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DProviderMetadata_197c2b8c01", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DRuntimeVariants_6a220c7cf8 = Map<String, RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DRuntimeVariantsU2DValue_632220da28>

typealias RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DSessionRuntimeRoutingU2DPrefixes_b84e449d1a = Map<String, String>

@Serializable
data class RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DSessionRuntimeRouting_d221b1853e(
    @SerialName("fallbackRuntime") val fallbackRuntime: RemoteField<String> = RemoteField.Missing,
    @SerialName("prefixes") val prefixes: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DSessionRuntimeRoutingU2DPrefixes_b84e449d1a,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("fallbackRuntime", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prefixes", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DSessionRuntimeRoutingU2DPrefixes_b84e449d1a", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c(
    @SerialName("args") val args: List<String>,
    @SerialName("binary") val binary: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("args", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("binary", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DInstaller_540ab9236f(
    @SerialName("posix") val posix: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c,
    @SerialName("windows") val windows: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("posix", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("windows", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdate_ae00c10b95(
    @SerialName("brew") val brew: RemoteField<String> = RemoteField.Missing,
    @SerialName("builtIn") val builtIn: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c> = RemoteField.Missing,
    @SerialName("homebrewCask") val homebrewCask: RemoteField<String> = RemoteField.Missing,
    @SerialName("installer") val installer: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DInstaller_540ab9236f> = RemoteField.Missing,
    @SerialName("latestVersionUrls") val latestVersionUrls: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("npm") val npm: RemoteField<String> = RemoteField.Missing,
    @SerialName("verifyBuiltInVersionChange") val verifyBuiltInVersionChange: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("winget") val winget: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("brew", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("builtIn", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("homebrewCask", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("installer", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DInstaller_540ab9236f", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("latestVersionUrls", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("npm", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("verifyBuiltInVersionChange", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("winget", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteagentU2DStatusesResponseU2DWindowsU2DItem_efded54eaf(
    @SerialName("acpSessionEstablished") val acpSessionEstablished: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("authLogoutSupported") val authLogoutSupported: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("authMethods") val authMethods: RemoteField<List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966>> = RemoteField.Missing,
    @SerialName("authState") val authState: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthState_2363c4dd0a,
    @SerialName("capabilities") val capabilities: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilities_a9a1b48e45,
    @SerialName("envDistro") val envDistro: RemoteField<String> = RemoteField.Missing,
    @SerialName("envKind") val envKind: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DEnvKind_9eed5c4959> = RemoteField.Missing,
    @SerialName("executablePath") val executablePath: RemoteField<String> = RemoteField.Missing,
    @SerialName("icon") val icon: RemoteField<String> = RemoteField.Missing,
    @SerialName("installed") val installed: Boolean,
    @SerialName("kind") val kind: String,
    @SerialName("label") val label: String,
    @SerialName("loginCommand") val loginCommand: RemoteField<String> = RemoteField.Missing,
    @SerialName("loginCommandDisplay") val loginCommandDisplay: RemoteField<String> = RemoteField.Missing,
    @SerialName("preferTerminalLogin") val preferTerminalLogin: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("presentationAuthStates") val presentationAuthStates: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DPresentationAuthStates_678d084ee2> = RemoteField.Missing,
    @SerialName("presentationAuthUsesProviderLogin") val presentationAuthUsesProviderLogin: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DPresentationAuthUsesProviderLogin_473e9b7f47> = RemoteField.Missing,
    @SerialName("providerMetadata") val providerMetadata: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DProviderMetadata_197c2b8c01> = RemoteField.Missing,
    @SerialName("runtimeVariants") val runtimeVariants: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DRuntimeVariants_6a220c7cf8> = RemoteField.Missing,
    @SerialName("sessionRuntimeRouting") val sessionRuntimeRouting: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DSessionRuntimeRouting_d221b1853e> = RemoteField.Missing,
    @SerialName("update") val update: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdate_ae00c10b95> = RemoteField.Missing,
    @SerialName("version") val version: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("acpSessionEstablished", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("authLogoutSupported", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("authMethods", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("authState", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthState_2363c4dd0a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("capabilities", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilities_a9a1b48e45", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("envDistro", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("envKind", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DEnvKind_9eed5c4959", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("executablePath", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("icon", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("installed", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("loginCommand", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("loginCommandDisplay", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("preferTerminalLogin", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationAuthStates", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DPresentationAuthStates_678d084ee2", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationAuthUsesProviderLogin", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DPresentationAuthUsesProviderLogin_473e9b7f47", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerMetadata", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DProviderMetadata_197c2b8c01", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeVariants", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DRuntimeVariants_6a220c7cf8", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sessionRuntimeRouting", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DSessionRuntimeRouting_d221b1853e", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("update", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdate_ae00c10b95", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteagentU2DStatusesResponse_858154dd17(
    @SerialName("updatedAt") val updatedAt: String,
    @SerialName("windows") val windows: List<RouteagentU2DStatusesResponseU2DWindowsU2DItem_efded54eaf>,
    @SerialName("wsl") val wsl: List<RouteagentU2DStatusesResponseU2DWindowsU2DItem_efded54eaf>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("updatedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("windows", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItem_efded54eaf>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wsl", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItem_efded54eaf>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteattachmentU2DUploadQuery_f22a438b83(
    @SerialName("name") val name: String,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, 255, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteattachmentU2DUploadResponse_6a0c18e639(
    @SerialName("path") val path: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutebrowserU2DCommandRequestU2DOptionU2D1U2DKind_0138c350a1 {
    @SerialName("create-tab") CREATEU2DTAB,
}

@Serializable
data class RoutebrowserU2DCommandRequestU2DOptionU2D1_3328521e00(
    @SerialName("kind") val kind: RoutebrowserU2DCommandRequestU2DOptionU2D1U2DKind_0138c350a1,
    @SerialName("url") val url: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutebrowserU2DCommandRequestU2DOptionU2D1U2DKind_0138c350a1", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutebrowserU2DCommandRequestU2DOptionU2D2U2DKind_3df0ab0b4e {
    @SerialName("close-tab") CLOSEU2DTAB,
}

@Serializable
data class RoutebrowserU2DCommandRequestU2DOptionU2D2_51f2acb99e(
    @SerialName("kind") val kind: RoutebrowserU2DCommandRequestU2DOptionU2D2U2DKind_3df0ab0b4e,
    @SerialName("tabId") val tabId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutebrowserU2DCommandRequestU2DOptionU2D2U2DKind_3df0ab0b4e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tabId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutebrowserU2DCommandRequestU2DOptionU2D3U2DKind_c39ba2db20 {
    @SerialName("activate-tab") ACTIVATEU2DTAB,
}

@Serializable
data class RoutebrowserU2DCommandRequestU2DOptionU2D3_483d5aa44f(
    @SerialName("kind") val kind: RoutebrowserU2DCommandRequestU2DOptionU2D3U2DKind_c39ba2db20,
    @SerialName("tabId") val tabId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutebrowserU2DCommandRequestU2DOptionU2D3U2DKind_c39ba2db20", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tabId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutebrowserU2DCommandRequestU2DOptionU2D4U2DKind_ed1865d937 {
    @SerialName("move-tab") MOVEU2DTAB,
}

@Serializable
enum class RoutebrowserU2DCommandRequestU2DOptionU2D4U2DPosition_3512bd687e {
    @SerialName("before") BEFORE,
    @SerialName("after") AFTER,
}

@Serializable
data class RoutebrowserU2DCommandRequestU2DOptionU2D4_875b3bd940(
    @SerialName("kind") val kind: RoutebrowserU2DCommandRequestU2DOptionU2D4U2DKind_ed1865d937,
    @SerialName("position") val position: RoutebrowserU2DCommandRequestU2DOptionU2D4U2DPosition_3512bd687e,
    @SerialName("tabId") val tabId: String,
    @SerialName("targetTabId") val targetTabId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutebrowserU2DCommandRequestU2DOptionU2D4U2DKind_ed1865d937", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("position", "RoutebrowserU2DCommandRequestU2DOptionU2D4U2DPosition_3512bd687e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tabId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("targetTabId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
