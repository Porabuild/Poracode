package com.poracode.app.session

import com.poracode.app.model.ConnectionProfile
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.storage.InMemorySessionCredentialRepository
import com.poracode.app.storage.SessionCredentials
import com.poracode.app.transport.RemoteApiClient
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

/**
 * Open-thread pin lifecycle on the REAL AppSession graph: switching the open
 * thread releases the previous pin (so a host-deleted old thread still reaches
 * membership confirmation and disappears), the current open thread stays
 * pinned, and close releases the pin. The reviewer's read-only probe documented
 * the orphan-pin defect; these are the permanent fixed-behavior regressions.
 */
class BoundedCatalogPinLifecycleTest {
    private lateinit var server: MockWebServer
    private var sessionScope: CoroutineScope? = null
    private lateinit var sockets: FakeSocketFactory
    private val requestCounts = ConcurrentHashMap<String, AtomicInteger>()
    private val membershipThreadIds = CopyOnWriteArrayList<List<String>>()
    private val deletedIds = CopyOnWriteArrayList<String>()

    @Before
    fun setUp() {
        server = MockWebServer()
    }

    @After
    fun tearDown() {
        sessionScope?.cancel()
        server.shutdown()
    }

    @Test
    fun openSwitchReleasesTheOldPinAndTheDeletedOldThreadConverges() = runBlocking {
        server.dispatcher = dispatcher(total = 3)
        server.start()
        val session = buildSession()
        session.bootstrap()
        awaitCondition { session.state.value.phase == AppSession.Phase.Ready && session.state.value.catalog.threadsComplete }

        session.openThread("t0")
        awaitCondition { session.state.value.openThreadId == "t0" && session.state.value.threadSnapshot != null }
        assertTrue("t0" in session.state.value.catalog.pinnedThreadIds)

        // Switch without closing: the production entry paths (archived,
        // integrations, push, deep link) all land here.
        session.openThread("t1")
        awaitCondition { session.state.value.openThreadId == "t1" && session.state.value.threadSnapshot?.thread?.id == "t1" }
        assertFalse("the previous open must release its pin", "t0" in session.state.value.catalog.pinnedThreadIds)
        assertTrue("the current open stays pinned", "t1" in session.state.value.catalog.pinnedThreadIds)

        deletedIds += "t0"
        sockets.latest!!.emitEvent(
            seq = 43,
            event = buildJsonObject { put("type", "remote-threads-changed") },
        )
        awaitCondition(timeoutMs = 10_000) {
            session.state.value.snapshot!!.threads.none { it.id == "t0" }
        }
        assertTrue(
            "the deleted old thread must reach membership confirmation",
            membershipThreadIds.flatten().contains("t0"),
        )
        assertTrue(
            "the current open thread is untouched",
            session.state.value.snapshot!!.threads.any { it.id == "t1" },
        )
        assertTrue(session.state.value.openThreadId == "t1")
    }

    @Test
    fun closeReleasesTheCurrentPinAndTheDeletedThreadDisappears() = runBlocking {
        server.dispatcher = dispatcher(total = 3)
        server.start()
        val session = buildSession()
        session.bootstrap()
        awaitCondition { session.state.value.phase == AppSession.Phase.Ready && session.state.value.catalog.threadsComplete }

        session.openThread("t1")
        awaitCondition { session.state.value.openThreadId == "t1" && session.state.value.threadSnapshot != null }
        session.closeThread()
        awaitCondition { session.state.value.openThreadId == null }
        assertTrue(session.state.value.catalog.pinnedThreadIds.isEmpty())

        deletedIds += "t1"
        sockets.latest!!.emitEvent(
            seq = 43,
            event = buildJsonObject { put("type", "remote-threads-changed") },
        )
        awaitCondition(timeoutMs = 10_000) {
            session.state.value.snapshot!!.threads.none { it.id == "t1" }
        }
        assertTrue(membershipThreadIds.flatten().contains("t1"))
    }

