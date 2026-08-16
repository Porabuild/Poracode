package com.poracode.app.transport.terminal

import com.poracode.app.model.ClientConnectionId
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
