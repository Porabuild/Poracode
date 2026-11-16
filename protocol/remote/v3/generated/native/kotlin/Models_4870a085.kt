// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class ProcedureghPollPullRequestsResultU2DOptionU2D2_938eaedae8(
    @SerialName("problem") val problem: ProcedureghPollPullRequestsResultU2DOptionU2D2U2DProblem_a663eabb01,
    @SerialName("status") val status: ProcedureghPollPullRequestsResultU2DOptionU2D2U2DStatus_45cf23babe,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("problem", "ProcedureghPollPullRequestsResultU2DOptionU2D2U2DProblem_a663eabb01", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedureghPollPullRequestsResultU2DOptionU2D2U2DStatus_45cf23babe", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedureghPollPullRequestsResult_729d8ec224.Serializer::class)
sealed interface ProcedureghPollPullRequestsResult_729d8ec224 {
    data class Option1(val value: ProcedureghPollPullRequestsResultU2DOptionU2D1_cbf9eddea4) : ProcedureghPollPullRequestsResult_729d8ec224
    data class Option2(val value: ProcedureghPollPullRequestsResultU2DOptionU2D2_938eaedae8) : ProcedureghPollPullRequestsResult_729d8ec224
    object Serializer : KSerializer<ProcedureghPollPullRequestsResult_729d8ec224> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedureghPollPullRequestsResult_729d8ec224")
        override fun deserialize(decoder: Decoder): ProcedureghPollPullRequestsResult_729d8ec224 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedureghPollPullRequestsResult_729d8ec224 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedureghPollPullRequestsResult_729d8ec224>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("ready")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedureghPollPullRequestsResultU2DOptionU2D1_cbf9eddea4>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("blocked")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedureghPollPullRequestsResultU2DOptionU2D2_938eaedae8>(element)) }
            return RemoteUnionCodec.single("ProcedureghPollPullRequestsResult_729d8ec224", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedureghPollPullRequestsResult_729d8ec224) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedureghPollPullRequestsResult_729d8ec224 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedureghPollPullRequestsResultU2DOptionU2D1_cbf9eddea4>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedureghPollPullRequestsResultU2DOptionU2D2_938eaedae8>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class ProcedureghPostPrCommentRequest_189279e83c(
    @SerialName("body") val body: String,
    @SerialName("prNumber") val prNumber: Long,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("body", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prNumber", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghRerunWorkflowRunRequest_4492692f82(
    @SerialName("failedOnly") val failedOnly: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("ghAccount") val ghAccount: RemoteField<ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("runId") val runId: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("failedOnly", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ghAccount", "ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runId", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghSubmitPrReviewRequest_09cbc76a2a(
    @SerialName("body") val body: RemoteField<String> = RemoteField.Missing,
    @SerialName("decision") val decision: ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DReviewDecisionsU2DItem_c0551fbf08,
    @SerialName("prNumber") val prNumber: Long,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("body", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("decision", "ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DReviewDecisionsU2DItem_c0551fbf08", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prNumber", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghUpdatePrBranchRequest_e96ebdc8b8(
    @SerialName("prNumber") val prNumber: Long,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("rebase") val rebase: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("prNumber", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("rebase", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitAbortMergeRequest_64dd00a3a5(
    @SerialName("reapplyStashCommit") val reapplyStashCommit: RemoteField<String> = RemoteField.Missing,
    @SerialName("worktreeLocation") val worktreeLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("reapplyStashCommit", "String", false, false, null, null, null, null, null, null, "^(?:[0-9a-f]{40}|[0-9a-f]{64})$", null, listOf()),
            RemoteFieldDescriptor("worktreeLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitAbortMergeResult_5bb2b4a4a0(
    @SerialName("stashPreserved") val stashPreserved: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("stashReapplied") val stashReapplied: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("stashPreserved", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("stashReapplied", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitAddRemoteRequest_024bd48f0f(
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("remote") val remote: String,
    @SerialName("url") val url: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remote", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
