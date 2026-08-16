package com.poracode.app.session.richchat

import com.poracode.app.model.RemoteAccessTokenResult
import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteEnvironmentDescriptor
import com.poracode.app.model.RemoteRuntimeItemsPage
import com.poracode.app.model.RemoteShellSnapshot
import com.poracode.app.model.RemoteThreadSnapshot
import com.poracode.app.model.ThreadConfig
import com.poracode.app.transport.RemoteApiGateway
import com.poracode.app.transport.richchat.AttachmentUploadBody
import com.poracode.app.transport.richchat.BinaryRequestPlan
import com.poracode.app.transport.richchat.RequestResolution
import com.poracode.app.transport.richchat.RichChatRemoteTransport
import com.poracode.app.transport.richchat.RuntimeImagePathSegment
import com.poracode.app.transport.richchat.TerminalStartInput
import com.poracode.app.transport.richchat.ThreadGoalUpdate
import com.poracode.app.transport.richchat.ThreadSteerInput
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class GeneratedRichChatSessionGatewayTest {
    @Test
    fun mutationRefusesTransportThatMayAutomaticallyRetry() = runTest {
        val host = richLease()
        val core = FakeCoreGateway()
        val gateway = generatedGateway(host, core, FakeSpecializedTransport(), unsafe = true)

        val error = expectGatewayFailure {
            gateway.send(host, "thread-a", "hello", ThreadConfig(), null, "message-a")
        }

        assertEquals("unsafe_retry_policy", error.code)
        assertEquals(0, core.sendCalls)
        assertFalse(error.requestMayHaveCommitted)
    }

    @Test
    fun singleAttemptNetworkFailureIsAmbiguousAndNeverRetried() = runTest {
        val host = richLease()
        val core = FakeCoreGateway().apply {
            sendFailure = RemoteClientException("lost", 0, "network")
        }
        val gateway = generatedGateway(host, core, FakeSpecializedTransport())

        val error = expectGatewayFailure {
            gateway.send(host, "thread-a", "hello", ThreadConfig(), null, "message-a")
        }

        assertEquals(1, core.sendCalls)
        assertEquals("network", error.code)
        assertTrue(error.requestMayHaveCommitted)
    }

    @Test
    fun exactScopeIsCheckedBeforeProviderAnd403ClassificationIsStable() = runTest {
        val host = richLease(scopes = setOf("session:read", "session:operate"))
        var providerCalls = 0
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val gateway = GeneratedRichChatSessionGateway(session, RichChatGatewayProvider {
            providerCalls += 1
            RichChatGatewayBundle(
                FakeCoreGateway(),
                FakeSpecializedTransport(),
                RichChatMutationDelivery.SingleAttempt,
            )
        })

        val error = expectGatewayFailure {
            gateway.resolveRequest(
                host,
                "thread-a",
                RequestResolution(
                    kotlinx.serialization.json.JsonPrimitive("r"),
                    "approve",
                    JsonObject(emptyMap()),
                ),
            )
        }

        assertEquals(403, error.statusCode)
        assertEquals("missing_scope", error.code)
        assertEquals(0, providerCalls)
        val failure = error.asRichChatFailure(RichChatCapability.ResolveRequests, true)
            as RichChatOperationFailure.AuthorizationDenied
        assertTrue(failure.missingScope)
        assertEquals("requests:resolve", failure.requiredScope)
    }

    @Test
    fun checkpointFixtureDecodesThroughGatewayBoundary() = runTest {
        val host = richLease()
        val root = Json.parseToJsonElement(fixture("checkpoint-turn-sequences.json")).jsonObject
        val specialized = FakeSpecializedTransport().apply {
            checkpointList = root.getValue("listResult").jsonObject
        }
        val gateway = generatedGateway(host, FakeCoreGateway(), specialized)

        val result = gateway.listCheckpoints(
            host,
            "thread-rich",
            root.getValue("listRequest").jsonObject,
        )

        assertEquals(2, result.checkpoints.size)
        assertEquals(2, result.turns.size)
        assertTrue(result.turns.all { it.threadId == "thread-rich" && it.isTurn })
        assertEquals(1, specialized.listCalls)
    }

    @Test
    fun mutationAmbiguityIsClassifiedFromStatusAndCode() = runTest {
        data class Case(val status: Int, val code: String, val committed: Boolean)
        val cases = listOf(
            Case(500, "request_failed", true),
            Case(503, "request_failed", true),
            Case(0, "network", true),
            Case(200, "invalid_response", true),
            Case(400, "request_failed", false),
            Case(404, "request_failed", false),
            Case(422, "request_failed", false),
        )
        for (case in cases) {
            val core = FakeCoreGateway().apply {
                sendFailure = RemoteClientException("x", case.status, case.code)
            }
            val gateway = generatedGateway(richLease(), core, FakeSpecializedTransport())

            val error = expectGatewayFailure {
                gateway.send(richLease(), "thread-a", "hello", ThreadConfig(), null, "message-a")
            }

            assertEquals(
                "status=${case.status} code=${case.code}",
                case.committed,
                error.requestMayHaveCommitted,
            )
            assertEquals("status=${case.status} code=${case.code}", 1, core.sendCalls)
        }
    }

    @Test
    fun readServerFailuresStayDefinite() = runTest {
        val core = FakeCoreGateway().apply {
            historyFailure = RemoteClientException("lost", 503, "request_failed")
        }
        val host = richLease()
        val gateway = generatedGateway(host, core, FakeSpecializedTransport())

        val error = expectGatewayFailure { gateway.history(host, "thread-a") }

        assertEquals(503, error.statusCode)
        assertFalse(error.requestMayHaveCommitted)
    }

    @Test
    fun staleHostSuppressesMutationAndReportsDefiniteStaleLease() = runTest {
        val host = richLease()
        val core = FakeCoreGateway()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val gateway = GeneratedRichChatSessionGateway(session, RichChatGatewayProvider {
            RichChatGatewayBundle(
                core,
                FakeSpecializedTransport(),
                RichChatMutationDelivery.SingleAttempt,
            )
        })
        session.value = richLease(generation = 2)

        val error = expectGatewayFailure {
            gateway.send(host, "thread-a", "hello", ThreadConfig(), null, "message-a")
        }

        assertEquals(409, error.statusCode)
        assertEquals("stale_lease", error.code)
        assertFalse(error.requestMayHaveCommitted)
        assertEquals(0, core.sendCalls)
    }

    private fun generatedGateway(
        host: RichChatHostLease,
        core: FakeCoreGateway,
        specialized: FakeSpecializedTransport,
        unsafe: Boolean = false,
    ) = GeneratedRichChatSessionGateway(
        MutableStateFlow<RichChatHostLease?>(host),
        RichChatGatewayProvider {
            RichChatGatewayBundle(
                core,
                specialized,
                if (unsafe) {
                    RichChatMutationDelivery.AutomaticRetryPossible
                } else {
                    RichChatMutationDelivery.SingleAttempt
                },
            )
        },
        receivedAtEpochMs = { 1L },
    )

    private suspend fun expectGatewayFailure(block: suspend () -> Unit): RichChatGatewayException {
        try {
            block()
            fail("Expected RichChatGatewayException")
        } catch (error: RichChatGatewayException) {
            return error
        }
        error("unreachable")
    }
}

