package com.poracode.app.protocol.git

import com.poracode.app.model.RemoteClientException
import com.poracode.app.protocol.GeneratedRemoteV3Contract
import com.poracode.remote.v3.generated.RemoteContractMetadata
import com.poracode.remote.v3.generated.RemoteRootCodec
import com.poracode.remote.v3.generated.RemoteRootCodecs
import com.poracode.remote.v3.generated.procedureU2EGitAbortMergeU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGitAbortMergeU2EResult
import com.poracode.remote.v3.generated.procedureU2EGitAddRemoteU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGitAddWorktreeU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGitAddWorktreeU2EResult
import com.poracode.remote.v3.generated.procedureU2EGitCommitU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGitCommitU2EResult
import com.poracode.remote.v3.generated.procedureU2EGitDeleteBranchU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGitFetchU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGitFinishMergeU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGitFinishMergeU2EResult
import com.poracode.remote.v3.generated.procedureU2EGitGetWorktreeOwnerU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGitGetWorktreeOwnerU2EResult
import com.poracode.remote.v3.generated.procedureU2EGitGetWorktreeSourceBranchU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGitGetWorktreeSourceBranchU2EResult
import com.poracode.remote.v3.generated.procedureU2EGitInitU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGitListBranchesU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGitListBranchesU2EResult
import com.poracode.remote.v3.generated.procedureU2EGitListWorktreesU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGitListWorktreesU2EResult
import com.poracode.remote.v3.generated.procedureU2EGitMergeToSourceU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGitMergeToSourceU2EResult
import com.poracode.remote.v3.generated.procedureU2EGitPruneWorktreesU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGitPullFromSourceU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGitPullFromSourceU2EResult
import com.poracode.remote.v3.generated.procedureU2EGitPullRebaseU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGitPullU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGitPushU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGitRemoveWorktreeU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGitRevertAllU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGitRevertU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGitStageAllU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGitStageU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGitSwitchBranchU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGitSwitchBranchU2EResult
import com.poracode.remote.v3.generated.procedureU2EGitSyncRebaseU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGitSyncRebaseU2EResult
import com.poracode.remote.v3.generated.procedureU2EGitSyncU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGitSyncU2EResult
import com.poracode.remote.v3.generated.procedureU2EGitUnstageAllU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGitUnstageU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGitWorktreeStatusBatchU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGitWorktreeStatusBatchU2EResult
import com.poracode.remote.v3.generated.routeU2EProcedureU2DCallU2ERequest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

enum class GitOwner(val wireName: String) {
    ProjectLocation("projectLocation"),
    WorktreeLocation("worktreeLocation"),
}

enum class GitProcedure(
    val wireName: String,
    val scope: String,
    val owner: GitOwner,
    val resultKind: String,
) {
    AbortMerge("gitAbortMerge", "session:operate", GitOwner.WorktreeLocation, "json"),
    AddRemote("gitAddRemote", "session:operate", GitOwner.ProjectLocation, "omitted"),
    AddWorktree("gitAddWorktree", "session:operate", GitOwner.ProjectLocation, "json"),
    Commit("gitCommit", "session:operate", GitOwner.ProjectLocation, "json"),
    DeleteBranch("gitDeleteBranch", "session:operate", GitOwner.ProjectLocation, "omitted"),
    Fetch("gitFetch", "session:operate", GitOwner.ProjectLocation, "omitted"),
    FinishMerge("gitFinishMerge", "session:operate", GitOwner.WorktreeLocation, "json"),
    GetWorktreeOwner("gitGetWorktreeOwner", "session:read", GitOwner.ProjectLocation, "json"),
    GetWorktreeSourceBranch(
        "gitGetWorktreeSourceBranch",
        "session:read",
        GitOwner.ProjectLocation,
        "json",
    ),
    Init("gitInit", "session:operate", GitOwner.ProjectLocation, "omitted"),
    ListBranches("gitListBranches", "session:read", GitOwner.ProjectLocation, "json"),
    ListWorktrees("gitListWorktrees", "session:read", GitOwner.ProjectLocation, "json"),
    MergeToSource("gitMergeToSource", "session:operate", GitOwner.ProjectLocation, "json"),
    PruneWorktrees("gitPruneWorktrees", "session:operate", GitOwner.ProjectLocation, "omitted"),
    Pull("gitPull", "session:operate", GitOwner.ProjectLocation, "omitted"),
    PullFromSource("gitPullFromSource", "session:operate", GitOwner.WorktreeLocation, "json"),
    PullRebase("gitPullRebase", "session:operate", GitOwner.ProjectLocation, "omitted"),
    Push("gitPush", "session:operate", GitOwner.ProjectLocation, "omitted"),
    RemoveWorktree("gitRemoveWorktree", "session:operate", GitOwner.ProjectLocation, "omitted"),
    Revert("gitRevert", "session:operate", GitOwner.ProjectLocation, "omitted"),
    RevertAll("gitRevertAll", "session:operate", GitOwner.ProjectLocation, "omitted"),
    Stage("gitStage", "session:operate", GitOwner.ProjectLocation, "omitted"),
    StageAll("gitStageAll", "session:operate", GitOwner.ProjectLocation, "omitted"),
    SwitchBranch("gitSwitchBranch", "session:operate", GitOwner.ProjectLocation, "json"),
    Sync("gitSync", "session:operate", GitOwner.ProjectLocation, "json"),
    SyncRebase("gitSyncRebase", "session:operate", GitOwner.ProjectLocation, "json"),
    Unstage("gitUnstage", "session:operate", GitOwner.ProjectLocation, "omitted"),
    UnstageAll("gitUnstageAll", "session:operate", GitOwner.ProjectLocation, "omitted"),
    WorktreeStatusBatch(
        "gitWorktreeStatusBatch",
        "session:read",
        GitOwner.ProjectLocation,
        "json",
    ),
    ;

    val isMutation: Boolean get() = scope == "session:operate"
}

