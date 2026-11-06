package com.poracode.app.session.richchat

import com.poracode.app.protocol.BackgroundTask
import com.poracode.remote.v3.generated.RemoteBackgroundTaskOutput
import com.poracode.remote.v3.generated.RemoteBackgroundTaskStopAction
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Selected-detail reads and Stop: opaque payload passthrough, one serialized
 * read, non-exclusive read semantics (no global busy/ambiguity), identity
 * fencing on host/thread/selection/reset, and a Stop slot independent of the
 * read slot. DTO bounds are the generated `RemoteBackgroundTaskOutput` guard.
 */
class RichChatBackgroundTasksControllerTest {
    private class Fixture(
        host: RichChatHostLease = richLease(),
        threadId: String = "thread-a",
    ) {
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val selection = MutableStateFlow<RichChatThreadLease?>(
            RichChatThreadLease(host, threadId, 1),
        )
        val gateway = FakeRichChatSessionGateway()
        val lifecycle = ForegroundOperationRegistry()
        val actions = RichChatSessionActionsController(session, selection, gateway, lifecycle)
        val controller = RichChatBackgroundTasksController(
            session,
            selection,
            lifecycle,
            actions::invoke,
        )
    }

    private fun task(
        outputPayload: Map<String, String> = linkedMapOf("token" to "run-1"),
        stopPayload: Map<String, String> = linkedMapOf("token" to "run-1"),
    ) = BackgroundTask(
        taskId = "task-1",
        kind = "command",
        description = "Install deps",
        category = "command",
        command = "pnpm test",
        stopAction = RemoteBackgroundTaskStopAction("background-task.stop.v1", stopPayload),
        outputAction = RemoteBackgroundTaskStopAction("background-task.output.v1", outputPayload),
    )

    private fun outputJson(
        output: String = "tail",
        totalBytes: Double = 42.0,
        truncated: Boolean = false,
    ): JsonObject = buildJsonObject {
        put("output", output)
        put("totalBytes", totalBytes)
        put("truncated", truncated)
    }

    private suspend fun Fixture.advertise() {
        gateway.sessionActionIds = listOf("background-task.output.v1", "background-task.stop.v1")
        actions.refreshInventory()
    }

    @Test
    fun readInvokesTheOpaqueDescriptorAndNeverTouchesGlobalMutationState() = runTest {
        val fixture = Fixture()
        var seenPayload: JsonObject? = null
        fixture.gateway.sessionActionInvokeHandler = { actionId, payload ->
            assertEquals("background-task.output.v1", actionId)
            seenPayload = payload
            outputJson()
        }
        fixture.advertise()

        val result = fixture.controller.readOutput(task())

        assertTrue(result is RichChatOperationResult.Success)
        val ready = (result as RichChatOperationResult.Success).value as RichChatBackgroundTaskOutput.Ready
        assertEquals("tail", ready.output)
        assertEquals(42.0, ready.totalBytes, 0.0)
        assertFalse(ready.truncated)
        assertEquals(
            buildJsonObject {
                put("token", "run-1")
            },
            seenPayload,
        )
        val state = fixture.controller.output.value
        assertEquals(RichChatBackgroundTaskOutput.Ready("tail", 42.0, false), state.output)
        assertEquals(
            richChatBackgroundTaskReadKey(
                fixture.selection.value!!,
                task(),
            ),
            state.key,
        )
        assertNull("a read never occupies the exclusive mutation slot",
            fixture.actions.state.value.invokingActionId)
        assertNull("a read never publishes thread-level failure",
            fixture.actions.state.value.failure)
        assertFalse(fixture.actions.state.value.needsAuthoritativeRefresh)
    }

    @Test
    fun opaquePayloadKeysAreNeverInterpretedAndMapOrderDoesNotMatter() = runTest {
        val fixture = Fixture()
        fixture.gateway.sessionActionInvokeHandler = { _, _ -> outputJson() }
        fixture.advertise()

        val first = task(
            outputPayload = linkedMapOf("weird key" to "v1", "token" to "opaque", "taskId" to "ignored"),
        )
        val second = task(
            outputPayload = linkedMapOf("taskId" to "ignored", "token" to "opaque", "weird key" to "v1"),
        )
        assertEquals("opaque payload identity is order-insensitive",
            richChatBackgroundTaskReadKey(fixture.selection.value!!, first),
            richChatBackgroundTaskReadKey(fixture.selection.value!!, second))

        assertTrue(fixture.controller.readOutput(first) is RichChatOperationResult.Success)
        assertEquals(
            "ignored",
            (fixture.controller.output.value.key?.actionPayload?.get("taskId")),
        )
        assertEquals("opaque", fixture.controller.output.value.key?.actionPayload?.get("token"))
        assertEquals("v1", fixture.controller.output.value.key?.actionPayload?.get("weird key"))
    }

