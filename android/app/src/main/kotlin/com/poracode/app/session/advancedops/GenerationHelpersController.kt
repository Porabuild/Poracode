package com.poracode.app.session.advancedops

import com.poracode.app.protocol.advancedops.AdvancedOperation
import com.poracode.app.protocol.advancedops.AdvancedPayloads
import com.poracode.app.protocol.advancedops.AdvancedResultAdapters
import com.poracode.app.protocol.advancedops.CommitMessageResult
import com.poracode.app.protocol.advancedops.GeneratedPrSummaryResult
import com.poracode.app.protocol.advancedops.GeneratedTitleResult

data class GenerationOptions(
    val agentKind: String,
    val model: String? = null,
    val effort: String? = null,
    val fast: Boolean? = null,
    val language: String? = null,
)

/** Serialized one-attempt generators; only the newest result for each owner may publish. */
class GenerationHelpersController(private val gateway: AdvancedOpsGateway) {
    private val runtime = AdvancedControllerRuntime()

    suspend fun commitMessage(
        owner: ProjectLocationAdvancedOwner,
        options: GenerationOptions,
    ): AdvancedControllerResult<CommitMessageResult> = generate(
        "generation:commit:${owner.serializationKey}",
        AdvancedOperation.GenerateCommitMessage,
        owner,
        AdvancedPayloads.generation(
            owner.location,
            options.agentKind,
            options.model,
            options.effort,
            options.fast,
            options.language,
        ),
        AdvancedResultAdapters::commitMessage,
    )

    suspend fun title(
        owner: ProjectLocationAdvancedOwner,
        prompt: String,
        options: GenerationOptions,
    ): AdvancedControllerResult<GeneratedTitleResult> = generate(
        "generation:title:${owner.serializationKey}",
        AdvancedOperation.GenerateTitle,
        owner,
        AdvancedPayloads.generation(
            owner.location,
            options.agentKind,
            options.model,
            options.effort,
            options.fast,
            options.language,
            prompt = prompt,
        ),
        AdvancedResultAdapters::title,
    )

    suspend fun prSummary(
        owner: ProjectLocationAdvancedOwner,
        branch: String,
        baseBranch: String,
        options: GenerationOptions,
    ): AdvancedControllerResult<GeneratedPrSummaryResult> = generate(
        "generation:pr:${owner.serializationKey}",
        AdvancedOperation.GeneratePrSummary,
        owner,
        AdvancedPayloads.generation(
            owner.location,
            options.agentKind,
            options.model,
            options.effort,
            fast = null,
            language = options.language,
            branch = branch,
            baseBranch = baseBranch,
        ),
        AdvancedResultAdapters::prSummary,
    )

    fun close() = runtime.close()

    private suspend fun <T> generate(
        key: String,
        operation: AdvancedOperation,
        owner: ProjectLocationAdvancedOwner,
        payload: kotlinx.serialization.json.JsonObject,
        adapter: (kotlinx.serialization.json.JsonElement) -> T,
    ): AdvancedControllerResult<T> = runtime.mutation(key, latestOutputWins = true) {
        when (val outcome = gateway.mutate(AdvancedCall(operation, owner, payload))) {
            is AdvancedMutationOutcome.Applied -> adapter(outcome.result)
            is AdvancedMutationOutcome.Reconciled,
            AdvancedMutationOutcome.Unknown,
            -> throw AdvancedGatewayException(0, "outcome_unknown", true)
        }
    }
}
