package com.poracode.app.session.browsermirror

import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.browsermirror.BrowserCommand
import com.poracode.app.model.browsermirror.BrowserInput
import com.poracode.app.model.browsermirror.BrowserState
import com.poracode.app.transport.RemoteMutationClassification
import com.poracode.app.transport.browsermirror.BrowserMirrorRemoteGateway
import com.poracode.app.transport.browsermirror.BrowserMirrorTransportProvider
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.StateFlow

class GeneratedBrowserMirrorSessionGateway(
    private val leases: StateFlow<BrowserMirrorHostLease?>,
    private val provider: BrowserMirrorTransportProvider,
) : BrowserMirrorSessionGateway {
    override suspend fun state(lease: BrowserMirrorHostLease): BrowserState =
        invoke(lease, BrowserMirrorCapability.Read, mutation = false) { state() }

    override suspend fun command(
        lease: BrowserMirrorHostLease,
        command: BrowserCommand,
    ): BrowserState = invoke(lease, BrowserMirrorCapability.Operate, mutation = true) {
        command(command)
    }

    override suspend fun watch(lease: BrowserMirrorHostLease) {
        invoke(lease, BrowserMirrorCapability.Read, mutation = false) {
            checkSend(sendWatch())
        }
    }

    override suspend fun unwatch(lease: BrowserMirrorHostLease) {
        invoke(lease, BrowserMirrorCapability.Read, mutation = false) {
            checkSend(sendUnwatch())
        }
    }

    override suspend fun input(lease: BrowserMirrorHostLease, input: BrowserInput) {
        invoke(lease, BrowserMirrorCapability.Operate, mutation = false) {
            checkSend(sendInput(input))
        }
    }

    private suspend fun <T> invoke(
        lease: BrowserMirrorHostLease,
        capability: BrowserMirrorCapability,
        mutation: Boolean,
        operation: suspend BrowserMirrorRemoteGateway.() -> T,
    ): T {
        leases.requireBrowserMirrorLease(lease, capability)
        val transports = await(mutation) { provider.transportsFor(lease) }
            ?: throw BrowserMirrorGatewayException(409, "stale_lease", false)
        leases.requireBrowserMirrorLease(lease, capability)
        val result = await(mutation) { transports.gateway.operation() }
        leases.requireBrowserMirrorLease(lease, capability)
        return result
    }

    private suspend fun <T> await(mutation: Boolean, block: suspend () -> T): T = try {
        block()
    } catch (error: CancellationException) {
        throw error
    } catch (error: BrowserMirrorGatewayException) {
        throw error
    } catch (error: RemoteClientException) {
        throw error.toBrowserFailure(mutation)
    } catch (_: Exception) {
        throw BrowserMirrorGatewayException(0, "network", mutation)
    }

    private fun checkSend(sent: Boolean) {
        if (!sent) throw BrowserMirrorGatewayException(0, "socket_unavailable", false)
    }
}

private fun RemoteClientException.toBrowserFailure(mutation: Boolean): BrowserMirrorGatewayException {
    val safeCode = code.takeIf(SAFE_CODES::contains) ?: "remote_error"
    val ambiguous = RemoteMutationClassification.requestMayHaveCommitted(this, mutation)
    return BrowserMirrorGatewayException(status, safeCode, ambiguous, this)
}

private val SAFE_CODES = setOf(
    "invalid_token",
    "unauthorized",
    "forbidden",
    "missing_scope",
    "network",
    "timeout",
    "invalid_response",
    "response_too_large",
    "request_failed",
)
