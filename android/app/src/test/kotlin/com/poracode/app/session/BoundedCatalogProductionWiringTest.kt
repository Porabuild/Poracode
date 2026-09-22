package com.poracode.app.session

import com.poracode.app.model.ConnectionProfile
import com.poracode.app.model.RemoteAccessTokenResult
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.storage.InMemorySessionCredentialRepository
import com.poracode.app.storage.SessionCredentials
import com.poracode.app.transport.RemoteApiClient
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.put
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

/**
 * End-to-end bounded-catalog wiring: the REAL [RemoteApiClient] against a
 * MockWebServer host with a large catalog, driven through the REAL [AppSession]
 * controller graph (bootstrap -> first page install -> paint/inventory walks).
 *
 * This is the strongest evidence available without an emulator/device: it
 * proves the production client (route codecs, budget params, echo negotiation)
 * and the controller wiring, not a fake. Device/gate evidence is explicitly
 * out of scope and reported as unrun.
 */
class BoundedCatalogProductionWiringTest {
    private lateinit var server: MockWebServer
    private var sessionScope: CoroutineScope? = null
    private var lastSockets: FakeSocketFactory? = null

    private val continuationRequested = CountDownLatch(1)
    private val continuationLatch = CountDownLatch(1)
    private val inventoryRequested = CountDownLatch(1)
    private val inventoryLatch = CountDownLatch(1)
    private val requestCounts = java.util.concurrent.ConcurrentHashMap<String, AtomicInteger>()
    private val membershipThreadIds =
        java.util.concurrent.CopyOnWriteArrayList<List<String>>()
    private val pageOneExtraIds = mutableListOf<String>()

    @Volatile
    private var blockInventory = false

    @Before
    fun setUp() {
        server = MockWebServer()
    }

    @After
    fun tearDown() {
        continuationLatch.countDown()
        inventoryLatch.countDown()
        sessionScope?.cancel()
        server.shutdown()
    }

    @Test
    fun firstBoundedPageInstallsBeforeLargeWalkCompletesAndConvergesWithoutFalseDeletes() = runBlocking {
        server.dispatcher = dispatcher(legacyHost = false, total = TOTAL)
        server.start()
        blockInventory = true
        val session = buildSession()
        session.bootstrap()

        awaitCondition { session.state.value.phase == AppSession.Phase.Ready && session.state.value.snapshot != null }
        assertEquals(PAGE, session.state.value.snapshot!!.threads.size)
        assertTrue(session.state.value.catalog.negotiated)
        assertFalse(session.state.value.catalog.legacy)
        assertEquals(SHELL_SEQ, session.state.value.snapshot!!.snapshotSeq)
        assertEquals(SHELL_SEQ, session.lastSeenSeqForTests())

        // Both walks are in flight and blocked; page 1 is already on screen and
        // the catalog has NOT been assembled by the walk.
        if (!continuationRequested.await(5, TimeUnit.SECONDS)) {
            fail(
                "no paint continuation: counts=" + requestCounts.mapValues { it.value.get() } +
                    " paintCursor=" + session.state.value.catalog.paintThreadCursor +
                    " paintActive=" + session.state.value.catalog.paintActive +
                    " error=" + session.state.value.globalError,
            )
        }
        assertTrue(inventoryRequested.await(5, TimeUnit.SECONDS))
        assertEquals(PAGE, session.state.value.snapshot!!.threads.size)
        assertEquals(0, requestCounts["membership"]?.get() ?: 0)

        continuationLatch.countDown()
        inventoryLatch.countDown()
        val converged = withTimeoutOrNull(20_000) {
            while (!(session.state.value.catalog.threadsComplete &&
                    session.state.value.catalog.projectsComplete &&
                    session.state.value.snapshot!!.threads.size == TOTAL - 1)
            ) {
                delay(20)
            }
            true
        }
        if (converged != true) {
            fail(
                "walk did not converge: counts=" + requestCounts.mapValues { it.value.get() } +
                    " threads=" + session.state.value.snapshot?.threads?.size +
                    " seenIds=" + session.state.value.snapshot?.threads?.size +
                    " complete=" + session.state.value.catalog.threadsComplete + "/" +
                    session.state.value.catalog.projectsComplete +
                    " error=" + session.state.value.globalError +
                    " pending=" + session.state.value.catalog.pendingThreadsChange + "/" +
                    session.state.value.catalog.pendingProjectsChange,
            )
        }

        // t0 was deleted host-side between page 1 and the inventory pass; the
        // confirmation read said absent, so exactly that row is gone.
        val ids = session.state.value.snapshot!!.threads.map { it.id }
        assertEquals(TOTAL - 1, ids.size)
        assertEquals(ids.size, ids.toSet().size)
        assertFalse("t0" in ids)
        assertTrue("t1" in ids && "t1999" in ids)
        // Continuation pages never advance the global cursor.
        assertEquals(SHELL_SEQ, session.state.value.snapshot!!.snapshotSeq)
        assertEquals(SHELL_SEQ, session.lastSeenSeqForTests())
        // Legacy assembled snapshot was never requested on a declared host.
        assertEquals(0, requestCounts["legacy-snapshot"]?.get() ?: 0)
    }

