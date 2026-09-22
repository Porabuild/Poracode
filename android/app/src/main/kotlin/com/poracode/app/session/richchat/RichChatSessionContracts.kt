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
    /** Stable across transport reconnects; changes with endpoint, pairing or access binding. */
    val bindingGeneration: Long = generation,
    /**
     * B1: the live environment descriptor advertised durable history notices
     * (`versions` contains 1). False on older hosts and before the descriptor
     * is observed; an undeclared connection makes zero gap calls.
     */
    val noticesSupported: Boolean = false,
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
    /** `ct1.` cursor for older completed turns, when the host returned a tail. */
    val completedTurnsNextCursor: String? = null,
    val config: ThreadConfig,
    val terminalScrollback: String?,
    /**
     * True when the wire snapshot carried an explicit followUpQueue value
     * (object or null). Absent means the supervisor queue read failed and the
     * install must preserve the previously projected queue — the desktop
     * contract; only an explicit null clears it.
     */
    val followUpQueuePresent: Boolean = false,
    val updatedAt: String,
    /** B1 declared-read notice; null when the wire omitted it, never a clear. */
    val runtimeNotice: com.poracode.app.model.RemoteRuntimeHistoryNotice? = null,
)

data class RichChatHistoryPage(
    val items: List<com.poracode.app.chat.RichRuntimeItem>,
    val nextCursor: Int?,
    /** B1 declared-read notice on the item page; null never clears a notice. */
    val runtimeNotice: com.poracode.app.model.RemoteRuntimeHistoryNotice? = null,
)

/** One `ct1.` older-completed-turn page; `nextCursor == null` ends the walk. */
data class RichChatTurnsPage(
    val turns: List<com.poracode.app.chat.RichCompletedTurn>,
    val nextCursor: String?,
)

data class RichCheckpointCollection(
    val checkpoints: List<RichCheckpoint>,
    val turns: List<RichCheckpoint>,
)

/** Retained cache position presented as cursor-sync v2 `resume`. */
data class RichTerminalWatchResume(
    val generation: String,
    val cursor: Long,
) {
    init {
        require(generation.isNotEmpty()) { "generation must not be empty" }
        require(cursor >= 0L) { "cursor must be non-negative" }
    }
}

data class RichTerminalWatchRequest(
    val terminalId: String,
    val watchId: String,
    val cursorSyncVersion: Int = 1,
    val resume: RichTerminalWatchResume? = null,
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

    /**
     * Older completed turns via the declared-only `thread-turns` route. The
     * UI's load-older action drives this together with [olderItems]; a host
     * without the capability ends the continuation (`route_unavailable`).
     */
    suspend fun olderTurns(
        lease: RichChatHostLease,
        threadId: String,
        cursor: String,
        limit: Int = 200,
    ): RichChatTurnsPage

    /**
     * B1 declared-only gap read. Callers may only invoke this when the same
     * lease's environment descriptor advertised notices v1; the reply carries
     * the actual unacknowledged descriptor and/or durable notice, never an
     * inferred one.
     */
    suspend fun runtimeGap(
        lease: RichChatHostLease,
        threadId: String,
    ): com.poracode.app.model.RemoteRuntimeGapRead

    /**
     * B1 declared-only acknowledgement of exactly [episodeToken] using the
     * caller's [commandId] idempotency key. The same uncertain operation must
     * retry with the same pair; `already`/`stale` are zero-effect outcomes.
     */
    suspend fun acknowledgeRuntimeGap(
        lease: RichChatHostLease,
        threadId: String,
        episodeToken: String,
        commandId: String,
    ): com.poracode.app.model.RemoteRuntimeGapAck

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

    // Follow-up queue mutations (501 follow_up_queue_unsupported on old hosts
    // maps to a definite rejection through the shared error classification).
    suspend fun queueFollowUp(
        lease: RichChatHostLease,
        threadId: String,
        prompt: String,
        config: JsonObject,
        segments: JsonArray?,
    )

    suspend fun removeQueuedFollowUp(lease: RichChatHostLease, threadId: String, id: String)
    suspend fun reorderQueuedFollowUp(
        lease: RichChatHostLease,
        threadId: String,
        id: String,
        beforeId: String?,
    )

    suspend fun editQueuedFollowUp(lease: RichChatHostLease, threadId: String, payload: JsonObject)
    suspend fun steerQueuedFollowUp(lease: RichChatHostLease, threadId: String, id: String)
    suspend fun pauseFollowUps(lease: RichChatHostLease, threadId: String, id: String)
    suspend fun resumeFollowUps(lease: RichChatHostLease, threadId: String)

    suspend fun threadCommand(lease: RichChatHostLease, threadId: String, command: JsonObject)
    suspend fun closeThread(lease: RichChatHostLease, threadId: String)
    suspend fun resolveRequest(
        lease: RichChatHostLease,
        threadId: String,
        resolution: RequestResolution,
    )

    suspend fun rollback(lease: RichChatHostLease, threadId: String, payload: JsonObject)
    suspend fun checkpointRevert(lease: RichChatHostLease, threadId: String, payload: JsonObject)
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

internal fun RichChatHostLease?.canOperateTerminal(): Boolean =
    this != null && online && ready &&
        RichChatCapability.TerminalRead.scope in scopes &&
        RichChatCapability.TerminalOperate.scope in scopes

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
