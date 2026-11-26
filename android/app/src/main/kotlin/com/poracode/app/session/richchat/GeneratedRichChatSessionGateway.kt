package com.poracode.app.session.richchat

import com.poracode.app.chat.RichCheckpoint
import com.poracode.app.chat.RichEventDecoder
import com.poracode.app.chat.RichSnapshotMapping
import com.poracode.app.model.RemoteRuntimeGapAck
import com.poracode.app.model.RemoteRuntimeGapRead
import com.poracode.app.session.history.historyChanges
import com.poracode.app.session.history.historyItems
import com.poracode.app.session.history.historyTail
import com.poracode.app.session.history.historyTurns
import com.poracode.app.transport.RemoteApiGateway
import com.poracode.app.transport.RemoteBinaryResponse
import com.poracode.app.transport.RemoteHistoryNoticeGateway
import com.poracode.app.transport.richchat.AttachmentUploadBody
import com.poracode.app.transport.richchat.BinaryRequestPlan
import com.poracode.app.transport.richchat.RequestResolution
import com.poracode.app.transport.richchat.RichChatBinaryBodyExecutor
import com.poracode.app.transport.richchat.RichChatRemoteTransport
import com.poracode.app.transport.richchat.RuntimeImagePathSegment
import com.poracode.app.transport.richchat.TerminalStartInput
import com.poracode.app.transport.richchat.ThreadGoalUpdate
import com.poracode.app.transport.richchat.ThreadSteerInput
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put

