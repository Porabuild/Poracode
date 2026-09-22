package com.poracode.app.transport

import com.poracode.app.model.RemoteBoundedReadResult
import com.poracode.app.model.RemoteEnvironmentDescriptor
import com.poracode.app.model.RemoteRuntimeGapAck
import com.poracode.app.protocol.ProtocolConstants
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * B1 history-notice declarations and the two declared-only recovery routes
 * over the real [RemoteApiClient] + MockWebServer: the `notices=v1`
 * declaration appears on legacy history, bounded history/items/turns and the
 * actual WS upgrade exactly when the environment descriptor advertised it,
 * and the gap read/acknowledge requests carry the generated route shapes,
 * scopes and command id.
 */
class RemoteHistoryNoticeTransportTest {
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

    // --- declarations ---

    @Test
    fun capableHostDeclaresNoticesOnLegacyHistoryAndItems() = runBlocking {
        server.enqueue(json(environmentJson(capabilityVersions = "[1]")))
        server.enqueue(json(historyBody(notice = true)))
        server.enqueue(json("""{"items":[],"nextCursor":null,"runtimeNotice":${noticeJson()}}"""))
        val client = client()
        val env = client.environment()
        assertEquals(
            listOf(RemoteEnvironmentDescriptor.RUNTIME_HISTORY_NOTICES_VERSION),
            env.capabilities?.runtimeHistoryNotices?.versions,
        )
        assertTrue(client.runtimeHistoryNoticesSupported)
        server.takeRequest()

        val snapshot = client.threadHistory(threadId = "t1", targetTimelineEntryCount = 40)
        assertEquals("t1", snapshot.thread.id)
        assertNotNull("the declared tail must project its runtimeNotice", snapshot.runtimeNotice)
        assertEquals(3L, snapshot.runtimeNotice?.refusedEvents)
        assertEquals(
            "/api/threads/t1/history?runtimePage=1&targetTimelineEntryCount=40&notices=v1",
            server.takeRequest().path,
        )

        val page = client.threadRuntimeItemsPage(
            threadId = "t1",
            beforePosition = 12,
            limit = 100,
            targetTimelineEntryCount = 40,
        )
        assertNotNull("the declared item page must project its runtimeNotice", page.runtimeNotice)
        assertEquals(
            "/api/threads/t1/history/items?limit=100&beforePosition=12&targetTimelineEntryCount=40&notices=v1",
            server.takeRequest().path,
        )
    }

    @Test
    fun capableHostDeclaresNoticesOnBoundedReads() = runBlocking {
        server.enqueue(json(environmentJson(capabilityVersions = "[1]")))
        server.enqueue(json(boundedHistoryBody(notice = true)))
        server.enqueue(json("""{"items":[],"nextCursor":null,"reads":"bounded-v1","runtimeNotice":${noticeJson()}}"""))
        server.enqueue(json(turnsBody()))
        val client = client()
        client.environment()
        server.takeRequest()

        val tail = client.bounded.boundedThreadHistory(threadId = "t1", completedTurnsLimit = 200)
        val boundedTail = tail as RemoteBoundedReadResult.Bounded
        assertNotNull(boundedTail.page.runtimeNotice)
        assertEquals(
            "/api/threads/t1/history?reads=bounded-v1&runtimePage=1&completedTurnsLimit=200&maxBytes=33554432&maxDecodeBytes=67108864&notices=v1",
            server.takeRequest().path,
        )

        val items = client.bounded.boundedThreadHistoryItems(threadId = "t1", beforePosition = 30, limit = 500)
        assertNotNull((items as RemoteBoundedReadResult.Bounded).page.runtimeNotice)
        assertEquals(
            "/api/threads/t1/history/items?reads=bounded-v1&limit=500&beforePosition=30&maxBytes=33554432&maxDecodeBytes=67108864&notices=v1",
            server.takeRequest().path,
        )

        client.bounded.boundedThreadTurns(threadId = "t1", cursor = "ct1.a", limit = 200)
        assertEquals(
            "/api/threads/t1/turns?reads=bounded-v1&limit=200&cursor=ct1.a&maxBytes=33554432&maxDecodeBytes=67108864&notices=v1",
            server.takeRequest().path,
        )
    }

