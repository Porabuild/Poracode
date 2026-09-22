package com.poracode.app.session.richchat

import com.poracode.app.chat.RichCompletedTurn
import com.poracode.app.chat.RichRuntimeEvent
import com.poracode.app.chat.RichThreadKey
import com.poracode.app.chat.RichThreadState
import com.poracode.app.model.ThreadConfig
import com.poracode.app.transport.RemoteApiClient
import com.poracode.app.transport.richchat.GeneratedRichChatRemoteTransport
import java.util.concurrent.CopyOnWriteArrayList
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * `ct1.` older completed turns through the real load-older UI action
 * (`runtime.chat.loadOlder()`), which `RichTimelineView` invokes on scroll and
 * on the "Load older messages" tap. Covers the >500-turn lossless walk, the
 * anchorless/no-runtime-item shape, terminal continuations, and the epoch
 * fences for truncate / authoritative reset / host switch (held stale pages).
 */
class RichChatOlderTurnsTest {

    // --- controller-level (programmable gateway) ---

    @Test
    fun uiLoadOlderWalksEveryCt1PageLosslessly() = runTest {
        val gateway = FakeRichChatSessionGateway()
        val controller = RichChatController(MutableStateFlow<RichChatHostLease?>(richLease()), gateway)
        gateway.olderHandler = { _, _, _ -> RichChatHistoryPage(emptyList(), null) }
        gateway.olderTurnsHandler = { _, _, cursor ->
            when (cursor) {
                "ct1.320" -> RichChatTurnsPage(turnRange(120, 320), "ct1.120")
                "ct1.120" -> RichChatTurnsPage(turnRange(0, 120), null)
                else -> error("unexpected cursor $cursor")
            }
        }
        controller.selectThread("thread-a")
        assertTrue(
            controller.installAuthoritativeSnapshot(
                controller.selection.value!!,
                olderTurnsSnapshot(turns = turnRange(320, 520), turnsCursor = "ct1.320"),
            ),
        )
        assertEquals(200, controller.state.value.transcript!!.completedTurns.size)
        assertEquals("ct1.320", controller.state.value.olderTurnsCursor)

        assertTrue(controller.loadOlder() is RichChatOperationResult.Success)
        assertEquals(400, controller.state.value.transcript!!.completedTurns.size)
        assertTrue(controller.loadOlder() is RichChatOperationResult.Success)
        val turns = controller.state.value.transcript!!.completedTurns
        assertEquals(520, turns.size)
        assertNull(controller.state.value.olderTurnsCursor)

        val keys = turns.map { it.startedAtEpochMs to it.endedAtEpochMs }
        assertEquals(keys.size, keys.toSet().size)
        assertEquals(keys.sortedWith(compareBy({ it.first }, { it.second })), keys)
        assertTrue("anchorless turns survive", turns.any { it.anchorItemId == null })

        // Exhausted: no further gateway call and no cursor move.
        assertEquals(2, gateway.calls.count { it == "older-turns" })
        assertTrue(controller.loadOlder() is RichChatOperationResult.Success)
        assertEquals(2, gateway.calls.count { it == "older-turns" })
    }

    @Test
    fun emptyRuntimeItemsWithAnchorlessTurnsStillPagesFromTheTimeline() = runTest {
        val gateway = FakeRichChatSessionGateway()
        val controller = RichChatController(MutableStateFlow<RichChatHostLease?>(richLease()), gateway)
        gateway.olderHandler = { _, _, _ -> RichChatHistoryPage(emptyList(), null) }
        gateway.olderTurnsHandler = { _, _, _ ->
            RichChatTurnsPage(turnRange(120, 320, anchorless = true), null)
        }
        controller.selectThread("thread-a")
        assertTrue(
            controller.installAuthoritativeSnapshot(
                controller.selection.value!!,
                olderTurnsSnapshot(
                    items = emptyList(),
                    turns = turnRange(320, 520, anchorless = true),
                    turnsCursor = "ct1.320",
                ),
            ),
        )
        // Not Empty: the timeline (and its load-older affordance) must render.
        assertEquals(RichChatLoadPhase.Loaded, controller.state.value.loadPhase)

        assertTrue(controller.loadOlder() is RichChatOperationResult.Success)
        assertEquals(400, controller.state.value.transcript!!.completedTurns.size)
        assertTrue(controller.state.value.transcript!!.completedTurns.all { it.anchorItemId == null })
        assertNull(controller.state.value.olderTurnsCursor)
    }

