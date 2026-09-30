package com.poracode.app.protocol.github

import com.poracode.app.model.RemoteClientException
import com.poracode.app.protocol.GeneratedRemoteV3Contract
import com.poracode.remote.v3.generated.RemoteContractMetadata
import com.poracode.remote.v3.generated.RemoteRootCodec
import com.poracode.remote.v3.generated.RemoteRootCodecs
import com.poracode.remote.v3.generated.*
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

enum class GithubOwner(val wireName: String) {
    ProjectLocation("projectLocation"),
    Runtime("runtime"),
}

enum class GithubProcedure(
    val wireName: String,
    val scope: String,
    val owner: GithubOwner,
    val resultKind: String,
) {
    CancelWorkflowRun("ghCancelWorkflowRun", "session:operate", GithubOwner.ProjectLocation, "omitted"),
    CheckAvailable("ghCheckAvailable", "session:read", GithubOwner.ProjectLocation, "json"),
    ClosePr("ghClosePr", "session:operate", GithubOwner.ProjectLocation, "omitted"),
    CreatePr("ghCreatePr", "session:operate", GithubOwner.ProjectLocation, "json"),
    DeleteWorkflowRun("ghDeleteWorkflowRun", "session:operate", GithubOwner.ProjectLocation, "omitted"),
    DispatchWorkflow("ghDispatchWorkflow", "session:operate", GithubOwner.ProjectLocation, "omitted"),
    GetPrChecks("ghGetPrChecks", "session:read", GithubOwner.ProjectLocation, "json"),
    GetPrDetails("ghGetPrDetails", "session:read", GithubOwner.ProjectLocation, "json"),
    GetPrDiff("ghGetPrDiff", "session:read", GithubOwner.ProjectLocation, "json"),
    GetPrFiles("ghGetPrFiles", "session:read", GithubOwner.ProjectLocation, "json"),
    GetPrForBranch("ghGetPrForBranch", "session:read", GithubOwner.ProjectLocation, "json"),
    GetPrReviewComments("ghGetPrReviewComments", "session:read", GithubOwner.ProjectLocation, "json"),
    GetWorkflowDefinition("ghGetWorkflowDefinition", "session:read", GithubOwner.ProjectLocation, "json"),
    GetWorkflowRun("ghGetWorkflowRun", "session:read", GithubOwner.ProjectLocation, "json"),
    ListAccounts("ghListAccounts", "session:read", GithubOwner.Runtime, "json"),
    ListPrs("ghListPrs", "session:read", GithubOwner.ProjectLocation, "json"),
    ListPullRequests("ghListPullRequests", "session:read", GithubOwner.ProjectLocation, "json"),
    ListRepos("ghListRepos", "session:read", GithubOwner.Runtime, "json"),
    ListWorkflowRuns("ghListWorkflowRuns", "session:read", GithubOwner.ProjectLocation, "json"),
    ListWorkflows("ghListWorkflows", "session:read", GithubOwner.ProjectLocation, "json"),
    MarkPrReady("ghMarkPrReady", "session:operate", GithubOwner.ProjectLocation, "omitted"),
    MergePr("ghMergePr", "session:operate", GithubOwner.ProjectLocation, "omitted"),
    PostPrComment("ghPostPrComment", "session:operate", GithubOwner.ProjectLocation, "json"),
    ReopenPr("ghReopenPr", "session:operate", GithubOwner.ProjectLocation, "omitted"),
    RerunWorkflowRun("ghRerunWorkflowRun", "session:operate", GithubOwner.ProjectLocation, "omitted"),
    SubmitPrReview("ghSubmitPrReview", "session:operate", GithubOwner.ProjectLocation, "omitted"),
    UpdatePrBranch("ghUpdatePrBranch", "session:operate", GithubOwner.ProjectLocation, "omitted"),
    ;

    val isMutation: Boolean get() = scope == "session:operate"
}

data class GithubProcedureRoute(
    val method: String,
    val path: String,
    val auth: String,
    val expectedStatus: Int,
)

/** Hash-free application facade over every committed generated GitHub procedure root. */
object RemoteV3GithubContract {
    private val routeDescriptor = RemoteContractMetadata.routes.single { it.id == "procedure-call" }
    private val descriptors = RemoteContractMetadata.procedures.associateBy { it.name }

