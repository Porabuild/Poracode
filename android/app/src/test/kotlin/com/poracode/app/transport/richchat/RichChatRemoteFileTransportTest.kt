package com.poracode.app.transport.richchat

import com.poracode.app.chat.RichChatFileAccess
import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.transport.RemoteApiClient
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class RichChatRemoteFileTransportTest {
    private val location = PosixProjectLocation("/repo/app")
    private val access = RichChatFileAccess.Project("out/release.zip")

    private fun clientFor(server: MockWebServer): RemoteApiClient =
        RemoteApiClient(
            endpoint = server.url("/").toString(),
            accessToken = "token-1",
            client = RemoteApiClient.defaultClient(),
        )

    private fun ticketJson(ticket: String = "pc_media_${"a".repeat(43)}") =
        "{\"ticket\":\"$ticket\",\"contentType\":\"application/octet-stream\"," +
            "\"expiresAt\":\"2026-01-01T00:00:00Z\",\"modifiedAtMs\":0,\"sizeBytes\":4}"

    @Test
    fun mintStreamReleaseRoundTrip() = runTest {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody(ticketJson()))
        server.enqueue(
            MockResponse()
                .setBody("ZIP!")
                .addHeader("Content-Type", "application/octet-stream")
                .addHeader("Content-Disposition", "attachment; filename=\"release.zip\""),
        )
        server.enqueue(MockResponse().setBody("{\"ok\":true}"))
        server.start()
        val dir = kotlin.io.path.createTempDirectory("chat-file-test").toFile()
        try {
            val executor = RichChatRemoteFileExecutor(clientFor(server))
            val result = executor.downloadRichFile(access, location, "release.zip", dir)

            // Mint: POST attachment request with disposition + project access
            val mint = server.takeRequest()
            assertEquals("POST", mint.method)
            assertEquals("/api/files/media-ticket", mint.path)
            assertEquals("Bearer token-1", mint.getHeader("Authorization"))
            val mintBody = mint.body.readUtf8()
            assertTrue(mintBody.contains("\"access\":\"project\""))
            assertTrue(mintBody.contains("\"disposition\":\"attachment\""))
            assertTrue(mintBody.contains("\"path\":\"out/release.zip\""))

            // Download: authenticated GET on the resolved media route
            val fetch = server.takeRequest()
            assertEquals("GET", fetch.method)
            assertTrue(fetch.path!!.startsWith("/api/files/media?"))
            assertTrue(fetch.path!!.contains("ticket=pc_media_"))
            assertEquals("Bearer token-1", fetch.getHeader("Authorization"))

            // Release: POST with the ticket
            val release = server.takeRequest()
            assertEquals("POST", release.method)
            assertEquals("/api/files/media-release", release.path)
            assertTrue(release.body.readUtf8().contains("pc_media_"))

            // File landed in the unique private directory with expected bytes
            assertEquals("release.zip", result.fileName)
            assertEquals(4L, result.sizeBytes)
            assertEquals("ZIP!", result.file.readText())
            assertTrue(result.directory.parentFile == dir)
        } finally {
            dir.deleteRecursively()
            server.shutdown()
        }
    }

    @Test
    fun nonAttachmentResponseFailsClosedAndReleases() = runTest {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody(ticketJson()))
        // Old inline host: disposition missing -> reject, release, no file
        server.enqueue(MockResponse().setBody("<html>error</html>").addHeader("Content-Type", "text/html"))
        server.enqueue(MockResponse().setBody("{\"ok\":true}"))
        server.start()
        val dir = kotlin.io.path.createTempDirectory("chat-file-test").toFile()
        try {
            val executor = RichChatRemoteFileExecutor(clientFor(server))
            try {
                executor.downloadRichFile(access, location, "release.zip", dir)
                fail("non-attachment must fail")
            } catch (_: Exception) {
            }
            server.takeRequest() // mint
            server.takeRequest() // media fetch
            val release = server.takeRequest()
            assertEquals("/api/files/media-release", release.path)
            // No partial file leaks in the destination tree
            val leftovers = dir.listFiles()?.flatMap { it.listFiles()?.toList() ?: listOf(it) }
            assertTrue(leftovers.isNullOrEmpty() || leftovers.all { !it.name.endsWith(".zip") })
        } finally {
            dir.deleteRecursively()
            server.shutdown()
        }
    }

    @Test
    fun forbiddenMediaResponsePreservesStatusAndReleases() = runTest {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody(ticketJson()))
        server.enqueue(MockResponse().setResponseCode(403).setBody("{\"error\":\"forbidden\"}"))
        server.enqueue(MockResponse().setBody("{\"ok\":true}"))
        server.start()
        val dir = kotlin.io.path.createTempDirectory("chat-file-test").toFile()
        try {
            val executor = RichChatRemoteFileExecutor(clientFor(server))
            try {
                executor.downloadRichFile(access, location, "release.zip", dir)
                fail("403 must fail")
            } catch (error: Exception) {
                // Status evidence survives the bounded decoder, not a generic
                // invalid-response flattening.
                val status = (error as? com.poracode.app.model.RemoteClientException)?.status
                assertEquals(403, status)
            }
            server.takeRequest() // mint
            server.takeRequest() // media fetch
            assertEquals("/api/files/media-release", server.takeRequest().path)
            assertTrue(dir.listFiles().isNullOrEmpty())
        } finally {
            dir.deleteRecursively()
            server.shutdown()
        }
    }

    @Test
    fun emptyFileIsValidAndReleased() = runTest {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody(ticketJson()))
        server.enqueue(
            MockResponse()
                .setBody("")
                .addHeader("Content-Type", "application/octet-stream")
                .addHeader("Content-Disposition", "attachment; filename=\"empty.zip\""),
        )
        server.enqueue(MockResponse().setBody("{\"ok\":true}"))
        server.start()
        val dir = kotlin.io.path.createTempDirectory("chat-file-test").toFile()
        try {
            val executor = RichChatRemoteFileExecutor(clientFor(server))
            val result = executor.downloadRichFile(access, location, "empty.zip", dir)
            assertEquals(0L, result.sizeBytes)
            assertTrue(result.file.exists())
            server.takeRequest(); server.takeRequest()
            assertEquals("/api/files/media-release", server.takeRequest().path)
        } finally {
            dir.deleteRecursively()
            server.shutdown()
        }
    }

    @Test
    fun releaseFailureDoesNotDiscardCompletedFile() = runTest {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody(ticketJson()))
        server.enqueue(
            MockResponse()
                .setBody("ZIP!")
                .addHeader("Content-Type", "application/octet-stream")
                .addHeader("Content-Disposition", "attachment; filename=\"release.zip\""),
        )
        server.enqueue(MockResponse().setResponseCode(500).setBody("release down"))
        server.start()
        val dir = kotlin.io.path.createTempDirectory("chat-file-test").toFile()
        try {
            val executor = RichChatRemoteFileExecutor(clientFor(server))
            val result = executor.downloadRichFile(access, location, "release.zip", dir)
            // Best-effort release failure must not discard the file.
            assertEquals("ZIP!", result.file.readText())
            assertTrue(result.directory.exists())
        } finally {
            dir.deleteRecursively()
            server.shutdown()
        }
    }

    @Test
    fun redirectIsNotFollowed() = runTest {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody(ticketJson()))
        server.enqueue(MockResponse().setResponseCode(302).addHeader("Location", "http://evil/x"))
        server.enqueue(MockResponse().setBody("{\"ok\":true}"))
        server.start()
        val dir = kotlin.io.path.createTempDirectory("chat-file-test").toFile()
        try {
            val executor = RichChatRemoteFileExecutor(clientFor(server))
            try {
                executor.downloadRichFile(access, location, "release.zip", dir)
                fail("redirect must fail")
            } catch (_: Exception) {
            }
            server.takeRequest(); server.takeRequest()
            assertEquals("/api/files/media-release", server.takeRequest().path)
            assertTrue(dir.listFiles().isNullOrEmpty())
        } finally {
            dir.deleteRecursively()
            server.shutdown()
        }
    }

    @Test
    fun cancelDuringReleaseStillCleansCompletedDirectory() = runTest {
        // Media bytes land, then the coroutine is cancelled while the release
        // request is in flight — the completed directory must be removed and
        // exactly one release must still go out.
        val releaseStarted = java.util.concurrent.CountDownLatch(1)
        val releaseUnblock = java.util.concurrent.CountDownLatch(1)
        val releaseHits = java.util.concurrent.atomic.AtomicInteger(0)
        val server = MockWebServer()
        server.dispatcher = object : okhttp3.mockwebserver.Dispatcher() {
            override fun dispatch(request: okhttp3.mockwebserver.RecordedRequest): MockResponse =
                when {
                    request.path == "/api/files/media-ticket" ->
                        MockResponse().setBody(ticketJson())
                    request.path?.startsWith("/api/files/media?") == true ->
                        MockResponse()
                            .setBody("ZIP!")
                            .addHeader("Content-Type", "application/octet-stream")
                            .addHeader("Content-Disposition", "attachment; filename=\"release.zip\"")
                    request.path == "/api/files/media-release" -> {
                        releaseHits.incrementAndGet()
                        releaseStarted.countDown()
                        releaseUnblock.await(10, java.util.concurrent.TimeUnit.SECONDS)
                        MockResponse().setBody("{\"ok\":true}")
                    }
                    else -> MockResponse().setResponseCode(404)
                }
        }
        server.start()
        val dir = kotlin.io.path.createTempDirectory("chat-file-test").toFile()
        try {
            val executor = RichChatRemoteFileExecutor(clientFor(server))
            // The child runs on real IO so the blocking release latch below
            // cannot deadlock the runTest scheduler.
            val job = CoroutineScope(Dispatchers.IO).launch {
                try {
                    executor.downloadRichFile(access, location, "release.zip", dir)
                } catch (_: Exception) {
                }
            }
            // Release request is in flight; cancel the download child now.
            assertTrue(releaseStarted.await(10, java.util.concurrent.TimeUnit.SECONDS))
            job.cancel()
            releaseUnblock.countDown()
            job.join()
            assertEquals(1, releaseHits.get())
            assertTrue(dir.listFiles().isNullOrEmpty())
        } finally {
            dir.deleteRecursively()
            server.shutdown()
        }
    }

    @Test
    fun oldHostWithoutRouteFailsClosed() = runTest {
        val server = MockWebServer()
        server.enqueue(MockResponse().setResponseCode(404).setBody("not found"))
        server.start()
        val dir = kotlin.io.path.createTempDirectory("chat-file-test").toFile()
        try {
            val executor = RichChatRemoteFileExecutor(clientFor(server))
            try {
                executor.downloadRichFile(access, location, "release.zip", dir)
                fail("404 must fail")
            } catch (_: Exception) {
            }
            // Only the mint ran — no media fetch, no fabricated file
            val requests = (0 until server.requestCount).map { server.takeRequest() }
            assertEquals(1, requests.size)
            assertTrue(dir.listFiles().isNullOrEmpty())
        } finally {
            dir.deleteRecursively()
            server.shutdown()
        }
    }
}
