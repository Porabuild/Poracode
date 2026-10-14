package com.poracode.app.session.settingsintegrations

import com.poracode.app.protocol.settingsintegrations.*
import com.poracode.app.transport.settingsintegrations.SettingsIntegrationsRemoteGateway
import kotlinx.coroutines.CompletableDeferred

internal class FakeSettingsIntegrationsRemote : SettingsIntegrationsRemoteGateway {
    val calls = mutableListOf<String>()
    var failure: Throwable? = null
    val failures = mutableMapOf<String, Throwable>()
    var scan = SkillScanResult(emptyList(), emptySet(), null, emptyList(), false)
    var beginResult: McpOauthResult = McpOauthResult.Authorized
    var waitResult: McpOauthResult = McpOauthResult.Authorized
    var waitOperation: (suspend () -> McpOauthResult)? = null
    var waitBlocker: CompletableDeferred<Unit>? = null
    var blocker: CompletableDeferred<Unit>? = null

    private suspend fun called(name: String) {
        calls += name
        blocker?.await()
        failures[name]?.let { throw it }
        failure?.let { throw it }
    }

    override suspend fun scanSkills(request: SkillScanRequest) = scan.also { called("scanSkills") }
    override suspend fun listSkillMarketplace(request: MarketplaceRequest) =
        MarketplaceResult(request.marketplace, emptyList(), 0).also { called("listSkillMarketplace") }
    override suspend fun setSkillEnabled(owner: SkillOwner, absolutePath: String, enabled: Boolean) = called("setSkillEnabled")
    override suspend fun deleteSkill(owner: SkillOwner, absolutePath: String) = called("deleteSkill")
    override suspend fun importSkills(items: List<SkillImportItem>) = listOf("imported").also { called("importSkills") }
    override suspend fun installMarketplaceSkill(request: MarketplaceInstallRequest) = "installed".also { called("installMarketplaceSkill") }
    override suspend fun discoverExternalMcpServers(request: McpDiscoveryRequest) = emptyList<ExternalMcpGroup>().also { called("discoverExternalMcpServers") }
    override suspend fun probeMcpServer(owner: SkillOwner, server: McpServer) =
        McpProbeResult("available", 1, "host", false, 0, emptyList(), null, null).also { called("probeMcpServer") }
    override suspend fun getMcpOauthStatus(owner: SkillOwner) = McpOauthStatus(emptySet()).also { called("getMcpOauthStatus") }
    override suspend fun beginMcpServerOauth(owner: SkillOwner, server: McpServer) = beginResult.also { called("beginMcpServerOauth") }
    override suspend fun waitMcpServerOauth(owner: SkillOwner, flowId: String): McpOauthResult {
        called("waitMcpServerOauth")
        waitBlocker?.await()
        return waitOperation?.invoke() ?: waitResult
    }
    override suspend fun clearMcpServerOauth(owner: SkillOwner, url: String) = called("clearMcpServerOauth")
}