    @Test
    fun legacyHostKeepsAssembledPathAndNeverWalksBoundPages() = runBlocking {
        server.dispatcher = dispatcher(legacyHost = true, total = 5)
        server.start()
        val session = buildSession()
        session.bootstrap()

        awaitCondition { session.state.value.phase == AppSession.Phase.Ready && session.state.value.snapshot != null }
        assertTrue(session.state.value.catalog.legacy)
        assertFalse(session.state.value.catalog.negotiated)
        assertEquals(5, session.state.value.snapshot!!.threads.size)
        assertEquals(SHELL_SEQ, session.lastSeenSeqForTests())
        delay(300)
        assertEquals(0, requestCounts["thread-page"]?.get() ?: 0)
        assertEquals(0, requestCounts["thread-inventory"]?.get() ?: 0)
    }

    @Test
    fun backgroundCancelsWalksAndNoLateReplyPublishes() = runBlocking {
        server.dispatcher = dispatcher(legacyHost = false, total = TOTAL)
        server.start()
        blockInventory = true
        val session = buildSession()
        session.bootstrap()
        awaitCondition { session.state.value.phase == AppSession.Phase.Ready }
        assertTrue(continuationRequested.await(5, TimeUnit.SECONDS))
        assertTrue(inventoryRequested.await(5, TimeUnit.SECONDS))
        assertEquals(PAGE, session.state.value.snapshot!!.threads.size)

        session.onAppBackground()
        continuationLatch.countDown()
        inventoryLatch.countDown()
        delay(400)
        // The cancelled generation published nothing: no confirmation read ran,
        // t0 was not deleted, and page 1 is intact.
        assertEquals(0, requestCounts["membership"]?.get() ?: 0)
        assertEquals(PAGE, session.state.value.snapshot!!.threads.size)
        assertTrue(session.state.value.snapshot!!.threads.any { it.id == "t0" })
    }

    @Test
    fun deepLinkOpenBeforeCatalogCompletionPinsRowAndSuppressesDeletion() = runBlocking {
        pageOneExtraIds += "dl-1"
        blockInventory = true
        server.dispatcher = dispatcher(legacyHost = false, total = 2)
        server.start()
        val session = buildSession()
        session.bootstrap()
        awaitCondition { session.state.value.phase == AppSession.Phase.Ready && session.state.value.snapshot != null }
        assertTrue(inventoryRequested.await(5, TimeUnit.SECONDS))
        assertTrue(session.state.value.snapshot!!.threads.any { it.id == "dl-1" })

        // Open by id while the inventory pass is still blocked: history installs and pins.
        session.openThread("dl-1")
        awaitCondition { session.state.value.snapshot!!.threads.any { it.id == "dl-1" } }
        assertTrue("dl-1" in session.state.value.catalog.pinnedThreadIds)

        inventoryLatch.countDown()
        awaitCondition(timeoutMs = 20_000) { session.state.value.catalog.threadsComplete }
        // The pass never saw dl-1, but the pin kept it out of the confirmation read.
        assertFalse(membershipThreadIds.any { "dl-1" in it })
        assertTrue(session.state.value.snapshot!!.threads.any { it.id == "dl-1" })
    }

