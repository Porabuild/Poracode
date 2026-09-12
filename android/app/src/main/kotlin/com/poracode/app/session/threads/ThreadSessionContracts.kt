package com.poracode.app.session.threads

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.threads.ExistingThreadStartRequest
import com.poracode.app.model.threads.ThreadLifecycleCommand
import com.poracode.app.model.threads.ThreadCommandId
import kotlinx.coroutines.flow.StateFlow

data class ThreadHostLease(
    val connectionId: ClientConnectionId,
    val generation: Long,
    val scopes: Set<String>,
    val online: Boolean,
    val ready: Boolean,
) {
    val key: ThreadHostKey get() = ThreadHostKey(connectionId, generation)
}

data class ThreadHostKey(val connectionId: ClientConnectionId, val generation: Long)

enum class ThreadCapability(val scope: String) { Operate("session:operate") }

sealed interface ThreadOperationFailure {
    data object NoSession : ThreadOperationFailure
    data object Offline : ThreadOperationFailure
    data object SessionNotReady : ThreadOperationFailure
    data object Backgrounded : ThreadOperationFailure
    data object AuthenticationRequired : ThreadOperationFailure
    data object InvalidRequest : ThreadOperationFailure
    data object InvalidResponse : ThreadOperationFailure

    data class AuthorizationDenied(val requiredScope: String, val missingScope: Boolean) :
        ThreadOperationFailure

    data class Remote(
        val statusCode: Int?,
        val code: String,
        val requestMayHaveCommitted: Boolean,
    ) : ThreadOperationFailure
}

class ThreadGatewayException(
    val statusCode: Int?,
    val code: String,
    val requestMayHaveCommitted: Boolean,
    cause: Throwable? = null,
) : Exception("Thread lifecycle request failed.", cause)

sealed interface ThreadOperationResult<out T> {
    data class Success<T>(val value: T) : ThreadOperationResult<T>
    data class Failed(val failure: ThreadOperationFailure) : ThreadOperationResult<Nothing>
    data object Stale : ThreadOperationResult<Nothing>
}

interface ThreadSessionGateway {
    suspend fun startExisting(
        lease: ThreadHostLease,
        request: ExistingThreadStartRequest,
    ): String

    suspend fun command(lease: ThreadHostLease, command: ThreadLifecycleCommand)
}

fun interface ThreadRefreshRequester {
    fun request(lease: ThreadHostLease)
}

internal fun StateFlow<ThreadHostLease?>.currentThreadLease(): Pair<ThreadHostLease?, ThreadOperationFailure?> {
    val lease = value ?: return null to ThreadOperationFailure.NoSession
    if (!lease.online) return lease to ThreadOperationFailure.Offline
    if (!lease.ready) return lease to ThreadOperationFailure.SessionNotReady
    if (ThreadCapability.Operate.scope !in lease.scopes) {
        return lease to ThreadOperationFailure.AuthorizationDenied(
            ThreadCapability.Operate.scope,
            missingScope = true,
        )
    }
    return lease to null
}

internal fun StateFlow<ThreadHostLease?>.isCurrent(lease: ThreadHostLease): Boolean {
    val current = value ?: return false
    return current.key == lease.key && current.online && current.ready
}

internal fun Throwable.asThreadFailure(mutation: Boolean): ThreadOperationFailure {
    val gateway = this as? ThreadGatewayException
    return when (gateway?.statusCode) {
        401 -> ThreadOperationFailure.AuthenticationRequired
        403 -> ThreadOperationFailure.AuthorizationDenied(
            ThreadCapability.Operate.scope,
            missingScope = gateway.code == "missing_scope",
        )
        else -> when (gateway?.code) {
            "invalid_request" -> ThreadOperationFailure.InvalidRequest
            "invalid_response" -> if (mutation) {
                ThreadOperationFailure.Remote(
                    gateway?.statusCode,
                    "invalid_response",
                    requestMayHaveCommitted = true,
                )
            } else {
                ThreadOperationFailure.InvalidResponse
            }
            else -> ThreadOperationFailure.Remote(
                gateway?.statusCode,
                gateway?.code ?: "network",
                gateway?.requestMayHaveCommitted ?: mutation,
            )
        }
    }
}
