package com.poracode.app.model

import com.poracode.app.protocol.github.GithubProcedure
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.put

data class GithubOperationRequest(
    val procedure: GithubProcedure,
    val payload: JsonObject,
) {
    val requiresConfirmation: Boolean get() = procedure in destructiveGithubProcedures
}

object GithubRequests {
    fun create(
        procedure: GithubProcedure,
        ownerLocation: ProjectLocation,
        fields: Map<String, JsonElement> = emptyMap(),
    ): GithubOperationRequest = GithubOperationRequest(
        procedure = procedure,
        payload = buildJsonObject {
            put(
                procedure.owner.wireName,
                RemoteJson.encodeToJsonElement(ProjectLocation.serializer(), ownerLocation),
            )
            fields.forEach { (name, value) -> put(name, value) }
        },
    )
}

private val destructiveGithubProcedures = setOf(
    GithubProcedure.CancelWorkflowRun,
    GithubProcedure.ClosePr,
    GithubProcedure.DeleteWorkflowRun,
    GithubProcedure.MergePr,
)

sealed interface GithubMutationOutcome {
    data class Applied(val result: JsonElement) : GithubMutationOutcome

    /** Exactly one authoritative read followed ambiguity; the mutation was never replayed. */
    data class Reconciled(
        val procedure: GithubProcedure,
        val authoritativeResult: JsonElement?,
    ) : GithubMutationOutcome
}
