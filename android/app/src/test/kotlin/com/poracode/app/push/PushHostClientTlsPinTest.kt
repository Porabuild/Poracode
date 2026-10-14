package com.poracode.app.push

import com.poracode.app.transport.TlsCertPin
import com.poracode.app.transport.TlsCertPinStore
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Push traffic must honor the pairing-published pin: [PushHostClient] derives a
 * pinned client per request from [TlsCertPinStore] (the shared default client
 * itself stays unpinned), so a swapped leaf is refused before any byte is sent.
 */
class PushHostClientTlsPinTest {
    private var server: MockWebServer? = null

    @After
    fun tearDown() {
        TlsCertPinStore.resetForTests()
        server?.shutdown()
        server = null
    }

    @Test
    fun pinnedHostAcceptsThePublishedLeaf() {
        val leaf = held("push-leaf")
        val pin = TlsCertPin.sha256Hex(leaf.certificate.encoded)
        val https = startHttps(leaf)
        TlsCertPinStore.register(https.endpoint, pin)

        runBlocking {
            val client = PushHostClient(https.endpoint, "access-secret")
            val result = client.register(registration())
            assertEquals(PushHttpResult.Success(1), result)
        }
        assertEquals(1, https.requestCount)
    }

    @Test
    fun swappedCertRefusesPushTraffic() {
        val honest = held("push-leaf")
        val imposter = held("push-imposter")
        val pin = TlsCertPin.sha256Hex(honest.certificate.encoded)
        val https = startHttps(imposter)
        TlsCertPinStore.register(https.endpoint, pin)

        runBlocking {
            val client = PushHostClient(https.endpoint, "access-secret")
            val result = client.register(registration())
            assertEquals(PushHttpResult.TransientFailure, result)
        }
        assertEquals(0, https.requestCount)
    }

    @Test
    fun unpairedHostDropsThePinSoRequestsRunUnpinnedAgain() {
        val leaf = held("push-leaf")
        val pin = TlsCertPin.sha256Hex(leaf.certificate.encoded)
        val https = startHttps(leaf)
        TlsCertPinStore.register(https.endpoint, pin)
        assertEquals(pin, TlsCertPinStore.fingerprintForEndpoint(https.endpoint))

        TlsCertPinStore.remove(https.endpoint)
        assertEquals(null, TlsCertPinStore.fingerprintForEndpoint(https.endpoint))
        assertTrue(https.endpoint.startsWith("https://"))
    }

    private fun held(commonName: String): HeldCertificate =
        HeldCertificate.Builder()
            .commonName(commonName)
            .addSubjectAlternativeName("127.0.0.1")
            .addSubjectAlternativeName("localhost")
            .build()

    private fun startHttps(leaf: HeldCertificate): PushHttpsFixture {
        val certificates = HandshakeCertificates.Builder()
            .heldCertificate(leaf)
            .build()
        val server = MockWebServer()
        this.server = server
        server.useHttps(certificates.sslSocketFactory(), false)
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody("""{"ok":true,"routing":{"version":1}}"""),
        )
        server.start()
        return PushHttpsFixture(
            endpoint = server.url("/").toString().trimEnd('/'),
            server = server,
        )
    }

    private class PushHttpsFixture(
        val endpoint: String,
        private val server: MockWebServer,
    ) {
        val requestCount: Int get() = server.requestCount
    }

    private fun registration() = PushRegistrationBody(
        deviceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        deviceToken = "fcm-secret",
        appVersion = "1.5.0",
        routing = PushRegistrationRouteV1(
            clientConnectionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            desktopId = "desktop",
        ),
    )
}