    @Test
    fun incapableAndFutureOnlyHostsStayUndeclared() = runBlocking {
        server.enqueue(json(environmentJson(capabilityVersions = null)))
        server.enqueue(json(historyBody(notice = false, reads = null)))
        server.enqueue(json(environmentJson(capabilityVersions = "[2]")))
        server.enqueue(json(historyBody(notice = false, reads = null)))
        val client = client()

        client.environment()
        server.takeRequest()
        assertFalse(client.runtimeHistoryNoticesSupported)
        assertNull(client.threadHistory(threadId = "t1").runtimeNotice)
        assertEquals("/api/threads/t1/history?runtimePage=1", server.takeRequest().path)

        client.environment()
        server.takeRequest()
        assertFalse("a future-only version must not unlock this generation", client.runtimeHistoryNoticesSupported)
        client.threadHistory(threadId = "t1")
        assertEquals("/api/threads/t1/history?runtimePage=1", server.takeRequest().path)
    }

    @Test
    fun websocketUrlDeclaresNoticesExactlyWhenCapable() = runBlocking {
        server.enqueue(json(environmentJson(capabilityVersions = "[1]")))
        server.enqueue(json(environmentJson(capabilityVersions = null)))
        val client = client()

        client.environment()
        val declared = client.websocketUrl(
            "ticket-1",
            lastSeenSeq = 7,
            threadItemInterests = listOf("t1"),
        )
        assertTrue("notices=v1" in declared)
        assertTrue("the upgrade keeps its ticket", "ticket=ticket-1" in declared)
        assertTrue("the upgrade keeps lastSeenSeq", "lastSeenSeq=7" in declared)
        assertTrue("the upgrade keeps thread interests", "threadItemInterests" in declared)

        client.environment()
        val undeclared = client.websocketUrl("ticket-2", lastSeenSeq = null)
        assertFalse("notices=v1" in undeclared)
    }

    @Test
    fun explicitDeclarationToggleDrivesReadsWithoutAnEnvironmentFetch() = runBlocking {
        server.enqueue(json(historyBody(notice = false, reads = null)))
        server.enqueue(json(historyBody(notice = false, reads = null)))
        val client = client()

        client.declareRuntimeHistoryNotices(true)
        client.threadHistory(threadId = "t1")
        assertEquals("/api/threads/t1/history?runtimePage=1&notices=v1", server.takeRequest().path)

        client.declareRuntimeHistoryNotices(false)
        client.threadHistory(threadId = "t1")
        assertEquals("/api/threads/t1/history?runtimePage=1", server.takeRequest().path)
    }

    // --- declared-only gap routes ---

    @Test
    fun runtimeGapReadUsesDeclaredRouteAndProjectsDescriptor() = runBlocking {
        server.enqueue(json("""{"gap":${descriptorJson()},"notice":${noticeJson()}}"""))
        val client = client()
        client.declareRuntimeHistoryNotices(true)

        val read = client.threadRuntimeGap("t1")

        assertEquals("gap2:e11111111-1111-4111-8111-111111111111", read.gap?.token)
        assertEquals("exact", read.gap?.source)
        assertEquals("thread-events", read.gap?.reason)
        assertEquals(3L, read.gap?.refusedEvents)
        assertEquals(1L, read.notice?.acknowledgedCount)
        val recorded = server.takeRequest()
        assertEquals("GET", recorded.method)
        assertEquals("/api/threads/t1/runtime/gap?notices=v1", recorded.path)
        assertEquals("Bearer access-secret", recorded.getHeader("Authorization"))
    }

