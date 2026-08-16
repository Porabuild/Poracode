package com.poracode.app.transport.ports

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PortForwardRemoteApiClientTest {
    @Test
    fun allRequestsPreserveBasePathUseBearerAndNeverRetry() = runBlocking {
        val server = MockWebServer()
        server.enqueue(
            MockResponse().setBody(
                """{"detected":[],"forwards":[]}""",
            ),
        )
        server.enqueue(
            MockResponse().setBody(
                """{
                  "forward":{"id":"fw","targetPort":3000,"listenPort":49160,"createdAt":5},
                  "enterPath":"/forward/fw/enter?fwt=browser-secret"
                }""".trimIndent(),
            ),
        )
        server.enqueue(
            MockResponse().setBody(
                """{"enterPath":"/forward/fw/enter?fwt=fresh-secret"}""",
            ),
        )
        server.enqueue(MockResponse().setBody("""{"ok":true}"""))
        server.start()
        try {
            val client = PortForwardRemoteApiClient(
                endpoint = server.url("/relay/desktop").toString(),
                accessToken = "bearer-secret",
            )
            assertTrue(client.snapshot().forwards.isEmpty())
            val started = client.start(3000)
            assertEquals(3000, started.forward.targetPort)
            assertEquals(
                server.url("/relay/desktop/forward/fw/enter?fwt=browser-secret").toString(),
                started.browserEntryUrl,
            )
            assertEquals(
                server.url("/relay/desktop/forward/fw/enter?fwt=fresh-secret").toString(),
                client.browserEntry("fw"),
            )
            client.stop("fw")

            val requests = List(4) { server.takeRequest() }
            assertEquals(
                listOf(
                    "/relay/desktop/api/ports",
                    "/relay/desktop/api/ports/forward",
                    "/relay/desktop/api/ports/enter",
                    "/relay/desktop/api/ports/unforward",
                ),
                requests.map { it.requestUrl!!.encodedPath },
            )
            assertEquals(listOf("GET", "POST", "POST", "POST"), requests.map { it.method })
            requests.forEach { request ->
                assertEquals("Bearer bearer-secret", request.getHeader("Authorization"))
            }
            assertEquals("""{"targetPort":3000}""", requests[1].body.readUtf8())
            assertEquals("""{"id":"fw"}""", requests[2].body.readUtf8())
            assertEquals("""{"id":"fw"}""", requests[3].body.readUtf8())
            assertEquals(4, server.requestCount)
            assertFalse(requests.any { it.body.readUtf8().contains("browser-secret") })
        } finally {
            server.shutdown()
        }
    }
}