    @Test
    fun fiveHundredCompletedTurnsMergeLosslesslyAcrossCt1Pages() = runBlocking {
        server.dispatcher = dispatcher(legacyHost = false, total = 2)
        server.start()
        val session = buildSession()
        session.bootstrap()
        awaitCondition { session.state.value.phase == AppSession.Phase.Ready && session.state.value.snapshot != null }
        awaitCondition { session.state.value.catalog.threadsComplete }

        session.openThread("t1")
        awaitCondition(
            diagnostics = {
                "loadState=" + session.state.value.threadLoadState +
                    " error=" + session.state.value.threadLoadError +
                    " size=" + session.state.value.threadSnapshot?.completedTurns?.size +
                    " counts=" + requestCounts.mapValues { it.value.get() }
            },
        ) { session.state.value.threadSnapshot?.completedTurns?.size == 200 }
        assertEquals("ct1.320", session.state.value.threadSnapshot!!.completedTurnsNextCursor)

        session.loadOlderCompletedTurns()
        awaitCondition(
            diagnostics = {
                "size=" + session.state.value.threadSnapshot?.completedTurns?.size +
                    " cursor=" + session.state.value.threadSnapshot?.completedTurnsNextCursor +
                    " counts=" + requestCounts.mapValues { it.value.get() }
            },
        ) { session.state.value.threadSnapshot?.completedTurns?.size == 400 }
        session.loadOlderCompletedTurns()
        awaitCondition(
            diagnostics = {
                "size=" + session.state.value.threadSnapshot?.completedTurns?.size +
                    " cursor=" + session.state.value.threadSnapshot?.completedTurnsNextCursor
            },
        ) { session.state.value.threadSnapshot?.completedTurns?.size == 520 }
        assertNull(session.state.value.threadSnapshot!!.completedTurnsNextCursor)

        val merged = session.state.value.threadSnapshot!!.completedTurns
        assertEquals(520, merged.size)
        val keys = merged.mapNotNull { turn ->
            val obj = turn as? kotlinx.serialization.json.JsonObject ?: return@mapNotNull null
            val started = (obj["startedAt"] as? kotlinx.serialization.json.JsonPrimitive)?.content
            val ended = (obj["endedAt"] as? kotlinx.serialization.json.JsonPrimitive)?.content
            "$started\u0000$ended"
        }
        assertEquals(keys.size, keys.toSet().size)
        assertEquals(keys.sorted(), keys)
        assertTrue(
            merged.any { turn ->
                (turn as? kotlinx.serialization.json.JsonObject)?.get("anchorItemId") is
                    kotlinx.serialization.json.JsonNull
            },
        )
    }

    @Test
    fun liveThreadStateUpdatesRowInPlaceWithoutCatalogRefetch() = runBlocking {
        server.dispatcher = dispatcher(legacyHost = false, total = 2)
        server.start()
        val session = buildSession()
        session.bootstrap()
        awaitCondition { session.state.value.phase == AppSession.Phase.Ready && session.state.value.snapshot != null }
        awaitCondition { session.state.value.catalog.threadsComplete }
        val requestsBefore = catalogRequests()

        lastSockets!!.latest!!.emitEvent(
            seq = SHELL_SEQ + 1,
            event = kotlinx.serialization.json.buildJsonObject {
                put("type", "thread-state")
                put("threadId", "t1")
                put("status", "working")
                put("attention", "none")
                put("canResumeWithConfig", true)
            },
        )
        awaitCondition { session.state.value.snapshot!!.threads.any { it.id == "t1" && it.status == "working" } }
        assertEquals(SHELL_SEQ + 1L, session.state.value.catalog.threadAppliedSeq["t1"])
        delay(400)
        assertEquals(requestsBefore, catalogRequests())
    }

    // --- harness ---

    private fun buildSession(): AppSession {
        val credentials = InMemorySessionCredentialRepository().also {
            it.credentials = SessionCredentials(
                profile = ConnectionProfile(
                    desktopId = "desktop-large",
                    label = "Large Host",
                    httpBaseUrl = server.url("/").toString().trimEnd('/'),
                    wsBaseUrl = server.url("/").toString().trimEnd('/'),
                    appVersion = "1.0.0",
                    scopes = listOf("session:read", "session:operate"),
                    pairedAtEpochMs = 1L,
                    protocolVersion = ProtocolConstants.REMOTE_PROTOCOL_VERSION,
                ),
                accessToken = "access-large",
            )
        }
        val sockets = FakeSocketFactory().also { lastSockets = it }
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        sessionScope = scope
        return AppSession(
            credentials = credentials,
            scope = scope,
            apiFactory = { endpoint, token ->
                RemoteApiClient(
                    endpoint = endpoint,
                    accessToken = token,
                    client = OkHttpClient.Builder()
                        .followRedirects(false)
                        .followSslRedirects(false)
                        .build(),
                )
            },
            socketFactory = { sockets.create() },
            ioDispatcher = Dispatchers.IO,
            networkGate = com.poracode.app.transport.ForegroundNetworkGate(),
        )
    }