    @Test
    fun openRowSurvivesASuccessfulPassAndAHostDeletionUntilClosed() = runBlocking {
        server.dispatcher = dispatcher(total = 3)
        server.start()
        val session = buildSession()
        session.bootstrap()
        awaitCondition { session.state.value.phase == AppSession.Phase.Ready && session.state.value.catalog.threadsComplete }

        session.openThread("t1")
        awaitCondition { session.state.value.openThreadId == "t1" && session.state.value.threadSnapshot != null }
        assertTrue("t1" in session.state.value.catalog.pinnedThreadIds)

        // The exact missing sequence: a normal inventory pass returns the
        // open thread's row successfully BEFORE any deletion. A successful
        // page is not a pin release.
        val passesBeforeFirstReturn = requestCounts["thread-inventory"]?.get() ?: 0
        sockets.latest!!.emitEvent(
            seq = 43,
            event = buildJsonObject { put("type", "remote-threads-changed") },
        )
        awaitCondition(timeoutMs = 10_000) {
            (requestCounts["thread-inventory"]?.get() ?: 0) > passesBeforeFirstReturn &&
                session.state.value.catalog.pendingThreadsChange.not()
        }
        assertTrue(
            "the successful pass must not release the owner pin",
            "t1" in session.state.value.catalog.pinnedThreadIds,
        )
        assertTrue(session.state.value.snapshot!!.threads.any { it.id == "t1" })

        // Now the host deletes the still-open thread. The preserved pin keeps
        // it out of the confirmation read, so the open row cannot disappear.
        deletedIds += "t1"
        val passesBeforeDeletion = requestCounts["thread-inventory"]?.get() ?: 0
        sockets.latest!!.emitEvent(
            seq = 44,
            event = buildJsonObject { put("type", "remote-threads-changed") },
        )
        awaitCondition(timeoutMs = 10_000) {
            (requestCounts["thread-inventory"]?.get() ?: 0) > passesBeforeDeletion &&
                session.state.value.catalog.pendingThreadsChange.not()
        }
        delay(300)
        assertTrue("t1" in session.state.value.catalog.pinnedThreadIds)
        assertFalse(membershipThreadIds.flatten().contains("t1"))
        assertTrue(session.state.value.snapshot!!.threads.any { it.id == "t1" })

        // Closing is the owner release; the next completed pass converges the
        // deleted row through the authoritative membership confirmation.
        session.closeThread()
        awaitCondition { session.state.value.openThreadId == null }
        val passesAfterClose = requestCounts["thread-inventory"]?.get() ?: 0
        sockets.latest!!.emitEvent(
            seq = 45,
            event = buildJsonObject { put("type", "remote-threads-changed") },
        )
        awaitCondition(timeoutMs = 10_000) {
            (requestCounts["thread-inventory"]?.get() ?: 0) > passesAfterClose &&
                session.state.value.snapshot!!.threads.none { it.id == "t1" }
        }
        assertTrue(membershipThreadIds.flatten().contains("t1"))
    }

    @Test
    fun currentOpenThreadStaysOutOfTheConfirmationReadUntilClosed() = runBlocking {
        server.dispatcher = dispatcher(total = 3)
        server.start()
        val session = buildSession()
        session.bootstrap()
        awaitCondition { session.state.value.phase == AppSession.Phase.Ready && session.state.value.catalog.threadsComplete }

        session.openThread("t1")
        awaitCondition { session.state.value.openThreadId == "t1" && session.state.value.threadSnapshot != null }

        // A host-side deletion of the currently open thread while a pass is
        // requested: the pin keeps it out of the confirmation read.
        deletedIds += "t1"
        val passesBefore = requestCounts["thread-inventory"]?.get() ?: 0
        sockets.latest!!.emitEvent(
            seq = 43,
            event = buildJsonObject { put("type", "remote-threads-changed") },
        )
        awaitCondition(timeoutMs = 10_000) {
            (requestCounts["thread-inventory"]?.get() ?: 0) > passesBefore &&
                session.state.value.catalog.pendingThreadsChange.not()
        }
        delay(300)
        assertFalse(membershipThreadIds.flatten().contains("t1"))
        assertTrue(session.state.value.snapshot!!.threads.any { it.id == "t1" })

        // Closing releases the protection; the next pass confirms and removes it.
        session.closeThread()
        awaitCondition { session.state.value.openThreadId == null }
        val passesAfterClose = requestCounts["thread-inventory"]?.get() ?: 0
        sockets.latest!!.emitEvent(
            seq = 44,
            event = buildJsonObject { put("type", "remote-threads-changed") },
        )
        awaitCondition(timeoutMs = 10_000) {
            (requestCounts["thread-inventory"]?.get() ?: 0) > passesAfterClose &&
                session.state.value.snapshot!!.threads.none { it.id == "t1" }
        }
        assertTrue(membershipThreadIds.flatten().contains("t1"))
    }

    // --- harness ---

