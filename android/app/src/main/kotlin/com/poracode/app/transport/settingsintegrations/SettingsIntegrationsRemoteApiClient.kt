package com.poracode.app.transport.settingsintegrations

import com.poracode.app.protocol.settingsintegrations.GeneratedRemoteV3SettingsIntegrationsContract
import com.poracode.app.protocol.settingsintegrations.MarketplaceInstallRequest
import com.poracode.app.protocol.settingsintegrations.MarketplaceRequest
import com.poracode.app.protocol.settingsintegrations.McpDiscoveryRequest
import com.poracode.app.protocol.settingsintegrations.McpServer
import com.poracode.app.protocol.settingsintegrations.SettingsIntegrationProcedure
import com.poracode.app.protocol.settingsintegrations.SettingsIntegrationsWire
import com.poracode.app.protocol.settingsintegrations.SkillImportItem
import com.poracode.app.protocol.settingsintegrations.SkillOwner
import com.poracode.app.protocol.settingsintegrations.SkillScanRequest
import com.poracode.app.transport.ForegroundNetworkGate
import com.poracode.app.transport.RemoteApiClient
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.JsonObject
import okhttp3.OkHttpClient

/** One HTTP attempt per call; requests and results cross committed generated roots. */
class SettingsIntegrationsRemoteApiClient private constructor(
    private val http: RemoteApiClient,
    private val oauthWaitTimeoutMs: Long,
) : SettingsIntegrationsRemoteGateway {
    constructor(
        endpoint: String,
        accessToken: String,
        client: OkHttpClient = RemoteApiClient.defaultClient(),
        networkGate: ForegroundNetworkGate = ForegroundNetworkGate.shared,
        oauthWaitTimeoutMs: Long = 120_000,
    ) : this(
        RemoteApiClient(
            endpoint,
            accessToken,
            client.newBuilder().retryOnConnectionFailure(false).build(),
            networkGate = networkGate,
        ),
        oauthWaitTimeoutMs.coerceIn(1_000, 300_000),
    )

    override suspend fun scanSkills(request: SkillScanRequest) = json(
        SettingsIntegrationProcedure.ScanSkills,
        SettingsIntegrationsWire.scan(request),
        SettingsIntegrationsWire::skillScan,
    )

    override suspend fun listSkillMarketplace(request: MarketplaceRequest) = json(
        SettingsIntegrationProcedure.ListSkillMarketplace,
        SettingsIntegrationsWire.marketplace(request),
        SettingsIntegrationsWire::marketplace,
    )

    override suspend fun setSkillEnabled(owner: SkillOwner, absolutePath: String, enabled: Boolean) =
        unit(
            SettingsIntegrationProcedure.SetSkillEnabled,
            SettingsIntegrationsWire.skillMutation(owner, absolutePath, enabled),
        )

    override suspend fun deleteSkill(owner: SkillOwner, absolutePath: String) = unit(
        SettingsIntegrationProcedure.DeleteSkill,
        SettingsIntegrationsWire.skillMutation(owner, absolutePath),
    )

    override suspend fun importSkills(items: List<SkillImportItem>) = json(
        SettingsIntegrationProcedure.ImportSkills,
        SettingsIntegrationsWire.importSkills(items),
        SettingsIntegrationsWire::imported,
    )

    override suspend fun installMarketplaceSkill(request: MarketplaceInstallRequest) = json(
        SettingsIntegrationProcedure.InstallMarketplaceSkill,
        SettingsIntegrationsWire.install(request),
        SettingsIntegrationsWire::installed,
    )

    override suspend fun discoverExternalMcpServers(request: McpDiscoveryRequest) = json(
        SettingsIntegrationProcedure.DiscoverExternalMcpServers,
        SettingsIntegrationsWire.discovery(request),
        SettingsIntegrationsWire::discovery,
    )

    override suspend fun probeMcpServer(owner: SkillOwner, server: McpServer) = json(
        SettingsIntegrationProcedure.ProbeMcpServer,
        SettingsIntegrationsWire.server(owner, server),
        SettingsIntegrationsWire::probe,
    )

    override suspend fun getMcpOauthStatus(owner: SkillOwner) = json(
        SettingsIntegrationProcedure.GetMcpOauthStatus,
        SettingsIntegrationsWire.oauthOwner(owner),
        SettingsIntegrationsWire::oauthStatus,
    )

    override suspend fun beginMcpServerOauth(owner: SkillOwner, server: McpServer) = json(
        SettingsIntegrationProcedure.BeginMcpServerOauth,
        SettingsIntegrationsWire.server(owner, server),
        SettingsIntegrationsWire::oauth,
    )

    override suspend fun waitMcpServerOauth(owner: SkillOwner, flowId: String) = withTimeout(
        oauthWaitTimeoutMs,
    ) {
        json(
            SettingsIntegrationProcedure.WaitMcpServerOauth,
            SettingsIntegrationsWire.oauthWait(owner, flowId),
            SettingsIntegrationsWire::oauth,
        )
    }

    override suspend fun clearMcpServerOauth(owner: SkillOwner, url: String) = unit(
        SettingsIntegrationProcedure.ClearMcpServerOauth,
        SettingsIntegrationsWire.oauthClear(owner, url),
    )

    private suspend fun <T> json(
        procedure: SettingsIntegrationProcedure,
        payload: JsonObject,
        adapt: (JsonObject) -> T,
    ): T {
        val response = call(procedure, payload)
        return adapt(GeneratedRemoteV3SettingsIntegrationsContract.result(procedure, response))
    }

    private suspend fun unit(procedure: SettingsIntegrationProcedure, payload: JsonObject) {
        GeneratedRemoteV3SettingsIntegrationsContract.omittedResult(procedure, call(procedure, payload))
    }

    private suspend fun call(procedure: SettingsIntegrationProcedure, payload: JsonObject): String =
        http.requestText(
            path = PROCEDURE_PATH,
            method = "POST",
            jsonBody = GeneratedRemoteV3SettingsIntegrationsContract.request(procedure, payload),
        )

    companion object { const val PROCEDURE_PATH = "/api/git/call" }
}
