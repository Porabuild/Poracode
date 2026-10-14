package com.poracode.app.transport

import com.poracode.app.model.RemoteClientException
import com.poracode.app.protocol.ProtocolConstants
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * JVM twin of the emulator [TlsPinPairingInstrumentedTest]: real TLS handshake
 * through [TlsCertPin.pin] / [X509TrustManager], pin registered before
 * environment, swapped leaf refuses before `/oauth/token`.
 */
class TlsPinPairingHttpsTest {
    private var server: MockWebServer? = null

    @After
    fun tearDown() {
        TlsCertPinStore.resetForTests()
        server?.shutdown()
        server = null
    }

    @Test
    fun pairsOverSelfSignedTlsWhenPinMatches() {
        val leaf = held("leaf-a")
        val pin = TlsCertPin.sha256Hex(leaf.certificate.encoded)
        val https = startHttps(leaf)
        TlsCertPinStore.register(https.endpoint, pin)

        runBlocking {
            val client = RemoteApiClient(
                endpoint = https.endpoint,
                accessToken = null,
                client = OkHttpClient.Builder()
                    .followRedirects(false)
                    .followSslRedirects(false)
                    .build(),
                networkGate = ForegroundNetworkGate(),
            )
            val environment = client.environment()
            assertEquals("desktop-fixture-001", environment.desktopId)
            val token = client.exchangePairingCredential(
                "lc_pair_tls_ok",
                scopes = listOf("session:read"),
            )
            assertEquals("lc_access_tls_pin", token.accessToken)
        }
        assertTrue(https.paths.contains(ProtocolConstants.ENVIRONMENT_PATH))
        assertTrue(https.paths.contains(ProtocolConstants.OAUTH_TOKEN_PATH))
    }

    @Test
    fun swappedCertRefusesBeforeTokenExchange() {
        val honest = held("leaf-a")
        val imposter = held("leaf-b")
        val pin = TlsCertPin.sha256Hex(honest.certificate.encoded)
        val https = startHttps(imposter)
        TlsCertPinStore.register(https.endpoint, pin)

        runBlocking {
            val client = RemoteApiClient(
                endpoint = https.endpoint,
                accessToken = null,
                client = OkHttpClient.Builder()
                    .followRedirects(false)
                    .followSslRedirects(false)
                    .build(),
                networkGate = ForegroundNetworkGate(),
            )
            try {
                client.environment()
                fail("swapped leaf must fail the TLS handshake")
            } catch (error: RemoteClientException) {
                assertTrue(
                    error.code == TlsCertPin.MISMATCH_CODE || error.code == "network",
                )
            }
        }
        assertFalse(https.paths.contains(ProtocolConstants.OAUTH_TOKEN_PATH))
        assertTrue(https.paths.isEmpty())
    }

    @Test
    fun pinRegisteredAfterClientConstructionStillBinds() {
        val leaf = held("leaf-late")
        val pin = TlsCertPin.sha256Hex(leaf.certificate.encoded)
        val https = startHttps(leaf)

        runBlocking {
            val client = RemoteApiClient(
                endpoint = https.endpoint,
                accessToken = null,
                client = OkHttpClient.Builder()
                    .followRedirects(false)
                    .followSslRedirects(false)
                    .build(),
                networkGate = ForegroundNetworkGate(),
            )
            TlsCertPinStore.register(https.endpoint, pin)
            val environment = client.environment()
            assertEquals("desktop-fixture-001", environment.desktopId)
        }
        assertTrue(https.paths.contains(ProtocolConstants.ENVIRONMENT_PATH))
    }

    @Test
    fun unpairRemovesPinSoLaterClientIsUnpinned() {
        val leaf = held("leaf-unpair")
        val pin = TlsCertPin.sha256Hex(leaf.certificate.encoded)
        val https = startHttps(leaf)
        TlsCertPinStore.register(https.endpoint, pin)
        TlsCertPinStore.remove(https.endpoint)
        assertEquals(null, TlsCertPinStore.fingerprintForEndpoint(https.endpoint))
    }

    private fun held(commonName: String): HeldCertificate =
        HeldCertificate.Builder()
            .commonName(commonName)
            .addSubjectAlternativeName("127.0.0.1")
            .addSubjectAlternativeName("localhost")
            .build()

    private fun startHttps(leaf: HeldCertificate): HttpsFixture {
        val paths = mutableListOf<String>()
        val certificates = HandshakeCertificates.Builder()
            .heldCertificate(leaf)
            .build()
        val server = MockWebServer()
        this.server = server
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                paths += request.path ?: ""
                return when (request.path) {
                    ProtocolConstants.ENVIRONMENT_PATH -> MockResponse()
                        .setResponseCode(200)
                        .setHeader("Content-Type", "application/json")
                        .setBody(ENVIRONMENT_BODY)
                    ProtocolConstants.OAUTH_TOKEN_PATH -> MockResponse()
                        .setResponseCode(200)
                        .setHeader("Content-Type", "application/json")
                        .setBody(TOKEN_BODY)
                    else -> MockResponse().setResponseCode(404)
                }
            }
        }
        server.useHttps(certificates.sslSocketFactory(), false)
        server.start()
        return HttpsFixture(
            endpoint = server.url("/").toString().trimEnd('/'),
            paths = paths,
        )
    }

    private data class HttpsFixture(
        val endpoint: String,
        val paths: MutableList<String>,
    )

    private companion object {
        const val ENVIRONMENT_BODY = """
            {
              "protocolVersion": ${ProtocolConstants.REMOTE_PROTOCOL_VERSION},
              "desktopId": "desktop-fixture-001",
              "label": "Fixture Mac",
              "appVersion": "3.0.0-fixture",
              "hostMode": "desktop",
              "platform": "darwin",
              "auth": {
                "policy": "remote-reachable",
                "bootstrapMethods": ["one-time-token"],
                "sessionMethods": ["bearer-access-token"],
                "scopes": ["session:read"]
              },
              "endpoints": {
                "httpBaseUrl": "https://127.0.0.1/",
                "wsBaseUrl": "wss://127.0.0.1/"
              }
            }
        """
        const val TOKEN_BODY =
            """{"accessToken":"lc_access_tls_pin","tokenType":"Bearer","expiresAt":"2099-01-01T00:00:00.000Z","scopes":["session:read"]}"""
    }
}
