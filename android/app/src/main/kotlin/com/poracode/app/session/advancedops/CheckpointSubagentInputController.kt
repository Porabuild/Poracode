package com.poracode.app.session.advancedops

import com.poracode.app.protocol.advancedops.AdvancedOperation
import com.poracode.app.protocol.advancedops.AdvancedPayloads
import com.poracode.app.protocol.advancedops.AdvancedResultAdapters
import com.poracode.app.protocol.advancedops.FileCheckpoint
import com.poracode.app.protocol.advancedops.SubagentHistory
import kotlinx.serialization.json.JsonArray

/** Integration API for checkpoint, subagent subscription, and staged-input features. */
class CheckpointSubagentInputController(private val gateway: AdvancedOpsGateway) {
    private val runtime = AdvancedControllerRuntime()

    suspend fun createCheckpoint(owner: ThreadAdvancedOwner, checkpointItemId: String) =
        runtime.mutation("checkpoint:create:${owner.serializationKey}") {
            gateway.mutate(
                call(
                    AdvancedOperation.CreateFileCheckpoint,
                    owner,
                    AdvancedPayloads.checkpoint(owner.location, owner.threadId, checkpointItemId),
                ),
            ).requireApplied(AdvancedResultAdapters::checkpoint)
        }

    suspend fun finalizeCheckpoint(
        owner: ThreadAdvancedOwner,
        checkpointItemId: String,
        baseCheckpointItemId: String,
    ): AdvancedControllerResult<FileCheckpoint> = runtime.mutation(
        "checkpoint:finalize:${owner.serializationKey}",
    ) {
        gateway.mutate(
            call(
                AdvancedOperation.FinalizeFileCheckpoint,
                owner,
                AdvancedPayloads.finalizeCheckpoint(
                    owner.location,
                    owner.threadId,
                    checkpointItemId,
                    baseCheckpointItemId,
                ),
            ),
        ).requireApplied(AdvancedResultAdapters::checkpoint)
    }

    suspend fun subscribe(
        owner: ThreadAdvancedOwner,
        parentItemId: String,
    ): AdvancedControllerResult<SubagentHistory> = runtime.read(
        "subagent:${owner.serializationKey}:$parentItemId",
    ) {
        AdvancedResultAdapters.subagentHistory(
            gateway.read(
                call(
                    AdvancedOperation.SubagentSubscribe,
                    owner,
                    AdvancedPayloads.subscription(owner.threadId, parentItemId),
                ),
            ),
        )
    }

    suspend fun unsubscribe(owner: ThreadAdvancedOwner, parentItemId: String) =
        runtime.mutation("subagent:unsubscribe:${owner.serializationKey}") {
            gateway.mutate(
                call(
                    AdvancedOperation.SubagentUnsubscribe,
                    owner,
                    AdvancedPayloads.subscription(owner.threadId, parentItemId),
                ),
            )
        }

    suspend fun stageInput(
        owner: ThreadAdvancedOwner,
        prompt: String,
        segments: JsonArray? = null,
    ) = runtime.mutation("input:stage:${owner.serializationKey}") {
        gateway.mutate(
            call(
                AdvancedOperation.StageThreadInput,
                owner,
                AdvancedPayloads.stagedInput(owner.threadId, prompt, segments),
            ),
        )
    }

    fun close() = runtime.close()
}

private fun call(
    operation: AdvancedOperation,
    owner: ThreadAdvancedOwner,
    payload: kotlinx.serialization.json.JsonObject,
) = AdvancedCall(operation, owner, payload)

private fun <T> AdvancedMutationOutcome.requireApplied(
    adapter: (kotlinx.serialization.json.JsonElement) -> T,
): T = when (this) {
    is AdvancedMutationOutcome.Applied -> adapter(result)
    is AdvancedMutationOutcome.Reconciled,
    AdvancedMutationOutcome.Unknown,
    -> throw AdvancedGatewayException(0, "outcome_unknown", true)
}
