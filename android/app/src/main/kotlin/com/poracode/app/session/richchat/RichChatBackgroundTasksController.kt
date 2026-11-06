package com.poracode.app.session.richchat

import com.poracode.app.model.RemoteJson
import com.poracode.app.protocol.BackgroundTask
import com.poracode.remote.v3.generated.RemoteBackgroundTaskOutput
import com.poracode.remote.v3.generated.RemoteBackgroundTaskStopAction
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull

/**
 * Full identity of one selected task read. The opaque provider action is keyed
 * by id plus the whole payload map: Kotlin map equality is order-insensitive,
 * matching the desktop's sorted-key identity, and no key name is interpreted.
 */
data class RichChatBackgroundTaskReadKey(
    val host: RichChatHostKey,
    val threadId: String,
    val threadGeneration: Long,
    val taskId: String,
    val actionId: String,
    val actionPayload: Map<String, String>,
)

/** Stop identity is separate from the read identity so reads never erase Stop state. */
data class RichChatBackgroundTaskStopKey(
    val host: RichChatHostKey,
    val threadId: String,
    val threadGeneration: Long,
    val taskId: String,
    val actionId: String,
    val actionPayload: Map<String, String>,
)

/** Last outcome of the selected task's bounded output read. */
sealed interface RichChatBackgroundTaskOutput {
    data object Loading : RichChatBackgroundTaskOutput

    data class Ready(
        val output: String,
        /** Wire-native JS-safe byte count (generated DTO representation). */
        val totalBytes: Double,
        val truncated: Boolean,
    ) : RichChatBackgroundTaskOutput

    data class Failed(val failure: RichChatOperationFailure) : RichChatBackgroundTaskOutput
}

/** Identity-tagged read state: a value from another task/host/thread never renders. */
data class RichChatBackgroundTaskOutputState(
    val key: RichChatBackgroundTaskReadKey? = null,
    /** Null = idle; [RichChatBackgroundTaskOutput.Loading] = one read in flight. */
    val output: RichChatBackgroundTaskOutput? = null,
)

/** Identity-tagged Stop slot, independent of output reads. */
data class RichChatBackgroundTaskStopState(
    val key: RichChatBackgroundTaskStopKey? = null,
    val pending: Boolean = false,
    val failure: RichChatOperationFailure? = null,
)

/**
 * Owns selected-detail background-task output reads and Stop for the rich-chat
 * surface.
 *
 * Reads invoke the task's opaque `outputAction` through the existing
 * session-action seam with `exclusive = false`, so they never occupy the
 * one-pending mutation slot, never write thread-level failure/ambiguity state,
 * and never start a turn. Stop uses `exclusive = true` and its own identity, so
 * a changing read payload cannot erase a pending Stop. Both paths are fenced
 * on exact host/thread lease, foreground lifecycle, and a reset epoch before
 * publishing. Reads are serialized: one transport read in flight per controller.
 * Stop is a single exclusive send; a duplicate concurrent request returns
 * [RichChatOperationResult.Stale] without touching the first pending/failure
 * slot.
 */
