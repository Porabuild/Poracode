package com.poracode.app.session.richchat

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.serialization.json.JsonObject

data class RichChatSessionActionsState(
    /**
     * Action ids the selected thread's live structured session currently
     * declares. Controls render only for these ids; the typed old-host answer
     * collapses the inventory to empty instead of advertising a dead control.
     */
    val actionIds: List<String> = emptyList(),
    val inventoryRefreshing: Boolean = false,
    /**
     * The last inventory read failure, when it must stay visible. Only the
     * typed old-host answer hides quietly; an outage, an authentication
     * rejection, or a malformed answer surfaces here so the user can retry
     * instead of mistaking it for "no actions".
     */
    val inventoryFailure: RichChatOperationFailure? = null,
    /** Action id with a single-attempt mutation in flight, if any. */
    val invokingActionId: String? = null,
    val failure: RichChatOperationFailure? = null,
    /** Set when an ambiguous mutation may have committed; the host reconciles. */
    val needsAuthoritativeRefresh: Boolean = false,
)

/**
 * Only the typed old-host answer hides the session-action inventory without an
 * error. Every other failure — an outage, an authentication rejection, a
 * malformed answer — must surface to the user instead of masquerading as
 * "no actions".
 */
internal fun RichChatOperationFailure?.isSessionActionSeamUnsupported(): Boolean =
    this is RichChatOperationFailure.Remote &&
        statusCode == 403 &&
        code == RICH_CHAT_PROCEDURE_NOT_ALLOWED

/** The published state slot one operation owns, so cancellation clears only its own. */
private enum class Slot { Inventory, Invoke }

/**
 * Owns the neutral session-action seam for the selected thread: one inventory
 * read and one single-attempt invoke at a time, each fenced by the exact
 * selected host lease before and after the await. A teardown (deselect,
 * host switch, background) invalidates in-flight work so a stale result can
 * never land in a newer session's state.
 *
 * Read-only listings take no exclusive slot: they may run alongside a
 * pending mutation, mirroring the desktop contract, and their failures stay
 * local to the listing panel instead of becoming thread-level failures.
 */
