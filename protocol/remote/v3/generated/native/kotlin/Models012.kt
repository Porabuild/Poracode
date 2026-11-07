// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class ProceduregitPruneWorktreesRequest_922ae6d8b3(
    @SerialName("activeWorktreePaths") val activeWorktreePaths: List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("activeWorktreePaths", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitPullFromSourceRequest_d7cf7473af(
    @SerialName("preserveLocalChanges") val preserveLocalChanges: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("sourceBranch") val sourceBranch: String,
    @SerialName("worktreeLocation") val worktreeLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("preserveLocalChanges", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sourceBranch", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitPullFromSourceResult_920e2e5db2(
    @SerialName("conflictFiles") val conflictFiles: RemoteField<List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>> = RemoteField.Missing,
    @SerialName("conflicting") val conflicting: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("error") val error: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("fastForward") val fastForward: Boolean,
    @SerialName("merged") val merged: Boolean,
    @SerialName("needsStash") val needsStash: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("reapplyConflicting") val reapplyConflicting: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("stashCommit") val stashCommit: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("stashPreserved") val stashPreserved: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("conflictFiles", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflicting", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("error", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fastForward", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("merged", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("needsStash", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reapplyConflicting", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("stashCommit", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("stashPreserved", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitPullRebaseRequest_78a16ea622(
    @SerialName("preserveLocalChanges") val preserveLocalChanges: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("remote") val remote: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("preserveLocalChanges", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remote", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitPushRequest_bdadccb73a(
    @SerialName("branch") val branch: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("remote") val remote: RemoteField<String> = RemoteField.Missing,
    @SerialName("setUpstream") val setUpstream: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("branch", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remote", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("setUpstream", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitRemoveWorktreeRequest_cb2e3d3519(
    @SerialName("deleteBranch") val deleteBranch: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("expectedBranch") val expectedBranch: RemoteField<String> = RemoteField.Missing,
    @SerialName("expectedOwnerToken") val expectedOwnerToken: RemoteField<String> = RemoteField.Missing,
    @SerialName("force") val force: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("path") val path: String,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("deleteBranch", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("expectedBranch", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("expectedOwnerToken", "String", false, false, null, null, 1, 128, null, null, null, null, listOf()),
            RemoteFieldDescriptor("force", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf("git.remove-worktree.owner-requires-branch"))
    }
}

@Serializable
data class ProceduregitRevertRequest_39f0b40d9d(
    @SerialName("filePath") val filePath: String,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("filePath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitSwitchBranchRequest_2e6d7dedeb(
    @SerialName("branch") val branch: String,
    @SerialName("createNew") val createNew: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("branch", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("createNew", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitSwitchBranchResult_4eb37bd43c(
    @SerialName("ahead") val ahead: Long,
    @SerialName("behind") val behind: Long,
    @SerialName("branch") val branch: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("created") val created: Boolean,
    @SerialName("tracking") val tracking: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("ahead", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("behind", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("branch", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("created", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tracking", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitSyncRebaseRequest_2a7c0f6300(
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("remote") val remote: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remote", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitSyncRebaseResult_a8dfb6388d(
    @SerialName("pulled") val pulled: Boolean,
    @SerialName("pushed") val pushed: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("pulled", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pushed", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitUnwatchProjectRequest_42dfa7eae9(
    @SerialName("projectId") val projectId: String,
    @SerialName("releaseWslDistro") val releaseWslDistro: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("releaseWslDistro", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitWatchProjectRequest_da482300f3(
    @SerialName("projectId") val projectId: String,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitWatchWorktreesRequest_8b52512d7a(
    @SerialName("projectId") val projectId: String,
    @SerialName("worktreePaths") val worktreePaths: List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePaths", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitWorktreeStatusBatchRequest_a6f98c7f48(
    @SerialName("detail") val detail: RemoteField<ProceduregetGitStatusRequestU2DDetail_15cae388d0> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("worktreePaths") val worktreePaths: List<String>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("detail", "ProceduregetGitStatusRequestU2DDetail_15cae388d0", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePaths", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProceduregitWorktreeStatusBatchResultU2DStatuses_745963f664 = Map<String, ProceduregetGitStatusResult_c1d4a9f752>

@Serializable
data class ProceduregitWorktreeStatusBatchResult_1b23732705(
    @SerialName("statuses") val statuses: ProceduregitWorktreeStatusBatchResultU2DStatuses_745963f664,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("statuses", "ProceduregitWorktreeStatusBatchResultU2DStatuses_745963f664", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurehexVoiceRequestU2DOptionU2D10U2DAction_79cc8fd877 {
    @SerialName("status") STATUS,
}

@Serializable
data class ProcedurehexVoiceRequestU2DOptionU2D10_313744588c(
    @SerialName("action") val action: ProcedurehexVoiceRequestU2DOptionU2D10U2DAction_79cc8fd877,
    @SerialName("id") val id: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "ProcedurehexVoiceRequestU2DOptionU2D10U2DAction_79cc8fd877", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurehexVoiceRequestU2DOptionU2D11_27790e6c42(
    @SerialName("action") val action: ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D5U2DType_482c928271,
    @SerialName("id") val id: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D5U2DType_482c928271", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurehexVoiceRequestU2DOptionU2D1U2DAction_8d030d3e3d {
    @SerialName("setup") SETUP,
}

@Serializable
data class ProcedurehexVoiceRequestU2DOptionU2D1_929ff57e13(
    @SerialName("action") val action: ProcedurehexVoiceRequestU2DOptionU2D1U2DAction_8d030d3e3d,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "ProcedurehexVoiceRequestU2DOptionU2D1U2DAction_8d030d3e3d", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurehexVoiceRequestU2DOptionU2D2U2DAction_9bf3994f25 {
    @SerialName("install") INSTALL,
}

@Serializable
data class ProcedurehexVoiceRequestU2DOptionU2D2_fee1e07039(
    @SerialName("action") val action: ProcedurehexVoiceRequestU2DOptionU2D2U2DAction_9bf3994f25,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "ProcedurehexVoiceRequestU2DOptionU2D2U2DAction_9bf3994f25", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurehexVoiceRequestU2DOptionU2D3U2DAction_813e06bfce {
    @SerialName("cancel_install") CANCELU5FINSTALL,
}

@Serializable
data class ProcedurehexVoiceRequestU2DOptionU2D3_475f45061f(
    @SerialName("action") val action: ProcedurehexVoiceRequestU2DOptionU2D3U2DAction_813e06bfce,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "ProcedurehexVoiceRequestU2DOptionU2D3U2DAction_813e06bfce", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurehexVoiceRequestU2DOptionU2D4U2DAction_49834fb5a4 {
    @SerialName("remove_engine") REMOVEU5FENGINE,
}

@Serializable
data class ProcedurehexVoiceRequestU2DOptionU2D4_297655ba91(
    @SerialName("action") val action: ProcedurehexVoiceRequestU2DOptionU2D4U2DAction_49834fb5a4,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "ProcedurehexVoiceRequestU2DOptionU2D4U2DAction_49834fb5a4", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0 {
    @SerialName("list") LIST,
}

@Serializable
data class ProcedurehexVoiceRequestU2DOptionU2D5_0aacda6901(
    @SerialName("action") val action: ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0,
    @SerialName("language") val language: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("language", "String", true, false, null, null, 1, 32, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurehexVoiceRequestU2DOptionU2D6U2DAction_d6b726f850 {
    @SerialName("prepare") PREPARE,
}

@Serializable
data class ProcedurehexVoiceRequestU2DOptionU2D6_f8fde013f7(
    @SerialName("action") val action: ProcedurehexVoiceRequestU2DOptionU2D6U2DAction_d6b726f850,
    @SerialName("id") val id: String,
    @SerialName("language") val language: String,
    @SerialName("model") val model: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "ProcedurehexVoiceRequestU2DOptionU2D6U2DAction_d6b726f850", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("language", "String", true, false, null, null, 1, 32, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "String", true, false, null, null, 1, 128, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurehexVoiceRequestU2DOptionU2D7U2DAction_236e9131b0 {
    @SerialName("begin") BEGIN,
}

@Serializable
data class ProcedurehexVoiceRequestU2DOptionU2D7_9501e4a8a7(
    @SerialName("action") val action: ProcedurehexVoiceRequestU2DOptionU2D7U2DAction_236e9131b0,
    @SerialName("id") val id: String,
    @SerialName("language") val language: String,
    @SerialName("model") val model: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "ProcedurehexVoiceRequestU2DOptionU2D7U2DAction_236e9131b0", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("language", "String", true, false, null, null, 1, 32, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "String", true, false, null, null, 1, 128, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurehexVoiceRequestU2DOptionU2D8U2DAction_11da754926 {
    @SerialName("append") APPEND,
}

@Serializable
data class ProcedurehexVoiceRequestU2DOptionU2D8_5a9666a2c5(
    @SerialName("action") val action: ProcedurehexVoiceRequestU2DOptionU2D8U2DAction_11da754926,
    @SerialName("audioBase64") val audioBase64: String,
    @SerialName("id") val id: String,
    @SerialName("offset") val offset: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "ProcedurehexVoiceRequestU2DOptionU2D8U2DAction_11da754926", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("audioBase64", "String", true, false, null, null, 4, 262144, null, null, "^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$", null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("offset", "Long", true, false, 0.0, 9600044.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurehexVoiceRequestU2DOptionU2D9U2DAction_c408d3b674 {
    @SerialName("finish") FINISH,
}
