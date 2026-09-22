package com.poracode.app.transport

import com.poracode.app.model.RemoteBoundedReadCodes
import com.poracode.app.model.RemoteBoundedReadResult
import com.poracode.app.model.RemoteClientException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * B4 bounded reads over the real [RemoteApiClient] + MockWebServer: exact
 * requests, negotiation decision table, strict bounded validation and typed
 * failures. C1 transport semantics (bearer, cancellation, pinning) are the
 * existing client's and are exercised elsewhere; here the URL/decoding
 * contract is pinned.
 */
class RemoteBoundedReadsTest {
    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun client(): RemoteApiClient = RemoteApiClient(
        endpoint = server.url("/").toString().trimEnd('/'),
        accessToken = "access-secret",
        client = OkHttpClient.Builder()
            .followRedirects(false)
            .followSslRedirects(false)
            .build(),
    )

    // --- shell ---

    @Test
    fun boundedShellNegotiatesWithExactParams() = runBlocking {
        server.enqueue(json(shellBody(threadsNextCursor = "tu2.a", projectsNextCursor = "pj1.a")))
        val gateway = client().bounded
        val result = gateway.boundedShellSnapshot(
            order = "updated",
            projectLimit = 50,
            summaries = false,
            maxBytes = 1234,
            maxDecodeBytes = 5678,
        )
        val page = (result as RemoteBoundedReadResult.Bounded).page
        assertEquals("bounded-v1", page.reads)
        assertEquals("tu2.a", page.threadsNextCursor)
        assertEquals("pj1.a", page.projectsNextCursor)
        assertEquals(1, page.threads.size)
        assertEquals("t1", page.threads.first().id)
        assertEquals(1, page.projects.size)

        val recorded = server.takeRequest()
        assertEquals("GET", recorded.method)
        assertEquals(
            "/api/snapshot?reads=bounded-v1&order=updated&projectLimit=50&summaries=0&maxBytes=1234&maxDecodeBytes=5678",
            recorded.path,
        )
        assertEquals("Bearer access-secret", recorded.getHeader("Authorization"))
    }

    @Test
    fun boundedShellLegacyWhenEchoAbsent() = runBlocking {
        server.enqueue(json(shellBody(reads = null, threadsNextCursor = null, projectsNextCursor = null)))
        val result = client().bounded.boundedShellSnapshot(order = "updated")
        val legacy = result as RemoteBoundedReadResult.Legacy
        assertEquals(1, legacy.page.threads.size)
        assertEquals("t1", legacy.page.threads.first().id)
    }

    @Test
    fun boundedShellUnknownEchoIsProtocolError() = runBlocking {
        server.enqueue(json(shellBody(reads = "bounded-v2")))
        val error = runCatching { client().bounded.boundedShellSnapshot(order = "updated") }
            .exceptionOrNull() as RemoteClientException
        assertEquals(RemoteBoundedReadCodes.PROTOCOL_ERROR, error.code)
        assertEquals(500, error.status)
    }

    @Test
    fun boundedShellMissingBoundedCursorIsProtocolError() = runBlocking {
        server.enqueue(json(shellBody(threadsNextCursor = null, projectsNextCursor = null, omitThreadCursor = true)))
        val error = runCatching { client().bounded.boundedShellSnapshot(order = "updated") }
            .exceptionOrNull() as RemoteClientException
        assertEquals(RemoteBoundedReadCodes.PROTOCOL_ERROR, error.code)
    }

    // --- thread paint / inventory ---

    @Test
    fun threadPaintContinuationValidatesCursorPrefix() = runBlocking {
        server.enqueue(json(threadListBody(threads = listOf(threadJson("t2")), nextCursor = "tu2.b")))
        val result = client().bounded.boundedThreadPage(
            mode = "page",
            order = "updated",
            cursor = "tu2.a",
            limit = 100,
        )
        val page = (result as RemoteBoundedReadResult.Bounded).page
        assertEquals("tu2.b", page.nextCursor)
        assertEquals(
            "/api/threads?reads=bounded-v1&mode=page&order=updated&summaries=0&limit=100&cursor=tu2.a&maxBytes=33554432&maxDecodeBytes=67108864",
            server.takeRequest().path,
        )
    }

    @Test
    fun threadPaintWrongOrderCursorFailsBeforeDispatch() = runBlocking {
        val error = runCatching {
            client().bounded.boundedThreadPage(
                mode = "page",
                order = "updated",
                cursor = "tp1.a",
                limit = 100,
            )
        }.exceptionOrNull() as RemoteClientException
        assertEquals(RemoteBoundedReadCodes.PROTOCOL_ERROR, error.code)
        assertEquals(0, server.requestCount)
    }

