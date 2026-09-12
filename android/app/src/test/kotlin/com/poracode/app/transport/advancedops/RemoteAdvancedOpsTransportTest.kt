package com.poracode.app.transport.advancedops

import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.protocol.advancedops.AdvancedOperation
import com.poracode.app.protocol.advancedops.AdvancedPayloads
import com.poracode.app.transport.ForegroundNetworkGate
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoteAdvancedOpsTransportTest {
    @Test
    fun `production client sends exact authenticated route through shared HTTP stack`() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody("""{"result":{"message":"fix: safe"}}"""))
        server.start()
        try {
            val transport = RemoteAdvancedOpsTransport(
                endpoint = server.url("/base").toString(),
                accessToken = "access-secret",
                client = OkHttpClient.Builder().retryOnConnectionFailure(true).build(),
                networkGate = ForegroundNetworkGate(),
            )
            val result = transport.call(
                AdvancedOperation.GenerateCommitMessage,
                AdvancedPayloads.generation(LOCATION, "codex", null, null, null, null),
            )
            assertEquals("fix: safe", result.jsonObject.getValue("message").jsonPrimitive.content)
            val request = server.takeRequest()
            assertEquals("POST", request.method)
            assertEquals("/base/api/git/call", request.requestUrl!!.encodedPath)
            assertEquals("Bearer access-secret", request.getHeader("Authorization"))
            val body = Json.parseToJsonElement(request.body.readUtf8()).jsonObject
            assertEquals(
                "generateCommitMessage",
                body.getValue("procedure").jsonPrimitive.content,
            )
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun `mutation connection failure is attempted once despite retry-enabled input client`() =
        runBlocking {
            val server = MockWebServer()
            server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST))
            server.start()
            try {
                val transport = RemoteAdvancedOpsTransport(
                    endpoint = server.url("/").toString(),
                    accessToken = "token",
                    client = OkHttpClient.Builder().retryOnConnectionFailure(true).build(),
                    networkGate = ForegroundNetworkGate(),
                )
                val failure = runCatching {
                    transport.call(
                        AdvancedOperation.DeleteProjectEntry,
                        AdvancedPayloads.projectEntry(LOCATION, "a"),
                    )
                }.exceptionOrNull() as AdvancedTransportException
                assertTrue(failure.ambiguity)
                assertEquals(1, server.requestCount)
            } finally {
                server.shutdown()
            }
        }

    @Test
    fun `invalid request never reaches executor and malformed success is ambiguous`() = runBlocking {
        var calls = 0
        val transport = RemoteAdvancedOpsTransport(
            AdvancedTextRequest { _, _, _, _ ->
                calls += 1
                """{"result":null}"""
            },
        )
        val invalid = runCatching {
            transport.call(
                AdvancedOperation.DeleteProjectEntry,
                AdvancedPayloads.projectEntry(LOCATION, ""),
            )
        }.exceptionOrNull() as AdvancedTransportException
        assertFalse(invalid.ambiguity)
        assertEquals(0, calls)

        val malformed = runCatching {
            transport.call(
                AdvancedOperation.DeleteProjectEntry,
                AdvancedPayloads.projectEntry(LOCATION, "a"),
            )
        }.exceptionOrNull() as AdvancedTransportException
        assertTrue(malformed.ambiguity)
        assertEquals("invalid_response", malformed.safeCode)
        assertEquals("Remote advanced operation failed.", malformed.message)
        assertEquals(1, calls)
    }

    @Test
    fun `server failure is ambiguous and remains one attempt`() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setResponseCode(503).setBody("private server detail"))
        server.start()
        try {
            val transport = RemoteAdvancedOpsTransport(
                endpoint = server.url("/").toString(),
                accessToken = "token",
                networkGate = ForegroundNetworkGate(),
            )
            val failure = runCatching {
                transport.call(
                    AdvancedOperation.DeleteProjectEntry,
                    AdvancedPayloads.projectEntry(LOCATION, "a"),
                )
            }.exceptionOrNull() as AdvancedTransportException
            assertTrue(failure.ambiguity)
            assertEquals(503, failure.statusCode)
            assertFalse(failure.message.orEmpty().contains("private"))
            assertEquals(1, server.requestCount)
        } finally {
            server.shutdown()
        }
    }

    private companion object {
        val LOCATION = PosixProjectLocation("/repo")
    }
}
