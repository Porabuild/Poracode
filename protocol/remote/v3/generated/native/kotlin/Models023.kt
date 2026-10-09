// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RouteprojectU2DCommandRequestU2DOptionU2D9U2DLastDraftConfigU2DOptionU2D1_9fc43fe8df(
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
    @SerialName("selectionBinding") val selectionBinding: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBinding_a11ab76af3> = RemoteField.Missing,
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
            RemoteFieldDescriptor("selectionBinding", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBinding_a11ab76af3", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("thinking", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeMode", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteprojectU2DCommandRequestU2DOptionU2D9U2DLastDraftConfig_f46862cc21 = RouteprojectU2DCommandRequestU2DOptionU2D9U2DLastDraftConfigU2DOptionU2D1_9fc43fe8df?

@Serializable
data class RouteprojectU2DCommandRequestU2DOptionU2D9_f458170cbb(
    @SerialName("kind") val kind: RouteprojectU2DCommandRequestU2DOptionU2D9U2DKind_93f8fa8787,
    @SerialName("lastDraftConfig") val lastDraftConfig: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D9U2DLastDraftConfigU2DOptionU2D1_9fc43fe8df>,
    @SerialName("projectId") val projectId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteprojectU2DCommandRequestU2DOptionU2D9U2DKind_93f8fa8787", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastDraftConfig", "RouteprojectU2DCommandRequestU2DOptionU2D9U2DLastDraftConfigU2DOptionU2D1_9fc43fe8df", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RouteprojectU2DCommandRequest_06bba3bc49.Serializer::class)
sealed interface RouteprojectU2DCommandRequest_06bba3bc49 {
    data class Option1(val value: RouteprojectU2DCommandRequestU2DOptionU2D1_468209f9bb) : RouteprojectU2DCommandRequest_06bba3bc49
    data class Option2(val value: RouteprojectU2DCommandRequestU2DOptionU2D2_2b7595c3da) : RouteprojectU2DCommandRequest_06bba3bc49
    data class Option3(val value: RouteprojectU2DCommandRequestU2DOptionU2D3_da66851500) : RouteprojectU2DCommandRequest_06bba3bc49
    data class Option4(val value: RouteprojectU2DCommandRequestU2DOptionU2D4_9bdd26dd83) : RouteprojectU2DCommandRequest_06bba3bc49
    data class Option5(val value: RouteprojectU2DCommandRequestU2DOptionU2D5_27aa975674) : RouteprojectU2DCommandRequest_06bba3bc49
    data class Option6(val value: RouteprojectU2DCommandRequestU2DOptionU2D6_37addcca5b) : RouteprojectU2DCommandRequest_06bba3bc49
    data class Option7(val value: RouteprojectU2DCommandRequestU2DOptionU2D7_580efa06e9) : RouteprojectU2DCommandRequest_06bba3bc49
    data class Option8(val value: RouteprojectU2DCommandRequestU2DOptionU2D8_ebfa6f1c64) : RouteprojectU2DCommandRequest_06bba3bc49
    data class Option9(val value: RouteprojectU2DCommandRequestU2DOptionU2D9_f458170cbb) : RouteprojectU2DCommandRequest_06bba3bc49
    object Serializer : KSerializer<RouteprojectU2DCommandRequest_06bba3bc49> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouteprojectU2DCommandRequest_06bba3bc49")
        override fun deserialize(decoder: Decoder): RouteprojectU2DCommandRequest_06bba3bc49 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouteprojectU2DCommandRequest_06bba3bc49 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouteprojectU2DCommandRequest_06bba3bc49>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("add-existing")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D1_468209f9bb>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("create")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D2_2b7595c3da>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("clone")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D3_da66851500>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("update")))) { Option4(jsonDecoder.json.decodeFromJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D4_9bdd26dd83>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("relocate")))) { Option5(jsonDecoder.json.decodeFromJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D5_27aa975674>(element)) }
            RemoteUnionCodec.tryOption(matches, 6, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("remove")))) { Option6(jsonDecoder.json.decodeFromJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D6_37addcca5b>(element)) }
            RemoteUnionCodec.tryOption(matches, 7, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("reorder")))) { Option7(jsonDecoder.json.decodeFromJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D7_580efa06e9>(element)) }
            RemoteUnionCodec.tryOption(matches, 8, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("set-workspace")))) { Option8(jsonDecoder.json.decodeFromJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D8_ebfa6f1c64>(element)) }
            RemoteUnionCodec.tryOption(matches, 9, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("set-draft-config")))) { Option9(jsonDecoder.json.decodeFromJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D9_f458170cbb>(element)) }
            return RemoteUnionCodec.single("RouteprojectU2DCommandRequest_06bba3bc49", matches)
        }
        override fun serialize(encoder: Encoder, value: RouteprojectU2DCommandRequest_06bba3bc49) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouteprojectU2DCommandRequest_06bba3bc49 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D1_468209f9bb>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D2_2b7595c3da>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D3_da66851500>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D4_9bdd26dd83>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D5_27aa975674>(value.value)
                is Option6 -> jsonEncoder.json.encodeToJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D6_37addcca5b>(value.value)
                is Option7 -> jsonEncoder.json.encodeToJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D7_580efa06e9>(value.value)
                is Option8 -> jsonEncoder.json.encodeToJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D8_ebfa6f1c64>(value.value)
                is Option9 -> jsonEncoder.json.encodeToJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D9_f458170cbb>(value.value)
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
data class RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_c35a577df6(
    @SerialName("createdAt") val createdAt: String,
    @SerialName("disabled") val disabled: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("ghAccount") val ghAccount: RemoteField<ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff> = RemoteField.Missing,
    @SerialName("icon") val icon: RemoteField<String> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("lastDraftConfig") val lastDraftConfig: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D9U2DLastDraftConfigU2DOptionU2D1_9fc43fe8df> = RemoteField.Missing,
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
            RemoteFieldDescriptor("lastDraftConfig", "RouteprojectU2DCommandRequestU2DOptionU2D9U2DLastDraftConfigU2DOptionU2D1_9fc43fe8df", false, false, null, null, null, null, null, null, null, null, listOf()),
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
data class RouteprojectU2DCommandResponseU2DOptionU2D1_8f2b1c9a1a(
    @SerialName("created") val created: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("project") val project: RemoteField<RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_c35a577df6> = RemoteField.Missing,
    @SerialName("projects") val projects: List<RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_c35a577df6>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("created", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("project", "RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_c35a577df6", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projects", "List<RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_c35a577df6>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprojectU2DCommandResponseU2DOptionU2D2_d1525f33bd(
    @SerialName("created") val created: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("ok") val ok: ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1,
    @SerialName("project") val project: RemoteField<RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_c35a577df6> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("created", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ok", "ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("project", "RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_c35a577df6", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RouteprojectU2DCommandResponse_fcc27361f3.Serializer::class)
sealed interface RouteprojectU2DCommandResponse_fcc27361f3 {
    data class Option1(val value: RouteprojectU2DCommandResponseU2DOptionU2D1_8f2b1c9a1a) : RouteprojectU2DCommandResponse_fcc27361f3
    data class Option2(val value: RouteprojectU2DCommandResponseU2DOptionU2D2_d1525f33bd) : RouteprojectU2DCommandResponse_fcc27361f3
    object Serializer : KSerializer<RouteprojectU2DCommandResponse_fcc27361f3> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouteprojectU2DCommandResponse_fcc27361f3")
        override fun deserialize(decoder: Decoder): RouteprojectU2DCommandResponse_fcc27361f3 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouteprojectU2DCommandResponse_fcc27361f3 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouteprojectU2DCommandResponse_fcc27361f3>>()
            RemoteUnionCodec.tryOption(matches, 1, element is JsonObject) { Option1(jsonDecoder.json.decodeFromJsonElement<RouteprojectU2DCommandResponseU2DOptionU2D1_8f2b1c9a1a>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, element is JsonObject) { Option2(jsonDecoder.json.decodeFromJsonElement<RouteprojectU2DCommandResponseU2DOptionU2D2_d1525f33bd>(element)) }
            return RemoteUnionCodec.first("RouteprojectU2DCommandResponse_fcc27361f3", matches)
        }
        override fun serialize(encoder: Encoder, value: RouteprojectU2DCommandResponse_fcc27361f3) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouteprojectU2DCommandResponse_fcc27361f3 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RouteprojectU2DCommandResponseU2DOptionU2D1_8f2b1c9a1a>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RouteprojectU2DCommandResponseU2DOptionU2D2_d1525f33bd>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class RouteprojectU2DListQueryU2DMode_902ee7904a {
    @SerialName("page") PAGE,
    @SerialName("inventory") INVENTORY,
}

@Serializable
enum class RouteprojectU2DListQueryU2DOrder_42146530bc {
    @SerialName("manual") MANUAL,
    @SerialName("updated") UPDATED,
    @SerialName("created") CREATED,
}

@Serializable
enum class RouteprojectU2DListQueryU2DReads_4659e6d395 {
    @SerialName("bounded-v1") BOUNDEDU2DV1,
}

@Serializable
data class RouteprojectU2DListQuery_5e1b33a494(
    @SerialName("cursor") val cursor: RemoteField<String> = RemoteField.Missing,
    @SerialName("maxBytes") val maxBytes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("maxDecodeBytes") val maxDecodeBytes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("mode") val mode: RemoteField<RouteprojectU2DListQueryU2DMode_902ee7904a> = RemoteField.Missing,
    @SerialName("order") val order: RemoteField<RouteprojectU2DListQueryU2DOrder_42146530bc> = RemoteField.Missing,
    @SerialName("projectLimit") val projectLimit: RemoteField<Long> = RemoteField.Missing,
    @SerialName("reads") val reads: RemoteField<RouteprojectU2DListQueryU2DReads_4659e6d395> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cursor", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxBytes", "Long", false, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxDecodeBytes", "Long", false, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mode", "RouteprojectU2DListQueryU2DMode_902ee7904a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("order", "RouteprojectU2DListQueryU2DOrder_42146530bc", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLimit", "Long", false, false, 1.0, 200.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reads", "RouteprojectU2DListQueryU2DReads_4659e6d395", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprojectU2DListResponse_dc806546b8(
    @SerialName("inventoryFrontier") val inventoryFrontier: RemoteField<String> = RemoteField.Missing,
    @SerialName("projects") val projects: List<RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_c35a577df6>,
    @SerialName("projectsNextCursor") val projectsNextCursor: RemoteField<String>,
    @SerialName("reads") val reads: RouteprojectU2DListQueryU2DReads_4659e6d395,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("inventoryFrontier", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projects", "List<RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_c35a577df6>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectsNextCursor", "String", true, true, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reads", "RouteprojectU2DListQueryU2DReads_4659e6d395", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprojectU2DNotesU2DReadPath_05812a27bb(
    @SerialName("projectId") val projectId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1U2DDoc_6e4ad57825 = JsonElement?

@Serializable
data class RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1U2DTodosU2DItem_93ea777810(
    @SerialName("createdAt") val createdAt: String,
    @SerialName("done") val done: Boolean,
    @SerialName("id") val id: String,
    @SerialName("text") val text: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("createdAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("done", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("text", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1_bc92ea89e2(
    @SerialName("doc") val doc: RemoteField<JsonElement>,
    @SerialName("projectId") val projectId: String,
    @SerialName("todos") val todos: List<RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1U2DTodosU2DItem_93ea777810>,
    @SerialName("updatedAt") val updatedAt: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("doc", "JsonElement", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("todos", "List<RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1U2DTodosU2DItem_93ea777810>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("updatedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteprojectU2DNotesU2DReadResponseU2DNotes_6df40201d8 = RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1_bc92ea89e2?

@Serializable
data class RouteprojectU2DNotesU2DReadResponse_d1eba06c8a(
    @SerialName("notes") val notes: RemoteField<RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1_bc92ea89e2>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("notes", "RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1_bc92ea89e2", true, true, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprojectU2DNotesU2DWriteRequest_7b212bbb53(
    @SerialName("doc") val doc: RemoteField<JsonElement>,
    @SerialName("todos") val todos: List<RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1U2DTodosU2DItem_93ea777810>,
    @SerialName("updatedAt") val updatedAt: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("doc", "JsonElement", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("todos", "List<RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1U2DTodosU2DItem_93ea777810>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("updatedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprojectU2DSettingsResponse_c1417bffe5(
    @SerialName("mcpServers") val mcpServers: RemoteField<List<RoutemcpU2DSettingsU2DCommandResponseU2DServersU2DItem_d66267c393>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("mcpServers", "List<RoutemcpU2DSettingsU2DCommandResponseU2DServersU2DItem_d66267c393>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203 {
    @SerialName("today") TODAY,
    @SerialName("7d") N7D,
    @SerialName("30d") N30D,
    @SerialName("cycle") CYCLE,
}

@Serializable
data class RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCost_4147389dac(
    @SerialName("amount") val amount: Double,
    @SerialName("currency") val currency: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("estimated") val estimated: Boolean,
    @SerialName("period") val period: RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("amount", "Double", true, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("currency", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("estimated", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("period", "RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCredits_a39dd04104(
    @SerialName("balance") val balance: Double,
    @SerialName("currency") val currency: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("label") val label: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("unlimited") val unlimited: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("balance", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("currency", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("unlimited", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DStatus_3466b9b69c {
    @SerialName("ok") OK,
    @SerialName("auth-missing") AUTHU2DMISSING,
    @SerialName("app-not-running") APPU2DNOTU2DRUNNING,
    @SerialName("rate-limited") RATEU2DLIMITED,
    @SerialName("quota-hit") QUOTAU2DHIT,
    @SerialName("unsupported") UNSUPPORTED,
    @SerialName("error") ERROR,
}

@Serializable
data class RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DTokens_36a14ea6cf(
    @SerialName("cacheRead") val cacheRead: RemoteField<Double> = RemoteField.Missing,
    @SerialName("cacheWrite") val cacheWrite: RemoteField<Double> = RemoteField.Missing,
    @SerialName("input") val input: RemoteField<Double> = RemoteField.Missing,
    @SerialName("output") val output: RemoteField<Double> = RemoteField.Missing,
    @SerialName("period") val period: RemoteField<RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203> = RemoteField.Missing,
    @SerialName("total") val total: RemoteField<Double> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cacheRead", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("cacheWrite", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("input", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("output", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("period", "RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("total", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
