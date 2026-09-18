package com.poracode.app.transport.settingsintegrations

import com.poracode.app.model.WslProjectLocation
import com.poracode.app.protocol.settingsintegrations.MarketplaceInstallRequest
import com.poracode.app.protocol.settingsintegrations.MarketplaceRequest
import com.poracode.app.protocol.settingsintegrations.McpDiscoveryRequest
import com.poracode.app.protocol.settingsintegrations.McpDiscoveryScope
import com.poracode.app.protocol.settingsintegrations.McpServer
import com.poracode.app.protocol.settingsintegrations.McpTransport
import com.poracode.app.protocol.settingsintegrations.SecretValues
import com.poracode.app.protocol.settingsintegrations.SkillImportItem
import com.poracode.app.protocol.settingsintegrations.SkillImportMode
import com.poracode.app.protocol.settingsintegrations.SkillMarketplace
import com.poracode.app.protocol.settingsintegrations.SkillOwner
import com.poracode.app.protocol.settingsintegrations.SkillScanRequest
import com.poracode.app.protocol.settingsintegrations.SkillScope
import com.poracode.app.transport.ForegroundNetworkGate
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsIntegrationsRemoteApiClientTest {
    private val owner = SkillOwner(
        "project-1",
        WslProjectLocation("Ubuntu", "/home/dev/repo", "\\\\wsl$\\Ubuntu\\home\\dev\\repo", "host-1"),
        7,
    )
    private val serverModel = McpServer(
        "demo",
        "demo",
        transport = McpTransport.Http(
            "https://mcp.example.test",
            SecretValues.of(mapOf("Authorization" to "Bearer raw-secret")),
        ),
    )

    @Test
    fun httpPresentationLabelNeverExposesUserInfoPathOrQuery() {
        val transport = McpTransport.Http(
            "https://user:password@mcp.example.test/private/token?access=secret",
        )

        assertEquals("https://mcp.example.test", transport.safeLabel)
        assertFalse(transport.safeLabel.contains("password"))
        assertFalse(transport.safeLabel.contains("private"))
        assertFalse(transport.safeLabel.contains("secret"))
    }

    @Test
    fun allTwelveCallsUseExactGeneratedEnvelopesAndProjectProjection() = runBlocking {
        val server = MockWebServer()
        server.start()
        try {
            SettingsIntegrationsProcedureFixtures.resultByProcedure.forEach { (_, result) ->
                server.enqueue(MockResponse().setBody(result?.let { "{\"result\":$it}" } ?: "{}"))
            }
            val client = client(server)
            client.scanSkills(SkillScanRequest(owner))
            client.listSkillMarketplace(MarketplaceRequest(SkillMarketplace.SkillsSh))
            client.setSkillEnabled(owner, "/skill/demo", false)
            client.deleteSkill(owner, "/skill/demo")
            client.importSkills(
                listOf(
                    SkillImportItem(
                        "/external/demo",
                        SkillImportMode.Copy,
                        SkillScope.Project,
                        owner,
                        sourceOwner = owner,
                    ),
                ),
            )
            client.installMarketplaceSkill(
                MarketplaceInstallRequest(owner, SkillMarketplace.SkillsSh, "demo", SkillScope.Project),
            )
            client.discoverExternalMcpServers(McpDiscoveryRequest(McpDiscoveryScope.Workspace, owner))
            val probe = client.probeMcpServer(owner, serverModel)
            val status = client.getMcpOauthStatus(owner)
            client.beginMcpServerOauth(owner, serverModel)
            client.waitMcpServerOauth(owner, "flow-secret")
            client.clearMcpServerOauth(owner, "https://mcp.example.test")

            assertEquals("wsl", probe.runtime)
            assertEquals(2, probe.toolCount)
            assertEquals(1, status.authenticatedUrls.size)
            assertFalse(status.toString().contains("example.test"))
            assertFalse(serverModel.toString().contains("raw-secret"))

            val procedures = mutableListOf<String>()
            repeat(12) {
                val request = server.takeRequest()
                assertEquals("/base/api/git/call", request.requestUrl!!.encodedPath)
                assertEquals("Bearer access-secret", request.getHeader("Authorization"))
                val body = Json.parseToJsonElement(request.body.readUtf8()).jsonObject
                procedures += body.getValue("procedure").jsonPrimitive.content
                val payload = body.getValue("payload").jsonObject
                if ("projectLocation" in payload) assertWsl(payload.getValue("projectLocation").jsonObject)
                if (procedures.last() == "importSkills") {
                    val item = payload.getValue("skills").toString()
                    assertTrue(item.contains("linuxPath"))
                    assertTrue(item.contains("uncPath"))
                    assertTrue(item.contains("sourceProjectLocation"))
                }
            }
            assertEquals(SettingsIntegrationsProcedureFixtures.resultByProcedure.keys.toList(), procedures)
        } finally { server.shutdown() }
    }

    @Test
    fun mutationDisconnectIsOneAttemptAndOauthWaitCancellationCancelsCall() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST))
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE))
        server.start()
        try {
            assertTrue(runCatching { client(server).deleteSkill(owner, "/skill/demo") }.isFailure)
            assertEquals(1, server.requestCount)
            val wait = launch { client(server).waitMcpServerOauth(owner, "flow-secret") }
            while (server.requestCount < 2) kotlinx.coroutines.yield()
            wait.cancelAndJoin()
            assertTrue(wait.isCancelled)
            assertEquals(2, server.requestCount)
        } finally { server.shutdown() }
    }

    private fun assertWsl(value: JsonObject) {
        assertEquals("wsl", value.getValue("kind").jsonPrimitive.content)
        assertEquals("Ubuntu", value.getValue("distro").jsonPrimitive.content)
        assertEquals("/home/dev/repo", value.getValue("linuxPath").jsonPrimitive.content)
        assertEquals("\\\\wsl$\\Ubuntu\\home\\dev\\repo", value.getValue("uncPath").jsonPrimitive.content)
    }

    private fun client(server: MockWebServer) = SettingsIntegrationsRemoteApiClient(
        server.url("/base").toString(),
        "access-secret",
        OkHttpClient(),
        ForegroundNetworkGate(),
        5_000,
    )
}