    @Test
    fun invalidOutputPayloadFailsLocallyWithoutAmbiguousThreadState() = runTest {
        val fixture = Fixture()
        fixture.gateway.sessionActionInvokeHandler = { _, _ ->
            buildJsonObject { put("output", "tail") }
        }
        fixture.advertise()

        val result = fixture.controller.readOutput(task())

        assertTrue(result is RichChatOperationResult.Failed)
        assertEquals(RichChatOperationFailure.InvalidResponse,
            (result as RichChatOperationResult.Failed).failure)
        val output = fixture.controller.output.value.output
        assertTrue(output is RichChatBackgroundTaskOutput.Failed)
        assertEquals(RichChatOperationFailure.InvalidResponse,
            (output as RichChatBackgroundTaskOutput.Failed).failure)
        assertNull(fixture.actions.state.value.failure)
        assertFalse(fixture.actions.state.value.needsAuthoritativeRefresh)
        assertNull(fixture.actions.state.value.invokingActionId)
    }

    @Test
    fun transportFailureStaysLocalToTheRead() = runTest {
        val fixture = Fixture()
        fixture.gateway.sessionActionInvokeHandler = { _, _ ->
            throw RichChatGatewayException(0, "network", false)
        }
        fixture.advertise()

        val result = fixture.controller.readOutput(task())

        assertTrue(result is RichChatOperationResult.Failed)
        assertTrue((result as RichChatOperationResult.Failed).failure is RichChatOperationFailure.Remote)
        assertNull(fixture.actions.state.value.failure)
        assertFalse(fixture.actions.state.value.needsAuthoritativeRefresh)
    }

    @Test
    fun readRespectsTheLiveActionInventory() = runTest {
        val fixture = Fixture()
        fixture.gateway.sessionActionIds = listOf("some.other.action")
        fixture.actions.refreshInventory()
        var invoked = false
        fixture.gateway.sessionActionInvokeHandler = { _, _ ->
            invoked = true
            outputJson()
        }

        val result = fixture.controller.readOutput(task())

        assertTrue(result is RichChatOperationResult.Failed)
        assertFalse("a dynamic descriptor outside the inventory never reaches the host", invoked)
    }

    @Test
    fun onlyOneReadIsInFlightAtATime() = runTest {
        val fixture = Fixture()
        val gate = CompletableDeferred<JsonObject>()
        var calls = 0
        var concurrent = 0
        var maxConcurrent = 0
        fixture.gateway.sessionActionInvokeHandler = { _, _ ->
            calls += 1
            concurrent += 1
            maxConcurrent = maxOf(maxConcurrent, concurrent)
            try {
                gate.await()
            } finally {
                concurrent -= 1
            }
        }
        fixture.advertise()

        val first = async { fixture.controller.readOutput(task()) }
        testScheduler.advanceUntilIdle()
        val second = async { fixture.controller.readOutput(task()) }
        testScheduler.advanceUntilIdle()
        assertEquals(1, calls)

        gate.complete(outputJson())
        testScheduler.advanceUntilIdle()
        assertEquals(2, calls)
        assertEquals(1, maxConcurrent)
        assertTrue(first.await() is RichChatOperationResult.Success)
        assertTrue(second.await() is RichChatOperationResult.Success)
    }

    @Test
    fun staleSelectionResponseNeverPublishes() = runTest {
        val fixture = Fixture()
        val gate = CompletableDeferred<JsonObject>()
        fixture.gateway.sessionActionInvokeHandler = { _, _ -> gate.await() }
        fixture.advertise()

        val read = async { fixture.controller.readOutput(task()) }
        testScheduler.advanceUntilIdle()
        fixture.selection.value = RichChatThreadLease(
            fixture.session.value!!,
            "thread-a",
            generation = 2,
        )
        gate.complete(outputJson())
        testScheduler.advanceUntilIdle()

        assertTrue(read.await() is RichChatOperationResult.Stale)
        assertNull("a superseded selection never sees the old tail",
            fixture.controller.output.value.output)
    }

    @Test
    fun resetFencesAnInFlightReadEvenWhenTheLeaseIsUnchanged() = runTest {
        val fixture = Fixture()
        val gate = CompletableDeferred<JsonObject>()
        fixture.gateway.sessionActionInvokeHandler = { _, _ -> gate.await() }
        fixture.advertise()

        val read = async { fixture.controller.readOutput(task()) }
        testScheduler.advanceUntilIdle()
        fixture.controller.reset()
        gate.complete(outputJson())
        testScheduler.advanceUntilIdle()

        assertTrue(read.await() is RichChatOperationResult.Stale)
        assertNull(fixture.controller.output.value.key)
        assertNull(fixture.controller.output.value.output)
    }

