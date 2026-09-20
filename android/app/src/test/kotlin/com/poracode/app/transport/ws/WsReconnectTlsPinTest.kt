package com.poracode.app.transport.ws

import com.poracode.app.model.RemoteAccessTokenResult
import com.poracode.app.model.RemoteEnvironmentDescriptor
import com.poracode.app.model.RemoteRuntimeItemsPage
import com.poracode.app.model.RemoteShellSnapshot
import com.poracode.app.model.RemoteThreadSnapshot
import com.poracode.app.model.ThreadConfig
import com.poracode.app.transport.ForegroundNetworkGate
import com.poracode.app.transport.RemoteApiGateway
import com.poracode.app.transport.RemoteEventSocket
import com.poracode.app.transport.RemoteWebSocketClient
import com.poracode.app.transport.TlsCertPin
import com.poracode.app.transport.TlsCertPinStore
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.serialization.json.JsonArray
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * The WS pin is resolved **per connect attempt**, not captured at construction.
 * Deterministic sequence: a stale pin is published up front so attempt 1
 * deterministically fails the fingerprint check; the correct fingerprint is
 * published only after that failure is observed, so only a reconnect that
 * re-resolves the pin can open the socket. A client captured at construction
 * (the round-2 defect) would keep enforcing the stale pin and never open.
 */
class WsReconnectTlsPinTest {
    private var server: MockWebServer? = null
    private val scopes = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var gate: ForegroundNetworkGate

    @Before
    fun setUp() {
        TlsCertPinStore.resetForTests()
        gate = ForegroundNetworkGate()
        gate.openForForeground()
    }

    @After
    fun tearDown() {
        TlsCertPinStore.resetForTests()
        gate.closeAndCancelAll()
        scopes.cancel()
        server?.shutdown()
        server = null
    }

    @Test
    fun pinPublishedAfterFirstAttemptBindsTheReconnect() {
        val leaf = held("ws-reconnect-leaf")
        val correctPin = TlsCertPin.sha256Hex(leaf.certificate.encoded)
        val stalePin = TlsCertPin.sha256Hex("stale-leaf".toByteArray())
        val https = startHttps(leaf)
        val opened = CountDownLatch(1)
        val firstAttemptFailed = CountDownLatch(1)
        https.server.enqueue(
            MockResponse().withWebSocketUpgrade(
                object : okhttp3.WebSocketListener() {
                    override fun onOpen(
                        webSocket: okhttp3.WebSocket,
                        response: okhttp3.Response,
                    ) {
                        opened.countDown()
                    }
                },
            ),
        )

        TlsCertPinStore.register(https.endpoint, stalePin)
        val client = RemoteWebSocketClient(
            api = api(https.wsUrl),
            scope = scopes,
            endpoint = https.endpoint,
            httpClient = OkHttpClient.Builder()
                .connectTimeout(2, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .build(),
            networkGate = gate,
        )
        client.setListener(
            object : RemoteEventSocket.Listener {
                override fun onStateChanged(
                    state: RemoteWebSocketClient.ConnectionState,
                    detail: String?,
                ) {
                    if (state == RemoteWebSocketClient.ConnectionState.Failed) {
                        firstAttemptFailed.countDown()
                    }
                }

                override fun onMessage(message: com.poracode.app.model.RemoteWebSocketServerMessage) = Unit
                override fun onResyncRequired(reason: String) = Unit
                override fun onSessionExpired(reason: String) = Unit
            },
        )
        // Attempt 1: enforces the stale pin and must fail the fingerprint check.
        client.start(lastSeenSeq = null)
        assertTrue("attempt 1 must fail against the stale pin", firstAttemptFailed.await(15, TimeUnit.SECONDS))
        // Pairing publishes the fresh pin; the scheduled reconnect re-resolves it.
        TlsCertPinStore.register(https.endpoint, correctPin)
        assertTrue(
            "reconnect must re-resolve the newly published pin and open",
            opened.await(15, TimeUnit.SECONDS),
        )
        client.stop()
    }

    private fun api(wsUrl: String): RemoteApiGateway = object : RemoteApiGateway {
        override fun setAccessToken(token: String?) = Unit
        override suspend fun environment(): RemoteEnvironmentDescriptor = error("unused")
        override suspend fun exchangePairingCredential(
            credential: String,
            scopes: List<String>,
        ): RemoteAccessTokenResult = error("unused")
        override suspend fun snapshot(): RemoteShellSnapshot = error("unused")
        override suspend fun agentStatuses() = error("unused")
        override suspend fun threadHistory(
            threadId: String,
            targetTimelineEntryCount: Int?,
        ): RemoteThreadSnapshot = error("unused")
        override suspend fun threadRuntimeItemsPage(
            threadId: String,
            beforePosition: Int?,
            limit: Int,
            targetTimelineEntryCount: Int?,
        ): RemoteRuntimeItemsPage = error("unused")
        override suspend fun sendThreadInput(
            threadId: String,
            prompt: String,
            config: ThreadConfig,
            segments: JsonArray?,
            userMessageItemId: String?,
        ) = Unit
        override suspend fun interruptThread(threadId: String) = Unit
        override suspend fun websocketTicket(): String = "ticket-1"
        override fun websocketUrl(
            ticket: String,
            lastSeenSeq: Int?,
            threadItemInterests: List<String>?,
        ): String = "$wsUrl?ticket=$ticket"
    }

    private fun held(commonName: String): HeldCertificate =
        HeldCertificate.Builder()
            .commonName(commonName)
            .addSubjectAlternativeName("127.0.0.1")
            .addSubjectAlternativeName("localhost")
            .build()

    private fun startHttps(leaf: HeldCertificate): WsHttpsFixture {
        val certificates = HandshakeCertificates.Builder()
            .heldCertificate(leaf)
            .build()
        val server = MockWebServer()
        this.server = server
        server.useHttps(certificates.sslSocketFactory(), false)
        server.start()
        return WsHttpsFixture(
            endpoint = server.url("/").toString().trimEnd('/'),
            wsUrl = server.url("/events").toString().replaceFirst("https:", "wss:"),
            server = server,
        )
    }

    private class WsHttpsFixture(
        val endpoint: String,
        val wsUrl: String,
        val server: MockWebServer,
    )
}
