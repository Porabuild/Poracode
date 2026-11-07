// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItem_fff3547caa(
    @SerialName("acpSessionEstablished") val acpSessionEstablished: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("authLogoutSupported") val authLogoutSupported: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("authMethods") val authMethods: RemoteField<List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966>> = RemoteField.Missing,
    @SerialName("authState") val authState: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthState_2363c4dd0a,
    @SerialName("capabilities") val capabilities: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilities_e0845a6e4a,
    @SerialName("envDistro") val envDistro: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("envKind") val envKind: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DEnvKind_9eed5c4959> = RemoteField.Missing,
    @SerialName("executablePath") val executablePath: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("icon") val icon: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("installed") val installed: Boolean,
    @SerialName("kind") val kind: String,
    @SerialName("label") val label: String,
    @SerialName("loginCommand") val loginCommand: RemoteField<String> = RemoteField.Missing,
    @SerialName("loginCommandDisplay") val loginCommandDisplay: RemoteField<String> = RemoteField.Missing,
    @SerialName("preferTerminalLogin") val preferTerminalLogin: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("presentationAuthStates") val presentationAuthStates: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DPresentationAuthStates_678d084ee2> = RemoteField.Missing,
    @SerialName("presentationAuthUsesProviderLogin") val presentationAuthUsesProviderLogin: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DPresentationAuthUsesProviderLogin_473e9b7f47> = RemoteField.Missing,
    @SerialName("providerMetadata") val providerMetadata: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DProviderMetadata_197c2b8c01> = RemoteField.Missing,
    @SerialName("runtimeVariants") val runtimeVariants: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DRuntimeVariants_9ced215a75> = RemoteField.Missing,
    @SerialName("sessionRuntimeRouting") val sessionRuntimeRouting: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DSessionRuntimeRouting_d221b1853e> = RemoteField.Missing,
    @SerialName("update") val update: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DUpdate_892eceb2ac> = RemoteField.Missing,
    @SerialName("version") val version: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("acpSessionEstablished", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("authLogoutSupported", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("authMethods", "List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("authState", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthState_2363c4dd0a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("capabilities", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilities_e0845a6e4a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("envDistro", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("envKind", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DEnvKind_9eed5c4959", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("executablePath", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("icon", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("installed", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("loginCommand", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("loginCommandDisplay", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("preferTerminalLogin", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationAuthStates", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DPresentationAuthStates_678d084ee2", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationAuthUsesProviderLogin", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DPresentationAuthUsesProviderLogin_473e9b7f47", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerMetadata", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DProviderMetadata_197c2b8c01", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeVariants", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DRuntimeVariants_9ced215a75", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sessionRuntimeRouting", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DSessionRuntimeRouting_d221b1853e", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("update", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DUpdate_892eceb2ac", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurerefreshAgentStatusesResult_e5e44e3ce8(
    @SerialName("fromCache") val fromCache: Boolean,
    @SerialName("windows") val windows: List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItem_fff3547caa>,
    @SerialName("wsl") val wsl: List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItem_fff3547caa>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("fromCache", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("windows", "List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItem_fff3547caa>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wsl", "List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItem_fff3547caa>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurerelocateProjectRequest_51fc061b3e(
    @SerialName("newLocation") val newLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("projectId") val projectId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("newLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurerelocateProjectResult_c6ca4f58c0(
    @SerialName("repairedWorktrees") val repairedWorktrees: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("repairedWorktrees", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurerenameProjectEntryRequest_4a22ffc9b4(
    @SerialName("nextName") val nextName: String,
    @SerialName("path") val path: String,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("nextName", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedurereorderQueuedThreadFollowUpRequestU2DBeforeId_df704162f3 = String?

@Serializable
data class ProcedurereorderQueuedThreadFollowUpRequest_59599d21a2(
    @SerialName("beforeId") val beforeId: RemoteField<String>,
    @SerialName("id") val id: String,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("beforeId", "String", true, true, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureresolveLinkMetadataRequest_3732eed893(
    @SerialName("url") val url: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("url", "String", true, false, null, null, 1, 2048, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureresolveLinkMetadataResult_4563be6a1e(
    @SerialName("description") val description: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("title") val title: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("description", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, true, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurerestoreToRevertAnchorRequest_46790b9541(
    @SerialName("anchor") val anchor: ProcedurecreateRevertAnchorResultU2DAnchor_98ef330d70,
    @SerialName("config") val config: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfig_281d24bbba> = RemoteField.Missing,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("anchor", "ProcedurecreateRevertAnchorResultU2DAnchor_98ef330d70", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("config", "ProcedureconnectThreadVoiceRequestU2DConfig_281d24bbba", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurerollbackThreadConversationRequest_095caa1523(
    @SerialName("config") val config: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfig_281d24bbba> = RemoteField.Missing,
    @SerialName("numTurns") val numTurns: Long,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("config", "ProcedureconnectThreadVoiceRequestU2DConfig_281d24bbba", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("numTurns", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurescanSkillsRequest_ccd4545c11(
    @SerialName("agentKind") val agentKind: RemoteField<String> = RemoteField.Missing,
    @SerialName("pluginOverrides") val pluginOverrides: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DMcpServerOverrides_6db96506f2> = RemoteField.Missing,
    @SerialName("presentationMode") val presentationMode: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: RemoteField<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154> = RemoteField.Missing,
    @SerialName("wslDistro") val wslDistro: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKind", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pluginOverrides", "ProcedureconnectThreadVoiceRequestU2DConfigU2DMcpServerOverrides_6db96506f2", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationMode", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslDistro", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurescanSkillsResultU2DInvocationU2DOptionU2D1_ee6af1c3c6 {
    @SerialName("slash") SLASH,
    @SerialName("dollar") DOLLAR,
    @SerialName("prompt") PROMPT,
    @SerialName("skill") SKILL,
}

typealias ProcedurescanSkillsResultU2DInvocation_7a20e2f82d = ProcedurescanSkillsResultU2DInvocationU2DOptionU2D1_ee6af1c3c6?

@Serializable
data class ProcedurescanSkillsResultU2DIssuesU2DItem_af9e7187ee(
    @SerialName("message") val message: String,
    @SerialName("path") val path: String,
    @SerialName("providerId") val providerId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("message", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurescanSkillsResultU2DSkillsU2DItemU2DImportState_5cfe15b2e7 {
    @SerialName("available") AVAILABLE,
    @SerialName("already-imported") ALREADYU2DIMPORTED,
    @SerialName("conflict") CONFLICT,
}

@Serializable
enum class ProcedurescanSkillsResultU2DSkillsU2DItemU2DInvalidReason_883b3b8a61 {
    @SerialName("read-error") READU2DERROR,
    @SerialName("missing-file") MISSINGU2DFILE,
    @SerialName("too-large") TOOU2DLARGE,
    @SerialName("missing-frontmatter") MISSINGU2DFRONTMATTER,
    @SerialName("missing-name") MISSINGU2DNAME,
    @SerialName("invalid-name") INVALIDU2DNAME,
    @SerialName("name-mismatch") NAMEU2DMISMATCH,
    @SerialName("missing-description") MISSINGU2DDESCRIPTION,
    @SerialName("description-too-long") DESCRIPTIONU2DTOOU2DLONG,
}

@Serializable
enum class ProcedurescanSkillsResultU2DSkillsU2DItemU2DOrigin_91766049df {
    @SerialName("managed") MANAGED,
    @SerialName("external") EXTERNAL,
    @SerialName("built-in") BUILTU2DIN,
    @SerialName("plugin") PLUGIN,
}

@Serializable
data class ProcedurescanSkillsResultU2DSkillsU2DItem_56a9bf5bf3(
    @SerialName("absolutePath") val absolutePath: String,
    @SerialName("availability") val availability: RemoteField<ProcedureimportSkillsRequestU2DSkillsU2DItemU2DAvailability_9c8337f42f> = RemoteField.Missing,
    @SerialName("description") val description: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("enabled") val enabled: Boolean,
    @SerialName("folderName") val folderName: String,
    @SerialName("id") val id: String,
    @SerialName("importState") val importState: RemoteField<ProcedurescanSkillsResultU2DSkillsU2DItemU2DImportState_5cfe15b2e7> = RemoteField.Missing,
    @SerialName("invalidReason") val invalidReason: RemoteField<ProcedurescanSkillsResultU2DSkillsU2DItemU2DInvalidReason_883b3b8a61> = RemoteField.Missing,
    @SerialName("invocation") val invocation: RemoteField<ProcedurescanSkillsResultU2DInvocationU2DOptionU2D1_ee6af1c3c6> = RemoteField.Missing,
    @SerialName("linked") val linked: Boolean,
    @SerialName("mutable") val mutable: Boolean,
    @SerialName("name") val name: String,
    @SerialName("origin") val origin: ProcedurescanSkillsResultU2DSkillsU2DItemU2DOrigin_91766049df,
    @SerialName("pluginId") val pluginId: RemoteField<String> = RemoteField.Missing,
    @SerialName("pluginName") val pluginName: RemoteField<String> = RemoteField.Missing,
    @SerialName("portable") val portable: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("providerGroupId") val providerGroupId: RemoteField<String> = RemoteField.Missing,
    @SerialName("providerGroupLabel") val providerGroupLabel: RemoteField<String> = RemoteField.Missing,
    @SerialName("providerGroupOrder") val providerGroupOrder: RemoteField<Long> = RemoteField.Missing,
    @SerialName("providerId") val providerId: String,
    @SerialName("providerLabel") val providerLabel: String,
    @SerialName("rootPath") val rootPath: String,
    @SerialName("scope") val scope: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11,
    @SerialName("scopeLabel") val scopeLabel: String,
    @SerialName("skillFilePath") val skillFilePath: String,
    @SerialName("sourcePath") val sourcePath: RemoteField<String> = RemoteField.Missing,
    @SerialName("valid") val valid: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("absolutePath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("availability", "ProcedureimportSkillsRequestU2DSkillsU2DItemU2DAvailability_9c8337f42f", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("description", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("enabled", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("folderName", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("importState", "ProcedurescanSkillsResultU2DSkillsU2DItemU2DImportState_5cfe15b2e7", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("invalidReason", "ProcedurescanSkillsResultU2DSkillsU2DItemU2DInvalidReason_883b3b8a61", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("invocation", "ProcedurescanSkillsResultU2DInvocationU2DOptionU2D1_ee6af1c3c6", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("linked", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mutable", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("origin", "ProcedurescanSkillsResultU2DSkillsU2DItemU2DOrigin_91766049df", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pluginId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pluginName", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("portable", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerGroupId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerGroupLabel", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerGroupOrder", "Long", false, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerLabel", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("rootPath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scope", "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scopeLabel", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("skillFilePath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sourcePath", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("valid", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurescanSkillsResult_f958c6e1fa(
    @SerialName("canLinkToGlobal") val canLinkToGlobal: Boolean,
    @SerialName("effectiveSkillIds") val effectiveSkillIds: List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("invocation") val invocation: RemoteField<ProcedurescanSkillsResultU2DInvocationU2DOptionU2D1_ee6af1c3c6>,
    @SerialName("issues") val issues: List<ProcedurescanSkillsResultU2DIssuesU2DItem_af9e7187ee>,
    @SerialName("skills") val skills: List<ProcedurescanSkillsResultU2DSkillsU2DItem_56a9bf5bf3>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("canLinkToGlobal", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("effectiveSkillIds", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("invocation", "ProcedurescanSkillsResultU2DInvocationU2DOptionU2D1_ee6af1c3c6", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("issues", "List<ProcedurescanSkillsResultU2DIssuesU2DItem_af9e7187ee>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("skills", "List<ProcedurescanSkillsResultU2DSkillsU2DItem_56a9bf5bf3>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduresearchProjectFilesRequestU2DSearchConfig_cbf78da83a(
    @SerialName("excludePatterns") val excludePatterns: List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("useIgnoreFiles") val useIgnoreFiles: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("excludePatterns", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("useIgnoreFiles", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduresearchProjectFilesRequest_c4ad1400e2(
    @SerialName("limit") val limit: RemoteField<Long> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("query") val query: RemoteField<String> = RemoteField.Missing,
    @SerialName("searchConfig") val searchConfig: RemoteField<ProceduresearchProjectFilesRequestU2DSearchConfig_cbf78da83a> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("limit", "Long", false, false, 1.0, 200.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("query", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("searchConfig", "ProceduresearchProjectFilesRequestU2DSearchConfig_cbf78da83a", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduresearchProjectFilesResultU2DEntriesU2DItem_378174642b(
    @SerialName("name") val name: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("path") val path: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("type") val type: ProcedurebrowseHostDirectoryResultU2DEntriesU2DItemU2DType_8d3732b59a,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("name", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurebrowseHostDirectoryResultU2DEntriesU2DItemU2DType_8d3732b59a", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduresearchProjectFilesResult_2465ffaaf2(
    @SerialName("entries") val entries: List<ProceduresearchProjectFilesResultU2DEntriesU2DItem_378174642b>,
    @SerialName("totalIndexed") val totalIndexed: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("entries", "List<ProceduresearchProjectFilesResultU2DEntriesU2DItem_378174642b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("totalIndexed", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduresearchProjectTreeRequest_956459f749(
    @SerialName("entryType") val entryType: RemoteField<ProcedurebrowseHostDirectoryResultU2DEntriesU2DItemU2DType_8d3732b59a> = RemoteField.Missing,
    @SerialName("limit") val limit: RemoteField<Long> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("query") val query: RemoteField<String> = RemoteField.Missing,
    @SerialName("searchConfig") val searchConfig: RemoteField<ProceduresearchProjectFilesRequestU2DSearchConfig_cbf78da83a> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("entryType", "ProcedurebrowseHostDirectoryResultU2DEntriesU2DItemU2DType_8d3732b59a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("limit", "Long", false, false, 1.0, 200.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("query", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("searchConfig", "ProceduresearchProjectFilesRequestU2DSearchConfig_cbf78da83a", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduresearchProjectTreeResult_ed3d977334(
    @SerialName("entries") val entries: List<ProcedurelistProjectTreeResultU2DEntriesU2DItem_c073582d4f>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("entries", "List<ProcedurelistProjectTreeResultU2DEntriesU2DItem_c073582d4f>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduresetSkillEnabledRequest_38462ff398(
    @SerialName("absolutePath") val absolutePath: String,
    @SerialName("enabled") val enabled: Boolean,
    @SerialName("projectLocation") val projectLocation: RemoteField<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154> = RemoteField.Missing,
    @SerialName("wslDistro") val wslDistro: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("absolutePath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("enabled", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslDistro", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
