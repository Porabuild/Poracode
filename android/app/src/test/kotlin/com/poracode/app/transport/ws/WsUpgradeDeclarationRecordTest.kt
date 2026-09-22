package com.poracode.app.transport.ws

import com.poracode.app.model.RemoteRuntimeGapAck
import com.poracode.app.model.RemoteRuntimeGapRead
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.transport.ForegroundNetworkGate
import com.poracode.app.transport.RemoteApiClient
import com.poracode.app.transport.RemoteApiGateway
import com.poracode.app.transport.RemoteHistoryNoticeGateway
import com.poracode.app.transport.RemoteWebSocketClient
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

/**
 * `upgradeDeclaredNotices` is the declaration of the upgrade the host
 * **actually received**, not a second sample of the mutable capability flag the
 * URL was built from.
 *
 * The final review's Finding 1 (`android-negotiation-final-review.md` §2) proved
 * statically that `WsConnectionLoop.connect` built the URL from one read of a
 * `@Volatile` flag and then recorded the declaration from a second read: an
 * `environment()` answer completing between the two reads made a URL without
 * `notices=v1` be recorded as declared, skipping the Online reconcile and
 * leaving the socket incapable for its life.
 *
 * These regressions pin that boundary deterministically. [BoundaryApi] drives
 * the **real** [RemoteApiClient] URL builder (real `notices=v1` composition and
 * okhttp `ws:` normalization) but flips the capability flag exactly at the
 * URL-return boundary, so the "URL sample" and the "record sample" are one
 * deterministic interleaving instead of a sub-millisecond race. Every case
 * asserts against the upgrade request [MockWebServer] actually recorded, the
 * same source of truth the host sees.
 */
class WsUpgradeDeclarationRecordTest {
    private lateinit var server: MockWebServer
    private lateinit var gate: ForegroundNetworkGate
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val upgrades = CopyOnWriteArrayList<String>()

    @Before
    fun setUp() {
        server = MockWebServer()
        server.dispatcher = dispatcher()
        server.start()
        gate = ForegroundNetworkGate()
        gate.openForForeground()
    }

    @After
    fun tearDown() {
        gate.closeAndCancelAll()
        runCatching { server.shutdown() }
        scope.cancel()
    }

    // --- 1. undeclared URL, flag rising at the URL-return boundary ---

    @Test
    fun undeclaredBuiltUrlWinsWhenTheCapabilityFlagRisesBeforeTheRecord() = runBlocking {
        val boundary = BoundaryApi(api())
        boundary.declaredAtBuild = false
        // The in-flight environment() answer lands exactly here: the URL is
        // already built undeclared while the flag is true for the record read.
        boundary.declaredAfterBuild = true
        val socket = client(boundary)

        socket.start(lastSeenSeq = null)
        awaitUpgradeCount(1)
        awaitCondition { socket.upgradeDeclaredNotices != null }

        val sent = upgrades.single()
        assertEquals(
            "the host received exactly the URL this attempt built",
            boundary.returnedUrls.single().contains("notices=v1"),
            sent.contains("notices=v1"),
        )
        assertFalse(
            "the upgrade the host received must stay undeclared: $sent",
            sent.contains("notices=v1"),
        )
        assertTrue(
            "the mismatch mechanism is live: the flag did rise at the boundary",
            boundary.runtimeHistoryNoticesSupported,
        )
        assertEquals(
            "the record must equal the sent URL, not the mutable flag",
            sent.contains("notices=v1"),
            socket.upgradeDeclaredNotices,
        )
        assertEquals(false, socket.upgradeDeclaredNotices)
        socket.stop()
    }

    // --- 2. declared URL, flag falling at the URL-return boundary ---

    @Test
    fun declaredBuiltUrlWinsWhenTheCapabilityFlagFallsBeforeTheRecord() = runBlocking {
        val boundary = BoundaryApi(api())
        boundary.declaredAtBuild = true
        boundary.declaredAfterBuild = false
        val socket = client(boundary)

        socket.start(lastSeenSeq = null)
        awaitUpgradeCount(1)
        awaitCondition { socket.upgradeDeclaredNotices != null }

        val sent = upgrades.single()
        assertEquals(
            "the host received exactly the URL this attempt built",
            boundary.returnedUrls.single().contains("notices=v1"),
            sent.contains("notices=v1"),
        )
        assertTrue(
            "the upgrade the host received declared: $sent",
            sent.contains("notices=v1"),
        )
        assertFalse(
            "the mismatch mechanism is live: the flag did fall at the boundary",
            boundary.runtimeHistoryNoticesSupported,
        )
        assertEquals(
            "the record must equal the sent URL, not the mutable flag",
            sent.contains("notices=v1"),
            socket.upgradeDeclaredNotices,
        )
        assertEquals(true, socket.upgradeDeclaredNotices)
        socket.stop()
    }

    // --- 3. malformed / non-v1 values must not declare ---

