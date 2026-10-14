package com.poracode.app.session.threads

import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.threads.ExistingThreadStartRequest
import com.poracode.app.model.threads.ThreadLifecycleCommand
import com.poracode.app.protocol.threads.ThreadLifecycleContractException
import com.poracode.app.transport.RemoteMutationClassification
import com.poracode.app.transport.threads.ThreadLifecycleRemoteGateway
import com.poracode.app.transport.threads.ThreadLifecycleRemoteGatewayProvider
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.StateFlow

/** Exact-host/scope boundary around the generated thread lifecycle transport. */
class GeneratedThreadSessionGateway(
    private val session: StateFlow<ThreadHostLease?>,
    private val provider: ThreadLifecycleRemoteGatewayProvider,
) : ThreadSessionGateway {
    override suspend fun startExisting(
        lease: ThreadHostLease,
        request: ExistingThreadStartRequest,
    ): String = invoke(lease) { startExisting(request) }

    override suspend fun command(lease: ThreadHostLease, command: ThreadLifecycleCommand) =
        invoke(lease) { command(command) }

    private suspend fun <T> invoke(
        lease: ThreadHostLease,
        operation: suspend ThreadLifecycleRemoteGateway.() -> T,
    ): T {
        requireCurrent(lease)
        val remote = try {
            provider.gatewayFor(lease)
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            throw ThreadGatewayException(0, "network", true)
        } ?: throw ThreadGatewayException(409, "stale_lease", false)
        requireCurrent(lease)
        val result = try {
            remote.operation()
        } catch (error: CancellationException) {
            throw error
        } catch (_: ThreadLifecycleContractException) {
            throw ThreadGatewayException(400, "invalid_request", false)
        } catch (error: RemoteClientException) {
            throw error.sanitizedThreadFailure()
        } catch (error: ThreadGatewayException) {
            throw error
        } catch (_: Exception) {
            throw ThreadGatewayException(0, "network", true)
        }
        requireCurrent(lease)
        return result
    }

    private fun requireCurrent(lease: ThreadHostLease) {
        val current = session.value
        if (current == null || current.key != lease.key) {
            throw ThreadGatewayException(409, "stale_lease", false)
        }
        if (!current.online) throw ThreadGatewayException(0, "offline", false)
        if (!current.ready) throw ThreadGatewayException(409, "session_not_ready", false)
        if (ThreadCapability.Operate.scope !in current.scopes) {
            throw ThreadGatewayException(403, "missing_scope", false)
        }
    }
}

private fun RemoteClientException.sanitizedThreadFailure(): ThreadGatewayException =
    ThreadGatewayException(
        statusCode = status,
        code = code.takeIf(SAFE_THREAD_CODES::contains) ?: "remote_error",
        requestMayHaveCommitted =
            RemoteMutationClassification.requestMayHaveCommitted(this, mutation = true),
    )

private val SAFE_THREAD_CODES = setOf(
    "invalid_token",
    "unauthorized",
    "forbidden",
    "missing_scope",
    "network",
    "timeout",
    "invalid_response",
    "response_too_large",
    "request_failed",
    "thread_not_found",
    "project_not_found",
)