    @Test
    fun runtimeGapAcknowledgeCarriesCommandIdAndProjectsEveryOutcome() = runBlocking {
        server.enqueue(
            json(
                """{"outcome":"applied","notice":${noticeJson()},"descriptor":${descriptorJson()},"supersededAcceptedEvents":2}""",
            ),
        )
        server.enqueue(json("""{"outcome":"already","notice":${noticeJson()}}"""))
        server.enqueue(json("""{"outcome":"stale","current":${descriptorJson("gap2:s7")}}"""))
        server.enqueue(json("""{"outcome":"stale","current":null}"""))
        val client = client()
        client.declareRuntimeHistoryNotices(true)

        val applied = client.acknowledgeThreadRuntimeGap("t1", "gap2:e11111111-1111-4111-8111-111111111111", "ack-1")
        assertTrue(applied is RemoteRuntimeGapAck.Applied)
        assertEquals(2L, (applied as RemoteRuntimeGapAck.Applied).supersededAcceptedEvents)
        val appliedRequest = server.takeRequest()
        assertEquals("POST", appliedRequest.method)
        assertEquals("/api/threads/t1/runtime/gap/acknowledge?notices=v1", appliedRequest.path)
        assertEquals("ack-1", appliedRequest.getHeader("x-poracode-command-id"))
        assertEquals(
            """{"episodeToken":"gap2:e11111111-1111-4111-8111-111111111111","threadId":"t1"}""",
            appliedRequest.body.readUtf8(),
        )

        val already = client.acknowledgeThreadRuntimeGap("t1", "token", "ack-2")
        assertTrue(already is RemoteRuntimeGapAck.Already)

        val stale = client.acknowledgeThreadRuntimeGap("t1", "token", "ack-3")
        assertTrue(stale is RemoteRuntimeGapAck.Stale)
        assertEquals("gap2:s7", (stale as RemoteRuntimeGapAck.Stale).current?.token)

        val clean = client.acknowledgeThreadRuntimeGap("t1", "token", "ack-4")
        assertTrue(clean is RemoteRuntimeGapAck.Stale)
        assertNull((clean as RemoteRuntimeGapAck.Stale).current)
    }

    // --- helpers ---

    private fun json(body: String): MockResponse = MockResponse()
        .setResponseCode(200)
        .setHeader("Content-Type", "application/json")
        .setBody(body)

    private fun noticeJson(): String =
        """{"kind":"history-incomplete","source":"exact","reason":"thread-events",""" +
            """"refusedEvents":3,"refusedBytes":1024,"acknowledgedCount":1,""" +
            """"firstAcknowledgedAt":100,"lastAcknowledgedAt":200}"""

    private fun descriptorJson(token: String = "gap2:e11111111-1111-4111-8111-111111111111"): String =
        """{"token":"$token","source":"exact","reason":"thread-events",""" +
            """"refusedEvents":3,"refusedBytes":1024,"createdAt":100}"""

    private fun threadJson(id: String): String =
        """{"id":"$id","projectId":"p1","title":"Thread $id","agentKind":"codex",""" +
            """"config":{"model":"gpt-5"},"status":"idle","attention":"none","archived":false,""" +
            """"done":false,"starred":false,"canResumeWithConfig":true,"presentationMode":"gui",""" +
            """"createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"}"""

    private fun historyBody(notice: Boolean, reads: String? = null): String = buildString {
        append("""{"snapshotSeq":9,"thread":${threadJson("t1")},"runtimeItems":[],""")
        append(""""completedTurns":[],"contextUsage":null,""")
        if (notice) append(""""runtimeNotice":${noticeJson()},""")
        if (reads != null) append(""""reads":"$reads",""")
        append(""""updatedAt":"2026-01-01T00:00:00.000Z","completedTurnsNextCursor":null}""")
    }

    private fun boundedHistoryBody(notice: Boolean): String = buildString {
        append("""{"snapshotSeq":9,"thread":${threadJson("t1")},"runtimeItems":[],""")
        append(""""completedTurns":[],"contextUsage":null,"reads":"bounded-v1",""")
        if (notice) append(""""runtimeNotice":${noticeJson()},""")
        append(""""updatedAt":"2026-01-01T00:00:00.000Z","completedTurnsNextCursor":null}""")
    }

    private fun turnsBody(): String =
        """{"turns":[],"completedTurnsNextCursor":null,"reads":"bounded-v1"}"""

    private fun environmentJson(capabilityVersions: String?): String {
        val capabilities = capabilityVersions
            ?.let { """"capabilities":{"runtimeHistoryNotices":{"versions":$it}}""" }
            ?.let { "," + it }
            .orEmpty()
        return """
            {
              "protocolVersion": ${ProtocolConstants.REMOTE_PROTOCOL_VERSION},
              "hostMode": "desktop",
              "desktopId": "desktop-fixture-001",
              "label": "Fixture Mac",
              "appVersion": "3.0.0-fixture",
              "platform": "darwin",
              "auth": {
                "policy": "remote-reachable",
                "bootstrapMethods": ["one-time-token"],
                "sessionMethods": ["bearer-access-token"],
                "scopes": ["session:read", "session:operate"]
              },
              "endpoints": {
                "httpBaseUrl": "https://poracode-host.example.test/",
                "wsBaseUrl": "wss://poracode-host.example.test/"
              }$capabilities
            }
        """.trimIndent()
    }
}