    private fun dispatcher(legacyHost: Boolean, total: Int): Dispatcher = object : Dispatcher() {
        override fun dispatch(request: RecordedRequest): MockResponse {
            val url = request.requestUrl ?: return notFound()
            val path = url.encodedPath
            val reads = url.queryParameter("reads")
            return when {
                path.endsWith("/environment") -> ok(readFixture("environment.json"))
                path == "/api/snapshot" && legacyHost -> {
                    count("legacy-snapshot")
                    ok(legacyShellBody(total))
                }
                path == "/api/snapshot" && reads == "bounded-v1" -> {
                    count("shell-page")
                    ok(shellBody(total, pageOneExtraIds))
                }
                path == "/api/threads" && url.queryParameter("mode") == "inventory" -> {
                    count("thread-inventory")
                    if (blockInventory) {
                        inventoryRequested.countDown()
                        inventoryLatch.await(10, TimeUnit.SECONDS)
                    }
                    val cursor = url.queryParameter("cursor")
                    val start = cursor?.removePrefix("ti1.")?.toIntOrNull() ?: 0
                    val ids = (start until total).filter { it != 0 }.take(PAGE)
                    val next = if (start + ids.size < total) "ti1.${start + ids.size}" else null
                    ok(threadListBody(ids, next, frontier = "t${total - 1}"))
                }
                path == "/api/threads" && url.queryParameter("mode") == "page" -> {
                    count("thread-page")
                    val cursor = url.queryParameter("cursor")
                    val start = cursor?.removePrefix("tu2.")?.toIntOrNull() ?: 0
                    if (start == PAGE && !legacyHost) {
                        continuationRequested.countDown()
                        continuationLatch.await(10, TimeUnit.SECONDS)
                    }
                    if (start >= total) {
                        ok(threadListBody(emptyList(), null))
                    } else {
                        val ids = (start until minOf(start + PAGE, total)).toList()
                        val next = if (start + ids.size < total) "tu2.${start + ids.size}" else null
                        ok(threadListBody(ids, next))
                    }
                }
                path == "/api/projects" -> {
                    count("project-page")
                    ok(projectListBody(cursor = url.queryParameter("cursor")))
                }
                path == "/api/catalog/membership" -> {
                    count("membership")
                    val body = request.body.readUtf8()
                    membershipThreadIds += requestedThreadIds(body)
                    ok(membershipBody(body))
                }
                path.startsWith("/api/threads/") && path.endsWith("/history") -> {
                    count("thread-history")
                    val threadId = path.removePrefix("/api/threads/").removeSuffix("/history")
                    ok(historyBody(threadId))
                }
                path.startsWith("/api/threads/") && path.endsWith("/turns") -> {
                    count("thread-turns")
                    ok(turnsBody(url.queryParameter("cursor") ?: "ct1.320"))
                }
                else -> notFound()
            }
        }
    }

    /** Catalog/history HTTP work only; agent-statuses/socket chatter is not a refetch. */
    private fun catalogRequests(): Int = listOf(
        "shell-page",
        "thread-page",
        "thread-inventory",
        "project-page",
        "project-inventory",
        "membership",
        "thread-history",
    ).sumOf { requestCounts[it]?.get() ?: 0 }

    private fun count(key: String) {
        requestCounts.getOrPut(key) { AtomicInteger() }.incrementAndGet()
    }

    private fun notFound(): MockResponse = MockResponse()
        .setResponseCode(404)
        .setHeader("Content-Type", "application/json")
        .setBody("""{"error":{"code":"not_found","message":"no route"}}""")

    private fun ok(body: String): MockResponse = MockResponse()
        .setResponseCode(200)
        .setHeader("Content-Type", "application/json")
        .setBody(body)

    private suspend fun awaitCondition(
        timeoutMs: Long = 10_000,
        diagnostics: () -> String = { "" },
        condition: () -> Boolean,
    ) {
        val met = withTimeoutOrNull(timeoutMs) {
            while (!condition()) delay(20)
            true
        }
        if (met != true) fail("condition not met within ${timeoutMs}ms: ${diagnostics()}")
    }

    private fun readFixture(name: String): String =
        javaClass.classLoader!!.getResourceAsStream("fixtures/$name")!!.bufferedReader().use { it.readText() }

    // --- wire builders ---

    private fun threadJson(id: Int): String = threadJson("t$id")

    private fun threadJson(threadId: String): String =
        """{"id":"$threadId","projectId":"p1","title":"Thread $threadId","agentKind":"codex",""" +
            """"config":{"model":"gpt-5"},"status":"idle","attention":"none","archived":false,""" +
            """"done":false,"starred":false,"canResumeWithConfig":true,"presentationMode":"gui",""" +
            """"createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"}"""