class RichChatSessionActionsController(
    private val session: StateFlow<RichChatHostLease?>,
    private val selection: StateFlow<RichChatThreadLease?>,
    private val gateway: RichChatSessionGateway,
    private val lifecycle: ForegroundOperationRegistry,
) {
    private val mutableState = MutableStateFlow(RichChatSessionActionsState())
    val state: StateFlow<RichChatSessionActionsState> = mutableState.asStateFlow()
    private val owner = RichChatOperationOwner()

    /**
     * One inventory read; never stacked, never retried. The typed old-host
     * answer empties the inventory quietly; every other failure empties it and
     * stays visible for retry. Only inventory fields are ever written — a
     * concurrent invoke's busy or ambiguity state is never wiped.
     */
    suspend fun refreshInventory(): List<String> {
        if (mutableState.value.inventoryRefreshing) return mutableState.value.actionIds
        val lease = prepareQuiet(RichChatCapability.Read) ?: return mutableState.value.actionIds
        val token = owner.begin(OP_INVENTORY, lease)
        mutableState.update { it.copy(inventoryRefreshing = true) }
        return run(lease, token, RichChatCapability.Read, false, slot = Slot.Inventory, recordFailure = false) {
            val ids = gateway.listSessionActions(lease.host, lease.threadId)
            if (!canPublish(lease, token)) return@run RichChatOperationResult.Stale
            mutableState.update {
                it.copy(actionIds = ids, inventoryRefreshing = false, inventoryFailure = null)
            }
            RichChatOperationResult.Success(ids)
        }.let { result ->
            if (result is RichChatOperationResult.Success) {
                result.value
            } else {
                // A failed inventory is an empty inventory — stale controls
                // must not linger from a previous successful read.
                if (canPublish(lease, token)) {
                    when (val failure = (result as? RichChatOperationResult.Failed)?.failure) {
                        null -> Unit // Stale: a newer owner owns the state now.
                        else ->
                            if (failure.isSessionActionSeamUnsupported()) {
                                mutableState.update {
                                    it.copy(
                                        actionIds = emptyList(),
                                        inventoryRefreshing = false,
                                        inventoryFailure = null,
                                    )
                                }
                            } else {
                                mutableState.update {
                                    it.copy(
                                        actionIds = emptyList(),
                                        inventoryRefreshing = false,
                                        inventoryFailure = failure,
                                    )
                                }
                            }
                    }
                }
                emptyList()
            }
        }
    }

    /**
     * One mutation attempt for an action the live inventory listed. An
     * ambiguous or failed delivery surfaces as a failure — the caller never
     * retries and the state stays honest about what happened. Read-only
     * listings pass `exclusive = false`: they skip the one-pending slot and
     * never write thread-level failure state.
     */
    suspend fun invoke(
        actionId: String,
        payload: JsonObject,
        exclusive: Boolean = true,
    ): RichChatOperationResult<JsonObject> {
        if (actionId.isBlank()) return reject(RichChatOperationFailure.InvalidRequest)
        if (exclusive && mutableState.value.invokingActionId != null) {
            return reject(RichChatOperationFailure.InvalidRequest)
        }
        if (actionId !in mutableState.value.actionIds) {
            // Only live-listed ids are invokable; an unknown id is a caller bug
            // and must not reach the host.
            return reject(RichChatOperationFailure.InvalidRequest)
        }
        val lease = prepare(RichChatCapability.Operate) ?: return currentRejection()
        // A listing runs under its own owner kind: it must never invalidate a
        // pending mutation's publication right, and vice versa.
        val token = owner.begin(if (exclusive) OP_INVOKE else OP_LISTING, lease)
        val slot = if (exclusive) Slot.Invoke else null
        if (exclusive) {
            mutableState.update { it.copy(invokingActionId = actionId) }
        }
        return run(lease, token, RichChatCapability.Operate, true, slot = slot, recordFailure = exclusive) {
            val result = gateway.invokeSessionAction(lease.host, lease.threadId, actionId, payload)
            if (!canPublish(lease, token)) return@run RichChatOperationResult.Stale
            mutableState.update {
                it.copy(invokingActionId = if (exclusive) null else it.invokingActionId)
            }
            RichChatOperationResult.Success(result)
        }
    }

    /** Clears inventory and invalidates in-flight work for a new selection. */
    fun reset() {
        owner.invalidateAll()
        mutableState.value = RichChatSessionActionsState()
    }

    /** Acknowledges one reconciled authoritative refresh. */
    fun acknowledgeAuthoritativeRefresh() {
        mutableState.update {
            if (it.needsAuthoritativeRefresh) {
                it.copy(needsAuthoritativeRefresh = false, failure = null)
            } else {
                it
            }
        }
    }

    private suspend fun <T> run(
        lease: RichChatThreadLease,
        token: RichChatOperationOwner.Token,
        capability: RichChatCapability,
        mutation: Boolean,
        slot: Slot?,
        recordFailure: Boolean = true,
        operation: suspend () -> RichChatOperationResult<T>,
    ): RichChatOperationResult<T> = try {
        lifecycle.run { lifecycleToken ->
            val result = operation()
            if (lifecycle.isCurrent(lifecycleToken)) result else RichChatOperationResult.Stale
        }
    } catch (error: CancellationException) {
        if (canPublish(lease, token)) clearBusy(slot)
        throw error
    } catch (_: RichChatBackgroundException) {
        reject(RichChatOperationFailure.Backgrounded)
    } catch (error: Exception) {
        if (!canPublish(lease, token)) {
            RichChatOperationResult.Stale
        } else {
            val failure = error.asRichChatFailure(capability, mutation)
            if (recordFailure) {
                mutableState.update {
                    it.copy(
                        failure = failure,
                        needsAuthoritativeRefresh = it.needsAuthoritativeRefresh ||
                            (failure as? RichChatOperationFailure.Remote)?.requestMayHaveCommitted == true,
                    )
                }
            }
            clearBusy(slot)
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

    /** Lease gate for the inventory read; failures stay invisible (controls hide). */
    private fun prepareQuiet(capability: RichChatCapability): RichChatThreadLease? {
        if (!lifecycle.isForeground) return null
        val (host, failure) = session.currentLease(capability)
        if (failure != null || host == null) return null
        val current = selection.value ?: return null
        if (current.host.key != host.key) return null
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

    /** Cancels only the published slot this operation owned. */
    private fun clearBusy(slot: Slot?) {
        when (slot) {
            Slot.Inventory -> mutableState.update { it.copy(inventoryRefreshing = false) }
            Slot.Invoke -> mutableState.update { it.copy(invokingActionId = null) }
            null -> Unit
        }
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
        const val OP_INVENTORY = "session-action-inventory"
        const val OP_INVOKE = "session-action-invoke"
        const val OP_LISTING = "session-action-listing"
    }
}
