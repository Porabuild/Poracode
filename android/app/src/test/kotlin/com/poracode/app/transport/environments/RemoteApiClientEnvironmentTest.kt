package com.poracode.app.transport.environments

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.EnvironmentAuthority
import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteWebSocketTicketResult
import com.poracode.app.transport.RemoteApiClient
import com.poracode.app.transport.TlsCertPinStore
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Two-authority HTTP behavior of an environment-bound client: the child bearer
 * stays in `Authorization`, the parent token travels only in the reserved
 * header (including unmatched/authorized=false dispatches), a missing parent
 * token fails closed before any dial, and 401/403 attribution trusts only the
 * parent-origin marker (R1).
 */
class RemoteApiClientEnvironmentTest {
    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        TlsCertPinStore.resetForTests()
    }

    @After
    fun tearDown() {
        TlsCertPinStore.resetForTests()
        server.shutdown()
    }

    private val environmentId = "11111111-1111-4111-8111-111111111111"

    private fun proxyEndpoint(): String = EnvironmentProtocol.proxyPrefix(environmentId).let {
        server.url(it).toString().trimEnd('/')
    }

    private fun client(
        authority: EnvironmentAuthority? = null,
        childToken: String? = "child-token",
    ): RemoteApiClient = RemoteApiClient(
        endpoint = proxyEndpoint(),
        accessToken = childToken,
        client = OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).build(),
        explicitEnvironmentAuthority = authority,
    )

    @Test
    fun ordinaryRawAndBinaryRequestsCarryBothAuthoritiesThroughTheProxyPrefix() = runBlocking {
        server.enqueue(json("""{"ok":true}"""))
        server.enqueue(json("""{"ok":true}"""))
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "image/png")
                .setBody("bytes"),
        )
        val client = client(authority("parent-token"))

        client.requestText("/api/snapshot")
        client.requestRawText(
            path = "/api/upload",
            method = "POST",
            body = "raw".toRequestBody(),
        )
        client.requestBytes("/api/attachments/one")

        val expectedPrefix = "/api/environments/$environmentId/proxy"
        repeat(3) {
            val recorded = server.takeRequest()
            assertTrue(recorded.path.orEmpty().startsWith(expectedPrefix))
            assertEquals("Bearer child-token", recorded.getHeader("Authorization"))
            assertEquals(
                "Bearer parent-token",
                recorded.getHeader(EnvironmentProtocol.AUTHORIZATION_HEADER),
            )
        }
    }

    @Test
    fun unauthenticatedChildExchangeStillCarriesTheParentAuthority() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(400)
                .setHeader("Content-Type", "application/json")
                .setBody("""{"error":{"code":"invalid_input","message":"fixture"}}"""),
        )
        val client = client(authority("parent-token"), childToken = null)
        runCatching { client.exchangePairingCredential("one-time-credential", emptyList()) }
        val recorded = server.takeRequest()
        assertEquals(
            "Bearer parent-token",
            recorded.getHeader(EnvironmentProtocol.AUTHORIZATION_HEADER),
        )
        assertNull(recorded.getHeader("Authorization"))
    }

    @Test
    fun directClientWithoutAuthoritySendsNoParentHeader() = runBlocking {
        server.enqueue(json("""{"ok":true}"""))
        val direct = RemoteApiClient(
            endpoint = server.url("/").toString().trimEnd('/'),
            accessToken = "child-token",
        )
        direct.requestText("/api/snapshot")
        val recorded = server.takeRequest()
        assertNull(recorded.getHeader(EnvironmentProtocol.AUTHORIZATION_HEADER))
        assertEquals("Bearer child-token", recorded.getHeader("Authorization"))
    }

    @Test
    fun proxyEndpointWithoutRegisteredAuthorityFailsClosedWithoutADial() = runBlocking {
        // A proxy-shaped endpoint with no live authority must never fall back to
        // a bare child bearer against the parent proxy (residual 2): the fetch
        // fails before any dial and stays typed as parent repair.
        val client = client(authority = null)
        try {
            client.requestText("/api/snapshot")
            throw AssertionError("Expected parent repair failure")
        } catch (error: RemoteClientException) {
            assertEquals(RemoteClientException.ENVIRONMENT_PARENT_NEEDS_REPAIR, error.code)
        }
        assertEquals(0, server.requestCount)
    }

    @Test
    fun conflictedEndpointAuthorityFailsClosedWithTheTypedConflict() = runBlocking {
        val endpoint = proxyEndpoint()
        EnvironmentAuthorityStore.resetForTests()
        EnvironmentAuthorityStore.register(endpoint, authority("first-parent"))
        EnvironmentAuthorityStore.register(
            endpoint,
            object : EnvironmentAuthority {
                override val environmentId: String =
                    this@RemoteApiClientEnvironmentTest.environmentId
                override val childDesktopId: String? = "other-child"
                override val environmentParentConnectionId: ClientConnectionId =
                    ClientConnectionId("00000000-0000-0000-0000-0000000000aa")
                override suspend fun parentAccessToken(): String? = "other-parent"
                override suspend fun mintWebSocketTicket(): RemoteWebSocketTicketResult =
                    RemoteWebSocketTicketResult("t", "2099-01-01T00:00:00.000Z")
            },
        )
        try {
            client(authority = null).requestText("/api/snapshot")
            throw AssertionError("Expected the typed conflict refusal")
        } catch (error: RemoteClientException) {
            assertEquals(RemoteClientException.ENVIRONMENT_AUTHORITY_CONFLICT, error.code)
        } finally {
            EnvironmentAuthorityStore.resetForTests()
        }
        assertEquals(0, server.requestCount)
    }

    @Test
    fun missingParentTokenFailsClosedWithoutADial() = runBlocking {
        val client = client(authority(null))
        try {
            client.requestText("/api/snapshot")
            throw AssertionError("Expected parent repair failure")
        } catch (error: RemoteClientException) {
            assertEquals(RemoteClientException.ENVIRONMENT_PARENT_NEEDS_REPAIR, error.code)
        }
        assertEquals(0, server.requestCount)
    }

    @Test
    fun markerProvenParent401BecomesTheTypedRepairState() = runBlocking {
        server.enqueue(
            errorResponse(
                401,
                """{"error":{"code":"invalid_access_token","message":"nope"}}""",
                marker = "parent",
            ),
        )
        val client = client(authority("parent-token"))
        try {
            client.requestText("/api/snapshot")
            throw AssertionError("Expected parent repair")
        } catch (error: RemoteClientException) {
            assertEquals(RemoteClientException.ENVIRONMENT_PARENT_NEEDS_REPAIR, error.code)
            assertEquals("parent", error.environmentAuthAuthority)
        }
    }

    @Test
    fun missingMarker401KeepsTheOriginalFailureWithoutInventedAttribution() = runBlocking {
        server.enqueue(
            errorResponse(
                401,
                """{"error":{"code":"invalid_access_token","message":"nope"}}""",
                marker = null,
            ),
        )
        val client = client(authority("parent-token"))
        try {
            client.requestText("/api/snapshot")
            throw AssertionError("Expected the original failure")
        } catch (error: RemoteClientException) {
            assertEquals("invalid_access_token", error.code)
            assertEquals(401, error.status)
            assertNull(error.environmentAuthAuthority)
        }
    }

    @Test
    fun parentMissingScope403BecomesTheTypedRepairState() = runBlocking {
        server.enqueue(
            errorResponse(
                403,
                """{"error":{"code":"missing_scope","message":"nope"}}""",
                marker = "parent",
            ),
        )
        val client = client(authority("parent-token"))
        try {
            client.requestText("/api/snapshot")
            throw AssertionError("Expected parent repair")
        } catch (error: RemoteClientException) {
            assertEquals(RemoteClientException.ENVIRONMENT_PARENT_NEEDS_REPAIR, error.code)
            assertEquals("parent", error.environmentAuthAuthority)
        }
    }

    @Test
    fun missingMarker403KeepsTheOriginalFailureWithoutInventedAttribution() = runBlocking {
        server.enqueue(
            errorResponse(
                403,
                """{"error":{"code":"origin_not_allowed","message":"nope"}}""",
                marker = null,
            ),
        )
        val client = client(authority("parent-token"))
        try {
            client.requestText("/api/snapshot")
            throw AssertionError("Expected the original failure")
        } catch (error: RemoteClientException) {
            assertEquals("origin_not_allowed", error.code)
            assertEquals(403, error.status)
            assertNull(error.environmentAuthAuthority)
        }
    }

    @Test
    fun parentEndpointPinBindsTheProxyEndpointHostPort() {
        val parentPin = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        val parentEndpoint = server.url("/").toString().trimEnd('/')
        TlsCertPinStore.register(parentEndpoint, parentPin)

        // The proxy endpoint resolves the same host:port pin: the only pin an
        // environment request can ever carry is the parent's.
        assertEquals(parentPin, TlsCertPinStore.fingerprintForEndpoint(proxyEndpoint()))
        assertNull(TlsCertPinStore.fingerprintForEndpoint("https://child.test:2200/"))
    }

    private fun json(body: String): MockResponse = MockResponse()
        .setResponseCode(200)
        .setHeader("Content-Type", "application/json")
        .setBody(body)

    private fun errorResponse(code: Int, body: String, marker: String?): MockResponse =
        MockResponse()
            .setResponseCode(code)
            .setHeader("Content-Type", "application/json")
            .apply { marker?.let { setHeader(EnvironmentProtocol.AUTH_AUTHORITY_HEADER, it) } }
            .setBody(body)

    private fun authority(token: String?): EnvironmentAuthority = object : EnvironmentAuthority {
        override val environmentId: String = this@RemoteApiClientEnvironmentTest.environmentId
        override val childDesktopId: String? = "child-desktop"
        override val environmentParentConnectionId: ClientConnectionId =
            ClientConnectionId("00000000-0000-0000-0000-000000000001")
        override suspend fun parentAccessToken(): String? = token
        override suspend fun mintWebSocketTicket(): RemoteWebSocketTicketResult =
            RemoteWebSocketTicketResult("parent-ticket", "2099-01-01T00:00:00.000Z")
    }
}
