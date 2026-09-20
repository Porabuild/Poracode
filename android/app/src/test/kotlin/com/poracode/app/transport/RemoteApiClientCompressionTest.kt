package com.poracode.app.transport

import com.poracode.app.model.RemoteClientException
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.async
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import okio.Buffer
import okio.GzipSink
import okio.buffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.assertNull
import org.junit.Assert.fail
import org.junit.Test
import java.util.concurrent.TimeUnit

class RemoteApiClientCompressionTest {
    private fun gzip(text: String): Buffer {
        val result = Buffer()
        GzipSink(result).buffer().use { it.writeUtf8(text) }
        return result
    }

    @Test
    fun productionClientNegotiatesGzipAndKeepsCredentialResponsesSeparate() = runBlocking {
        val bodyA = """{"text":"${"漢字🌐 exact quotes ' -- ".repeat(20_000)}","session":"A"}"""
        val bodyB = bodyA.replace("\"session\":\"A\"", "\"session\":\"B\"")
        val server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val session = if (request.getHeader("Authorization") == "Bearer fixture-A") "A" else "B"
                val tag = "\"fixture-$session\""
                val response = MockResponse()
                    .setHeader("ETag", tag)
                    .setHeader("Cache-Control", "private, no-cache")
                    .setHeader("Vary", "Origin, Accept-Encoding, Authorization")
                return if (request.getHeader("If-None-Match") == tag) {
                    response.setResponseCode(304)
                } else {
                    response.setHeader("Content-Type", "application/json")
                        .setHeader("Content-Encoding", "gzip")
                        .setBody(gzip(if (session == "A") bodyA else bodyB))
                }
            }
        }
        server.start()
        try {
            val client = RemoteApiClient(server.url("/").toString(), "fixture-A")
            assertEquals(bodyA, client.requestText("/api/snapshot"))
            assertEquals(bodyA, client.requestText("/api/snapshot"))
            client.setAccessToken("fixture-B")
            assertEquals(bodyB, client.requestText("/api/snapshot"))
            val requests = List(3) { requireNotNull(server.takeRequest(5, TimeUnit.SECONDS)) }
            requests.forEach { assertTrue(it.getHeader("Accept-Encoding")?.contains("gzip") == true) }
            assertEquals("\"fixture-A\"", requests[1].getHeader("If-None-Match"))
            assertNull(requests.last().getHeader("If-None-Match"))
            assertEquals("Bearer fixture-B", requests.last().getHeader("Authorization"))
            println("[native-http] Android gzip=true decodedBytes=${bodyA.toByteArray().size} repeatedReadConditional=${requests[1].getHeader("If-None-Match") != null} credentialChangeConditional=${requests[2].getHeader("If-None-Match") != null}")
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun decodedGzipBodyStillHonorsTheProductionResponseCap() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setHeader("Content-Encoding", "gzip").setBody(gzip("x".repeat(4096))))
        server.start()
        try {
            val client = RemoteApiClient(server.url("/").toString(), maxResponseBytes = 1024)
            try {
                client.requestText("/api/snapshot")
                fail("Expected decoded-body size enforcement")
            } catch (error: RemoteClientException) {
                assertEquals("response_too_large", error.code)
            }
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun recoversOnceFromABodylessNotModifiedAndCachesTheRecovery() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setResponseCode(304))
        server.enqueue(MockResponse().setHeader("Content-Type", "application/json")
            .setHeader("ETag", "\"recovered\"").setBody("{\"value\":1}"))
        server.enqueue(MockResponse().setResponseCode(304))
        server.start()
        try {
            val client = RemoteApiClient(server.url("/").toString(), "fixture-A")
            assertEquals("{\"value\":1}", client.requestText("/api/snapshot"))
            assertEquals("{\"value\":1}", client.requestText("/api/snapshot"))
            val requests = List(3) { requireNotNull(server.takeRequest(5, TimeUnit.SECONDS)) }
            assertNull(requests[0].getHeader("If-None-Match"))
            assertNull(requests[1].getHeader("If-None-Match"))
            assertEquals("\"recovered\"", requests[2].getHeader("If-None-Match"))
        } finally { server.shutdown() }
    }

    @Test
    fun repeatedBodylessNotModifiedAndMutationsNeverLoop() = runBlocking {
        for (method in listOf("GET", "POST")) {
            val server = MockWebServer()
            server.enqueue(MockResponse().setResponseCode(304))
            server.enqueue(MockResponse().setResponseCode(304))
            server.start()
            try {
                val client = RemoteApiClient(server.url("/").toString(), "fixture-A")
                try {
                    client.requestText("/api/snapshot", method = method)
                    fail("Expected missing-body failure")
                } catch (error: RemoteClientException) {
                    assertEquals("not_modified", error.code)
                }
                assertEquals(if (method == "GET") 2 else 1, server.requestCount)
            } finally { server.shutdown() }
        }
    }

    @Test
    fun lateOldCredentialResponseCannotOverwriteTheNewCredentialsCachedBody() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setHeader("Content-Type", "application/json")
            .setHeader("ETag", "\"old\"").setBody("{\"session\":\"A\"}")
            .setBodyDelay(500, TimeUnit.MILLISECONDS))
        server.enqueue(MockResponse().setHeader("Content-Type", "application/json")
            .setHeader("ETag", "\"new\"").setBody("{\"session\":\"B\"}"))
        server.enqueue(MockResponse().setResponseCode(304))
        server.start()
        try {
            val client = RemoteApiClient(server.url("/").toString(), "fixture-A")
            val oldRead = async(Dispatchers.IO) { client.requestText("/api/snapshot") }
            requireNotNull(server.takeRequest(5, TimeUnit.SECONDS))
            client.setAccessToken("fixture-B")
            assertEquals("{\"session\":\"B\"}", client.requestText("/api/snapshot"))
            assertEquals("{\"session\":\"A\"}", oldRead.await())
            assertEquals("{\"session\":\"B\"}", client.requestText("/api/snapshot"))
            val fresh = requireNotNull(server.takeRequest(5, TimeUnit.SECONDS))
            val repeated = requireNotNull(server.takeRequest(5, TimeUnit.SECONDS))
            assertNull(fresh.getHeader("If-None-Match"))
            assertEquals("Bearer fixture-B", repeated.getHeader("Authorization"))
            assertEquals("\"new\"", repeated.getHeader("If-None-Match"))
        } finally { server.shutdown() }
    }

    @Test
    fun recoveryReadSharesTheOriginalCallDeadline() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setResponseCode(304).setHeadersDelay(400, TimeUnit.MILLISECONDS))
        server.enqueue(MockResponse().setBody("{\"ok\":true}").setBodyDelay(400, TimeUnit.MILLISECONDS))
        server.start()
        try {
            val client = RemoteApiClient(server.url("/").toString(), "fixture-A", client =
                RemoteApiClient.defaultClient().newBuilder().callTimeout(600, TimeUnit.MILLISECONDS).build())
            try {
                client.requestText("/api/snapshot")
                fail("Recovery must not receive a fresh 600ms budget")
            } catch (error: Exception) {
                assertTrue(error is CancellationException ||
                    (error is RemoteClientException && error.code == "network"))
            }
            assertEquals(2, server.requestCount)
        } finally { server.shutdown() }
    }
}
