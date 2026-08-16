package com.poracode.app.transport.richchat

import kotlinx.serialization.json.JsonObject

interface RichChatRemoteTransport {
    suspend fun truncateRuntime(threadId: String, itemId: String)
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
