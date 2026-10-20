// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
enum class ProcedureforgeCreatePrResultU2DMergeStateStatus_ecf46d0165 {
    @SerialName("BEHIND") BEHIND,
    @SerialName("BLOCKED") BLOCKED,
    @SerialName("CLEAN") CLEAN,
    @SerialName("DIRTY") DIRTY,
    @SerialName("DRAFT") DRAFT,
    @SerialName("HAS_HOOKS") HASU5FHOOKS,
    @SerialName("UNKNOWN") UNKNOWN,
    @SerialName("UNSTABLE") UNSTABLE,
}

@Serializable
enum class ProcedureforgeCreatePrResultU2DMergeable_05ab37f667 {
    @SerialName("MERGEABLE") MERGEABLE,
    @SerialName("CONFLICTING") CONFLICTING,
    @SerialName("UNKNOWN") UNKNOWN,
}

@Serializable
enum class ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DCommentEditingU2DItem_46c9cbbd3d {
    @SerialName("conversation") CONVERSATION,
    @SerialName("inline") INLINE,
}

@Serializable
enum class ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DMergeMethodsU2DItem_9c01de6b08 {
    @SerialName("merge") MERGE,
    @SerialName("squash") SQUASH,
    @SerialName("rebase") REBASE,
}

@Serializable
enum class ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DReviewDecisionsU2DItem_c0551fbf08 {
    @SerialName("approve") APPROVE,
    @SerialName("request-changes") REQUESTU2DCHANGES,
    @SerialName("comment") COMMENT,
}

@Serializable
enum class ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DViewedFiles_ae682752b1 {
    @SerialName("forge") FORGE,
    @SerialName("host") HOST,
}

