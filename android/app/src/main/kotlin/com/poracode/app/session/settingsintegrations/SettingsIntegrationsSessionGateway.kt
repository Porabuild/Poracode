package com.poracode.app.session.settingsintegrations

import com.poracode.app.model.RemoteClientException
import com.poracode.app.protocol.settingsintegrations.ExternalMcpGroup
import com.poracode.app.protocol.settingsintegrations.MarketplaceInstallRequest
import com.poracode.app.protocol.settingsintegrations.MarketplaceRequest
import com.poracode.app.protocol.settingsintegrations.MarketplaceResult
import com.poracode.app.protocol.settingsintegrations.McpDiscoveryRequest
import com.poracode.app.protocol.settingsintegrations.McpOauthResult
import com.poracode.app.protocol.settingsintegrations.McpOauthStatus
import com.poracode.app.protocol.settingsintegrations.McpProbeResult
import com.poracode.app.protocol.settingsintegrations.McpServer
import com.poracode.app.protocol.settingsintegrations.SkillImportItem
import com.poracode.app.protocol.settingsintegrations.SkillOwner
import com.poracode.app.protocol.settingsintegrations.SkillScanRequest
import com.poracode.app.protocol.settingsintegrations.SkillScanResult
import com.poracode.app.transport.RemoteMutationClassification
import com.poracode.app.transport.settingsintegrations.SettingsIntegrationsRemoteGateway
import com.poracode.app.transport.settingsintegrations.SettingsIntegrationsRemoteGatewayProvider
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.StateFlow

interface SettingsIntegrationsSessionGateway {
    suspend fun scanSkills(lease: SettingsIntegrationsLease, request: SkillScanRequest): SkillScanResult
    suspend fun listSkillMarketplace(lease: SettingsIntegrationsLease, request: MarketplaceRequest): MarketplaceResult
    suspend fun setSkillEnabled(lease: SettingsIntegrationsLease, owner: SkillOwner, path: String, enabled: Boolean)
    suspend fun deleteSkill(lease: SettingsIntegrationsLease, owner: SkillOwner, path: String)
    suspend fun importSkills(lease: SettingsIntegrationsLease, items: List<SkillImportItem>): List<String>
    suspend fun installMarketplaceSkill(lease: SettingsIntegrationsLease, request: MarketplaceInstallRequest): String
    suspend fun discoverExternalMcpServers(lease: SettingsIntegrationsLease, request: McpDiscoveryRequest): List<ExternalMcpGroup>
    suspend fun probeMcpServer(lease: SettingsIntegrationsLease, owner: SkillOwner, server: McpServer): McpProbeResult
    suspend fun getMcpOauthStatus(lease: SettingsIntegrationsLease, owner: SkillOwner): McpOauthStatus
    suspend fun beginMcpServerOauth(lease: SettingsIntegrationsLease, owner: SkillOwner, server: McpServer): McpOauthResult
    suspend fun waitMcpServerOauth(lease: SettingsIntegrationsLease, owner: SkillOwner, flowId: String): McpOauthResult
    suspend fun clearMcpServerOauth(lease: SettingsIntegrationsLease, owner: SkillOwner, url: String)
}

class SettingsIntegrationsGatewayException(
    val statusCode: Int,
    val code: String,
    val requestMayHaveCommitted: Boolean,
) : Exception("Settings integrations request failed.")

