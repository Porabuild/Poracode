// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class ProceduregetGitDiffBatchResult_0dde9dcede(
    @SerialName("staged") val staged: ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67,
    @SerialName("unstaged") val unstaged: ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("staged", "ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("unstaged", "ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregetGitDiffRequest_5513eb6f6f(
    @SerialName("filePath") val filePath: RemoteField<String> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("staged") val staged: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("filePath", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("staged", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregetGitDiffResult_ecbd7591c9(
    @SerialName("diff") val diff: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("diff", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregetGitFileContentRequest_eeb5c5f788(
    @SerialName("filePath") val filePath: String,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("staged") val staged: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("filePath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("staged", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregetGitFileContentResult_6de1ff8293(
    @SerialName("newContent") val newContent: String,
    @SerialName("oldContent") val oldContent: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("newContent", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("oldContent", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProceduregetGitStatusRequestU2DDetail_15cae388d0 {
    @SerialName("summary") SUMMARY,
    @SerialName("full") FULL,
}

@Serializable
data class ProceduregetGitStatusRequest_c4d99dd3e3(
    @SerialName("detail") val detail: RemoteField<ProceduregetGitStatusRequestU2DDetail_15cae388d0> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("detail", "ProceduregetGitStatusRequestU2DDetail_15cae388d0", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregetGitStatusResultU2DConflictFilesU2DItem_00b1d6328e(
    @SerialName("deletions") val deletions: Long,
    @SerialName("insertions") val insertions: Long,
    @SerialName("oldPath") val oldPath: RemoteField<String> = RemoteField.Missing,
    @SerialName("path") val path: String,
    @SerialName("staged") val staged: Boolean,
    @SerialName("status") val status: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("deletions", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("insertions", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("oldPath", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("staged", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProceduregetGitStatusResultU2DRemoteInfoU2DOptionU2D1U2DPlatform_9358a37bbc {
    @SerialName("github") GITHUB,
    @SerialName("gitlab") GITLAB,
    @SerialName("bitbucket") BITBUCKET,
    @SerialName("unknown") UNKNOWN,
}

@Serializable
data class ProceduregetGitStatusResultU2DRemoteInfoU2DOptionU2D1_1c2823e73e(
    @SerialName("owner") val owner: String,
    @SerialName("platform") val platform: ProceduregetGitStatusResultU2DRemoteInfoU2DOptionU2D1U2DPlatform_9358a37bbc,
    @SerialName("repo") val repo: String,
    @SerialName("url") val url: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("owner", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("platform", "ProceduregetGitStatusResultU2DRemoteInfoU2DOptionU2D1U2DPlatform_9358a37bbc", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("repo", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProceduregetGitStatusResultU2DRemoteInfo_9d9cbc9ed0 = ProceduregetGitStatusResultU2DRemoteInfoU2DOptionU2D1_1c2823e73e?

@Serializable
data class ProceduregetGitStatusResult_c1d4a9f752(
    @SerialName("ahead") val ahead: Long,
    @SerialName("behind") val behind: Long,
    @SerialName("branch") val branch: String,
    @SerialName("conflictFiles") val conflictFiles: RemoteField<List<ProceduregetGitStatusResultU2DConflictFilesU2DItem_00b1d6328e>> = RemoteField.Missing,
    @SerialName("detail") val detail: RemoteField<ProceduregetGitStatusRequestU2DDetail_15cae388d0> = RemoteField.Missing,
    @SerialName("hasRemote") val hasRemote: Boolean,
    @SerialName("headSha") val headSha: RemoteField<String> = RemoteField.Missing,
    @SerialName("isRepo") val isRepo: Boolean,
    @SerialName("mergeInProgress") val mergeInProgress: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("mergeMessage") val mergeMessage: RemoteField<String> = RemoteField.Missing,
    @SerialName("remoteInfo") val remoteInfo: RemoteField<ProceduregetGitStatusResultU2DRemoteInfoU2DOptionU2D1_1c2823e73e>,
    @SerialName("staged") val staged: List<ProceduregetGitStatusResultU2DConflictFilesU2DItem_00b1d6328e>,
    @SerialName("totalDeletions") val totalDeletions: Long,
    @SerialName("totalInsertions") val totalInsertions: Long,
    @SerialName("tracking") val tracking: String,
    @SerialName("unstaged") val unstaged: List<ProceduregetGitStatusResultU2DConflictFilesU2DItem_00b1d6328e>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("ahead", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("behind", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("branch", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictFiles", "List<ProceduregetGitStatusResultU2DConflictFilesU2DItem_00b1d6328e>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("detail", "ProceduregetGitStatusRequestU2DDetail_15cae388d0", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("hasRemote", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("headSha", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("isRepo", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mergeInProgress", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mergeMessage", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remoteInfo", "ProceduregetGitStatusResultU2DRemoteInfoU2DOptionU2D1_1c2823e73e", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("staged", "List<ProceduregetGitStatusResultU2DConflictFilesU2DItem_00b1d6328e>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("totalDeletions", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("totalInsertions", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tracking", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("unstaged", "List<ProceduregetGitStatusResultU2DConflictFilesU2DItem_00b1d6328e>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregetMcpOauthStatusRequest_c51ef8291e(
    @SerialName("projectLocation") val projectLocation: RemoteField<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregetMcpOauthStatusResult_51733da614(
    @SerialName("authenticatedUrls") val authenticatedUrls: List<String>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("authenticatedUrls", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghCancelWorkflowRunRequest_2101176bb1(
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("runId") val runId: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runId", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghCheckAvailableResult_e3b2f05936(
    @SerialName("available") val available: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("available", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghClosePrRequest_868bf1042a(
    @SerialName("prNumber") val prNumber: Long,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("prNumber", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghCreatePrRequest_39c209cff9(
    @SerialName("baseBranch") val baseBranch: String,
    @SerialName("body") val body: RemoteField<String> = RemoteField.Missing,
    @SerialName("branch") val branch: String,
    @SerialName("isDraft") val isDraft: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("title") val title: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("baseBranch", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("body", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("branch", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("isDraft", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureghCreatePrResultU2DMergeStateStatus_ecf46d0165 {
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
enum class ProcedureghCreatePrResultU2DMergeable_05ab37f667 {
    @SerialName("MERGEABLE") MERGEABLE,
    @SerialName("CONFLICTING") CONFLICTING,
    @SerialName("UNKNOWN") UNKNOWN,
}

@Serializable
enum class ProcedureghCreatePrResultU2DState_79fd49e14d {
    @SerialName("open") OPEN,
    @SerialName("draft") DRAFT,
    @SerialName("merged") MERGED,
    @SerialName("closed") CLOSED,
}

@Serializable
data class ProcedureghCreatePrResult_a4457c545e(
    @SerialName("baseBranch") val baseBranch: String,
    @SerialName("checksStatus") val checksStatus: RemoteField<String> = RemoteField.Missing,
    @SerialName("headSha") val headSha: RemoteField<String> = RemoteField.Missing,
    @SerialName("isDraft") val isDraft: Boolean,
    @SerialName("mergeStateStatus") val mergeStateStatus: RemoteField<ProcedureghCreatePrResultU2DMergeStateStatus_ecf46d0165> = RemoteField.Missing,
    @SerialName("mergeable") val mergeable: RemoteField<ProcedureghCreatePrResultU2DMergeable_05ab37f667> = RemoteField.Missing,
    @SerialName("number") val number: Long,
    @SerialName("reviewDecision") val reviewDecision: RemoteField<String> = RemoteField.Missing,
    @SerialName("state") val state: ProcedureghCreatePrResultU2DState_79fd49e14d,
    @SerialName("title") val title: String,
    @SerialName("updatedAt") val updatedAt: String,
    @SerialName("url") val url: String,
    @SerialName("viewerDidAuthor") val viewerDidAuthor: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("baseBranch", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("checksStatus", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("headSha", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("isDraft", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mergeStateStatus", "ProcedureghCreatePrResultU2DMergeStateStatus_ecf46d0165", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mergeable", "ProcedureghCreatePrResultU2DMergeable_05ab37f667", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("number", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reviewDecision", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("state", "ProcedureghCreatePrResultU2DState_79fd49e14d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("updatedAt", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("viewerDidAuthor", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedureghDispatchWorkflowRequestU2DInputs_fd056ca894 = Map<String, String>

@Serializable
data class ProcedureghDispatchWorkflowRequest_6d840e9cb9(
    @SerialName("inputs") val inputs: RemoteField<ProcedureghDispatchWorkflowRequestU2DInputs_fd056ca894> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("ref") val ref: RemoteField<String> = RemoteField.Missing,
    @SerialName("workflowId") val workflowId: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("inputs", "ProcedureghDispatchWorkflowRequestU2DInputs_fd056ca894", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ref", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("workflowId", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghGetPrChecksRequest_50e8e4265c(
    @SerialName("branch") val branch: String,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("branch", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghGetPrChecksResultU2DChecksU2DItem_0d39188d7c(
    @SerialName("completedAt") val completedAt: RemoteField<String> = RemoteField.Missing,
    @SerialName("conclusion") val conclusion: String,
    @SerialName("name") val name: String,
    @SerialName("startedAt") val startedAt: RemoteField<String> = RemoteField.Missing,
    @SerialName("state") val state: String,
    @SerialName("url") val url: RemoteField<String> = RemoteField.Missing,
    @SerialName("workflowName") val workflowName: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("completedAt", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conclusion", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("startedAt", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("state", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("workflowName", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghGetPrChecksResult_437e2d5d20(
    @SerialName("checks") val checks: List<ProcedureghGetPrChecksResultU2DChecksU2DItem_0d39188d7c>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("checks", "List<ProcedureghGetPrChecksResultU2DChecksU2DItem_0d39188d7c>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a(
    @SerialName("avatarUrl") val avatarUrl: RemoteField<String> = RemoteField.Missing,
    @SerialName("login") val login: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("avatarUrl", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("login", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghGetPrDetailsResultU2DDetailsU2DCommentsU2DItem_839da5c7aa(
    @SerialName("author") val author: ProcedureghGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a,
    @SerialName("body") val body: String,
    @SerialName("createdAt") val createdAt: String,
    @SerialName("id") val id: String,
    @SerialName("url") val url: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("author", "ProcedureghGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("body", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("createdAt", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureghGetPrDetailsResultU2DDetailsU2DCommitsU2DItem_9edd0cfb1c(
    @SerialName("abbreviatedOid") val abbreviatedOid: String,
    @SerialName("author") val author: RemoteField<ProcedureghGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a> = RemoteField.Missing,
    @SerialName("authoredDate") val authoredDate: String,
    @SerialName("messageBody") val messageBody: RemoteField<String> = RemoteField.Missing,
    @SerialName("messageHeadline") val messageHeadline: String,
    @SerialName("oid") val oid: String,
    @SerialName("url") val url: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("abbreviatedOid", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("author", "ProcedureghGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("authoredDate", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("messageBody", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("messageHeadline", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("oid", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedureghGetPrDetailsResultU2DDetailsU2DMergedBy_da37aeddd0 = ProcedureghGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a?
