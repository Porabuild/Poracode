package com.poracode.app.transport.richchat

import kotlinx.serialization.json.JsonObject

interface RichChatRemoteTransport {
    suspend fun truncateRuntime(threadId: String, itemId: String)
    suspend fun checkpointRevert(threadId: String, payload: JsonObject): String
    suspend fun threadCommand(threadId: String, command: JsonObject) {
        throw RichChatTransportUnavailableException()
    }
    suspend fun updateThreadGoal(threadId: String, update: ThreadGoalUpdate)
    suspend fun setSteer(threadId: String, input: ThreadSteerInput)
    suspend fun clearSteer(threadId: String)
    suspend fun resolveRequest(threadId: String, resolution: RequestResolution)
    suspend fun closeThread(threadId: String)
    suspend fun startTerminal(input: TerminalStartInput)
    suspend fun writeTerminal(threadId: String, data: String)
    suspend fun resizeTerminal(threadId: String, columns: Int, rows: Int)
    suspend fun closeTerminal(threadId: String)

    suspend fun rollbackThreadConversation(payload: JsonObject)
    suspend fun createFileCheckpoint(payload: JsonObject): JsonObject
    suspend fun finalizeFileCheckpoint(payload: JsonObject): JsonObject
    suspend fun listFileCheckpoints(payload: JsonObject): JsonObject
    suspend fun restoreFileCheckpoint(payload: JsonObject)
    suspend fun subagentSubscribe(payload: JsonObject): JsonObject
    suspend fun subagentUnsubscribe(payload: JsonObject)
    suspend fun stageThreadInput(payload: JsonObject)

    // Follow-up queue procedures. Hosts without the queue answer the stable
    // 501 follow_up_queue_unsupported, which the client layer maps; payloads
    // carry the canonical {threadId, ...} shapes from the generated contract.
    suspend fun queueFollowUp(threadId: String, payload: JsonObject) {
        throw RichChatTransportUnavailableException()
    }

    suspend fun removeQueuedFollowUp(threadId: String, id: String) {
        throw RichChatTransportUnavailableException()
    }

    suspend fun reorderQueuedFollowUp(threadId: String, id: String, beforeId: String?) {
        throw RichChatTransportUnavailableException()
    }

    suspend fun editQueuedFollowUp(threadId: String, payload: JsonObject) {
        throw RichChatTransportUnavailableException()
    }

    suspend fun steerQueuedFollowUp(threadId: String, id: String) {
        throw RichChatTransportUnavailableException()
    }

    suspend fun pauseFollowUps(threadId: String, id: String) {
        throw RichChatTransportUnavailableException()
    }

    suspend fun resumeFollowUps(threadId: String) {
        throw RichChatTransportUnavailableException()
    }

    suspend fun getFollowUpQueue(threadId: String): JsonObject? {
        throw RichChatTransportUnavailableException()
    }

    suspend fun uploadAttachment(
        threadId: String,
        name: String,
        contentType: String,
        body: AttachmentUploadBody,
    ): String

    fun localImageRequest(path: String): BinaryRequestPlan
    fun runtimeImageRequest(
        threadId: String,
        itemId: String,
        path: List<RuntimeImagePathSegment>,
    ): BinaryRequestPlan
}
