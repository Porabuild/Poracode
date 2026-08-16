package com.poracode.app.session.advancedops

import com.poracode.app.protocol.advancedops.AdvancedOperation
import com.poracode.app.protocol.advancedops.AdvancedPayloads
import com.poracode.app.protocol.advancedops.AdvancedResultAdapters
import com.poracode.app.protocol.advancedops.WorkflowAgentChatResult
import com.poracode.app.protocol.advancedops.WorkflowRunResult

/** Latest-wins workflow manifest and agent-transcript reads. */
class WorkflowController(private val gateway: AdvancedOpsGateway) {
    private val runtime = AdvancedControllerRuntime()

    suspend fun getRun(
        owner: LocationAdvancedOwner,
        manifestPath: String,
        transcriptDir: String? = null,
        includeAgentChats: Boolean? = null,
    ): AdvancedControllerResult<WorkflowRunResult> = runtime.read(
        "workflow:run:${owner.serializationKey}:$manifestPath",
    ) {
        AdvancedResultAdapters.workflowRun(
            gateway.read(
                AdvancedCall(
                    AdvancedOperation.WorkflowGetRun,
                    owner,
                    AdvancedPayloads.workflowRun(
                        owner.location,
                        manifestPath,
                        transcriptDir,
                        includeAgentChats,
                    ),
                ),
            ),
        )
    }

    suspend fun agentChat(
        owner: LocationAdvancedOwner,
        threadId: String,
        transcriptDir: String,
        agentId: String,
        agentFinished: Boolean,
    ): AdvancedControllerResult<WorkflowAgentChatResult> = runtime.read(
        "workflow:chat:${owner.serializationKey}:$threadId:$agentId",
    ) {
        AdvancedResultAdapters.workflowChat(
            gateway.read(
                AdvancedCall(
                    AdvancedOperation.WorkflowAgentChat,
                    owner,
                    AdvancedPayloads.workflowChat(
                        owner.location,
                        threadId,
                        transcriptDir,
                        agentId,
                        agentFinished,
                    ),
                ),
            ),
        )
    }

    fun close() = runtime.close()
}
