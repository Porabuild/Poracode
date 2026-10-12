package com.poracode.app.model

import com.poracode.app.protocol.git.GitProcedure
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.put

data class GitOperationRequest(
    val procedure: GitProcedure,
    val payload: JsonObject,
) {
    val requiresConfirmation: Boolean get() = GitSafety.requiresConfirmation(this)
}

object GitRequests {
    fun create(
        procedure: GitProcedure,
        ownerLocation: ProjectLocation,
        fields: Map<String, JsonElement> = emptyMap(),
    ): GitOperationRequest = GitOperationRequest(
        procedure,
        buildJsonObject {
            put(
                procedure.owner.wireName,
                RemoteJson.encodeToJsonElement(ProjectLocation.serializer(), ownerLocation),
            )
            fields.forEach { (name, value) -> put(name, value) }
        },
    )
}

/** Confirmation policy is centralized so UI and tests cannot disagree. */
object GitSafety {
    fun requiresConfirmation(request: GitOperationRequest): Boolean = when (request.procedure) {
        GitProcedure.AbortMerge,
        GitProcedure.DeleteBranch,
        GitProcedure.PruneWorktrees,
        GitProcedure.RemoveWorktree,
        GitProcedure.Revert,
        GitProcedure.RevertAll,
        -> true
        else -> false
    }
}

sealed interface GitMutationOutcome {
    data class Applied(val result: JsonElement) : GitMutationOutcome

    /** The mutation was never replayed; this is the single authoritative read after ambiguity. */
    data class Reconciled(
        val procedure: GitProcedure,
        val authoritativeStatus: JsonElement?,
    ) : GitMutationOutcome
}
