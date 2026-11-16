// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
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