    @Test
    fun routeUnavailableEndsTheTurnWalkWithoutFailure() = runTest {
        val gateway = FakeRichChatSessionGateway()
        val controller = RichChatController(MutableStateFlow<RichChatHostLease?>(richLease()), gateway)
        gateway.olderTurnsHandler = { _, _, _ ->
            throw RichChatGatewayException(404, "route_unavailable", false)
        }
        controller.selectThread("thread-a")
        controller.installAuthoritativeSnapshot(
            controller.selection.value!!,
            olderTurnsSnapshot(turns = turnRange(320, 520), turnsCursor = "ct1.320"),
        )

        assertTrue(controller.loadOlder() is RichChatOperationResult.Success)
        assertNull(controller.state.value.olderTurnsCursor)
        assertNull(controller.state.value.failure)
    }

    @Test
    fun invalidThreadCursorEndsTheTurnWalkWithoutFailure() = runTest {
        val gateway = FakeRichChatSessionGateway()
        val controller = RichChatController(MutableStateFlow<RichChatHostLease?>(richLease()), gateway)
        gateway.olderTurnsHandler = { _, _, _ ->
            throw RichChatGatewayException(400, "invalid_thread_cursor", false)
        }
        controller.selectThread("thread-a")
        controller.installAuthoritativeSnapshot(
            controller.selection.value!!,
            olderTurnsSnapshot(turns = turnRange(320, 520), turnsCursor = "ct1.320"),
        )

        assertTrue(controller.loadOlder() is RichChatOperationResult.Success)
        assertNull(controller.state.value.olderTurnsCursor)
        assertNull(controller.state.value.failure)
    }

    @Test
    fun truncateDropsTheTurnCursorAndFencesAHeldOlderPage() = runTest {
        val gateway = FakeRichChatSessionGateway()
        val controller = RichChatController(MutableStateFlow<RichChatHostLease?>(richLease()), gateway)
        val held = CompletableDeferred<RichChatTurnsPage>()
        gateway.olderTurnsHandler = { _, _, _ -> held.await() }
        controller.selectThread("thread-a")
        controller.installAuthoritativeSnapshot(
            controller.selection.value!!,
            olderTurnsSnapshot(turns = turnRange(320, 520), turnsCursor = "ct1.320"),
        )

        val pending = async { controller.loadOlder() }
        runCurrent()
        assertTrue(controller.truncate("item-x") is RichChatOperationResult.Success)
        held.complete(RichChatTurnsPage(turnRange(120, 320), "ct1.120"))
        val result = pending.await()

        assertTrue("a pre-truncate page must not publish", result is RichChatOperationResult.Stale)
        assertEquals(200, controller.state.value.transcript!!.completedTurns.size)
        assertNull(controller.state.value.olderTurnsCursor)
        assertTrue("truncate asks for the authoritative cursor repair", controller.state.value.needsAuthoritativeRefresh)
        assertFalse(controller.state.value.loadingOlder)
    }

    @Test
    fun authoritativeRefreshFencesAHeldOlderPageAndInstallsTheFreshCursor() = runTest {
        val gateway = FakeRichChatSessionGateway()
        val controller = RichChatController(MutableStateFlow<RichChatHostLease?>(richLease()), gateway)
        val held = CompletableDeferred<RichChatTurnsPage>()
        gateway.olderTurnsHandler = { _, _, _ -> held.await() }
        controller.selectThread("thread-a")
        controller.installAuthoritativeSnapshot(
            controller.selection.value!!,
            olderTurnsSnapshot(turns = turnRange(320, 520), turnsCursor = "ct1.320"),
        )

        val pending = async { controller.loadOlder() }
        runCurrent()
        assertTrue(
            controller.installAuthoritativeSnapshot(
                controller.selection.value!!,
                olderTurnsSnapshot(
                    seq = 2,
                    turns = turnRange(300, 520),
                    turnsCursor = "ct1.300",
                ),
            ),
        )
        held.complete(RichChatTurnsPage(turnRange(120, 320), "ct1.120"))
        val result = pending.await()

        assertTrue(result is RichChatOperationResult.Stale)
        assertEquals("ct1.300", controller.state.value.olderTurnsCursor)
        assertEquals("the fresh tail replaces the tail level", 220, controller.state.value.transcript!!.completedTurns.size)
        assertFalse(controller.state.value.loadingOlder)
    }