    @Test
    fun threadInventoryPageOneRequiresFrontier() = runBlocking {
        server.enqueue(json(threadListBody(threads = listOf(threadJson("t1")), nextCursor = null)))
        val error = runCatching {
            client().bounded.boundedThreadPage(mode = "inventory", limit = 100)
        }.exceptionOrNull() as RemoteClientException
        assertEquals(RemoteBoundedReadCodes.PROTOCOL_ERROR, error.code)
        assertEquals("/api/threads?reads=bounded-v1&mode=inventory&limit=100&maxBytes=33554432&maxDecodeBytes=67108864", server.takeRequest().path)
    }

    @Test
    fun threadInventoryAcceptsFrontierAndTi1Cursor() = runBlocking {
        server.enqueue(
            json(threadListBody(threads = listOf(threadJson("t1")), nextCursor = "ti1.a", frontier = "t1")),
        )
        val page = client().bounded.boundedThreadPage(mode = "inventory", limit = 100)
            .let { (it as RemoteBoundedReadResult.Bounded).page }
        assertEquals("t1", page.inventoryFrontier)
        assertEquals("ti1.a", page.nextCursor)
    }

    @Test
    fun continuationWithoutEchoIsProtocolError() = runBlocking {
        server.enqueue(json(threadListBody(threads = emptyList(), nextCursor = null, reads = null)))
        val error = runCatching {
            client().bounded.boundedThreadPage(mode = "page", order = "manual", cursor = "tp1.a")
        }.exceptionOrNull() as RemoteClientException
        assertEquals(RemoteBoundedReadCodes.PROTOCOL_ERROR, error.code)
    }

    // --- projects (declared-only) ---

    @Test
    fun projectPageDecodesAndValidatesPrefix() = runBlocking {
        server.enqueue(json(projectListBody(projects = listOf(projectJson("p1")), nextCursor = "pi1.a")))
        val page = client().bounded.boundedProjectPage(mode = "inventory", projectLimit = 50)
        assertEquals("pi1.a", page.projectsNextCursor)
        assertEquals(
            "/api/projects?reads=bounded-v1&mode=inventory&projectLimit=50&maxBytes=33554432&maxDecodeBytes=67108864",
            server.takeRequest().path,
        )
    }

    @Test
    fun projectPageRouteUnavailableIsTyped() = runBlocking {
        server.enqueue(
            MockResponse().setResponseCode(404).setHeader("Content-Type", "application/json")
                .setBody("""{"error":{"code":"not_found","message":"no route"}}"""),
        )
        val error = runCatching { client().bounded.boundedProjectPage(mode = "page") }
            .exceptionOrNull() as RemoteClientException
        assertEquals(RemoteBoundedReadCodes.ROUTE_UNAVAILABLE, error.code)
    }

    @Test
    fun projectPageMissingEchoIsProtocolError() = runBlocking {
        server.enqueue(json(projectListBody(projects = emptyList(), nextCursor = null, reads = null)))
        val error = runCatching { client().bounded.boundedProjectPage(mode = "page") }
            .exceptionOrNull() as RemoteClientException
        assertEquals(RemoteBoundedReadCodes.PROTOCOL_ERROR, error.code)
    }

    // --- membership ---

    @Test
    fun membershipIsAReadSemanticPostAndValidatesAnswer() = runBlocking {
        server.enqueue(json("""{"existingThreadIds":["t1"],"existingProjectIds":[]}"""))
        val answer = client().bounded.boundedCatalogMembership(
            threadIds = listOf("t1", "t2"),
            projectIds = listOf("p1"),
        )
        assertEquals(listOf("t1"), answer.existingThreadIds)
        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        assertEquals("/api/catalog/membership", recorded.path)
        assertNull(recorded.getHeader("x-poracode-command-id"))
        assertTrue(recorded.body.readUtf8().contains("\"threadIds\":[\"t1\",\"t2\"]"))
    }

    @Test
    fun membershipUnrequestedAnswerIdIsProtocolError() = runBlocking {
        server.enqueue(json("""{"existingThreadIds":["t9"],"existingProjectIds":[]}"""))
        val error = runCatching {
            client().bounded.boundedCatalogMembership(threadIds = listOf("t1"))
        }.exceptionOrNull() as RemoteClientException
        assertEquals(RemoteBoundedReadCodes.PROTOCOL_ERROR, error.code)
    }

