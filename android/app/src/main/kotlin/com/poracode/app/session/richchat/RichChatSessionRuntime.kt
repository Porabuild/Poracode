package com.poracode.app.session.richchat

import com.poracode.app.chat.RichEventDecoder
import com.poracode.app.chat.RichPendingSteerDecoder
import com.poracode.app.protocol.RuntimeEventReducer
import com.poracode.app.transport.richchat.TerminalStartInput
import com.poracode.app.transport.terminal.TerminalTransportObserver
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Integration seam: one lifecycle gate and one selected-thread identity for all controllers. */
class RichChatSessionRuntime(
    private val session: StateFlow<RichChatHostLease?>,
    gateway: RichChatSessionGateway,
    watchIdFactory: () -> String = { java.util.UUID.randomUUID().toString() },
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
) {
    private val lifecycle = ForegroundOperationRegistry()
    private var refreshJob: Job? = null
    private var terminalJob: Job? = null
    val chat = RichChatController(session, gateway, lifecycle)
    val checkpoints = RichCheckpointController(session, chat.selection, gateway, lifecycle)
    val media = RichChatMediaController(session, chat.selection, gateway, lifecycle)
    val terminal = RichTerminalController(session, gateway, lifecycle, watchIdFactory)
    val terminalObserver: TerminalTransportObserver = object : TerminalTransportObserver {
        override fun onConnectionReset(
            host: RichChatHostKey,
            terminalId: String,
            watchId: String,
            status: com.poracode.app.model.terminal.TerminalConnectionStatus,
        ) {
            terminal.connectionReset(host, terminalId, watchId, status)
        }

        override fun onFrame(
            host: RichChatHostKey,
            frame: com.poracode.app.model.terminal.TerminalServerFrame,
        ) {
            if (terminal.applyTransportFrame(host, frame) &&
                terminal.state.value.needsAuthoritativeRefresh
            ) {
                reconnectTerminal()
            }
        }

        override fun onStatus(
            host: RichChatHostKey,
            terminalId: String,
            watchId: String,
            status: com.poracode.app.model.terminal.TerminalConnectionStatus,
        ) {
            terminal.updateConnection(host, terminalId, watchId, status)
        }
    }

    fun selectThread(threadId: String): RichChatOperationResult<RichChatThreadLease> {
        cancelRefresh()
        checkpoints.reset()
        return chat.selectThread(threadId)
    }

    fun closeThread() {
        cancelRefresh()
        dismissTerminal()
        checkpoints.reset()
        chat.closeThread()
    }

    @Synchronized
    fun presentTerminal(terminalId: String) {
        if (terminalId.isEmpty()) return
        cancelRefresh()
        checkpoints.reset()
        if (chat.selection.value != null) chat.closeThread()
        val state = terminal.state.value
        if (state.lease?.terminalId == terminalId &&
            (state.watching || "terminal-watch" in state.activeOperations)
        ) {
            return
        }
        terminalJob?.cancel()
        terminalJob = scope.launch { terminal.watch(terminalId) }
    }

    /**
     * Spawns a dev shell via the terminal-start route, then watches the owned
     * shell id. The shell id is client-generated and remains the source of
     * truth for the watch/resize/close lifecycle that follows.
     */
    @Synchronized
    fun startTerminal(input: TerminalStartInput) {
        if (input.shellId.isEmpty()) return
        cancelRefresh()
        checkpoints.reset()
        if (chat.selection.value != null) chat.closeThread()
        terminalJob?.cancel()
        terminalJob = scope.launch {
            when (terminal.start(input)) {
                is RichChatOperationResult.Success -> terminal.watch(input.shellId)
                else -> Unit
            }
        }
    }

    @Synchronized
    fun reconnectTerminal() {
        val terminalId = terminal.state.value.lease?.terminalId ?: return
        terminalJob?.cancel()
        terminalJob = scope.launch { terminal.watch(terminalId) }
    }

    /**
     * Handle a sequenced-replay side effect from the host session. Two signals are
     * actionable for the live terminal surface, both under one exact-host /
     * current-lease / foreground gate (mirrors the iOS `TerminalReplayBridgePolicy`
     * eligibility rule):
     *  - `thread-exited` (threadExitedId): mark the watched PTY exited, preserve the
     *    exit code, and never re-open it. A pending rebaseline is cancelled so the
     *    exited PTY cannot be revived; the lease/cursor/transcript are retained and
     *    no second socket is opened.
     *  - `thread-reset` (freshBaselineThreadIds): discard the stale cursor/baseline
     *    for that exact host+thread and request exactly one fresh watch.
     *
     * Other-thread, stale-host/generation, background, and dismissed terminal
     * outcomes are suppressed and never launch a watch.
     */
    @Synchronized
    fun handleReplaySideEffect(outcome: com.poracode.app.session.replay.ReplayOutcome) {
        val lease = terminal.state.value.lease ?: return
        val host = session.value ?: return
        // Exact-host / current-lease / foreground gate: a replacement host, a
        // backgrounded surface, or a dismissed terminal never reacts.
        if (host.key != lease.host.key || !host.online || !host.ready) return
        if (!lifecycle.isForeground) return

        val exitedId = outcome.threadExitedId
        if (!exitedId.isNullOrEmpty() && exitedId == lease.terminalId) {
            val transition = outcome.transition
                as? com.poracode.app.session.replay.SequencedEventApplier.Transition.ThreadExited
            if (terminal.applyHostThreadExit(lease, transition?.exitCode)) {
                // Cancel a pending rebaseline so the exited PTY is never re-opened.
                terminalJob?.cancel()
                terminalJob = null
            }
        }

        if (lease.terminalId in outcome.freshBaselineThreadIds) {
            resetTerminalBaseline(lease.terminalId)
        }
    }

    /**
     * Clear the affected exact-host/thread terminal cursor/state and request exactly
     * one fresh watch/baseline. The previous terminal job is cancelled so duplicate
     * or replayed reset signals can never stack a second watch.
     */
    @Synchronized
    fun resetTerminalBaseline(threadId: String) {
        val lease = terminal.state.value.lease ?: return
        if (lease.terminalId != threadId) return
        val host = session.value ?: return
        if (host.key != lease.host.key || !host.online || !host.ready) return
        terminal.discardCursorForFreshBaseline()
        terminalJob?.cancel()
        terminalJob = scope.launch { terminal.watch(threadId) }
    }

    @Synchronized
    fun dismissTerminal() {
        terminalJob?.cancel()
        terminalJob = null
        if (terminal.state.value.lease == null) return
        scope.launch {
            try {
                terminal.unwatch()
            } finally {
                terminal.clearTerminal()
            }
        }
    }

    @Synchronized
    fun refreshSelectedThread() {
        if (refreshJob?.isActive == true || "history" in chat.state.value.activeOperations) return
        refreshJob = scope.launch {
            repeat(MAX_CONSECUTIVE_REFRESHES) {
                val result = chat.refreshHistory()
                if (result !is RichChatOperationResult.Success ||
                    !chat.state.value.needsAuthoritativeRefresh
                ) {
                    return@launch
                }
            }
        }
    }

    /** Applies only canonical events for the exact selected host/thread lease. */
    fun applyServerEvent(value: JsonElement): Boolean = applyServerEvent(null, value)

    fun applyServerEvent(sequence: Int?, value: JsonElement): Boolean {
        val selected = chat.selection.value ?: return false
        val decodedEvents = mutableListOf<com.poracode.app.chat.RichRuntimeEvent>()
        val batches = RuntimeEventReducer.collectRuntimeEvents(value)
        for (batch in batches) {
            if (batch.threadId != selected.threadId) continue
            for (event in batch.events) {
                if (event.threadId != batch.threadId) continue
                val withThread = JsonObject(
                    event.raw + ("threadId" to JsonPrimitive(batch.threadId)),
                )
                val decoded = RichEventDecoder.decode(selected.host.connectionId, withThread)
                    ?: continue
                decodedEvents += decoded
            }
        }
        if (batches.isEmpty()) {
            RichEventDecoder.decode(selected.host.connectionId, value)?.let {
                if (it.threadKey == selected.key) decodedEvents += it
            }
        }
        val pendingSteer = RichPendingSteerDecoder
            .decodeEnvelope(selected.host.connectionId, value)
            ?.takeIf { it.threadKey == selected.key }
        return chat.applyServerFrame(selected, sequence, decodedEvents, pendingSteer)
    }

    fun enterBackground() {
        terminalJob?.cancel()
        terminalJob = null
        terminal.enterBackground()
        chat.enterBackground()
        checkpoints.reset()
    }

    fun enterForeground() {
        lifecycle.enterForeground()
        chat.enterForeground()
    }

    fun reconcileSession() {
        chat.reconcileSession()
        val terminalLease = terminal.state.value.lease ?: return
        val current = session.value
        if (current == null || current.key != terminalLease.host.key || !current.ready) {
            terminal.clearTerminal()
        }
    }

    fun close() {
        closeThread()
        terminal.clearTerminal()
        scope.cancel()
    }

    @Synchronized
    private fun cancelRefresh() {
        refreshJob?.cancel()
        refreshJob = null
    }

    private companion object {
        const val MAX_CONSECUTIVE_REFRESHES = 2
    }
}
