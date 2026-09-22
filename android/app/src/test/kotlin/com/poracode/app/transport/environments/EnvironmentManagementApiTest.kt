package com.poracode.app.transport.environments

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.EnvironmentAuthority
import com.poracode.app.model.RemoteEnvironmentCreateRequest
import com.poracode.app.model.RemoteEnvironmentUpdatePatch
import com.poracode.app.model.RemoteJson
import com.poracode.app.model.RemoteWebSocketTicketResult
import com.poracode.app.transport.RemoteApiClient
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * All thirteen management operations dispatch on the bound host's client with
 * generated-codec validation and no client-side authority guard (R4): a direct
 * client manages its host, and an environment client manages the child registry
 * through the one-hop parent proxy under the child grant.
 */
class EnvironmentManagementApiTest {
    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private val environmentId = "11111111-1111-4111-8111-111111111111"

    private fun directClient(): RemoteApiClient = RemoteApiClient(
        endpoint = server.url("/").toString().trimEnd('/'),
        accessToken = "parent-token",
        client = OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).build(),
    )

    private fun environmentClient(): RemoteApiClient {
        val proxy = server.url(EnvironmentProtocol.proxyPrefix(environmentId))
            .toString()
            .trimEnd('/')
        val authority = object : EnvironmentAuthority {
            override val environmentId: String = this@EnvironmentManagementApiTest.environmentId
            override val childDesktopId: String? = "child-desktop"
            override val environmentParentConnectionId: ClientConnectionId =
                ClientConnectionId("00000000-0000-0000-0000-000000000001")
            override suspend fun parentAccessToken(): String? = "parent-token"
            override suspend fun mintWebSocketTicket(): RemoteWebSocketTicketResult =
                RemoteWebSocketTicketResult("parent-ticket", "2099-01-01T00:00:00.000Z")
        }
        return RemoteApiClient(
            endpoint = proxy,
            accessToken = "child-token",
            client = OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).build(),
            explicitEnvironmentAuthority = authority,
        )
    }

    @Test
    fun everyManagementOperationUsesItsRouteOnTheBoundHost() = runBlocking {
        val client = directClient()
        val prefix = "/api/environments/$environmentId"

        server.enqueue(ok(environmentListJson()))
        val list = client.listEnvironments()
        assertEquals(listOf(environmentId), list.map { it.environmentId })
        assertRoute(server.takeRequest(), "/api/environments", "GET", hasBody = false)

        server.enqueue(ok(environmentResultJson()))
        assertEquals(environmentId, client.getEnvironment(environmentId).environmentId)
        assertRoute(server.takeRequest(), prefix, "GET", hasBody = false)

        server.enqueue(ok(environmentResultJson()))
        client.createEnvironment(RemoteEnvironmentCreateRequest(label = "Box", target = "user@host"))
        val create = server.takeRequest()
        assertRoute(create, "/api/environments", "POST", hasBody = true)
        val createBody = RemoteJson.parseToJsonElement(create.body.readUtf8()).jsonObject
        assertEquals("Box", createBody["label"]?.jsonPrimitive?.content)

        server.enqueue(ok(environmentResultJson()))
        client.updateEnvironment(
            environmentId,
            expectedRevision = 3,
            patch = RemoteEnvironmentUpdatePatch(label = "Renamed"),
        )
        val update = server.takeRequest()
        assertRoute(update, prefix, "POST", hasBody = true)
        val updateBody = RemoteJson.parseToJsonElement(update.body.readUtf8()).jsonObject
        assertEquals("3", updateBody["expectedRevision"]?.jsonPrimitive?.content)

        server.enqueue(ok("""{"ok":true}"""))
        client.deleteEnvironment(environmentId, expectedRevision = 4)
        val delete = server.takeRequest()
        assertRoute(delete, "$prefix/delete", "POST", hasBody = true)
        assertEquals(
            "4",
            RemoteJson.parseToJsonElement(delete.body.readUtf8())
                .jsonObject["expectedRevision"]?.jsonPrimitive?.content,
        )

        server.enqueue(ok(environmentResultJson(state = "connected")))
        assertTrue(client.connectEnvironment(environmentId).connected)
        assertRoute(server.takeRequest(), "$prefix/connect", "POST", hasBody = true)

        server.enqueue(ok(environmentResultJson(state = "disconnected")))
        assertTrue(!client.disconnectEnvironment(environmentId).connected)
        assertRoute(server.takeRequest(), "$prefix/disconnect", "POST", hasBody = true)

        server.enqueue(ok(pairingJson()))
        val pairing = client.pairEnvironment(environmentId)
        assertEquals("child-desktop", pairing.childDesktopId)
        assertEquals(EnvironmentProtocol.proxyPrefix(environmentId), pairing.endpoint)
        assertRoute(server.takeRequest(), "$prefix/pairing", "POST", hasBody = true)

        server.enqueue(ok(environmentResultJson()))
        client.upgradeEnvironment(environmentId, expectedRevision = 5)
        val upgrade = server.takeRequest()
        assertRoute(upgrade, "$prefix/upgrade", "POST", hasBody = true)
        assertEquals(
            "5",
            RemoteJson.parseToJsonElement(upgrade.body.readUtf8())
                .jsonObject["expectedRevision"]?.jsonPrimitive?.content,
        )

        server.enqueue(ok("""{"ticket":"parent-ticket","expiresAt":"2099-01-01T00:00:00.000Z"}"""))
        assertEquals("parent-ticket", client.environmentWebSocketTicket(environmentId).ticket)
        assertRoute(server.takeRequest(), "$prefix/websocket-ticket", "POST", hasBody = true)

        server.enqueue(ok("""{"fingerprint":"SHA256:${"A".repeat(43)}","keyType":"ssh-ed25519"}"""))
        assertEquals(
            "ssh-ed25519",
            client.probeEnvironmentTrust(environmentId).keyType,
        )
        assertRoute(server.takeRequest(), "$prefix/trust-probe", "POST", hasBody = true)

        server.enqueue(ok(environmentResultJson()))
        client.acceptEnvironmentTrust(
            environmentId,
            expectedRevision = 6,
            fingerprint = "SHA256:${"A".repeat(43)}",
        )
        val accept = server.takeRequest()
        assertRoute(accept, "$prefix/trust-accept", "POST", hasBody = true)
        assertEquals(
            "6",
            RemoteJson.parseToJsonElement(accept.body.readUtf8())
                .jsonObject["expectedRevision"]?.jsonPrimitive?.content,
        )

        val legacyId = "22222222-2222-4222-8222-222222222222"
        server.enqueue(ok(environmentResultJson()))
        client.adoptLegacyEnvironment(environmentId, expectedRevision = 7, legacyConnectionId = legacyId)
        val adopt = server.takeRequest()
        assertRoute(adopt, "$prefix/adopt-legacy", "POST", hasBody = true)
        val adoptBody = RemoteJson.parseToJsonElement(adopt.body.readUtf8()).jsonObject
        assertEquals(legacyId, adoptBody["legacyConnectionId"]?.jsonPrimitive?.content)
    }

    @Test
    fun environmentClientManagesTheChildRegistryThroughOneProxyHopWithBothAuthorities() = runBlocking {
        val client = environmentClient()
        val childPrefix = "/api/environments/$environmentId/proxy"

        server.enqueue(ok(environmentListJson(label = "Child box")))
        val list = client.listEnvironments()
        assertEquals("Child box", list.single().label)

        server.enqueue(ok(environmentResultJson(label = "Child box")))
        client.createEnvironment(RemoteEnvironmentCreateRequest(label = "Child box", target = "h"))

        repeat(2) {
            val recorded = server.takeRequest()
            assertTrue(recorded.path.orEmpty().startsWith(childPrefix))
            assertEquals("Bearer child-token", recorded.getHeader("Authorization"))
            assertEquals(
                "Bearer parent-token",
                recorded.getHeader(EnvironmentProtocol.AUTHORIZATION_HEADER),
            )
        }
    }

    private fun assertRoute(
        request: okhttp3.mockwebserver.RecordedRequest,
        path: String,
        method: String,
        hasBody: Boolean,
    ) {
        assertEquals(path, request.path)
        assertEquals(method, request.method)
        assertEquals("Bearer parent-token", request.getHeader("Authorization"))
        assertNull(request.getHeader(EnvironmentProtocol.AUTHORIZATION_HEADER))
        if (!hasBody) {
            assertTrue(request.body.size == 0L)
        }
    }

    private fun ok(body: String): MockResponse = MockResponse()
        .setResponseCode(200)
        .setHeader("Content-Type", "application/json")
        .setBody(body)

    private fun environmentListJson(label: String = "Box"): String =
        """{"environments":[${environmentJson(label)}]}"""

    private fun environmentResultJson(
        label: String = "Box",
        state: String = "disconnected",
    ): String = """{"environment":${environmentJson(label, state)}}"""

    private fun environmentJson(label: String = "Box", state: String = "disconnected"): String = """
        {
          "environmentId":"$environmentId",
          "revision":3,
          "label":"$label",
          "target":"user@host",
          "port":2222,
          "trust":{"state":"unknown"},
          "runtime":{"hash":"${"a".repeat(64)}"},
          "credential":"none",
          "legacyConnectionIds":[],
          "desired":"enabled",
          "state":"$state",
          "createdAt":1,
          "updatedAt":2
        }
    """.trimIndent()

    private fun pairingJson(): String = """
        {
          "pairing":{
            "environmentId":"$environmentId",
            "endpoint":"${EnvironmentProtocol.proxyPrefix(environmentId)}",
            "pairingCredential":"one-time",
            "childDesktopId":"child-desktop"
          }
        }
    """.trimIndent()
}
