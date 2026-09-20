package com.poracode.app.transport

import com.poracode.app.model.GitRequests
import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.RemoteJson
import com.poracode.app.model.ThreadConfig
import com.poracode.app.protocol.git.GitProcedure
import com.poracode.app.transport.richchat.GeneratedRichChatRemoteTransport
import com.poracode.app.transport.richchat.RequestResolution
import com.poracode.app.transport.richchat.TerminalStartInput
import com.poracode.app.transport.richchat.ThreadSteerInput
import com.poracode.remote.v3.generated.terminalHardwareKeySequence
import com.poracode.remote.v3.generated.TerminalHardwareKey
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * V5 plan item 5.3: one journey per native feature family over the REAL transport
 * layer and generated bindings — production clients against a loopback HTTP peer,
 * never fake gateways. The wire-lab UI journey (API 37 instrumentation) covers
 * pairing and thread send/stop end-to-end; these JVM journeys close the families
 * the lab cannot drive yet (steer, permission resolve, terminal write, git) and
 * run in the existing `android` native-CI job.
 *
 * The mutation responses mirror the wire lab's canonical `{ok:true}` mutation
 * shape, and the pairing response is the committed contract fixture
 * (`protocol/remote/v3/fixtures/pairing-token-response.json`).
 */
class NativeFamilyJourneyTransportTest {
    private fun client(server: MockWebServer): ProjectWorkspaceRemoteApiClient =
        ProjectWorkspaceRemoteApiClient(
            endpoint = server.url("/base").toString(),
            accessToken = "token",
            client = OkHttpClient.Builder().retryOnConnectionFailure(true).build(),
            networkGate = ForegroundNetworkGate(),
        )

    private fun richTransport(server: MockWebServer): GeneratedRichChatRemoteTransport =
        GeneratedRichChatRemoteTransport(
            RemoteApiClient(
                endpoint = server.url("/base").toString(),
                accessToken = "token",
                client = OkHttpClient.Builder().retryOnConnectionFailure(true).build(),
                networkGate = ForegroundNetworkGate(),
            ),
        )

    private fun MockWebServer.enqueueOk() {
        enqueue(MockResponse().setBody("""{"ok":true}"""))
    }

    /** Pair family: pairing credential -> scoped access token over the real exchange route. */
    @Test
    fun pairFamilyExchangesCredentialForScopedToken() = runBlocking {
        val server = MockWebServer()
        server.enqueue(
            MockResponse().setBody(
                """
                {
                  "accessToken": "lc_access_journey",
                  "tokenType": "Bearer",
                  "expiresAt": "2026-09-11T12:00:00.000Z",
                  "scopes": ["session:read", "terminal:operate"]
                }
                """.trimIndent(),
            ),
        )
        server.start()
        try {
            val api = RemoteApiClient(
                endpoint = server.url("/base").toString(),
                accessToken = "token",
                client = OkHttpClient.Builder().retryOnConnectionFailure(true).build(),
                networkGate = ForegroundNetworkGate(),
            )
            val result = api.exchangePairingCredential(
                credential = "poracode-pairing-credential",
                scopes = listOf("session:read", "terminal:operate"),
            )
            assertEquals("lc_access_journey", result.accessToken)
            assertTrue("session:read" in result.scopes)
            val sent = server.takeRequest()
            assertEquals("/base/oauth/token", sent.requestUrl!!.encodedPath)
            val body = RemoteJson.parseToJsonElement(sent.body.readUtf8()).jsonObject
            assertEquals("pairing-token", body.getValue("grantType").jsonPrimitive.content)
            assertEquals(
                "poracode-pairing-credential",
                body.getValue("credential").jsonPrimitive.content,
            )
            assertEquals(
                listOf("session:read", "terminal:operate"),
                body.getValue("scopes").toJsonPrimitiveList(),
            )
        } finally {
            server.shutdown()
        }
    }

    /**
     * Thread family: send, steer mid-turn, and stop — the three mutating
     * composer operations — each exactly one request on the production client.
     */
    @Test
    fun threadFamilySendsSteersAndStops() = runBlocking {
        val server = MockWebServer()
        repeat(4) { server.enqueueOk() }
        server.start()
        try {
            val transport = richTransport(server)
            val api = RemoteApiClient(
                endpoint = server.url("/base").toString(),
                accessToken = "token",
                client = OkHttpClient.Builder().retryOnConnectionFailure(true).build(),
                networkGate = ForegroundNetworkGate(),
            )

            // Send: the prompt crosses with the command-id header, exactly once.
            api.sendThreadInput(
                threadId = "thread-fixture-001",
                prompt = "journey probe",
                config = ThreadConfig(model = "gpt-5"),
                segments = null,
                userMessageItemId = "item-journey-001",
            )
            val send = server.takeRequest()
            assertEquals(
                "/base/api/threads/thread-fixture-001/send",
                send.requestUrl!!.encodedPath,
            )
            assertEquals("item-journey-001", send.getHeader("x-poracode-command-id"))
            val sendBody = RemoteJson.parseToJsonElement(send.body.readUtf8()).jsonObject
            assertEquals("journey probe", sendBody.getValue("prompt").jsonPrimitive.content)

            transport.setSteer(
                "thread-fixture-001",
                ThreadSteerInput(
                    prompt = "focus on the failing test",
                    config = buildJsonObject { put("model", "gpt-5") },
                ),
            )
            val steer = server.takeRequest()
            assertEquals(
                "/base/api/threads/thread-fixture-001/steer/set",
                steer.requestUrl!!.encodedPath,
            )
            assertEquals("POST", steer.method)
            val steerBody = RemoteJson.parseToJsonElement(steer.body.readUtf8()).jsonObject
            assertEquals(
                "focus on the failing test",
                steerBody.getValue("prompt").jsonPrimitive.content,
            )

            transport.clearSteer("thread-fixture-001")
            assertEquals(
                "/base/api/threads/thread-fixture-001/steer/clear",
                server.takeRequest().requestUrl!!.encodedPath,
            )

            // Stop: the interrupt is the composer's stop-generation control.
            api.interruptThread("thread-fixture-001")
            assertEquals(
                "/base/api/threads/thread-fixture-001/interrupt",
                server.takeRequest().requestUrl!!.encodedPath,
            )

            // Four mutating operations, four requests — production mutations
            // are never retried.
            assertEquals(4, server.requestCount)
        } finally {
            server.shutdown()
        }
    }

