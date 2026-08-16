package com.poracode.app.session.richchat

import com.poracode.app.chat.RichCheckpoint
import com.poracode.app.chat.RichRuntimeEvent
import com.poracode.app.chat.RichThreadKey
import com.poracode.app.chat.RichThreadState
import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ThreadConfig
import com.poracode.app.transport.richchat.AttachmentUploadBody
import com.poracode.app.transport.richchat.BinaryRequestPlan
import com.poracode.app.transport.richchat.RequestResolution
import com.poracode.app.transport.richchat.RuntimeImagePathSegment
import com.poracode.app.transport.richchat.TerminalStartInput
import com.poracode.app.transport.richchat.ThreadGoalUpdate
import com.poracode.app.transport.richchat.ThreadSteerInput
import com.poracode.app.transport.RemoteBinaryResponse
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject

/** A lease becomes stale whenever the selected host runtime is replaced. */
data class RichChatHostLease(
    val connectionId: ClientConnectionId,
    val generation: Long,
    val scopes: Set<String>,
    val online: Boolean,
    val ready: Boolean,
) {
    val key: RichChatHostKey get() = RichChatHostKey(connectionId, generation)
}

data class RichChatHostKey(
    val connectionId: ClientConnectionId,
    val generation: Long,
)

/** Adds local selection generation to the host lease so reused thread ids cannot collide. */
data class RichChatThreadLease(
    val host: RichChatHostLease,
    val threadId: String,
    val generation: Long,
) {
    init {
        require(threadId.isNotEmpty()) { "threadId must not be empty" }
    }

    val key: RichThreadKey get() = RichThreadKey(host.connectionId, threadId)
}

enum class RichChatCapability(val scope: String) {
    Read("session:read"),
    Operate("session:operate"),
    ResolveRequests("requests:resolve"),
    TerminalRead("terminal:read"),
    TerminalOperate("terminal:operate"),
}

sealed interface RichChatOperationFailure {
    data object NoSession : RichChatOperationFailure
    data object Offline : RichChatOperationFailure
    data object SessionNotReady : RichChatOperationFailure
    data object NoThread : RichChatOperationFailure
    data object Backgrounded : RichChatOperationFailure
    data object AuthenticationRequired : RichChatOperationFailure

    data class AuthorizationDenied(
        val requiredScope: String,
        val missingScope: Boolean,
    ) : RichChatOperationFailure

    data class Remote(
        val statusCode: Int?,
        val code: String,
        val requestMayHaveCommitted: Boolean,
    ) : RichChatOperationFailure

    data object InvalidRequest : RichChatOperationFailure
    data object InvalidResponse : RichChatOperationFailure
}

class RichChatGatewayException(
    val statusCode: Int?,
    val code: String,
    val requestMayHaveCommitted: Boolean,
    cause: Throwable? = null,
) : Exception("Rich-chat request failed.", cause)

sealed interface RichChatOperationResult<out T> {
    data class Success<T>(val value: T) : RichChatOperationResult<T>
    data class Failed(val failure: RichChatOperationFailure) : RichChatOperationResult<Nothing>
    data object Stale : RichChatOperationResult<Nothing>
}

data class RichChatHistorySnapshot(
    val key: RichThreadKey,
    val snapshotSeq: Int,
    val state: RichThreadState,
    val olderCursor: Int?,
    val config: ThreadConfig,
    val terminalScrollback: String?,
    val updatedAt: String,
)

data class RichChatHistoryPage(
    val items: List<com.poracode.app.chat.RichRuntimeItem>,
    val nextCursor: Int?,
)

data class RichCheckpointCollection(
    val checkpoints: List<RichCheckpoint>,
    val turns: List<RichCheckpoint>,
)

data class RichTerminalWatchRequest(
    val terminalId: String,
    val watchId: String,
    val cursorSyncVersion: Int = 1,
) {
    init {
        require(terminalId.isNotEmpty()) { "terminalId must not be empty" }
        require(watchId.isNotEmpty()) { "watchId must not be empty" }
        require(cursorSyncVersion > 0) { "cursor sync version must be positive" }
    }
}

interface RichChatSessionGateway {
    suspend fun history(
        lease: RichChatHostLease,
        threadId: String,
        targetTimelineEntryCount: Int = 40,
    ): RichChatHistorySnapshot

    suspend fun olderItems(
        lease: RichChatHostLease,
        threadId: String,
        beforePosition: Int,
        limit: Int = 100,
        targetTimelineEntryCount: Int = 40,
    ): RichChatHistoryPage

    suspend fun send(
        lease: RichChatHostLease,
        threadId: String,
        prompt: String,
        config: ThreadConfig,
        segments: JsonArray?,
        userMessageItemId: String?,
    )

