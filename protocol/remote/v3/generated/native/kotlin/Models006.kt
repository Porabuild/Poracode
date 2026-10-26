// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class ProcedureforgeGetPrDetailsResultU2DDetailsU2DReviewThreadsU2DItem_bf61c59756(
    @SerialName("comments") val comments: List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DCommentsU2DItem_cb95bf43ec>,
    @SerialName("id") val id: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("isOutdated") val isOutdated: Boolean,
    @SerialName("isResolved") val isResolved: Boolean,
    @SerialName("line") val line: RemoteField<Long> = RemoteField.Missing,
    @SerialName("path") val path: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("side") val side: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("comments", "List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DCommentsU2DItem_cb95bf43ec>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("isOutdated", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("isResolved", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("line", "Long", false, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("side", "String", false, false, null, null, 1, 64, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureforgeGetPrDetailsResultU2DDetailsU2DReviewsU2DItemU2DState_d2a18aed5c {
    @SerialName("APPROVED") APPROVED,
    @SerialName("CHANGES_REQUESTED") CHANGESU5FREQUESTED,
    @SerialName("COMMENTED") COMMENTED,
    @SerialName("DISMISSED") DISMISSED,
    @SerialName("PENDING") PENDING,
}

@Serializable
data class ProcedureforgeGetPrDetailsResultU2DDetailsU2DReviewsU2DItem_dba220fea4(
    @SerialName("author") val author: ProcedureforgeGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a,
    @SerialName("body") val body: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("id") val id: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("state") val state: ProcedureforgeGetPrDetailsResultU2DDetailsU2DReviewsU2DItemU2DState_d2a18aed5c,
    @SerialName("submittedAt") val submittedAt: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("url") val url: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("author", "ProcedureforgeGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("body", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("state", "ProcedureforgeGetPrDetailsResultU2DDetailsU2DReviewsU2DItemU2DState_d2a18aed5c", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("submittedAt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureforgeGetPrDetailsResultU2DDetailsU2DTimelineU2DItem_c65389518c(
    @SerialName("actor") val actor: RemoteField<ProcedureforgeGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a> = RemoteField.Missing,
    @SerialName("createdAt") val createdAt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("fromRef") val fromRef: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("kind") val kind: String,
    @SerialName("label") val label: RemoteField<ProcedureforgeGetPrDetailsResultU2DDetailsU2DLabelsU2DItem_2e20b523bd> = RemoteField.Missing,
    @SerialName("reviewer") val reviewer: RemoteField<ProcedureforgeGetPrDetailsResultU2DDetailsU2DRequestedReviewersU2DItem_423ec18ef5> = RemoteField.Missing,
    @SerialName("text") val text: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("toRef") val toRef: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("actor", "ProcedureforgeGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("createdAt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fromRef", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "String", true, false, null, null, 1, 64, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "ProcedureforgeGetPrDetailsResultU2DDetailsU2DLabelsU2DItem_2e20b523bd", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reviewer", "ProcedureforgeGetPrDetailsResultU2DDetailsU2DRequestedReviewersU2DItem_423ec18ef5", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("text", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("toRef", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureforgeGetPrDetailsResultU2DDetails_fb0686e874(
    @SerialName("additions") val additions: Long,
    @SerialName("author") val author: RemoteField<ProcedureforgeGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a> = RemoteField.Missing,
    @SerialName("baseBranch") val baseBranch: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("body") val body: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("changedFiles") val changedFiles: Long,
    @SerialName("checks") val checks: List<ProcedureforgeGetPrChecksResultU2DChecksU2DItem_0d39188d7c>,
    @SerialName("closedAt") val closedAt: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("comments") val comments: List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DCommentsU2DItem_cb95bf43ec>,
    @SerialName("commits") val commits: List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DCommitsU2DItem_9edd0cfb1c>,
    @SerialName("createdAt") val createdAt: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("deletions") val deletions: Long,
    @SerialName("headBranch") val headBranch: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("labels") val labels: RemoteField<List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DLabelsU2DItem_2e20b523bd>> = RemoteField.Missing,
    @SerialName("mergedAt") val mergedAt: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("mergedBy") val mergedBy: RemoteField<ProcedureforgeGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a> = RemoteField.Missing,
    @SerialName("number") val number: Long,
    @SerialName("reactions") val reactions: RemoteField<List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DCommentsU2DItemU2DReactionsU2DItem_60708133c8>> = RemoteField.Missing,
    @SerialName("requestedReviewers") val requestedReviewers: RemoteField<List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DRequestedReviewersU2DItem_423ec18ef5>> = RemoteField.Missing,
    @SerialName("reviewThreads") val reviewThreads: RemoteField<List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DReviewThreadsU2DItem_bf61c59756>> = RemoteField.Missing,
    @SerialName("reviews") val reviews: List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DReviewsU2DItem_dba220fea4>,
    @SerialName("source") val source: RemoteField<ProcedureforgeCreatePrResultU2DSource_2e68c47efd> = RemoteField.Missing,
    @SerialName("timeline") val timeline: RemoteField<List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DTimelineU2DItem_c65389518c>> = RemoteField.Missing,
    @SerialName("title") val title: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("additions", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("author", "ProcedureforgeGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("baseBranch", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("body", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("changedFiles", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("checks", "List<ProcedureforgeGetPrChecksResultU2DChecksU2DItem_0d39188d7c>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("closedAt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("comments", "List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DCommentsU2DItem_cb95bf43ec>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commits", "List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DCommitsU2DItem_9edd0cfb1c>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("createdAt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("deletions", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("headBranch", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("labels", "List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DLabelsU2DItem_2e20b523bd>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mergedAt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mergedBy", "ProcedureforgeGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("number", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reactions", "List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DCommentsU2DItemU2DReactionsU2DItem_60708133c8>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("requestedReviewers", "List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DRequestedReviewersU2DItem_423ec18ef5>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reviewThreads", "List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DReviewThreadsU2DItem_bf61c59756>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reviews", "List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DReviewsU2DItem_dba220fea4>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("source", "ProcedureforgeCreatePrResultU2DSource_2e68c47efd", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("timeline", "List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DTimelineU2DItem_c65389518c>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureforgeGetPrDetailsResult_a412a228f3(
    @SerialName("details") val details: ProcedureforgeGetPrDetailsResultU2DDetails_fb0686e874,
    @SerialName("pr") val pr: RemoteField<ProcedureforgeCreatePrResult_ea7fc856bb> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("details", "ProcedureforgeGetPrDetailsResultU2DDetails_fb0686e874", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pr", "ProcedureforgeCreatePrResult_ea7fc856bb", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureforgeGetPrFilesResultU2DFilesU2DItem_63c18b52ff(
    @SerialName("additions") val additions: Long,
    @SerialName("deletions") val deletions: Long,
    @SerialName("path") val path: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("additions", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("deletions", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

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
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("createdAt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fingerprint", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("stops", "List<ProcedureforgeGetPrReviewGuideResultU2DGuideU2DOptionU2D1U2DStopsU2DItem_b03a8b1fac>", true, false, null, null, null, null, 1, 500, null, null, listOf()),
            RemoteFieldDescriptor("summary", "String", true, false, null, null, 1, 16000, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
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
