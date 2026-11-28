package com.poracode.app.transport

import com.poracode.app.protocol.RemoteSocketPolicy
import com.poracode.app.transport.environments.environmentWebSocketTicket
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

/**
 * Verifies WebSocket ticket minting is bounded to [RemoteSocketPolicy.CONNECT_TIMEOUT_MS]
 * (15s) while other API requests retain [RemoteSocketPolicy.REQUEST_TIMEOUT_MS] (60s).
 */
class RemoteApiClientTicketTimeoutTest {
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

    @Test
    fun websocketTicketUsesConnectTimeoutWhileOtherRequestsKeep60s() = runTest {
        val observedTimeouts = mutableListOf<Pair<Int, Long>>()
        val http = RemoteApiClient.defaultClient().newBuilder()
            .addInterceptor { chain ->
                observedTimeouts += chain.readTimeoutMillis() to chain.call().timeout().timeoutNanos()
                chain.proceed(chain.request())
            }
            .build()
        val api = RemoteApiClient(
            endpoint = server.url("/").toString().trimEnd('/'),
            accessToken = "test-token",
            client = http,
        )

        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody("""{"ticket":"ws-t-1","expiresAt":"2099-01-01T00:00:00.000Z"}"""),
        )
        assertEquals("ws-t-1", api.websocketTicket())

        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody("""{"ticket":"parent-t-1","expiresAt":"2099-01-01T00:00:00.000Z"}"""),
        )
        assertEquals("parent-t-1", api.environmentWebSocketTicket("11111111-1111-4111-8111-111111111111").ticket)

        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody("""{"ok":true}"""),
        )
        api.interruptThread("thread-1")

        val expectedTicketMs = RemoteSocketPolicy.CONNECT_TIMEOUT_MS.toInt()
        val expectedTicketNanos = TimeUnit.MILLISECONDS.toNanos(RemoteSocketPolicy.CONNECT_TIMEOUT_MS)
        val expectedRequestMs = RemoteSocketPolicy.REQUEST_TIMEOUT_MS.toInt()
        val expectedRequestNanos = TimeUnit.MILLISECONDS.toNanos(RemoteSocketPolicy.REQUEST_TIMEOUT_MS)

        assertEquals(
            listOf(expectedTicketMs, expectedTicketMs, expectedRequestMs),
            observedTimeouts.map { it.first },
        )
        assertEquals(
            listOf(expectedTicketNanos, expectedTicketNanos, expectedRequestNanos),
            observedTimeouts.map { it.second },
        )
    }
}