    private fun projectJson(): String =
        """{"id":"p1","name":"Project","location":{"kind":"posix","path":"/tmp/p1"},"createdAt":"2026-01-01T00:00:00.000Z"}"""

    private fun shellBody(total: Int, extraPageIds: List<String>): String {
        val ids = (0 until minOf(total, PAGE)).map(::threadJson)
        val threads = (ids + extraPageIds.map(::threadJson)).joinToString(",")
        val next = if (total > PAGE) "tu2.$PAGE" else null
        return buildString {
            append("""{"snapshotSeq":$SHELL_SEQ,"projects":[${projectJson()}],""")
            append(""""threads":[$threads],""")
            append(""""runtimeSummariesByThread":{},"reads":"bounded-v1",""")
            append(""""threadsNextCursor":${next?.let { "\"$it\"" } ?: "null"},"projectsNextCursor":null,""")
            append(""""updatedAt":"2026-01-01T00:00:00.000Z"}""")
        }
    }

    private fun legacyShellBody(total: Int): String = buildString {
        append("""{"snapshotSeq":$SHELL_SEQ,"projects":[${projectJson()}],""")
        append(""""threads":[${(0 until total).joinToString(",") { threadJson(it) }}],""")
        append(""""runtimeSummariesByThread":{},""")
        append(""""updatedAt":"2026-01-01T00:00:00.000Z"}""")
    }

    private fun threadListBody(ids: List<Int>, nextCursor: String?, frontier: String? = null): String =
        buildString {
            append("""{"threads":[${ids.joinToString(",") { threadJson(it) }}],"runtimeSummariesByThread":{},"reads":"bounded-v1",""")
            if (frontier != null) append(""""inventoryFrontier":"$frontier",""")
            append(""""nextCursor":${nextCursor?.let { "\"$it\"" } ?: "null"}}""")
        }

    private fun projectListBody(cursor: String?): String =
        """{"projects":[${projectJson()}],"reads":"bounded-v1","projectsNextCursor":null}"""

    /** Every requested id still exists except t0 (deleted host-side before the inventory pass). */
    private fun membershipBody(requestBody: String): String {
        val threads = requestedThreadIds(requestBody).filterNot { it == "t0" }
        val projects = requestedIds(requestBody, "projectIds")
        return """{"existingThreadIds":[${threads.joinToString(",") { "\"$it\"" }}],"existingProjectIds":[${projects.joinToString(",") { "\"$it\"" }}]}"""
    }

    private fun requestedThreadIds(requestBody: String): List<String> = requestedIds(requestBody, "threadIds")

    private fun requestedIds(requestBody: String, field: String): List<String> =
        Regex("\"$field\":\\[(.*?)]").find(requestBody)?.groupValues?.get(1)
            .orEmpty()
            .split(',')
            .map { it.trim().removeSurrounding("\"") }
            .filter { it.isNotEmpty() }

    // --- history / turns wire ---

    /** Newest 200 completed turns (320..519) plus a `ct1.320` older cursor. */
    private fun historyBody(threadId: String): String {
        val turns = turnRange(320, 520)
        return """{"snapshotSeq":$SHELL_SEQ,"thread":${threadJson(threadId)},"runtimeItems":[],""" +
            """"completedTurns":[${turns.joinToString(",")}],"contextUsage":null,"reads":"bounded-v1",""" +
            """"completedTurnsNextCursor":"ct1.320","updatedAt":"2026-01-01T00:00:00.000Z"}"""
    }

    private fun turnsBody(cursor: String): String {
        val oldest = cursor.removePrefix("ct1.").toIntOrNull() ?: 320
        val from = (oldest - 200).coerceAtLeast(0)
        val turns = turnRange(from, oldest)
        val next = if (from > 0) "ct1.$from" else null
        return """{"turns":[${turns.joinToString(",")}],"completedTurnsNextCursor":${next?.let { "\"$it\"" } ?: "null"},"reads":"bounded-v1"}"""
    }

    /** Anchorless every seventh turn; identity is (startedAt, endedAt). */
    private fun turnRange(from: Int, until: Int): List<String> = (from until until).map { index ->
        val stamp = "2026-01-01T00:%02d:%02d.000Z".format(index / 60, index % 60)
        val anchor = if (index % 7 == 0) "null" else "\"anchor-$index\""
        """{"startedAt":"$stamp","endedAt":"$stamp","anchorItemId":$anchor}"""
    }

    private companion object {
        const val TOTAL = 10_000
        const val PAGE = 100
        const val SHELL_SEQ = 42
    }
}
