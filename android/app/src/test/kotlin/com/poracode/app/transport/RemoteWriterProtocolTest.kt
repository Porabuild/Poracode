package com.poracode.app.transport

import com.poracode.app.protocol.ProtocolConstants
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

class RemoteWriterProtocolTest {
    private lateinit var server: MockWebServer
    private lateinit var client: RemoteApiClient

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        client = RemoteApiClient(server.url("/").toString(), "fixture-token", OkHttpClient())
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun authorizedNonGETRequestsDeclareTheCompiledProtocol() = runBlocking {
        for (method in listOf("POST", "DELETE", "PATCH", "PUT")) {
            server.enqueue(MockResponse().setResponseCode(200).setBody("{}"))
            client.requestText(
                "/api/settings",
                method = method,
                extraHeaders = mapOf(ProtocolConstants.PROTOCOL_VERSION_HEADER to "12"),
            )
            val request = server.takeRequest()
            assertEquals(ProtocolConstants.REMOTE_PROTOCOL_VERSION.toString(), request.getHeader(ProtocolConstants.PROTOCOL_VERSION_HEADER))
            assertEquals("Bearer fixture-token", request.getHeader("Authorization"))
        }
    }

    @Test
    fun readsAndAuthFreeRequestsDoNotAcquireADeclaration() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(200).setBody("{}"))
        client.requestText("/api/snapshot")
        assertNull(server.takeRequest().getHeader(ProtocolConstants.PROTOCOL_VERSION_HEADER))
        server.enqueue(MockResponse().setResponseCode(200).setBody("{}"))
        client.requestText("/oauth/token", method = "POST", authorized = false)
        val exchange = server.takeRequest()
        assertNull(exchange.getHeader(ProtocolConstants.PROTOCOL_VERSION_HEADER))
        assertNull(exchange.getHeader("Authorization"))
    }

    @Test
    fun rawUploadsAndReadTicketPOSTsCarryTheDeclaration() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(200).setBody("{}"))
        client.requestRawText("/api/attachments", method = "POST", body = "raw".toRequestBody())
        assertEquals(ProtocolConstants.REMOTE_PROTOCOL_VERSION.toString(), server.takeRequest().getHeader(ProtocolConstants.PROTOCOL_VERSION_HEADER))
        server.enqueue(MockResponse().setResponseCode(200).setBody("{}"))
        client.requestText("/api/auth/websocket-ticket", method = "POST")
        assertEquals(ProtocolConstants.REMOTE_PROTOCOL_VERSION.toString(), server.takeRequest().getHeader(ProtocolConstants.PROTOCOL_VERSION_HEADER))
    }
}
