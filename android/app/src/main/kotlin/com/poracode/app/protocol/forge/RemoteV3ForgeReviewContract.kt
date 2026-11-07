package com.poracode.app.protocol.forge

import com.poracode.app.model.RemoteClientException
import com.poracode.app.protocol.GeneratedRemoteV3Contract
import com.poracode.remote.v3.generated.*
import kotlinx.serialization.json.*

enum class ForgeReviewOperation(val wireName: String) {
    ClosePr("forgeClosePr"),
    ConvertPrToDraft("forgeConvertPrToDraft"),
    CreatePr("forgeCreatePr"),
    EditPr("forgeEditPr"),
    EditPrComment("forgeEditPrComment"),
    GetPrChecks("forgeGetPrChecks"),
    GetPrDetails("forgeGetPrDetails"),
    GetPrDiff("forgeGetPrDiff"),
    GetPrFiles("forgeGetPrFiles"),
    GetPrForBranch("forgeGetPrForBranch"),
    GetPrReviewComments("forgeGetPrReviewComments"),
    GetPrReviewGuide("forgeGetPrReviewGuide"),
    GetPrViewedFiles("forgeGetPrViewedFiles"),
    GetRepository("forgeGetRepository"),
    ListPrLabelCandidates("forgeListPrLabelCandidates"),
    ListPrReviewerCandidates("forgeListPrReviewerCandidates"),
    ListPrs("forgeListPrs"),
    ListPullRequests("forgeListPullRequests"),
    MarkPrReady("forgeMarkPrReady"),
    MergePr("forgeMergePr"),
    MergePrAtHead("forgeMergePrAtHead"),
    PostPrComment("forgePostPrComment"),
    ReopenPr("forgeReopenPr"),
    RequestPrReviewers("forgeRequestPrReviewers"),
    SetPrFileViewed("forgeSetPrFileViewed"),
    SetPrLabels("forgeSetPrLabels"),
    SubmitPrReview("forgeSubmitPrReview"),
    UpdatePrBranch("forgeUpdatePrBranch"),
    WritePrReviewGuide("forgeWritePrReviewGuide"),
    ;
    val scope: String get() = RemoteContractMetadata.procedures.single { it.name == wireName }.scope
    val isMutation: Boolean get() = scope == "session:operate"
}

/** Uses generated codecs for every payload and receipt, including explicit account scope. */
object RemoteV3ForgeReviewContract {
    fun request(operation: ForgeReviewOperation, payload: JsonObject): String {
        GeneratedRemoteV3Contract.verifyRuntimeCompatibility()
        val descriptor = RemoteContractMetadata.procedures.single { it.name == operation.wireName }
        check(descriptor.owner == "projectLocation")
        val input = canonical(operation.requestCodec(), payload.toString())
        return canonical(RemoteRootCodecs.routeU2EProcedureU2DCallU2ERequest, buildJsonObject {
            put("procedure", operation.wireName)
            put("payload", Json.parseToJsonElement(input))
        }.toString())
    }

    fun result(operation: ForgeReviewOperation, raw: String): JsonElement = try {
        val envelope = Json.parseToJsonElement(raw) as? JsonObject ?: throw IllegalArgumentException()
        val codec = operation.resultCodec()
        if (codec == null) {
            if (envelope.isNotEmpty()) throw IllegalArgumentException()
            JsonNull
        } else {
            if (envelope.keys != setOf("result")) throw IllegalArgumentException()
            Json.parseToJsonElement(canonical(codec, envelope.getValue("result").toString()))
        }
    } catch (error: RemoteClientException) {
        throw error
    } catch (_: Exception) {
        throw RemoteClientException.invalidResponse("Invalid source review receipt.")
    }

    private fun canonical(codec: RemoteRootCodec<*>, raw: String): String = try {
        codec.decode(raw).validatedSnapshot.toString()
    } catch (_: Exception) {
        throw RemoteClientException.invalidResponse("Invalid source review contract value.")
    }
}