    @Test
    fun selectionChangeFencesAHeldOlderPage() = runTest {
        val gateway = FakeRichChatSessionGateway()
        val controller = RichChatController(MutableStateFlow<RichChatHostLease?>(richLease()), gateway)
        val held = CompletableDeferred<RichChatTurnsPage>()
        gateway.olderTurnsHandler = { _, _, _ -> held.await() }
        controller.selectThread("thread-a")
        controller.installAuthoritativeSnapshot(
            controller.selection.value!!,
            olderTurnsSnapshot(turns = turnRange(320, 520), turnsCursor = "ct1.320"),
        )

        val pending = async { controller.loadOlder() }
        runCurrent()
        controller.selectThread("thread-b")
        held.complete(RichChatTurnsPage(turnRange(120, 320), "ct1.120"))

        assertTrue(pending.await() is RichChatOperationResult.Stale)
        assertNull(controller.state.value.transcript)
        assertNull(controller.state.value.olderTurnsCursor)
    }

    @Test
    fun closeThreadFencesAHeldOlderPage() = runTest {
        val gateway = FakeRichChatSessionGateway()
        val controller = RichChatController(MutableStateFlow<RichChatHostLease?>(richLease()), gateway)
        val held = CompletableDeferred<RichChatTurnsPage>()
        gateway.olderTurnsHandler = { _, _, _ -> held.await() }
        controller.selectThread("thread-a")
        controller.installAuthoritativeSnapshot(
            controller.selection.value!!,
            olderTurnsSnapshot(turns = turnRange(320, 520), turnsCursor = "ct1.320"),
        )

        val pending = async { controller.loadOlder() }
        runCurrent()
        controller.closeThread()
        held.complete(RichChatTurnsPage(turnRange(120, 320), "ct1.120"))

        assertTrue(pending.await() is RichChatOperationResult.Stale)
        assertNull(controller.state.value.transcript)
        assertNull(controller.state.value.olderTurnsCursor)
    }

    @Test
    fun liveTruncateEventDropsTheTurnContinuation() = runTest {
        val gateway = FakeRichChatSessionGateway()
        val controller = RichChatController(MutableStateFlow<RichChatHostLease?>(richLease()), gateway)
        controller.selectThread("thread-a")
        controller.installAuthoritativeSnapshot(
            controller.selection.value!!,
            olderTurnsSnapshot(turns = turnRange(320, 520), turnsCursor = "ct1.320"),
        )
        val selection = controller.selection.value!!
        val truncated = RichRuntimeEvent.RuntimeTruncated(
            threadKey = RichThreadKey(selection.host.connectionId, "thread-a"),
            itemId = "item-400",
            removedCompletedTurnAnchors = emptyList(),
        )

        assertTrue(controller.applyServerFrame(selection, sequence = 10, events = listOf(truncated)))
        assertNull(controller.state.value.olderTurnsCursor)
    }

    // --- real transport through the UI callback ---