@Serializable
data class ProcedureforgeCreatePrResultU2DSourceU2DCapabilities_71731d44e9(
    @SerialName("adminMerge") val adminMerge: Boolean,
    @SerialName("autoFix") val autoFix: Boolean,
    @SerialName("autoMerge") val autoMerge: Boolean,
    @SerialName("checks") val checks: Boolean,
    @SerialName("commentEditing") val commentEditing: RemoteField<List<ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DCommentEditingU2DItem_46c9cbbd3d>> = RemoteField.Missing,
    @SerialName("draft") val draft: Boolean,
    @SerialName("edit") val edit: Boolean,
    @SerialName("expectedHeadMerge") val expectedHeadMerge: Boolean,
    @SerialName("mergeMethods") val mergeMethods: List<ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DMergeMethodsU2DItem_9c01de6b08>,
    @SerialName("rebaseBranch") val rebaseBranch: Boolean,
    @SerialName("reopen") val reopen: Boolean,
    @SerialName("reviewDecisions") val reviewDecisions: List<ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DReviewDecisionsU2DItem_c0551fbf08>,
    @SerialName("reviewGuides") val reviewGuides: RemoteField<ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1> = RemoteField.Missing,
    @SerialName("reviewThreads") val reviewThreads: Boolean,
    @SerialName("updateBranch") val updateBranch: Boolean,
    @SerialName("viewedFiles") val viewedFiles: RemoteField<ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DViewedFiles_ae682752b1> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("adminMerge", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("autoFix", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("autoMerge", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("checks", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commentEditing", "List<ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DCommentEditingU2DItem_46c9cbbd3d>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("draft", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("edit", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("expectedHeadMerge", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mergeMethods", "List<ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DMergeMethodsU2DItem_9c01de6b08>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("rebaseBranch", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reopen", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reviewDecisions", "List<ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DReviewDecisionsU2DItem_c0551fbf08>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reviewGuides", "ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reviewThreads", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("updateBranch", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("viewedFiles", "ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DViewedFiles_ae682752b1", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureforgeCreatePrResultU2DSource_55723acd91(
    @SerialName("account") val account: RemoteField<ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b> = RemoteField.Missing,
    @SerialName("capabilities") val capabilities: ProcedureforgeCreatePrResultU2DSourceU2DCapabilities_71731d44e9,
    @SerialName("forge") val forge: ProcedureforgeClosePrRequestU2DForgeAccountU2DForge_eaed3cfbf4,
    @SerialName("host") val host: String,
    @SerialName("remote") val remote: String,
    @SerialName("repository") val repository: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("account", "ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("capabilities", "ProcedureforgeCreatePrResultU2DSourceU2DCapabilities_71731d44e9", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("forge", "ProcedureforgeClosePrRequestU2DForgeAccountU2DForge_eaed3cfbf4", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("host", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remote", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("repository", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureforgeCreatePrResultU2DState_79fd49e14d {
    @SerialName("open") OPEN,
    @SerialName("draft") DRAFT,
    @SerialName("merged") MERGED,
    @SerialName("closed") CLOSED,
}

@Serializable
data class ProcedureforgeCreatePrResult_22a062bffa(
    @SerialName("baseBranch") val baseBranch: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("checksStatus") val checksStatus: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("headSha") val headSha: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("isCrossRepository") val isCrossRepository: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("isDraft") val isDraft: Boolean,
    @SerialName("mergeStateStatus") val mergeStateStatus: RemoteField<ProcedureforgeCreatePrResultU2DMergeStateStatus_ecf46d0165> = RemoteField.Missing,
    @SerialName("mergeable") val mergeable: RemoteField<ProcedureforgeCreatePrResultU2DMergeable_05ab37f667> = RemoteField.Missing,
    @SerialName("number") val number: Long,
    @SerialName("reviewDecision") val reviewDecision: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("source") val source: RemoteField<ProcedureforgeCreatePrResultU2DSource_55723acd91> = RemoteField.Missing,
    @SerialName("state") val state: ProcedureforgeCreatePrResultU2DState_79fd49e14d,
    @SerialName("title") val title: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("updatedAt") val updatedAt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("url") val url: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("viewerDidAuthor") val viewerDidAuthor: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("baseBranch", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("checksStatus", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("headSha", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("isCrossRepository", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("isDraft", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mergeStateStatus", "ProcedureforgeCreatePrResultU2DMergeStateStatus_ecf46d0165", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mergeable", "ProcedureforgeCreatePrResultU2DMergeable_05ab37f667", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("number", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reviewDecision", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("source", "ProcedureforgeCreatePrResultU2DSource_55723acd91", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("state", "ProcedureforgeCreatePrResultU2DState_79fd49e14d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("updatedAt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("viewerDidAuthor", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureforgeEditPrCommentRequest_cc9733aab3(
    @SerialName("body") val body: String,
    @SerialName("commentId") val commentId: String,
    @SerialName("expectedBody") val expectedBody: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("forgeAccount") val forgeAccount: ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b,
    @SerialName("forgeRepository") val forgeRepository: String,
    @SerialName("prNumber") val prNumber: Long,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("threadId") val threadId: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("body", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commentId", "String", true, false, null, null, 1, 256, null, null, null, null, listOf()),
            RemoteFieldDescriptor("expectedBody", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("forgeAccount", "ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("forgeRepository", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prNumber", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", false, false, null, null, 1, 256, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureforgeEditPrRequest_3ee9ee08aa(
    @SerialName("baseBranch") val baseBranch: RemoteField<String> = RemoteField.Missing,
    @SerialName("body") val body: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("forgeAccount") val forgeAccount: RemoteField<ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b> = RemoteField.Missing,
    @SerialName("forgeRepository") val forgeRepository: RemoteField<String> = RemoteField.Missing,
    @SerialName("prNumber") val prNumber: Long,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("title") val title: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("baseBranch", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("body", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("forgeAccount", "ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("forgeRepository", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prNumber", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf("forge.edit.fields"))
    }
}

@Serializable
data class ProcedureforgeGetPrChecksRequest_1f21330aa4(
    @SerialName("branch") val branch: String,
    @SerialName("forgeAccount") val forgeAccount: RemoteField<ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b> = RemoteField.Missing,
    @SerialName("forgeRepository") val forgeRepository: RemoteField<String> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("branch", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("forgeAccount", "ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("forgeRepository", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureforgeGetPrChecksResultU2DChecksU2DItem_0d39188d7c(
    @SerialName("completedAt") val completedAt: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("conclusion") val conclusion: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("name") val name: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("startedAt") val startedAt: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("state") val state: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("url") val url: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("workflowName") val workflowName: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("completedAt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conclusion", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("startedAt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("state", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("workflowName", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureforgeGetPrChecksResult_437e2d5d20(
    @SerialName("checks") val checks: List<ProcedureforgeGetPrChecksResultU2DChecksU2DItem_0d39188d7c>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("checks", "List<ProcedureforgeGetPrChecksResultU2DChecksU2DItem_0d39188d7c>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureforgeGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a(
    @SerialName("avatarUrl") val avatarUrl: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("login") val login: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("avatarUrl", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("login", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureforgeGetPrDetailsResultU2DDetailsU2DCommentsU2DItem_839da5c7aa(
    @SerialName("author") val author: ProcedureforgeGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a,
    @SerialName("body") val body: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("createdAt") val createdAt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("id") val id: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("url") val url: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("author", "ProcedureforgeGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("body", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("createdAt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureforgeGetPrDetailsResultU2DDetailsU2DCommitsU2DItem_9edd0cfb1c(
    @SerialName("abbreviatedOid") val abbreviatedOid: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("author") val author: RemoteField<ProcedureforgeGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a> = RemoteField.Missing,
    @SerialName("authoredDate") val authoredDate: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("messageBody") val messageBody: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("messageHeadline") val messageHeadline: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("oid") val oid: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("url") val url: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("abbreviatedOid", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("author", "ProcedureforgeGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("authoredDate", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("messageBody", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("messageHeadline", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("oid", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedureforgeGetPrDetailsResultU2DDetailsU2DMergedBy_da37aeddd0 = ProcedureforgeGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a?

@Serializable
data class ProcedureforgeGetPrDetailsResultU2DDetailsU2DReviewThreadsU2DItem_9199b6e9ea(
    @SerialName("comments") val comments: List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DCommentsU2DItem_839da5c7aa>,
    @SerialName("id") val id: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("isOutdated") val isOutdated: Boolean,
    @SerialName("isResolved") val isResolved: Boolean,
    @SerialName("line") val line: RemoteField<Long> = RemoteField.Missing,
    @SerialName("path") val path: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("comments", "List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DCommentsU2DItem_839da5c7aa>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("isOutdated", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("isResolved", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("line", "Long", false, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
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
data class ProcedureforgeGetPrDetailsResultU2DDetails_7e778a19c7(
    @SerialName("additions") val additions: Long,
    @SerialName("author") val author: RemoteField<ProcedureforgeGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a> = RemoteField.Missing,
    @SerialName("baseBranch") val baseBranch: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("body") val body: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("changedFiles") val changedFiles: Long,
    @SerialName("checks") val checks: List<ProcedureforgeGetPrChecksResultU2DChecksU2DItem_0d39188d7c>,
    @SerialName("closedAt") val closedAt: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("comments") val comments: List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DCommentsU2DItem_839da5c7aa>,
    @SerialName("commits") val commits: List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DCommitsU2DItem_9edd0cfb1c>,
    @SerialName("createdAt") val createdAt: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("deletions") val deletions: Long,
    @SerialName("headBranch") val headBranch: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("mergedAt") val mergedAt: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("mergedBy") val mergedBy: RemoteField<ProcedureforgeGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a> = RemoteField.Missing,
    @SerialName("number") val number: Long,
    @SerialName("reviewThreads") val reviewThreads: RemoteField<List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DReviewThreadsU2DItem_9199b6e9ea>> = RemoteField.Missing,
    @SerialName("reviews") val reviews: List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DReviewsU2DItem_dba220fea4>,
    @SerialName("source") val source: RemoteField<ProcedureforgeCreatePrResultU2DSource_55723acd91> = RemoteField.Missing,
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
            RemoteFieldDescriptor("comments", "List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DCommentsU2DItem_839da5c7aa>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commits", "List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DCommitsU2DItem_9edd0cfb1c>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("createdAt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("deletions", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("headBranch", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mergedAt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mergedBy", "ProcedureforgeGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("number", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reviewThreads", "List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DReviewThreadsU2DItem_9199b6e9ea>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reviews", "List<ProcedureforgeGetPrDetailsResultU2DDetailsU2DReviewsU2DItem_dba220fea4>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("source", "ProcedureforgeCreatePrResultU2DSource_55723acd91", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureforgeGetPrDetailsResult_a014f9df96(
    @SerialName("details") val details: ProcedureforgeGetPrDetailsResultU2DDetails_7e778a19c7,
    @SerialName("pr") val pr: RemoteField<ProcedureforgeCreatePrResult_22a062bffa> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("details", "ProcedureforgeGetPrDetailsResultU2DDetails_7e778a19c7", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pr", "ProcedureforgeCreatePrResult_22a062bffa", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureforgeGetPrDiffResult_ecbd7591c9(
    @SerialName("diff") val diff: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("diff", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
