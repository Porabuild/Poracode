package com.poracode.app.session.richchat

import com.poracode.app.chat.RichCheckpoint
import com.poracode.app.chat.RichSnapshotMapping
import com.poracode.app.model.RemoteClientException
import com.poracode.app.transport.RemoteApiGateway
import com.poracode.app.transport.RemoteBinaryResponse
import com.poracode.app.transport.RemoteMutationClassification
import com.poracode.app.transport.richchat.AttachmentUploadBody
import com.poracode.app.transport.richchat.BinaryRequestPlan
import com.poracode.app.transport.richchat.RequestResolution
import com.poracode.app.transport.richchat.RichChatAuthorizationException
import com.poracode.app.transport.richchat.RichChatBinaryBodyExecutor
import com.poracode.app.transport.richchat.RichChatInvalidRequestException
import com.poracode.app.transport.richchat.RichChatInvalidResponseException
import com.poracode.app.transport.richchat.RichChatMutationOutcomeUnknownException
import com.poracode.app.transport.richchat.RichChatRemoteRejectedException
import com.poracode.app.transport.richchat.RichChatRemoteTransport
import com.poracode.app.transport.richchat.RichChatTransportUnavailableException
import com.poracode.app.transport.richchat.RuntimeImagePathSegment
import com.poracode.app.transport.richchat.TerminalStartInput
import com.poracode.app.transport.richchat.ThreadGoalUpdate
import com.poracode.app.transport.richchat.ThreadSteerInput
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

fun interface RichThreadCommandTransport {
    suspend fun execute(threadId: String, command: JsonObject)
}

interface RichTerminalWatchTransport {
    suspend fun watch(request: RichTerminalWatchRequest)
    suspend fun unwatch(terminalId: String)
}

/** Supplied only by composition that disables HTTP automatic connection retries for mutations. */
enum class RichChatMutationDelivery {
    SingleAttempt,
    AutomaticRetryPossible,
}

data class RichChatGatewayBundle(
    val core: RemoteApiGateway,
    val rich: RichChatRemoteTransport,
    val mutationDelivery: RichChatMutationDelivery,
    val commands: RichThreadCommandTransport? = null,
    val terminalWatch: RichTerminalWatchTransport? = null,
    val binary: RichChatBinaryBodyExecutor? = null,
)

fun interface RichChatGatewayProvider {
    suspend fun bundleFor(lease: RichChatHostLease): RichChatGatewayBundle?
}