    @Test
    fun uiLoadOlderWalksCt1ThroughTheRealRemoteApiClient() = runBlocking {
        val server = MockWebServer()
        val turnsCursors = CopyOnWriteArrayList<String?>()
        val turnsReads = CopyOnWriteArrayList<String?>()
        val turnsLimits = CopyOnWriteArrayList<String?>()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val url = request.requestUrl ?: return notFound()
                val path = url.encodedPath
                return when {
                    path == "/api/threads/spike/history" ->
                        ok(historyBody())
                    path == "/api/threads/spike/turns" -> {
                        turnsCursors += url.queryParameter("cursor")
                        turnsReads += url.queryParameter("reads")
                        turnsLimits += url.queryParameter("limit")
                        ok(turnsBody(url.queryParameter("cursor") ?: "ct1.320"))
                    }
                    else -> notFound()
                }
            }
        }
        server.start()
        val remote = RemoteApiClient(
            endpoint = server.url("/").toString().trimEnd('/'),
            accessToken = "token",
            client = OkHttpClient.Builder()
                .followRedirects(false)
                .followSslRedirects(false)
                .build(),
        )
        val leaseFlow = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = GeneratedRichChatSessionGateway(
            leaseFlow,
            RichChatGatewayProvider {
                RichChatGatewayBundle(
                    core = remote,
                    rich = GeneratedRichChatRemoteTransport(remote),
                    mutationDelivery = RichChatMutationDelivery.SingleAttempt,
                )
            },
        )
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val runtime = RichChatSessionRuntime(leaseFlow, gateway, scope = scope)
        try {
            assertTrue(runtime.selectThread("spike") is RichChatOperationResult.Success)
            runtime.refreshSelectedThread()
            awaitCondition { runtime.chat.state.value.olderTurnsCursor == "ct1.320" }
            assertEquals(200, runtime.chat.state.value.transcript!!.completedTurns.size)

            // The exact callback RichTimelineView invokes on scroll / tap.
            var taps = 0
            while (runtime.chat.state.value.olderTurnsCursor != null && taps < 10) {
                assertTrue(runtime.chat.loadOlder() is RichChatOperationResult.Success)
                taps += 1
            }
            val turns = runtime.chat.state.value.transcript!!.completedTurns
            assertEquals(2, taps)
            assertEquals(520, turns.size)
            assertNull(runtime.chat.state.value.olderTurnsCursor)

            val keys = turns.map { it.startedAtEpochMs to it.endedAtEpochMs }
            assertEquals(keys.size, keys.toSet().size)
            assertEquals(keys.sortedWith(compareBy({ it.first }, { it.second })), keys)
            assertTrue(turns.any { it.anchorItemId == null })

            assertEquals(listOf("ct1.320", "ct1.120"), turnsCursors.toList())
            assertTrue(turnsReads.all { it == "bounded-v1" })
            assertTrue(turnsLimits.all { it == "200" })
        } finally {
            runtime.close()
            scope.cancel()
            server.shutdown()
        }
    }

    // --- helpers ---

    private fun olderTurnsSnapshot(
        seq: Int = 1,
        items: List<com.poracode.app.chat.RichRuntimeItem> = emptyList(),
        turns: List<RichCompletedTurn>,
        turnsCursor: String?,
        olderCursor: Int? = null,
    ): RichChatHistorySnapshot {
        val key = RichThreadKey(richLease().connectionId, "thread-a")
        return RichChatHistorySnapshot(
            key = key,
            snapshotSeq = seq,
            state = RichThreadState.hydrate(key, items, completedTurns = turns),
            olderCursor = olderCursor,
            completedTurnsNextCursor = turnsCursor,
            config = ThreadConfig(model = "gpt-5"),
            terminalScrollback = null,
            updatedAt = "2026-08-12T00:00:00.000Z",
        )
    }

    private fun turnRange(
        from: Int,
        until: Int,
        anchorless: Boolean = false,
    ): List<RichCompletedTurn> = (from until until).map { index ->
        val start = 1_700_000_000_000L + index * 1_000L
        RichCompletedTurn(
            startedAtEpochMs = start,
            endedAtEpochMs = start + 500L,
            anchorItemId = if (anchorless || index % 7 == 0) null else "anchor-$index",
        )
    }

    private fun historyBody(): String {
        val turns = (320 until 520).joinToString(",") { turnJson(it) }
        return """{"snapshotSeq":42,"thread":${threadJson()},"runtimeItems":[],""" +
            """"completedTurns":[$turns],"contextUsage":null,"reads":"bounded-v1",""" +
            """"completedTurnsNextCursor":"ct1.320","updatedAt":"2026-01-01T00:00:00.000Z"}"""
    }

    private fun turnsBody(cursor: String): String {
        val oldest = cursor.removePrefix("ct1.").toIntOrNull() ?: 320
        val from = (oldest - 200).coerceAtLeast(0)
        val turns = (from until oldest).joinToString(",") { turnJson(it) }
        val next = if (from > 0) "ct1.$from" else null
        return """{"turns":[$turns],"completedTurnsNextCursor":${next?.let { "\"$it\"" } ?: "null"},"reads":"bounded-v1"}"""
    }

    private fun turnJson(index: Int): String {
        val stamp = "2026-01-01T00:%02d:%02d.000Z".format(index / 60, index % 60)
        val anchor = if (index % 7 == 0) "null" else "\"anchor-$index\""
        return """{"startedAt":"$stamp","endedAt":"$stamp","anchorItemId":$anchor}"""
    }

    private fun threadJson(): String =
        """{"id":"spike","projectId":"p1","title":"Spike","agentKind":"codex",""" +
            """"config":{"model":"gpt-5"},"status":"idle","attention":"none","archived":false,""" +
            """"done":false,"starred":false,"canResumeWithConfig":true,"presentationMode":"gui",""" +
            """"createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"}"""

    private fun ok(body: String): MockResponse = MockResponse()
        .setResponseCode(200)
        .setHeader("Content-Type", "application/json")
        .setBody(body)

    private fun notFound(): MockResponse = MockResponse()
        .setResponseCode(404)
        .setHeader("Content-Type", "application/json")
        .setBody("""{"error":{"code":"not_found","message":"no route"}}""")

    private suspend fun awaitCondition(
        timeoutMs: Long = 10_000,
        condition: () -> Boolean,
    ) {
        val met = withTimeoutOrNull(timeoutMs) {
            while (!condition()) delay(20)
            true
        }
        if (met != true) fail("condition not met within ${timeoutMs}ms")
    }
}