    init {
        GeneratedRemoteV3Contract.verifyRuntimeCompatibility()
        check(routeDescriptor.method == "POST" && routeDescriptor.path == "/api/git/call")
        check(routeDescriptor.auth == "bearer" && routeDescriptor.scopes.isEmpty())
        check(routeDescriptor.responseKind == "procedure-result" && routeDescriptor.status == 200)
        GithubProcedure.entries.forEach { procedure ->
            val descriptor = checkNotNull(descriptors[procedure.wireName])
            check(descriptor.scope == procedure.scope)
            check(descriptor.owner == procedure.owner.wireName)
            check(descriptor.resultKind == procedure.resultKind)
        }
    }

    fun route() = GithubProcedureRoute(
        routeDescriptor.method,
        routeDescriptor.path,
        routeDescriptor.auth,
        routeDescriptor.status,
    )

    fun request(procedure: GithubProcedure, payload: JsonObject): String {
        val canonicalPayload = canonicalObject(procedure.requestCodec(), payload.toString())
        return canonical(
            RemoteRootCodecs.routeU2EProcedureU2DCallU2ERequest,
            buildJsonObject {
                put("procedure", procedure.wireName)
                put("payload", canonicalPayload)
            }.toString(),
        )
    }

    fun result(procedure: GithubProcedure, raw: String): JsonElement = try {
        val envelope = Json.parseToJsonElement(raw) as? JsonObject
            ?: throw IllegalArgumentException("not an object")
        if (procedure.resultKind == "omitted") {
            if (envelope.isNotEmpty()) throw IllegalArgumentException("result must be omitted")
            JsonNull
        } else {
            if (envelope.keys != setOf("result")) throw IllegalArgumentException("invalid envelope")
            Json.parseToJsonElement(
                canonical(checkNotNull(procedure.resultCodec()), envelope.getValue("result").toString()),
            )
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

    private fun invalid(boundary: String) =
        RemoteClientException.invalidResponse("Remote GitHub validation failed at $boundary.")
}

private fun GithubProcedure.requestCodec(): RemoteRootCodec<*> = when (this) {
    GithubProcedure.CancelWorkflowRun -> RemoteRootCodecs.procedureU2EGhCancelWorkflowRunU2ERequest
    GithubProcedure.CheckAvailable -> RemoteRootCodecs.procedureU2EGhCheckAvailableU2ERequest
    GithubProcedure.ClosePr -> RemoteRootCodecs.procedureU2EGhClosePrU2ERequest
    GithubProcedure.CreatePr -> RemoteRootCodecs.procedureU2EGhCreatePrU2ERequest
    GithubProcedure.DeleteWorkflowRun -> RemoteRootCodecs.procedureU2EGhDeleteWorkflowRunU2ERequest
    GithubProcedure.DispatchWorkflow -> RemoteRootCodecs.procedureU2EGhDispatchWorkflowU2ERequest
    GithubProcedure.GetPrChecks -> RemoteRootCodecs.procedureU2EGhGetPrChecksU2ERequest
    GithubProcedure.GetPrDetails -> RemoteRootCodecs.procedureU2EGhGetPrDetailsU2ERequest
    GithubProcedure.GetPrDiff -> RemoteRootCodecs.procedureU2EGhGetPrDiffU2ERequest
    GithubProcedure.GetPrFiles -> RemoteRootCodecs.procedureU2EGhGetPrFilesU2ERequest
    GithubProcedure.GetPrForBranch -> RemoteRootCodecs.procedureU2EGhGetPrForBranchU2ERequest
    GithubProcedure.GetPrReviewComments -> RemoteRootCodecs.procedureU2EGhGetPrReviewCommentsU2ERequest
    GithubProcedure.GetWorkflowDefinition -> RemoteRootCodecs.procedureU2EGhGetWorkflowDefinitionU2ERequest
    GithubProcedure.GetWorkflowRun -> RemoteRootCodecs.procedureU2EGhGetWorkflowRunU2ERequest
    GithubProcedure.ListAccounts -> RemoteRootCodecs.procedureU2EGhListAccountsU2ERequest
    GithubProcedure.ListPrs -> RemoteRootCodecs.procedureU2EGhListPrsU2ERequest
    GithubProcedure.ListPullRequests -> RemoteRootCodecs.procedureU2EGhListPullRequestsU2ERequest
    GithubProcedure.ListRepos -> RemoteRootCodecs.procedureU2EGhListReposU2ERequest
    GithubProcedure.ListWorkflowRuns -> RemoteRootCodecs.procedureU2EGhListWorkflowRunsU2ERequest
    GithubProcedure.ListWorkflows -> RemoteRootCodecs.procedureU2EGhListWorkflowsU2ERequest
    GithubProcedure.MarkPrReady -> RemoteRootCodecs.procedureU2EGhMarkPrReadyU2ERequest
    GithubProcedure.MergePr -> RemoteRootCodecs.procedureU2EGhMergePrU2ERequest
    GithubProcedure.PostPrComment -> RemoteRootCodecs.procedureU2EGhPostPrCommentU2ERequest
    GithubProcedure.ReopenPr -> RemoteRootCodecs.procedureU2EGhReopenPrU2ERequest
    GithubProcedure.RerunWorkflowRun -> RemoteRootCodecs.procedureU2EGhRerunWorkflowRunU2ERequest
    GithubProcedure.SubmitPrReview -> RemoteRootCodecs.procedureU2EGhSubmitPrReviewU2ERequest
    GithubProcedure.UpdatePrBranch -> RemoteRootCodecs.procedureU2EGhUpdatePrBranchU2ERequest
}

private fun GithubProcedure.resultCodec(): RemoteRootCodec<*>? = when (this) {
    GithubProcedure.CheckAvailable -> RemoteRootCodecs.procedureU2EGhCheckAvailableU2EResult
    GithubProcedure.CreatePr -> RemoteRootCodecs.procedureU2EGhCreatePrU2EResult
    GithubProcedure.GetPrChecks -> RemoteRootCodecs.procedureU2EGhGetPrChecksU2EResult
    GithubProcedure.GetPrDetails -> RemoteRootCodecs.procedureU2EGhGetPrDetailsU2EResult
    GithubProcedure.GetPrDiff -> RemoteRootCodecs.procedureU2EGhGetPrDiffU2EResult
    GithubProcedure.GetPrFiles -> RemoteRootCodecs.procedureU2EGhGetPrFilesU2EResult
    GithubProcedure.GetPrForBranch -> RemoteRootCodecs.procedureU2EGhGetPrForBranchU2EResult
    GithubProcedure.GetPrReviewComments -> RemoteRootCodecs.procedureU2EGhGetPrReviewCommentsU2EResult
    GithubProcedure.GetWorkflowDefinition -> RemoteRootCodecs.procedureU2EGhGetWorkflowDefinitionU2EResult
    GithubProcedure.GetWorkflowRun -> RemoteRootCodecs.procedureU2EGhGetWorkflowRunU2EResult
    GithubProcedure.ListAccounts -> RemoteRootCodecs.procedureU2EGhListAccountsU2EResult
    GithubProcedure.ListPrs -> RemoteRootCodecs.procedureU2EGhListPrsU2EResult
    GithubProcedure.ListPullRequests -> RemoteRootCodecs.procedureU2EGhListPullRequestsU2EResult
    GithubProcedure.ListRepos -> RemoteRootCodecs.procedureU2EGhListReposU2EResult
    GithubProcedure.ListWorkflowRuns -> RemoteRootCodecs.procedureU2EGhListWorkflowRunsU2EResult
    GithubProcedure.ListWorkflows -> RemoteRootCodecs.procedureU2EGhListWorkflowsU2EResult
    GithubProcedure.PostPrComment -> RemoteRootCodecs.procedureU2EGhPostPrCommentU2EResult
    GithubProcedure.CancelWorkflowRun, GithubProcedure.ClosePr,
    GithubProcedure.DeleteWorkflowRun, GithubProcedure.DispatchWorkflow,
    GithubProcedure.MarkPrReady, GithubProcedure.MergePr, GithubProcedure.ReopenPr,
    GithubProcedure.RerunWorkflowRun, GithubProcedure.SubmitPrReview,
    GithubProcedure.UpdatePrBranch -> null
}