/** Host-routed adapter that revalidates lease and exact capability around every call. */
class GeneratedRichChatSessionGateway(
    private val session: StateFlow<RichChatHostLease?>,
    private val provider: RichChatGatewayProvider,
    private val receivedAtEpochMs: () -> Long = { System.currentTimeMillis() },
) : RichChatSessionGateway {
    override suspend fun history(
        lease: RichChatHostLease,
        threadId: String,
        targetTimelineEntryCount: Int,
    ): RichChatHistorySnapshot = invoke(lease, RichChatCapability.Read, false) {
        RichChatHistoryMapper.snapshot(
            lease.connectionId,
            core.threadHistory(threadId, targetTimelineEntryCount),
            receivedAtEpochMs(),
        ).also { if (it.key.threadId != threadId) invalidResponse() }
    }

    override suspend fun olderItems(
        lease: RichChatHostLease,
        threadId: String,
        beforePosition: Int,
        limit: Int,
        targetTimelineEntryCount: Int,
    ): RichChatHistoryPage = invoke(lease, RichChatCapability.Read, false) {
        RichChatHistoryMapper.page(
            core.threadRuntimeItemsPage(
                threadId,
                beforePosition,
                limit,
                targetTimelineEntryCount,
            ),
        )
    }

    override suspend fun send(
        lease: RichChatHostLease,
        threadId: String,
        prompt: String,
        config: com.poracode.app.model.ThreadConfig,
        segments: JsonArray?,
        userMessageItemId: String?,
    ) = invoke(lease, RichChatCapability.Operate, true) {
        core.sendThreadInput(threadId, prompt, config, segments, userMessageItemId)
    }

    override suspend fun interrupt(lease: RichChatHostLease, threadId: String) =
        invoke(lease, RichChatCapability.Operate, true) { core.interruptThread(threadId) }

    override suspend fun truncate(
        lease: RichChatHostLease,
        threadId: String,
        itemId: String,
    ) = invoke(lease, RichChatCapability.Operate, true) {
        rich.truncateRuntime(threadId, itemId)
    }

    override suspend fun updateGoal(
        lease: RichChatHostLease,
        threadId: String,
        update: ThreadGoalUpdate,
    ) = invoke(lease, RichChatCapability.Operate, true) {
        rich.updateThreadGoal(threadId, update)
    }

    override suspend fun setSteer(
        lease: RichChatHostLease,
        threadId: String,
        input: ThreadSteerInput,
    ) = invoke(lease, RichChatCapability.Operate, true) { rich.setSteer(threadId, input) }

    override suspend fun clearSteer(lease: RichChatHostLease, threadId: String) =
        invoke(lease, RichChatCapability.Operate, true) { rich.clearSteer(threadId) }

    override suspend fun threadCommand(
        lease: RichChatHostLease,
        threadId: String,
        command: JsonObject,
    ) = invoke(lease, RichChatCapability.Operate, true) {
        val commandTransport = commands ?: unavailable("thread_command_transport")
        commandTransport.execute(threadId, command)
    }

    override suspend fun closeThread(lease: RichChatHostLease, threadId: String) =
        invoke(lease, RichChatCapability.Operate, true) { rich.closeThread(threadId) }

    override suspend fun resolveRequest(
        lease: RichChatHostLease,
        threadId: String,
        resolution: RequestResolution,
    ) = invoke(lease, RichChatCapability.ResolveRequests, true) {
        rich.resolveRequest(threadId, resolution)
    }

    override suspend fun rollback(
        lease: RichChatHostLease,
        threadId: String,
        payload: JsonObject,
    ) = invokeThreadProcedure(lease, threadId, payload, RichChatCapability.Operate, true) {
        rich.rollbackThreadConversation(payload)
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
    ) { decodeCheckpointResult(rich.createFileCheckpoint(payload), mutation = true) }

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
    ) { decodeCheckpointResult(rich.finalizeFileCheckpoint(payload), mutation = true) }

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
    ) { decodeCheckpointCollection(rich.listFileCheckpoints(payload), threadId) }

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

    override suspend fun uploadAttachment(
        lease: RichChatHostLease,
        threadId: String,
        name: String,
        contentType: String,
        body: AttachmentUploadBody,
    ): String = invoke(lease, RichChatCapability.Operate, true) {
        rich.uploadAttachment(threadId, name, contentType, body)
    }

    override suspend fun localImagePlan(lease: RichChatHostLease, path: String): BinaryRequestPlan =
        invokePlan(lease, RichChatCapability.Read) { rich.localImageRequest(path) }

    override suspend fun runtimeImagePlan(
        lease: RichChatHostLease,
        threadId: String,
        itemId: String,
        path: List<RuntimeImagePathSegment>,
    ): BinaryRequestPlan = invokePlan(lease, RichChatCapability.Read) {
        rich.runtimeImageRequest(threadId, itemId, path)
    }

    override suspend fun loadLocalImage(
        lease: RichChatHostLease,
        path: String,
    ): RemoteBinaryResponse = invoke(lease, RichChatCapability.Read, false) {
        val executor = binary ?: unavailable("binary_transport")
        executor.execute(rich.localImageRequest(path))
    }

    override suspend fun loadRuntimeImage(
        lease: RichChatHostLease,
        threadId: String,
        itemId: String,
        path: List<RuntimeImagePathSegment>,
    ): RemoteBinaryResponse = invoke(lease, RichChatCapability.Read, false) {
        val executor = binary ?: unavailable("binary_transport")
        executor.execute(rich.runtimeImageRequest(threadId, itemId, path))
    }

    override suspend fun startTerminal(lease: RichChatHostLease, input: TerminalStartInput) =
        invoke(lease, RichChatCapability.TerminalOperate, true) { rich.startTerminal(input) }

    override suspend fun watchTerminal(
        lease: RichChatHostLease,
        request: RichTerminalWatchRequest,
    ) = invoke(lease, RichChatCapability.TerminalRead, false) {
        val socket = terminalWatch ?: unavailable("terminal_watch_transport")
        socket.watch(request)
    }

    override suspend fun unwatchTerminal(lease: RichChatHostLease, terminalId: String) =
        invoke(lease, RichChatCapability.TerminalRead, false) {
            val socket = terminalWatch ?: unavailable("terminal_watch_transport")
            socket.unwatch(terminalId)
        }

    override suspend fun writeTerminal(
        lease: RichChatHostLease,
        threadId: String,
        data: String,
    ) = invoke(lease, RichChatCapability.TerminalOperate, true) {
        rich.writeTerminal(threadId, data)
    }

    override suspend fun resizeTerminal(
        lease: RichChatHostLease,
        threadId: String,
        columns: Int,
        rows: Int,
    ) = invoke(lease, RichChatCapability.TerminalOperate, true) {
        rich.resizeTerminal(threadId, columns, rows)
    }

    override suspend fun closeTerminal(lease: RichChatHostLease, threadId: String) =
        invoke(lease, RichChatCapability.TerminalOperate, true) { rich.closeTerminal(threadId) }

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
        return invoke(lease, capability, mutation, operation)
    }

    private suspend fun <T> invoke(
        lease: RichChatHostLease,
        capability: RichChatCapability,
        mutation: Boolean,
        operation: suspend RichChatGatewayBundle.() -> T,
    ): T {
        requireCurrent(lease, capability)
        val bundle = try {
            provider.bundleFor(lease)
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            throw RichChatGatewayException(0, "network", mutation)
        } ?: throw RichChatGatewayException(409, "stale_lease", false)
        if (mutation && bundle.mutationDelivery != RichChatMutationDelivery.SingleAttempt) {
            throw RichChatGatewayException(500, "unsafe_retry_policy", false)
        }
        requireCurrent(lease, capability)
        val value = try {
            bundle.operation()
        } catch (error: CancellationException) {
            throw error
        } catch (error: RichChatGatewayException) {
            throw error
        } catch (error: RemoteClientException) {
            throw error.sanitized(mutation)
        } catch (error: Exception) {
            throw error.sanitized(mutation)
        }
        requireCurrent(lease, capability)
        return value
    }

    private suspend fun <T> invokePlan(
        lease: RichChatHostLease,
        capability: RichChatCapability,
        operation: RichChatGatewayBundle.() -> T,
    ): T {
        requireCurrent(lease, capability)
        val bundle = try {
            provider.bundleFor(lease)
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            throw RichChatGatewayException(0, "network", false)
        } ?: throw RichChatGatewayException(409, "stale_lease", false)
        val value = try {
            bundle.operation()
        } catch (error: RichChatGatewayException) {
            throw error
        } catch (error: Exception) {
            throw error.sanitized(false)
        }
        requireCurrent(lease, capability)
        return value
    }

    private fun requireCurrent(lease: RichChatHostLease, capability: RichChatCapability) {
        val current = session.value
        if (current == null || current.key != lease.key) {
            throw RichChatGatewayException(409, "stale_lease", false)
        }
        if (!current.online) throw RichChatGatewayException(0, "offline", false)
        if (!current.ready) throw RichChatGatewayException(409, "session_not_ready", false)
        if (capability.scope !in current.scopes) {
            throw RichChatGatewayException(403, "missing_scope", false)
        }
    }

    private fun decodeCheckpointResult(value: JsonObject, mutation: Boolean = false): RichCheckpoint {
        val raw = value["checkpoint"] ?: invalidResponse(mutation)
        return RichSnapshotMapping.decodeCheckpoint(raw) ?: invalidResponse(mutation)
    }

    private fun decodeCheckpointCollection(
        value: JsonObject,
        threadId: String,
    ): RichCheckpointCollection {
        fun list(name: String): List<RichCheckpoint> {
            val array = value[name] as? JsonArray ?: invalidResponse()
            return array.map {
                val checkpoint = RichSnapshotMapping.decodeCheckpoint(it) ?: invalidResponse()
                if (checkpoint.threadId != threadId) invalidResponse()
                checkpoint
            }
        }
        return RichCheckpointCollection(list("checkpoints"), list("turns"))
    }

    private fun invalidResponse(mutation: Boolean = false): Nothing = throw RichChatGatewayException(
        500,
        "invalid_response",
        mutation,
    )

    private fun unavailable(code: String): Nothing = throw RichChatGatewayException(501, code, false)
}