private class FakeCoreGateway : RemoteApiGateway {
    var sendCalls = 0
    var sendFailure: RemoteClientException? = null
    var historyFailure: RemoteClientException? = null

    override fun setAccessToken(token: String?) = Unit
    override suspend fun environment(): RemoteEnvironmentDescriptor = unused()
    override suspend fun exchangePairingCredential(
        credential: String,
        scopes: List<String>,
    ): RemoteAccessTokenResult = unused()

    override suspend fun snapshot(): RemoteShellSnapshot = unused()
    override suspend fun threadHistory(
        threadId: String,
        targetTimelineEntryCount: Int?,
    ): RemoteThreadSnapshot {
        historyFailure?.let { throw it }
        return unused()
    }

    override suspend fun threadRuntimeItemsPage(
        threadId: String,
        beforePosition: Int?,
        limit: Int,
        targetTimelineEntryCount: Int?,
    ): RemoteRuntimeItemsPage = unused()

    override suspend fun sendThreadInput(
        threadId: String,
        prompt: String,
        config: ThreadConfig,
        segments: JsonArray?,
        userMessageItemId: String?,
    ) {
        sendCalls += 1
        sendFailure?.let { throw it }
    }

    override suspend fun interruptThread(threadId: String) = Unit
    override suspend fun websocketTicket(): String = unused()
    override fun websocketUrl(
        ticket: String,
        lastSeenSeq: Int?,
        threadItemInterests: List<String>?,
    ): String = unused()

    private fun <T> unused(): T = throw UnsupportedOperationException("unused")
}

private class FakeSpecializedTransport : RichChatRemoteTransport {
    var checkpointList = JsonObject(emptyMap())
    var listCalls = 0

    override suspend fun truncateRuntime(threadId: String, itemId: String) = Unit
    override suspend fun updateThreadGoal(threadId: String, update: ThreadGoalUpdate) = Unit
    override suspend fun setSteer(threadId: String, input: ThreadSteerInput) = Unit
    override suspend fun clearSteer(threadId: String) = Unit
    override suspend fun resolveRequest(threadId: String, resolution: RequestResolution) = Unit
    override suspend fun startTerminal(input: TerminalStartInput) = Unit
    override suspend fun writeTerminal(threadId: String, data: String) = Unit
    override suspend fun resizeTerminal(threadId: String, columns: Int, rows: Int) = Unit
    override suspend fun closeTerminal(threadId: String) = Unit
    override suspend fun closeThread(threadId: String) = Unit
    override suspend fun rollbackThreadConversation(payload: JsonObject) = Unit
    override suspend fun createFileCheckpoint(payload: JsonObject): JsonObject = unused()
    override suspend fun finalizeFileCheckpoint(payload: JsonObject): JsonObject = unused()
    override suspend fun listFileCheckpoints(payload: JsonObject): JsonObject {
        listCalls += 1
        return checkpointList
    }

    override suspend fun restoreFileCheckpoint(payload: JsonObject) = Unit
    override suspend fun subagentSubscribe(payload: JsonObject): JsonObject = unused()
    override suspend fun subagentUnsubscribe(payload: JsonObject) = Unit
    override suspend fun stageThreadInput(payload: JsonObject) = Unit
    override suspend fun uploadAttachment(
        threadId: String,
        name: String,
        contentType: String,
        body: AttachmentUploadBody,
    ): String = unused()

    override fun localImageRequest(path: String): BinaryRequestPlan = unused()
    override fun runtimeImageRequest(
        threadId: String,
        itemId: String,
        path: List<RuntimeImagePathSegment>,
    ): BinaryRequestPlan = unused()

    private fun <T> unused(): T = throw UnsupportedOperationException("unused")
}
