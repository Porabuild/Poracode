package com.poracode.app.transport.richchat

import com.poracode.app.model.RemoteJson
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.transport.ForegroundNetworkGate
import com.poracode.app.transport.RemoteApiClient
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GeneratedRichThreadCommandTransportTest {
    @Test
    fun postsCanonicalLifecycleCommandsWithStartOnlyCommandId() = runBlocking {
        val server = MockWebServer()
        val commands = lifecycleCommands()
        repeat(commands.size) { server.enqueue(ok()) }
        server.start()
        try {
            val transport = transport(server)
            commands.forEach { transport.threadCommand("thread-1", it) }

            commands.indices.forEach { index ->
                val request = server.takeRequest()
                val body = body(request)
                assertEquals("POST", request.method)
                assertEquals("/base/api/threads/thread-1/command", request.requestUrl!!.encodedPath)
                assertEquals("Bearer access-secret", request.getHeader("Authorization"))
                assertEquals(commands[index].getValue("kind"), body.getValue("kind"))
                assertFalse(body.containsKey("threadId"))
                if (body.getValue("kind").jsonPrimitive.content == "start") {
                    assertEquals(
                        "thread-start:thread-1",
                        request.getHeader(ProtocolConstants.COMMAND_ID_HEADER),
                    )
                } else {
                    assertNull(request.getHeader(ProtocolConstants.COMMAND_ID_HEADER))
                }
            }
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun escapesTheSelectedThreadAsExactlyOneUriPathSegment() = runBlocking {
        val server = MockWebServer()
        server.enqueue(ok())
        server.start()
        try {
            transport(server).threadCommand(
                "thread /東京?#%~!*'()",
                command("rename", null) { put("title", "Safe") },
            )

            assertEquals(
                "/base/api/threads/thread%20%2F%E6%9D%B1%E4%BA%AC%3F%23%25~!*'()/command",
                server.takeRequest().requestUrl!!.encodedPath,
            )
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun rejectsMalformedOrCrossThreadBodiesBeforeSending() = runBlocking {
        val server = MockWebServer()
        server.start()
        try {
            val transport = transport(server)
            val malformed = runCatching {
                transport.threadCommand(
                    "thread-1",
                    command("rename") { put("title", "") },
                )
            }.exceptionOrNull()
            val mismatched = runCatching {
                transport.threadCommand(
                    "thread-1",
                    command("rename", "different-secret-thread") { put("title", "Safe") },
                )
            }.exceptionOrNull()

            assertTrue(malformed is RichChatInvalidRequestException)
            assertTrue(mismatched is RichChatInvalidRequestException)
            assertFalse(mismatched?.message.orEmpty().contains("different-secret-thread"))
            assertEquals(0, server.requestCount)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun malformedResponseIsAmbiguousAndSanitized() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody("""{"ok":false,"secret":"server-secret"}"""))
        server.start()
        try {
            val error = runCatching {
                transport(server).threadCommand("thread-1", command("archive"))
            }.exceptionOrNull()

            assertTrue(error is RichChatMutationOutcomeUnknownException)
            assertFalse(error?.message.orEmpty().contains("server-secret"))
            assertEquals(1, server.requestCount)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun disconnectIsAmbiguousAndNeverRetried() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST))
        server.start()
        try {
            val error = runCatching {
                transport(server).threadCommand("thread-1", command("delete"))
            }.exceptionOrNull()

            assertTrue(error is RichChatMutationOutcomeUnknownException)
            assertEquals(1, server.requestCount)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun cancellationCancelsTheSingleInFlightRequest() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBodyDelay(30, TimeUnit.SECONDS).setBody("{}"))
        server.start()
        try {
            val pending = async(start = CoroutineStart.UNDISPATCHED) {
                transport(server).threadCommand("thread-1", command("unarchive"))
            }
            server.takeRequest()
            pending.cancel()

            assertTrue(runCatching { pending.await() }.exceptionOrNull() is CancellationException)
            assertEquals(1, server.requestCount)
        } finally {
            server.shutdown()
        }
    }

    private fun lifecycleCommands(): List<JsonObject> = listOf(
        command("prepare-worktree") {
            put("projectId", "project-1")
            put("worktreePath", "/repo/tree")
        },
        command("start") {
            put("projectId", "project-1")
            put("agentKind", "codex")
            put("config", buildJsonObject { put("model", "gpt-5") })
            put("prompt", "hello")
        },
        command("set-group") {
            put("groupId", "group-1")
            put("groupName", "Group")
        },
        command("rename") { put("title", "Renamed") },
        command("acknowledge"),
        command("set-done") { put("done", true) },
        command("set-starred") { put("starred", false) },
        command("set-worktree") { put("worktreePath", "/repo/tree") },
        command("archive"),
        command("unarchive"),
        command("delete"),
    )

    private fun command(
        kind: String,
        threadId: String? = "thread-1",
        fields: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit = {},
    ): JsonObject = buildJsonObject {
        put("kind", kind)
        threadId?.let { put("threadId", it) }
        fields()
    }

    private fun transport(server: MockWebServer): GeneratedRichChatRemoteTransport =
        GeneratedRichChatRemoteTransport(
            RemoteApiClient(
                endpoint = server.url("/base").toString(),
                accessToken = "access-secret",
                client = OkHttpClient(),
                networkGate = ForegroundNetworkGate(),
            ),
        )

    private fun body(request: okhttp3.mockwebserver.RecordedRequest): JsonObject =
        RemoteJson.parseToJsonElement(request.body.readUtf8()) as JsonObject

    private fun ok(): MockResponse = MockResponse().setBody("""{"ok":true}""")
}
