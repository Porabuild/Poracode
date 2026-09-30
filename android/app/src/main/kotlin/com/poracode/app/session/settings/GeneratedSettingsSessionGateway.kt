package com.poracode.app.session.settings

import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.settings.AgentStatusesSnapshot
import com.poracode.app.model.settings.HostSettingsPatch
import com.poracode.app.model.settings.HostSettingsSnapshot
import com.poracode.app.model.settings.GlobalMcpSettingsCommand
import com.poracode.app.model.settings.GlobalMcpSettingsOperation
import com.poracode.app.model.settings.GlobalMcpSettingsOperationResult
import com.poracode.app.model.settings.GlobalMcpSettingsResponse
import com.poracode.app.model.settings.ProfileCoreStatsSnapshot
import com.poracode.app.model.settings.ProfileDevicesSnapshot
import com.poracode.app.model.settings.ProfileIdentityRequest
import com.poracode.app.model.settings.ProfileIdentitySnapshot
import com.poracode.app.model.settings.ProfileStatsRequest
import com.poracode.app.model.settings.ProfileTokenStatsSnapshot
import com.poracode.app.model.settings.ProviderUsageSnapshot
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.transport.RemoteMutationClassification
import com.poracode.app.transport.settings.SettingsRemoteGateway
import com.poracode.app.transport.settings.SettingsRemoteGatewayProvider
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.StateFlow

/** Enforces exact lease, v3, scopes, cancellation, and sanitized failure semantics. */
class GeneratedSettingsSessionGateway(
    private val session: StateFlow<SettingsHostLease?>,
    private val provider: SettingsRemoteGatewayProvider,
) : SettingsSessionGateway {
    override suspend fun agentStatuses(lease: SettingsHostLease): AgentStatusesSnapshot =
        invoke(lease, SettingsCapability.Read, false) { agentStatuses() }

    override suspend fun providerUsage(lease: SettingsHostLease): ProviderUsageSnapshot =
        invoke(lease, SettingsCapability.Read, false) { providerUsage() }

    override suspend fun profileDevices(lease: SettingsHostLease): ProfileDevicesSnapshot =
        invoke(lease, SettingsCapability.Read, false) { profileDevices() }

    override suspend fun profileCoreStats(
        lease: SettingsHostLease,
        request: ProfileStatsRequest,
    ): ProfileCoreStatsSnapshot = invoke(lease, SettingsCapability.Read, false) {
        profileCoreStats(request)
    }

    override suspend fun profileTokenStats(
        lease: SettingsHostLease,
        request: ProfileStatsRequest,
    ): ProfileTokenStatsSnapshot = invoke(lease, SettingsCapability.Read, false) {
        profileTokenStats(request)
    }

    override suspend fun updateProfileIdentity(
        lease: SettingsHostLease,
        request: ProfileIdentityRequest,
    ): ProfileIdentitySnapshot = invoke(lease, SettingsCapability.Operate, true) {
        updateProfileIdentity(request)
    }

    override suspend fun readSettings(lease: SettingsHostLease): HostSettingsSnapshot =
        invoke(lease, SettingsCapability.Read, false) { readSettings() }

    override suspend fun writeSettings(
        lease: SettingsHostLease,
        patch: HostSettingsPatch,
    ): HostSettingsSnapshot = invoke(lease, SettingsCapability.Operate, true) {
        writeSettings(patch)
    }

    override suspend fun readGlobalMcpSettings(
        lease: SettingsHostLease,
    ): GlobalMcpSettingsResponse = invoke(lease, SettingsCapability.ProjectsManage, false) {
        readGlobalMcpSettings()
    }

    override suspend fun commandGlobalMcpSettings(
        lease: SettingsHostLease,
        command: GlobalMcpSettingsCommand,
    ): GlobalMcpSettingsResponse = invoke(lease, SettingsCapability.ProjectsManage, true) {
        commandGlobalMcpSettings(command)
    }

    override suspend fun operateGlobalMcpSettings(
        lease: SettingsHostLease,
        operation: GlobalMcpSettingsOperation,
    ): GlobalMcpSettingsOperationResult = invoke(
        lease,
        SettingsCapability.ProjectsManage,
        true,
    ) { operateGlobalMcpSettings(operation) }

    private suspend fun <T> invoke(
        lease: SettingsHostLease,
        capability: SettingsCapability,
        mutation: Boolean,
        operation: suspend SettingsRemoteGateway.() -> T,
    ): T {
        requireCurrent(lease, capability)
        val remote = try {
            provider.gatewayFor(lease)
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            throw SettingsGatewayException(0, "network", false)
        } ?: throw SettingsGatewayException(409, "stale_lease", false)
        requireCurrent(lease, capability)
        val result = try {
            remote.operation()
        } catch (error: CancellationException) {
            throw error
        } catch (error: RemoteClientException) {
            throw error.sanitizedSettingsFailure(mutation)
        } catch (error: SettingsGatewayException) {
            throw error
        } catch (_: Exception) {
            throw SettingsGatewayException(0, "network", mutation)
        }
        requireCurrent(lease, capability)
        return result
    }

    private fun requireCurrent(lease: SettingsHostLease, capability: SettingsCapability) {
        val current = session.value
        if (current == null || current.key != lease.key) {
            throw SettingsGatewayException(409, "stale_lease", false)
        }
        if (current.protocolVersion != ProtocolConstants.REMOTE_PROTOCOL_VERSION ||
            lease.protocolVersion != ProtocolConstants.REMOTE_PROTOCOL_VERSION
        ) {
            throw SettingsGatewayException(409, "protocol_version_mismatch", false)
        }
        if (!current.online) throw SettingsGatewayException(0, "offline", false)
        if (!current.ready) throw SettingsGatewayException(409, "session_not_ready", false)
        if (capability.scope !in current.scopes) {
            throw SettingsGatewayException(403, "missing_scope", false)
        }
    }
}

private fun RemoteClientException.sanitizedSettingsFailure(
    mutation: Boolean,
): SettingsGatewayException = SettingsGatewayException(
    statusCode = status,
    code = code.takeIf(SAFE_SETTINGS_ERROR_CODES::contains) ?: "remote_error",
    requestMayHaveCommitted =
        RemoteMutationClassification.requestMayHaveCommitted(this, mutation),
)

private val SAFE_SETTINGS_ERROR_CODES = setOf(
    "invalid_token",
    "unauthorized",
    "forbidden",
    "missing_scope",
    "network",
    "timeout",
    "invalid_response",
    "response_too_large",
    "request_failed",
    "not_modified",
    "mcp_redaction_without_existing_secret",
    "mcp_duplicate_name",
    "mcp_duplicate_id",
    "mcp_same_scope",
    "mcp_project_not_found",
    "mcp_server_not_found",
)
