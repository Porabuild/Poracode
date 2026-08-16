package com.poracode.app.session.remoteintegrations

import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.remoteintegrations.HostUpdateState
import com.poracode.app.model.remoteintegrations.PrWatch
import com.poracode.app.model.remoteintegrations.PrWatchDraft
import com.poracode.app.model.remoteintegrations.PrWatchKey
import com.poracode.app.model.remoteintegrations.ScheduledTask
import com.poracode.app.transport.RemoteMutationClassification
import com.poracode.app.transport.remoteintegrations.RemoteIntegrationsGateway
import com.poracode.app.transport.remoteintegrations.RemoteIntegrationsGatewayProvider
import com.poracode.app.transport.remoteintegrations.ScheduleCommand
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.StateFlow

interface IntegrationSessionGateway {
    suspend fun hostUpdate(lease: IntegrationHostLease): HostUpdateState
    suspend fun checkHostUpdate(lease: IntegrationHostLease): HostUpdateState
    suspend fun installHostUpdate(lease: IntegrationHostLease)
    suspend fun schedules(lease: IntegrationHostLease): List<ScheduledTask>
    suspend fun commandSchedule(
        lease: IntegrationHostLease,
        command: ScheduleCommand,
    ): List<ScheduledTask>
    suspend fun prWatch(lease: IntegrationHostLease, key: PrWatchKey): PrWatch?
    suspend fun checkPrWatch(lease: IntegrationHostLease, key: PrWatchKey)
    suspend fun upsertPrWatch(lease: IntegrationHostLease, draft: PrWatchDraft): PrWatch
    suspend fun deletePrWatch(lease: IntegrationHostLease, key: PrWatchKey)
}

class IntegrationGatewayException(
    val statusCode: Int?,
    val code: String,
    val requestMayHaveCommitted: Boolean,
    cause: Throwable? = null,
) : Exception("Remote integrations request failed.", cause)

/** Exact-lease enforcement around all nine generated HTTP routes. */
class GeneratedIntegrationSessionGateway(
    private val session: StateFlow<IntegrationHostLease?>,
    private val provider: RemoteIntegrationsGatewayProvider,
) : IntegrationSessionGateway {
    override suspend fun hostUpdate(lease: IntegrationHostLease) =
        invoke(lease, IntegrationCapability.ManageProjects, false) { hostUpdate() }

    override suspend fun checkHostUpdate(lease: IntegrationHostLease) =
        invoke(lease, IntegrationCapability.ManageProjects, true) { checkHostUpdate() }

    override suspend fun installHostUpdate(lease: IntegrationHostLease) =
        invoke(lease, IntegrationCapability.ManageProjects, true) { installHostUpdate() }

    override suspend fun schedules(lease: IntegrationHostLease) =
        invoke(lease, IntegrationCapability.Read, false) { schedules() }

    override suspend fun commandSchedule(lease: IntegrationHostLease, command: ScheduleCommand) =
        invoke(lease, IntegrationCapability.Operate, true) { commandSchedule(command) }

    override suspend fun prWatch(lease: IntegrationHostLease, key: PrWatchKey) =
        invoke(lease, IntegrationCapability.Read, false) { prWatch(key) }

    override suspend fun checkPrWatch(lease: IntegrationHostLease, key: PrWatchKey) =
        invoke(lease, IntegrationCapability.Operate, true) { checkPrWatch(key) }

    override suspend fun upsertPrWatch(lease: IntegrationHostLease, draft: PrWatchDraft) =
        invoke(lease, IntegrationCapability.Operate, true) { upsertPrWatch(draft) }

    override suspend fun deletePrWatch(lease: IntegrationHostLease, key: PrWatchKey) =
        invoke(lease, IntegrationCapability.Operate, true) { deletePrWatch(key) }

    private suspend fun <T> invoke(
        lease: IntegrationHostLease,
        capability: IntegrationCapability,
        mutation: Boolean,
        operation: suspend RemoteIntegrationsGateway.() -> T,
    ): T {
        requireCurrent(lease, capability)
        val remote = try {
            provider.gatewayFor(lease)
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            throw IntegrationGatewayException(0, "network", false)
        } ?: throw IntegrationGatewayException(409, "stale_lease", false)
        requireCurrent(lease, capability)
        val result = try {
            remote.operation()
        } catch (error: CancellationException) {
            throw error
        } catch (error: RemoteClientException) {
            throw error.sanitized(mutation)
        } catch (error: IntegrationGatewayException) {
            throw error
        } catch (_: Exception) {
            throw IntegrationGatewayException(0, "network", mutation)
        }
        requireCurrent(lease, capability)
        return result
    }

    private fun requireCurrent(lease: IntegrationHostLease, capability: IntegrationCapability) {
        val current = session.value
        if (current == null || current.key != lease.key) {
            throw IntegrationGatewayException(409, "stale_lease", false)
        }
        if (current.protocolVersion != 3 || lease.protocolVersion != 3) {
            throw IntegrationGatewayException(409, "protocol_version_mismatch", false)
        }
        if (!current.ready) throw IntegrationGatewayException(409, "session_not_ready", false)
        if (!current.online) throw IntegrationGatewayException(0, "offline", false)
        if (capability.scope !in current.scopes) {
            throw IntegrationGatewayException(403, "missing_scope", false)
        }
    }
}

internal fun Throwable.asIntegrationFailure(
    capability: IntegrationCapability,
    mutation: Boolean,
): IntegrationFailure {
    val gateway = this as? IntegrationGatewayException
    return when (gateway?.statusCode) {
        401 -> IntegrationFailure.AuthenticationRequired
        403 -> IntegrationFailure.PermissionDenied(capability.scope)
        else -> IntegrationFailure.Remote(
            code = gateway?.code ?: "request_failed",
            requestMayHaveCommitted = gateway?.requestMayHaveCommitted ?: mutation,
        )
    }
}

private fun RemoteClientException.sanitized(mutation: Boolean) = IntegrationGatewayException(
    statusCode = status,
    code = code.takeIf(SAFE_CODES::contains) ?: "remote_error",
    requestMayHaveCommitted =
        RemoteMutationClassification.requestMayHaveCommitted(this, mutation),
)

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
    "host_update_unavailable",
    "host_update_not_ready",
    "schedules_unavailable",
    "pr_watches_unavailable",
)
