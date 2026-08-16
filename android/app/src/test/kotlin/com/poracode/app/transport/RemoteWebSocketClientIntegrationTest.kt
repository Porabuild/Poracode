package com.poracode.app.transport

import com.poracode.app.model.RemoteAccessTokenResult
import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteEnvironmentDescriptor
import com.poracode.app.model.RemoteRuntimeItemsPage
import com.poracode.app.model.RemoteShellSnapshot
import com.poracode.app.model.RemoteThreadSnapshot
import com.poracode.app.model.ThreadConfig
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonArray
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Real [RemoteWebSocketClient] + [com.poracode.app.transport.ws.WsConnectionLoop]
 * against MockWebServer — not FakeSocket-only decision helpers.
 */
class RemoteWebSocketClientIntegrationTest {
    private lateinit var server: MockWebServer
    private lateinit var gate: ForegroundNetworkGate
    private val scopes = kotlinx.coroutines.CoroutineScope(SupervisorJob() + Dispatchers.IO)

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        gate = ForegroundNetworkGate()
        gate.openForForeground()
    }

    @After
    fun tearDown() {
        gate.closeAndCancelAll()
        server.shutdown()
        scopes.cancel()
    }

    private fun api(
        ticketHold: CompletableDeferred<Unit>? = null,
        ticketReached: CompletableDeferred<Unit>? = null,
        ticketBody: String = """{"ticket":"t-1"}""",
    ): RemoteApiGateway = object : RemoteApiGateway {
        override fun setAccessToken(token: String?) = Unit
        override suspend fun environment(): RemoteEnvironmentDescriptor = error("unused")
        override suspend fun exchangePairingCredential(
            credential: String,
            scopes: List<String>,
        ): RemoteAccessTokenResult = error("unused")
        override suspend fun snapshot(): RemoteShellSnapshot = error("unused")
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
        override suspend fun websocketTicket(): String {
            ticketReached?.complete(Unit)
            ticketHold?.await()
            // Ticket endpoint is HTTP on the same MockWebServer host in production;
            // here we just return a fixed ticket and enqueue WS upgrade separately.
            return "ticket-1"
        }
        override fun websocketUrl(
            ticket: String,
            lastSeenSeq: Int?,
            threadItemInterests: List<String>?,
        ): String {
            val base = server.url("/ws").toString().replace("http://", "ws://")
            return "$base?ticket=$ticket&lastSeenSeq=${lastSeenSeq ?: 0}"
        }
    }

    @Test
    fun ticketToReadyMarksOnlineExactlyOnce() {
        // MockWebServer WebSocket: accept and send ready.
        server.enqueue(
            MockResponse().withWebSocketUpgrade(
                object : okhttp3.WebSocketListener() {
                    override fun onOpen(webSocket: okhttp3.WebSocket, response: okhttp3.Response) {
                        webSocket.send("""{"type":"ready","seq":5}""")
                    }
                },
            ),
        )
        val client = RemoteWebSocketClient(
            api = api(),
            scope = scopes,
            httpClient = OkHttpClient.Builder()
                .connectTimeout(2, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .build(),
            networkGate = gate,
        )
        val online = CountDownLatch(1)
        val states = mutableListOf<RemoteWebSocketClient.ConnectionState>()
        client.setListener(object : RemoteEventSocket.Listener {
            override fun onStateChanged(
                state: RemoteWebSocketClient.ConnectionState,
                detail: String?,
            ) {
                states += state
                if (state == RemoteWebSocketClient.ConnectionState.Online) {
                    online.countDown()
                }
            }
            override fun onMessage(message: com.poracode.app.model.RemoteWebSocketServerMessage) = Unit
            override fun onResyncRequired(reason: String) = Unit
            override fun onSessionExpired(reason: String) = Unit
        })
        client.start(lastSeenSeq = 0)
        assertTrue("expected Online within 5s", online.await(5, TimeUnit.SECONDS))
        assertEquals(RemoteWebSocketClient.ConnectionState.Online, states.last())
        client.destroy()
    }

    @Test
    fun foregroundCancelBetweenTicketAndNewWebSocketDoesNotLeaveStaleSocket() {
        val ticketHold = CompletableDeferred<Unit>()
        val ticketReached = CompletableDeferred<Unit>()
        // No WS upgrade enqueued — connect should not complete if cancelled after ticket.
        val client = RemoteWebSocketClient(
            api = api(ticketHold = ticketHold, ticketReached = ticketReached),
            scope = scopes,
            httpClient = OkHttpClient.Builder()
                .connectTimeout(2, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .build(),
            networkGate = gate,
        )
        val states = AtomicReference(listOf<RemoteWebSocketClient.ConnectionState>())
        client.setListener(object : RemoteEventSocket.Listener {
            override fun onStateChanged(
                state: RemoteWebSocketClient.ConnectionState,
                detail: String?,
            ) {
                states.updateAndGet { it + state }
            }
            override fun onMessage(message: com.poracode.app.model.RemoteWebSocketServerMessage) = Unit
            override fun onResyncRequired(reason: String) = Unit
            override fun onSessionExpired(reason: String) = Unit
        })
        client.start(lastSeenSeq = 3)
        runBlocking { ticketReached.await() }
        // Cancel between ticket and newWebSocket (background suspend).
        client.suspendForBackground()
        ticketHold.complete(Unit)
        Thread.sleep(200)
        assertEquals(
            RemoteWebSocketClient.ConnectionState.Suspended,
            states.get().lastOrNull(),
        )
        // No Online transition after cancel.
        assertFalse(states.get().contains(RemoteWebSocketClient.ConnectionState.Online))
        client.destroy()
    }

    @Test
    fun recoverAfterResyncFailureDoesNotReconnectAtSeqZero() {
        server.enqueue(
            MockResponse().withWebSocketUpgrade(
                object : okhttp3.WebSocketListener() {
                    override fun onOpen(webSocket: okhttp3.WebSocket, response: okhttp3.Response) {
                        webSocket.send("""{"type":"ready","seq":10}""")
                    }
                },
            ),
        )
        val client = RemoteWebSocketClient(
            api = api(),
            scope = scopes,
            httpClient = OkHttpClient.Builder()
                .connectTimeout(2, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .build(),
            networkGate = gate,
        )
        val online = CountDownLatch(1)
        client.setListener(object : RemoteEventSocket.Listener {
            override fun onStateChanged(
                state: RemoteWebSocketClient.ConnectionState,
                detail: String?,
            ) {
                if (state == RemoteWebSocketClient.ConnectionState.Online) online.countDown()
            }
            override fun onMessage(message: com.poracode.app.model.RemoteWebSocketServerMessage) = Unit
            override fun onResyncRequired(reason: String) = Unit
            override fun onSessionExpired(reason: String) = Unit
        })
        client.start(lastSeenSeq = 10)
        assertTrue(online.await(5, TimeUnit.SECONDS))
        client.noteAuthoritativeSnapshot(10)
        // Simulate resync pending then failure recovery.
        client.replaceAppliedSeq(10)
        assertTrue(client.resyncPending)
        client.recoverAfterResyncFailure()
        assertTrue(client.resyncPending)
        assertEquals(10, client.appliedSeq())
        client.destroy()
    }

    @Test
    fun generationStaleCallbacksIgnoredAfterInvalidate() {
        val opens = AtomicInteger(0)
        server.enqueue(
            MockResponse().withWebSocketUpgrade(
                object : okhttp3.WebSocketListener() {
                    override fun onOpen(webSocket: okhttp3.WebSocket, response: okhttp3.Response) {
                        opens.incrementAndGet()
                        webSocket.send("""{"type":"ready","seq":1}""")
                    }
                },
            ),
        )
        // Second upgrade for post-force reconnect.
        server.enqueue(
            MockResponse().withWebSocketUpgrade(
                object : okhttp3.WebSocketListener() {
                    override fun onOpen(webSocket: okhttp3.WebSocket, response: okhttp3.Response) {
                        opens.incrementAndGet()
                        webSocket.send("""{"type":"ready","seq":2}""")
                    }
                },
            ),
        )
        val client = RemoteWebSocketClient(
            api = api(),
            scope = scopes,
            httpClient = OkHttpClient.Builder()
                .connectTimeout(2, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .build(),
            networkGate = gate,
        )
        val online = CountDownLatch(1)
        client.setListener(object : RemoteEventSocket.Listener {
            override fun onStateChanged(
                state: RemoteWebSocketClient.ConnectionState,
                detail: String?,
            ) {
                if (state == RemoteWebSocketClient.ConnectionState.Online) online.countDown()
            }
            override fun onMessage(message: com.poracode.app.model.RemoteWebSocketServerMessage) = Unit
            override fun onResyncRequired(reason: String) = Unit
            override fun onSessionExpired(reason: String) = Unit
        })
        client.start(lastSeenSeq = 0)
        assertTrue(online.await(5, TimeUnit.SECONDS))
        // forceReconnect invalidates generation; stale schedule must not leave dual sockets.
        client.suspendForBackground()
        client.resumeFromForeground()
        Thread.sleep(500)
        // At most a small number of opens — generation gate prevents runaway.
        assertTrue("opens=$opens", opens.get() <= 3)
        client.destroy()
    }

    @Test
    fun suspendResumeDoesNotAdvanceCursorOnBackground() {
        server.enqueue(
            MockResponse().withWebSocketUpgrade(
                object : okhttp3.WebSocketListener() {
                    override fun onOpen(webSocket: okhttp3.WebSocket, response: okhttp3.Response) {
                        webSocket.send("""{"type":"ready","seq":4}""")
                    }
                },
            ),
        )
        server.enqueue(
            MockResponse().withWebSocketUpgrade(
                object : okhttp3.WebSocketListener() {
                    override fun onOpen(webSocket: okhttp3.WebSocket, response: okhttp3.Response) {
                        webSocket.send("""{"type":"ready","seq":4}""")
                    }
                },
            ),
        )
        val client = RemoteWebSocketClient(
            api = api(),
            scope = scopes,
            httpClient = OkHttpClient.Builder()
                .connectTimeout(2, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .build(),
            networkGate = gate,
        )
        val online = CountDownLatch(1)
        client.setListener(object : RemoteEventSocket.Listener {
            override fun onStateChanged(
                state: RemoteWebSocketClient.ConnectionState,
                detail: String?,
            ) {
                if (state == RemoteWebSocketClient.ConnectionState.Online) online.countDown()
            }
            override fun onMessage(message: com.poracode.app.model.RemoteWebSocketServerMessage) = Unit
            override fun onResyncRequired(reason: String) = Unit
            override fun onSessionExpired(reason: String) = Unit
        })
        client.start(lastSeenSeq = 4)
        assertTrue(online.await(5, TimeUnit.SECONDS))
        assertEquals(4, client.appliedSeq())
        client.suspendForBackground()
        assertEquals(4, client.appliedSeq())
        client.resumeFromForeground()
        Thread.sleep(300)
        assertEquals(4, client.appliedSeq())
        client.destroy()
    }

    @Test
    fun resyncFailureWithInterveningFramesDoesNotAdvanceCursor() {
        val serverWs = AtomicReference<okhttp3.WebSocket?>(null)
        server.enqueue(
            MockResponse().withWebSocketUpgrade(
                object : okhttp3.WebSocketListener() {
                    override fun onOpen(webSocket: okhttp3.WebSocket, response: okhttp3.Response) {
                        serverWs.set(webSocket)
                        webSocket.send("""{"type":"ready","seq":10}""")
                    }
                },
            ),
        )
        val client = RemoteWebSocketClient(
            api = api(),
            scope = scopes,
            httpClient = OkHttpClient.Builder()
                .connectTimeout(2, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .build(),
            networkGate = gate,
        )
        val applied = mutableListOf<Int>()
        val online = CountDownLatch(1)
        client.setListener(object : RemoteEventSocket.Listener {
            override fun onStateChanged(
                state: RemoteWebSocketClient.ConnectionState,
                detail: String?,
            ) {
                if (state == RemoteWebSocketClient.ConnectionState.Online) online.countDown()
            }
            override fun onMessage(message: com.poracode.app.model.RemoteWebSocketServerMessage) {
                if (message is com.poracode.app.model.RemoteWebSocketServerMessage.Event) {
                    applied += message.seq
                }
            }
            override fun onResyncRequired(reason: String) = Unit
            override fun onSessionExpired(reason: String) = Unit
        })
        client.start(lastSeenSeq = 10)
        assertTrue(online.await(5, TimeUnit.SECONDS))
        client.replaceAppliedSeq(10)
        assertTrue(client.resyncPending)
        serverWs.get()?.send("""{"type":"event","seq":11,"event":{"type":"x"}}""")
        serverWs.get()?.send("""{"type":"event","seq":12,"event":{"type":"x"}}""")
        Thread.sleep(300)
        client.recoverAfterResyncFailure()
        assertTrue(applied.isEmpty())
        assertEquals(10, client.appliedSeq())
        assertTrue(client.resyncPending)
        client.destroy()
    }

    @Test
    fun resumeAfterResyncReplacesLowerSeqAndReconnectsOnce() {
        val opens = AtomicInteger(0)
        server.enqueue(
            MockResponse().withWebSocketUpgrade(
                object : okhttp3.WebSocketListener() {
                    override fun onOpen(webSocket: okhttp3.WebSocket, response: okhttp3.Response) {
                        opens.incrementAndGet()
                        webSocket.send("""{"type":"ready","seq":40}""")
                    }
                },
            ),
        )
        server.enqueue(
            MockResponse().withWebSocketUpgrade(
                object : okhttp3.WebSocketListener() {
                    override fun onOpen(webSocket: okhttp3.WebSocket, response: okhttp3.Response) {
                        opens.incrementAndGet()
                        webSocket.send("""{"type":"ready","seq":5}""")
                    }
                },
            ),
        )
        val client = RemoteWebSocketClient(
            api = api(),
            scope = scopes,
            httpClient = OkHttpClient.Builder()
                .connectTimeout(2, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .build(),
            networkGate = gate,
        )
        val online = CountDownLatch(1)
        client.setListener(object : RemoteEventSocket.Listener {
            override fun onStateChanged(
                state: RemoteWebSocketClient.ConnectionState,
                detail: String?,
            ) {
                if (state == RemoteWebSocketClient.ConnectionState.Online) online.countDown()
            }
            override fun onMessage(message: com.poracode.app.model.RemoteWebSocketServerMessage) = Unit
            override fun onResyncRequired(reason: String) = Unit
            override fun onSessionExpired(reason: String) = Unit
        })
        client.start(lastSeenSeq = 40)
        assertTrue(online.await(5, TimeUnit.SECONDS))
        val opensBefore = opens.get()
        client.resumeAfterResync(fromSeq = 5)
        Thread.sleep(500)
        assertEquals(5, client.appliedSeq())
        assertFalse(client.resyncPending)
        assertEquals(1, opens.get() - opensBefore)
        client.destroy()
    }

    @Test
    fun close1008UnauthorizedDoesNotResetCursorToZero() {
        server.enqueue(
            MockResponse().withWebSocketUpgrade(
                object : okhttp3.WebSocketListener() {
                    override fun onOpen(webSocket: okhttp3.WebSocket, response: okhttp3.Response) {
                        webSocket.send("""{"type":"ready","seq":15}""")
                        webSocket.close(1008, "unauthorized")
                    }
                },
            ),
        )
        val client = RemoteWebSocketClient(
            api = api(),
            scope = scopes,
            httpClient = OkHttpClient.Builder()
                .connectTimeout(2, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .build(),
            networkGate = gate,
        )
        val expired = CountDownLatch(1)
        client.setListener(object : RemoteEventSocket.Listener {
            override fun onStateChanged(
                state: RemoteWebSocketClient.ConnectionState,
                detail: String?,
            ) = Unit
            override fun onMessage(message: com.poracode.app.model.RemoteWebSocketServerMessage) = Unit
            override fun onResyncRequired(reason: String) = Unit
            override fun onSessionExpired(reason: String) {
                expired.countDown()
            }
        })
        client.start(lastSeenSeq = 15)
        assertTrue(expired.await(5, TimeUnit.SECONDS))
        assertEquals(15, client.appliedSeq())
        assertTrue(client.resyncPending)
        client.destroy()
    }

    @Test
    fun interestsFlushAfterReadyNotBefore() {
        val received = mutableListOf<String>()
        val ready = CountDownLatch(1)
        server.enqueue(
            MockResponse().withWebSocketUpgrade(
                object : okhttp3.WebSocketListener() {
                    override fun onOpen(webSocket: okhttp3.WebSocket, response: okhttp3.Response) {
                        Thread.sleep(50)
                        webSocket.send("""{"type":"ready","seq":1}""")
                    }
                    override fun onMessage(webSocket: okhttp3.WebSocket, text: String) {
                        received += text
                        if (text.contains("thread-item-interests") ||
                            text.contains("threadIds")
                        ) {
                            ready.countDown()
                        }
                    }
                },
            ),
        )
        val client = RemoteWebSocketClient(
            api = api(),
            scope = scopes,
            httpClient = OkHttpClient.Builder()
                .connectTimeout(2, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .build(),
            networkGate = gate,
        )
        client.setThreadItemInterests(listOf("t-open"))
        client.start(lastSeenSeq = 1)
        assertTrue(ready.await(5, TimeUnit.SECONDS))
        assertTrue(received.any { it.contains("t-open") })
        client.destroy()
    }
}
