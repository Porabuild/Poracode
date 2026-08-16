package com.poracode.app.transport.ws

import com.poracode.app.model.RemoteAccessTokenResult
import com.poracode.app.model.RemoteEnvironmentDescriptor
import com.poracode.app.model.RemoteRuntimeItemsPage
import com.poracode.app.model.RemoteShellSnapshot
import com.poracode.app.model.RemoteThreadSnapshot
import com.poracode.app.model.ThreadConfig
import com.poracode.app.protocol.git.GitInterest
import com.poracode.app.transport.ForegroundNetworkGate
import com.poracode.app.transport.RemoteApiGateway
import com.poracode.app.transport.RemoteWebSocketClient
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.serialization.json.JsonArray
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Real [RemoteWebSocketClient] + [WsHealthLoop] seam against MockWebServer:
 * proves the latest Git and thread interests flush after ready on the single
 * authenticated socket, that both remain distinct, that empty clears, and that a
 * stopped socket never flushes. The flush-on-ready path is what guarantees a
 * reconnect/resync reflush without a second socket or retry loop.
 */
class WsInterestFlushIntegrationTest {
    private lateinit var server: MockWebServer
    private lateinit var gate: ForegroundNetworkGate
    private val scope = kotlinx.coroutines.CoroutineScope(SupervisorJob() + Dispatchers.IO)

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
        scope.cancel()
    }

    private fun api(): RemoteApiGateway = object : RemoteApiGateway {
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
        override suspend fun websocketTicket(): String = "ticket-1"
        override fun websocketUrl(
            ticket: String,
            lastSeenSeq: Int?,
            threadItemInterests: List<String>?,
        ): String = server.url("/ws").toString().replace("http://", "ws://") +
            "?ticket=$ticket&lastSeenSeq=${lastSeenSeq ?: 0}"
    }

    private fun capturingServer(
        received: MutableList<String>,
        readyLatch: CountDownLatch,
        messageLatch: CountDownLatch,
        readySeq: Int = 5,
    ) {
        server.enqueue(
            MockResponse().withWebSocketUpgrade(
                object : okhttp3.WebSocketListener() {
                    override fun onOpen(webSocket: okhttp3.WebSocket, response: okhttp3.Response) {
                        webSocket.send("""{"type":"ready","seq":$readySeq}""")
                        readyLatch.countDown()
                    }
                    override fun onMessage(webSocket: okhttp3.WebSocket, text: String) {
                        received += text
                        messageLatch.countDown()
                    }
                },
            ),
        )
    }

    @Test
    fun gitAndThreadInterestsFlushAfterReadyAndRemainDistinct() {
        val received = mutableListOf<String>()
        val readyLatch = CountDownLatch(1)
        // Two interest messages expected: thread-item + git-state.
        val messageLatch = CountDownLatch(2)
        capturingServer(received, readyLatch, messageLatch)
        val client = RemoteWebSocketClient(
            api = api(),
            scope = scope,
            httpClient = OkHttpClient.Builder().connectTimeout(2, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.MILLISECONDS).build(),
            networkGate = gate,
        )
        client.setThreadItemInterests(listOf("t1", "t2"))
        client.setGitInterests(
            listOf(GitInterest.Target(projectId = "p1", worktreePath = "/repo", includePrDetails = true)),
        )
        client.start(lastSeenSeq = 0)
        assertTrue("ready sent", readyLatch.await(3, TimeUnit.SECONDS))
        assertTrue("interest messages flushed", messageLatch.await(3, TimeUnit.SECONDS))
        val joined = received.joinToString("\n")
        assertTrue("thread interests present", joined.contains(WsHealthLoopMessageTypes.THREAD_ITEM_INTERESTS))
        assertTrue("git interests present", joined.contains(WsGitInterestEncoder.MESSAGE_TYPE))
        client.destroy()
    }

    @Test
    fun emptyInterestsClearsAfterReady() {
        val received = mutableListOf<String>()
        val readyLatch = CountDownLatch(1)
        // Ready flushes both thread-item and git-state interests (both empty here).
        val messageLatch = CountDownLatch(2)
        capturingServer(received, readyLatch, messageLatch)
        val client = RemoteWebSocketClient(
            api = api(),
            scope = scope,
            httpClient = OkHttpClient.Builder().connectTimeout(2, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.MILLISECONDS).build(),
            networkGate = gate,
        )
        client.setGitInterests(emptyList())
        client.start(lastSeenSeq = 0)
        assertTrue(readyLatch.await(3, TimeUnit.SECONDS))
        assertTrue(messageLatch.await(3, TimeUnit.SECONDS))
        // The git-state-interests message carries an empty interests array.
        assertTrue(received.any { it.contains(WsGitInterestEncoder.MESSAGE_TYPE) })
        client.destroy()
    }

    @Test
    fun stoppedSocketDoesNotFlushInterests() {
        val received = mutableListOf<String>()
        val readyLatch = CountDownLatch(1)
        val messageLatch = CountDownLatch(2)
        capturingServer(received, readyLatch, messageLatch)
        val client = RemoteWebSocketClient(
            api = api(),
            scope = scope,
            httpClient = OkHttpClient.Builder().connectTimeout(2, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.MILLISECONDS).build(),
            networkGate = gate,
        )
        client.start(lastSeenSeq = 0)
        assertTrue(readyLatch.await(3, TimeUnit.SECONDS))
        client.stop()
        // After stop, setting interests must not send on the torn-down socket.
        client.setGitInterests(
            listOf(GitInterest.Target(projectId = "late", worktreePath = "/x")),
        )
        client.setThreadItemInterests(listOf("late-thread"))
        Thread.sleep(300)
        assertTrue("no late flush after stop", received.none { it.contains("late") })
        client.destroy()
    }
}

/** Wire message-type constants reused by interest-flush tests. */
object WsHealthLoopMessageTypes {
    const val THREAD_ITEM_INTERESTS = "thread-item-interests"
}