data class GitProcedureRoute(
    val method: String,
    val path: String,
    val auth: String,
    val responseKind: String,
    val expectedStatus: Int,
)

/** Stable, hash-free facade over the committed generated remote-v3 Git roots and metadata. */
object RemoteV3GitContract {
    private val routeDescriptor = RemoteContractMetadata.routes.single { it.id == "procedure-call" }
    private val descriptors = RemoteContractMetadata.procedures.associateBy { it.name }

    init {
        GeneratedRemoteV3Contract.verifyRuntimeCompatibility()
        check(routeDescriptor.method == "POST")
        check(routeDescriptor.path == "/api/git/call")
        check(routeDescriptor.auth == "bearer")
        check(routeDescriptor.scopes.isEmpty())
        check(routeDescriptor.bodyKind == "json")
        check(routeDescriptor.responseKind == "procedure-result")
        GitProcedure.entries.forEach { procedure ->
            val descriptor = checkNotNull(descriptors[procedure.wireName])
            check(descriptor.scope == procedure.scope)
            check(descriptor.owner == procedure.owner.wireName)
            check(descriptor.resultKind == procedure.resultKind)
        }
    }

    fun route(): GitProcedureRoute = GitProcedureRoute(
        routeDescriptor.method,
        routeDescriptor.path,
        routeDescriptor.auth,
        routeDescriptor.responseKind,
        routeDescriptor.status,
    )

    fun request(procedure: GitProcedure, payload: JsonObject): String {
        val canonicalPayload = canonicalObject(procedure.requestCodec(), payload.toString())
        return canonical(
            RemoteRootCodecs.routeU2EProcedureU2DCallU2ERequest,
            buildJsonObject {
                put("procedure", procedure.wireName)
                put("payload", canonicalPayload)
            }.toString(),
        )
    }

    fun result(procedure: GitProcedure, raw: String): JsonElement = try {
        val envelope = Json.parseToJsonElement(raw) as? JsonObject
            ?: throw IllegalArgumentException("not an object")
        if (procedure.resultKind == "omitted") {
            if (envelope.isNotEmpty()) throw IllegalArgumentException("result must be omitted")
            JsonNull
        } else {
            if (envelope.keys != setOf("result")) throw IllegalArgumentException("invalid envelope")
            val codec = checkNotNull(procedure.resultCodec())
            Json.parseToJsonElement(canonical(codec, envelope.getValue("result").toString()))
        }
    } catch (error: RemoteClientException) {
        throw error
    } catch (_: Exception) {
        throw invalid("procedure result envelope")
    }

    private fun canonicalObject(codec: RemoteRootCodec<*>, raw: String): JsonObject = try {
        Json.parseToJsonElement(canonical(codec, raw)) as JsonObject
    } catch (error: RemoteClientException) {
        throw error
    } catch (_: Exception) {
        throw invalid(codec.id)
    }

    private fun canonical(codec: RemoteRootCodec<*>, raw: String): String = try {
        codec.decode(raw).validatedSnapshot.toString()
    } catch (_: Exception) {
        throw invalid(codec.id)
    }

    private fun invalid(boundary: String): RemoteClientException =
        RemoteClientException.invalidResponse("Remote Git validation failed at $boundary.")
}

