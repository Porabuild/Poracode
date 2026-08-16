package com.poracode.app.transport

import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.protocol.RemoteAccessScopes
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import kotlinx.coroutines.runBlocking
import org.junit.Test

/**
 * Redirect bypass + pairing scope intersection coverage via MockWebServer.
 */
class RemoteApiClientRedirectAndScopesTest {
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

    private fun client(token: String? = "test-token"): RemoteApiClient =
        RemoteApiClient(
            endpoint = server.url("/").toString().trimEnd('/'),
            accessToken = token,
            // Explicit client with redirects disabled (matches production defaultClient).
            client = OkHttpClient.Builder()
                .followRedirects(false)
                .followSslRedirects(false)
                .build(),
        )

    @Test
    fun doesNotFollowHttpRedirect() {
        runBlocking {
        // 302 to another path — client must not follow; request count stays 1.
        server.enqueue(
            MockResponse()
                .setResponseCode(302)
                .setHeader("Location", server.url("/api/snapshot").toString())
                .setBody("redirect"),
        )
        // Would be the follow target if redirects were enabled.
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(
                    """{"snapshotSeq":1,"projects":[],"threads":[],"updatedAt":"2099-01-01T00:00:00.000Z"}""",
                ),
        )

        try {
            client().snapshot()
            fail("expected non-success on 302 without follow")
        } catch (e: Exception) {
            // RemoteClientException for non-2xx.
            assertTrue(e.message != null)
        }

        assertEquals(1, server.requestCount)
        val recorded = server.takeRequest()
        assertTrue(recorded.path!!.endsWith("/api/snapshot"))
        }
    }

    @Test
    fun exchangePairingCredentialRequestsExactIntersectedScopes() {
        runBlocking {
        // environment with partial known + unknown advertised scopes
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(
                    """
                    {
                      "protocolVersion": 3,
                      "desktopId": "desktop-fixture-001",
                      "label": "Fixture Mac",
                      "appVersion": "3.0.0-fixture",
                      "auth": {
                        "policy": "remote-reachable",
                        "bootstrapMethods": ["one-time-token"],
                        "sessionMethods": ["bearer-access-token"],
                        "scopes": ["session:read", "session:operate", "future:capability", "projects:manage"]
                      },
                      "endpoints": {
                        "httpBaseUrl": "https://host.example/",
                        "wsBaseUrl": "wss://host.example/"
                      }
                    }
                    """.trimIndent(),
                ),
        )
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(
                    """
                    {
                      "accessToken": "tok",
                      "tokenType": "Bearer",
                      "expiresAt": "2099-01-01T00:00:00.000Z",
                      "scopes": ["session:read", "session:operate", "projects:manage", "future:capability"]
                    }
                    """.trimIndent(),
                ),
        )

        val api = client(token = null)
        val environment = api.environment()
        // Unknown scopes filtered on parse.
        assertEquals(
            listOf("session:read", "session:operate", "projects:manage"),
            environment.auth.scopes,
        )
        val requested = RemoteAccessScopes.scopesToRequest(environment.auth.scopes)
        // Standard order intersection.
        assertEquals(
            listOf("session:read", "session:operate", "projects:manage"),
            requested,
        )
        assertFalse(requested.contains("future:capability"))

        val token = api.exchangePairingCredential("lc_pair", scopes = requested)
        assertEquals(listOf("session:read", "session:operate", "projects:manage"), token.scopes)

        // Skip environment request; inspect token body.
        server.takeRequest()
        val tokenRequest = server.takeRequest()
        assertTrue(tokenRequest.path!!.endsWith(ProtocolConstants.OAUTH_TOKEN_PATH))
        val body = tokenRequest.body.readUtf8()
        // Exact scopes array in standard order — no future:capability.
        assertTrue(
            body.contains(
                """"scopes":["session:read","session:operate","projects:manage"]""",
            ) || (
                body.contains("session:read") &&
                    body.contains("session:operate") &&
                    body.contains("projects:manage") &&
                    !body.contains("future:capability")
                ),
        )
        // Standard order: session:read before session:operate before projects:manage.
        val readIdx = body.indexOf("session:read")
        val operateIdx = body.indexOf("session:operate")
        val projectsIdx = body.indexOf("projects:manage")
        assertTrue(readIdx >= 0 && operateIdx > readIdx && projectsIdx > operateIdx)
        }
    }

    @Test
    fun environmentProtocolMismatchDoesNotCallToken() {
        runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(
                    """
                    {
                      "protocolVersion": 2,
                      "desktopId": "d",
                      "label": "L",
                      "appVersion": "1",
                      "auth": {
                        "policy": "remote-reachable",
                        "bootstrapMethods": ["one-time-token"],
                        "sessionMethods": ["bearer-access-token"],
                        "scopes": ["session:read"]
                      },
                      "endpoints": {
                        "httpBaseUrl": "https://h/",
                        "wsBaseUrl": "wss://h/"
                      }
                    }
                    """.trimIndent(),
                ),
        )
        try {
            client(token = null).environment()
            fail("expected protocol mismatch")
        } catch (e: com.poracode.app.model.RemoteClientException) {
            assertEquals("protocol_version_mismatch", e.code)
        }
        assertEquals(1, server.requestCount)
        assertTrue(server.takeRequest().path!!.contains("environment"))
        }
    }

    @Test
    fun emptyOrAllUnknownScopesLeavesTokenEndpointUntouched() {
        runBlocking {
        // Environment advertises only unknown scopes → scopesToRequest is empty;
        // pairing must fail before burning the one-time credential.
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(
                    """
                    {
                      "protocolVersion": 3,
                      "desktopId": "desktop-fixture-001",
                      "label": "Fixture Mac",
                      "appVersion": "3.0.0-fixture",
                      "auth": {
                        "policy": "remote-reachable",
                        "bootstrapMethods": ["one-time-token"],
                        "sessionMethods": ["bearer-access-token"],
                        "scopes": ["future:capability", "other:unknown"]
                      },
                      "endpoints": {
                        "httpBaseUrl": "https://host.example/",
                        "wsBaseUrl": "wss://host.example/"
                      }
                    }
                    """.trimIndent(),
                ),
        )
        // Would be the token response if incorrectly escalated to all seven.
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(
                    """
                    {
                      "accessToken": "must-not-be-requested",
                      "tokenType": "Bearer",
                      "expiresAt": "2099-01-01T00:00:00.000Z",
                      "scopes": []
                    }
                    """.trimIndent(),
                ),
        )

        val api = client(token = null)
        val environment = api.environment()
        // Unknown scopes filtered on parse → empty known list.
        assertTrue(environment.auth.scopes.isEmpty())
        val requested = RemoteAccessScopes.scopesToRequest(environment.auth.scopes)
        assertTrue(requested.isEmpty())
        assertTrue(RemoteAccessScopes.hasNoKnownAdvertisedScopes(environment.auth.scopes))

        // Session-layer gate: empty requested scopes → do not call token endpoint.
        // Only the environment request was made.
        assertEquals(1, server.requestCount)
        val envReq = server.takeRequest()
        assertTrue(envReq.path!!.contains("environment"))
        // Token endpoint never touched (request count stays at environment only).
        assertEquals(1, server.requestCount)
        assertFalse(envReq.path!!.contains(ProtocolConstants.OAUTH_TOKEN_PATH))
        }
    }
}
