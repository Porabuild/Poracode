// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class ProcedureforgeGetPrFilesResult_24cb35c8f9(
    @SerialName("files") val files: List<ProcedureforgeGetPrFilesResultU2DFilesU2DItem_63c18b52ff>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("files", "List<ProcedureforgeGetPrFilesResultU2DFilesU2DItem_63c18b52ff>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedureforgeGetPrForBranchResult_3958c7beb6 = ProcedureforgeCreatePrResult_ea7fc856bb?

@Serializable
data class ProcedureforgeGetPrReviewCommentsResult_36ca2b1ea6(
    @SerialName("comments") val comments: List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DCommentsU2DItem_cb95bf43ec>,
    @SerialName("threads") val threads: List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DReviewThreadsU2DItem_bf61c59756>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("comments", "List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DCommentsU2DItem_cb95bf43ec>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threads", "List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DReviewThreadsU2DItem_bf61c59756>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureforgeGetPrReviewGuideResultU2DGuideU2DOptionU2D1U2DStopsU2DItemU2DExcerptsU2DItemU2DSide_598c25a2e6 {
    @SerialName("LEFT") LEFT,
    @SerialName("RIGHT") RIGHT,
}

@Serializable
data class ProcedureforgeGetPrReviewGuideResultU2DGuideU2DOptionU2D1U2DStopsU2DItemU2DExcerptsU2DItem_5894304151(
    @SerialName("endLine") val endLine: Long,
    @SerialName("path") val path: String,
    @SerialName("side") val side: ProcedureforgeGetPrReviewGuideResultU2DGuideU2DOptionU2D1U2DStopsU2DItemU2DExcerptsU2DItemU2DSide_598c25a2e6,
    @SerialName("startLine") val startLine: Long,
    @SerialName("text") val text: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("endLine", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("side", "ProcedureforgeGetPrReviewGuideResultU2DGuideU2DOptionU2D1U2DStopsU2DItemU2DExcerptsU2DItemU2DSide_598c25a2e6", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("startLine", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("text", "String", true, false, null, null, 1, 32000, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureforgeGetPrReviewGuideResultU2DGuideU2DOptionU2D1U2DStopsU2DItem_b03a8b1fac(
    @SerialName("body") val body: String,
    @SerialName("excerpts") val excerpts: List<ProcedureforgeGetPrReviewGuideResultU2DGuideU2DOptionU2D1U2DStopsU2DItemU2DExcerptsU2DItem_5894304151>,
    @SerialName("files") val files: List<String>,
    @SerialName("lookClosely") val lookClosely: Boolean,
    @SerialName("questions") val questions: List<String>,
    @SerialName("title") val title: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("body", "String", true, false, null, null, 1, 16000, null, null, null, null, listOf()),
            RemoteFieldDescriptor("excerpts", "List<ProcedureforgeGetPrReviewGuideResultU2DGuideU2DOptionU2D1U2DStopsU2DItemU2DExcerptsU2DItem_5894304151>", true, false, null, null, null, null, null, 30, null, null, listOf()),
            RemoteFieldDescriptor("files", "List<String>", true, false, null, null, null, null, 1, null, null, null, listOf()),
            RemoteFieldDescriptor("lookClosely", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("questions", "List<String>", true, false, null, null, null, null, null, 5, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", true, false, null, null, 1, 500, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureforgeGetPrReviewGuideResultU2DGuideU2DOptionU2D1_160c1ab9b7(
    @SerialName("createdAt") val createdAt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("fingerprint") val fingerprint: String,
    @SerialName("model") val model: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("stops") val stops: List<ProcedureforgeGetPrReviewGuideResultU2DGuideU2DOptionU2D1U2DStopsU2DItem_b03a8b1fac>,
    @SerialName("summary") val summary: String,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("createdAt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fingerprint", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("stops", "List<ProcedureforgeGetPrReviewGuideResultU2DGuideU2DOptionU2D1U2DStopsU2DItem_b03a8b1fac>", true, false, null, null, null, null, 1, 500, null, null, listOf()),
            RemoteFieldDescriptor("summary", "String", true, false, null, null, 1, 16000, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedureforgeGetPrReviewGuideResultU2DGuide_c591e31c38 = ProcedureforgeGetPrReviewGuideResultU2DGuideU2DOptionU2D1_160c1ab9b7?

@Serializable
enum class ProcedureforgeGetPrReviewGuideResultU2DStatus_e25509dad8 {
    @SerialName("empty") EMPTY,
    @SerialName("generating") GENERATING,
    @SerialName("ready") READY,
    @SerialName("failed") FAILED,
}

@Serializable
data class ProcedureforgeGetPrReviewGuideResult_5915279035(
    @SerialName("diffHash") val diffHash: RemoteField<String> = RemoteField.Missing,
    @SerialName("guide") val guide: RemoteField<ProcedureforgeGetPrReviewGuideResultU2DGuideU2DOptionU2D1_160c1ab9b7>,
    @SerialName("stale") val stale: Boolean,
    @SerialName("status") val status: ProcedureforgeGetPrReviewGuideResultU2DStatus_e25509dad8,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("diffHash", "String", false, false, null, null, null, null, null, null, "^[a-f0-9]{64}$", null, listOf()),
            RemoteFieldDescriptor("guide", "ProcedureforgeGetPrReviewGuideResultU2DGuideU2DOptionU2D1_160c1ab9b7", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("stale", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedureforgeGetPrReviewGuideResultU2DStatus_e25509dad8", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureforgeGetPrViewedFilesResultU2DCurrentFilesU2DItem_cac7783fa7(
    @SerialName("fingerprint") val fingerprint: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("path") val path: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("fingerprint", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureforgeGetPrViewedFilesResult_6c5abb4203(
    @SerialName("currentFiles") val currentFiles: RemoteField<List<ProcedureforgeGetPrViewedFilesResultU2DCurrentFilesU2DItem_cac7783fa7>> = RemoteField.Missing,
    @SerialName("diffHash") val diffHash: RemoteField<String> = RemoteField.Missing,
    @SerialName("files") val files: List<ProcedureforgeGetPrViewedFilesResultU2DCurrentFilesU2DItem_cac7783fa7>,
    @SerialName("storage") val storage: ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DViewedFiles_ae682752b1,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("currentFiles", "List<ProcedureforgeGetPrViewedFilesResultU2DCurrentFilesU2DItem_cac7783fa7>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("diffHash", "String", false, false, null, null, null, null, null, null, "^[a-f0-9]{64}$", null, listOf()),
            RemoteFieldDescriptor("files", "List<ProcedureforgeGetPrViewedFilesResultU2DCurrentFilesU2DItem_cac7783fa7>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("storage", "ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DViewedFiles_ae682752b1", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureforgeGetRepositoryRequest_09c88cb14a(
    @SerialName("forgeAccount") val forgeAccount: RemoteField<ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b> = RemoteField.Missing,
    @SerialName("forgeRepository") val forgeRepository: RemoteField<String> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("forgeAccount", "ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("forgeRepository", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedureforgeGetRepositoryResultU2DRepository_2e5ddb0a3a = ProcedureforgeCreatePrResultU2DSource_2e68c47efd?

@Serializable
data class ProcedureforgeGetRepositoryResult_c7d6a55953(
    @SerialName("repository") val repository: RemoteField<ProcedureforgeCreatePrResultU2DSource_2e68c47efd>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("repository", "ProcedureforgeCreatePrResultU2DSource_2e68c47efd", true, true, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureforgeListPrLabelCandidatesResult_5ef545d60a(
    @SerialName("labels") val labels: List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DLabelsU2DItem_2e20b523bd>,
    @SerialName("truncated") val truncated: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("labels", "List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DLabelsU2DItem_2e20b523bd>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("truncated", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureforgeListPrReviewerCandidatesRequest_53e1ad57ca(
    @SerialName("forgeAccount") val forgeAccount: ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b,
    @SerialName("forgeRepository") val forgeRepository: String,
    @SerialName("prNumber") val prNumber: Long,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("query") val query: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("forgeAccount", "ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("forgeRepository", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prNumber", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("query", "String", false, false, null, null, null, 200, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureforgeListPrReviewerCandidatesResult_711e84b2a6(
    @SerialName("reviewers") val reviewers: List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DRequestedReviewersU2DItem_423ec18ef5>,
    @SerialName("truncated") val truncated: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("reviewers", "List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DRequestedReviewersU2DItem_423ec18ef5>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("truncated", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedureforgeListPrsResultU2DPrs_a7a958b1f6 = Map<String, ProcedureforgeCreatePrResult_ea7fc856bb>

@Serializable
data class ProcedureforgeListPrsResult_3e5dc6593b(
    @SerialName("prs") val prs: ProcedureforgeListPrsResultU2DPrs_a7a958b1f6,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("prs", "ProcedureforgeListPrsResultU2DPrs_a7a958b1f6", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureforgeListPullRequestsInStateRequestU2DState_ef49c6f9f5 {
    @SerialName("closed") CLOSED,
    @SerialName("merged") MERGED,
    @SerialName("all") ALL,
}

@Serializable
data class ProcedureforgeListPullRequestsInStateRequest_2197834f1e(
    @SerialName("forgeAccount") val forgeAccount: RemoteField<ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b> = RemoteField.Missing,
    @SerialName("forgeRepository") val forgeRepository: RemoteField<String> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("state") val state: ProcedureforgeListPullRequestsInStateRequestU2DState_ef49c6f9f5,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("forgeAccount", "ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("forgeRepository", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("state", "ProcedureforgeListPullRequestsInStateRequestU2DState_ef49c6f9f5", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureforgeListPullRequestsInStateResultU2DPullRequestsU2DItem_11f2043035(
    @SerialName("additions") val additions: Long,
    @SerialName("author") val author: RemoteField<ProcedureforgeGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a> = RemoteField.Missing,
    @SerialName("deletions") val deletions: Long,
    @SerialName("headBranch") val headBranch: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("labels") val labels: RemoteField<List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DLabelsU2DItem_2e20b523bd>> = RemoteField.Missing,
    @SerialName("pr") val pr: ProcedureforgeCreatePrResult_ea7fc856bb,
    @SerialName("repository") val repository: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("reviewRequested") val reviewRequested: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("additions", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("author", "ProcedureforgeGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("deletions", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("headBranch", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("labels", "List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DLabelsU2DItem_2e20b523bd>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pr", "ProcedureforgeCreatePrResult_ea7fc856bb", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("repository", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reviewRequested", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureforgeListPullRequestsInStateResult_c7918abeb4(
    @SerialName("pullRequests") val pullRequests: List<ProcedureforgeListPullRequestsInStateResultU2DPullRequestsU2DItem_11f2043035>,
    @SerialName("viewerLogin") val viewerLogin: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("pullRequests", "List<ProcedureforgeListPullRequestsInStateResultU2DPullRequestsU2DItem_11f2043035>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("viewerLogin", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureforgeMergePrAtHeadRequestU2DMethod_7237330838 {
    @SerialName("merge") MERGE,
    @SerialName("squash") SQUASH,
    @SerialName("rebase") REBASE,
}

@Serializable
data class ProcedureforgeMergePrAtHeadRequest_9b963a4b70(
    @SerialName("admin") val admin: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("expectedHeadSha") val expectedHeadSha: String,
    @SerialName("forgeAccount") val forgeAccount: RemoteField<ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b> = RemoteField.Missing,
    @SerialName("forgeRepository") val forgeRepository: RemoteField<String> = RemoteField.Missing,
    @SerialName("method") val method: RemoteField<ProcedureforgeMergePrAtHeadRequestU2DMethod_7237330838> = RemoteField.Missing,
    @SerialName("prNumber") val prNumber: Long,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("admin", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("expectedHeadSha", "String", true, false, null, null, null, null, null, null, "^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$", null, listOf()),
            RemoteFieldDescriptor("forgeAccount", "ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("forgeRepository", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("method", "ProcedureforgeMergePrAtHeadRequestU2DMethod_7237330838", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prNumber", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureforgeMergePrRequest_2c0f74a209(
    @SerialName("admin") val admin: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("forgeAccount") val forgeAccount: RemoteField<ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b> = RemoteField.Missing,
    @SerialName("forgeRepository") val forgeRepository: RemoteField<String> = RemoteField.Missing,
    @SerialName("method") val method: RemoteField<ProcedureforgeMergePrAtHeadRequestU2DMethod_7237330838> = RemoteField.Missing,
    @SerialName("prNumber") val prNumber: Long,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("admin", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("forgeAccount", "ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("forgeRepository", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("method", "ProcedureforgeMergePrAtHeadRequestU2DMethod_7237330838", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prNumber", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureforgePostPrCommentRequest_348882537c(
    @SerialName("body") val body: String,
    @SerialName("forgeAccount") val forgeAccount: RemoteField<ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b> = RemoteField.Missing,
    @SerialName("forgeRepository") val forgeRepository: RemoteField<String> = RemoteField.Missing,
    @SerialName("prNumber") val prNumber: Long,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("body", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("forgeAccount", "ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("forgeRepository", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prNumber", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureforgeRequestPrReviewersRequestU2DAddU2DItem_904af6fabc(
    @SerialName("id") val id: String,
    @SerialName("team") val team: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, 512, null, null, null, null, listOf()),
            RemoteFieldDescriptor("team", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureforgeRequestPrReviewersRequest_0d1cde2ef9(
    @SerialName("add") val add: List<ProcedureforgeRequestPrReviewersRequestU2DAddU2DItem_904af6fabc>,
    @SerialName("forgeAccount") val forgeAccount: ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b,
    @SerialName("forgeRepository") val forgeRepository: String,
    @SerialName("prNumber") val prNumber: Long,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("remove") val remove: List<ProcedureforgeRequestPrReviewersRequestU2DAddU2DItem_904af6fabc>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("add", "List<ProcedureforgeRequestPrReviewersRequestU2DAddU2DItem_904af6fabc>", true, false, null, null, null, null, null, 25, null, null, listOf()),
            RemoteFieldDescriptor("forgeAccount", "ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("forgeRepository", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prNumber", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remove", "List<ProcedureforgeRequestPrReviewersRequestU2DAddU2DItem_904af6fabc>", true, false, null, null, null, null, null, 25, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedureforgeSetPrFileViewedRequestU2DFingerprint_7738b69937 = String?

@Serializable
data class ProcedureforgeSetPrFileViewedRequest_1631cf63b0(
    @SerialName("fingerprint") val fingerprint: RemoteField<String>,
    @SerialName("forgeAccount") val forgeAccount: ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b,
    @SerialName("forgeRepository") val forgeRepository: String,
    @SerialName("path") val path: String,
    @SerialName("prNumber") val prNumber: Long,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("fingerprint", "String", true, true, null, null, 1, 256, null, null, null, null, listOf()),
            RemoteFieldDescriptor("forgeAccount", "ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("forgeRepository", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, 4096, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prNumber", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