    @Test
    fun stopIsNotBlockedByAnInFlightRead() = runTest {
        val fixture = Fixture()
        val readGate = CompletableDeferred<JsonObject>()
        val stopGate = CompletableDeferred<JsonObject>()
        fixture.gateway.sessionActionInvokeHandler = { actionId, _ ->
            if (actionId == "background-task.output.v1") readGate.await() else stopGate.await()
        }
        fixture.advertise()

        val read = async { fixture.controller.readOutput(task()) }
        testScheduler.advanceUntilIdle()
        val stop = async { fixture.controller.stop(task()) }
        testScheduler.advanceUntilIdle()
        assertTrue(fixture.controller.stop.value.pending)
        assertTrue(read.isActive)

        stopGate.complete(buildJsonObject { })
        testScheduler.advanceUntilIdle()
        assertTrue(stop.await() is RichChatOperationResult.Success)
        assertFalse(fixture.controller.stop.value.pending)
        assertTrue("the read slot remains independent", read.isActive)

        readGate.complete(outputJson())
        testScheduler.advanceUntilIdle()
        assertTrue(read.await() is RichChatOperationResult.Success)
    }

    @Test
    fun duplicateConcurrentStopSendsExactlyOnceAndKeepsFirstPending() = runTest {
        val fixture = Fixture()
        val stopGate = CompletableDeferred<JsonObject>()
        var stopCalls = 0
        fixture.gateway.sessionActionInvokeHandler = { actionId, _ ->
            assertEquals("background-task.stop.v1", actionId)
            stopCalls += 1
            stopGate.await()
        }
        fixture.advertise()

        val first = async { fixture.controller.stop(task()) }
        testScheduler.advanceUntilIdle()
        val second = async { fixture.controller.stop(task()) }
        testScheduler.advanceUntilIdle()
        assertEquals("a duplicate pending Stop never reaches the host", 1, stopCalls)
        assertTrue(fixture.controller.stop.value.pending)
        assertEquals(
            richChatBackgroundTaskStopKey(fixture.selection.value!!, task()),
            fixture.controller.stop.value.key,
        )

        stopGate.complete(buildJsonObject { })
        testScheduler.advanceUntilIdle()
        assertTrue(first.await() is RichChatOperationResult.Success)
        assertTrue("the duplicate reports no second outcome", second.await() is RichChatOperationResult.Stale)
        assertFalse(fixture.controller.stop.value.pending)
        assertEquals(1, stopCalls)
    }

    @Test
    fun duplicateStopDoesNotEraseFirstFailure() = runTest {
        val fixture = Fixture()
        val stopGate = CompletableDeferred<JsonObject>()
        var stopCalls = 0
        fixture.gateway.sessionActionInvokeHandler = { _, _ ->
            stopCalls += 1
            stopGate.await()
        }
        fixture.advertise()

        val first = async { fixture.controller.stop(task()) }
        testScheduler.advanceUntilIdle()
        val duplicate = async { fixture.controller.stop(task()) }
        testScheduler.advanceUntilIdle()
        assertEquals(1, stopCalls)

        stopGate.completeExceptionally(RichChatGatewayException(409, "outcome_unknown", true))
        testScheduler.advanceUntilIdle()
        assertTrue(first.await() is RichChatOperationResult.Failed)
        assertTrue(duplicate.await() is RichChatOperationResult.Stale)
        val stop = fixture.controller.stop.value
        assertFalse(stop.pending)
        assertTrue(stop.failure is RichChatOperationFailure.Remote)
        assertEquals(1, stopCalls)
    }

    @Test
    fun changingTheReadPayloadDoesNotEraseAPendingStop() = runTest {
        val fixture = Fixture()
        val stopGate = CompletableDeferred<JsonObject>()
        fixture.gateway.sessionActionInvokeHandler = { actionId, _ ->
            if (actionId == "background-task.stop.v1") stopGate.await() else outputJson()
        }
        fixture.advertise()

        val stop = async { fixture.controller.stop(task()) }
        testScheduler.advanceUntilIdle()
        assertTrue(fixture.controller.stop.value.pending)
        val stopKey = fixture.controller.stop.value.key

        // The task's output descriptor changes; the read identity changes while
        // the Stop identity stays authoritative.
        assertTrue(
            fixture.controller.readOutput(
                task(outputPayload = linkedMapOf("token" to "run-2")),
            ) is RichChatOperationResult.Success,
        )
        assertTrue(fixture.controller.stop.value.pending)
        assertEquals(stopKey, fixture.controller.stop.value.key)

        stopGate.complete(buildJsonObject { })
        testScheduler.advanceUntilIdle()
        assertTrue(stop.await() is RichChatOperationResult.Success)
        assertFalse(fixture.controller.stop.value.pending)
    }

