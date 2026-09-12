package com.poracode.app.transport.richchat

import com.poracode.app.transport.ForegroundNetworkGate
import com.poracode.app.transport.RemoteApiClient
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okio.Buffer
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RichChatRemoteBodyExecutorTest {
    @Test
    fun productionClientStreamsRawUploadWithBearerAndGeneratedQuery() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody("""{"path":"/stored/photo.png"}"""))
        server.start()
        try {
            val client = RichChatRemoteClient(
                endpoint = server.url("/relay/base").toString(),
                accessToken = "access-secret",
                client = OkHttpClient(),
                networkGate = ForegroundNetworkGate(),
            )
            val bytes = byteArrayOf(0, 1, 2, 0x7F)
            val path = client.transport.uploadAttachment(
                threadId = "thread /東京",
                name = "photo one.png",
                contentType = "image/png",
                body = AttachmentUploadBody.bytes(bytes),
            )

            assertEquals("/stored/photo.png", path)
            val request = server.takeRequest()
            assertEquals("POST", request.method)
            assertEquals("/relay/base/api/files/attachment", request.requestUrl!!.encodedPath)
            assertEquals("thread /東京", request.requestUrl!!.queryParameter("threadId"))
            assertEquals("photo one.png", request.requestUrl!!.queryParameter("name"))
            assertEquals("Bearer access-secret", request.getHeader("Authorization"))
            assertEquals("image/png", request.getHeader("Content-Type"))
            assertArrayEquals(bytes, request.body.readByteArray())
            assertEquals(1, server.requestCount)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun productionClientFetchesBinaryWithoutUtf8Conversion() = runBlocking {
        val server = MockWebServer()
        val bytes = byteArrayOf(0, 0xFF.toByte(), 1, 2, 3)
        server.enqueue(
            MockResponse()
                .setHeader("Content-Type", "image/png")
                .setBody(Buffer().write(bytes)),
        )
        server.start()
        try {
            val client = RichChatRemoteClient(
                endpoint = server.url("/base").toString(),
                accessToken = "access-secret",
                client = OkHttpClient(),
                networkGate = ForegroundNetworkGate(),
            )
            val response = client.loadLocalImage("/tmp/画像 one.png")
            assertArrayEquals(bytes, response.bytes)
            assertEquals("image/png", response.contentType)
            val request = server.takeRequest()
            assertEquals("GET", request.method)
            assertEquals("/base/api/files/image", request.requestUrl!!.encodedPath)
            assertEquals("/tmp/画像 one.png", request.requestUrl!!.queryParameter("path"))
            assertEquals("Bearer access-secret", request.getHeader("Authorization"))
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun chunkedBinaryOverCapIsRejectedWithoutReturningPartialBytes() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setChunkedBody("1234", 1))
        server.start()
        try {
            val http = RemoteApiClient(
                endpoint = server.url("/base").toString(),
                accessToken = "access-secret",
                client = OkHttpClient(),
                maxResponseBytes = 3,
                networkGate = ForegroundNetworkGate(),
            )
            val executor = RichChatRemoteBodyExecutor(http)
            val error = runCatching {
                executor.execute(
                    BinaryRequestPlan(
                        method = "GET",
                        path = "/api/files/image",
                        query = listOf("path" to "/tmp/a.png"),
                        authKind = RichChatAuthKind.BEARER_OR_QUERY,
                        bodyKind = RichChatBodyKind.EMPTY,
                    ),
                )
            }.exceptionOrNull()
            assertTrue(error is RichChatInvalidResponseException)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun binaryRejectsMissingOrNonImageContentType() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setHeader("Content-Type", "text/html").setBody("secret"))
        server.start()
        try {
            val client = RichChatRemoteClient(
                endpoint = server.url("/base").toString(),
                accessToken = "access-secret",
                client = OkHttpClient(),
                networkGate = ForegroundNetworkGate(),
            )
            val error = runCatching { client.loadLocalImage("/tmp/a.png") }.exceptionOrNull()
            assertTrue(error is RichChatInvalidResponseException)
            assertTrue(!error?.message.orEmpty().contains("secret"))
        } finally {
            server.shutdown()
        }
    }
}
