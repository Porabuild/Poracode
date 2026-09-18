// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class ProcedureghMergePrRequest_39d6579ca7(
    @SerialName("admin") val admin: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("method") val method: RemoteField<ProcedureghMergePrRequestU2DMethod_7237330838> = RemoteField.Missing,
    @SerialName("prNumber") val prNumber: Long,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("admin", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("method", "ProcedureghMergePrRequestU2DMethod_7237330838", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prNumber", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
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
    @SerialName("ghAccount") val ghAccount: RemoteField<ProcedureghCancelWorkflowRunRequestU2DGhAccount_5646cf57ff> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("runId") val runId: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("failedOnly", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ghAccount", "ProcedureghCancelWorkflowRunRequestU2DGhAccount_5646cf57ff", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runId", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureghSubmitPrReviewRequestU2DDecision_c0551fbf08 {
    @SerialName("approve") APPROVE,
    @SerialName("request-changes") REQUESTU2DCHANGES,
    @SerialName("comment") COMMENT,
}

@Serializable
data class ProcedureghSubmitPrReviewRequest_09cbc76a2a(
    @SerialName("body") val body: RemoteField<String> = RemoteField.Missing,
    @SerialName("decision") val decision: ProcedureghSubmitPrReviewRequestU2DDecision_c0551fbf08,
    @SerialName("prNumber") val prNumber: Long,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("body", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("decision", "ProcedureghSubmitPrReviewRequestU2DDecision_c0551fbf08", true, false, null, null, null, null, null, null, null, null, listOf()),
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

@Serializable
data class ProceduregitAddWorktreeRequest_6a8ee4e736(
    @SerialName("branch") val branch: RemoteField<String> = RemoteField.Missing,
    @SerialName("copyIgnoredPatterns") val copyIgnoredPatterns: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("createBranch") val createBranch: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("keepChangesInSource") val keepChangesInSource: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("ownerToken") val ownerToken: RemoteField<String> = RemoteField.Missing,
    @SerialName("path") val path: RemoteField<String> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("sourceBranch") val sourceBranch: RemoteField<String> = RemoteField.Missing,
    @SerialName("startPoint") val startPoint: RemoteField<String> = RemoteField.Missing,
    @SerialName("transferUncommitted") val transferUncommitted: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("worktreeOmitRepoDir") val worktreeOmitRepoDir: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("worktreeRoot") val worktreeRoot: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("branch", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("copyIgnoredPatterns", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("createBranch", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("keepChangesInSource", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ownerToken", "String", false, false, null, null, 1, 128, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sourceBranch", "String", false, false, null, null, 1, 255, null, null, null, null, listOf()),
            RemoteFieldDescriptor("startPoint", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("transferUncommitted", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeOmitRepoDir", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeRoot", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf("git.add-worktree.frozen-source"))
    }
}

@Serializable
data class ProceduregitAddWorktreeResult_4a10e57442(
    @SerialName("changesTransferred") val changesTransferred: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("path") val path: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("changesTransferred", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitCommitRequest_f34e1c0e37(
    @SerialName("addAll") val addAll: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("message") val message: String,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("reapplyStashCommit") val reapplyStashCommit: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("addAll", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("message", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reapplyStashCommit", "String", false, false, null, null, null, null, null, null, "^(?:[0-9a-f]{40}|[0-9a-f]{64})$", null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitCommitResult_522b0d7f41(
    @SerialName("conflictFiles") val conflictFiles: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("hash") val hash: String,
    @SerialName("message") val message: String,
    @SerialName("reapplyConflicting") val reapplyConflicting: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("stashPreserved") val stashPreserved: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("stashReapplied") val stashReapplied: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("conflictFiles", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("hash", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("message", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reapplyConflicting", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("stashPreserved", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("stashReapplied", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitDeleteBranchRequest_55c4cb32b4(
    @SerialName("branch") val branch: String,
    @SerialName("expectedOwnerToken") val expectedOwnerToken: RemoteField<String> = RemoteField.Missing,
    @SerialName("force") val force: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("remote") val remote: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("branch", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("expectedOwnerToken", "String", false, false, null, null, 1, 128, null, null, null, null, listOf()),
            RemoteFieldDescriptor("force", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remote", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf("git.delete-branch.remote-cannot-have-owner"))
    }
}

@Serializable
data class ProceduregitFetchRequest_5d8849075c(
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("prune") val prune: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("remote") val remote: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prune", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remote", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitFinishMergeResult_41bff5c730(
    @SerialName("conflictFiles") val conflictFiles: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("error") val error: RemoteField<String> = RemoteField.Missing,
    @SerialName("reapplyConflicting") val reapplyConflicting: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("stashPreserved") val stashPreserved: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("stashReapplied") val stashReapplied: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("success") val success: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("conflictFiles", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("error", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reapplyConflicting", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("stashPreserved", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("stashReapplied", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("success", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitGetWorktreeOwnerResult_3a27703aea(
    @SerialName("ownerToken") val ownerToken: RemoteField<String>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("ownerToken", "String", true, true, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitGetWorktreeSourceBranchRequest_6900ba2bd9(
    @SerialName("branch") val branch: String,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("sourceBranchOverride") val sourceBranchOverride: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("branch", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sourceBranchOverride", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitGetWorktreeSourceBranchResult_4864c5f65a(
    @SerialName("commitsAhead") val commitsAhead: Long,
    @SerialName("sourceAhead") val sourceAhead: Long,
    @SerialName("sourceBranch") val sourceBranch: RemoteField<String>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("commitsAhead", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sourceAhead", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sourceBranch", "String", true, true, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitListBranchesRequest_632568cf23(
    @SerialName("includeRemote") val includeRemote: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("includeRemote", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitListBranchesResultU2DBranchesU2DItem_6602e9e9c3(
    @SerialName("commit") val commit: String,
    @SerialName("current") val current: Boolean,
    @SerialName("isRemote") val isRemote: Boolean,
    @SerialName("name") val name: String,
    @SerialName("remote") val remote: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("commit", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("current", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("isRemote", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remote", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitListBranchesResult_458a450839(
    @SerialName("branches") val branches: List<ProceduregitListBranchesResultU2DBranchesU2DItem_6602e9e9c3>,
    @SerialName("current") val current: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("branches", "List<ProceduregitListBranchesResultU2DBranchesU2DItem_6602e9e9c3>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("current", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitListWorktreesResultU2DWorktreesU2DItem_0288aefad6(
    @SerialName("branch") val branch: String,
    @SerialName("commit") val commit: String,
    @SerialName("isMain") val isMain: Boolean,
    @SerialName("path") val path: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("branch", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commit", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("isMain", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitListWorktreesResult_70e5b904af(
    @SerialName("worktrees") val worktrees: List<ProceduregitListWorktreesResultU2DWorktreesU2DItem_0288aefad6>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("worktrees", "List<ProceduregitListWorktreesResultU2DWorktreesU2DItem_0288aefad6>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitMergeToSourceRequest_e41b25797e(
    @SerialName("expectedWorktreeCommit") val expectedWorktreeCommit: RemoteField<String> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("sourceBranch") val sourceBranch: String,
    @SerialName("worktreeBranch") val worktreeBranch: String,
    @SerialName("worktreeLocation") val worktreeLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("expectedWorktreeCommit", "String", false, false, null, null, null, null, null, null, "^(?:[0-9a-f]{40}|[0-9a-f]{64})$", null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sourceBranch", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeBranch", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitMergeToSourceResult_0bd6eab0e2(
    @SerialName("conflictFiles") val conflictFiles: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("error") val error: RemoteField<String> = RemoteField.Missing,
    @SerialName("fastForward") val fastForward: Boolean,
    @SerialName("merged") val merged: Boolean,
    @SerialName("newSourceCommit") val newSourceCommit: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("conflictFiles", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("error", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fastForward", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("merged", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("newSourceCommit", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregitProjectSnapshotRequest_7e2ac4b648(
    @SerialName("includeGhCheck") val includeGhCheck: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("includeGhCheck", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProceduregitProjectSnapshotResultU2DBranches_d715cb198a = ProceduregitListBranchesResult_458a450839?

typealias ProceduregitProjectSnapshotResultU2DGhAvailable_78c0e367e5 = Boolean?

typealias ProceduregitProjectSnapshotResultU2DStatus_98139abfca = ProceduregetGitStatusResult_c1d4a9f752?

typealias ProceduregitProjectSnapshotResultU2DWorktrees_694e88722e = List<ProceduregitListWorktreesResultU2DWorktreesU2DItem_0288aefad6>?
