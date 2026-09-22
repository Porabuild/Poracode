package com.poracode.app.session.richchat

import com.poracode.app.chat.RichItemState
import com.poracode.app.chat.RichItemTypes
import com.poracode.app.chat.RichPayloadPatch
import com.poracode.app.chat.RichRuntimeEvent
import com.poracode.app.chat.RichRuntimeItem
import com.poracode.app.model.RemoteJson
import com.poracode.app.model.RemoteThreadSnapshot
import com.poracode.app.transport.RemoteApiClient
import com.poracode.app.transport.richchat.GeneratedRichChatRemoteTransport
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class RichChatControllerTest {
    @Test
    fun authoritativeFixtureHistoryInstallsRichDomain() = runTest {
        val host = richLease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val gateway = FakeRichChatSessionGateway()
        val raw = fixture("thread-history.json")
        val remote = RemoteJson.decodeFromString(RemoteThreadSnapshot.serializer(), raw)
        val mapped = RichChatHistoryMapper.snapshot(host.connectionId, remote, 123L)
        gateway.historyHandler = { _, _ -> mapped }
        val controller = RichChatController(session, gateway)
        controller.selectThread("thread-fixture-001")

        val result = controller.refreshHistory()

        assertTrue(result is RichChatOperationResult.Success)
        assertEquals(42, controller.state.value.snapshotSeq)
        assertEquals(
            listOf("item-fixture-assistant"),
            controller.state.value.transcript?.orderedItemIds,
        )
        assertEquals(128L, controller.state.value.transcript?.contextUsage?.usedTokens)
        assertEquals(RichChatLoadPhase.Loaded, controller.state.value.loadPhase)
        assertTrue(controller.state.value.activeOperations.isEmpty())
    }

    @Test
    fun oldHostHistoryAndLiveEventsCannotMutateNewSelection() = runTest {
        val hostA = richLease(generation = 4)
        val hostB = richLease(richConnectionB, generation = 9)
        val session = MutableStateFlow<RichChatHostLease?>(hostA)
        val gateway = FakeRichChatSessionGateway()
        val started = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        gateway.historyHandler = { lease, threadId ->
            started.complete(Unit)
            release.await()
            richSnapshot(lease, threadId, seq = 50)
        }
        val controller = RichChatController(session, gateway)
        val old = (controller.selectThread("same") as RichChatOperationResult.Success).value
        val pending = async { controller.refreshHistory() }
        runCurrent()
        started.await()

        session.value = hostB
        controller.selectThread("same")
        release.complete(Unit)

        assertSame(RichChatOperationResult.Stale, pending.await())
        val event = RichRuntimeEvent.ItemStarted(
            old.key,
            "late",
            RichItemTypes.ASSISTANT_MESSAGE,
            RichPayloadPatch.Absent,
            null,
        )
        assertFalse(controller.apply(old, event))
        assertEquals(hostB.key, controller.state.value.selection?.host?.key)
        assertEquals(null, controller.state.value.transcript)
    }

    @Test
    fun sendsAreSerializedAndEachIsIssuedOnce() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val firstStarted = CompletableDeferred<Unit>()
        val firstRelease = CompletableDeferred<Unit>()
        var sendCount = 0
        gateway.unitHandler = { name ->
            if (name == "send") {
                sendCount += 1
                if (sendCount == 1) {
                    firstStarted.complete(Unit)
                    firstRelease.await()
                }
            }
        }
        val controller = RichChatController(session, gateway)
        controller.selectThread("thread-a")
        controller.installAuthoritativeSnapshot(
            controller.selection.value!!,
            richSnapshot(),
        )

        val first = async { controller.send("first") }
        val second = async { controller.send("second") }
        runCurrent()
        firstStarted.await()
        assertEquals(1, sendCount)

        firstRelease.complete(Unit)
        runCurrent()

        assertTrue(first.await() is RichChatOperationResult.Success)
        assertTrue(second.await() is RichChatOperationResult.Success)
        assertEquals(2, sendCount)
        assertEquals(listOf("send", "send"), gateway.calls.filter { it == "send" })
    }

    @Test
    fun exactRequestScopeGatesBeforeGatewayAndClassifiesMissingScope() = runTest {
        val host = richLease(scopes = setOf("session:read", "session:operate"))
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val gateway = FakeRichChatSessionGateway()
        val controller = RichChatController(session, gateway)
        controller.selectThread("thread-a")
        val resolution = com.poracode.app.transport.richchat.RequestResolution(
            kotlinx.serialization.json.JsonPrimitive("request-a"),
            "approve",
            JsonObject(emptyMap()),
        )

        val result = controller.resolveRequest(resolution) as RichChatOperationResult.Failed

        val denied = result.failure as RichChatOperationFailure.AuthorizationDenied
        assertEquals("requests:resolve", denied.requiredScope)
        assertTrue(denied.missingScope)
        assertFalse("resolve" in gateway.calls)
    }

    @Test
    fun ambiguousMutationIsNotRetriedAndRequiresRefresh() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        gateway.unitHandler = { name ->
            if (name == "interrupt") {
                throw RichChatGatewayException(null, "outcome_unknown", true)
            }
        }
        val controller = RichChatController(session, gateway)
        controller.selectThread("thread-a")

        val result = controller.interrupt() as RichChatOperationResult.Failed

        val failure = result.failure as RichChatOperationFailure.Remote
        assertTrue(failure.requestMayHaveCommitted)
        assertEquals(1, gateway.calls.count { it == "interrupt" })
        assertTrue(controller.state.value.needsAuthoritativeRefresh)
    }

    @Test
    fun transportTimeoutMutationIsAmbiguousAndNeverResent() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        gateway.unitHandler = { name ->
            if (name == "interrupt") throw RichChatGatewayException(0, "timeout", true)
        }
        val controller = RichChatController(session, gateway)
        controller.selectThread("thread-a")

        val result = controller.interrupt() as RichChatOperationResult.Failed

        val failure = result.failure as RichChatOperationFailure.Remote
        assertEquals(0, failure.statusCode)
        assertEquals("timeout", failure.code)
        assertTrue("a dispatched mutation may have committed", failure.requestMayHaveCommitted)
        assertEquals(1, gateway.calls.count { it == "interrupt" })
        assertTrue(controller.state.value.needsAuthoritativeRefresh)
    }

    @Test
    fun latestSteerOperationOwnsPublication() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val firstStarted = CompletableDeferred<Unit>()
        val releaseFirst = CompletableDeferred<Unit>()
        gateway.unitHandler = { name ->
            if (name == "steer-set") {
                firstStarted.complete(Unit)
                releaseFirst.await()
            }
        }
        val controller = RichChatController(session, gateway)
        controller.selectThread("thread-a")
        val set = async {
            controller.setSteer(
                com.poracode.app.transport.richchat.ThreadSteerInput(
                    "first",
                    JsonObject(emptyMap()),
                ),
            )
        }
        runCurrent()
        firstStarted.await()

        val clear = async { controller.clearSteer() }
        runCurrent()
        releaseFirst.complete(Unit)

        assertTrue(clear.await() is RichChatOperationResult.Success)
        assertSame(RichChatOperationResult.Stale, set.await())
        assertEquals(1, gateway.calls.count { it == "steer-set" })
        assertEquals(1, gateway.calls.count { it == "steer-clear" })
    }

    @Test
    fun authAndForbiddenFailuresRemainDistinct() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val failures = ArrayDeque(
            listOf(
                RichChatGatewayException(401, "invalid_token", false),
                RichChatGatewayException(403, "forbidden", false),
            ),
        )
        gateway.unitHandler = { name -> if (name == "interrupt") throw failures.removeFirst() }
        val controller = RichChatController(session, gateway)
        controller.selectThread("thread-a")

        val unauthorized = controller.interrupt() as RichChatOperationResult.Failed
        val forbidden = controller.interrupt() as RichChatOperationResult.Failed

        assertSame(RichChatOperationFailure.AuthenticationRequired, unauthorized.failure)
        val denied = forbidden.failure as RichChatOperationFailure.AuthorizationDenied
        assertFalse(denied.missingScope)
        assertEquals("session:operate", denied.requiredScope)
    }

    @Test
    fun backgroundCancelsInFlightWorkWithoutPublishingOrReplay() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val started = CompletableDeferred<Unit>()
        gateway.unitHandler = { name ->
            if (name == "send") {
                started.complete(Unit)
                awaitCancellation()
            }
        }
        val controller = RichChatController(session, gateway)
        controller.selectThread("thread-a")
        controller.installAuthoritativeSnapshot(controller.selection.value!!, richSnapshot())
        val pending = async { controller.send("hello") }
        runCurrent()
        started.await()

        controller.enterBackground()
        runCurrent()

        try {
            pending.await()
            fail("Expected cancellation")
        } catch (_: CancellationException) {
            // Lifecycle cancellation is control flow.
        }
        assertTrue(controller.state.value.activeOperations.isEmpty())
        assertTrue(controller.state.value.needsAuthoritativeRefresh)
        assertEquals(1, gateway.calls.count { it == "send" })
    }

    // MARK: - history read terminal paths (F-D3)

    @Test
    fun delayedHistoryReplaysOnlyFramesNewerThanTheInstalledSnapshot() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val release = CompletableDeferred<Unit>()
        gateway.historyHandler = { lease, threadId ->
            release.await()
            richSnapshot(lease, threadId, items = listOf(historyItem("history")), seq = 10)
        }
        val controller = RichChatController(session, gateway)
        controller.selectThread("thread-a")
        val pending = async { controller.refreshHistory() }
        runCurrent()
        val selection = controller.selection.value!!
        controller.applyServerFrame(
            selection,
            sequence = 9,
            events = listOf(startedEvent(selection, "stale")),
        )
        controller.applyServerFrame(
            selection,
            sequence = 11,
            events = listOf(startedEvent(selection, "fresh")),
        )
        release.complete(Unit)
        runCurrent()

        assertTrue(pending.await() is RichChatOperationResult.Success)
        assertEquals(
            listOf("history", "fresh"),
            controller.state.value.transcript?.orderedItemIds,
        )
        assertEquals(10, controller.state.value.snapshotSeq)
    }

    @Test
    fun cancelledOwnerValidHistoryReadReleasesRetainedFrames() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val started = CompletableDeferred<Unit>()
        gateway.historyHandler = { _, _ ->
            started.complete(Unit)
            awaitCancellation()
        }
        val controller = RichChatController(session, gateway)
        controller.selectThread("thread-a")
        val pending = async { controller.refreshHistory() }
        runCurrent()
        started.await()
        val selection = controller.selection.value!!
        controller.applyServerFrame(
            selection,
            sequence = 200,
            events = listOf(startedEvent(selection, "stalled")),
        )

        pending.cancel()
        runCurrent()
        try {
            pending.await()
            fail("Expected cancellation")
        } catch (_: CancellationException) {
            // Owner-valid cancellation is control flow.
        }
        assertTrue(controller.state.value.activeOperations.isEmpty())
        assertEquals(
            "an owner-valid cancellation must settle out of Loading",
            RichChatLoadPhase.Idle,
            controller.state.value.loadPhase,
        )
        assertNull(controller.state.value.failure)

        gateway.historyHandler = { lease, threadId ->
            richSnapshot(lease, threadId, items = listOf(historyItem("history")), seq = 6)
        }
        assertTrue(controller.refreshHistory() is RichChatOperationResult.Success)
        assertEquals(
            "the cancelled window must be released, not replayed over the snapshot",
            listOf("history"),
            controller.state.value.transcript?.orderedItemIds,
        )
    }

    @Test
    fun staleGenerationHistoryFailureDoesNotClearNewerSelectionFrames() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val releaseFirst = CompletableDeferred<Unit>()
        gateway.historyHandler = { lease, threadId ->
            if (threadId == "thread-a") {
                releaseFirst.await()
                throw RichChatGatewayException(409, "stale_lease", false)
            }
            richSnapshot(lease, threadId, seq = 5)
        }
        val controller = RichChatController(session, gateway)
        controller.selectThread("thread-a")
        val stale = async { controller.refreshHistory() }
        runCurrent()

        controller.selectThread("thread-b")
        val selectionB = controller.selection.value!!
        controller.applyServerFrame(
            selectionB,
            sequence = 6,
            events = listOf(startedEvent(selectionB, "live-b")),
        )
        releaseFirst.complete(Unit)
        runCurrent()

        assertSame(RichChatOperationResult.Stale, stale.await())
        assertTrue(controller.refreshHistory() is RichChatOperationResult.Success)
        assertEquals(
            "a superseded generation's failure must not release the newer window",
            listOf("live-b"),
            controller.state.value.transcript?.orderedItemIds,
        )
    }

    @Test
    fun mismatchedSnapshotSettlesAsInvalidResponseAndKeepsRetainedFrames() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        // Defensive contract-violation payload: valid shape, wrong thread key.
        gateway.historyHandler = { lease, _ -> richSnapshot(lease, "thread-other", seq = 6) }
        val controller = RichChatController(session, gateway)
        controller.selectThread("thread-a")
        val selection = controller.selection.value!!
        controller.applyServerFrame(
            selection,
            sequence = 200,
            events = listOf(startedEvent(selection, "live")),
        )

        val refused = controller.refreshHistory() as RichChatOperationResult.Failed
        assertSame(RichChatOperationFailure.InvalidResponse, refused.failure)
        assertNull(controller.state.value.transcript)
        assertEquals(
            "a refused snapshot must not leave the surface loading forever",
            RichChatLoadPhase.Failed,
            controller.state.value.loadPhase,
        )
        assertTrue(controller.state.value.activeOperations.isEmpty())

        gateway.historyHandler = { lease, threadId -> richSnapshot(lease, threadId, seq = 6) }
        assertTrue(controller.refreshHistory() is RichChatOperationResult.Success)
        assertEquals(
            "a mismatched snapshot must not release the retained history window",
            listOf("live"),
            controller.state.value.transcript?.orderedItemIds,
        )
    }

    @Test
    fun staleGenerationMismatchedSnapshotDoesNotClearNewerSelectionFrames() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val release = CompletableDeferred<Unit>()
        // The old read resolves after the handoff with a wrong-key snapshot.
        gateway.historyHandler = { lease, _ ->
            release.await()
            richSnapshot(lease, "thread-other", seq = 6)
        }
        val controller = RichChatController(session, gateway)
        controller.selectThread("thread-a")
        val stale = async { controller.refreshHistory() }
        runCurrent()

        controller.selectThread("thread-b")
        val selectionB = controller.selection.value!!
        controller.applyServerFrame(
            selectionB,
            sequence = 200,
            events = listOf(startedEvent(selectionB, "live-b")),
        )
        release.complete(Unit)
        runCurrent()

        assertSame(RichChatOperationResult.Stale, stale.await())
        assertEquals(
            "a superseded mismatch must not settle the new owner's load",
            RichChatLoadPhase.Loading,
            controller.state.value.loadPhase,
        )
        assertNull(controller.state.value.failure)

        gateway.historyHandler = { lease, threadId -> richSnapshot(lease, threadId, seq = 6) }
        assertTrue(controller.refreshHistory() is RichChatOperationResult.Success)
        assertEquals(
            "a superseded mismatch must not clear the new selection's window",
            listOf("live-b"),
            controller.state.value.transcript?.orderedItemIds,
        )
    }

    @Test
    fun cancelledStaleHistoryReadDoesNotClearNewerSelectionFrames() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val started = CompletableDeferred<Unit>()
        gateway.historyHandler = { _, _ ->
            started.complete(Unit)
            awaitCancellation()
        }
        val controller = RichChatController(session, gateway)
        controller.selectThread("thread-a")
        val stale = async { controller.refreshHistory() }
        runCurrent()
        started.await()

        controller.selectThread("thread-b")
        val selectionB = controller.selection.value!!
        controller.applyServerFrame(
            selectionB,
            sequence = 200,
            events = listOf(startedEvent(selectionB, "live-b")),
        )
        stale.cancel()
        runCurrent()
        try {
            stale.await()
            fail("Expected cancellation")
        } catch (_: CancellationException) {
            // Caller cancellation of a superseded read is control flow.
        }

        assertEquals(
            "a superseded cancellation must not settle the new owner's load",
            RichChatLoadPhase.Loading,
            controller.state.value.loadPhase,
        )
        gateway.historyHandler = { lease, threadId -> richSnapshot(lease, threadId, seq = 6) }
        assertTrue(controller.refreshHistory() is RichChatOperationResult.Success)
        assertEquals(
            "a superseded cancellation must not clear the new selection's window",
            listOf("live-b"),
            controller.state.value.transcript?.orderedItemIds,
        )
    }

    @Test
    fun failedUnrelatedOperationDoesNotClearRetainedHistoryFrames() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        gateway.unitHandler = { name ->
            if (name == "interrupt") throw RichChatGatewayException(503, "unavailable", false)
        }
        val controller = RichChatController(session, gateway)
        controller.selectThread("thread-a")
        val selection = controller.selection.value!!
        controller.applyServerFrame(
            selection,
            sequence = 200,
            events = listOf(startedEvent(selection, "live")),
        )
        val failed = controller.interrupt()
        assertTrue(failed is RichChatOperationResult.Failed)

        gateway.historyHandler = { lease, threadId -> richSnapshot(lease, threadId, seq = 6) }
        assertTrue(controller.refreshHistory() is RichChatOperationResult.Success)
        assertEquals(
            "an unrelated operation failure must not release the history window",
            listOf("live"),
            controller.state.value.transcript?.orderedItemIds,
        )
    }

    @Test
    fun realTransportTimeoutSettlesTypedFailureAndReleasesRetainedFrames() = runTest {
        val server = MockWebServer()
        server.start()
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE))
        server.enqueue(MockResponse().setBody(fixture("thread-history.json")))
        // The short injected OkHttp deadline is the production seam: the same
        // callTimeout that production sets to RemoteSocketPolicy.REQUEST_TIMEOUT_MS.
        val remote = RemoteApiClient(
            endpoint = server.url("/").toString().trimEnd('/'),
            accessToken = "token",
            client = OkHttpClient.Builder()
                .callTimeout(300, TimeUnit.MILLISECONDS)
                .readTimeout(300, TimeUnit.MILLISECONDS)
                .build(),
        )
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        // Production-shaped gateway: the real HTTP core, the real rich transport,
        // and the real lease/capability gate around them.
        val gateway = GeneratedRichChatSessionGateway(
            session,
            RichChatGatewayProvider {
                RichChatGatewayBundle(
                    core = remote,
                    rich = GeneratedRichChatRemoteTransport(remote),
                    mutationDelivery = RichChatMutationDelivery.SingleAttempt,
                )
            },
        )
        val controller = RichChatController(session, gateway)
        controller.selectThread("thread-fixture-001")

        val pending = async { controller.refreshHistory() }
        runCurrent()
        // The real request reached the stalled server; frames now buffer.
        assertNotNull(server.takeRequest(2, TimeUnit.SECONDS))
        val selection = controller.selection.value!!
        controller.applyServerFrame(
            selection,
            sequence = 200,
            events = listOf(startedEvent(selection, "stalled")),
        )

        val result = pending.await()
        assertTrue(
            "the transport deadline must surface a typed failure, not cancellation",
            result is RichChatOperationResult.Failed,
        )
        val failure = (result as RichChatOperationResult.Failed).failure
            as RichChatOperationFailure.Remote
        assertEquals(0, failure.statusCode)
        assertEquals("timeout", failure.code)
        assertFalse(failure.requestMayHaveCommitted)
        assertTrue(controller.state.value.activeOperations.isEmpty())
        assertEquals(
            "a timed-out first load must settle into the retry surface",
            RichChatLoadPhase.Failed,
            controller.state.value.loadPhase,
        )

        assertTrue(controller.refreshHistory() is RichChatOperationResult.Success)
        assertEquals(
            "the real transport timeout must release the retained window",
            listOf("item-fixture-assistant"),
            controller.state.value.transcript?.orderedItemIds,
        )
        server.shutdown()
    }

    private fun startedEvent(lease: RichChatThreadLease, id: String): RichRuntimeEvent =
        RichRuntimeEvent.ItemStarted(
            lease.key,
            id,
            RichItemTypes.ASSISTANT_MESSAGE,
            RichPayloadPatch.Absent,
            null,
        )

    private fun historyItem(id: String): RichRuntimeItem = RichRuntimeItem(
        id = id,
        type = RichItemTypes.ASSISTANT_MESSAGE,
        state = RichItemState.COMPLETED,
    )
}