class RichChatBackgroundTasksController(
    private val session: StateFlow<RichChatHostLease?>,
    private val selection: StateFlow<RichChatThreadLease?>,
    private val lifecycle: ForegroundOperationRegistry,
    private val invokeAction: suspend (String, JsonObject, Boolean) -> RichChatOperationResult<JsonObject>,
) {
    private val mutableOutput = MutableStateFlow(RichChatBackgroundTaskOutputState())
    val output: StateFlow<RichChatBackgroundTaskOutputState> = mutableOutput.asStateFlow()
    private val mutableStop = MutableStateFlow(RichChatBackgroundTaskStopState())
    val stop: StateFlow<RichChatBackgroundTaskStopState> = mutableStop.asStateFlow()
    private val readMutex = Mutex()
    private val stopGate = Mutex()
    private val epoch = AtomicLong(0L)

    suspend fun readOutput(
        task: BackgroundTask,
    ): RichChatOperationResult<RichChatBackgroundTaskOutput> {
        val action = task.outputAction
            ?: return RichChatOperationResult.Failed(RichChatOperationFailure.InvalidRequest)
        val gate = gateFailure()
        if (gate != null) return RichChatOperationResult.Failed(gate)
        val lease = currentLease()
            ?: return RichChatOperationResult.Failed(RichChatOperationFailure.NoThread)
        val key = richChatBackgroundTaskReadKey(lease, task)
            ?: return RichChatOperationResult.Failed(RichChatOperationFailure.InvalidRequest)
        val capturedEpoch = epoch.get()
        return readMutex.withLock {
            if (!canPublish(lease, capturedEpoch)) return@withLock RichChatOperationResult.Stale
            val previous = mutableOutput.value
            mutableOutput.value = if (
                previous.key == key &&
                previous.output is RichChatBackgroundTaskOutput.Ready
            ) {
                // Keep the last tail visible while a poll refreshes it; only the
                // first read (or a retry after failure) shows the loading state.
                previous
            } else {
                RichChatBackgroundTaskOutputState(
                    key = key,
                    output = RichChatBackgroundTaskOutput.Loading,
                )
            }
            val result = try {
                invokeAction(action.id, action.toOpaquePayload(), false)
            } catch (error: CancellationException) {
                if (canPublish(lease, capturedEpoch) && mutableOutput.value.key == key) {
                    mutableOutput.value = RichChatBackgroundTaskOutputState(key = key)
                }
                throw error
            }
            if (!canPublish(lease, capturedEpoch)) {
                if (mutableOutput.value.key == key) {
                    mutableOutput.value = RichChatBackgroundTaskOutputState(key = key)
                }
                return@withLock RichChatOperationResult.Stale
            }
            when (result) {
                is RichChatOperationResult.Success -> {
                    val decoded = decodeBackgroundTaskOutput(result.value)
                        ?: return@withLock failRead(
                            key,
                            RichChatOperationFailure.InvalidResponse,
                        )
                    val ready = RichChatBackgroundTaskOutput.Ready(
                        output = decoded.output,
                        totalBytes = decoded.totalBytes,
                        truncated = decoded.truncated,
                    )
                    mutableOutput.value = RichChatBackgroundTaskOutputState(key = key, output = ready)
                    RichChatOperationResult.Success(ready)
                }
                is RichChatOperationResult.Failed -> failRead(key, result.failure)
                RichChatOperationResult.Stale -> {
                    if (mutableOutput.value.key == key) {
                        mutableOutput.value = RichChatBackgroundTaskOutputState(key = key)
                    }
                    RichChatOperationResult.Stale
                }
            }
        }
    }

    suspend fun stop(task: BackgroundTask): RichChatOperationResult<Unit> {
        val action = task.stopAction
            ?: return RichChatOperationResult.Failed(RichChatOperationFailure.InvalidRequest)
        val gate = gateFailure()
        if (gate != null) return RichChatOperationResult.Failed(gate)
        val lease = currentLease()
            ?: return RichChatOperationResult.Failed(RichChatOperationFailure.NoThread)
        val key = richChatBackgroundTaskStopKey(lease, task)
            ?: return RichChatOperationResult.Failed(RichChatOperationFailure.InvalidRequest)
        val capturedEpoch = epoch.get()
        // One exclusive Stop at a time: reserve the pending slot before the
        // first suspension so a duplicate concurrent send never invokes twice
        // and never erases the first pending/failure owner.
        val reserved = stopGate.withLock {
            if (mutableStop.value.pending) {
                false
            } else {
                mutableStop.value = RichChatBackgroundTaskStopState(key = key, pending = true)
                true
            }
        }
        if (!reserved) return RichChatOperationResult.Stale
        val result = try {
            invokeAction(action.id, action.toOpaquePayload(), true)
        } catch (error: CancellationException) {
            if (canPublish(lease, capturedEpoch) && mutableStop.value.key == key) {
                mutableStop.value = RichChatBackgroundTaskStopState(key = key)
            }
            throw error
        }
        if (!canPublish(lease, capturedEpoch)) {
            if (mutableStop.value.key == key) {
                mutableStop.value = RichChatBackgroundTaskStopState(key = key)
            }
            return RichChatOperationResult.Stale
        }
        return when (result) {
            is RichChatOperationResult.Success -> {
                mutableStop.value = RichChatBackgroundTaskStopState(key = key)
                RichChatOperationResult.Success(Unit)
            }
            is RichChatOperationResult.Failed -> {
                mutableStop.value = RichChatBackgroundTaskStopState(
                    key = key,
                    failure = result.failure,
                )
                result
            }
            RichChatOperationResult.Stale -> {
                mutableStop.value = RichChatBackgroundTaskStopState(key = key)
                RichChatOperationResult.Stale
            }
        }
    }

    /** New selection/host/background: fence every in-flight completion and clear the slots. */
    fun reset() {
        epoch.incrementAndGet()
        mutableOutput.value = RichChatBackgroundTaskOutputState()
        mutableStop.value = RichChatBackgroundTaskStopState()
    }

    private fun failRead(
        key: RichChatBackgroundTaskReadKey,
        failure: RichChatOperationFailure,
    ): RichChatOperationResult.Failed {
        mutableOutput.value = RichChatBackgroundTaskOutputState(
            key = key,
            output = RichChatBackgroundTaskOutput.Failed(failure),
        )
        return RichChatOperationResult.Failed(failure)
    }

    private fun gateFailure(): RichChatOperationFailure? {
        if (!lifecycle.isForeground) return RichChatOperationFailure.Backgrounded
        val host = session.value ?: return RichChatOperationFailure.NoSession
        if (!host.online) return RichChatOperationFailure.Offline
        if (!host.ready) return RichChatOperationFailure.SessionNotReady
        val selected = selection.value ?: return RichChatOperationFailure.NoThread
        if (selected.host.key != host.key) return RichChatOperationFailure.NoThread
        return null
    }

    private fun currentLease(): RichChatThreadLease? {
        val host = session.value ?: return null
        val selected = selection.value ?: return null
        if (selected.host.key != host.key) return null
        return selected.copy(host = host)
    }

    private fun canPublish(lease: RichChatThreadLease, capturedEpoch: Long): Boolean =
        epoch.get() == capturedEpoch &&
            lifecycle.isForeground &&
            session.isCurrent(lease.host) &&
            selection.value?.let {
                it.host.key == lease.host.key &&
                    it.threadId == lease.threadId &&
                    it.generation == lease.generation
            } == true
}

