package com.poracode.app.session.richchat

import com.poracode.app.chat.RichItemState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.NonCancellable

/**
 * One selected-roster delegated watch, shared by the expanded inspector and
 * the compact sheet. Current hosts stream child output on the normal live
 * frame; this controller owns only the scoped viewer lease, its renewal, and
 * legacy one-shot history. Host expiry is the backstop for a lost release.
 */
class RichChatDelegatedWatchController(
    private val session: StateFlow<RichChatHostLease?>,
    private val selection: StateFlow<RichChatThreadLease?>,
    private val chat: RichChatController,
    private val gateway: RichChatSessionGateway,
    private val lifecycle: ForegroundOperationRegistry,
    private val scope: CoroutineScope,
    private val watchIdFactory: () -> String = { java.util.UUID.randomUUID().toString() },
) {
    enum class Phase { Idle, Starting, Watching, Retrying }

    data class State(
        val parentItemId: String? = null,
        val viewerId: String? = null,
        val phase: Phase = Phase.Idle,
        val failure: RichChatOperationFailure? = null,
    ) {
        val watching: Boolean get() = parentItemId != null && phase != Phase.Idle
    }

    private val mutableState = MutableStateFlow(State())
    val state: StateFlow<State> = mutableState.asStateFlow()

    private var generation = 0L
    private var watchJob: Job? = null
    private var monitorJob: Job? = null

    fun isWatching(parentItemId: String): Boolean =
        mutableState.value.parentItemId == parentItemId && mutableState.value.watching

    /** Start is unavailable when the selected session cannot read the host. */
    val canStart: Boolean
        get() = delegatedWatchCanStart(
            foreground = lifecycle.isForeground,
            selection = selection.value,
            host = session.value,
        )

    fun isBusy(parentItemId: String): Boolean {
        val current = mutableState.value
        return current.parentItemId == parentItemId &&
            (current.phase == Phase.Starting || current.phase == Phase.Retrying)
    }

    fun toggle(parentItemId: String) {
        if (mutableState.value.parentItemId == parentItemId) stop() else start(parentItemId)
    }

    fun start(parentItemId: String) {
        val lease = selection.value ?: return
        val host = session.value ?: return
        if (parentItemId.isEmpty() || lease.host.key != host.key) return
        if (!host.online || !host.ready || RichChatCapability.Read.scope !in host.scopes) return
        if (!lifecycle.isForeground) return
        val item = chat.state.value.transcript?.itemsById?.get(parentItemId) ?: return
        if (item.state == RichItemState.COMPLETED) return
        stop()
        generation += 1L
        val owner = generation
        val viewerId = watchIdFactory()
        mutableState.value = State(
            parentItemId = parentItemId,
            viewerId = viewerId,
            phase = Phase.Starting,
        )
        monitorJob = scope.launch {
            chat.state.collect { state ->
                val parent = mutableState.value.parentItemId ?: return@collect
                val transcript = state.transcript ?: return@collect
                val watched = transcript.itemsById[parent]
                if (watched == null || watched.state == RichItemState.COMPLETED) {
                    stop()
                }
            }
        }
        watchJob = scope.launch {
            run(lease, parentItemId, viewerId, owner)
        }
    }

    fun stop() {
        generation += 1L
        watchJob?.cancel()
        watchJob = null
        monitorJob?.cancel()
        monitorJob = null
        mutableState.value = State()
    }

    fun reset() = stop()

    private fun owns(
        lease: RichChatThreadLease,
        parentItemId: String,
        viewerId: String,
        owner: Long,
    ): Boolean {
        if (!lifecycle.isForeground || generation != owner) return false
        if (selection.value != lease) return false
        val host = session.value ?: return false
        if (host.key != lease.host.key || !host.online || !host.ready) return false
        val current = mutableState.value
        return current.parentItemId == parentItemId && current.viewerId == viewerId
    }

    private fun parentCompleted(parentItemId: String): Boolean {
        val transcript = chat.state.value.transcript ?: return false
        val item = transcript.itemsById[parentItemId] ?: return true
        return item.state == RichItemState.COMPLETED
    }

    /**
     * A remounted watcher for the exact same host/thread target owns the legacy
     * (parent-slot) release, so an older unconfirmed subscription must not
     * release it. The local selection generation is deliberately excluded: the
     * gateway scopes an unsubscribe by the captured host key, while closing and
     * reselecting the same thread only advances the local selection generation.
     */
    private fun hasNewerWatch(
        lease: RichChatThreadLease,
        parentItemId: String,
        viewerId: String,
    ): Boolean {
        val currentLease = selection.value ?: return false
        if (currentLease.host.key != lease.host.key || currentLease.threadId != lease.threadId) {
            return false
        }
        val current = mutableState.value
        return current.parentItemId == parentItemId &&
            current.viewerId != null &&
            current.viewerId != viewerId
    }

    private suspend fun run(
        lease: RichChatThreadLease,
        parentItemId: String,
        viewerId: String,
        owner: Long,
    ) {
        var retryDelayMs = 1_000L
        var scopedLease = false
        try {
            while (scope.isActive && owns(lease, parentItemId, viewerId, owner)) {
                if (parentCompleted(parentItemId)) return
                val result = try {
                    gateway.subscribeDelegatedAgent(
                        lease = lease.host,
                        threadId = lease.threadId,
                        parentItemId = parentItemId,
                        viewerId = viewerId,
                    )
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Exception) {
                    if (!owns(lease, parentItemId, viewerId, owner)) return
                    if (parentCompleted(parentItemId)) return
                    mutableState.value = mutableState.value.copy(
                        phase = Phase.Retrying,
                        failure = (error as? RichChatGatewayException)?.let {
                            RichChatOperationFailure.Remote(
                                statusCode = it.statusCode,
                                code = it.code,
                                requestMayHaveCommitted = it.requestMayHaveCommitted,
                            )
                        },
                    )
                    delay(retryDelayMs)
                    retryDelayMs = minOf(15_000L, retryDelayMs * 2)
                    continue
                }
                // Record the receipt before the stale-response guard so a late
                // valid scoped acknowledgement still releases this exact viewer.
                if ((result.leaseMs ?: 0L) > 0L) scopedLease = true
                if (!owns(lease, parentItemId, viewerId, owner)) return
                if (result.history.isNotEmpty()) {
                    val applied = chat.applyLegacyDelegatedHistory(lease, result.history)
                    if (!applied) chat.requestAuthoritativeRefreshForDelegatedHistory()
                    if (!owns(lease, parentItemId, viewerId, owner)) return
                }
                val leaseMs = result.leaseMs
                if (leaseMs == null || leaseMs <= 0L) {
                    // Legacy host: one-shot delivery only, no negotiated renewal.
                    // Stay selected until Stop/parent completion so the same-id
                    // release happens only after this subscribe has settled.
                    mutableState.value = mutableState.value.copy(
                        phase = Phase.Watching,
                        failure = null,
                    )
                    if (parentCompleted(parentItemId)) return
                    awaitCancellation()
                }
                retryDelayMs = 1_000L
                mutableState.value = mutableState.value.copy(
                    phase = Phase.Watching,
                    failure = null,
                )
                delay(maxOf(1L, leaseMs / 3))
            }
        } finally {
            val release =
                scopedLease || !hasNewerWatch(lease, parentItemId, viewerId)
            if (release) {
                withContext(NonCancellable) {
                    runCatching {
                        gateway.unsubscribeDelegatedAgent(
                            lease = lease.host,
                            threadId = lease.threadId,
                            parentItemId = parentItemId,
                            viewerId = viewerId,
                        )
                    }
                }
            }
            if (generation == owner) {
                monitorJob?.cancel()
                monitorJob = null
                if (mutableState.value.parentItemId == parentItemId) {
                    mutableState.value = State()
                }
            }
        }
    }
}


/** Shared reactive gate for the roster and the controller's synchronous start guard. */
internal fun delegatedWatchCanStart(
    foreground: Boolean,
    selection: RichChatThreadLease?,
    host: RichChatHostLease?,
): Boolean = foreground && selection != null && host != null &&
    selection.host.key == host.key && host.online && host.ready &&
    RichChatCapability.Read.scope in host.scopes
