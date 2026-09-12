package com.poracode.app.transport.threads

import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.ThreadConfig
import com.poracode.app.model.threads.ExistingThreadStartRequest
import com.poracode.app.model.threads.ThreadCommandId
import com.poracode.app.model.threads.ThreadLifecycleCommand
import com.poracode.app.model.threads.ThreadTerminalSize
import com.poracode.app.protocol.ProtocolConstants
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

class ThreadLifecycleRemoteApiClientTest {
    private lateinit var server: MockWebServer
    private lateinit var client: ThreadLifecycleRemoteApiClient

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        client = ThreadLifecycleRemoteApiClient(server.url("/").toString(), "access-token")
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun ordinaryCommandHasExactEncodedPathAndNoCommandId() = runTest {
        server.enqueue(MockResponse().setBody("{\"ok\":true}"))
        client.command(ThreadLifecycleCommand.Rename("thread/α", "Title"))
        val request = server.takeRequest()
        assertEquals("/api/threads/thread%2F%CE%B1/command", request.requestUrl!!.encodedPath)
        assertEquals("Bearer access-token", request.headers["Authorization"])
        assertNull(request.headers[ProtocolConstants.COMMAND_ID_HEADER])
        assertEquals("{\"kind\":\"rename\",\"title\":\"Title\"}", request.body.readUtf8())
    }

    @Test
    fun startCommandIsTheOnlyCommandVariantWithIdempotencyHeader() = runTest {
        server.enqueue(MockResponse().setBody("{\"ok\":true}"))
        client.command(
            ThreadLifecycleCommand.Start(
                threadId = "t1",
                projectId = "p1",
                agentKind = "codex",
                config = ThreadConfig(),
                prompt = "go",
                commandId = ThreadCommandId("command-123"),
            ),
        )
        assertEquals(
            "command-123",
            server.takeRequest().headers[ProtocolConstants.COMMAND_ID_HEADER],
        )
    }

    @Test
    fun startExistingPostsOnceToThreadStartRouteWithCommandIdHeader() = runTest {
        server.enqueue(MockResponse().setBody("{\"threadId\":\"t1\"}"))
        val threadId = client.startExisting(
            ExistingThreadStartRequest(
                threadId = "t1",
                projectLocation = PosixProjectLocation("/repo"),
                agentKind = "codex",
                config = ThreadConfig(),
                initialSize = ThreadTerminalSize(120, 30),
                commandId = ThreadCommandId("command-xyz"),
            ),
        )

        assertEquals("t1", threadId)
        val request = server.takeRequest()
        // The thread-start-existing root: threadId is carried in the body, not the path.
        assertEquals("/api/threads/start", request.requestUrl!!.encodedPath)
        assertEquals("POST", request.method)
        assertEquals("Bearer access-token", request.headers["Authorization"])
        assertEquals("command-xyz", request.headers[ProtocolConstants.COMMAND_ID_HEADER])
        // Exactly one attempt was issued; no second request was enqueued.
        assertEquals(0, server.requestCount - 1)
    }

    @Test
    fun startExistingReturnsCanonicalThreadIdFromValidatedResponse() = runTest {
        server.enqueue(MockResponse().setBody("{\"threadId\":\"thread/unicode-λ\"}"))
        val threadId = client.startExisting(
            ExistingThreadStartRequest(
                threadId = "thread/unicode-λ",
                projectLocation = PosixProjectLocation("/repo"),
                agentKind = "codex",
                config = ThreadConfig(),
                initialSize = ThreadTerminalSize(80, 24),
                commandId = ThreadCommandId("cmd"),
            ),
        )
        assertEquals("thread/unicode-λ", threadId)
    }
}
