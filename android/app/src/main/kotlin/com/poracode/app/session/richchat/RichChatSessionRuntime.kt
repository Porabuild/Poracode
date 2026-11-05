package com.poracode.app.session.richchat

import com.poracode.app.chat.RichEventDecoder
import com.poracode.app.chat.RichFollowUpQueueDecoder
import com.poracode.app.chat.RichPendingSteerDecoder
import com.poracode.app.model.terminal.TerminalProcessState
import com.poracode.app.protocol.RuntimeEventReducer
import com.poracode.app.transport.richchat.TerminalStartInput
import com.poracode.app.transport.terminal.TerminalTransportObserver
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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
    val hostLease: StateFlow<RichChatHostLease?> get() = session
    private val lifecycle = ForegroundOperationRegistry()
    @Volatile private var projectTerminalSurfacePresented = false
    private var refreshJob: Job? = null
    private var terminalJob: Job? = null
    val chat = RichChatController(session, gateway, lifecycle)
    val checkpoints = RichCheckpointController(session, chat.selection, gateway, lifecycle)
    val media = RichChatMediaController(session, chat.selection, gateway, lifecycle)
    val sessionActions = RichChatSessionActionsController(session, chat.selection, gateway, lifecycle)
    /**
     * Selected-detail output polling and Stop. Reads go through the existing
     * session-action seam (nonexclusive), so dynamic descriptor ids respect
     * the live inventory; Stop is exclusive and owns its own state slot.
     */
    val backgroundTasks = RichChatBackgroundTasksController(
        session,
        chat.selection,
        lifecycle,
        sessionActions::invoke,
    )
    private val mutableForeground = MutableStateFlow(true)
    /** App foreground state for poll loops; true only while rich-chat operations may run. */
    val foreground: StateFlow<Boolean> = mutableForeground.asStateFlow()
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
        sessionActions.reset()
        backgroundTasks.reset()
        return chat.selectThread(threadId)
    }

    fun closeThread() {
        cancelRefresh()
        dismissTerminal()
        checkpoints.reset()
        sessionActions.reset()
        backgroundTasks.reset()
        chat.closeThread()
    }

    val isProjectTerminalSurfacePresented: Boolean
        get() = projectTerminalSurfacePresented

    @Synchronized
    fun presentProjectTerminalSurface() {
        projectTerminalSurfacePresented = true
        cancelRefresh()
        checkpoints.reset()
        sessionActions.reset()
        backgroundTasks.reset()
        if (chat.selection.value != null) chat.closeThread()
    }

    @Synchronized
    fun dismissProjectTerminalSurface() {
        projectTerminalSurfacePresented = false
        dismissTerminal()
    }

    @Synchronized
    fun presentTerminal(terminalId: String) {
        if (terminalId.isEmpty()) return
        cancelRefresh()
        checkpoints.reset()
        sessionActions.reset()
        backgroundTasks.reset()
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
        backgroundTasks.reset()
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
     * Handle a sequenced-replay side effect from the host session under one
     * exact-host / current-lease / foreground gate (mirrors the iOS
     * `TerminalReplayBridgePolicy` eligibility rule):
     *  - `thread-exited` (threadExitedId): an accepted exit for the selected
     *    rich-chat thread drains the live background-task roster and fences any
     *    selected-detail output read, even when no terminal lease exists; the
     *    outcome sequence advances the background-task watermark so an older
     *    snapshot cannot resurrect the roster. It also marks the watched PTY
     *    exited, preserving the exit code, and never re-opens it. A pending
     *    rebaseline is cancelled so the exited PTY cannot be revived; the
     *    lease/cursor/transcript are retained and no second socket is opened.
     *  - `thread-reset` (freshBaselineThreadIds): discard the stale cursor/baseline
     *    for that exact host+thread and request exactly one fresh watch.
     *
     * Other-thread, stale-host/generation, background, and dismissed terminal
     * outcomes are suppressed and never drain metadata or launch a watch.
     */
    @Synchronized
    fun handleReplaySideEffect(
        outcome: com.poracode.app.session.replay.ReplayOutcome,
        sequence: Int? = null,
    ) {
        val host = session.value ?: return
        // Exact-current-host / foreground gate: a replacement or unprepared
        // host and a backgrounded surface never react.
        if (!host.online || !host.ready) return
        if (!lifecycle.isForeground) return

        val exitedId = outcome.threadExitedId
        if (!exitedId.isNullOrEmpty() &&
            chat.drainBackgroundTasksForThreadExit(exitedId, sequence)
        ) {
            // Exact selected thread only; reset fences in-flight output reads
            // and clears the selected-detail controller slots.
            backgroundTasks.reset()
        }

        val lease = terminal.state.value.lease ?: return
        if (host.key != lease.host.key) return

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
        val dismissedLease = terminal.state.value.lease ?: return
        // Detach synchronously so a rapidly reopened project action cannot see
        // or write into the previous shell while remote unwatch is in flight.
        if (!terminal.clearTerminalIfCurrent(dismissedLease)) return
        scope.launch { terminal.unwatchDetached(dismissedLease) }
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
        val backgroundTaskChanges = mutableListOf<RichChatBackgroundTaskChange>()
        val batches = RuntimeEventReducer.collectRuntimeEvents(value)
        for (batch in batches) {
            if (batch.threadId != selected.threadId) continue
            for (event in batch.events) {
                if (event.threadId != batch.threadId) continue
                event.asBackgroundTaskChange()?.let(backgroundTaskChanges::add)
                val withThread = JsonObject(
                    event.raw + ("threadId" to JsonPrimitive(batch.threadId)),
                )
                val decoded = RichEventDecoder.decode(selected.host.connectionId, withThread)
                    ?: continue
                decodedEvents += decoded
            }
        }
        if (batches.isEmpty()) {
            // A bare event object (no envelope) still has to feed the metadata
            // level: background_tasks.changed is not a transcript event.
            (value as? JsonObject)
                ?.let { RuntimeEventReducer.parseRuntimeEvent(it) }
                ?.takeIf { it.threadId == selected.threadId }
                ?.asBackgroundTaskChange()
                ?.let(backgroundTaskChanges::add)
            RichEventDecoder.decode(selected.host.connectionId, value)?.let {
                if (it.threadKey == selected.key) decodedEvents += it
            }
        }
        val pendingSteer = RichPendingSteerDecoder
            .decodeEnvelope(selected.host.connectionId, value)
            ?.takeIf { it.threadKey == selected.key }
        val followUpQueue = RichFollowUpQueueDecoder
            .decodeEnvelope(selected.host.connectionId, value)
            ?.takeIf { it.threadKey == selected.key }
        return chat.applyServerFrame(
            selected,
            sequence,
            decodedEvents,
            pendingSteer,
            followUpQueue,
            backgroundTaskChanges,
        )
    }

    fun enterBackground() {
        terminalJob?.cancel()
        terminalJob = null
        mutableForeground.value = false
        backgroundTasks.reset()
        terminal.enterBackground()
        chat.enterBackground()
        checkpoints.reset()
        sessionActions.reset()
    }

    fun enterForeground() {
        lifecycle.enterForeground()
        mutableForeground.value = true
        chat.enterForeground()
    }

    fun reconcileSession() {
        val selectedBefore = chat.selection.value
        chat.reconcileSession()
        if (selectedBefore != null && chat.selection.value == null) {
            // The controller closed the selection on a host/lease replacement;
            // reset every selection-scoped slot, including the selected-detail
            // output/Stop identity, so nothing from the old lease survives.
            checkpoints.reset()
            sessionActions.reset()
            backgroundTasks.reset()
        }
        val terminalLease = terminal.state.value.lease ?: return
        val current = session.value
        if (current == null ||
            current.connectionId != terminalLease.host.connectionId ||
            current.bindingGeneration != terminalLease.host.bindingGeneration
        ) {
            terminalJob?.cancel()
            terminalJob = null
            terminal.clearTerminal()
            return
        }
        if (!current.online || !current.ready) {
            terminalJob?.cancel()
            terminalJob = null
            terminal.suspendForReconnect()
            return
        }
        if (projectTerminalSurfacePresented && lifecycle.isForeground &&
            terminalJob?.isActive != true &&
            terminal.state.value.processState != TerminalProcessState.Exited &&
            (current.key != terminalLease.host.key || terminal.state.value.needsAuthoritativeRefresh)
        ) {
            reconnectTerminal()
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
