package com.poracode.app.transport.ws

import com.poracode.app.transport.RemoteWebSocketClient
import com.poracode.app.transport.TlsCertPin
import com.poracode.app.transport.TlsCertPinStore
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The WS connection path must honor the pairing-published pin. The production
 * fallback builds its socket client via [RemoteWebSocketClient.defaultWsClient]
 * with the endpoint, so the pin is read from [TlsCertPinStore] at connect time:
 * a swapped leaf must refuse the handshake before any frame is exchanged.
 */
class DefaultWsClientTlsPinTest {
    private var server: MockWebServer? = null

    @After
    fun tearDown() {
        TlsCertPinStore.resetForTests()
        server?.shutdown()
        server = null
    }

    @Test
    fun pinnedFallbackOpensAgainstThePublishedLeaf() {
        val leaf = held("ws-leaf")
        val pin = TlsCertPin.sha256Hex(leaf.certificate.encoded)
        val https = startHttps(leaf, serveUpgrade = true)
        TlsCertPinStore.register(https.endpoint, pin)

        val opened = AtomicBoolean(false)
        val done = CountDownLatch(1)
        val client: OkHttpClient =
            RemoteWebSocketClient.defaultWsClient(https.endpoint)
        client.newWebSocket(
            Request.Builder().url(https.wsUrl).build(),
            object : okhttp3.WebSocketListener() {
                override fun onOpen(
                    webSocket: okhttp3.WebSocket,
                    response: okhttp3.Response,
                ) {
                    opened.set(true)
                    done.countDown()
                }

                override fun onFailure(
                    webSocket: okhttp3.WebSocket,
                    t: Throwable,
                    response: okhttp3.Response?,
                ) {
                    done.countDown()
                }
            },
        )
        assertTrue("WS must open against the pinned leaf", done.await(15, TimeUnit.SECONDS))
        assertTrue(opened.get())
    }

    @Test
    fun pinnedFallbackRefusesSwappedCert() {
        val honest = held("ws-leaf")
        val imposter = held("ws-imposter")
        val pin = TlsCertPin.sha256Hex(honest.certificate.encoded)
        val https = startHttps(imposter, serveUpgrade = true)
        TlsCertPinStore.register(https.endpoint, pin)

        val opened = AtomicBoolean(false)
        val failed = AtomicBoolean(false)
        val done = CountDownLatch(1)
        val client: OkHttpClient =
            RemoteWebSocketClient.defaultWsClient(https.endpoint)
        client.newWebSocket(
            Request.Builder().url(https.wsUrl).build(),
            object : okhttp3.WebSocketListener() {
                override fun onOpen(
                    webSocket: okhttp3.WebSocket,
                    response: okhttp3.Response,
                ) {
                    opened.set(true)
                    done.countDown()
                }

                override fun onFailure(
                    webSocket: okhttp3.WebSocket,
                    t: Throwable,
                    response: okhttp3.Response?,
                ) {
                    failed.set(true)
                    done.countDown()
                }
            },
        )
        assertTrue("WS must fail fast against a swapped leaf", done.await(15, TimeUnit.SECONDS))
        assertFalse("swapped leaf must never open", opened.get())
        assertTrue("swapped leaf must fail the handshake", failed.get())
        assertEquals(0, https.requestCount)
    }

    private fun held(commonName: String): HeldCertificate =
        HeldCertificate.Builder()
            .commonName(commonName)
            .addSubjectAlternativeName("127.0.0.1")
            .addSubjectAlternativeName("localhost")
            .build()

    private fun startHttps(leaf: HeldCertificate, serveUpgrade: Boolean): WsHttpsFixture {
        val certificates = HandshakeCertificates.Builder()
            .heldCertificate(leaf)
            .build()
        val server = MockWebServer()
        this.server = server
        server.useHttps(certificates.sslSocketFactory(), false)
        if (serveUpgrade) {
            server.enqueue(
                MockResponse().withWebSocketUpgrade(
                    object : okhttp3.WebSocketListener() {},
                ),
            )
        }
        server.start()
        val httpUrl = server.url("/events").toString()
        return WsHttpsFixture(
            endpoint = server.url("/").toString().trimEnd('/'),
            wsUrl = httpUrl.replaceFirst("https:", "wss:"),
            server = server,
        )
    }

    private class WsHttpsFixture(
        val endpoint: String,
        val wsUrl: String,
        private val server: MockWebServer,
    ) {
        val requestCount: Int get() = server.requestCount
    }
}
