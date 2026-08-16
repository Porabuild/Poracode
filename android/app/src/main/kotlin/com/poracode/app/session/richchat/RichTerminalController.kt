package com.poracode.app.session.richchat

import com.poracode.app.chat.TerminalCursorAction
import com.poracode.app.chat.TerminalCursorFrame
import com.poracode.app.chat.TerminalCursorReconciler
import com.poracode.app.chat.TerminalCursorState
import com.poracode.app.model.terminal.TerminalConnectionPhase
import com.poracode.app.model.terminal.TerminalConnectionFailure
import com.poracode.app.model.terminal.TerminalConnectionStatus
import com.poracode.app.model.terminal.TerminalDimensions
import com.poracode.app.model.terminal.TerminalProcessState
import com.poracode.app.model.terminal.TerminalServerFrame
import com.poracode.app.model.terminal.TerminalWatchError
import com.poracode.app.transport.richchat.TerminalStartInput
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class RichTerminalLease(
    val host: RichChatHostLease,
    val terminalId: String,
    val generation: Long,
) {
    init {
        require(terminalId.isNotEmpty()) { "terminalId must not be empty" }
    }
}

data class RichTerminalState(
    val lease: RichTerminalLease? = null,
    val cursor: TerminalCursorState? = null,
    val watching: Boolean = false,
    val activeOperations: Set<String> = emptySet(),
    val failure: RichChatOperationFailure? = null,
    val needsAuthoritativeRefresh: Boolean = false,
    val connection: TerminalConnectionStatus = TerminalConnectionStatus(),
    val processState: TerminalProcessState? = null,
    val exitCode: Int? = null,
    val dimensions: TerminalDimensions? = null,
    val watchError: TerminalWatchError? = null,
)

