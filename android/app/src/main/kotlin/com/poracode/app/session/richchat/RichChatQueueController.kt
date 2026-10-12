package com.poracode.app.session.richchat

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject

private const val OP_QUEUE = "queue"

/**
 * Follow-up queue mutations, split from the controller below the source-size
 * gate. Every call is one operate-scoped gateway mutation; state settles on
 * the authoritative `thread-follow-up-queue` broadcast, so there are no
 * optimistic local edits.
 */
suspend fun RichChatController.queueFollowUp(
    prompt: String,
    config: JsonObject,
    segments: JsonArray? = null,
): RichChatOperationResult<Unit> = mutate(OP_QUEUE, RichChatCapability.Operate) {
    sessionGateway.queueFollowUp(it.host, it.threadId, prompt, config, segments)
}

suspend fun RichChatController.removeQueuedFollowUp(id: String): RichChatOperationResult<Unit> =
    mutate(OP_QUEUE, RichChatCapability.Operate) {
        sessionGateway.removeQueuedFollowUp(it.host, it.threadId, id)
    }

suspend fun RichChatController.reorderQueuedFollowUp(
    id: String,
    beforeId: String?,
): RichChatOperationResult<Unit> = mutate(OP_QUEUE, RichChatCapability.Operate) {
    sessionGateway.reorderQueuedFollowUp(it.host, it.threadId, id, beforeId)
}

suspend fun RichChatController.editQueuedFollowUp(
    payload: JsonObject,
): RichChatOperationResult<Unit> = mutate(OP_QUEUE, RichChatCapability.Operate) {
    sessionGateway.editQueuedFollowUp(it.host, it.threadId, payload)
}

suspend fun RichChatController.steerQueuedFollowUp(id: String): RichChatOperationResult<Unit> =
    mutate(OP_QUEUE, RichChatCapability.Operate) {
        sessionGateway.steerQueuedFollowUp(it.host, it.threadId, id)
    }

suspend fun RichChatController.pauseFollowUps(id: String): RichChatOperationResult<Unit> =
    mutate(OP_QUEUE, RichChatCapability.Operate) {
        sessionGateway.pauseFollowUps(it.host, it.threadId, id)
    }

suspend fun RichChatController.resumeFollowUps(): RichChatOperationResult<Unit> =
    mutate(OP_QUEUE, RichChatCapability.Operate) {
        sessionGateway.resumeFollowUps(it.host, it.threadId)
    }