private fun ForgeReviewOperation.requestCodec(): RemoteRootCodec<*> = when (this) {
    ForgeReviewOperation.ClosePr -> RemoteRootCodecs.procedureU2EForgeClosePrU2ERequest
    ForgeReviewOperation.ConvertPrToDraft -> RemoteRootCodecs.procedureU2EForgeConvertPrToDraftU2ERequest
    ForgeReviewOperation.CreatePr -> RemoteRootCodecs.procedureU2EForgeCreatePrU2ERequest
    ForgeReviewOperation.EditPr -> RemoteRootCodecs.procedureU2EForgeEditPrU2ERequest
    ForgeReviewOperation.EditPrComment -> RemoteRootCodecs.procedureU2EForgeEditPrCommentU2ERequest
    ForgeReviewOperation.GetPrChecks -> RemoteRootCodecs.procedureU2EForgeGetPrChecksU2ERequest
    ForgeReviewOperation.GetPrDetails -> RemoteRootCodecs.procedureU2EForgeGetPrDetailsU2ERequest
    ForgeReviewOperation.GetPrDiff -> RemoteRootCodecs.procedureU2EForgeGetPrDiffU2ERequest
    ForgeReviewOperation.GetPrFiles -> RemoteRootCodecs.procedureU2EForgeGetPrFilesU2ERequest
    ForgeReviewOperation.GetPrForBranch -> RemoteRootCodecs.procedureU2EForgeGetPrForBranchU2ERequest
    ForgeReviewOperation.GetPrReviewComments -> RemoteRootCodecs.procedureU2EForgeGetPrReviewCommentsU2ERequest
    ForgeReviewOperation.GetPrReviewGuide -> RemoteRootCodecs.procedureU2EForgeGetPrReviewGuideU2ERequest
    ForgeReviewOperation.GetPrViewedFiles -> RemoteRootCodecs.procedureU2EForgeGetPrViewedFilesU2ERequest
    ForgeReviewOperation.GetRepository -> RemoteRootCodecs.procedureU2EForgeGetRepositoryU2ERequest
    ForgeReviewOperation.ListPrLabelCandidates -> RemoteRootCodecs.procedureU2EForgeListPrLabelCandidatesU2ERequest
    ForgeReviewOperation.ListPrReviewerCandidates -> RemoteRootCodecs.procedureU2EForgeListPrReviewerCandidatesU2ERequest
    ForgeReviewOperation.ListPrs -> RemoteRootCodecs.procedureU2EForgeListPrsU2ERequest
    ForgeReviewOperation.ListPullRequests -> RemoteRootCodecs.procedureU2EForgeListPullRequestsU2ERequest
    ForgeReviewOperation.MarkPrReady -> RemoteRootCodecs.procedureU2EForgeMarkPrReadyU2ERequest
    ForgeReviewOperation.MergePr -> RemoteRootCodecs.procedureU2EForgeMergePrU2ERequest
    ForgeReviewOperation.MergePrAtHead -> RemoteRootCodecs.procedureU2EForgeMergePrAtHeadU2ERequest
    ForgeReviewOperation.PostPrComment -> RemoteRootCodecs.procedureU2EForgePostPrCommentU2ERequest
    ForgeReviewOperation.ReopenPr -> RemoteRootCodecs.procedureU2EForgeReopenPrU2ERequest
    ForgeReviewOperation.RequestPrReviewers -> RemoteRootCodecs.procedureU2EForgeRequestPrReviewersU2ERequest
    ForgeReviewOperation.SetPrFileViewed -> RemoteRootCodecs.procedureU2EForgeSetPrFileViewedU2ERequest
    ForgeReviewOperation.SetPrLabels -> RemoteRootCodecs.procedureU2EForgeSetPrLabelsU2ERequest
    ForgeReviewOperation.SubmitPrReview -> RemoteRootCodecs.procedureU2EForgeSubmitPrReviewU2ERequest
    ForgeReviewOperation.UpdatePrBranch -> RemoteRootCodecs.procedureU2EForgeUpdatePrBranchU2ERequest
    ForgeReviewOperation.WritePrReviewGuide -> RemoteRootCodecs.procedureU2EForgeWritePrReviewGuideU2ERequest
}

private fun ForgeReviewOperation.resultCodec(): RemoteRootCodec<*>? = when (this) {
    ForgeReviewOperation.ClosePr -> null
    ForgeReviewOperation.ConvertPrToDraft -> null
    ForgeReviewOperation.CreatePr -> RemoteRootCodecs.procedureU2EForgeCreatePrU2EResult
    ForgeReviewOperation.EditPr -> null
    ForgeReviewOperation.EditPrComment -> null
    ForgeReviewOperation.GetPrChecks -> RemoteRootCodecs.procedureU2EForgeGetPrChecksU2EResult
    ForgeReviewOperation.GetPrDetails -> RemoteRootCodecs.procedureU2EForgeGetPrDetailsU2EResult
    ForgeReviewOperation.GetPrDiff -> RemoteRootCodecs.procedureU2EForgeGetPrDiffU2EResult
    ForgeReviewOperation.GetPrFiles -> RemoteRootCodecs.procedureU2EForgeGetPrFilesU2EResult
    ForgeReviewOperation.GetPrForBranch -> RemoteRootCodecs.procedureU2EForgeGetPrForBranchU2EResult
    ForgeReviewOperation.GetPrReviewComments -> RemoteRootCodecs.procedureU2EForgeGetPrReviewCommentsU2EResult
    ForgeReviewOperation.GetPrReviewGuide -> RemoteRootCodecs.procedureU2EForgeGetPrReviewGuideU2EResult
    ForgeReviewOperation.GetPrViewedFiles -> RemoteRootCodecs.procedureU2EForgeGetPrViewedFilesU2EResult
    ForgeReviewOperation.GetRepository -> RemoteRootCodecs.procedureU2EForgeGetRepositoryU2EResult
    ForgeReviewOperation.ListPrLabelCandidates -> RemoteRootCodecs.procedureU2EForgeListPrLabelCandidatesU2EResult
    ForgeReviewOperation.ListPrReviewerCandidates -> RemoteRootCodecs.procedureU2EForgeListPrReviewerCandidatesU2EResult
    ForgeReviewOperation.ListPrs -> RemoteRootCodecs.procedureU2EForgeListPrsU2EResult
    ForgeReviewOperation.ListPullRequests -> RemoteRootCodecs.procedureU2EForgeListPullRequestsU2EResult
    ForgeReviewOperation.MarkPrReady -> null
    ForgeReviewOperation.MergePr -> null
    ForgeReviewOperation.MergePrAtHead -> null
    ForgeReviewOperation.PostPrComment -> RemoteRootCodecs.procedureU2EForgePostPrCommentU2EResult
    ForgeReviewOperation.ReopenPr -> null
    ForgeReviewOperation.RequestPrReviewers -> null
    ForgeReviewOperation.SetPrFileViewed -> RemoteRootCodecs.procedureU2EForgeSetPrFileViewedU2EResult
    ForgeReviewOperation.SetPrLabels -> null
    ForgeReviewOperation.SubmitPrReview -> null
    ForgeReviewOperation.UpdatePrBranch -> null
    ForgeReviewOperation.WritePrReviewGuide -> RemoteRootCodecs.procedureU2EForgeWritePrReviewGuideU2EResult
}
