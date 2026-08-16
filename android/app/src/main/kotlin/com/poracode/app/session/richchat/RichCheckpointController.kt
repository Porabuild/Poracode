package com.poracode.app.session.richchat

import com.poracode.app.chat.RichCheckpoint
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.serialization.json.JsonObject

data class RichCheckpointState(
    val checkpoints: List<RichCheckpoint> = emptyList(),
    val turns: List<RichCheckpoint> = emptyList(),
    val activeOperations: Set<String> = emptySet(),
    val failure: RichChatOperationFailure? = null,
    val needsAuthoritativeRefresh: Boolean = false,
)

/** Owns checkpoint and conversation procedures without speculatively replaying mutations. */
class RichCheckpointController(
    private val session: StateFlow<RichChatHostLease?>,
    private val selection: StateFlow<RichChatThreadLease?>,
    private val gateway: RichChatSessionGateway,
    private val lifecycle: ForegroundOperationRegistry,
) {
    private val mutableState = MutableStateFlow(RichCheckpointState())
    val state: StateFlow<RichCheckpointState> = mutableState.asStateFlow()
    private val owner = RichChatOperationOwner()

    suspend fun refresh(payload: JsonObject): RichChatOperationResult<RichCheckpointCollection> {
        val lease = prepare(RichChatCapability.Read) ?: return currentRejection()
        val token = owner.begin(OP_LIST, lease)
        markActive(OP_LIST)
        return run(lease, token, RichChatCapability.Read, false) {
            val value = gateway.listCheckpoints(lease.host, lease.threadId, payload)
            if (!canPublish(lease, token)) return@run RichChatOperationResult.Stale
            mutableState.value = RichCheckpointState(
                checkpoints = value.checkpoints,
                turns = value.turns,
            )
            RichChatOperationResult.Success(value)
        }
    }

    suspend fun create(payload: JsonObject): RichChatOperationResult<RichCheckpoint> =
        checkpointMutation(OP_CREATE) { lease ->
            gateway.createCheckpoint(lease.host, lease.threadId, payload)
        }

    suspend fun finalize(payload: JsonObject): RichChatOperationResult<RichCheckpoint> =
        checkpointMutation(OP_FINALIZE) { lease ->
            gateway.finalizeCheckpoint(lease.host, lease.threadId, payload)
        }

    suspend fun restore(payload: JsonObject): RichChatOperationResult<Unit> =
        unitMutation(OP_RESTORE, authoritativeRefresh = true) { lease ->
            gateway.restoreCheckpoint(lease.host, lease.threadId, payload)
        }

    suspend fun rollback(payload: JsonObject): RichChatOperationResult<Unit> =
        unitMutation(OP_ROLLBACK, authoritativeRefresh = true) { lease ->
            gateway.rollback(lease.host, lease.threadId, payload)
        }

    suspend fun stageInput(payload: JsonObject): RichChatOperationResult<Unit> =
        unitMutation(OP_STAGE, authoritativeRefresh = false) { lease ->
            gateway.stageInput(lease.host, lease.threadId, payload)
        }

    fun reset() {
        owner.invalidateAll()
        mutableState.value = RichCheckpointState()
    }

    private suspend fun checkpointMutation(
        kind: String,
        operation: suspend (RichChatThreadLease) -> RichCheckpoint,
    ): RichChatOperationResult<RichCheckpoint> {
        val lease = prepare(RichChatCapability.Operate) ?: return currentRejection()
        val token = owner.begin(kind, lease)
        markActive(kind)
        return run(lease, token, RichChatCapability.Operate, true) {
            val checkpoint = operation(lease)
            if (!canPublish(lease, token)) return@run RichChatOperationResult.Stale
            mutableState.update { current ->
                val target = if (checkpoint.isTurn) current.turns else current.checkpoints
                val updated = target.filterNot {
                    it.checkpointItemId == checkpoint.checkpointItemId
                } + checkpoint
                current.copy(
                    checkpoints = if (checkpoint.isTurn) current.checkpoints else updated,
                    turns = if (checkpoint.isTurn) updated else current.turns,
                    activeOperations = current.activeOperations - kind,
                    failure = null,
                )
            }
            RichChatOperationResult.Success(checkpoint)
        }
    }

    private suspend fun unitMutation(
        kind: String,
        authoritativeRefresh: Boolean,
        operation: suspend (RichChatThreadLease) -> Unit,
    ): RichChatOperationResult<Unit> {
        val lease = prepare(RichChatCapability.Operate) ?: return currentRejection()
        val token = owner.begin(kind, lease)
        markActive(kind)
        return run(lease, token, RichChatCapability.Operate, true) {
            operation(lease)
            if (!canPublish(lease, token)) return@run RichChatOperationResult.Stale
            mutableState.update {
                it.copy(
                    activeOperations = it.activeOperations - kind,
                    failure = null,
                    needsAuthoritativeRefresh = it.needsAuthoritativeRefresh ||
                        authoritativeRefresh,
                )
            }
            RichChatOperationResult.Success(Unit)
        }
    }

    private suspend fun <T> run(
        lease: RichChatThreadLease,
        token: RichChatOperationOwner.Token,
        capability: RichChatCapability,
        mutation: Boolean,
        operation: suspend () -> RichChatOperationResult<T>,
    ): RichChatOperationResult<T> = try {
        lifecycle.run { lifecycleToken ->
            val result = operation()
            if (lifecycle.isCurrent(lifecycleToken)) result else RichChatOperationResult.Stale
        }
    } catch (error: CancellationException) {
        if (canPublish(lease, token)) clearActive(token.kind)
        throw error
    } catch (_: RichChatBackgroundException) {
        reject(RichChatOperationFailure.Backgrounded)
    } catch (error: Exception) {
        if (!canPublish(lease, token)) {
            RichChatOperationResult.Stale
        } else {
            val failure = error.asRichChatFailure(capability, mutation)
            mutableState.update {
                it.copy(
                    activeOperations = it.activeOperations - token.kind,
                    failure = failure,
                    needsAuthoritativeRefresh = it.needsAuthoritativeRefresh ||
                        (failure as? RichChatOperationFailure.Remote)?.requestMayHaveCommitted == true,
                )
            }
            RichChatOperationResult.Failed(failure)
        }
    }

    private fun prepare(capability: RichChatCapability): RichChatThreadLease? {
        if (!lifecycle.isForeground) {
            reject<Unit>(RichChatOperationFailure.Backgrounded)
            return null
        }
        val (host, failure) = session.currentLease(capability)
        if (failure != null || host == null) {
            reject<Unit>(failure!!)
            return null
        }
        val current = selection.value
        if (current == null || current.host.key != host.key) {
            reject<Unit>(RichChatOperationFailure.NoThread)
            return null
        }
        return current.copy(host = host)
    }

    private fun canPublish(
        lease: RichChatThreadLease,
        token: RichChatOperationOwner.Token,
    ): Boolean {
        val selected = selection.value ?: return false
        return lifecycle.isForeground && owner.isCurrent(token) && session.isCurrent(lease.host) &&
            selected.host.key == lease.host.key && selected.threadId == lease.threadId &&
            selected.generation == lease.generation
    }

    private fun markActive(kind: String) {
        mutableState.update {
            it.copy(activeOperations = it.activeOperations + kind, failure = null)
        }
    }

    private fun clearActive(kind: String) {
        mutableState.update { it.copy(activeOperations = it.activeOperations - kind) }
    }

    private fun currentRejection(): RichChatOperationResult.Failed =
        RichChatOperationResult.Failed(
            mutableState.value.failure ?: RichChatOperationFailure.NoThread,
        )

    private fun <T> reject(failure: RichChatOperationFailure): RichChatOperationResult<T> {
        mutableState.update { it.copy(failure = failure) }
        return RichChatOperationResult.Failed(failure)
    }

    private companion object {
        const val OP_LIST = "checkpoint-list"
        const val OP_CREATE = "checkpoint-create"
        const val OP_FINALIZE = "checkpoint-finalize"
        const val OP_RESTORE = "checkpoint-restore"
        const val OP_ROLLBACK = "conversation-rollback"
        const val OP_STAGE = "input-stage"
    }
}