/** Terminal state machine with explicit terminal generation, watch id, and cursor ownership. */
class RichTerminalController(
    private val session: StateFlow<RichChatHostLease?>,
    private val gateway: RichChatSessionGateway,
    private val lifecycle: ForegroundOperationRegistry,
    private val watchIdFactory: () -> String = { UUID.randomUUID().toString() },
) {
    private val mutableState = MutableStateFlow(RichTerminalState())
    val state: StateFlow<RichTerminalState> = mutableState.asStateFlow()
    private val writeMutex = Mutex()
    private val resizeMutex = Mutex()
    private var generation = 0L
    private var operationEpoch = 0L
    private val currentEpochByKind = mutableMapOf<String, Long>()

    suspend fun start(input: TerminalStartInput): RichChatOperationResult<RichTerminalLease> {
        val host = prepareHost(RichChatCapability.TerminalOperate) ?: return currentRejection()
        val token = begin(input.shellId, host, OP_START)
        return run(token, RichChatCapability.TerminalOperate, true) {
            gateway.startTerminal(host, input)
            if (!canPublish(token)) return@run RichChatOperationResult.Stale
            val lease = RichTerminalLease(host, input.shellId, token.generation)
            mutableState.value = RichTerminalState(lease = lease)
            RichChatOperationResult.Success(lease)
        }
    }

    suspend fun watch(
        terminalId: String = mutableState.value.lease?.terminalId.orEmpty(),
        watchId: String = watchIdFactory(),
    ): RichChatOperationResult<RichTerminalLease> {
        if (terminalId.isEmpty() || watchId.isEmpty()) {
            return rejected(RichChatOperationFailure.InvalidRequest)
        }
        val host = prepareHost(RichChatCapability.TerminalRead) ?: run {
            markWatchGateFailure()
            return currentRejection()
        }
        val token = begin(terminalId, host, OP_WATCH)
        val lease = RichTerminalLease(host, terminalId, token.generation)
        mutableState.value = RichTerminalState(
            lease = lease,
            cursor = TerminalCursorState.watching(watchId),
            activeOperations = setOf(OP_WATCH),
        )
        return run(token, RichChatCapability.TerminalRead, false) {
            gateway.watchTerminal(host, RichTerminalWatchRequest(terminalId, watchId))
            if (!canPublish(token)) return@run RichChatOperationResult.Stale
            mutableState.update {
                it.copy(watching = true, activeOperations = it.activeOperations - OP_WATCH)
            }
            RichChatOperationResult.Success(lease)
        }
    }

    suspend fun rewatch(watchId: String = watchIdFactory()): RichChatOperationResult<RichTerminalLease> {
        val terminalId = mutableState.value.lease?.terminalId
            ?: return rejected(RichChatOperationFailure.NoThread)
        return watch(terminalId, watchId)
    }

    suspend fun unwatch(): RichChatOperationResult<Unit> {
        val current = mutableState.value.lease
            ?: return RichChatOperationResult.Success(Unit)
        val host = prepareHost(RichChatCapability.TerminalRead) ?: return currentRejection()
        if (current.host.key != host.key) return RichChatOperationResult.Stale
        val token = capture(current, OP_UNWATCH)
        return run(token, RichChatCapability.TerminalRead, false) {
            gateway.unwatchTerminal(host, current.terminalId)
            if (!canPublish(token)) return@run RichChatOperationResult.Stale
            mutableState.update { it.copy(cursor = null, watching = false, activeOperations = emptySet()) }
            RichChatOperationResult.Success(Unit)
        }
    }

    fun applyFrame(source: RichTerminalLease, frame: TerminalCursorFrame): Boolean {
        val current = mutableState.value
        val lease = current.lease ?: return false
        if (!lifecycle.isForeground || source != lease || !session.isCurrent(source.host)) return false
        if (frame.terminalId != lease.terminalId) return false
        val cursor = current.cursor ?: return false
        val result = TerminalCursorReconciler.reconcile(cursor, frame)
        if (result.action == TerminalCursorAction.IGNORE) return false
        mutableState.update {
            if (it.lease != source || it.cursor?.watchId != cursor.watchId) {
                it
            } else {
                it.copy(
                    cursor = result.state,
                    needsAuthoritativeRefresh = result.action == TerminalCursorAction.RESYNC,
                )
            }
        }
        return true
    }

    fun applyTransportFrame(sourceHost: RichChatHostKey, frame: TerminalServerFrame): Boolean {
        val lease = mutableState.value.lease ?: return false
        if (lease.host.key != sourceHost) return false
        return when (frame) {
            is TerminalServerFrame.Cursor -> {
                val applied = applyFrame(lease, frame.frame)
                if (applied && frame.frame.kind == com.poracode.app.chat.TerminalCursorFrameKind.BASELINE) {
                    mutableState.update { current ->
                        if (current.lease != lease) current else current.copy(
                            processState = frame.processState,
                            dimensions = frame.dimensions,
                            watchError = null,
                        )
                    }
                }
                applied
            }
            is TerminalServerFrame.WatchError -> {
                val cursor = mutableState.value.cursor ?: return false
                if (frame.error.terminalId != lease.terminalId ||
                    frame.error.watchId != cursor.watchId
                ) {
                    return false
                }
                mutableState.update { current ->
                    if (current.lease != lease || current.cursor?.watchId != cursor.watchId) current
                    else current.copy(watchError = frame.error)
                }
                true
            }
        }
    }

    fun connectionReset(
        sourceHost: RichChatHostKey,
        terminalId: String,
        watchId: String,
        status: TerminalConnectionStatus,
    ): Boolean {
        val current = mutableState.value
        val lease = current.lease ?: return false
        if (lease.host.key != sourceHost || lease.terminalId != terminalId ||
            current.cursor?.watchId != watchId
        ) {
            return false
        }
        mutableState.update { latest ->
            if (latest.lease != lease || latest.cursor?.watchId != watchId) latest else latest.copy(
                cursor = TerminalCursorState.watching(watchId),
                connection = status,
                needsAuthoritativeRefresh = false,
                processState = null,
                dimensions = null,
                watchError = null,
            )
        }
        return true
    }

    fun updateConnection(
        sourceHost: RichChatHostKey,
        terminalId: String,
        watchId: String,
        status: TerminalConnectionStatus,
    ): Boolean {
        val current = mutableState.value
        val lease = current.lease ?: return false
        if (lease.host.key != sourceHost || lease.terminalId != terminalId ||
            current.cursor?.watchId != watchId
        ) {
            return false
        }
        mutableState.update { latest ->
            if (latest.lease != lease || latest.cursor?.watchId != watchId) latest
            else latest.copy(
                connection = status,
                watching = status.phase != TerminalConnectionPhase.Idle &&
                    status.phase != TerminalConnectionPhase.Failed,
            )
        }
        return true
    }

    suspend fun write(data: String): RichChatOperationResult<Unit> = writeMutex.withLock {
        if (mutableState.value.processState == TerminalProcessState.Exited) {
            return@withLock RichChatOperationResult.Failed(RichChatOperationFailure.NoThread)
        }
        if (data.isEmpty()) return@withLock RichChatOperationResult.Success(Unit)
        terminalMutation(OP_WRITE) { host, terminalId ->
            gateway.writeTerminal(host, terminalId, data)
        }
    }

    suspend fun resize(columns: Int, rows: Int): RichChatOperationResult<Unit> =
        resizeMutex.withLock {
            if (columns <= 0 || rows <= 0) {
                return@withLock rejected(RichChatOperationFailure.InvalidRequest)
            }
            terminalMutation(OP_RESIZE) { host, terminalId ->
                gateway.resizeTerminal(host, terminalId, columns, rows)
            }
        }

    suspend fun close(): RichChatOperationResult<Unit> {
        val current = mutableState.value.lease
            ?: return rejected(RichChatOperationFailure.NoThread)
        val result = terminalMutation(OP_CLOSE) { host, id -> gateway.closeTerminal(host, id) }
        if (result is RichChatOperationResult.Success) {
            runCatching { gateway.unwatchTerminal(current.host, current.terminalId) }
            clearTerminal()
        }
        return result
    }

    fun enterBackground() {
        lifecycle.enterBackground()
        bumpGenerationAndEpoch()
        mutableState.update {
            it.copy(
                lease = it.lease?.copy(generation = generation),
                cursor = null,
                watching = false,
                activeOperations = emptySet(),
                failure = null,
                needsAuthoritativeRefresh = it.lease != null,
                connection = TerminalConnectionStatus(TerminalConnectionPhase.Suspended),
            )
        }
    }

    fun clearTerminal() {
        bumpGenerationAndEpoch()
        mutableState.value = RichTerminalState()
    }

    /**
     * Discard the current cursor/baseline/process state so a stale pre-reset buffer
     * can never be reused, while preserving the terminal lease and watch intent so
     * exactly one fresh watch/baseline is requested by the caller. Bumps the terminal
     * generation and operation epoch so in-flight frames/operations for the prior
     * baseline are rejected. No network side effect: the caller issues the rewatch.
     */
    fun discardCursorForFreshBaseline() {
        val current = mutableState.value
        val lease = current.lease ?: return
        bumpGenerationAndEpoch()
        mutableState.update { latest ->
            if (latest.lease != lease) {
                latest
            } else {
                latest.copy(
                    lease = latest.lease?.copy(generation = generation),
                    cursor = latest.cursor?.let { TerminalCursorState.watching(it.watchId) },
                    needsAuthoritativeRefresh = false,
                    processState = null,
                    exitCode = null,
                    dimensions = null,
                    watchError = null,
                )
            }
        }
    }

    /**
     * Applies an accepted `thread-exited` for the exact watched terminal (mirrors iOS
     * `applyHostThreadExit`): mark the PTY exited, preserve the exit code, retain the
     * lease/cursor/transcript/watch intent (no second socket, idempotent), and bump the
     * generation so in-flight frames/operations cannot revive the dead PTY.
     */
    fun applyHostThreadExit(lease: RichTerminalLease, exitCode: Int?): Boolean {
        val current = mutableState.value
        val currentLease = current.lease ?: return false
        if (currentLease != lease || current.processState == TerminalProcessState.Exited) return false
        bumpGenerationAndEpoch()
        mutableState.update { latest ->
            if (latest.lease != lease) {
                latest
            } else {
                latest.copy(
                    lease = latest.lease?.copy(generation = generation),
                    processState = TerminalProcessState.Exited,
                    exitCode = exitCode,
                    activeOperations = latest.activeOperations - OP_WATCH,
                )
            }
        }
        return true
    }

    private suspend fun terminalMutation(
        kind: String,
        operation: suspend (RichChatHostLease, String) -> Unit,
    ): RichChatOperationResult<Unit> {
        val current = mutableState.value.lease
            ?: return rejected(RichChatOperationFailure.NoThread)
        val host = prepareHost(RichChatCapability.TerminalOperate) ?: return currentRejection()
        if (current.host.key != host.key) return RichChatOperationResult.Stale
        val token = capture(current.copy(host = host), kind)
        return run(token, RichChatCapability.TerminalOperate, true) {
            operation(host, current.terminalId)
            if (!canPublish(token)) return@run RichChatOperationResult.Stale
            mutableState.update {
                it.copy(activeOperations = it.activeOperations - kind, failure = null)
            }
            RichChatOperationResult.Success(Unit)
        }
    }

    private fun begin(
        terminalId: String,
        host: RichChatHostLease,
        kind: String,
    ): TerminalOperationToken {
        generation += 1L
        mutableState.update {
            it.copy(activeOperations = it.activeOperations + kind, failure = null)
        }
        return TerminalOperationToken(host.key, terminalId, generation, kind, nextEpoch(kind))
    }

    private fun capture(lease: RichTerminalLease, kind: String): TerminalOperationToken {
        mutableState.update {
            it.copy(activeOperations = it.activeOperations + kind, failure = null)
        }
        return TerminalOperationToken(
            lease.host.key,
            lease.terminalId,
            lease.generation,
            kind,
            nextEpoch(kind),
        )
    }

    private suspend fun <T> run(
        token: TerminalOperationToken,
        capability: RichChatCapability,
        mutation: Boolean,
        operation: suspend () -> RichChatOperationResult<T>,
    ): RichChatOperationResult<T> = try {
        lifecycle.run { lifecycleToken ->
            val result = operation()
            if (lifecycle.isCurrent(lifecycleToken)) result else RichChatOperationResult.Stale
        }
    } catch (error: CancellationException) {
        if (canPublish(token)) clearActive(token.kind)
        throw error
    } catch (_: RichChatBackgroundException) {
        rejected(RichChatOperationFailure.Backgrounded)
    } catch (error: Exception) {
        if (!canPublish(token)) {
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

    private fun prepareHost(capability: RichChatCapability): RichChatHostLease? {
        if (!lifecycle.isForeground) {
            rejected<Unit>(RichChatOperationFailure.Backgrounded)
            return null
        }
        val (host, failure) = session.currentLease(capability)
        if (failure != null || host == null) {
            rejected<Unit>(failure!!)
            return null
        }
        return host
    }

    private fun canPublish(token: TerminalOperationToken): Boolean {
        if (!lifecycle.isForeground) return false
        val currentHost = session.value ?: return false
        if (currentHost.key != token.host || !currentHost.online || !currentHost.ready) return false
        if (synchronized(this) { currentEpochByKind[token.kind] } != token.epoch) return false
        if (token.kind == OP_START) return generation == token.generation
        val current = mutableState.value.lease ?: return false
        return current.host.key == token.host && current.terminalId == token.terminalId &&
            current.generation == token.generation
    }

    private fun currentRejection(): RichChatOperationResult.Failed =
        RichChatOperationResult.Failed(
            mutableState.value.failure ?: RichChatOperationFailure.NoThread,
        )

    private fun markWatchGateFailure() {
        val failure = mutableState.value.failure ?: return
        val status = when (failure) {
            RichChatOperationFailure.Backgrounded ->
                TerminalConnectionStatus(TerminalConnectionPhase.Suspended)
            RichChatOperationFailure.AuthenticationRequired -> TerminalConnectionStatus(
                TerminalConnectionPhase.Failed,
                TerminalConnectionFailure.Authentication,
            )
            is RichChatOperationFailure.AuthorizationDenied -> TerminalConnectionStatus(
                TerminalConnectionPhase.Failed,
                TerminalConnectionFailure.Permission,
            )
            else -> TerminalConnectionStatus(
                TerminalConnectionPhase.Failed,
                TerminalConnectionFailure.Network,
            )
        }
        mutableState.update { it.copy(connection = status) }
    }

    private fun clearActive(kind: String) {
        mutableState.update { it.copy(activeOperations = it.activeOperations - kind) }
    }

    private fun <T> rejected(failure: RichChatOperationFailure): RichChatOperationResult<T> {
        mutableState.update { it.copy(failure = failure) }
        return RichChatOperationResult.Failed(failure)
    }

    @Synchronized
    private fun nextEpoch(kind: String): Long {
        operationEpoch += 1L
        currentEpochByKind[kind] = operationEpoch
        return operationEpoch
    }

    private fun bumpGenerationAndEpoch() {
        generation += 1L
        synchronized(this) {
            operationEpoch += 1L
            currentEpochByKind.clear()
        }
    }

    private data class TerminalOperationToken(
        val host: RichChatHostKey,
        val terminalId: String,
        val generation: Long,
        val kind: String,
        val epoch: Long,
    )

    private companion object {
        const val OP_START = "terminal-start"
        const val OP_WATCH = "terminal-watch"
        const val OP_UNWATCH = "terminal-unwatch"
        const val OP_WRITE = "terminal-write"
        const val OP_RESIZE = "terminal-resize"
        const val OP_CLOSE = "terminal-close"
    }
}