    /** Permission family: the viewer decision resolves the host's request prompt. */
    @Test
    fun permissionFamilyResolvesHostRequest() = runBlocking {
        val server = MockWebServer()
        server.enqueueOk()
        server.start()
        try {
            richTransport(server).resolveRequest(
                "thread-fixture-001",
                RequestResolution(
                    requestId = JsonPrimitive("request-fixture-001"),
                    method = "approve",
                    response = buildJsonObject { put("decision", "approved") },
                ),
            )
            val sent = server.takeRequest()
            assertEquals(
                "/base/api/threads/thread-fixture-001/requests/resolve",
                sent.requestUrl!!.encodedPath,
            )
            val body = RemoteJson.parseToJsonElement(sent.body.readUtf8()).jsonObject
            assertEquals(
                "request-fixture-001",
                body.getValue("requestId").jsonPrimitive.content,
            )
            assertEquals("approve", body.getValue("method").jsonPrimitive.content)
        } finally {
            server.shutdown()
        }
    }

    /**
     * Terminal family: start, then write the raw-key sequence produced by the
     * interactive passthrough encoder (V5 5.1) — Ctrl+C as ETX — plus resize.
     */
    @Test
    fun terminalFamilyWritesInteractiveKeySequences() = runBlocking {
        val server = MockWebServer()
        repeat(3) { server.enqueueOk() }
        server.start()
        try {
            val transport = richTransport(server)
            transport.startTerminal(
                TerminalStartInput(
                    shellId = "shell-journey-001",
                    projectLocation = RemoteJson.encodeToJsonElement(
                        com.poracode.app.model.ProjectLocation.serializer(),
                        PosixProjectLocation("/repo"),
                    ) as kotlinx.serialization.json.JsonObject,
                    initialColumns = 80,
                    initialRows = 24,
                ),
            )
            val start = server.takeRequest()
            assertEquals("/base/api/terminal/start", start.requestUrl!!.encodedPath)
            assertEquals(
                "shell-journey-001",
                RemoteJson.parseToJsonElement(start.body.readUtf8())
                    .jsonObject.getValue("shellId").jsonPrimitive.content,
            )

            val interruptChord = terminalHardwareKeySequence(
                TerminalHardwareKey.Character,
                character = "c",
                isCtrl = true, isShift = false, isAlt = false, isMeta = false,
            )
            assertEquals("\u0003", interruptChord)
            transport.writeTerminal("thread-fixture-001", interruptChord)
            val write = server.takeRequest()
            assertEquals(
                "/base/api/threads/thread-fixture-001/terminal/write",
                write.requestUrl!!.encodedPath,
            )
            val writeBody = RemoteJson.parseToJsonElement(write.body.readUtf8()).jsonObject
            assertEquals("\u0003", writeBody.getValue("data").jsonPrimitive.content)

            transport.resizeTerminal("thread-fixture-001", columns = 100, rows = 30)
            assertEquals(
                "/base/api/threads/thread-fixture-001/terminal/resize",
                server.takeRequest().requestUrl!!.encodedPath,
            )
        } finally {
            server.shutdown()
        }
    }

    /** Git family: a read and a mutation across the real git procedure-call route. */
    @Test
    fun gitFamilyReadsStatusAndStagesFile() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody("""{"result":{"current":"main","branches":[]}}"""))
        // Stage is an omitted-result procedure: the success envelope is an empty object.
        server.enqueue(MockResponse().setBody("{}"))
        server.start()
        try {
            val client = client(server)
            val read = GitRequests.create(GitProcedure.ListBranches, PosixProjectLocation("/repo"))
            client.gitCall(read.procedure, read.payload)
            val readRequest = server.takeRequest()
            assertEquals("/base/api/git/call", readRequest.requestUrl!!.encodedPath)
            assertEquals(
                "gitListBranches",
                RemoteJson.parseToJsonElement(readRequest.body.readUtf8())
                    .jsonObject.getValue("procedure").jsonPrimitive.content,
            )

            val stage = GitRequests.create(
                GitProcedure.Stage,
                PosixProjectLocation("/repo"),
                mapOf("filePath" to JsonPrimitive("README.md")),
            )
            client.gitCall(stage.procedure, stage.payload)
            assertEquals(
                "gitStage",
                RemoteJson.parseToJsonElement(server.takeRequest().body.readUtf8())
                    .jsonObject.getValue("procedure").jsonPrimitive.content,
            )
        } finally {
            server.shutdown()
        }
    }
}

private fun kotlinx.serialization.json.JsonElement.toJsonPrimitiveList(): List<String> =
    (this as kotlinx.serialization.json.JsonArray).map { it.jsonPrimitive.content }