    suspend fun interrupt(lease: RichChatHostLease, threadId: String)
    suspend fun truncate(lease: RichChatHostLease, threadId: String, itemId: String)
    suspend fun updateGoal(lease: RichChatHostLease, threadId: String, update: ThreadGoalUpdate)
    suspend fun setSteer(lease: RichChatHostLease, threadId: String, input: ThreadSteerInput)
    suspend fun clearSteer(lease: RichChatHostLease, threadId: String)
    suspend fun threadCommand(lease: RichChatHostLease, threadId: String, command: JsonObject)
    suspend fun closeThread(lease: RichChatHostLease, threadId: String)
    suspend fun resolveRequest(
        lease: RichChatHostLease,
        threadId: String,
        resolution: RequestResolution,
    )

    suspend fun rollback(lease: RichChatHostLease, threadId: String, payload: JsonObject)
    suspend fun createCheckpoint(
        lease: RichChatHostLease,
        threadId: String,
        payload: JsonObject,
    ): RichCheckpoint

    suspend fun finalizeCheckpoint(
        lease: RichChatHostLease,
        threadId: String,
        payload: JsonObject,
    ): RichCheckpoint

    suspend fun listCheckpoints(
        lease: RichChatHostLease,
        threadId: String,
        payload: JsonObject,
    ): RichCheckpointCollection

    suspend fun restoreCheckpoint(
        lease: RichChatHostLease,
        threadId: String,
        payload: JsonObject,
    )

    suspend fun stageInput(lease: RichChatHostLease, threadId: String, payload: JsonObject)

    suspend fun uploadAttachment(
        lease: RichChatHostLease,
        threadId: String,
        name: String,
        contentType: String,
        body: AttachmentUploadBody,
    ): String

    suspend fun localImagePlan(lease: RichChatHostLease, path: String): BinaryRequestPlan
    suspend fun runtimeImagePlan(
        lease: RichChatHostLease,
        threadId: String,
        itemId: String,
        path: List<RuntimeImagePathSegment>,
    ): BinaryRequestPlan

    suspend fun loadLocalImage(
        lease: RichChatHostLease,
        path: String,
    ): RemoteBinaryResponse = throw RichChatGatewayException(501, "binary_transport", false)

    suspend fun loadRuntimeImage(
        lease: RichChatHostLease,
        threadId: String,
        itemId: String,
        path: List<RuntimeImagePathSegment>,
    ): RemoteBinaryResponse = throw RichChatGatewayException(501, "binary_transport", false)

    suspend fun startTerminal(lease: RichChatHostLease, input: TerminalStartInput)
    suspend fun watchTerminal(lease: RichChatHostLease, request: RichTerminalWatchRequest)
    suspend fun unwatchTerminal(lease: RichChatHostLease, terminalId: String)
    suspend fun writeTerminal(lease: RichChatHostLease, threadId: String, data: String)
    suspend fun resizeTerminal(
        lease: RichChatHostLease,
        threadId: String,
        columns: Int,
        rows: Int,
    )

    suspend fun closeTerminal(lease: RichChatHostLease, threadId: String)
}

fun interface RichChatEventSink {
    fun apply(lease: RichChatThreadLease, event: RichRuntimeEvent): Boolean
}

internal fun StateFlow<RichChatHostLease?>.currentLease(
    capability: RichChatCapability,
): Pair<RichChatHostLease?, RichChatOperationFailure?> {
    val lease = value ?: return null to RichChatOperationFailure.NoSession
    if (!lease.online) return lease to RichChatOperationFailure.Offline
    if (!lease.ready) return lease to RichChatOperationFailure.SessionNotReady
    if (capability.scope !in lease.scopes) {
        return lease to RichChatOperationFailure.AuthorizationDenied(
            requiredScope = capability.scope,
            missingScope = true,
        )
    }
    return lease to null
}

internal fun StateFlow<RichChatHostLease?>.isCurrent(lease: RichChatHostLease): Boolean {
    val current = value ?: return false
    return current.key == lease.key && current.online && current.ready
}

internal fun Throwable.asRichChatFailure(
    capability: RichChatCapability,
    defaultMayHaveCommitted: Boolean,
): RichChatOperationFailure {
    val gateway = this as? RichChatGatewayException
    return when (gateway?.statusCode) {
        401 -> RichChatOperationFailure.AuthenticationRequired
        403 -> RichChatOperationFailure.AuthorizationDenied(
            requiredScope = capability.scope,
            missingScope = gateway.code == "missing_scope",
        )
        else -> when (gateway?.code) {
            "invalid_request" -> RichChatOperationFailure.InvalidRequest
            "invalid_response" -> if (defaultMayHaveCommitted) {
                RichChatOperationFailure.Remote(
                    statusCode = gateway?.statusCode,
                    code = "invalid_response",
                    requestMayHaveCommitted = true,
                )
            } else {
                RichChatOperationFailure.InvalidResponse
            }
            else -> RichChatOperationFailure.Remote(
                statusCode = gateway?.statusCode,
                code = gateway?.code ?: "remote_error",
                requestMayHaveCommitted = gateway?.requestMayHaveCommitted
                    ?: defaultMayHaveCommitted,
            )
        }
    }
}
