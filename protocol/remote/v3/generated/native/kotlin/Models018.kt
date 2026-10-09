// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable(with = RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrown_208e24a5c5.Serializer::class)
sealed interface RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrown_208e24a5c5 {
    data class Option1(val value: RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrownU2DOptionU2D1_2fc59eb755) : RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrown_208e24a5c5
    data class Option2(val value: RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrownU2DOptionU2D2_1f06d1e589) : RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrown_208e24a5c5
    object Serializer : KSerializer<RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrown_208e24a5c5> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrown_208e24a5c5")
        override fun deserialize(decoder: Decoder): RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrown_208e24a5c5 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrown_208e24a5c5 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrown_208e24a5c5>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "source", listOf(JsonPrimitive("ai")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrownU2DOptionU2D1_2fc59eb755>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "source", listOf(JsonPrimitive("user")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrownU2DOptionU2D2_1f06d1e589>(element)) }
            return RemoteUnionCodec.single("RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrown_208e24a5c5", matches)
        }
        override fun serialize(encoder: Encoder, value: RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrown_208e24a5c5) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrown_208e24a5c5 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrownU2DOptionU2D1_2fc59eb755>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrownU2DOptionU2D2_1f06d1e589>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DStatus_c5efb303b3 {
    @SerialName("running") RUNNING,
    @SerialName("decided") DECIDED,
}

