package com.poracode.app.session.richchat

import com.poracode.app.chat.RichItemTypes
import com.poracode.app.chat.RichPayloadPatch
import com.poracode.app.chat.RichRuntimeEvent
import com.poracode.app.model.RemoteJson
import com.poracode.app.model.RemoteThreadSnapshot
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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
}
