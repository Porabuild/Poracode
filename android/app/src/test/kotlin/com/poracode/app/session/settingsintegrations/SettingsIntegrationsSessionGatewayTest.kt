package com.poracode.app.session.settingsintegrations

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.protocol.settingsintegrations.*
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsIntegrationsSessionGatewayTest {
    private val owner = SkillOwner("p1", PosixProjectLocation("/repo", "host-1"), 4)
    private val mcp = McpServer("mcp", "mcp", transport = McpTransport.Http("https://mcp.test"))

    @Test
    fun exactScopesAndAllTwelveGatewayCalls() = runBlocking {
        val remote = FakeSettingsIntegrationsRemote()
        val state = MutableStateFlow(lease(setOf("session:read", "session:operate")))
        val gateway = GeneratedSettingsIntegrationsSessionGateway(state) { remote }
        gateway.scanSkills(state.value!!, SkillScanRequest(owner))
        gateway.listSkillMarketplace(state.value!!, MarketplaceRequest(SkillMarketplace.SkillsSh))
        gateway.setSkillEnabled(state.value!!, owner, "/skill", true)
        gateway.deleteSkill(state.value!!, owner, "/skill")
        gateway.importSkills(state.value!!, listOf(importItem()))
        gateway.installMarketplaceSkill(state.value!!, install())
        gateway.discoverExternalMcpServers(state.value!!, McpDiscoveryRequest(McpDiscoveryScope.Workspace, owner))
        gateway.probeMcpServer(state.value!!, owner, mcp)
        gateway.getMcpOauthStatus(state.value!!, owner)
        gateway.beginMcpServerOauth(state.value!!, owner, mcp)
        gateway.waitMcpServerOauth(state.value!!, owner, "flow")
        gateway.clearMcpServerOauth(state.value!!, owner, "https://mcp.test")
        assertEquals(12, remote.calls.size)

        state.value = lease(setOf("session:read"))
        gateway.scanSkills(state.value!!, SkillScanRequest(owner))
        gateway.listSkillMarketplace(state.value!!, MarketplaceRequest(SkillMarketplace.SkillsSh))
        gateway.discoverExternalMcpServers(state.value!!, McpDiscoveryRequest(McpDiscoveryScope.Workspace, owner))
        gateway.getMcpOauthStatus(state.value!!, owner)
        val denied = runCatching { gateway.deleteSkill(state.value!!, owner, "/skill") }.exceptionOrNull()
        assertEquals("missing_scope", (denied as SettingsIntegrationsGatewayException).code)
        assertEquals(16, remote.calls.size)
    }

    @Test
    fun staleHostAndProjectAreRejectedBeforeAndAfterRemoteCall() = runBlocking {
        val remote = FakeSettingsIntegrationsRemote()
        val state = MutableStateFlow(lease())
        val gateway = GeneratedSettingsIntegrationsSessionGateway(state) { remote }
        val staleOwner = owner.copy(projectGeneration = 3)
        assertEquals(
            "stale_owner",
            (runCatching { gateway.deleteSkill(state.value!!, staleOwner, "/skill") }.exceptionOrNull()
                as SettingsIntegrationsGatewayException).code,
        )
        assertTrue(remote.calls.isEmpty())

        val blocker = CompletableDeferred<Unit>()
        remote.blocker = blocker
        val original = state.value!!
        val result = async { runCatching { gateway.scanSkills(original, SkillScanRequest(owner)) } }
        while (remote.calls.isEmpty()) kotlinx.coroutines.yield()
        state.value = original.copy(sessionGeneration = 2)
        blocker.complete(Unit)
        assertEquals(
            "stale_lease",
            (result.await().exceptionOrNull() as SettingsIntegrationsGatewayException).code,
        )
    }

    @Test
    fun cancellationPropagatesWithoutSanitizingOrSecondAttempt() = runBlocking {
        val remote = FakeSettingsIntegrationsRemote().apply { blocker = CompletableDeferred() }
        val state = MutableStateFlow(lease())
        val gateway = GeneratedSettingsIntegrationsSessionGateway(state) { remote }
        val job = launch { gateway.waitMcpServerOauth(state.value!!, owner, "flow") }
        while (remote.calls.isEmpty()) kotlinx.coroutines.yield()
        job.cancelAndJoin()
        assertTrue(job.isCancelled)
        assertEquals(listOf("waitMcpServerOauth"), remote.calls)
    }

    private fun lease(scopes: Set<String> = setOf("session:read", "session:operate")) =
        SettingsIntegrationsLease(ClientConnectionId("00000000-0000-4000-8000-000000000001"), 1, 4, 3, scopes, true, true, owner)
    private fun importItem() = SkillImportItem("/source", SkillImportMode.Copy, SkillScope.Project, owner)
    private fun install() = MarketplaceInstallRequest(owner, SkillMarketplace.SkillsSh, "demo", SkillScope.Project)
}