@Serializable
data class RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecord_1be5ac91cc(
    @SerialName("baseBranch") val baseBranch: String,
    @SerialName("baseCommit") val baseCommit: String,
    @SerialName("candidates") val candidates: List<RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCandidatesU2DItem_fc49e8b0b6>,
    @SerialName("createdAt") val createdAt: String,
    @SerialName("crown") val crown: RemoteField<RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrown_208e24a5c5> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("projectId") val projectId: String,
    @SerialName("prompt") val prompt: String,
    @SerialName("segments") val segments: RemoteField<List<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754>> = RemoteField.Missing,
    @SerialName("status") val status: RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DStatus_c5efb303b3,
    @SerialName("title") val title: String,
    @SerialName("updatedAt") val updatedAt: String,
    @SerialName("winnerThreadId") val winnerThreadId: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("baseBranch", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("baseCommit", "String", true, false, null, null, null, null, null, null, "^(?:[0-9a-f]{40}|[0-9a-f]{64})$", null, listOf()),
            RemoteFieldDescriptor("candidates", "List<RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCandidatesU2DItem_fc49e8b0b6>", true, false, null, null, null, null, 2, 8, null, null, listOf()),
            RemoteFieldDescriptor("createdAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("crown", "RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrown_208e24a5c5", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prompt", "String", true, false, null, null, 1, 100000, null, null, null, null, listOf()),
            RemoteFieldDescriptor("segments", "List<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DStatus_c5efb303b3", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("updatedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("winnerThreadId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteexperimentU2DCommandRequestU2DOptionU2D1U2DThreadsU2DItem_36af80931b(
    @SerialName("agentInstanceId") val agentInstanceId: RemoteField<String> = RemoteField.Missing,
    @SerialName("agentKind") val agentKind: String,
    @SerialName("config") val config: ProcedureconnectThreadVoiceRequestU2DConfig_c721e8abc0,
    @SerialName("parentThreadId") val parentThreadId: RemoteField<String> = RemoteField.Missing,
    @SerialName("presentationMode") val presentationMode: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6> = RemoteField.Missing,
    @SerialName("projectId") val projectId: String,
    @SerialName("threadId") val threadId: String,
    @SerialName("title") val title: String,
    @SerialName("worktreeBranch") val worktreeBranch: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentInstanceId", "String", false, false, null, null, 1, 120, null, null, "^[a-z0-9][a-z0-9_\\-:.]*$", null, listOf()),
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("config", "ProcedureconnectThreadVoiceRequestU2DConfig_c721e8abc0", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("parentThreadId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationMode", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeBranch", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteexperimentU2DCommandRequestU2DOptionU2D1_bd33bd820c(
    @SerialName("kind") val kind: RouteexperimentU2DCommandRequestU2DOptionU2D1U2DKind_1f45188862,
    @SerialName("record") val record: RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecord_1be5ac91cc,
    @SerialName("threads") val threads: List<RouteexperimentU2DCommandRequestU2DOptionU2D1U2DThreadsU2DItem_36af80931b>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteexperimentU2DCommandRequestU2DOptionU2D1U2DKind_1f45188862", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("record", "RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecord_1be5ac91cc", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threads", "List<RouteexperimentU2DCommandRequestU2DOptionU2D1U2DThreadsU2DItem_36af80931b>", true, false, null, null, null, null, 2, 8, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteexperimentU2DCommandRequestU2DOptionU2D2U2DKind_442f4438e0 {
    @SerialName("replace") REPLACE,
}

@Serializable
enum class RouteexperimentU2DCommandRequestU2DOptionU2D2U2DRowsU2DItemU2DRetire_7fe7804991 {
    @SerialName("done") DONE,
}

@Serializable
data class RouteexperimentU2DCommandRequestU2DOptionU2D2U2DRowsU2DItemU2DWorktreeU2DOptionU2D1_94e04fb40c(
    @SerialName("branch") val branch: String,
    @SerialName("path") val path: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("branch", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteexperimentU2DCommandRequestU2DOptionU2D2U2DRowsU2DItemU2DWorktree_9645658cf3 = RouteexperimentU2DCommandRequestU2DOptionU2D2U2DRowsU2DItemU2DWorktreeU2DOptionU2D1_94e04fb40c?

@Serializable
data class RouteexperimentU2DCommandRequestU2DOptionU2D2U2DRowsU2DItem_d6a8cd432c(
    @SerialName("fail") val fail: RemoteField<ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1> = RemoteField.Missing,
    @SerialName("groupName") val groupName: RemoteField<String> = RemoteField.Missing,
    @SerialName("retire") val retire: RemoteField<RouteexperimentU2DCommandRequestU2DOptionU2D2U2DRowsU2DItemU2DRetire_7fe7804991> = RemoteField.Missing,
    @SerialName("threadId") val threadId: String,
    @SerialName("worktree") val worktree: RemoteField<RouteexperimentU2DCommandRequestU2DOptionU2D2U2DRowsU2DItemU2DWorktreeU2DOptionU2D1_94e04fb40c> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("fail", "ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("groupName", "String", false, true, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("retire", "RouteexperimentU2DCommandRequestU2DOptionU2D2U2DRowsU2DItemU2DRetire_7fe7804991", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktree", "RouteexperimentU2DCommandRequestU2DOptionU2D2U2DRowsU2DItemU2DWorktreeU2DOptionU2D1_94e04fb40c", false, true, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteexperimentU2DCommandRequestU2DOptionU2D2_aafcd63530(
    @SerialName("kind") val kind: RouteexperimentU2DCommandRequestU2DOptionU2D2U2DKind_442f4438e0,
    @SerialName("record") val record: RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecord_1be5ac91cc,
    @SerialName("revision") val revision: String,
    @SerialName("rows") val rows: RemoteField<List<RouteexperimentU2DCommandRequestU2DOptionU2D2U2DRowsU2DItem_d6a8cd432c>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteexperimentU2DCommandRequestU2DOptionU2D2U2DKind_442f4438e0", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("record", "RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecord_1be5ac91cc", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("revision", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("rows", "List<RouteexperimentU2DCommandRequestU2DOptionU2D2U2DRowsU2DItem_d6a8cd432c>", false, false, null, null, null, null, null, 8, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteexperimentU2DCommandRequestU2DOptionU2D3U2DCandidateDisposition_60232db9c6 {
    @SerialName("delete") DELETE,
    @SerialName("release") RELEASE,
}

@Serializable
enum class RouteexperimentU2DCommandRequestU2DOptionU2D3U2DKind_034741cb26 {
    @SerialName("remove") REMOVE,
}

@Serializable
data class RouteexperimentU2DCommandRequestU2DOptionU2D3_c133c6f7b7(
    @SerialName("candidateDisposition") val candidateDisposition: RouteexperimentU2DCommandRequestU2DOptionU2D3U2DCandidateDisposition_60232db9c6,
    @SerialName("kind") val kind: RouteexperimentU2DCommandRequestU2DOptionU2D3U2DKind_034741cb26,
    @SerialName("revision") val revision: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("candidateDisposition", "RouteexperimentU2DCommandRequestU2DOptionU2D3U2DCandidateDisposition_60232db9c6", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RouteexperimentU2DCommandRequestU2DOptionU2D3U2DKind_034741cb26", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("revision", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RouteexperimentU2DCommandRequest_cb7ed3077b.Serializer::class)
sealed interface RouteexperimentU2DCommandRequest_cb7ed3077b {
    data class Option1(val value: RouteexperimentU2DCommandRequestU2DOptionU2D1_bd33bd820c) : RouteexperimentU2DCommandRequest_cb7ed3077b
    data class Option2(val value: RouteexperimentU2DCommandRequestU2DOptionU2D2_aafcd63530) : RouteexperimentU2DCommandRequest_cb7ed3077b
    data class Option3(val value: RouteexperimentU2DCommandRequestU2DOptionU2D3_c133c6f7b7) : RouteexperimentU2DCommandRequest_cb7ed3077b
    object Serializer : KSerializer<RouteexperimentU2DCommandRequest_cb7ed3077b> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouteexperimentU2DCommandRequest_cb7ed3077b")
        override fun deserialize(decoder: Decoder): RouteexperimentU2DCommandRequest_cb7ed3077b {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouteexperimentU2DCommandRequest_cb7ed3077b supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouteexperimentU2DCommandRequest_cb7ed3077b>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("create")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RouteexperimentU2DCommandRequestU2DOptionU2D1_bd33bd820c>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("replace")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RouteexperimentU2DCommandRequestU2DOptionU2D2_aafcd63530>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("remove")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RouteexperimentU2DCommandRequestU2DOptionU2D3_c133c6f7b7>(element)) }
            return RemoteUnionCodec.single("RouteexperimentU2DCommandRequest_cb7ed3077b", matches)
        }
        override fun serialize(encoder: Encoder, value: RouteexperimentU2DCommandRequest_cb7ed3077b) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouteexperimentU2DCommandRequest_cb7ed3077b supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RouteexperimentU2DCommandRequestU2DOptionU2D1_bd33bd820c>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RouteexperimentU2DCommandRequestU2DOptionU2D2_aafcd63530>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RouteexperimentU2DCommandRequestU2DOptionU2D3_c133c6f7b7>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class RouteexperimentU2DCommandResponse_ee8a6a8741(
    @SerialName("ok") val ok: ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1,
    @SerialName("revision") val revision: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("ok", "ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("revision", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteexperimentU2DStateResponseU2DExperiments_2f3c74eaed = Map<String, RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecord_1be5ac91cc>

@Serializable
data class RouteexperimentU2DStateResponse_acccf296d8(
    @SerialName("experiments") val experiments: RouteexperimentU2DStateResponseU2DExperiments_2f3c74eaed,
    @SerialName("revision") val revision: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("experiments", "RouteexperimentU2DStateResponseU2DExperiments_2f3c74eaed", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("revision", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutefileU2DMediaU2DTicketRequestU2DOptionU2D1U2DAccess_2d29c7255e {
    @SerialName("project") PROJECT,
}

@Serializable
data class RoutefileU2DMediaU2DTicketRequestU2DOptionU2D1_08f2de57fa(
    @SerialName("access") val access: RoutefileU2DMediaU2DTicketRequestU2DOptionU2D1U2DAccess_2d29c7255e,
    @SerialName("path") val path: String,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("access", "RoutefileU2DMediaU2DTicketRequestU2DOptionU2D1U2DAccess_2d29c7255e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, 4096, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutefileU2DMediaU2DTicketRequestU2DOptionU2D2U2DAccess_8423ce6905 {
    @SerialName("external") EXTERNAL,
}

@Serializable
data class RoutefileU2DMediaU2DTicketRequestU2DOptionU2D2_47a6c99702(
    @SerialName("access") val access: RoutefileU2DMediaU2DTicketRequestU2DOptionU2D2U2DAccess_8423ce6905,
    @SerialName("path") val path: String,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("access", "RoutefileU2DMediaU2DTicketRequestU2DOptionU2D2U2DAccess_8423ce6905", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, 4096, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RoutefileU2DMediaU2DTicketRequest_687b136989.Serializer::class)
sealed interface RoutefileU2DMediaU2DTicketRequest_687b136989 {
    data class Option1(val value: RoutefileU2DMediaU2DTicketRequestU2DOptionU2D1_08f2de57fa) : RoutefileU2DMediaU2DTicketRequest_687b136989
    data class Option2(val value: RoutefileU2DMediaU2DTicketRequestU2DOptionU2D2_47a6c99702) : RoutefileU2DMediaU2DTicketRequest_687b136989
    object Serializer : KSerializer<RoutefileU2DMediaU2DTicketRequest_687b136989> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutefileU2DMediaU2DTicketRequest_687b136989")
        override fun deserialize(decoder: Decoder): RoutefileU2DMediaU2DTicketRequest_687b136989 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutefileU2DMediaU2DTicketRequest_687b136989 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutefileU2DMediaU2DTicketRequest_687b136989>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "access", listOf(JsonPrimitive("project")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutefileU2DMediaU2DTicketRequestU2DOptionU2D1_08f2de57fa>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "access", listOf(JsonPrimitive("external")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RoutefileU2DMediaU2DTicketRequestU2DOptionU2D2_47a6c99702>(element)) }
            return RemoteUnionCodec.single("RoutefileU2DMediaU2DTicketRequest_687b136989", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutefileU2DMediaU2DTicketRequest_687b136989) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutefileU2DMediaU2DTicketRequest_687b136989 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutefileU2DMediaU2DTicketRequestU2DOptionU2D1_08f2de57fa>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RoutefileU2DMediaU2DTicketRequestU2DOptionU2D2_47a6c99702>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class RoutefileU2DMediaU2DTicketResponse_b53074e6b6(
    @SerialName("contentType") val contentType: String,
    @SerialName("expiresAt") val expiresAt: String,
    @SerialName("modifiedAtMs") val modifiedAtMs: Double,
    @SerialName("sizeBytes") val sizeBytes: Long,
    @SerialName("ticket") val ticket: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("contentType", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("expiresAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modifiedAtMs", "Double", true, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sizeBytes", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ticket", "String", true, false, null, null, null, null, null, null, "^pc_media_[A-Za-z0-9_-]{43}$", null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteforwardU2DEnterPath_32e268a4ad(
    @SerialName("forwardId") val forwardId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("forwardId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteforwardU2DEnterQuery_a6940e107d(
    @SerialName("fwt") val fwt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("fwt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutehostU2DDescribeResponseU2DCapabilities_9be4e34050(
    @SerialName("autoUpdate") val autoUpdate: Boolean,
    @SerialName("browserPanel") val browserPanel: Boolean,
    @SerialName("chromeBridge") val chromeBridge: Boolean,
    @SerialName("computerUse") val computerUse: Boolean,
    @SerialName("nativeSecrets") val nativeSecrets: Boolean,
    @SerialName("osNotifications") val osNotifications: Boolean,
    @SerialName("portForward") val portForward: Boolean,
    @SerialName("ssh") val ssh: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("autoUpdate", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("browserPanel", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("chromeBridge", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("computerUse", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("nativeSecrets", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("osNotifications", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("portForward", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ssh", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutehostU2DDescribeResponse_2843e0996b(
    @SerialName("capabilities") val capabilities: RoutehostU2DDescribeResponseU2DCapabilities_9be4e34050,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("capabilities", "RoutehostU2DDescribeResponseU2DCapabilities_9be4e34050", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D1U2DType_21c479c8de {
    @SerialName("checking") CHECKING,
}

@Serializable
data class RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D1_c6b76607f4(
    @SerialName("type") val type: RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D1U2DType_21c479c8de,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("type", "RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D1U2DType_21c479c8de", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D2U2DType_518b8374ac {
    @SerialName("update-available") UPDATEU2DAVAILABLE,
}

@Serializable
data class RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D2_ca0c8b8a7f(
    @SerialName("type") val type: RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D2U2DType_518b8374ac,
    @SerialName("version") val version: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("type", "RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D2U2DType_518b8374ac", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D3U2DType_5d5cc3aa0a {
    @SerialName("update-not-available") UPDATEU2DNOTU2DAVAILABLE,
}

@Serializable
data class RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D3_f04c7b0573(
    @SerialName("type") val type: RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D3U2DType_5d5cc3aa0a,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("type", "RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D3U2DType_5d5cc3aa0a", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
