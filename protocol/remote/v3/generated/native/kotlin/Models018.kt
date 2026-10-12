// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RouteenvironmentU2DTrustU2DProbeResponse_45d8e163d2(
    @SerialName("fingerprint") val fingerprint: String,
    @SerialName("keyType") val keyType: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("fingerprint", "String", true, false, null, null, null, null, null, null, "^SHA256:[A-Za-z0-9+/]{43}$", null, listOf()),
            RemoteFieldDescriptor("keyType", "String", true, false, null, null, 1, 64, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteenvironmentU2DUpdateRequestU2DPatchU2DCredentialRef_c223d7ef6a = String?

typealias RouteenvironmentU2DUpdateRequestU2DPatchU2DPort_6db9f33ca9 = Long?

@Serializable
data class RouteenvironmentU2DUpdateRequestU2DPatch_2a5c67603f(
    @SerialName("credentialRef") val credentialRef: RemoteField<String> = RemoteField.Missing,
    @SerialName("desired") val desired: RemoteField<RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DDesired_abff99d05c> = RemoteField.Missing,
    @SerialName("label") val label: RemoteField<String> = RemoteField.Missing,
    @SerialName("port") val port: RemoteField<Long> = RemoteField.Missing,
    @SerialName("target") val target: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("credentialRef", "String", false, true, null, null, 1, 128, null, null, "^(?!.*\\.\\.)[A-Za-z0-9][A-Za-z0-9._:-]*$", null, listOf()),
            RemoteFieldDescriptor("desired", "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DDesired_abff99d05c", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", false, false, null, null, 1, 100, null, null, null, null, listOf("string.trim")),
            RemoteFieldDescriptor("port", "Long", false, true, 1.0, 65535.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("target", "String", false, false, null, null, 1, 255, null, null, "^(?!-)(?:[^\\s@/:]+@)?[^\\s@/:]+$", null, listOf("string.trim")),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DUpdateRequest_5760038b3a(
    @SerialName("expectedRevision") val expectedRevision: Long,
    @SerialName("patch") val patch: RouteenvironmentU2DUpdateRequestU2DPatch_2a5c67603f,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("expectedRevision", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("patch", "RouteenvironmentU2DUpdateRequestU2DPatch_2a5c67603f", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DWebsocketU2DTicketResponse_b9dfb5a053(
    @SerialName("expiresAt") val expiresAt: String,
    @SerialName("ticket") val ticket: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("expiresAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ticket", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteexperimentU2DCommandPath_84af3e9751(
    @SerialName("experimentId") val experimentId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("experimentId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteexperimentU2DCommandRequestU2DOptionU2D1U2DKind_1f45188862 {
    @SerialName("create") CREATE,
}

@Serializable
enum class RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCandidatesU2DItemU2DWorktreeState_a8b4490d4a {
    @SerialName("pending") PENDING,
    @SerialName("owned") OWNED,
    @SerialName("removed") REMOVED,
}

@Serializable
data class RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCandidatesU2DItem_fc49e8b0b6(
    @SerialName("agentKind") val agentKind: String,
    @SerialName("agentLabel") val agentLabel: RemoteField<String> = RemoteField.Missing,
    @SerialName("effort") val effort: RemoteField<String> = RemoteField.Missing,
    @SerialName("fast") val fast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("model") val model: RemoteField<String> = RemoteField.Missing,
    @SerialName("threadId") val threadId: String,
    @SerialName("worktreeBranch") val worktreeBranch: String,
    @SerialName("worktreeOwnerToken") val worktreeOwnerToken: String,
    @SerialName("worktreePath") val worktreePath: RemoteField<String> = RemoteField.Missing,
    @SerialName("worktreeState") val worktreeState: RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCandidatesU2DItemU2DWorktreeState_a8b4490d4a,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("agentLabel", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("effort", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeBranch", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeOwnerToken", "String", true, false, null, null, 1, 128, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeState", "RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCandidatesU2DItemU2DWorktreeState_a8b4490d4a", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrownU2DOptionU2D1U2DAssessmentsU2DItem_27d9340da4(
    @SerialName("rationale") val rationale: String,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("rationale", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrownU2DOptionU2D1U2DComparisonMode_1124eb24dd {
    @SerialName("changes") CHANGES,
    @SerialName("responses") RESPONSES,
}

@Serializable
enum class RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrownU2DOptionU2D1U2DSource_d4e60a4c33 {
    @SerialName("ai") AI,
}

@Serializable
data class RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrownU2DOptionU2D1_2fc59eb755(
    @SerialName("assessments") val assessments: RemoteField<List<RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrownU2DOptionU2D1U2DAssessmentsU2DItem_27d9340da4>> = RemoteField.Missing,
    @SerialName("comparisonMode") val comparisonMode: RemoteField<RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrownU2DOptionU2D1U2DComparisonMode_1124eb24dd> = RemoteField.Missing,
    @SerialName("createdAt") val createdAt: String,
    @SerialName("modelLabel") val modelLabel: RemoteField<String> = RemoteField.Missing,
    @SerialName("rationale") val rationale: String,
    @SerialName("snapshotHash") val snapshotHash: RemoteField<String> = RemoteField.Missing,
    @SerialName("source") val source: RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrownU2DOptionU2D1U2DSource_d4e60a4c33,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("assessments", "List<RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrownU2DOptionU2D1U2DAssessmentsU2DItem_27d9340da4>", false, false, null, null, null, null, 2, null, null, null, listOf()),
            RemoteFieldDescriptor("comparisonMode", "RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrownU2DOptionU2D1U2DComparisonMode_1124eb24dd", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("createdAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modelLabel", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("rationale", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("snapshotHash", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("source", "RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrownU2DOptionU2D1U2DSource_d4e60a4c33", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrownU2DOptionU2D2_1f06d1e589(
    @SerialName("createdAt") val createdAt: String,
    @SerialName("modelLabel") val modelLabel: RemoteField<JsonElement> = RemoteField.Missing,
    @SerialName("rationale") val rationale: RemoteField<JsonElement> = RemoteField.Missing,
    @SerialName("snapshotHash") val snapshotHash: RemoteField<String> = RemoteField.Missing,
    @SerialName("source") val source: ProcedurediscoverExternalMcpServersRequestU2DOptionU2D1U2DSourceScope_6a2600edfb,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("createdAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modelLabel", "JsonElement", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("rationale", "JsonElement", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("snapshotHash", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("source", "ProcedurediscoverExternalMcpServersRequestU2DOptionU2D1U2DSourceScope_6a2600edfb", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

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
data class RouteexperimentU2DCommandRequestU2DOptionU2D1U2DThreadsU2DItem_d421f334c8(
    @SerialName("agentInstanceId") val agentInstanceId: RemoteField<String> = RemoteField.Missing,
    @SerialName("agentKind") val agentKind: String,
    @SerialName("config") val config: ProcedureconnectThreadVoiceRequestU2DConfig_2c97b9d429,
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
            RemoteFieldDescriptor("config", "ProcedureconnectThreadVoiceRequestU2DConfig_2c97b9d429", true, false, null, null, null, null, null, null, null, null, listOf()),
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
data class RouteexperimentU2DCommandRequestU2DOptionU2D1_f30afbf29e(
    @SerialName("kind") val kind: RouteexperimentU2DCommandRequestU2DOptionU2D1U2DKind_1f45188862,
    @SerialName("record") val record: RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecord_1be5ac91cc,
    @SerialName("threads") val threads: List<RouteexperimentU2DCommandRequestU2DOptionU2D1U2DThreadsU2DItem_d421f334c8>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteexperimentU2DCommandRequestU2DOptionU2D1U2DKind_1f45188862", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("record", "RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecord_1be5ac91cc", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threads", "List<RouteexperimentU2DCommandRequestU2DOptionU2D1U2DThreadsU2DItem_d421f334c8>", true, false, null, null, null, null, 2, 8, null, null, listOf()),
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

@Serializable(with = RouteexperimentU2DCommandRequest_1cd4b83478.Serializer::class)
sealed interface RouteexperimentU2DCommandRequest_1cd4b83478 {
    data class Option1(val value: RouteexperimentU2DCommandRequestU2DOptionU2D1_f30afbf29e) : RouteexperimentU2DCommandRequest_1cd4b83478
    data class Option2(val value: RouteexperimentU2DCommandRequestU2DOptionU2D2_aafcd63530) : RouteexperimentU2DCommandRequest_1cd4b83478
    data class Option3(val value: RouteexperimentU2DCommandRequestU2DOptionU2D3_c133c6f7b7) : RouteexperimentU2DCommandRequest_1cd4b83478
    object Serializer : KSerializer<RouteexperimentU2DCommandRequest_1cd4b83478> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouteexperimentU2DCommandRequest_1cd4b83478")
        override fun deserialize(decoder: Decoder): RouteexperimentU2DCommandRequest_1cd4b83478 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouteexperimentU2DCommandRequest_1cd4b83478 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouteexperimentU2DCommandRequest_1cd4b83478>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("create")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RouteexperimentU2DCommandRequestU2DOptionU2D1_f30afbf29e>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("replace")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RouteexperimentU2DCommandRequestU2DOptionU2D2_aafcd63530>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("remove")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RouteexperimentU2DCommandRequestU2DOptionU2D3_c133c6f7b7>(element)) }
            return RemoteUnionCodec.single("RouteexperimentU2DCommandRequest_1cd4b83478", matches)
        }
        override fun serialize(encoder: Encoder, value: RouteexperimentU2DCommandRequest_1cd4b83478) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouteexperimentU2DCommandRequest_1cd4b83478 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RouteexperimentU2DCommandRequestU2DOptionU2D1_f30afbf29e>(value.value)
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
