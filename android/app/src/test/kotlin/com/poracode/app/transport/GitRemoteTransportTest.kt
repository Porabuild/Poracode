package com.poracode.app.transport

import com.poracode.app.model.GitRequests
import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.RemoteJson
import com.poracode.app.protocol.git.GitProcedure
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GitRemoteTransportTest {
    @Test
    fun routeBodyAndResultUseProcedureCallContract() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody("""{"result":{"current":"main","branches":[]}}"""))
        server.start()
        try {
            val client = client(server)
            val request = GitRequests.create(
                GitProcedure.ListBranches,
                PosixProjectLocation("/repo"),
            )
            val result = client.gitCall(request.procedure, request.payload).jsonObject
            assertEquals("main", result.getValue("current").jsonPrimitive.content)
            val sent = server.takeRequest()
            assertEquals("POST", sent.method)
            assertEquals("/base/api/git/call", sent.requestUrl!!.encodedPath)
            assertEquals("Bearer token", sent.getHeader("Authorization"))
            val body = RemoteJson.parseToJsonElement(sent.body.readUtf8()).jsonObject
            assertEquals("gitListBranches", body.getValue("procedure").jsonPrimitive.content)
            val sentPayload = body.getValue("payload").jsonObject
            assertEquals(request.payload.getValue("projectLocation"), sentPayload.getValue("projectLocation"))
            assertEquals("true", sentPayload.getValue("includeRemote").jsonPrimitive.content)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun mutationTransportNeverRetriesConnectionFailure() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST))
        server.start()
        try {
            val client = client(server)
            val request = GitRequests.create(
                GitProcedure.Stage,
                PosixProjectLocation("/repo"),
                mapOf("filePath" to JsonPrimitive("README.md")),
            )
            assertTrue(runCatching { client.gitCall(request.procedure, request.payload) }.isFailure)
            assertEquals(1, server.requestCount)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun generatedRequestRejectionHappensBeforeDelivery() = runBlocking {
        val server = MockWebServer()
        server.start()
        try {
            val request = GitRequests.create(
                GitProcedure.Stage,
                PosixProjectLocation("/repo"),
            )
            assertTrue(
                runCatching { client(server).gitCall(request.procedure, request.payload) }
                    .exceptionOrNull() is GitRequestValidationException,
            )
            assertEquals(0, server.requestCount)
        } finally {
            server.shutdown()
        }
    }

    private fun client(server: MockWebServer) = ProjectWorkspaceRemoteApiClient(
        endpoint = server.url("/base").toString(),
        accessToken = "token",
        client = OkHttpClient.Builder().retryOnConnectionFailure(true).build(),
        networkGate = ForegroundNetworkGate(),
    )
}