    @Test
    fun stopFailureIsSurfacedWithoutErasingTheReadSlot() = runTest {
        val fixture = Fixture()
        fixture.gateway.sessionActionInvokeHandler = { actionId, _ ->
            if (actionId == "background-task.stop.v1") {
                throw RichChatGatewayException(409, "outcome_unknown", true)
            }
            outputJson()
        }
        fixture.advertise()
        fixture.controller.readOutput(task())

        val result = fixture.controller.stop(task())

        assertTrue(result is RichChatOperationResult.Failed)
        val stop = fixture.controller.stop.value
        assertFalse(stop.pending)
        assertTrue(stop.failure is RichChatOperationFailure.Remote)
        assertTrue(stop.failure is RichChatOperationFailure.Remote &&
            (stop.failure as RichChatOperationFailure.Remote).requestMayHaveCommitted)
        assertNotNull("output state survives a Stop failure", fixture.controller.output.value.output)
    }

    @Test
    fun generatedOutputDtoBoundsGuardLiveDecoding() {
        assertNotNull(
            decodeBackgroundTaskOutput(
                outputJson(
                    output = "a".repeat(RemoteBackgroundTaskOutput.MAX_OUTPUT_UTF16_LENGTH),
                    totalBytes = RemoteBackgroundTaskOutput.MAX_TOTAL_BYTES,
                    truncated = true,
                ),
            ),
        )
        assertNotNull(
            decodeBackgroundTaskOutput(
                outputJson(output = "\uD83D\uDE00".repeat(8_192)),
            ),
        )
        assertNull(
            decodeBackgroundTaskOutput(
                outputJson(output = "a".repeat(RemoteBackgroundTaskOutput.MAX_OUTPUT_UTF16_LENGTH + 1)),
            ),
        )
        assertNull(
            decodeBackgroundTaskOutput(
                outputJson(output = "\uD83D\uDE00".repeat(8_193)),
            ),
        )
        assertNull(decodeBackgroundTaskOutput(outputJson(totalBytes = -1.0)))
        assertNull(decodeBackgroundTaskOutput(outputJson(totalBytes = 1.5)))
        assertNull(
            decodeBackgroundTaskOutput(
                outputJson(totalBytes = RemoteBackgroundTaskOutput.MAX_TOTAL_BYTES + 1.0),
            ),
        )
        assertNull(
            decodeBackgroundTaskOutput(
                buildJsonObject {
                    put("output", "tail")
                    put("totalBytes", 1.0)
                },
            ),
        )
        assertNull(
            decodeBackgroundTaskOutput(
                buildJsonObject {
                    put("output", 1)
                    put("totalBytes", 1.0)
                    put("truncated", false)
                },
            ),
        )
    }

    @Test
    fun outputRejectsQuotedBooleanAndByteCount() {
        for (value in listOf("true", "false")) {
            assertNull(decodeBackgroundTaskOutput(buildJsonObject {
                put("output", "tail")
                put("totalBytes", 4)
                put("truncated", value)
            }))
        }
        assertNull(decodeBackgroundTaskOutput(buildJsonObject {
            put("output", "tail")
            put("totalBytes", "4")
            put("truncated", false)
        }))
    }

    @Test
    fun stopAndReadIdentityDifferOnlyByActionDescriptor() {
        val lease = richLease()
        val readKey = richChatBackgroundTaskReadKey(
            RichChatThreadLease(lease, "thread-a", 1),
            task(),
        )!!
        val stopKey = richChatBackgroundTaskStopKey(
            RichChatThreadLease(lease, "thread-a", 1),
            task(),
        )!!
        assertNotEquals(readKey.actionId, stopKey.actionId)
        assertNotEquals(
            readKey,
            richChatBackgroundTaskReadKey(
                RichChatThreadLease(lease, "thread-a", 2),
                task(),
            ),
        )
    }

    @Test
    fun keylessTasksCannotBeReadOrStopped() = runTest {
        val fixture = Fixture()
        fixture.advertise()
        val bare = BackgroundTask("task-1", "command", "Install deps")

        assertEquals(
            RichChatOperationFailure.InvalidRequest,
            (fixture.controller.readOutput(bare) as RichChatOperationResult.Failed).failure,
        )
        assertEquals(
            RichChatOperationFailure.InvalidRequest,
            (fixture.controller.stop(bare) as RichChatOperationResult.Failed).failure,
        )
        assertTrue(fixture.gateway.calls.none { it.startsWith("session-action-invoke") })
    }
}
