// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D14_370ff0ec0a(
    @SerialName("kind") val kind: RouteschedulesU2DCommandRequestU2DOptionU2D3U2DKind_4d5989d27d,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteschedulesU2DCommandRequestU2DOptionU2D3U2DKind_4d5989d27d", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D15_2062bc5ac9(
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
enum class RoutethreadU2DCommandRequestU2DOptionU2D16U2DKind_8e7b4d097a {
    @SerialName("reorder-flat") REORDERU2DFLAT,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D16_efd9410c75(
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D16U2DKind_8e7b4d097a,
    @SerialName("placement") val placement: RoutebrowserU2DCommandRequestU2DOptionU2D4U2DPosition_3512bd687e,
    @SerialName("projectId") val projectId: String,
    @SerialName("targetThreadId") val targetThreadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D16U2DKind_8e7b4d097a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("placement", "RoutebrowserU2DCommandRequestU2DOptionU2D4U2DPosition_3512bd687e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("targetThreadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D17_69af29ff38(
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
data class RoutethreadU2DCommandRequestU2DOptionU2D18_09d9f509bf(
    @SerialName("agentInstanceId") val agentInstanceId: RemoteField<String> = RemoteField.Missing,
    @SerialName("agentKind") val agentKind: String,
    @SerialName("config") val config: ProcedureconnectThreadVoiceRequestU2DConfig_77c646d1a0,
    @SerialName("groupId") val groupId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("groupName") val groupName: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("kind") val kind: RouteexperimentU2DCommandRequestU2DOptionU2D1U2DKind_1f45188862,
    @SerialName("parentThreadId") val parentThreadId: RemoteField<String> = RemoteField.Missing,
    @SerialName("prNumber") val prNumber: RemoteField<Double> = RemoteField.Missing,
    @SerialName("presentationMode") val presentationMode: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6> = RemoteField.Missing,
    @SerialName("projectId") val projectId: String,
    @SerialName("title") val title: String,
    @SerialName("workspaceId") val workspaceId: RemoteField<String> = RemoteField.Missing,
    @SerialName("worktreeBranch") val worktreeBranch: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("worktreePath") val worktreePath: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentInstanceId", "String", false, false, null, null, 1, 120, null, null, "^[a-z0-9][a-z0-9_\\-:.]*$", null, listOf()),
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("config", "ProcedureconnectThreadVoiceRequestU2DConfig_77c646d1a0", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("groupId", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("groupName", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RouteexperimentU2DCommandRequestU2DOptionU2D1U2DKind_1f45188862", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("parentThreadId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prNumber", "Double", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationMode", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("workspaceId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeBranch", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D1U2DKind_587e72c508 {
    @SerialName("fork") FORK,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D1_8d889103a9(
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D1U2DKind_587e72c508,
    @SerialName("sourceThreadId") val sourceThreadId: String,
    @SerialName("throughItemId") val throughItemId: RemoteField<String> = RemoteField.Missing,
    @SerialName("title") val title: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D1U2DKind_587e72c508", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sourceThreadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("throughItemId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D2U2DKind_a1f40266b6 {
    @SerialName("prepare-worktree") PREPAREU2DWORKTREE,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D2_b01e26e043(
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D2U2DKind_a1f40266b6,
    @SerialName("projectId") val projectId: String,
    @SerialName("worktreePath") val worktreePath: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D2U2DKind_a1f40266b6", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D3_5f0a33bcd0(
    @SerialName("agentInstanceId") val agentInstanceId: RemoteField<String> = RemoteField.Missing,
    @SerialName("agentKind") val agentKind: String,
    @SerialName("clientContext") val clientContext: RemoteField<ProcedureensureThreadRunningRequestU2DClientContext_b23ca9582f> = RemoteField.Missing,
    @SerialName("config") val config: ProcedureconnectThreadVoiceRequestU2DConfig_77c646d1a0,
    @SerialName("focus") val focus: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("groupId") val groupId: RemoteField<String> = RemoteField.Missing,
    @SerialName("groupName") val groupName: RemoteField<String> = RemoteField.Missing,
    @SerialName("initialSize") val initialSize: RemoteField<ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09> = RemoteField.Missing,
    @SerialName("isNewWorktree") val isNewWorktree: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("kind") val kind: RoutedeviceU2DActionRequestU2DOptionU2D5U2DKind_60fc988aef,
    @SerialName("launchRuntime") val launchRuntime: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("parentThreadId") val parentThreadId: RemoteField<String> = RemoteField.Missing,
    @SerialName("prNumber") val prNumber: RemoteField<Long> = RemoteField.Missing,
    @SerialName("presentationMode") val presentationMode: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6> = RemoteField.Missing,
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
            RemoteFieldDescriptor("config", "ProcedureconnectThreadVoiceRequestU2DConfig_77c646d1a0", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("focus", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("groupId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("groupName", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("initialSize", "ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("isNewWorktree", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutedeviceU2DActionRequestU2DOptionU2D5U2DKind_60fc988aef", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("launchRuntime", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("parentThreadId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prNumber", "Long", false, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationMode", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6", false, false, null, null, null, null, null, null, null, null, listOf()),
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
enum class RoutethreadU2DCommandRequestU2DOptionU2D4U2DKind_f399af5f8d {
    @SerialName("set-group") SETU2DGROUP,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D4_21cd039cb3(
    @SerialName("groupId") val groupId: RemoteField<String> = RemoteField.Missing,
    @SerialName("groupName") val groupName: RemoteField<String> = RemoteField.Missing,
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D4U2DKind_f399af5f8d,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("groupId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("groupName", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D4U2DKind_f399af5f8d", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D5U2DKind_03fdf2ff7a {
    @SerialName("clear-group") CLEARU2DGROUP,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D5_1ae7de2180(
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D5U2DKind_03fdf2ff7a,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D5U2DKind_03fdf2ff7a", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D6U2DKind_356ae1fc45 {
    @SerialName("rename") RENAME,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D6_2e4d2aaed0(
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D6U2DKind_356ae1fc45,
    @SerialName("title") val title: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D6U2DKind_356ae1fc45", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D7U2DKind_4ec1299a98 {
    @SerialName("acknowledge") ACKNOWLEDGE,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D7_c3363423bb(
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D7U2DKind_4ec1299a98,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D7U2DKind_4ec1299a98", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D8U2DKind_a9e065ca18 {
    @SerialName("set-done") SETU2DDONE,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D8_80906c6ddc(
    @SerialName("done") val done: Boolean,
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D8U2DKind_a9e065ca18,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("done", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D8U2DKind_a9e065ca18", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D9U2DKind_833ef472e7 {
    @SerialName("set-starred") SETU2DSTARRED,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D9_ebd70a208b(
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D9U2DKind_833ef472e7,
    @SerialName("starred") val starred: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D9U2DKind_833ef472e7", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("starred", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RoutethreadU2DCommandRequest_6364a5845d.Serializer::class)
sealed interface RoutethreadU2DCommandRequest_6364a5845d {
    data class Option1(val value: RoutethreadU2DCommandRequestU2DOptionU2D1_8d889103a9) : RoutethreadU2DCommandRequest_6364a5845d
    data class Option2(val value: RoutethreadU2DCommandRequestU2DOptionU2D2_b01e26e043) : RoutethreadU2DCommandRequest_6364a5845d
    data class Option3(val value: RoutethreadU2DCommandRequestU2DOptionU2D3_5f0a33bcd0) : RoutethreadU2DCommandRequest_6364a5845d
    data class Option4(val value: RoutethreadU2DCommandRequestU2DOptionU2D4_21cd039cb3) : RoutethreadU2DCommandRequest_6364a5845d
    data class Option5(val value: RoutethreadU2DCommandRequestU2DOptionU2D5_1ae7de2180) : RoutethreadU2DCommandRequest_6364a5845d
    data class Option6(val value: RoutethreadU2DCommandRequestU2DOptionU2D6_2e4d2aaed0) : RoutethreadU2DCommandRequest_6364a5845d
    data class Option7(val value: RoutethreadU2DCommandRequestU2DOptionU2D7_c3363423bb) : RoutethreadU2DCommandRequest_6364a5845d
    data class Option8(val value: RoutethreadU2DCommandRequestU2DOptionU2D8_80906c6ddc) : RoutethreadU2DCommandRequest_6364a5845d
    data class Option9(val value: RoutethreadU2DCommandRequestU2DOptionU2D9_ebd70a208b) : RoutethreadU2DCommandRequest_6364a5845d
    data class Option10(val value: RoutethreadU2DCommandRequestU2DOptionU2D10_b79d8f64de) : RoutethreadU2DCommandRequest_6364a5845d
    data class Option11(val value: RoutethreadU2DCommandRequestU2DOptionU2D11_09765c7778) : RoutethreadU2DCommandRequest_6364a5845d
    data class Option12(val value: RoutethreadU2DCommandRequestU2DOptionU2D12_431be1ab7e) : RoutethreadU2DCommandRequest_6364a5845d
    data class Option13(val value: RoutethreadU2DCommandRequestU2DOptionU2D13_a93ba7bf23) : RoutethreadU2DCommandRequest_6364a5845d
    data class Option14(val value: RoutethreadU2DCommandRequestU2DOptionU2D14_370ff0ec0a) : RoutethreadU2DCommandRequest_6364a5845d
    data class Option15(val value: RoutethreadU2DCommandRequestU2DOptionU2D15_2062bc5ac9) : RoutethreadU2DCommandRequest_6364a5845d
    data class Option16(val value: RoutethreadU2DCommandRequestU2DOptionU2D16_efd9410c75) : RoutethreadU2DCommandRequest_6364a5845d
    data class Option17(val value: RoutethreadU2DCommandRequestU2DOptionU2D17_69af29ff38) : RoutethreadU2DCommandRequest_6364a5845d
    data class Option18(val value: RoutethreadU2DCommandRequestU2DOptionU2D18_09d9f509bf) : RoutethreadU2DCommandRequest_6364a5845d
    object Serializer : KSerializer<RoutethreadU2DCommandRequest_6364a5845d> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutethreadU2DCommandRequest_6364a5845d")
        override fun deserialize(decoder: Decoder): RoutethreadU2DCommandRequest_6364a5845d {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutethreadU2DCommandRequest_6364a5845d supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutethreadU2DCommandRequest_6364a5845d>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("fork")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D1_8d889103a9>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("prepare-worktree")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D2_b01e26e043>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("start")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D3_5f0a33bcd0>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("set-group")))) { Option4(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D4_21cd039cb3>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("clear-group")))) { Option5(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D5_1ae7de2180>(element)) }
            RemoteUnionCodec.tryOption(matches, 6, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("rename")))) { Option6(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D6_2e4d2aaed0>(element)) }
            RemoteUnionCodec.tryOption(matches, 7, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("acknowledge")))) { Option7(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D7_c3363423bb>(element)) }
            RemoteUnionCodec.tryOption(matches, 8, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("set-done")))) { Option8(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D8_80906c6ddc>(element)) }
            RemoteUnionCodec.tryOption(matches, 9, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("set-starred")))) { Option9(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D9_ebd70a208b>(element)) }
            RemoteUnionCodec.tryOption(matches, 10, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("set-worktree")))) { Option10(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D10_b79d8f64de>(element)) }
            RemoteUnionCodec.tryOption(matches, 11, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("delete-worktree-group")))) { Option11(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D11_09765c7778>(element)) }
            RemoteUnionCodec.tryOption(matches, 12, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("archive")))) { Option12(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D12_431be1ab7e>(element)) }
            RemoteUnionCodec.tryOption(matches, 13, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("unarchive")))) { Option13(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D13_a93ba7bf23>(element)) }
            RemoteUnionCodec.tryOption(matches, 14, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("delete")))) { Option14(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D14_370ff0ec0a>(element)) }
            RemoteUnionCodec.tryOption(matches, 15, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("reorder")))) { Option15(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D15_2062bc5ac9>(element)) }
            RemoteUnionCodec.tryOption(matches, 16, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("reorder-flat")))) { Option16(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D16_efd9410c75>(element)) }
            RemoteUnionCodec.tryOption(matches, 17, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("set-workspace")))) { Option17(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D17_69af29ff38>(element)) }
            RemoteUnionCodec.tryOption(matches, 18, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("create")))) { Option18(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D18_09d9f509bf>(element)) }
            return RemoteUnionCodec.single("RoutethreadU2DCommandRequest_6364a5845d", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutethreadU2DCommandRequest_6364a5845d) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutethreadU2DCommandRequest_6364a5845d supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D1_8d889103a9>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D2_b01e26e043>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D3_5f0a33bcd0>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D4_21cd039cb3>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D5_1ae7de2180>(value.value)
                is Option6 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D6_2e4d2aaed0>(value.value)
                is Option7 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D7_c3363423bb>(value.value)
                is Option8 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D8_80906c6ddc>(value.value)
                is Option9 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D9_ebd70a208b>(value.value)
                is Option10 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D10_b79d8f64de>(value.value)
                is Option11 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D11_09765c7778>(value.value)
                is Option12 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D12_431be1ab7e>(value.value)
                is Option13 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D13_a93ba7bf23>(value.value)
                is Option14 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D14_370ff0ec0a>(value.value)
                is Option15 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D15_2062bc5ac9>(value.value)
                is Option16 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D16_efd9410c75>(value.value)
                is Option17 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D17_69af29ff38>(value.value)
                is Option18 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D18_09d9f509bf>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class RoutethreadU2DGoalRequestU2DOptionU2D1U2DAction_10209383e3 {
    @SerialName("edit") EDIT,
}

