package com.poracode.app.transport

import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoteHistoryChangesAndImageCacheTest {
    @Test
    fun binaryReadCacheReusesOnEtagRespectsNoStoreAndClears() {
        val cache = RemoteBinaryReadCache(maxBytes = 1024, maxEntries = 2)
        val url = "https://host.test/api/files/image?path=%2Fa.png&variant=card"
        val first = cache.capture(url)
        assertNull(first.entry)

        val response = Response.Builder()
            .request(Request.Builder().url(url).build())
            .protocol(Protocol.HTTP_1_1)
            .code(200)
            .message("OK")
            .header("ETag", "\"boot-img1\"")
            .header("Cache-Control", "private, max-age=300")
            .body(ByteArray(0).toResponseBody())
            .build()
        val payload = RemoteBinaryResponse(byteArrayOf(1, 2, 3, 4), "image/png")
        cache.store(first, response, payload)

        val second = cache.capture(url)
        assertEquals("\"boot-img1\"", second.entry?.etag)
        assertArrayEquals(payload.bytes, cache.value(second)?.bytes)

        val noStoreUrl = "https://host.test/api/files/image?path=%2Fsecret.png"
        val noStoreResponse = response.newBuilder()
            .request(Request.Builder().url(noStoreUrl).build())
            .header("Cache-Control", "no-store")
            .build()
        cache.store(cache.capture(noStoreUrl), noStoreResponse, payload)
        assertNull(cache.capture(noStoreUrl).entry)

        cache.clear()
        assertNull(cache.value(second))
        assertNull(cache.capture(url).entry)
    }

    @Test
    fun historyChangesContractEncodesCompactQueryAndValidatesEvents() {
        val query = RemoteHistoryChangesContract.query(
            cursor = "hr1.cursor",
            afterSeq = 10,
            targetTimelineEntryCount = 20,
            omitScrollback = true,
            maxBytes = 1_048_576,
            maxDecodeBytes = 4_194_304,
        ).toMap()
        assertEquals("bounded-v1", query["reads"])
        assertEquals("v1", query["notices"])
        assertEquals("hr1.cursor", query["cursor"])
        assertEquals("10", query["afterSeq"])
        assertEquals("details-v1", query["projection"])
        assertEquals("file_change", query["deferBodies"])
        assertEquals("20", query["targetTimelineEntryCount"])
        assertEquals("1", query["omitScrollback"])

        val raw = """
            {
              "kind": "events",
              "snapshotSeq": 12,
              "runtimeResumeCursor": "hr1.next",
              "thread": {
                "id": "t1",
                "projectId": "p1",
                "title": "Warm",
                "agentKind": "codex",
                "config": {"model": "default"},
                "status": "idle",
                "attention": "none",
                "canResumeWithConfig": true,
                "createdAt": "2026-11-17T00:00:00Z",
                "updatedAt": "2026-11-17T00:00:01Z"
              },
              "completedTurns": [],
              "completedTurnsNextCursor": null,
              "contextUsage": null,
              "backgroundTasks": [],
              "followUpQueue": null,
              "batches": [
                {
                  "seq": 11,
                  "events": [
                    {
                      "type": "content.delta",
                      "threadId": "t1",
                      "itemId": "m2",
                      "stream": "assistant_text",
                      "delta": "Delta"
                    }
                  ]
                }
              ]
            }
        """.trimIndent()
        val outcome = RemoteHistoryChangesContract.parseResponse(raw, expectedThreadId = "t1")
        assertTrue(outcome is RemoteHistoryResumeOutcome.Events)
        val events = outcome as RemoteHistoryResumeOutcome.Events
        assertEquals(12, events.snapshotSeq)
        assertEquals("hr1.next", events.runtimeResumeCursor)
        assertEquals(1, events.batches.size)
        assertEquals(11, events.batches.first().seq)
    }
}