    @Test
    fun membershipDuplicateIdsRejectedBeforeDispatch() = runBlocking {
        val error = runCatching {
            client().bounded.boundedCatalogMembership(threadIds = listOf("t1", "t1"))
        }.exceptionOrNull() as RemoteClientException
        assertEquals("invalid_reads_request", error.code)
        assertEquals(400, error.status)
        assertEquals(0, server.requestCount)
    }

    @Test
    fun membershipOverTwoHundredIdsRejectedBeforeDispatch() = runBlocking {
        val error = runCatching {
            client().bounded.boundedCatalogMembership(threadIds = (1..201).map { "t$it" })
        }.exceptionOrNull() as RemoteClientException
        assertEquals("invalid_reads_request", error.code)
        assertEquals(0, server.requestCount)
    }

    // --- history / turns / items ---

    @Test
    fun boundedHistoryTailCarriesCursorAndBudget() = runBlocking {
        server.enqueue(json(historyBody(completedTurnsNextCursor = "ct1.a")))
        val result = client().bounded.boundedThreadHistory(
            threadId = "t1",
            completedTurnsLimit = 200,
            targetTimelineEntryCount = 40,
        )
        val page = (result as RemoteBoundedReadResult.Bounded).page
        assertEquals("ct1.a", page.completedTurnsNextCursor)
        assertEquals(
            "/api/threads/t1/history?reads=bounded-v1&runtimePage=1&completedTurnsLimit=200&targetTimelineEntryCount=40&maxBytes=33554432&maxDecodeBytes=67108864",
            server.takeRequest().path,
        )
    }

    @Test
    fun boundedHistoryLegacyTailWhenEchoAbsent() = runBlocking {
        server.enqueue(json(historyBody(reads = null, completedTurnsNextCursor = null)))
        val page = (client().bounded.boundedThreadHistory(threadId = "t1") as RemoteBoundedReadResult.Legacy).page
        assertEquals("t1", page.thread.id)
    }

    @Test
    fun threadTurnsUsesLimitAndCt1Cursor() = runBlocking {
        server.enqueue(
            json(turnsBody(listOf(turnJson("2026-01-01T00:00:00.000Z", "2026-01-01T00:01:00.000Z")), "ct1.b")),
        )
        val page = client().bounded.boundedThreadTurns(threadId = "t1", cursor = "ct1.a", limit = 200)
        assertEquals("ct1.b", page.completedTurnsNextCursor)
        assertEquals("2026-01-01T00:00:00.000Z", page.turns.first().startedAt)
        assertEquals(
            "/api/threads/t1/turns?reads=bounded-v1&limit=200&cursor=ct1.a&maxBytes=33554432&maxDecodeBytes=67108864",
            server.takeRequest().path,
        )
    }

    @Test
    fun threadTurnsRouteUnavailableIsTyped() = runBlocking {
        server.enqueue(
            MockResponse().setResponseCode(400).setHeader("Content-Type", "application/json")
                .setBody("""{"error":{"code":"invalid_reads_capability","message":"x"}}"""),
        )
        val error = runCatching { client().bounded.boundedThreadTurns(threadId = "t1") }
            .exceptionOrNull() as RemoteClientException
        assertEquals(RemoteBoundedReadCodes.ROUTE_UNAVAILABLE, error.code)
    }

    @Test
    fun threadTurnsWrongCursorPrefixRejectedBeforeDispatch() = runBlocking {
        val error = runCatching {
            client().bounded.boundedThreadTurns(threadId = "t1", cursor = "tp1.a")
        }.exceptionOrNull() as RemoteClientException
        assertEquals(RemoteBoundedReadCodes.PROTOCOL_ERROR, error.code)
        assertEquals(0, server.requestCount)
    }

    @Test
    fun historyItemsBoundedAndLegacy() = runBlocking {
        server.enqueue(json("""{"items":[],"nextCursor":12,"reads":"bounded-v1"}"""))
        server.enqueue(json("""{"items":[],"nextCursor":null}"""))
        val bounded = client().bounded.boundedThreadHistoryItems(
            threadId = "t1",
            beforePosition = 30,
            limit = 500,
            targetTimelineEntryCount = 40,
        )
        assertEquals(12, (bounded as RemoteBoundedReadResult.Bounded).page.nextCursor)
        assertEquals(
            "/api/threads/t1/history/items?reads=bounded-v1&limit=500&beforePosition=30&targetTimelineEntryCount=40&maxBytes=33554432&maxDecodeBytes=67108864",
            server.takeRequest().path,
        )
        val legacy = client().bounded.boundedThreadHistoryItems(threadId = "t1", beforePosition = null, limit = 10)
        assertTrue(legacy is RemoteBoundedReadResult.Legacy)
    }

