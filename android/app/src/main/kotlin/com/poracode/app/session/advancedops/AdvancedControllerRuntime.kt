package com.poracode.app.session.advancedops

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.withContext

sealed interface AdvancedControllerResult<out T> {
    data class Success<T>(val value: T) : AdvancedControllerResult<T>
    data class Failed(val failure: AdvancedOperationFailure) : AdvancedControllerResult<Nothing>
    data object Stale : AdvancedControllerResult<Nothing>
}

sealed interface AdvancedOperationFailure {
    data object Closed : AdvancedOperationFailure
    data object StaleOwner : AdvancedOperationFailure
    data object Offline : AdvancedOperationFailure
    data object SessionNotReady : AdvancedOperationFailure
    data object AuthenticationRequired : AdvancedOperationFailure
    data class AuthorizationDenied(val requiredScope: String) : AdvancedOperationFailure
    data class Remote(
        val statusCode: Int?,
        val safeCode: String,
        val mayHaveCommitted: Boolean,
    ) : AdvancedOperationFailure
}

/** Latest-wins publication plus cancellable controller lifetime. */
internal class AdvancedControllerRuntime {
    private val revisions = ConcurrentHashMap<String, AtomicLong>()
    private val activeJobs = ConcurrentHashMap.newKeySet<Job>()
    @Volatile private var closed = false

    suspend fun <T> read(key: String, operation: suspend () -> T): AdvancedControllerResult<T> {
        val revision = revisions.computeIfAbsent(key) { AtomicLong() }.incrementAndGet()
        return execute {
            val value = operation()
            if (revisions[key]?.get() == revision) {
                AdvancedControllerResult.Success(value)
            } else {
                AdvancedControllerResult.Stale
            }
        }
    }

    suspend fun <T> mutation(
        key: String,
        latestOutputWins: Boolean = false,
        operation: suspend () -> T,
    ): AdvancedControllerResult<T> {
        val revision = if (latestOutputWins) {
            revisions.computeIfAbsent(key) { AtomicLong() }.incrementAndGet()
        } else {
            null
        }
        return execute {
            val value = operation()
            if (revision == null || revisions[key]?.get() == revision) {
                AdvancedControllerResult.Success(value)
            } else {
                AdvancedControllerResult.Stale
            }
        }
    }

    fun close() {
        closed = true
        revisions.values.forEach { it.incrementAndGet() }
        activeJobs.toList().forEach { it.cancel(CancellationException("Controller closed")) }
        activeJobs.clear()
    }

    private suspend fun <T> execute(
        operation: suspend () -> AdvancedControllerResult<T>,
    ): AdvancedControllerResult<T> {
        if (closed) return AdvancedControllerResult.Failed(AdvancedOperationFailure.Closed)
        val child = Job(currentCoroutineContext()[Job])
        activeJobs += child
        return try {
            withContext(child) {
                if (closed) AdvancedControllerResult.Stale else operation()
            }
        } catch (error: CancellationException) {
            throw error
        } catch (error: AdvancedGatewayException) {
            AdvancedControllerResult.Failed(error.toFailure())
        } finally {
            activeJobs -= child
            child.complete()
        }
    }
}

private fun AdvancedGatewayException.toFailure(): AdvancedOperationFailure = when {
    safeCode == "stale_owner" -> AdvancedOperationFailure.StaleOwner
    safeCode == "offline" -> AdvancedOperationFailure.Offline
    safeCode == "background" -> AdvancedOperationFailure.Offline
    safeCode == "session_not_ready" -> AdvancedOperationFailure.SessionNotReady
    statusCode == 401 -> AdvancedOperationFailure.AuthenticationRequired
    statusCode == 403 -> AdvancedOperationFailure.AuthorizationDenied("required_remote_scope")
    else -> AdvancedOperationFailure.Remote(statusCode, safeCode, mayHaveCommitted)
}
