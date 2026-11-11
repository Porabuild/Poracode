// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
enum class ProcedureensureThreadRunningRequestU2DProviderSwitchU2DPreviousStatus_8c61ed237d {
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
data class ProcedureensureThreadRunningRequestU2DProviderSwitch_06461b1492(
    @SerialName("contextStrategy") val contextStrategy: RemoteField<ProcedureensureThreadRunningRequestU2DProviderSwitchU2DContextStrategy_9136743498> = RemoteField.Missing,
    @SerialName("fromAgentKind") val fromAgentKind: String,
    @SerialName("handoffItemId") val handoffItemId: RemoteField<String> = RemoteField.Missing,
    @SerialName("previousStatus") val previousStatus: RemoteField<ProcedureensureThreadRunningRequestU2DProviderSwitchU2DPreviousStatus_8c61ed237d> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("contextStrategy", "ProcedureensureThreadRunningRequestU2DProviderSwitchU2DContextStrategy_9136743498", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fromAgentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("handoffItemId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("previousStatus", "ProcedureensureThreadRunningRequestU2DProviderSwitchU2DPreviousStatus_8c61ed237d", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureensureThreadRunningRequestU2DQuestionAnswerU2DQuestionsU2DItemU2DSelectedU2DItem_58a226c992(
    @SerialName("description") val description: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("label") val label: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("description", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureensureThreadRunningRequestU2DQuestionAnswerU2DQuestionsU2DItem_63cf2bb531(
    @SerialName("customAnswer") val customAnswer: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("header") val header: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("question") val question: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("selected") val selected: List<ProcedureensureThreadRunningRequestU2DQuestionAnswerU2DQuestionsU2DItemU2DSelectedU2DItem_58a226c992>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("customAnswer", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("header", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("question", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("selected", "List<ProcedureensureThreadRunningRequestU2DQuestionAnswerU2DQuestionsU2DItemU2DSelectedU2DItem_58a226c992>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureensureThreadRunningRequestU2DQuestionAnswer_4d59c815df(
    @SerialName("questions") val questions: List<ProcedureensureThreadRunningRequestU2DQuestionAnswerU2DQuestionsU2DItem_63cf2bb531>,
    @SerialName("sourceItemId") val sourceItemId: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("questions", "List<ProcedureensureThreadRunningRequestU2DQuestionAnswerU2DQuestionsU2DItem_63cf2bb531>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sourceItemId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureensureThreadRunningRequestU2DSessionRef_25df6feb29(
    @SerialName("discoveredAt") val discoveredAt: String,
    @SerialName("executionIdentity") val executionIdentity: RemoteField<String> = RemoteField.Missing,
    @SerialName("providerSessionId") val providerSessionId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("discoveredAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("executionIdentity", "String", false, false, null, null, 1, 256, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerSessionId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureensureThreadRunningRequest_6e1a462e69(
    @SerialName("agentInstanceId") val agentInstanceId: RemoteField<String> = RemoteField.Missing,
    @SerialName("agentKind") val agentKind: String,
    @SerialName("clientContext") val clientContext: RemoteField<ProcedureensureThreadRunningRequestU2DClientContext_b23ca9582f> = RemoteField.Missing,
    @SerialName("config") val config: ProcedureconnectThreadVoiceRequestU2DConfig_281d24bbba,
    @SerialName("disabledBuiltInMcpServerIds") val disabledBuiltInMcpServerIds: RemoteField<List<ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpServerIdsU2DItem_13f43aaaf5>> = RemoteField.Missing,
    @SerialName("disabledBuiltInMcpTools") val disabledBuiltInMcpTools: RemoteField<ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpTools_fdad254a8b> = RemoteField.Missing,
    @SerialName("initialInstructions") val initialInstructions: RemoteField<String> = RemoteField.Missing,
    @SerialName("initialSize") val initialSize: ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09,
    @SerialName("invariantDisabledBuiltInMcpServerIds") val invariantDisabledBuiltInMcpServerIds: RemoteField<List<ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpServerIdsU2DItem_13f43aaaf5>> = RemoteField.Missing,
    @SerialName("mcpServers") val mcpServers: RemoteField<List<ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1>> = RemoteField.Missing,
    @SerialName("mentionHandoff") val mentionHandoff: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1> = RemoteField.Missing,
    @SerialName("presentationMode") val presentationMode: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("projectPluginOverrides") val projectPluginOverrides: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DMcpServerOverrides_6db96506f2> = RemoteField.Missing,
    @SerialName("prompt") val prompt: RemoteField<String> = RemoteField.Missing,
    @SerialName("providerSwitch") val providerSwitch: RemoteField<ProcedureensureThreadRunningRequestU2DProviderSwitch_06461b1492> = RemoteField.Missing,
    @SerialName("questionAnswer") val questionAnswer: RemoteField<ProcedureensureThreadRunningRequestU2DQuestionAnswer_4d59c815df> = RemoteField.Missing,
    @SerialName("segments") val segments: RemoteField<List<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754>> = RemoteField.Missing,
    @SerialName("sessionRef") val sessionRef: RemoteField<ProcedureensureThreadRunningRequestU2DSessionRef_25df6feb29> = RemoteField.Missing,
    @SerialName("threadId") val threadId: RemoteField<String> = RemoteField.Missing,
    @SerialName("userMessageItemId") val userMessageItemId: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentInstanceId", "String", false, false, null, null, 1, 120, null, null, "^[a-z0-9][a-z0-9_\\-:.]*$", null, listOf()),
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("clientContext", "ProcedureensureThreadRunningRequestU2DClientContext_b23ca9582f", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("config", "ProcedureconnectThreadVoiceRequestU2DConfig_281d24bbba", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledBuiltInMcpServerIds", "List<ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpServerIdsU2DItem_13f43aaaf5>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledBuiltInMcpTools", "ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpTools_fdad254a8b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("initialInstructions", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("initialSize", "ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("invariantDisabledBuiltInMcpServerIds", "List<ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpServerIdsU2DItem_13f43aaaf5>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mcpServers", "List<ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mentionHandoff", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationMode", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectPluginOverrides", "ProcedureconnectThreadVoiceRequestU2DConfigU2DMcpServerOverrides_6db96506f2", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prompt", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerSwitch", "ProcedureensureThreadRunningRequestU2DProviderSwitch_06461b1492", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("questionAnswer", "ProcedureensureThreadRunningRequestU2DQuestionAnswer_4d59c815df", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("segments", "List<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sessionRef", "ProcedureensureThreadRunningRequestU2DSessionRef_25df6feb29", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("userMessageItemId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf("thread.start.provider-switch"))
    }
}

@Serializable
data class ProcedureextractContextRequestU2DSelection_32c3720f64(
    @SerialName("contextSize") val contextSize: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("effort") val effort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("fast") val fast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("model") val model: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("selectionBinding") val selectionBinding: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBinding_a11ab76af3> = RemoteField.Missing,
    @SerialName("thinking") val thinking: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("contextSize", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("effort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("selectionBinding", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBinding_a11ab76af3", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("thinking", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureextractContextRequest_963874114b(
    @SerialName("agentKind") val agentKind: String,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("selection") val selection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = RemoteField.Missing,
    @SerialName("sessionRef") val sessionRef: ProcedureensureThreadRunningRequestU2DSessionRef_25df6feb29,
    @SerialName("threadId") val threadId: String,
    @SerialName("worktreePath") val worktreePath: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("selection", "ProcedureextractContextRequestU2DSelection_32c3720f64", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sessionRef", "ProcedureensureThreadRunningRequestU2DSessionRef_25df6feb29", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureextractContextResultU2DContentKind_5aa9e435f6 {
    @SerialName("summary") SUMMARY,
    @SerialName("transcript") TRANSCRIPT,
}

@Serializable
data class ProcedureextractContextResult_2a2641f29a(
    @SerialName("contentKind") val contentKind: RemoteField<ProcedureextractContextResultU2DContentKind_5aa9e435f6> = RemoteField.Missing,
    @SerialName("extractedAt") val extractedAt: String,
    @SerialName("sourceProvider") val sourceProvider: String,
    @SerialName("sourceSessionId") val sourceSessionId: String,
    @SerialName("summary") val summary: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("worktreePath") val worktreePath: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("contentKind", "ProcedureextractContextResultU2DContentKind_5aa9e435f6", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("extractedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sourceProvider", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sourceSessionId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("summary", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
