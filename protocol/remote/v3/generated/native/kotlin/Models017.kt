// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1U2DActionsU2DItem_1544bc59ff(
    @SerialName("command") val command: String,
    @SerialName("icon") val icon: RemoteField<String> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("name") val name: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("command", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("icon", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1_cd124b21d9(
    @SerialName("actions") val actions: RemoteField<List<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1U2DActionsU2DItem_1544bc59ff>> = RemoteField.Missing,
    @SerialName("cleanupScript") val cleanupScript: RemoteField<String> = RemoteField.Missing,
    @SerialName("setupScript") val setupScript: RemoteField<String> = RemoteField.Missing,
    @SerialName("worktreeCopyPatterns") val worktreeCopyPatterns: RemoteField<List<String>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("actions", "List<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1U2DActionsU2DItem_1544bc59ff>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("cleanupScript", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("setupScript", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeCopyPatterns", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
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
    @SerialName("basePath") val basePath: RemoteField<String> = RemoteField.Missing,
    @SerialName("mode") val mode: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1U2DMode_953c573b19> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("basePath", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mode", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1U2DMode_953c573b19", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocation_137e14636e = RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1_7eb7e8f44a?

@Serializable
data class RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatch_352050e671(
    @SerialName("disabled") val disabled: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("mcpServers") val mcpServers: RemoteField<List<ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1>> = RemoteField.Missing,
    @SerialName("name") val name: RemoteField<String> = RemoteField.Missing,
    @SerialName("scripts") val scripts: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1_cd124b21d9> = RemoteField.Missing,
    @SerialName("searchSettings") val searchSettings: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1_3ccadafaab> = RemoteField.Missing,
    @SerialName("worktreeLocation") val worktreeLocation: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1_7eb7e8f44a> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("disabled", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mcpServers", "List<ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1>", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scripts", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1_cd124b21d9", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("searchSettings", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1_3ccadafaab", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeLocation", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1_7eb7e8f44a", false, true, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprojectU2DCommandRequestU2DOptionU2D4_4c08f56d93(
    @SerialName("kind") val kind: RouteprojectU2DCommandRequestU2DOptionU2D4U2DKind_cbc64d1458,
    @SerialName("patch") val patch: RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatch_352050e671,
    @SerialName("projectId") val projectId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DKind_cbc64d1458", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("patch", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatch_352050e671", true, false, null, null, null, null, null, null, null, null, listOf()),
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
    @SerialName("kind") val kind: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D2U2DKind_034741cb26,
    @SerialName("projectId") val projectId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D2U2DKind_034741cb26", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RouteprojectU2DCommandRequest_b3925744a8.Serializer::class)
sealed interface RouteprojectU2DCommandRequest_b3925744a8 {
    data class Option1(val value: RouteprojectU2DCommandRequestU2DOptionU2D1_9bb33af2f6) : RouteprojectU2DCommandRequest_b3925744a8
    data class Option2(val value: RouteprojectU2DCommandRequestU2DOptionU2D2_2b7595c3da) : RouteprojectU2DCommandRequest_b3925744a8
    data class Option3(val value: RouteprojectU2DCommandRequestU2DOptionU2D3_da66851500) : RouteprojectU2DCommandRequest_b3925744a8
    data class Option4(val value: RouteprojectU2DCommandRequestU2DOptionU2D4_4c08f56d93) : RouteprojectU2DCommandRequest_b3925744a8
    data class Option5(val value: RouteprojectU2DCommandRequestU2DOptionU2D5_27aa975674) : RouteprojectU2DCommandRequest_b3925744a8
    data class Option6(val value: RouteprojectU2DCommandRequestU2DOptionU2D6_37addcca5b) : RouteprojectU2DCommandRequest_b3925744a8
    object Serializer : KSerializer<RouteprojectU2DCommandRequest_b3925744a8> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouteprojectU2DCommandRequest_b3925744a8")
        override fun deserialize(decoder: Decoder): RouteprojectU2DCommandRequest_b3925744a8 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouteprojectU2DCommandRequest_b3925744a8 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouteprojectU2DCommandRequest_b3925744a8>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("add-existing")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D1_9bb33af2f6>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("create")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D2_2b7595c3da>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("clone")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D3_da66851500>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("update")))) { Option4(jsonDecoder.json.decodeFromJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D4_4c08f56d93>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("relocate")))) { Option5(jsonDecoder.json.decodeFromJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D5_27aa975674>(element)) }
            RemoteUnionCodec.tryOption(matches, 6, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("remove")))) { Option6(jsonDecoder.json.decodeFromJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D6_37addcca5b>(element)) }
            return RemoteUnionCodec.single("RouteprojectU2DCommandRequest_b3925744a8", matches)
        }
        override fun serialize(encoder: Encoder, value: RouteprojectU2DCommandRequest_b3925744a8) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouteprojectU2DCommandRequest_b3925744a8 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D1_9bb33af2f6>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D2_2b7595c3da>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D3_da66851500>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D4_4c08f56d93>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D5_27aa975674>(value.value)
                is Option6 -> jsonEncoder.json.encodeToJsonElement<RouteprojectU2DCommandRequestU2DOptionU2D6_37addcca5b>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class RouteprojectU2DCommandResponseU2DProjectU2DLastDraftConfig_8277cc81c1(
    @SerialName("agentKind") val agentKind: String,
    @SerialName("approvalPolicy") val approvalPolicy: RemoteField<String> = RemoteField.Missing,
    @SerialName("approvalsReviewer") val approvalsReviewer: RemoteField<String> = RemoteField.Missing,
    @SerialName("browserMcp") val browserMcp: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("chromeMcp") val chromeMcp: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("computerUse") val computerUse: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("contextSize") val contextSize: RemoteField<String> = RemoteField.Missing,
    @SerialName("crossagentMcp") val crossagentMcp: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("effort") val effort: RemoteField<String> = RemoteField.Missing,
    @SerialName("fast") val fast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("mode") val mode: RemoteField<ProcedurerollbackThreadConversationRequestU2DConfigU2DMode_01e21946e9> = RemoteField.Missing,
    @SerialName("model") val model: String,
    @SerialName("sandboxMode") val sandboxMode: RemoteField<String> = RemoteField.Missing,
    @SerialName("thinking") val thinking: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("worktreeMode") val worktreeMode: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("approvalPolicy", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("approvalsReviewer", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("browserMcp", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("chromeMcp", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("computerUse", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("contextSize", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("crossagentMcp", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("effort", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mode", "ProcedurerollbackThreadConversationRequestU2DConfigU2DMode_01e21946e9", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sandboxMode", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("thinking", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeMode", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprojectU2DCommandResponseU2DProjectU2DScripts_51d89a5cbb(
    @SerialName("actions") val actions: List<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1U2DActionsU2DItem_1544bc59ff>,
    @SerialName("cleanupScript") val cleanupScript: RemoteField<String> = RemoteField.Missing,
    @SerialName("setupScript") val setupScript: RemoteField<String> = RemoteField.Missing,
    @SerialName("worktreeCopyPatterns") val worktreeCopyPatterns: RemoteField<List<String>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("actions", "List<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1U2DActionsU2DItem_1544bc59ff>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("cleanupScript", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("setupScript", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeCopyPatterns", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprojectU2DCommandResponseU2DProject_1bee38d9c4(
    @SerialName("createdAt") val createdAt: String,
    @SerialName("disabled") val disabled: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("lastDraftConfig") val lastDraftConfig: RemoteField<RouteprojectU2DCommandResponseU2DProjectU2DLastDraftConfig_8277cc81c1> = RemoteField.Missing,
    @SerialName("location") val location: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("name") val name: String,
    @SerialName("remoteId") val remoteId: RemoteField<String> = RemoteField.Missing,
    @SerialName("remoteServerId") val remoteServerId: RemoteField<String> = RemoteField.Missing,
    @SerialName("scripts") val scripts: RemoteField<RouteprojectU2DCommandResponseU2DProjectU2DScripts_51d89a5cbb> = RemoteField.Missing,
    @SerialName("searchSettings") val searchSettings: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1_3ccadafaab> = RemoteField.Missing,
    @SerialName("workspaceId") val workspaceId: RemoteField<String> = RemoteField.Missing,
    @SerialName("worktreeLocation") val worktreeLocation: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1_7eb7e8f44a> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("createdAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabled", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastDraftConfig", "RouteprojectU2DCommandResponseU2DProjectU2DLastDraftConfig_8277cc81c1", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("location", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remoteId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remoteServerId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scripts", "RouteprojectU2DCommandResponseU2DProjectU2DScripts_51d89a5cbb", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("searchSettings", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1_3ccadafaab", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("workspaceId", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeLocation", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1_7eb7e8f44a", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprojectU2DCommandResponse_ebfedf7218(
    @SerialName("project") val project: RemoteField<RouteprojectU2DCommandResponseU2DProject_1bee38d9c4> = RemoteField.Missing,
    @SerialName("projects") val projects: List<RouteprojectU2DCommandResponseU2DProject_1bee38d9c4>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("project", "RouteprojectU2DCommandResponseU2DProject_1bee38d9c4", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projects", "List<RouteprojectU2DCommandResponseU2DProject_1bee38d9c4>", true, false, null, null, null, null, null, null, null, null, listOf()),
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
    @SerialName("text") val text: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("createdAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("done", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("text", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
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
    @SerialName("currency") val currency: String,
    @SerialName("estimated") val estimated: Boolean,
    @SerialName("period") val period: RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("amount", "Double", true, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("currency", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("estimated", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("period", "RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCredits_a39dd04104(
    @SerialName("balance") val balance: Double,
    @SerialName("currency") val currency: RemoteField<String> = RemoteField.Missing,
    @SerialName("label") val label: RemoteField<String> = RemoteField.Missing,
    @SerialName("unlimited") val unlimited: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("balance", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("currency", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
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