internal fun richChatBackgroundTaskReadKey(
    lease: RichChatThreadLease,
    task: BackgroundTask,
): RichChatBackgroundTaskReadKey? {
    val action = task.outputAction ?: return null
    return RichChatBackgroundTaskReadKey(
        host = lease.host.key,
        threadId = lease.threadId,
        threadGeneration = lease.generation,
        taskId = task.taskId,
        actionId = action.id,
        actionPayload = action.payload,
    )
}

internal fun richChatBackgroundTaskStopKey(
    lease: RichChatThreadLease,
    task: BackgroundTask,
): RichChatBackgroundTaskStopKey? {
    val action = task.stopAction ?: return null
    return RichChatBackgroundTaskStopKey(
        host = lease.host.key,
        threadId = lease.threadId,
        threadGeneration = lease.generation,
        taskId = task.taskId,
        actionId = action.id,
        actionPayload = action.payload,
    )
}

/**
 * Opaque provider payload passthrough: every key/value is forwarded verbatim.
 * No token/taskId key is read, renamed, or assumed.
 */
internal fun RemoteBackgroundTaskStopAction.toOpaquePayload(): JsonObject =
    JsonObject(payload.mapValues { (_, value) -> JsonPrimitive(value) })

/**
 * Decodes the session-action result through the generated output DTO and its
 * `isValid` guard (UTF-16 length and safe byte bounds). Never a second DTO.
 */
internal fun decodeBackgroundTaskOutput(result: JsonObject): RemoteBackgroundTaskOutput? {
    // RemoteJson is lenient about primitive types; the action contract is not.
    // Reject coerced numbers/strings before the generated bounds guard.
    val output = result["output"] as? JsonPrimitive ?: return null
    if (!output.isString) return null
    val totalBytes = result["totalBytes"] as? JsonPrimitive ?: return null
    if (totalBytes.isString) return null
    val truncated = result["truncated"] as? JsonPrimitive ?: return null
    if (truncated.isString || truncated.booleanOrNull == null) return null
    return try {
        RemoteJson.decodeFromString(RemoteBackgroundTaskOutput.serializer(), result.toString())
    } catch (_: Exception) {
        null
    }?.takeIf { it.isValid }
}