/** Host-routed adapter that revalidates lease and exact capability around every call. */
class GeneratedRichChatSessionGateway(
    session: StateFlow<RichChatHostLease?>,
    provider: RichChatGatewayProvider,
    private val receivedAtEpochMs: () -> Long = { System.currentTimeMillis() },
) : RichChatSessionGateway {
    private val invocation = RichChatGatewayInvocation(session, provider)
    override suspend fun history(
        lease: RichChatHostLease,
        threadId: String,
        targetTimelineEntryCount: Int,
    ): RichChatHistorySnapshot = invocation.invoke(lease, RichChatCapability.Read, false) {
        RichChatHistoryMapper.snapshot(
            lease.connectionId,
            core.historyTail(threadId, targetTimelineEntryCount),
            receivedAtEpochMs(),
        ).also { if (it.key.threadId != threadId) invalidResponse() }
    }

    override suspend fun historyChanges(
        lease: RichChatHostLease,
        threadId: String,
        cursor: String,
        afterSeq: Int?,
        targetTimelineEntryCount: Int,
    ): RichChatHistoryResumeOutcome = invocation.invoke(lease, RichChatCapability.Read, false) {
        val raw = core.historyChanges(threadId, cursor, afterSeq, targetTimelineEntryCount)
        RichChatHistoryResumeMapper.outcome(lease.connectionId, raw, receivedAtEpochMs()).also { out ->
            val ownerThread = when (out) {
                is RichChatHistoryResumeOutcome.Events -> out.resumed.key.threadId
                is RichChatHistoryResumeOutcome.Snapshot -> out.snapshot.key.threadId
            }
            if (ownerThread != threadId) invalidResponse()
        }
    }

    override suspend fun refreshHistoryCache(
        lease: RichChatHostLease,
        threadId: String,
        targetTimelineEntryCount: Int,
    ) {
        runCatching {
            invocation.invoke(lease, RichChatCapability.Read, false) {
                core.historyTail(threadId, targetTimelineEntryCount)
            }
        }.onFailure { error ->
            if (error is CancellationException) throw error
        }
    }

    override suspend fun olderItems(
        lease: RichChatHostLease, threadId: String, beforePosition: Int, limit: Int, targetTimelineEntryCount: Int,
    ): RichChatHistoryPage = invocation.invoke(lease, RichChatCapability.Read, false) {
        RichChatHistoryMapper.page(core.historyItems(threadId, beforePosition, limit, targetTimelineEntryCount))
    }

    override suspend fun olderTurns(
        lease: RichChatHostLease, threadId: String, cursor: String, limit: Int,
    ): RichChatTurnsPage = invocation.invoke(lease, RichChatCapability.Read, false) {
        RichChatHistoryMapper.turnPage(core.historyTurns(threadId, cursor, limit))
    }

    override suspend fun runtimeGap(lease: RichChatHostLease, threadId: String): RemoteRuntimeGapRead =
        invocation.invoke(lease, RichChatCapability.Read, false) { noticeCore().threadRuntimeGap(threadId) }

    override suspend fun acknowledgeRuntimeGap(
        lease: RichChatHostLease, threadId: String, episodeToken: String, commandId: String,
    ): RemoteRuntimeGapAck = invocation.invoke(lease, RichChatCapability.Operate, true) {
        noticeCore().acknowledgeThreadRuntimeGap(threadId, episodeToken, commandId)
    }

    override suspend fun send(
        lease: RichChatHostLease, threadId: String, prompt: String,
        config: com.poracode.app.model.ThreadConfig, segments: JsonArray?, userMessageItemId: String?,
    ) = invocation.invoke(lease, RichChatCapability.Operate, true) {
        core.sendThreadInput(threadId, prompt, config, segments, userMessageItemId)
    }

    override suspend fun interrupt(lease: RichChatHostLease, threadId: String) =
        invocation.invoke(lease, RichChatCapability.Operate, true) { core.interruptThread(threadId) }

    override suspend fun truncate(lease: RichChatHostLease, threadId: String, itemId: String) =
        invocation.invoke(lease, RichChatCapability.Operate, true) { rich.truncateRuntime(threadId, itemId) }

    override suspend fun updateGoal(lease: RichChatHostLease, threadId: String, update: ThreadGoalUpdate) =
        invocation.invoke(lease, RichChatCapability.Operate, true) { rich.updateThreadGoal(threadId, update) }

    override suspend fun setSteer(lease: RichChatHostLease, threadId: String, input: ThreadSteerInput) =
        invocation.invoke(lease, RichChatCapability.Operate, true) { rich.setSteer(threadId, input) }

    override suspend fun clearSteer(lease: RichChatHostLease, threadId: String) =
        invocation.invoke(lease, RichChatCapability.Operate, true) { rich.clearSteer(threadId) }

    override suspend fun queueFollowUp(
        lease: RichChatHostLease,
        threadId: String,
        prompt: String,
        config: JsonObject,
        segments: JsonArray?,
    ) = invocation.invoke(lease, RichChatCapability.Operate, true) {
        rich.queueFollowUp(
            threadId,
            buildJsonObject {
                put("threadId", threadId)
                put("prompt", prompt)
                segments?.let { put("segments", it) }
                put("config", config)
            },
        )
    }

    override suspend fun removeQueuedFollowUp(lease: RichChatHostLease, threadId: String, id: String) =
        invocation.invoke(lease, RichChatCapability.Operate, true) { rich.removeQueuedFollowUp(threadId, id) }

    override suspend fun reorderQueuedFollowUp(
        lease: RichChatHostLease,
        threadId: String,
        id: String,
        beforeId: String?,
    ) = invocation.invoke(lease, RichChatCapability.Operate, true) {
        rich.reorderQueuedFollowUp(threadId, id, beforeId)
    }

    override suspend fun editQueuedFollowUp(
        lease: RichChatHostLease,
        threadId: String,
        payload: JsonObject,
    ) = invocation.invoke(lease, RichChatCapability.Operate, true) {
        rich.editQueuedFollowUp(threadId, JsonObject(payload + ("threadId" to JsonPrimitive(threadId))))
    }

    override suspend fun steerQueuedFollowUp(lease: RichChatHostLease, threadId: String, id: String) =
        invocation.invoke(lease, RichChatCapability.Operate, true) { rich.steerQueuedFollowUp(threadId, id) }

    override suspend fun pauseFollowUps(lease: RichChatHostLease, threadId: String, id: String) =
        invocation.invoke(lease, RichChatCapability.Operate, true) { rich.pauseFollowUps(threadId, id) }

    override suspend fun resumeFollowUps(lease: RichChatHostLease, threadId: String) =
        invocation.invoke(lease, RichChatCapability.Operate, true) { rich.resumeFollowUps(threadId) }

    override suspend fun threadCommand(
        lease: RichChatHostLease,
        threadId: String,
        command: JsonObject,
    ) = invocation.invoke(lease, RichChatCapability.Operate, true) {
        val commandTransport = commands ?: unavailable("thread_command_transport")
        commandTransport.execute(threadId, command)
    }

    override suspend fun closeThread(lease: RichChatHostLease, threadId: String) =
        invocation.invoke(lease, RichChatCapability.Operate, true) { rich.closeThread(threadId) }

    override suspend fun resolveRequest(
        lease: RichChatHostLease,
        threadId: String,
        resolution: RequestResolution,
    ) = invocation.invoke(lease, RichChatCapability.ResolveRequests, true) {
        rich.resolveRequest(threadId, resolution)
    }

    override suspend fun rollback(
        lease: RichChatHostLease,
        threadId: String,
        payload: JsonObject,
    ) = invokeThreadProcedure(lease, threadId, payload, RichChatCapability.Operate, true) {
        rich.rollbackThreadConversation(payload)
    }

    override suspend fun checkpointRevert(
        lease: RichChatHostLease,
        threadId: String,
        payload: JsonObject,
    ) {
        invokeThreadProcedure(lease, threadId, payload, RichChatCapability.Operate, true) {
            rich.checkpointRevert(threadId, payload)
        }
    }

    override suspend fun createCheckpoint(
        lease: RichChatHostLease,
        threadId: String,
        payload: JsonObject,
    ): RichCheckpoint = invokeThreadProcedure(
        lease,
        threadId,
        payload,
        RichChatCapability.Operate,
        true,
    ) { RichChatCheckpointResponseDecoder.decodeCheckpointResult(rich.createFileCheckpoint(payload), mutation = true) }

    override suspend fun finalizeCheckpoint(
        lease: RichChatHostLease,
        threadId: String,
        payload: JsonObject,
    ): RichCheckpoint = invokeThreadProcedure(
        lease,
        threadId,
        payload,
        RichChatCapability.Operate,
        true,
    ) { RichChatCheckpointResponseDecoder.decodeCheckpointResult(rich.finalizeFileCheckpoint(payload), mutation = true) }

    override suspend fun listCheckpoints(
        lease: RichChatHostLease,
        threadId: String,
        payload: JsonObject,
    ): RichCheckpointCollection = invokeThreadProcedure(
        lease,
        threadId,
        payload,
        RichChatCapability.Read,
        false,
    ) { RichChatCheckpointResponseDecoder.decodeCheckpointCollection(rich.listFileCheckpoints(payload), threadId) }

    override suspend fun restoreCheckpoint(
        lease: RichChatHostLease,
        threadId: String,
        payload: JsonObject,
    ) = invokeThreadProcedure(lease, threadId, payload, RichChatCapability.Operate, true) {
        rich.restoreFileCheckpoint(payload)
    }

    override suspend fun stageInput(
        lease: RichChatHostLease,
        threadId: String,
        payload: JsonObject,
    ) = invokeThreadProcedure(lease, threadId, payload, RichChatCapability.Operate, true) {
        rich.stageThreadInput(payload)
    }

    override suspend fun listSessionActions(
        lease: RichChatHostLease,
        threadId: String,
    ): List<String> = invocation.invoke(lease, RichChatCapability.Read, false) {
        val result = rich.listThreadSessionActions(buildJsonObject { put("threadId", threadId) })
        val actions = result["actions"] as? JsonArray ?: invalidResponse()
        actions.map { action ->
            ((action as? JsonObject)?.get("id") as? JsonPrimitive)
                ?.takeIf { it.isString && it.content.isNotEmpty() }
                ?.content
                ?: invalidResponse()
        }
    }

    override suspend fun subscribeDelegatedAgent(
        lease: RichChatHostLease,
        threadId: String,
        parentItemId: String,
        viewerId: String,
    ): RichChatDelegatedWatchResult = invocation.invoke(lease, RichChatCapability.Read, false) {
        val result = rich.subagentSubscribe(
            buildJsonObject {
                put("threadId", threadId)
                put("parentItemId", parentItemId)
                put("viewerId", viewerId)
            },
        )
        val rawHistory = result["history"] as? JsonArray ?: invalidResponse()
        val history = rawHistory.map { value ->
            RichEventDecoder.decode(lease.connectionId, value)
                ?.takeIf { it.threadKey.threadId == threadId }
                ?: invalidResponse()
        }
        val leaseMs = (result["leaseMs"] as? JsonPrimitive)?.longOrNull
        RichChatDelegatedWatchResult(history = history, leaseMs = leaseMs)
    }

    override suspend fun unsubscribeDelegatedAgent(
        lease: RichChatHostLease,
        threadId: String,
        parentItemId: String,
        viewerId: String,
    ) {
        invocation.invoke(lease, RichChatCapability.Read, false) {
            rich.subagentUnsubscribe(
                buildJsonObject {
                    put("threadId", threadId)
                    put("parentItemId", parentItemId)
                    put("viewerId", viewerId)
                },
            )
        }
    }

    override suspend fun controlMcpApp(lease: RichChatHostLease, threadId: String, payload: JsonObject): JsonObject =
        invokeThreadProcedure(lease, threadId, payload, RichChatCapability.Operate, true) {
            rich.controlMcpApp(payload)
        }

    override suspend fun invokeSessionAction(
        lease: RichChatHostLease,
        threadId: String,
        actionId: String,
        payload: JsonObject,
    ): JsonObject {
        val wirePayload = buildJsonObject {
            put("threadId", threadId)
            put("actionId", actionId)
            put("payload", payload)
        }
        return invokeThreadProcedure(lease, threadId, wirePayload, RichChatCapability.Operate, true) {
            rich.invokeThreadSessionAction(wirePayload)
        }
    }

    override suspend fun uploadAttachment(
        lease: RichChatHostLease,
        threadId: String,
        name: String,
        contentType: String,
        body: AttachmentUploadBody,
    ): String = invocation.invoke(lease, RichChatCapability.Operate, true) {
        rich.uploadAttachment(threadId, name, contentType, body)
    }

    override suspend fun localImagePlan(lease: RichChatHostLease, path: String): BinaryRequestPlan =
        invocation.invokePlan(lease, RichChatCapability.Read) { rich.localImageRequest(path) }

    override suspend fun runtimeImagePlan(
        lease: RichChatHostLease,
        threadId: String,
        itemId: String,
        path: List<RuntimeImagePathSegment>,
    ): BinaryRequestPlan = invocation.invokePlan(lease, RichChatCapability.Read) {
        rich.runtimeImageRequest(threadId, itemId, path)
    }

    override suspend fun loadLocalImage(
        lease: RichChatHostLease,
        path: String,
        variant: String?,
    ): RemoteBinaryResponse = invocation.invoke(lease, RichChatCapability.Read, false) {
        val executor = binary ?: unavailable("binary_transport")
        executor.execute(rich.localImageRequest(path, variant))
    }

    override suspend fun loadRuntimeImage(
        lease: RichChatHostLease,
        threadId: String,
        itemId: String,
        path: List<RuntimeImagePathSegment>,
        variant: String?,
    ): RemoteBinaryResponse = invocation.invoke(lease, RichChatCapability.Read, false) {
        val executor = binary ?: unavailable("binary_transport")
        executor.execute(rich.runtimeImageRequest(threadId, itemId, path, variant))
    }

    override suspend fun downloadRichFile(
        lease: RichChatHostLease,
        request: com.poracode.app.chat.RichChatFileAccess,
        projectLocation: com.poracode.app.model.ProjectLocation,
        suggestedName: String,
        destinationDirectory: java.io.File,
    ): com.poracode.app.transport.richchat.RichChatDownloadedFile {
        // The post-operation lease check inside invocation.invoke() can throw AFTER the
        // transfer completed; capture the result so a discarded download never
        // leaks its private directory.
        var completed: com.poracode.app.transport.richchat.RichChatDownloadedFile? = null
        try {
            return invocation.invoke(lease, RichChatCapability.Read, false) {
                val transport = files ?: unavailable("file_transport")
                transport
                    .downloadRichFile(request, projectLocation, suggestedName, destinationDirectory)
                    .also { completed = it }
            }
        } catch (error: Throwable) {
            completed?.directory?.deleteRecursively()
            throw error
        }
    }

    override suspend fun startTerminal(lease: RichChatHostLease, input: TerminalStartInput) =
        invocation.invoke(lease, RichChatCapability.TerminalOperate, true) { rich.startTerminal(input) }

    override suspend fun watchTerminal(
        lease: RichChatHostLease,
        request: RichTerminalWatchRequest,
    ) = invocation.invoke(lease, RichChatCapability.TerminalRead, false) {
        val socket = terminalWatch ?: unavailable("terminal_watch_transport")
        socket.watch(request)
    }

    override suspend fun unwatchTerminal(lease: RichChatHostLease, terminalId: String) =
        invocation.invoke(lease, RichChatCapability.TerminalRead, false) {
            val socket = terminalWatch ?: unavailable("terminal_watch_transport")
            socket.unwatch(terminalId)
        }

    override suspend fun writeTerminal(
        lease: RichChatHostLease,
        threadId: String,
        data: String,
    ) = invocation.invoke(lease, RichChatCapability.TerminalOperate, true) {
        rich.writeTerminal(threadId, data)
    }

    override suspend fun resizeTerminal(
        lease: RichChatHostLease,
        threadId: String,
        columns: Int,
        rows: Int,
    ) = invocation.invoke(lease, RichChatCapability.TerminalOperate, true) {
        rich.resizeTerminal(threadId, columns, rows)
    }

    override suspend fun closeTerminal(lease: RichChatHostLease, threadId: String) =
        invocation.invoke(lease, RichChatCapability.TerminalOperate, true) { rich.closeTerminal(threadId) }

    private suspend fun <T> invokeThreadProcedure(
        lease: RichChatHostLease,
        threadId: String,
        payload: JsonObject,
        capability: RichChatCapability,
        mutation: Boolean,
        operation: suspend RichChatGatewayBundle.() -> T,
    ): T {
        if ((payload["threadId"] as? JsonPrimitive)?.content != threadId) {
            throw RichChatGatewayException(400, "invalid_request", false)
        }
        return invocation.invoke(lease, capability, mutation, operation)
    }

    private fun RichChatGatewayBundle.noticeCore(): RemoteHistoryNoticeGateway =
        core as? RemoteHistoryNoticeGateway
            ?: throw RichChatGatewayException(501, "runtime_notice_transport", false)

    private fun unavailable(code: String): Nothing = throw RichChatGatewayException(501, code, false)
}
