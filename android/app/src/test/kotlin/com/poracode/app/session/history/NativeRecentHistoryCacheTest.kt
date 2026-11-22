package com.poracode.app.session.history

import com.poracode.app.model.PersistedRuntimeItem
import com.poracode.app.model.RemoteBoundedReadCodes
import com.poracode.app.model.RemoteBoundedReadResult
import com.poracode.app.model.RemoteClientException
import com.poracode.app.transport.RemoteApiClient
import com.poracode.app.transport.TlsCertPin
import java.io.File
import java.io.IOException
import java.nio.file.Files
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeRecentHistoryCacheTest {
    private fun tempDir(): File = Files.createTempDirectory("poracode-history-cache-test").toFile()

    private fun sampleTail(revision: String = "rev-1", text: String = "hello"): NativeRecentHistoryTail =
        NativeRecentHistoryTail(
            revision = revision,
            runtimeItems = listOf(
                PersistedRuntimeItem(
                    id = "item-1",
                    type = "assistant_message",
                    state = "completed",
                    streams = mapOf("assistant_text" to text),
                ),
                PersistedRuntimeItem(
                    id = "item-2",
                    type = "file_change",
                    state = "completed",
                    payload = buildJsonObject { put("path", JsonPrimitive("README.md")) },
                    detailsDeferred = true,
                ),
            ),
            runtimeNextCursor = 42,
            completedTurns = emptyList(),
            completedTurnsNextCursor = "ct1.10",
            contextUsage = null,
            historyProjection = NativeRecentHistoryTail.DETAILS_PROJECTION,
        )

    @Test
    fun persistsValidatesAndReloadsTailAcrossColdRestart() = runTest {
        val dir = tempDir()
        try {
            val cache1 = NativeRecentHistoryCache(dir)
            val ns = NativeRecentHistoryCache.digest(listOf("https://h", "desk-1", "tok-1"))
            val tail = sampleTail("rev-42", "cached reply")
            cache1.enqueue(tail, ns, "thread-1", expectedGeneration = 0L)
            cache1.flushPendingWrites()
            assertEquals(1, cache1.diskWriteCount)

            // Cold restart: fresh instance with empty memory reads from disk.
            val cache2 = NativeRecentHistoryCache(dir)
            val reloaded = cache2.read(ns, "thread-1")
            assertEquals(tail, reloaded)
            assertEquals(true, reloaded?.runtimeItems?.get(1)?.detailsDeferred)

            // Different authority namespace (token rotation / other host) misses.
            val otherNs = NativeRecentHistoryCache.digest(listOf("https://h", "desk-1", "tok-2"))
            assertNull(cache2.read(otherNs, "thread-1"))
        } finally {
            dir.deleteRecursively()
        }
    }

    @Test
    fun preservesUnknownFutureFormatVersionUntouched() {
        val dir = tempDir()
        try {
            val cache = NativeRecentHistoryCache(dir)
            val ns = NativeRecentHistoryCache.digest(listOf("https://h", "desk-1", "tok-1"))
            val key = NativeRecentHistoryCache.digest(listOf(ns, "thread-future"))
            val target = File(dir, "$key.json")
            val futureContent = """{"formatVersion":99,"futureField":"keep-me"}"""
            target.writeText(futureContent)

            assertNull(cache.read(ns, "thread-future"))
            cache.store(sampleTail(), ns, "thread-future")
            assertEquals(futureContent, target.readText())
        } finally {
            dir.deleteRecursively()
        }
    }

    @Test
    fun purgeRacesPreventStaleWriteFromReAdmitting() = runTest {
        val dir = tempDir()
        try {
            val cache = NativeRecentHistoryCache(dir)
            val ns = NativeRecentHistoryCache.digest(listOf("https://h", "desk-1", "tok-1"))
            val candidate = cache.candidate(ns, "thread-1")
            cache.purgeAll()
            cache.enqueue(sampleTail(), ns, "thread-1", expectedGeneration = candidate.generation)
            cache.flushPendingWrites()
            assertNull(cache.read(ns, "thread-1"))
        } finally {
            dir.deleteRecursively()
        }
    }

    @Test
    fun trimMemoryDropsRamButRetainsDiskTail() = runTest {
        val dir = tempDir()
        try {
            val cache = NativeRecentHistoryCache(dir)
            val ns = NativeRecentHistoryCache.digest(listOf("https://h", "desk-1", "tok-1"))
            val tail = sampleTail("rev-trim")
            cache.store(tail, ns, "thread-1")
            cache.trimMemory()
            assertEquals(tail, cache.read(ns, "thread-1"))
        } finally {
            dir.deleteRecursively()
        }
    }

    @Test
    fun interactiveHistorySendsCompactParamsAndReusesValidatedTailOnUnchanged() = runTest {
        val dir = tempDir()
        val server = MockWebServer()
        server.start()
        try {
            val fullHistoryBody = """
                {
                  "reads": "${RemoteBoundedReadCodes.CAPABILITY}",
                  "snapshotSeq": 10,
                  "thread": {
                    "id": "thread-1",
                    "projectId": "proj-1",
                    "title": "Fast thread",
                    "agentKind": "claude",
                    "presentationMode": "gui",
                    "status": "idle",
                    "attention": "none",
                    "config": {"model": "default"},
                    "createdAt": "2026-11-22T00:00:00.000Z",
                    "updatedAt": "2026-11-22T00:00:00.000Z"
                  },
                  "runtimeItems": [
                    {"id": "item-1", "type": "assistant_message", "state": "completed", "streams": {"assistant_text": "Cached text"}},
                    {"id": "item-2", "type": "file_change", "state": "completed", "payload": {"path": "a.kt"}, "streams": {}, "detailsDeferred": true}
                  ],
                  "runtimeNextCursor": 5,
                  "completedTurns": [],
                  "completedTurnsNextCursor": "ct1.2",
                  "contextUsage": null,
                  "historyProjection": "details-v1",
                  "historyCache": {"revision": "rev-abc", "unchanged": false},
                  "updatedAt": "2026-11-22T00:00:00.000Z"
                }
            """.trimIndent()
            val unchangedBody = """
                {
                  "reads": "${RemoteBoundedReadCodes.CAPABILITY}",
                  "snapshotSeq": 12,
                  "thread": {
                    "id": "thread-1",
                    "projectId": "proj-1",
                    "title": "Fast thread updated",
                    "agentKind": "claude",
                    "presentationMode": "gui",
                    "status": "idle",
                    "attention": "none",
                    "config": {"model": "default"},
                    "createdAt": "2026-11-22T00:00:00.000Z",
                    "updatedAt": "2026-11-22T00:00:01.000Z"
                  },
                  "runtimeItems": [],
                  "runtimeNextCursor": null,
                  "completedTurns": [],
                  "completedTurnsNextCursor": null,
                  "contextUsage": null,
                  "historyProjection": "details-v1",
                  "historyCache": {"revision": "rev-abc", "unchanged": true},
                  "updatedAt": "2026-11-22T00:00:01.000Z"
                }
            """.trimIndent()
            server.enqueue(MockResponse().setBody(fullHistoryBody).addHeader("Content-Type", "application/json"))
            server.enqueue(MockResponse().setBody(unchangedBody).addHeader("Content-Type", "application/json"))

            val cache = NativeRecentHistoryCache(dir)
            val api = RemoteApiClient(
                endpoint = server.url("/").toString().trimEnd('/'),
                accessToken = "tok-1",
                client = OkHttpClient(),
                recentHistoryCache = cache,
            )
            api.observeDesktopId("desktop-1")
            api.declareTerminalCursorSyncV2(true)

            val first = api.interactiveThreadHistory("thread-1", targetTimelineEntryCount = 20)
            assertTrue(first is RemoteBoundedReadResult.Bounded)
            val req1 = server.takeRequest()
            assertEquals("v1", req1.requestUrl?.queryParameter("historyCache"))
            assertNull(req1.requestUrl?.queryParameter("historyRevision"))
            assertEquals("details-v1", req1.requestUrl?.queryParameter("projection"))
            assertEquals("file_change", req1.requestUrl?.queryParameter("deferBodies"))
            assertEquals("1", req1.requestUrl?.queryParameter("omitScrollback"))
            assertEquals("20", req1.requestUrl?.queryParameter("targetTimelineEntryCount"))
            cache.flushPendingWrites()

            // Second open sends historyRevision=rev-abc and merges cached durable tail on unchanged=true.
            val second = api.interactiveThreadHistory("thread-1", targetTimelineEntryCount = 20)
            val snap2 = (second as RemoteBoundedReadResult.Bounded).page
            val req2 = server.takeRequest()
            assertEquals("rev-abc", req2.requestUrl?.queryParameter("historyRevision"))
            assertEquals(12, snap2.snapshotSeq)
            assertEquals("Fast thread updated", snap2.thread.title)
            assertEquals(listOf("item-1", "item-2"), snap2.runtimeItems.map { it.id })
            assertEquals(5, snap2.runtimeNextCursor)
            assertEquals("ct1.2", snap2.completedTurnsNextCursor)
            assertEquals(true, snap2.runtimeItems[1].detailsDeferred)
        } finally {
            server.shutdown()
            dir.deleteRecursively()
        }
    }

    @Test
    fun interactiveHistoryItemsSendsCompactProjectionAndRetries503PersistenceBusy() = runTest {
        val server = MockWebServer()
        server.start()
        try {
            server.enqueue(
                MockResponse()
                    .setResponseCode(503)
                    .addHeader("Content-Type", "application/json")
                    .setBody("""{"error":{"code":"persistence_busy","message":"Busy"}}"""),
            )
            server.enqueue(
                MockResponse()
                    .setResponseCode(200)
                    .addHeader("Content-Type", "application/json")
                    .setBody(
                        """{"reads":"${RemoteBoundedReadCodes.CAPABILITY}","items":[{"id":"old-1","type":"file_change","state":"completed","streams":{},"detailsDeferred":true}],"nextCursor":1}""",
                    ),
            )
            val api = RemoteApiClient(
                endpoint = server.url("/").toString().trimEnd('/'),
                accessToken = "tok-1",
                client = OkHttpClient(),
                recentHistoryCache = NativeRecentHistoryCache(),
            )
            api.observeDesktopId("desktop-1")
            val result = api.interactiveHistoryItems("thread-1", beforePosition = 10, limit = 100, targetTimelineEntryCount = 40)
            val page = (result as RemoteBoundedReadResult.Bounded).page
            assertEquals(2, server.requestCount)
            val req1 = server.takeRequest()
            assertEquals("details-v1", req1.requestUrl?.queryParameter("projection"))
            assertEquals("file_change", req1.requestUrl?.queryParameter("deferBodies"))
            assertEquals(listOf("old-1"), page.items.map { it.id })
            assertEquals(true, page.items.single().detailsDeferred)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun historyReadRetryPolicyMatchesContract() = runTest {
        assertTrue(NativeHistoryReadRetry.isRetryable(RemoteClientException("busy", 503, "persistence_busy")))
        assertTrue(NativeHistoryReadRetry.isRetryable(RemoteClientException("degraded", 503, "persistence_degraded")))
        assertTrue(NativeHistoryReadRetry.isRetryable(RemoteClientException("net", 0, "network")))
        assertTrue(NativeHistoryReadRetry.isRetryable(IOException("reset")))

        assertFalse(NativeHistoryReadRetry.isRetryable(RemoteClientException("timeout", 0, "timeout")))
        assertFalse(NativeHistoryReadRetry.isRetryable(RemoteClientException("unauth", 401, "unauthorized")))
        assertFalse(NativeHistoryReadRetry.isRetryable(RemoteClientException("pin", 502, TlsCertPin.MISMATCH_CODE)))
        assertFalse(NativeHistoryReadRetry.isRetryable(RemoteClientException("proto", 500, RemoteBoundedReadCodes.PROTOCOL_ERROR)))
        assertFalse(NativeHistoryReadRetry.isRetryable(CancellationException("cancelled")))

        val delays = mutableListOf<Long>()
        var calls = 0
        val value = NativeHistoryReadRetry.run(sleep = { delays += it }) {
            calls += 1
            if (calls < 3) throw RemoteClientException("busy", 503, "persistence_read_refused")
            "recovered"
        }
        assertEquals("recovered", value)
        assertEquals(listOf(250L, 500L), delays)
        assertNotNull(value)
    }
}
