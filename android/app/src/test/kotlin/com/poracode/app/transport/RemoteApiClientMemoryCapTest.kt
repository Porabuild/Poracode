package com.poracode.app.transport

import com.poracode.app.model.RemoteClientException
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import kotlinx.coroutines.runBlocking
import org.junit.Test

/**
 * Response memory cap: reject declared Content-Length > max before reading;
 * bounded-source read at max+1 for success AND error/HTML bodies.
 * Uses a reduced cap so MockWebServer can exercise oversize without OOM.
 */
class RemoteApiClientMemoryCapTest {
    private lateinit var server: MockWebServer
    private val testMaxBytes = 1024L
    private lateinit var client: RemoteApiClient

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        client = RemoteApiClient(
            endpoint = server.url("/").toString().trimEnd('/'),
            accessToken = "tok",
            client = OkHttpClient(),
            maxResponseBytes = testMaxBytes,
        )
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun declaredOversizedContentLengthRejectedWithoutReadingBody() {
        runBlocking {
        // Content-Length larger than cap; body intentionally tiny.
        // OkHttp reports contentLength from the body/source; set a body of max+1
        // via a header that MockWebServer honors by sending that many bytes would
        // be heavy — instead send a body longer than the test cap.
        val oversize = "x".repeat((testMaxBytes + 1).toInt())
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Length", oversize.length.toString())
                .setBody(oversize),
        )
        try {
            client.snapshot()
            fail("expected response_too_large")
        } catch (e: RemoteClientException) {
            assertEquals("response_too_large", e.code)
        }
        }
    }

    @Test
    fun chunkedLyingOversizedBodyRejectedWithoutOom() {
        runBlocking {
        // Chunked / no reliable Content-Length: stream max+1 bytes; bounded reader rejects.
        val oversize = "y".repeat((testMaxBytes + 1).toInt())
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setChunkedBody(oversize, 64),
        )
        try {
            client.snapshot()
            fail("expected response_too_large")
        } catch (e: RemoteClientException) {
            assertEquals("response_too_large", e.code)
        }
        }
    }

    @Test
    fun errorHtmlOversizedBodyRejected() {
        runBlocking {
        val oversize = "<html>" + "z".repeat((testMaxBytes).toInt()) + "</html>"
        server.enqueue(
            MockResponse()
                .setResponseCode(500)
                .setChunkedBody(oversize, 128),
        )
        try {
            client.snapshot()
            fail("expected response_too_large on error path")
        } catch (e: RemoteClientException) {
            assertEquals("response_too_large", e.code)
        }
        }
    }

    @Test
    fun normalSizedBodyStillReads() {
        runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(
                    """
                    {
                      "snapshotSeq": 1,
                      "projects": [],
                      "threads": [],
                      "runtimeSummariesByThread": {},
                      "updatedAt": "2026-01-01T00:00:00.000Z"
                    }
                    """.trimIndent(),
                ),
        )
        val snap = client.snapshot()
        assertEquals(1, snap.snapshotSeq)
        }
    }

    @Test
    fun maxResponseBytesConstantIs64MiB() {
        runBlocking {
        assertEquals(64L * 1024L * 1024L, RemoteApiClient.MAX_RESPONSE_BYTES)
        assertTrue(RemoteApiClient.MAX_RESPONSE_BYTES > 0)
        }
    }
}
