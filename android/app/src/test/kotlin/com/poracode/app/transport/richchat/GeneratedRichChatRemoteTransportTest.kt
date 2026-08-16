package com.poracode.app.transport.richchat

import com.poracode.app.model.RemoteJson
import com.poracode.app.transport.ForegroundNetworkGate
import com.poracode.app.transport.RemoteApiClient
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.async
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.serialization.json.put
import okhttp3.HttpUrl
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import okio.Buffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class GeneratedRichChatRemoteTransportTest {
    @Test
    fun sendsEncodedPathsCanonicalBodiesAndExplicitEmptyJsonWithoutCommandIds() = runBlocking {
        val server = MockWebServer()
        repeat(9) { server.enqueue(MockResponse().setBody("""{"ok":true}""")) }
        server.start()
        try {
            val transport = transport(server)
            val requestFixture = fixture("rich-request-events.json")
            val openedRequestId = requestFixture.getValue("opened").jsonArray.first().jsonObject
                .getValue("requestId").jsonPrimitive.content
            val resolvedOutcome = requestFixture.getValue("resolved").jsonArray.first().jsonObject
                .getValue("outcome")
            transport.truncateRuntime("thread /東京", "item-1")
            transport.updateThreadGoal("thread /東京", ThreadGoalUpdate.Edit("  Ship it  "))
            transport.setSteer(
                "thread /東京",
                ThreadSteerInput(
                    prompt = "continue",
                    config = buildJsonObject { put("model", "default") },
                ),
            )
            transport.clearSteer("thread /東京")
            transport.resolveRequest(
                "thread /東京",
                RequestResolution(
                    JsonPrimitive(openedRequestId),
                    "resolve",
                    buildJsonObject { put("outcome", resolvedOutcome) },
                ),
            )
            transport.startTerminal(
                TerminalStartInput(
                    shellId = "shell-1",
                    projectLocation = buildJsonObject {
                        put("kind", "posix")
                        put("path", "/tmp/work tree")
                    },
                    initialColumns = 80,
                    initialRows = 24,
                ),
            )
            transport.writeTerminal("thread /東京", "ls\n")
            transport.resizeTerminal("thread /東京", 100, 40)
            transport.closeTerminal("thread /東京")

            val requests = List(9) { server.takeRequest() }
            assertEquals(
                "/base/api/threads/thread%20%2F%E6%9D%B1%E4%BA%AC/runtime/truncate",
                requests[0].requestUrl!!.encodedPath,
            )
            assertEquals("item-1", body(requests[0]).getValue("itemId").jsonPrimitive.content)
            assertEquals("Ship it", body(requests[1]).getValue("objective").jsonPrimitive.content)
            assertEquals("continue", body(requests[2]).getValue("prompt").jsonPrimitive.content)
            assertEquals("{}", requests[3].body.readUtf8())
            assertEquals(
                openedRequestId,
                body(requests[4]).getValue("requestId").jsonPrimitive.content,
            )
            assertEquals("/base/api/terminal/start", requests[5].requestUrl!!.encodedPath)
            assertEquals(80, body(requests[5]).getValue("initialSize")
                .jsonObject.getValue("cols").jsonPrimitive.int)
            assertEquals("ls\n", body(requests[6]).getValue("data").jsonPrimitive.content)
            assertEquals(100, body(requests[7]).getValue("cols").jsonPrimitive.int)
            assertEquals("{}", requests[8].body.readUtf8())
            requests.forEach { request ->
                assertEquals("POST", request.method)
                assertEquals("application/json", request.getHeader("Content-Type")
                    ?.substringBefore(';'))
                assertNull(request.getHeader("x-poracode-command-id"))
            }
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun consumesCheckpointFixtureThroughProcedureTransport() = runBlocking {
        val fixture = fixture("checkpoint-turn-sequences.json")
        val capture = fixture.getValue("captures").jsonArray.first().jsonObject
        val turn = fixture.getValue("turns").jsonArray.first().jsonObject
        val server = MockWebServer()
        listOf(
            capture.getValue("result"),
            turn.getValue("result"),
            fixture.getValue("listResult"),
        ).forEach { result ->
            server.enqueue(
                MockResponse().setBody(buildJsonObject { put("result", result) }.toString()),
            )
        }
        server.start()
        try {
            val transport = transport(server)
            assertEquals(
                "rich-user-1",
                transport.createFileCheckpoint(capture.getValue("request").jsonObject)
                    .getValue("checkpoint").jsonObject
                    .getValue("checkpointItemId").jsonPrimitive.content,
            )
            assertEquals(
                "rich-user-1",
                transport.finalizeFileCheckpoint(turn.getValue("request").jsonObject)
                    .getValue("checkpoint").jsonObject
                    .getValue("baseCheckpointItemId").jsonPrimitive.content,
            )
            assertEquals(
                2,
                transport.listFileCheckpoints(fixture.getValue("listRequest").jsonObject)
                    .getValue("turns").jsonArray.size,
            )
            repeat(3) { index ->
                val request = server.takeRequest()
                assertEquals("/base/api/git/call", request.requestUrl!!.encodedPath)
                assertEquals(
                    listOf("createFileCheckpoint", "finalizeFileCheckpoint", "listFileCheckpoints")[index],
                    body(request).getValue("procedure").jsonPrimitive.content,
                )
                assertNull(request.getHeader("x-poracode-command-id"))
            }
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun binaryPlansPreserveBinaryKindAndEncodeStructuredRuntimeQuery() {
        val server = MockWebServer()
        val transport = transport(server)
        val local = transport.localImageRequest("/tmp/画像 one.png")
        assertEquals(RichChatResponseKind.BINARY, local.responseKind)
        assertEquals("GET", local.method)
        assertEquals(RichChatAuthKind.BEARER_OR_QUERY, local.authKind)
        assertEquals(RichChatBodyKind.EMPTY, local.bodyKind)
        assertEquals(listOf("path" to "/tmp/画像 one.png"), local.query)

        val runtime = transport.runtimeImageRequest(
            "thread /東京",
            "item ?1",
            listOf(
                RuntimeImagePathSegment.Key("payload"),
                RuntimeImagePathSegment.Index(0),
                RuntimeImagePathSegment.Key("url"),
            ),
        )
        assertEquals(RichChatResponseKind.BINARY, runtime.responseKind)
        assertEquals("[\"payload\",0,\"url\"]", runtime.query.single().second)
        val url = addQuery(server.url(runtime.path), runtime.query)
        assertTrue(url.encodedPath.contains("thread%20%2F%E6%9D%B1%E4%BA%AC"))
        assertTrue(url.encodedQuery.orEmpty().contains("path=%5B%22payload%22%2C0%2C%22url%22%5D"))
    }

    @Test
    fun attachmentSeamUsesFixtureLimitsAndValidatesGeneratedResponse() = runBlocking {
        val fixture = fixture("attachment-boundaries.json")
        val exactLimit = fixture.getValue("limits").jsonObject
            .getValue("maxBytes").jsonPrimitive.long
        lateinit var capturedPlan: AttachmentUploadPlan
        val executor = RawAttachmentUploadExecutor { plan, _ ->
            capturedPlan = plan
            """{"path":"/tmp/uploaded.bin"}"""
        }
        val transport = GeneratedRichChatRemoteTransport(
            http = remoteClient(MockWebServer()),
            rawUpload = executor,
        )
        val body = AttachmentUploadBody.streaming(exactLimit) { }
        assertEquals(
            "/tmp/uploaded.bin",
            transport.uploadAttachment("thread rich", "a b.bin", "application/octet-stream", body),
        )
        assertEquals(exactLimit, capturedPlan.contentLength)
        assertEquals(RichChatResponseKind.JSON, capturedPlan.responseKind)
        assertEquals("POST", capturedPlan.method)
        assertEquals(RichChatAuthKind.BEARER, capturedPlan.authKind)
        assertEquals(RichChatBodyKind.RAW_UPLOAD, capturedPlan.bodyKind)
        assertEquals(listOf("threadId" to "thread rich", "name" to "a b.bin"), capturedPlan.query)
        assertTrue(runCatching { AttachmentUploadBody.streaming(0) {} }
            .exceptionOrNull() is RichChatInvalidRequestException)
        assertTrue(runCatching { AttachmentUploadBody.streaming(exactLimit + 1) {} }
            .exceptionOrNull() is RichChatInvalidRequestException)
    }

    @Test
    fun boundedAttachmentWriterRejectsShortAndOverlongStreams() {
        val short = AttachmentUploadBody.streaming(2) { it.writeByte(1) }
        assertTrue(runCatching { short.writeBoundedTo(Buffer()) }
            .exceptionOrNull() is RichChatInvalidRequestException)
        val long = AttachmentUploadBody.streaming(1) { it.write(byteArrayOf(1, 2)) }
        assertTrue(runCatching { long.writeBoundedTo(Buffer()) }
            .exceptionOrNull() is RichChatInvalidRequestException)
    }

    @Test
    fun mapsAuthCancellationAndAmbiguousFailuresWithoutLeakingServerMessages() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setResponseCode(403).setBody(
            """{"error":{"code":"denied","message":"server-secret"}}""",
        ))
        server.enqueue(MockResponse().setResponseCode(401).setBody(
            """{"error":{"code":"expired","message":"another-secret"}}""",
        ))
        server.enqueue(MockResponse().setBody("""{"ok":false,"secret":"response-secret"}"""))
        server.enqueue(MockResponse().setBodyDelay(30, TimeUnit.SECONDS).setBody("{}"))
        server.start()
        try {
            val transport = transport(server)
            val auth = runCatching { transport.clearSteer("thread") }.exceptionOrNull()
            assertTrue(auth is RichChatAuthorizationException)
            assertFalse(auth?.message.orEmpty().contains("server-secret"))
            val expired = runCatching { transport.clearSteer("thread") }.exceptionOrNull()
            assertTrue(expired is RichChatAuthorizationException)
            assertEquals(401, (expired as RichChatAuthorizationException).status)
            assertFalse(expired.message.orEmpty().contains("another-secret"))
            val malicious = runCatching { transport.clearSteer("thread") }.exceptionOrNull()
            assertTrue(malicious is RichChatMutationOutcomeUnknownException)
            assertFalse(malicious?.message.orEmpty().contains("response-secret"))

            val pending = async { transport.clearSteer("thread") }
            server.takeRequest()
            pending.cancel()
            val cancelled = runCatching { pending.await() }.exceptionOrNull()
            assertTrue(cancelled is CancellationException)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun serverFailuresLeaveMutationOutcomeUnknownAndAreNotRetried() = runBlocking {
        for (status in listOf(500, 502, 503)) {
            val server = MockWebServer()
            server.enqueue(MockResponse().setResponseCode(status).setBody("{}"))
            server.start()
            try {
                val error = runCatching { transport(server).clearSteer("thread") }.exceptionOrNull()
                assertTrue(
                    "mutation with HTTP $status must be ambiguous",
                    error is RichChatMutationOutcomeUnknownException,
                )
                assertEquals("HTTP $status must not be retried", 1, server.requestCount)
            } finally {
                server.shutdown()
            }
        }
    }

    @Test
    fun clientErrorsRejectMutationsDefinitelyWithoutRetry() = runBlocking {
        for (status in listOf(400, 404, 422)) {
            val server = MockWebServer()
            server.enqueue(MockResponse().setResponseCode(status).setBody("{}"))
            server.start()
            try {
                val error = runCatching { transport(server).clearSteer("thread") }.exceptionOrNull()
                assertTrue(
                    "mutation with HTTP $status must be definite",
                    error is RichChatRemoteRejectedException,
                )
                assertEquals(status, (error as RichChatRemoteRejectedException).status)
                assertEquals("HTTP $status must not be retried", 1, server.requestCount)
            } finally {
                server.shutdown()
            }
        }
    }

    @Test
    fun readFailuresStayDefiniteFor503AndInvalidBodies() = runBlocking {
        val listRequest = fixture("checkpoint-turn-sequences.json").getValue("listRequest").jsonObject

        val unavailable = MockWebServer()
        unavailable.enqueue(MockResponse().setResponseCode(503).setBody("{}"))
        unavailable.start()
        try {
            val error = runCatching {
                transport(unavailable).listFileCheckpoints(listRequest)
            }.exceptionOrNull()
            assertTrue("read with HTTP 503 must be definite", error is RichChatRemoteRejectedException)
            assertEquals(1, unavailable.requestCount)
        } finally {
            unavailable.shutdown()
        }

        val malformed = MockWebServer()
        malformed.enqueue(MockResponse().setBody("not-json"))
        malformed.start()
        try {
            val error = runCatching {
                transport(malformed).listFileCheckpoints(listRequest)
            }.exceptionOrNull()
            assertTrue("read with invalid body must be definite", error is RichChatInvalidResponseException)
            assertEquals(1, malformed.requestCount)
        } finally {
            malformed.shutdown()
        }
    }

    @Test
    fun threadClosePostsEmptyBodyToEncodedClosePathWithoutCommandId() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody("""{"ok":true}"""))
        server.start()
        try {
            transport(server).closeThread("thread /東京")
            val request = server.takeRequest()
            assertEquals(
                "/base/api/threads/thread%20%2F%E6%9D%B1%E4%BA%AC/close",
                request.requestUrl!!.encodedPath,
            )
            assertEquals("POST", request.method)
            assertEquals("{}", request.body.readUtf8())
            assertNull(request.getHeader("x-poracode-command-id"))
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun disconnectedMutationHasUnknownOutcomeAndIsNotRetried() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST))
        server.start()
        try {
            val error = runCatching { transport(server).clearSteer("thread") }.exceptionOrNull()
            assertTrue(error is RichChatMutationOutcomeUnknownException)
            assertEquals(1, server.requestCount)
        } finally {
            server.shutdown()
        }
    }

    private fun transport(server: MockWebServer): GeneratedRichChatRemoteTransport =
        GeneratedRichChatRemoteTransport(remoteClient(server))

    private fun remoteClient(server: MockWebServer): RemoteApiClient = RemoteApiClient(
        endpoint = server.url("/base").toString(),
        accessToken = "access-secret",
        client = OkHttpClient(),
        networkGate = ForegroundNetworkGate(),
    )

    private fun body(request: okhttp3.mockwebserver.RecordedRequest): JsonObject =
        RemoteJson.parseToJsonElement(request.body.readUtf8()).jsonObject

    private fun addQuery(base: HttpUrl, query: List<Pair<String, String>>): HttpUrl =
        base.newBuilder().apply {
            query.forEach { (name, value) -> addQueryParameter(name, value) }
        }.build()

    private fun fixture(name: String): JsonObject {
        val stream = javaClass.classLoader!!.getResourceAsStream("fixtures/$name")
            ?: error("Missing rich-chat fixture $name")
        return RemoteJson.parseToJsonElement(stream.bufferedReader().use { it.readText() })
            .jsonObject
    }
}
