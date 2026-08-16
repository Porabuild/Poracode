package com.poracode.app.transport.settingsintegrations

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
import com.poracode.app.session.settingsintegrations.SettingsIntegrationsLease

interface SettingsIntegrationsRemoteGateway {
    suspend fun scanSkills(request: SkillScanRequest): SkillScanResult
    suspend fun listSkillMarketplace(request: MarketplaceRequest): MarketplaceResult
    suspend fun setSkillEnabled(owner: SkillOwner, absolutePath: String, enabled: Boolean)
    suspend fun deleteSkill(owner: SkillOwner, absolutePath: String)
    suspend fun importSkills(items: List<SkillImportItem>): List<String>
    suspend fun installMarketplaceSkill(request: MarketplaceInstallRequest): String
    suspend fun discoverExternalMcpServers(request: McpDiscoveryRequest): List<ExternalMcpGroup>
    suspend fun probeMcpServer(owner: SkillOwner, server: McpServer): McpProbeResult
    suspend fun getMcpOauthStatus(owner: SkillOwner): McpOauthStatus
    suspend fun beginMcpServerOauth(owner: SkillOwner, server: McpServer): McpOauthResult
    suspend fun waitMcpServerOauth(owner: SkillOwner, flowId: String): McpOauthResult
    suspend fun clearMcpServerOauth(owner: SkillOwner, url: String)
}

fun interface SettingsIntegrationsRemoteGatewayProvider {
    suspend fun gatewayFor(lease: SettingsIntegrationsLease): SettingsIntegrationsRemoteGateway?
}

fun interface SettingsIntegrationsRemoteGatewayFactory {
    fun create(endpoint: String, accessToken: String): SettingsIntegrationsRemoteGateway
}
