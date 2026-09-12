package com.poracode.app.transport

import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import kotlinx.coroutines.runBlocking
import org.junit.Test

/**
 * OkHttp throws before I/O when POST is built with a null body. Websocket ticket
 * uses an explicit empty body; interrupt uses its canonical generated `{}` request.
 */
class RemoteApiClientEmptyBodyTest {
    private lateinit var server: MockWebServer
    private lateinit var client: RemoteApiClient

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        client = RemoteApiClient(
            endpoint = server.url("/").toString().trimEnd('/'),
            accessToken = "test-token",
            client = OkHttpClient(),
        )
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun websocketTicketPostsExplicitEmptyBody() {
        runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody("""{"ticket":"lc_ws_test","expiresAt":"2099-01-01T00:00:00.000Z"}"""),
        )
        val ticket = client.websocketTicket()
        assertEquals("lc_ws_test", ticket)

        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        assertTrue(recorded.path!!.endsWith("/api/auth/websocket-ticket"))
        // Body present (empty), not null — OkHttp would have thrown otherwise.
        assertNotNull(recorded.body)
        assertEquals(0L, recorded.bodySize)
        assertEquals("Bearer test-token", recorded.getHeader("Authorization"))
        }
    }

    @Test
    fun interruptPostsExplicitEmptyBody() {
        runBlocking {
        server.enqueue(MockResponse().setResponseCode(200).setBody("{\"ok\":true}"))
        client.interruptThread("thread-1")

        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        assertTrue(recorded.path!!.contains("/api/threads/"))
        assertTrue(recorded.path!!.endsWith("/interrupt"))
        assertNotNull(recorded.body)
        assertEquals("{}", recorded.body.readUtf8())
        }
    }

    @Test
    fun sendWithJsonBodyStillPostsPayload() {
        runBlocking {
        server.enqueue(MockResponse().setResponseCode(200).setBody("{\"ok\":true}"))
        client.sendThreadInput(
            threadId = "t1",
            prompt = "hi",
            config = com.poracode.app.model.ThreadConfig(),
        )
        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        val body = recorded.body.readUtf8()
        assertTrue(body.contains("\"prompt\""))
        assertTrue(body.contains("hi"))
        }
    }
}