private fun RemoteClientException.sanitized(mutation: Boolean): RichChatGatewayException =
    RichChatGatewayException(
        statusCode = status,
        code = code.takeIf(SAFE_RICH_CHAT_ERROR_CODES::contains) ?: "remote_error",
        requestMayHaveCommitted =
            RemoteMutationClassification.requestMayHaveCommitted(this, mutation),
        cause = this,
    )

private fun Exception.sanitized(mutation: Boolean): RichChatGatewayException = when (this) {
    is RichChatAuthorizationException -> RichChatGatewayException(status, "forbidden", false, this)
    is RichChatRemoteRejectedException -> RichChatGatewayException(status, "remote_error", false, this)
    is RichChatMutationOutcomeUnknownException ->
        RichChatGatewayException(null, "outcome_unknown", true, this)
    is RichChatTransportUnavailableException -> RichChatGatewayException(0, "network", mutation, this)
    is RichChatInvalidRequestException -> RichChatGatewayException(400, "invalid_request", false, this)
    is RichChatInvalidResponseException ->
        RichChatGatewayException(500, "invalid_response", mutation, this)
    else -> RichChatGatewayException(0, "network", mutation, this)
}

private val SAFE_RICH_CHAT_ERROR_CODES = setOf(
    "invalid_token",
    "unauthorized",
    "forbidden",
    "missing_scope",
    "network",
    "timeout",
    "invalid_response",
    "response_too_large",
    "request_failed",
    "not_modified",
)
