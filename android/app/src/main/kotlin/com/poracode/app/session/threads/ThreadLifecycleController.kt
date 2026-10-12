package com.poracode.app.session.threads

import com.poracode.app.model.threads.ExistingThreadStartRequest
import com.poracode.app.model.threads.ThreadLifecycleCommand
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

enum class ThreadLifecycleOperation {
    Start, PrepareWorktree, Relaunch, Group, Rename, Acknowledge, Done, Starred, Worktree,
    DeleteWorktreeGroup, Archive, Unarchive, Delete,
}

data class ThreadLifecycleControllerState(
    val active: ThreadLifecycleOperation? = null,
    val lastCompleted: ThreadLifecycleOperation? = null,
    val pendingDestructive: ThreadLifecycleCommand? = null,
    val failure: ThreadOperationFailure? = null,
    val requiresAuthoritativeRefresh: Boolean = false,
)

/** Serializes lifecycle writes and suppresses stale host/background completions. */
class ThreadLifecycleController(
    private val session: StateFlow<ThreadHostLease?>,
    private val gateway: ThreadSessionGateway,
    private val refresh: ThreadRefreshRequester,
) {
    private val mutableState = MutableStateFlow(ThreadLifecycleControllerState())
    val state: StateFlow<ThreadLifecycleControllerState> = mutableState.asStateFlow()
    private val mutex = Mutex()
    private val revision = AtomicLong()
    @Volatile private var foreground = true

    suspend fun startExisting(request: ExistingThreadStartRequest): ThreadOperationResult<String> =
        run(ThreadLifecycleOperation.Start) { gateway.startExisting(it, request) }

    suspend fun execute(command: ThreadLifecycleCommand): ThreadOperationResult<Unit> {
        val operation = operationFor(command)
        return run(operation) { lease -> gateway.command(lease, command) }
    }

    fun requestDestructive(command: ThreadLifecycleCommand) {
        require(command.requiresConfirmation()) { "Command is not destructive." }
        mutableState.update { it.copy(pendingDestructive = command, failure = null) }
    }

    fun cancelDestructive() {
        mutableState.update { it.copy(pendingDestructive = null) }
    }

    suspend fun confirmDestructive(): ThreadOperationResult<Unit> {
        val command = mutableState.value.pendingDestructive
            ?: return ThreadOperationResult.Failed(ThreadOperationFailure.InvalidRequest)
        mutableState.update { it.copy(pendingDestructive = null) }
        return execute(command)
    }

    fun enterBackground() {
        foreground = false
        revision.incrementAndGet()
        mutableState.update { it.copy(active = null, pendingDestructive = null) }
    }

    fun enterForeground() {
        foreground = true
    }

    private suspend fun <T> run(
        operation: ThreadLifecycleOperation,
        call: suspend (ThreadHostLease) -> T,
    ): ThreadOperationResult<T> = mutex.withLock {
        if (!foreground) return@withLock fail(ThreadOperationFailure.Backgrounded)
        val (captured, gateFailure) = session.currentThreadLease()
        val lease = captured ?: return@withLock fail(requireNotNull(gateFailure))
        if (gateFailure != null) return@withLock fail(gateFailure)
        val token = revision.incrementAndGet()
        mutableState.update { it.copy(active = operation, failure = null) }
        try {
            val value = call(lease)
            if (!owns(lease, token)) return@withLock ThreadOperationResult.Stale
            mutableState.update {
                it.copy(active = null, lastCompleted = operation, failure = null)
            }
            refresh.request(lease)
            ThreadOperationResult.Success(value)
        } catch (error: CancellationException) {
            if (owns(lease, token)) mutableState.update { it.copy(active = null) }
            throw error
        } catch (error: Throwable) {
            if (!owns(lease, token)) return@withLock ThreadOperationResult.Stale
            val failure = error.asThreadFailure(mutation = true)
            val ambiguous = failure is ThreadOperationFailure.Remote &&
                failure.requestMayHaveCommitted
            mutableState.update {
                it.copy(
                    active = null,
                    failure = failure,
                    requiresAuthoritativeRefresh =
                        it.requiresAuthoritativeRefresh || ambiguous,
                )
            }
            if (ambiguous) refresh.request(lease)
            ThreadOperationResult.Failed(failure)
        }
    }

    private fun owns(lease: ThreadHostLease, token: Long): Boolean =
        foreground && revision.get() == token && session.isCurrent(lease)

    private fun <T> fail(failure: ThreadOperationFailure): ThreadOperationResult<T> {
        mutableState.update { it.copy(failure = failure) }
        return ThreadOperationResult.Failed(failure)
    }
}

private fun operationFor(command: ThreadLifecycleCommand): ThreadLifecycleOperation = when (command) {
    is ThreadLifecycleCommand.PrepareWorktree -> ThreadLifecycleOperation.PrepareWorktree
    is ThreadLifecycleCommand.Start -> ThreadLifecycleOperation.Relaunch
    is ThreadLifecycleCommand.SetGroup -> ThreadLifecycleOperation.Group
    is ThreadLifecycleCommand.Rename -> ThreadLifecycleOperation.Rename
    is ThreadLifecycleCommand.Acknowledge -> ThreadLifecycleOperation.Acknowledge
    is ThreadLifecycleCommand.SetDone -> ThreadLifecycleOperation.Done
    is ThreadLifecycleCommand.SetStarred -> ThreadLifecycleOperation.Starred
    is ThreadLifecycleCommand.SetWorktree -> ThreadLifecycleOperation.Worktree
    is ThreadLifecycleCommand.DeleteWorktreeGroup -> ThreadLifecycleOperation.DeleteWorktreeGroup
    is ThreadLifecycleCommand.Archive -> ThreadLifecycleOperation.Archive
    is ThreadLifecycleCommand.Unarchive -> ThreadLifecycleOperation.Unarchive
    is ThreadLifecycleCommand.Delete -> ThreadLifecycleOperation.Delete
}

private fun ThreadLifecycleCommand.requiresConfirmation(): Boolean = when (this) {
    is ThreadLifecycleCommand.Delete, is ThreadLifecycleCommand.DeleteWorktreeGroup -> true
    else -> false
}