class GeneratedSettingsIntegrationsSessionGateway(
    private val session: StateFlow<SettingsIntegrationsLease?>,
    private val provider: SettingsIntegrationsRemoteGatewayProvider,
) : SettingsIntegrationsSessionGateway {
    override suspend fun scanSkills(lease: SettingsIntegrationsLease, request: SkillScanRequest) =
        invoke(lease, SettingsIntegrationsCapability.Read, false, { owns(request.owner) }) {
            scanSkills(request)
        }

    override suspend fun listSkillMarketplace(lease: SettingsIntegrationsLease, request: MarketplaceRequest) =
        invoke(lease, SettingsIntegrationsCapability.Read, false, { true }) {
            listSkillMarketplace(request)
        }

    override suspend fun setSkillEnabled(lease: SettingsIntegrationsLease, owner: SkillOwner, path: String, enabled: Boolean) =
        invoke(lease, SettingsIntegrationsCapability.Operate, true, { owns(owner) }) {
            setSkillEnabled(owner, path, enabled)
        }

    override suspend fun deleteSkill(lease: SettingsIntegrationsLease, owner: SkillOwner, path: String) =
        invoke(lease, SettingsIntegrationsCapability.Operate, true, { owns(owner) }) {
            deleteSkill(owner, path)
        }

    override suspend fun importSkills(lease: SettingsIntegrationsLease, items: List<SkillImportItem>) =
        invoke(lease, SettingsIntegrationsCapability.Operate, true, { owns(items) }) {
            importSkills(items)
        }

    override suspend fun installMarketplaceSkill(lease: SettingsIntegrationsLease, request: MarketplaceInstallRequest) =
        invoke(lease, SettingsIntegrationsCapability.Operate, true, { owns(request.owner) }) {
            installMarketplaceSkill(request)
        }

    override suspend fun discoverExternalMcpServers(lease: SettingsIntegrationsLease, request: McpDiscoveryRequest) =
        invoke(lease, SettingsIntegrationsCapability.Read, false, { owns(request.owner) }) {
            discoverExternalMcpServers(request)
        }

    override suspend fun probeMcpServer(lease: SettingsIntegrationsLease, owner: SkillOwner, server: McpServer) =
        invoke(lease, SettingsIntegrationsCapability.Operate, true, { owns(owner) }) {
            probeMcpServer(owner, server)
        }

    override suspend fun getMcpOauthStatus(lease: SettingsIntegrationsLease, owner: SkillOwner) =
        invoke(lease, SettingsIntegrationsCapability.Read, false, { owns(owner) }) {
            getMcpOauthStatus(owner)
        }

    override suspend fun beginMcpServerOauth(lease: SettingsIntegrationsLease, owner: SkillOwner, server: McpServer) =
        invoke(lease, SettingsIntegrationsCapability.Operate, true, { owns(owner) }) {
            beginMcpServerOauth(owner, server)
        }

    override suspend fun waitMcpServerOauth(lease: SettingsIntegrationsLease, owner: SkillOwner, flowId: String) =
        invoke(lease, SettingsIntegrationsCapability.Operate, true, { owns(owner) }) {
            waitMcpServerOauth(owner, flowId)
        }

    override suspend fun clearMcpServerOauth(lease: SettingsIntegrationsLease, owner: SkillOwner, url: String) =
        invoke(lease, SettingsIntegrationsCapability.Operate, true, { owns(owner) }) {
            clearMcpServerOauth(owner, url)
        }

    private suspend fun <T> invoke(
        lease: SettingsIntegrationsLease,
        capability: SettingsIntegrationsCapability,
        mutation: Boolean,
        owns: SettingsIntegrationsLease.() -> Boolean,
        operation: suspend SettingsIntegrationsRemoteGateway.() -> T,
    ): T {
        requireCurrent(lease, capability, owns)
        val remote = try { provider.gatewayFor(lease) } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            throw SettingsIntegrationsGatewayException(0, "network", false)
        } ?: throw SettingsIntegrationsGatewayException(409, "stale_lease", false)
        requireCurrent(lease, capability, owns)
        val result = try { remote.operation() } catch (error: CancellationException) {
            throw error
        } catch (error: RemoteClientException) {
            throw error.sanitized(mutation)
        } catch (error: SettingsIntegrationsGatewayException) {
            throw error
        } catch (_: Exception) {
            throw SettingsIntegrationsGatewayException(0, "network", mutation)
        }
        requireCurrent(lease, capability, owns)
        return result
    }

    private fun requireCurrent(
        lease: SettingsIntegrationsLease,
        capability: SettingsIntegrationsCapability,
        owns: SettingsIntegrationsLease.() -> Boolean,
    ) {
        val current = session.value
        if (current == null || current.key != lease.key) fail(409, "stale_lease")
        if (current.protocolVersion != 3 || lease.protocolVersion != 3) fail(409, "protocol_version_mismatch")
        if (!current.ready) fail(409, "session_not_ready")
        if (!current.online) fail(0, "offline")
        if (capability.scope !in current.scopes) fail(403, "missing_scope")
        if (!current.owns()) fail(409, "stale_owner")
    }

    private fun fail(status: Int, code: String): Nothing =
        throw SettingsIntegrationsGatewayException(status, code, false)
}

internal fun Throwable.asSettingsIntegrationsFailure(
    capability: SettingsIntegrationsCapability,
    mutation: Boolean,
): SettingsIntegrationsFailure {
    val gateway = this as? SettingsIntegrationsGatewayException
    return when {
        gateway?.code == "stale_owner" -> SettingsIntegrationsFailure.StaleOwner
        gateway?.statusCode == 401 -> SettingsIntegrationsFailure.AuthenticationRequired
        gateway?.statusCode == 403 -> SettingsIntegrationsFailure.PermissionDenied(capability.scope)
        else -> SettingsIntegrationsFailure.Remote(
            gateway?.code ?: "request_failed",
            gateway?.requestMayHaveCommitted ?: mutation,
        )
    }
}

private fun RemoteClientException.sanitized(mutation: Boolean) =
    SettingsIntegrationsGatewayException(
        status,
        code.takeIf(SAFE_CODES::contains) ?: "remote_error",
        RemoteMutationClassification.requestMayHaveCommitted(this, mutation),
    )

private val SAFE_CODES = setOf(
    "invalid_token", "unauthorized", "forbidden", "missing_scope", "network", "timeout",
    "invalid_response", "response_too_large", "request_failed", "not_found", "conflict",
)
