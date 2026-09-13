package com.poracode.app.transport.terminal

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.terminal.TerminalConnectionFailure
import com.poracode.app.model.terminal.TerminalConnectionPhase
import com.poracode.app.model.terminal.TerminalConnectionStatus
import com.poracode.app.model.terminal.TerminalServerFrame
import com.poracode.app.session.richchat.RichChatHostKey
import com.poracode.app.session.richchat.RichTerminalWatchRequest
import com.poracode.app.transport.ForegroundNetworkGate
import com.poracode.app.transport.RemoteApiClient
import java.util.concurrent.CopyOnWriteArrayList
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
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class ProductionTerminalWatchTransportTest {
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
    }

    @Test
    fun transientEnvironmentFailureRetriesBeforeOpeningSameTerminal() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(503).setBody("temporarily unavailable"))
        server.enqueue(MockResponse().setBody(fixture("environment-terminal-cursor-sync.json")))
        server.enqueue(ticket())
        server.enqueue(MockResponse().withWebSocketUpgrade(
            terminalServer(AtomicReference(), closeAfterBaseline = false, data = "restored"),
        ))
        val live = CountDownLatch(1)
        val transport = ProductionTerminalWatchTransport(
            host = RichChatHostKey(connectionId(), 9),
            http = RemoteApiClient(
                endpoint = server.url("/desktop-prefix").toString(),
                accessToken = "secret-token",
                networkGate = gate,
            ),
            client = OkHttpClient(),
            scope = scope,
            networkGate = gate,
            observer = {
                object : TerminalTransportObserver by NoOpTerminalTransportObserver {
                    override fun onStatus(
                        host: RichChatHostKey,
                        terminalId: String,
                        watchId: String,
                        status: TerminalConnectionStatus,
                    ) {
                        if (status.phase == TerminalConnectionPhase.Live) live.countDown()
                    }
                }
            },
        )
        try {
            val request = RichTerminalWatchRequest("terminal-1", "watch-1")
            runCatching { transport.watch(request) }
            assertTrue(
                "temporary environment failure must recover without manual watch",
                live.await(5, TimeUnit.SECONDS),
            )
            val requests = List(4) { server.takeRequest(2, TimeUnit.SECONDS)!! }
            assertEquals(requests[0].path, requests[1].path)
            assertTrue(requests[0].path!!.contains("/.well-known/poracode/environment"))
        } finally {
            transport.close()
        }
    }

    @Test
    fun authenticationMalformedAndUnsupportedEnvironmentDoNotRetry() = runBlocking {
        val cases = listOf(
            MockResponse().setResponseCode(401) to TerminalConnectionFailure.Authentication,
            MockResponse().setBody("invalid-json") to TerminalConnectionFailure.Protocol,
            MockResponse().setBody(
                fixture("environment-terminal-cursor-sync.json").replace("[1]", "[2]"),
            ) to TerminalConnectionFailure.Unsupported,
        )
        for ((response, expectedFailure) in cases) {
            val before = server.requestCount
            server.enqueue(response)
            val failed = CountDownLatch(1)
            val failure = AtomicReference<TerminalConnectionFailure>()
            val transport = ProductionTerminalWatchTransport(
                host = RichChatHostKey(connectionId(), 9),
                http = RemoteApiClient(
                    endpoint = server.url("/desktop-prefix").toString(),
                    accessToken = "secret-token",
                    networkGate = gate,
                ),
                client = OkHttpClient(),
                scope = scope,
                networkGate = gate,
                observer = {
                    object : TerminalTransportObserver by NoOpTerminalTransportObserver {
                        override fun onStatus(
                            host: RichChatHostKey,
                            terminalId: String,
                            watchId: String,
                            status: TerminalConnectionStatus,
                        ) {
                            if (status.phase == TerminalConnectionPhase.Failed) {
                                failure.set(status.failure)
                                failed.countDown()
                            }
                        }
                    }
                },
            )
            try {
                transport.watch(RichTerminalWatchRequest("terminal-1", "watch-1"))
                assertTrue("expected terminal failure", failed.await(2, TimeUnit.SECONDS))
                assertEquals(expectedFailure, failure.get())
                Thread.sleep(400) // Longer than the first transport retry delay.
                assertEquals("no retry or ticket request", before + 1, server.requestCount)
            } finally {
                transport.close()
            }
        }
    }

    @Test
    fun realSocketUsesTicketSendsCursorWatchAndReconcilesAfterReconnect() = runBlocking {
        server.enqueue(MockResponse().setBody(fixture("environment-terminal-cursor-sync.json")))
        server.enqueue(ticket())
        val firstSocket = AtomicReference<WebSocket>()
        server.enqueue(
            MockResponse().withWebSocketUpgrade(
                terminalServer(firstSocket, closeAfterBaseline = true, data = "first"),
            ),
        )
        server.enqueue(ticket("ticket-2"))
        val secondSocket = AtomicReference<WebSocket>()
        server.enqueue(
            MockResponse().withWebSocketUpgrade(
                terminalServer(secondSocket, closeAfterBaseline = false, data = "second"),
            ),
        )
        val frames = CopyOnWriteArrayList<TerminalServerFrame>()
        val statuses = CopyOnWriteArrayList<TerminalConnectionStatus>()
        val twoBaselines = CountDownLatch(2)
        val twoLiveStates = CountDownLatch(2)
        val host = RichChatHostKey(connectionId(), 9)
        val observer = object : TerminalTransportObserver {
            override fun onConnectionReset(
                host: RichChatHostKey,
                terminalId: String,
                watchId: String,
                status: TerminalConnectionStatus,
            ) {
                statuses += status
            }

            override fun onFrame(host: RichChatHostKey, frame: TerminalServerFrame) {
                frames += frame
                if (frame is TerminalServerFrame.Cursor &&
                    frame.frame.kind == com.poracode.app.chat.TerminalCursorFrameKind.BASELINE
                ) {
                    twoBaselines.countDown()
                }
            }

            override fun onStatus(
                host: RichChatHostKey,
                terminalId: String,
                watchId: String,
                status: TerminalConnectionStatus,
            ) {
                statuses += status
                if (status.phase == TerminalConnectionPhase.Live) twoLiveStates.countDown()
            }
        }
        val http = RemoteApiClient(
            endpoint = server.url("/desktop-prefix").toString(),
            accessToken = "secret-token",
            networkGate = gate,
        )
        val transport = ProductionTerminalWatchTransport(
            host = host,
            http = http,
            client = OkHttpClient(),
            scope = scope,
            networkGate = gate,
            observer = { observer },
        )

        transport.watch(RichTerminalWatchRequest("terminal-1", "watch-1"))

        assertTrue("expected baseline on both physical sockets", twoBaselines.await(8, TimeUnit.SECONDS))
        assertTrue("expected both sockets to become live", twoLiveStates.await(2, TimeUnit.SECONDS))
        assertEquals(listOf("first", "second"), frames.filterIsInstance<TerminalServerFrame.Cursor>()
            .map { it.frame.data })
        assertTrue(statuses.any { it.phase == TerminalConnectionPhase.Reconnecting })
        assertEquals(TerminalConnectionPhase.Live, statuses.last().phase)

        val requests = List(5) { server.takeRequest(2, TimeUnit.SECONDS)!! }
        assertTrue(requests[0].path!!.startsWith("/desktop-prefix/.well-known/poracode/environment"))
        assertEquals("Bearer secret-token", requests[1].getHeader("Authorization"))
        assertFalse(requests[2].path!!.contains("lastSeenSeq"))
        assertFalse(requests[4].path!!.contains("lastSeenSeq"))

        val beforeBackground = frames.size
        transport.enterBackground()
        secondSocket.get()?.send(output("late", 6, 10))
        Thread.sleep(100)
        assertEquals(beforeBackground, frames.size)
        assertEquals(TerminalConnectionPhase.Suspended, statuses.last().phase)
        transport.close()
    }

    @Test
    fun v2HostStreamsChunkedBaselineWithPerChunkAcksAsOneBaselineFrame() = runBlocking {
        server.enqueue(
            MockResponse().setBody(
                fixture("environment-terminal-cursor-sync.json").replace("[1]", "[1, 2]"),
            ),
        )
        server.enqueue(ticket())
        val serverMessages = CopyOnWriteArrayList<String>()
        val acksRecorded = CountDownLatch(3)
        server.enqueue(
            MockResponse().withWebSocketUpgrade(chunkServer(serverMessages, acksRecorded)),
        )
        val frames = CopyOnWriteArrayList<TerminalServerFrame>()
        val live = CountDownLatch(1)
        val transport = ProductionTerminalWatchTransport(
            host = RichChatHostKey(connectionId(), 9),
            http = RemoteApiClient(
                endpoint = server.url("/desktop-prefix").toString(),
                accessToken = "secret-token",
                networkGate = gate,
            ),
            client = OkHttpClient(),
            scope = scope,
            networkGate = gate,
            observer = {
                object : TerminalTransportObserver by NoOpTerminalTransportObserver {
                    override fun onFrame(
                        host: RichChatHostKey,
                        frame: TerminalServerFrame,
                    ) {
                        frames += frame
                    }

                    override fun onStatus(
                        host: RichChatHostKey,
                        terminalId: String,
                        watchId: String,
                        status: TerminalConnectionStatus,
                    ) {
                        if (status.phase == TerminalConnectionPhase.Live) live.countDown()
                    }
                }
            },
        )
        try {
            transport.watch(
                RichTerminalWatchRequest("terminal-1", "watch-1", cursorSyncVersion = 2),
            )
            assertTrue("chunked baseline must reach Live", live.await(8, TimeUnit.SECONDS))
            assertTrue("server must observe all three acks", acksRecorded.await(4, TimeUnit.SECONDS))

            val baselines = frames.filterIsInstance<TerminalServerFrame.Cursor>()
                .filter {
                    it.frame.kind == com.poracode.app.chat.TerminalCursorFrameKind.BASELINE
                }
            assertEquals(1, baselines.size)
            val baseline = baselines.single()
            assertEquals("abcdefgh", baseline.frame.data)
            assertEquals(100L, baseline.frame.fromCursor)
            assertEquals(108L, baseline.frame.toCursor)
            assertEquals("instance-1", baseline.frame.generation)
            assertEquals(
                com.poracode.app.model.terminal.TerminalProcessState.Running,
                baseline.processState,
            )
            assertEquals(com.poracode.app.model.terminal.TerminalDimensions(80, 24), baseline.dimensions)
            // Chunks never leak past the transport.
            assertTrue(frames.none { it is TerminalServerFrame.BaselineChunk })

            val watch = serverMessages.single { it.contains("\"type\":\"terminal-watch\"") }
            assertTrue(watch.contains("\"version\":2"))
            assertTrue(watch.contains("\"maxChunkBytes\":4096"))
            val acks = serverMessages.filter { it.contains("terminal-watch-baseline-ack") }
            assertEquals(
                listOf(103L, 106L, 108L),
                acks.map { ack ->
                    Regex("\"throughCursor\":(\\d+)").find(ack)!!.groupValues[1].toLong()
                },
            )
        } finally {
            transport.close()
        }
    }

    @Test
    fun unsupportedVersionVerdictDowngradesToV1WatchOnTheSameConnection() = runBlocking {
        server.enqueue(
            MockResponse().setBody(
                fixture("environment-terminal-cursor-sync.json").replace("[1]", "[1, 2]"),
            ),
        )
        server.enqueue(ticket())
        val serverMessages = CopyOnWriteArrayList<String>()
        val frames = CopyOnWriteArrayList<TerminalServerFrame>()
        val live = CountDownLatch(1)
        val failed = CountDownLatch(1)
        server.enqueue(
            MockResponse().withWebSocketUpgrade(downgradingServer(serverMessages)),
        )
        val transport = ProductionTerminalWatchTransport(
            host = RichChatHostKey(connectionId(), 9),
            http = RemoteApiClient(
                endpoint = server.url("/desktop-prefix").toString(),
                accessToken = "secret-token",
                networkGate = gate,
            ),
            client = OkHttpClient(),
            scope = scope,
            networkGate = gate,
            observer = {
                object : TerminalTransportObserver by NoOpTerminalTransportObserver {
                    override fun onFrame(
                        host: RichChatHostKey,
                        frame: TerminalServerFrame,
                    ) {
                        frames += frame
                    }

                    override fun onStatus(
                        host: RichChatHostKey,
                        terminalId: String,
                        watchId: String,
                        status: TerminalConnectionStatus,
                    ) {
                        if (status.phase == TerminalConnectionPhase.Live) live.countDown()
                        if (status.phase == TerminalConnectionPhase.Failed) failed.countDown()
                    }
                }
            },
        )
        try {
            transport.watch(
                RichTerminalWatchRequest("terminal-1", "watch-1", cursorSyncVersion = 2),
            )
            assertTrue("v1 downgrade must reach Live", live.await(8, TimeUnit.SECONDS))
            assertEquals("downgrade must not fail the watch", 1, failed.count)

            val watches = serverMessages.filter { it.contains("\"type\":\"terminal-watch\"") }
            assertEquals(2, watches.size)
            assertTrue(watches[0].contains("\"version\":2"))
            assertTrue(watches[1].contains("\"version\":1"))
            assertTrue(watches.none { it.contains("\"resume\"") })
            // The rejection verdict is consumed by the downgrade and never
            // delivered past the transport.
            assertTrue(frames.none { it is TerminalServerFrame.WatchError })
        } finally {
            transport.close()
        }
    }

    /** v2-advertised server that rejects the first v2 watch with the explicit
     * `unsupported-version` verdict and serves a v1 baseline afterwards. */
    private fun downgradingServer(
        messages: CopyOnWriteArrayList<String>,
    ) = object : WebSocketListener() {
        private var rejectedV2 = false

        override fun onOpen(webSocket: WebSocket, response: Response) {
            webSocket.send("""{"type":"ready","seq":0}""")
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            messages += text
            if (!text.contains("\"type\":\"terminal-watch\"")) return
            if (!rejectedV2 && text.contains("\"version\":2")) {
                rejectedV2 = true
                // The rejection travels on the version-1 watch-result error
                // channel; `reason` discriminates the downgrade verdict.
                webSocket.send("""{"type":"terminal-watch-result","id":"terminal-1",
                  "cursorSync":{"version":1,"watchId":"watch-1","result":{
                    "status":"error","code":"unavailable","reason":"unsupported-version",
                    "retryable":false}}}""")
            } else {
                webSocket.send(baseline("downgraded"))
            }
        }
    }

    /** v2 server: sends the baseline as three chunks and records client traffic. */
    private fun chunkServer(
        messages: CopyOnWriteArrayList<String>,
        acksRecorded: CountDownLatch,
    ) = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            webSocket.send("""{"type":"ready","seq":0}""")
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            messages += text
            if (text.contains("terminal-watch-baseline-ack")) acksRecorded.countDown()
            if (!text.contains("\"type\":\"terminal-watch\"")) return
            for (chunk in listOf(
                chunk(0, 3, 100, 103, "abc"),
                chunk(1, 3, 103, 106, "def"),
                chunk(2, 3, 106, 108, "gh"),
            )) {
                webSocket.send(chunk)
            }
        }
    }

    private fun chunk(index: Int, count: Int, from: Int, to: Int, data: String): String = """{
      "type":"terminal-watch-baseline-chunk","id":"terminal-1",
      "cursorSync":{"version":2,"watchId":"watch-1","generation":"instance-1",
      "chunkIndex":$index,"chunkCount":$count,"fromCursor":$from,"toCursor":$to,
      "data":"$data","processState":"running",
      "terminalSize":${if (index == count - 1) "{\"cols\":80,\"rows\":24}" else "null"},
      "resumeServed":false}
    }"""

    private fun terminalServer(
        socketRef: AtomicReference<WebSocket>,
        closeAfterBaseline: Boolean,
        data: String,
    ) = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            socketRef.set(webSocket)
            webSocket.send("""{"type":"ready","seq":0}""")
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            assertTrue(text.contains("\"type\":\"terminal-watch\""))
            assertTrue(text.contains("\"watchId\":\"watch-1\""))
            webSocket.send(baseline(data))
            if (closeAfterBaseline) webSocket.close(1012, "restart")
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

    private fun output(data: String, from: Int, to: Int): String = """{
      "type":"terminal-output","id":"terminal-1","data":"$data",
      "cursorSync":{"version":1,"watchId":"watch-1","generation":"generation-1",
      "fromCursor":$from,"toCursor":$to}
    }"""

    private fun ticket(value: String = "ticket-1") = MockResponse().setBody(
        """{"ticket":"$value","expiresAt":"2099-01-01T00:00:00.000Z"}""",
    )

    private fun fixture(name: String): String = javaClass.classLoader!!
        .getResourceAsStream("fixtures/$name")!!.bufferedReader().use { it.readText() }

    private fun connectionId() =
        ClientConnectionId("00000000-0000-4000-8000-000000000099")
}
