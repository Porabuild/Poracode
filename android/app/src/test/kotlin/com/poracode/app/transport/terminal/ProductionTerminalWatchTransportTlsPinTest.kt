package com.poracode.app.transport.terminal

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.terminal.TerminalConnectionFailure
import com.poracode.app.model.terminal.TerminalConnectionPhase
import com.poracode.app.model.terminal.TerminalConnectionStatus
import com.poracode.app.session.richchat.RichChatHostKey
import com.poracode.app.session.richchat.RichTerminalWatchRequest
import com.poracode.app.transport.ForegroundNetworkGate
import com.poracode.app.transport.RemoteApiClient
import com.poracode.app.transport.TlsCertPin
import com.poracode.app.transport.TlsCertPinStore
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * The terminal-watch socket must honor the pairing-published pin. The transport
 * derives its socket client through [TlsCertPin.clientForEndpoint] at connect
 * time, so a swapped leaf refuses before any HTTP traffic reaches the host while
 * a missing pin keeps the caller's default trust. The base client below is a
 * plain [OkHttpClient]: it trusts no self-signed leaf, so only the seeded
 * pinner can complete the handshake. The same base client feeds the preflight
 * API client and the socket, mirroring production wiring.
 */
class ProductionTerminalWatchTransportTlsPinTest {
    private lateinit var server: MockWebServer
    private lateinit var gate: ForegroundNetworkGate
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        gate = ForegroundNetworkGate()
    }

    @After
    fun tearDown() {
        gate.closeAndCancelAll()
        scope.cancel()
        server.shutdown()
        TlsCertPinStore.resetForTests()
    }

    @Test
    fun pinnedEndpointSeedsTheSocketClientFromTheStoredPin() = runBlocking {
        val leaf = held("terminal-leaf")
        val endpoint = startHttps(leaf)
        TlsCertPinStore.register(endpoint, TlsCertPin.sha256Hex(leaf.certificate.encoded))
        server.enqueue(MockResponse().setBody(fixture("environment-terminal-cursor-sync.json")))
        server.enqueue(ticket())
        server.enqueue(MockResponse().withWebSocketUpgrade(readyThenBaseline("pinned")))
        val live = CountDownLatch(1)
        val transport = transport(OkHttpClient()) { status ->
            if (status.phase == TerminalConnectionPhase.Live) live.countDown()
        }
        try {
            transport.watch(RichTerminalWatchRequest("terminal-1", "watch-1"))
            assertTrue("pinned leaf must reach Live", live.await(8, TimeUnit.SECONDS))
        } finally {
            transport.close()
        }
    }

    @Test
    fun swappedLeafRefusesTheWatchAsAnOrdinaryTransportError() = runBlocking {
        val honest = held("terminal-leaf")
        val imposter = held("terminal-imposter")
        val endpoint = startHttps(imposter)
        TlsCertPinStore.register(endpoint, TlsCertPin.sha256Hex(honest.certificate.encoded))
        val reconnecting = CountDownLatch(1)
        val failure = AtomicReference<TerminalConnectionFailure>()
        val transport = transport(OkHttpClient()) { status ->
            if (status.phase == TerminalConnectionPhase.Reconnecting) {
                failure.set(status.failure)
                reconnecting.countDown()
            }
        }
        try {
            transport.watch(RichTerminalWatchRequest("terminal-1", "watch-1"))
            assertTrue(
                "TLS refusal must surface as an ordinary reconnect",
                reconnecting.await(5, TimeUnit.SECONDS),
            )
            assertEquals(TerminalConnectionFailure.Network, failure.get())
            Thread.sleep(600) // Span the first retry delays; refusals stay silent.
            assertEquals("swapped leaf must refuse before any HTTP request", 0, server.requestCount)
        } finally {
            transport.close()
        }
    }

    @Test
    fun unpinnedEndpointKeepsTheCallerDefaultTrust() = runBlocking {
        val leaf = held("terminal-unpinned")
        val endpoint = startHttps(leaf)
        assertNull(TlsCertPinStore.fingerprintForEndpoint(endpoint))
        server.enqueue(MockResponse().setBody(fixture("environment-terminal-cursor-sync.json")))
        server.enqueue(ticket())
        server.enqueue(MockResponse().withWebSocketUpgrade(readyThenBaseline("unpinned")))
        val live = CountDownLatch(1)
        val transport = transport(trustFixture(leaf)) { status ->
            if (status.phase == TerminalConnectionPhase.Live) live.countDown()
        }
        try {
            transport.watch(RichTerminalWatchRequest("terminal-1", "watch-1"))
            assertTrue(
                "unpinned endpoint must still connect with default trust",
                live.await(8, TimeUnit.SECONDS),
            )
        } finally {
            transport.close()
        }
    }

    private fun transport(
        client: OkHttpClient,
        handleStatus: (TerminalConnectionStatus) -> Unit,
    ): ProductionTerminalWatchTransport = ProductionTerminalWatchTransport(
        host = RichChatHostKey(connectionId(), 9),
        http = RemoteApiClient(
            endpoint = endpoint(),
            accessToken = "secret-token",
            client = client,
            networkGate = gate,
        ),
        client = client,
        scope = scope,
        networkGate = gate,
        observer = {
            object : TerminalTransportObserver by NoOpTerminalTransportObserver {
                override fun onConnectionReset(
                    host: RichChatHostKey,
                    terminalId: String,
                    watchId: String,
                    status: TerminalConnectionStatus,
                ) {
                    handleStatus(status)
                }

                override fun onStatus(
                    host: RichChatHostKey,
                    terminalId: String,
                    watchId: String,
                    status: TerminalConnectionStatus,
                ) {
                    handleStatus(status)
                }
            }
        },
    )

    private fun endpoint(): String = server.url("/desktop-prefix").toString().trimEnd('/')

    private fun readyThenBaseline(data: String) = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            webSocket.send("""{"type":"ready","seq":0}""")
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            webSocket.send(baseline(data))
        }
    }

    private fun baseline(data: String): String = """{
      "type":"terminal-watch-result","id":"terminal-1",
      "cursorSync":{"version":1,"watchId":"watch-1","result":{
        "status":"ready","generation":"generation-1","fromCursor":0,
        "toCursor":${data.length},"data":"$data","processState":"running",
        "terminalSize":{"cols":80,"rows":24}
      }}
    }"""

    private fun ticket(value: String = "ticket-1") = MockResponse().setBody(
        """{"ticket":"$value","expiresAt":"2099-01-01T00:00:00.000Z"}""",
    )

    private fun held(commonName: String): HeldCertificate =
        HeldCertificate.Builder()
            .commonName(commonName)
            .addSubjectAlternativeName("127.0.0.1")
            .addSubjectAlternativeName("localhost")
            .build()

    private fun startHttps(leaf: HeldCertificate): String {
        val certificates = HandshakeCertificates.Builder()
            .heldCertificate(leaf)
            .build()
        server.useHttps(certificates.sslSocketFactory(), false)
        return endpoint()
    }

    /** Client trust for the self-signed fixture leaf without any stored pin. */
    private fun trustFixture(leaf: HeldCertificate): OkHttpClient {
        val certificates = HandshakeCertificates.Builder()
            .addTrustedCertificate(leaf.certificate)
            .build()
        return OkHttpClient.Builder()
            .sslSocketFactory(certificates.sslSocketFactory(), certificates.trustManager)
            .build()
    }

    private fun fixture(name: String): String = javaClass.classLoader!!
        .getResourceAsStream("fixtures/$name")!!.bufferedReader().use { it.readText() }

    private fun connectionId() =
        ClientConnectionId("00000000-0000-4000-8000-000000000098")
}
