// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RouteprojectU2DCommandRequestU2DOptionU2D2_2b7595c3da(
    @SerialName("kind") val kind: RouteexperimentU2DCommandRequestU2DOptionU2D1U2DKind_1f45188862,
    @SerialName("name") val name: String,
    @SerialName("parentPath") val parentPath: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteexperimentU2DCommandRequestU2DOptionU2D1U2DKind_1f45188862", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("parentPath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteprojectU2DCommandRequestU2DOptionU2D3U2DKind_8793e38088 {
    @SerialName("clone") CLONE,
}

@Serializable
data class RouteprojectU2DCommandRequestU2DOptionU2D3_da66851500(
    @SerialName("kind") val kind: RouteprojectU2DCommandRequestU2DOptionU2D3U2DKind_8793e38088,
    @SerialName("name") val name: String,
    @SerialName("parentPath") val parentPath: String,
    @SerialName("source") val source: ProcedurecloneRepoRequestU2DSource_76b2c94b29,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteprojectU2DCommandRequestU2DOptionU2D3U2DKind_8793e38088", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("parentPath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("source", "ProcedurecloneRepoRequestU2DSource_76b2c94b29", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteprojectU2DCommandRequestU2DOptionU2D4U2DKind_cbc64d1458 {
    @SerialName("update") UPDATE,
}

typealias RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DGhAccount_eb2798e2cc = ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff?

typealias RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DMcpServers_637f685cb2 = List<ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1>?

@Serializable
data class RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1U2DActionsU2DItem_1544bc59ff(
    @SerialName("command") val command: String,
    @SerialName("icon") val icon: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("name") val name: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("command", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("icon", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1_cd124b21d9(
    @SerialName("actions") val actions: RemoteField<List<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1U2DActionsU2DItem_1544bc59ff>> = RemoteField.Missing,
    @SerialName("cleanupScript") val cleanupScript: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("setupScript") val setupScript: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("worktreeCopyPatterns") val worktreeCopyPatterns: RemoteField<List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("actions", "List<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1U2DActionsU2DItem_1544bc59ff>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("cleanupScript", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("setupScript", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeCopyPatterns", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScripts_3155b0e864 = RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1_cd124b21d9?

typealias RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1U2DExclude_cda18ebe4a = Map<String, Boolean>

@Serializable
data class RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1_3ccadafaab(
    @SerialName("exclude") val exclude: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1U2DExclude_cda18ebe4a> = RemoteField.Missing,
    @SerialName("useIgnoreFiles") val useIgnoreFiles: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("exclude", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1U2DExclude_cda18ebe4a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("useIgnoreFiles", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettings_3e412d7b32 = RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1_3ccadafaab?

@Serializable
enum class RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1U2DMode_953c573b19 {
    @SerialName("global") GLOBAL,
    @SerialName("project-relative") PROJECTU2DRELATIVE,
}

@Serializable
data class RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1_7eb7e8f44a(
    @SerialName("basePath") val basePath: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("mode") val mode: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1U2DMode_953c573b19> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("basePath", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mode", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1U2DMode_953c573b19", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocation_137e14636e = RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1_7eb7e8f44a?

@Serializable
data class RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatch_cadb9042bb(
    @SerialName("disabled") val disabled: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("ghAccount") val ghAccount: RemoteField<ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff> = RemoteField.Missing,
    @SerialName("icon") val icon: RemoteField<String> = RemoteField.Missing,
    @SerialName("mcpServers") val mcpServers: RemoteField<List<ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1>> = RemoteField.Missing,
    @SerialName("name") val name: RemoteField<String> = RemoteField.Missing,
    @SerialName("scripts") val scripts: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1_cd124b21d9> = RemoteField.Missing,
    @SerialName("searchSettings") val searchSettings: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1_3ccadafaab> = RemoteField.Missing,
    @SerialName("worktreeLocation") val worktreeLocation: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1_7eb7e8f44a> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("disabled", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ghAccount", "ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("icon", "String", false, true, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mcpServers", "List<ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1>", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scripts", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1_cd124b21d9", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("searchSettings", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1_3ccadafaab", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeLocation", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1_7eb7e8f44a", false, true, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprojectU2DCommandRequestU2DOptionU2D4_9bdd26dd83(
    @SerialName("kind") val kind: RouteprojectU2DCommandRequestU2DOptionU2D4U2DKind_cbc64d1458,
    @SerialName("patch") val patch: RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatch_cadb9042bb,
    @SerialName("projectId") val projectId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DKind_cbc64d1458", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("patch", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatch_cadb9042bb", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteprojectU2DCommandRequestU2DOptionU2D5U2DKind_88444d52d4 {
    @SerialName("relocate") RELOCATE,
}

@Serializable
data class RouteprojectU2DCommandRequestU2DOptionU2D5_27aa975674(
    @SerialName("kind") val kind: RouteprojectU2DCommandRequestU2DOptionU2D5U2DKind_88444d52d4,
    @SerialName("path") val path: String,
    @SerialName("projectId") val projectId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteprojectU2DCommandRequestU2DOptionU2D5U2DKind_88444d52d4", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprojectU2DCommandRequestU2DOptionU2D6_37addcca5b(
    @SerialName("kind") val kind: RouteexperimentU2DCommandRequestU2DOptionU2D3U2DKind_034741cb26,
    @SerialName("projectId") val projectId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteexperimentU2DCommandRequestU2DOptionU2D3U2DKind_034741cb26", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteprojectU2DCommandRequestU2DOptionU2D7U2DKind_701d7d6274 {
    @SerialName("reorder") REORDER,
}

@Serializable
data class RouteprojectU2DCommandRequestU2DOptionU2D7_580efa06e9(
    @SerialName("kind") val kind: RouteprojectU2DCommandRequestU2DOptionU2D7U2DKind_701d7d6274,
    @SerialName("placement") val placement: RoutebrowserU2DCommandRequestU2DOptionU2D4U2DPosition_3512bd687e,
    @SerialName("projectId") val projectId: String,
    @SerialName("targetProjectId") val targetProjectId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteprojectU2DCommandRequestU2DOptionU2D7U2DKind_701d7d6274", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("placement", "RoutebrowserU2DCommandRequestU2DOptionU2D4U2DPosition_3512bd687e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("targetProjectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteprojectU2DCommandRequestU2DOptionU2D8U2DKind_96cd458fa9 {
    @SerialName("set-workspace") SETU2DWORKSPACE,
}

@Serializable
data class RouteprojectU2DCommandRequestU2DOptionU2D8_ebfa6f1c64(
    @SerialName("kind") val kind: RouteprojectU2DCommandRequestU2DOptionU2D8U2DKind_96cd458fa9,
    @SerialName("projectId") val projectId: String,
    @SerialName("workspaceId") val workspaceId: RemoteField<String>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteprojectU2DCommandRequestU2DOptionU2D8U2DKind_96cd458fa9", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("workspaceId", "String", true, true, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteprojectU2DCommandRequestU2DOptionU2D9U2DKind_93f8fa8787 {
    @SerialName("set-draft-config") SETU2DDRAFTU2DCONFIG,
}

@Serializable
data class RouteprojectU2DCommandRequestU2DOptionU2D9U2DLastDraftConfigU2DOptionU2D1_a0f4181c86(
    @SerialName("agentKind") val agentKind: String,
    @SerialName("approvalPolicy") val approvalPolicy: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("approvalsReviewer") val approvalsReviewer: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("browserMcp") val browserMcp: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("chromeMcp") val chromeMcp: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("computerUse") val computerUse: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("contextSize") val contextSize: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("crossagentMcp") val crossagentMcp: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("effort") val effort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("executionEnvironment") val executionEnvironment: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DExecutionEnvironment_4cd2587996> = RemoteField.Missing,
    @SerialName("fast") val fast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("mode") val mode: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DMode_01e21946e9> = RemoteField.Missing,
    @SerialName("model") val model: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("sandboxMode") val sandboxMode: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("thinking") val thinking: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("worktreeMode") val worktreeMode: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("approvalPolicy", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("approvalsReviewer", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("browserMcp", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("chromeMcp", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("computerUse", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("contextSize", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("crossagentMcp", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("effort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("executionEnvironment", "ProcedureconnectThreadVoiceRequestU2DConfigU2DExecutionEnvironment_4cd2587996", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mode", "ProcedureconnectThreadVoiceRequestU2DConfigU2DMode_01e21946e9", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sandboxMode", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("thinking", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeMode", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteprojectU2DCommandRequestU2DOptionU2D9U2DLastDraftConfig_fadbe22ed9 = RouteprojectU2DCommandRequestU2DOptionU2D9U2DLastDraftConfigU2DOptionU2D1_a0f4181c86?

@Serializable
data class RouteprojectU2DCommandRequestU2DOptionU2D9_93de8c66d5(
    @SerialName("kind") val kind: RouteprojectU2DCommandRequestU2DOptionU2D9U2DKind_93f8fa8787,
    @SerialName("lastDraftConfig") val lastDraftConfig: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D9U2DLastDraftConfigU2DOptionU2D1_a0f4181c86>,
    @SerialName("projectId") val projectId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteprojectU2DCommandRequestU2DOptionU2D9U2DKind_93f8fa8787", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastDraftConfig", "RouteprojectU2DCommandRequestU2DOptionU2D9U2DLastDraftConfigU2DOptionU2D1_a0f4181c86", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RouteprojectU2DCommandRequest_1fe67ecd49.Serializer::class)
sealed interface RouteprojectU2DCommandRequest_1fe67ecd49 {
    data class Option1(val value: RouteprojectU2DCommandRequestU2DOptionU2D1_9bb33af2f6) : RouteprojectU2DCommandRequest_1fe67ecd49
    data class Option2(val value: RouteprojectU2DCommandRequestU2DOptionU2D2_2b7595c3da) : RouteprojectU2DCommandRequest_1fe67ecd49
    data class Option3(val value: RouteprojectU2DCommandRequestU2DOptionU2D3_da66851500) : RouteprojectU2DCommandRequest_1fe67ecd49
    data class Option4(val value: RouteprojectU2DCommandRequestU2DOptionU2D4_9bdd26dd83) : RouteprojectU2DCommandRequest_1fe67ecd49
    data class Option5(val value: RouteprojectU2DCommandRequestU2DOptionU2D5_27aa975674) : RouteprojectU2DCommandRequest_1fe67ecd49
    data class Option6(val value: RouteprojectU2DCommandRequestU2DOptionU2D6_37addcca5b) : RouteprojectU2DCommandRequest_1fe67ecd49
    data class Option7(val value: RouteprojectU2DCommandRequestU2DOptionU2D7_580efa06e9) : RouteprojectU2DCommandRequest_1fe67ecd49
    data class Option8(val value: RouteprojectU2DCommandRequestU2DOptionU2D8_ebfa6f1c64) : RouteprojectU2DCommandRequest_1fe67ecd49
    data class Option9(val value: RouteprojectU2DCommandRequestU2DOptionU2D9_93de8c66d5) : RouteprojectU2DCommandRequest_1fe67ecd49
    object Serializer : KSerializer<RouteprojectU2DCommandRequest_1fe67ecd49> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouteprojectU2DCommandRequest_1fe67ecd49")
        override fun deserialize(decoder: Decoder): RouteprojectU2DCommandRequest_1fe67ecd49 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouteprojectU2DCommandRequest_1fe67ecd49 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouteprojectU2DCommandRequest_1fe67ecd49>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("add-existing")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D1_9bb33af2f6>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("create")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D2_2b7595c3da>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("clone")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D3_da66851500>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("update")))) { Option4(jsonDecoder.json.decodeFromJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D4_9bdd26dd83>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("relocate")))) { Option5(jsonDecoder.json.decodeFromJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D5_27aa975674>(element)) }
            RemoteUnionCodec.tryOption(matches, 6, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("remove")))) { Option6(jsonDecoder.json.decodeFromJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D6_37addcca5b>(element)) }
            RemoteUnionCodec.tryOption(matches, 7, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("reorder")))) { Option7(jsonDecoder.json.decodeFromJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D7_580efa06e9>(element)) }
            RemoteUnionCodec.tryOption(matches, 8, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("set-workspace")))) { Option8(jsonDecoder.json.decodeFromJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D8_ebfa6f1c64>(element)) }
            RemoteUnionCodec.tryOption(matches, 9, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("set-draft-config")))) { Option9(jsonDecoder.json.decodeFromJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D9_93de8c66d5>(element)) }
            return RemoteUnionCodec.single("RouteprojectU2DCommandRequest_1fe67ecd49", matches)
        }
        override fun serialize(encoder: Encoder, value: RouteprojectU2DCommandRequest_1fe67ecd49) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouteprojectU2DCommandRequest_1fe67ecd49 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D1_9bb33af2f6>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D2_2b7595c3da>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D3_da66851500>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D4_9bdd26dd83>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D5_27aa975674>(value.value)
                is Option6 -> jsonEncoder.json.encodeToJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D6_37addcca5b>(value.value)
                is Option7 -> jsonEncoder.json.encodeToJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D7_580efa06e9>(value.value)
                is Option8 -> jsonEncoder.json.encodeToJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D8_ebfa6f1c64>(value.value)
                is Option9 -> jsonEncoder.json.encodeToJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D9_93de8c66d5>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class RouteprojectU2DCommandResponseU2DOptionU2D1U2DProjectU2DScripts_51d89a5cbb(
    @SerialName("actions") val actions: List<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1U2DActionsU2DItem_1544bc59ff>,
    @SerialName("cleanupScript") val cleanupScript: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("setupScript") val setupScript: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("worktreeCopyPatterns") val worktreeCopyPatterns: RemoteField<List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("actions", "List<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1U2DActionsU2DItem_1544bc59ff>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("cleanupScript", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("setupScript", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeCopyPatterns", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_e21c843ae3(
    @SerialName("createdAt") val createdAt: String,
    @SerialName("disabled") val disabled: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("ghAccount") val ghAccount: RemoteField<ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff> = RemoteField.Missing,
    @SerialName("icon") val icon: RemoteField<String> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("lastDraftConfig") val lastDraftConfig: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D9U2DLastDraftConfigU2DOptionU2D1_a0f4181c86> = RemoteField.Missing,
    @SerialName("location") val location: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("name") val name: String,
    @SerialName("remoteId") val remoteId: RemoteField<String> = RemoteField.Missing,
    @SerialName("remoteServerId") val remoteServerId: RemoteField<String> = RemoteField.Missing,
    @SerialName("scripts") val scripts: RemoteField<RouteprojectU2DCommandResponseU2DOptionU2D1U2DProjectU2DScripts_51d89a5cbb> = RemoteField.Missing,
    @SerialName("searchSettings") val searchSettings: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1_3ccadafaab> = RemoteField.Missing,
    @SerialName("workspaceId") val workspaceId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("worktreeLocation") val worktreeLocation: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1_7eb7e8f44a> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("createdAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabled", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ghAccount", "ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("icon", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastDraftConfig", "RouteprojectU2DCommandRequestU2DOptionU2D9U2DLastDraftConfigU2DOptionU2D1_a0f4181c86", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("location", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remoteId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remoteServerId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scripts", "RouteprojectU2DCommandResponseU2DOptionU2D1U2DProjectU2DScripts_51d89a5cbb", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("searchSettings", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1_3ccadafaab", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("workspaceId", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeLocation", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1_7eb7e8f44a", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprojectU2DCommandResponseU2DOptionU2D1_265118ebb2(
    @SerialName("project") val project: RemoteField<RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_e21c843ae3> = RemoteField.Missing,
    @SerialName("projects") val projects: List<RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_e21c843ae3>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("project", "RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_e21c843ae3", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projects", "List<RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_e21c843ae3>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprojectU2DCommandResponseU2DOptionU2D2_d2bab3e892(
    @SerialName("ok") val ok: ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1,
    @SerialName("project") val project: RemoteField<RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_e21c843ae3> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("ok", "ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("project", "RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_e21c843ae3", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