    private fun buildSession(): AppSession {
        val credentials = InMemorySessionCredentialRepository().also {
            it.credentials = SessionCredentials(
                profile = ConnectionProfile(
                    desktopId = "desktop-pins",
                    label = "Pins Host",
                    httpBaseUrl = server.url("/").toString().trimEnd('/'),
                    wsBaseUrl = server.url("/").toString().trimEnd('/'),
                    appVersion = "1.0.0",
                    scopes = listOf("session:read", "session:operate"),
                    pairedAtEpochMs = 1L,
                    protocolVersion = ProtocolConstants.REMOTE_PROTOCOL_VERSION,
                ),
                accessToken = "access-pins",
            )
        }
        sockets = FakeSocketFactory()
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

    private fun dispatcher(total: Int): Dispatcher = object : Dispatcher() {
        override fun dispatch(request: RecordedRequest): MockResponse {
            val url = request.requestUrl ?: return notFound()
            val path = url.encodedPath
            val reads = url.queryParameter("reads")
            return when {
                path.endsWith("/environment") -> ok(readFixture("environment.json"))
                path == "/api/snapshot" && reads == "bounded-v1" -> {
                    count("shell-page")
                    ok(shellBody(total))
                }
                path == "/api/threads" && url.queryParameter("mode") == "inventory" -> {
                    count("thread-inventory")
                    val cursor = url.queryParameter("cursor")
                    val start = cursor?.removePrefix("ti1.")?.toIntOrNull() ?: 0
                    val live = (start until total).map { "t$it" }.filterNot { it in deletedIds }
                    val ids = live.take(100)
                    val next = if (live.size > ids.size) "ti1.${start + ids.size}" else null
                    ok(threadListBody(ids, next, frontier = "t${total - 1}"))
                }
                path == "/api/threads" && url.queryParameter("mode") == "page" -> {
                    count("thread-page")
                    ok(threadListBody(emptyList(), null))
                }
                path == "/api/projects" -> {
                    count("project-page")
                    ok("""{"projects":[${projectJson()}],"reads":"bounded-v1","projectsNextCursor":null}""")
                }
                path == "/api/catalog/membership" -> {
                    count("membership")
                    val body = request.body.readUtf8()
                    val requested = requestedIds(body, "threadIds")
                    membershipThreadIds += requested
                    val existing = requested.filterNot { it in deletedIds }
                    ok("""{"existingThreadIds":[${existing.joinToString(",") { "\"$it\"" }}],"existingProjectIds":[]}""")
                }
                path.startsWith("/api/threads/") && path.endsWith("/history") -> {
                    count("thread-history")
                    val threadId = path.removePrefix("/api/threads/").removeSuffix("/history")
                    ok(historyBody(threadId))
                }
                path.startsWith("/api/threads/") && path.endsWith("/turns") -> notFound()
                else -> notFound()
            }
        }
    }

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
        condition: () -> Boolean,
    ) {
        val met = withTimeoutOrNull(timeoutMs) {
            while (!condition()) delay(20)
            true
        }
        if (met != true) fail("condition not met within ${timeoutMs}ms")
    }

    private fun readFixture(name: String): String =
        javaClass.classLoader!!.getResourceAsStream("fixtures/$name")!!.bufferedReader().use { it.readText() }

    private fun threadJson(threadId: String): String =
        """{"id":"$threadId","projectId":"p1","title":"Thread $threadId","agentKind":"codex",""" +
            """"config":{"model":"gpt-5"},"status":"idle","attention":"none","archived":false,""" +
            """"done":false,"starred":false,"canResumeWithConfig":true,"presentationMode":"gui",""" +
            """"createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"}"""

    private fun projectJson(): String =
        """{"id":"p1","name":"Project","location":{"kind":"posix","path":"/tmp/p1"},"createdAt":"2026-01-01T00:00:00.000Z"}"""

    private fun shellBody(total: Int): String {
        val threads = (0 until total).joinToString(",") { threadJson("t$it") }
        return buildString {
            append("""{"snapshotSeq":42,"projects":[${projectJson()}],""")
            append(""""threads":[$threads],"runtimeSummariesByThread":{},"reads":"bounded-v1",""")
            append(""""threadsNextCursor":null,"projectsNextCursor":null,""")
            append(""""updatedAt":"2026-01-01T00:00:00.000Z"}""")
        }
    }

    private fun threadListBody(ids: List<String>, nextCursor: String?, frontier: String? = null): String =
        buildString {
            append("""{"threads":[${ids.joinToString(",") { threadJson(it) }}],"runtimeSummariesByThread":{},"reads":"bounded-v1",""")
            if (frontier != null) append(""""inventoryFrontier":"$frontier",""")
            append(""""nextCursor":${nextCursor?.let { "\"$it\"" } ?: "null"}}""")
        }

    private fun historyBody(threadId: String): String =
        """{"snapshotSeq":42,"thread":${threadJson(threadId)},"runtimeItems":[],"completedTurns":[],""" +
            """"contextUsage":null,"reads":"bounded-v1","completedTurnsNextCursor":null,""" +
            """"updatedAt":"2026-01-01T00:00:00.000Z"}"""

    private fun requestedIds(requestBody: String, field: String): List<String> =
        Regex("\"$field\":\\[(.*?)]").find(requestBody)?.groupValues?.get(1)
            .orEmpty()
            .split(',')
            .map { it.trim().removeSurrounding("\"") }
            .filter { it.isNotEmpty() }
}