private fun GitProcedure.requestCodec(): RemoteRootCodec<*> = when (this) {
    GitProcedure.AbortMerge -> RemoteRootCodecs.procedureU2EGitAbortMergeU2ERequest
    GitProcedure.AddRemote -> RemoteRootCodecs.procedureU2EGitAddRemoteU2ERequest
    GitProcedure.AddWorktree -> RemoteRootCodecs.procedureU2EGitAddWorktreeU2ERequest
    GitProcedure.Commit -> RemoteRootCodecs.procedureU2EGitCommitU2ERequest
    GitProcedure.DeleteBranch -> RemoteRootCodecs.procedureU2EGitDeleteBranchU2ERequest
    GitProcedure.Fetch -> RemoteRootCodecs.procedureU2EGitFetchU2ERequest
    GitProcedure.FinishMerge -> RemoteRootCodecs.procedureU2EGitFinishMergeU2ERequest
    GitProcedure.GetWorktreeOwner -> RemoteRootCodecs.procedureU2EGitGetWorktreeOwnerU2ERequest
    GitProcedure.GetWorktreeSourceBranch ->
        RemoteRootCodecs.procedureU2EGitGetWorktreeSourceBranchU2ERequest
    GitProcedure.Init -> RemoteRootCodecs.procedureU2EGitInitU2ERequest
    GitProcedure.ListBranches -> RemoteRootCodecs.procedureU2EGitListBranchesU2ERequest
    GitProcedure.ListWorktrees -> RemoteRootCodecs.procedureU2EGitListWorktreesU2ERequest
    GitProcedure.MergeToSource -> RemoteRootCodecs.procedureU2EGitMergeToSourceU2ERequest
    GitProcedure.PruneWorktrees -> RemoteRootCodecs.procedureU2EGitPruneWorktreesU2ERequest
    GitProcedure.Pull -> RemoteRootCodecs.procedureU2EGitPullU2ERequest
    GitProcedure.PullFromSource -> RemoteRootCodecs.procedureU2EGitPullFromSourceU2ERequest
    GitProcedure.PullRebase -> RemoteRootCodecs.procedureU2EGitPullRebaseU2ERequest
    GitProcedure.Push -> RemoteRootCodecs.procedureU2EGitPushU2ERequest
    GitProcedure.RemoveWorktree -> RemoteRootCodecs.procedureU2EGitRemoveWorktreeU2ERequest
    GitProcedure.Revert -> RemoteRootCodecs.procedureU2EGitRevertU2ERequest
    GitProcedure.RevertAll -> RemoteRootCodecs.procedureU2EGitRevertAllU2ERequest
    GitProcedure.Stage -> RemoteRootCodecs.procedureU2EGitStageU2ERequest
    GitProcedure.StageAll -> RemoteRootCodecs.procedureU2EGitStageAllU2ERequest
    GitProcedure.SwitchBranch -> RemoteRootCodecs.procedureU2EGitSwitchBranchU2ERequest
    GitProcedure.Sync -> RemoteRootCodecs.procedureU2EGitSyncU2ERequest
    GitProcedure.SyncRebase -> RemoteRootCodecs.procedureU2EGitSyncRebaseU2ERequest
    GitProcedure.Unstage -> RemoteRootCodecs.procedureU2EGitUnstageU2ERequest
    GitProcedure.UnstageAll -> RemoteRootCodecs.procedureU2EGitUnstageAllU2ERequest
    GitProcedure.WorktreeStatusBatch ->
        RemoteRootCodecs.procedureU2EGitWorktreeStatusBatchU2ERequest
}

private fun GitProcedure.resultCodec(): RemoteRootCodec<*>? = when (this) {
    GitProcedure.AbortMerge -> RemoteRootCodecs.procedureU2EGitAbortMergeU2EResult
    GitProcedure.AddWorktree -> RemoteRootCodecs.procedureU2EGitAddWorktreeU2EResult
    GitProcedure.Commit -> RemoteRootCodecs.procedureU2EGitCommitU2EResult
    GitProcedure.FinishMerge -> RemoteRootCodecs.procedureU2EGitFinishMergeU2EResult
    GitProcedure.GetWorktreeOwner -> RemoteRootCodecs.procedureU2EGitGetWorktreeOwnerU2EResult
    GitProcedure.GetWorktreeSourceBranch ->
        RemoteRootCodecs.procedureU2EGitGetWorktreeSourceBranchU2EResult
    GitProcedure.ListBranches -> RemoteRootCodecs.procedureU2EGitListBranchesU2EResult
    GitProcedure.ListWorktrees -> RemoteRootCodecs.procedureU2EGitListWorktreesU2EResult
    GitProcedure.MergeToSource -> RemoteRootCodecs.procedureU2EGitMergeToSourceU2EResult
    GitProcedure.PullFromSource -> RemoteRootCodecs.procedureU2EGitPullFromSourceU2EResult
    GitProcedure.SwitchBranch -> RemoteRootCodecs.procedureU2EGitSwitchBranchU2EResult
    GitProcedure.Sync -> RemoteRootCodecs.procedureU2EGitSyncU2EResult
    GitProcedure.SyncRebase -> RemoteRootCodecs.procedureU2EGitSyncRebaseU2EResult
    GitProcedure.WorktreeStatusBatch ->
        RemoteRootCodecs.procedureU2EGitWorktreeStatusBatchU2EResult
    GitProcedure.AddRemote,
    GitProcedure.DeleteBranch,
    GitProcedure.Fetch,
    GitProcedure.Init,
    GitProcedure.PruneWorktrees,
    GitProcedure.Pull,
    GitProcedure.PullRebase,
    GitProcedure.Push,
    GitProcedure.RemoveWorktree,
    GitProcedure.Revert,
    GitProcedure.RevertAll,
    GitProcedure.Stage,
    GitProcedure.StageAll,
    GitProcedure.Unstage,
    GitProcedure.UnstageAll,
    -> null
}