    // --- cancellation ---

    @Test
    fun cancellationMidFlightIsCallerCancellation() = runBlocking {
        server.enqueue(
            json(shellBody(threadsNextCursor = null, projectsNextCursor = null))
                .setBodyDelay(5, java.util.concurrent.TimeUnit.SECONDS),
        )
        val job = launch {
            client().bounded.boundedShellSnapshot(order = "updated")
        }
        delay(100)
        job.cancel()
        job.join()
        assertTrue(job.isCancelled)
    }

    // --- helpers ---

    private fun json(body: String): MockResponse = MockResponse()
        .setResponseCode(200)
        .setHeader("Content-Type", "application/json")
        .setBody(body)

    private fun threadJson(
        id: String,
        projectId: String = "p1",
        status: String = "idle",
    ): String = """{"id":"$id","projectId":"$projectId","title":"Thread $id","agentKind":"codex",""" +
        """"config":{"model":"gpt-5"},"status":"$status","attention":"none","archived":false,""" +
        """"done":false,"starred":false,"canResumeWithConfig":true,"presentationMode":"gui",""" +
        """"createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"}"""

    private fun projectJson(id: String): String =
        """{"id":"$id","name":"Project $id","location":{"kind":"posix","path":"/tmp/$id"},"createdAt":"2026-01-01T00:00:00.000Z"}"""

    private fun shellBody(
        threads: List<String> = listOf(threadJson("t1")),
        projects: List<String> = listOf(projectJson("p1")),
        snapshotSeq: Int = 7,
        reads: String? = "bounded-v1",
        threadsNextCursor: String? = null,
        projectsNextCursor: String? = null,
        omitThreadCursor: Boolean = false,
    ): String = buildString {
        append("""{"snapshotSeq":$snapshotSeq,"projects":[${projects.joinToString(",")}],""")
        append(""""threads":[${threads.joinToString(",")}],"runtimeSummariesByThread":{},""")
        if (reads != null) append(""""reads":"$reads",""")
        if (!omitThreadCursor) {
            append(""""threadsNextCursor":${threadsNextCursor?.let { "\"$it\"" } ?: "null"},""")
        }
        append(""""projectsNextCursor":${projectsNextCursor?.let { "\"$it\"" } ?: "null"},""")
        append(""""updatedAt":"2026-01-01T00:00:00.000Z"}""")
    }

    private fun threadListBody(
        threads: List<String>,
        nextCursor: String?,
        reads: String? = "bounded-v1",
        frontier: String? = null,
    ): String = buildString {
        append("""{"threads":[${threads.joinToString(",")}],"runtimeSummariesByThread":{},""")
        if (reads != null) append(""""reads":"$reads",""")
        if (frontier != null) append(""""inventoryFrontier":"$frontier",""")
        append(""""nextCursor":${nextCursor?.let { "\"$it\"" } ?: "null"}}""")
    }

    private fun projectListBody(
        projects: List<String>,
        nextCursor: String?,
        reads: String? = "bounded-v1",
    ): String = buildString {
        append("""{"projects":[${projects.joinToString(",")}],""")
        if (reads != null) append(""""reads":"$reads",""")
        append(""""projectsNextCursor":${nextCursor?.let { "\"$it\"" } ?: "null"}}""")
    }

    private fun historyBody(
        reads: String? = "bounded-v1",
        completedTurnsNextCursor: String?,
        snapshotSeq: Int = 9,
    ): String = buildString {
        append("""{"snapshotSeq":$snapshotSeq,"thread":${threadJson("t1")},"runtimeItems":[],""")
        append(""""completedTurns":[],"contextUsage":null,"updatedAt":"2026-01-01T00:00:00.000Z",""")
        if (reads != null) append(""""reads":"$reads",""")
        append(""""completedTurnsNextCursor":${completedTurnsNextCursor?.let { "\"$it\"" } ?: "null"}}""")
    }

    private fun turnJson(startedAt: String, endedAt: String, anchorItemId: String? = null): String =
        """{"startedAt":"$startedAt","endedAt":"$endedAt","anchorItemId":${anchorItemId?.let { "\"$it\"" } ?: "null"}}"""

    private fun turnsBody(turns: List<String>, nextCursor: String?): String =
        """{"turns":[${turns.joinToString(",")}],"completedTurnsNextCursor":${nextCursor?.let { "\"$it\"" } ?: "null"},"reads":"bounded-v1"}"""
}