    @Test
    fun nonV1NoticeQueryValuesNeverRecordADeclaration() = runBlocking {
        val cases = listOf("notices=v2", "notices=", "notices=V1")
        cases.forEachIndexed { index, replacement ->
            val boundary = BoundaryApi(api())
            boundary.declaredAtBuild = true
            boundary.declaredAfterBuild = true
            boundary.rewriteUrl = { url -> url.replace("notices=v1", replacement) }
            val socket = client(boundary)

            socket.start(lastSeenSeq = null)
            awaitUpgradeCount(index + 1)
            awaitCondition { socket.upgradeDeclaredNotices != null }

            val sent = upgrades[index]
            assertEquals(
                "the host received exactly the URL this attempt built: $sent",
                boundary.returnedUrls.single().contains(replacement),
                sent.contains(replacement),
            )
            assertTrue(
                "the host must receive the mismatched query value: $sent",
                sent.contains(replacement),
            )
            assertFalse(
                "'$replacement' is not the v1 declaration: $sent",
                sent.contains("notices=v1"),
            )
            assertTrue(
                "the capability flag is true while the URL is not v1 (mismatch live)",
                boundary.runtimeHistoryNoticesSupported,
            )
            assertEquals(
                "the record must not declare on '$replacement': $sent",
                false,
                socket.upgradeDeclaredNotices,
            )
            socket.stop()
        }
    }

    // --- harness ---

    /**
     * Real [RemoteApiClient] delegates for every gateway member; only the
     * URL-return boundary is controllable. [declaredAtBuild] is the single
     * sample the URL composes its `notices=v1` from; [declaredAfterBuild] is
     * what the mutable flag reports when the loop reads it immediately after
     * the URL is returned. [rewriteUrl] injects a malformed query value.
     */
    private class BoundaryApi(private val delegate: RemoteApiClient) :
        RemoteApiGateway by delegate,
        RemoteHistoryNoticeGateway {
        @Volatile
        var declaredAtBuild: Boolean = false

        @Volatile
        var declaredAfterBuild: Boolean = false

        @Volatile
        var rewriteUrl: ((String) -> String)? = null

        val returnedUrls = CopyOnWriteArrayList<String>()

        override fun websocketUrl(
            ticket: String,
            lastSeenSeq: Int?,
            threadItemInterests: List<String>?,
        ): String {
            delegate.declareRuntimeHistoryNotices(declaredAtBuild)
            var url = delegate.websocketUrl(ticket, lastSeenSeq, threadItemInterests)
            delegate.declareRuntimeHistoryNotices(declaredAfterBuild)
            rewriteUrl?.let { url = it(url) }
            returnedUrls += url
            return url
        }

        override val runtimeHistoryNoticesSupported: Boolean
            get() = delegate.runtimeHistoryNoticesSupported

        override suspend fun threadRuntimeGap(threadId: String): RemoteRuntimeGapRead =
            delegate.threadRuntimeGap(threadId)

        override suspend fun acknowledgeThreadRuntimeGap(
            threadId: String,
            episodeToken: String,
            commandId: String,
        ): RemoteRuntimeGapAck =
            delegate.acknowledgeThreadRuntimeGap(threadId, episodeToken, commandId)
    }

    private fun api(): RemoteApiClient = RemoteApiClient(
        endpoint = server.url("/").toString().trimEnd('/'),
        accessToken = "access-secret",
        client = OkHttpClient.Builder()
            .followRedirects(false)
            .followSslRedirects(false)
            .build(),
        networkGate = gate,
    )

    private fun client(api: RemoteApiGateway): RemoteWebSocketClient = RemoteWebSocketClient(
        api = api,
        scope = scope,
        endpoint = null,
        httpClient = OkHttpClient.Builder()
            .connectTimeout(5, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .build(),
        networkGate = gate,
    )

    private fun dispatcher(): Dispatcher = object : Dispatcher() {
        override fun dispatch(request: RecordedRequest): MockResponse {
            val path = request.requestUrl?.encodedPath ?: return notFound()
            return when (path) {
                ProtocolConstants.WEBSOCKET_TICKET_PATH -> json(
                    """{"ticket":"ticket-${upgrades.size + 1}","expiresAt":"2099-01-01T00:00:00.000Z"}""",
                )
                ProtocolConstants.WEBSOCKET_PATH -> {
                    upgrades += requireNotNull(request.requestUrl).toString()
                    MockResponse().withWebSocketUpgrade(
                        object : WebSocketListener() {
                            override fun onOpen(webSocket: WebSocket, response: Response) {
                                webSocket.send("""{"type":"ready","seq":1}""")
                            }
                        },
                    )
                }
                else -> notFound()
            }
        }
    }

    private suspend fun awaitUpgradeCount(target: Int, timeoutMs: Long = 15_000) {
        val met = withTimeoutOrNull(timeoutMs) {
            while (upgrades.size < target) delay(10)
            true
        }
        if (met != true) {
            fail("expected $target upgrade(s) within ${timeoutMs}ms, saw ${upgrades.size}: $upgrades")
        }
    }

    private suspend fun awaitCondition(timeoutMs: Long = 15_000, condition: () -> Boolean) {
        val met = withTimeoutOrNull(timeoutMs) {
            while (!condition()) delay(10)
            true
        }
        if (met != true) fail("condition not met within ${timeoutMs}ms: ${condition}")
    }

    private fun json(body: String): MockResponse = MockResponse()
        .setResponseCode(200)
        .setHeader("Content-Type", "application/json")
        .setBody(body)

    private fun notFound(): MockResponse = MockResponse()
        .setResponseCode(404)
        .setHeader("Content-Type", "application/json")
        .setBody("""{"error":{"code":"not_found","message":"no route"}}""")
}
