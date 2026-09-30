package com.poracode.app.transport

import com.poracode.app.model.GithubRequests
import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.RemoteJson
import com.poracode.app.protocol.github.GithubProcedure
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GithubRemoteTransportTest {
    @Test
    fun exactRouteBearerAndGeneratedEnvelopeAreUsed() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody("""{"result":{"available":true}}"""))
        server.start()
        try {
            val request = GithubRequests.create(
                GithubProcedure.CheckAvailable,
                PosixProjectLocation("/repo"),
            )
            val result = client(server).githubCall(request.procedure, request.payload).jsonObject
            assertTrue(result.getValue("available").jsonPrimitive.boolean)
            val sent = server.takeRequest()
            assertEquals("POST", sent.method)
            assertEquals("/base/api/git/call", sent.requestUrl!!.encodedPath)
            assertEquals("Bearer github-opaque-token", sent.getHeader("Authorization"))
            val body = RemoteJson.parseToJsonElement(sent.body.readUtf8()).jsonObject
            assertEquals("ghCheckAvailable", body.getValue("procedure").jsonPrimitive.content)
            assertEquals(request.payload, body.getValue("payload"))
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun mutationMakesOneNetworkAttemptEvenWhenCallerClientEnablesRetry() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST))
        server.start()
        try {
            val request = GithubRequests.create(
                GithubProcedure.ClosePr,
                PosixProjectLocation("/repo"),
                mapOf("prNumber" to JsonPrimitive(42)),
            )
            assertTrue(runCatching { client(server).githubCall(request.procedure, request.payload) }.isFailure)
            assertEquals(1, server.requestCount)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun invalidGeneratedRequestNeverReachesNetwork() = runBlocking {
        val server = MockWebServer()
        server.start()
        try {
            val request = GithubRequests.create(
                GithubProcedure.ClosePr,
                PosixProjectLocation("/repo"),
            )
            assertTrue(
                runCatching { client(server).githubCall(request.procedure, request.payload) }
                    .exceptionOrNull() is GitRequestValidationException,
            )
            assertEquals(0, server.requestCount)
        } finally {
            server.shutdown()
        }
    }

    private fun client(server: MockWebServer) = ProjectWorkspaceRemoteApiClient(
        endpoint = server.url("/base").toString(),
        accessToken = "github-opaque-token",
        client = OkHttpClient.Builder().retryOnConnectionFailure(true).build(),
        networkGate = ForegroundNetworkGate(),
    )
}