@Serializable
data class RoutethreadU2DGoalRequestU2DOptionU2D1_f3c2d2c491(
    @SerialName("action") val action: RoutethreadU2DGoalRequestU2DOptionU2D1U2DAction_10209383e3,
    @SerialName("objective") val objective: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "RoutethreadU2DGoalRequestU2DOptionU2D1U2DAction_10209383e3", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("objective", "String", true, false, null, null, 1, 4000, null, null, null, null, listOf("string.trim")),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DGoalRequestU2DOptionU2D2U2DAction_2d862d697d {
    @SerialName("pause") PAUSE,
    @SerialName("resume") RESUME,
    @SerialName("clear") CLEAR,
}

@Serializable
data class RoutethreadU2DGoalRequestU2DOptionU2D2_43d29f1d5a(
    @SerialName("action") val action: RoutethreadU2DGoalRequestU2DOptionU2D2U2DAction_2d862d697d,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "RoutethreadU2DGoalRequestU2DOptionU2D2U2DAction_2d862d697d", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RoutethreadU2DGoalRequest_54c8350637.Serializer::class)
sealed interface RoutethreadU2DGoalRequest_54c8350637 {
    data class Option1(val value: RoutethreadU2DGoalRequestU2DOptionU2D1_f3c2d2c491) : RoutethreadU2DGoalRequest_54c8350637
    data class Option2(val value: RoutethreadU2DGoalRequestU2DOptionU2D2_43d29f1d5a) : RoutethreadU2DGoalRequest_54c8350637
    object Serializer : KSerializer<RoutethreadU2DGoalRequest_54c8350637> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutethreadU2DGoalRequest_54c8350637")
        override fun deserialize(decoder: Decoder): RoutethreadU2DGoalRequest_54c8350637 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutethreadU2DGoalRequest_54c8350637 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutethreadU2DGoalRequest_54c8350637>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("edit")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DGoalRequestU2DOptionU2D1_f3c2d2c491>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("pause"), JsonPrimitive("resume"), JsonPrimitive("clear")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DGoalRequestU2DOptionU2D2_43d29f1d5a>(element)) }
            return RemoteUnionCodec.single("RoutethreadU2DGoalRequest_54c8350637", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutethreadU2DGoalRequest_54c8350637) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutethreadU2DGoalRequest_54c8350637 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DGoalRequestU2DOptionU2D1_f3c2d2c491>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DGoalRequestU2DOptionU2D2_43d29f1d5a>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}
