package com.poracode.app.session.richchat

import com.poracode.app.chat.TerminalCursorFrameDecoder
import com.poracode.app.model.terminal.TerminalConnectionFailure
import com.poracode.app.model.terminal.TerminalConnectionPhase
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class RichTerminalControllerTest {
    @Test
    fun fixtureFramesHonorWatchGenerationAndCursorRanges() = runTest {
        val host = richLease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val gateway = FakeRichChatSessionGateway()
        val lifecycle = ForegroundOperationRegistry()
        val controller = RichTerminalController(session, gateway, lifecycle) { "watch-a" }
        val watched = controller.watch("terminal-rich", "watch-a")
            as RichChatOperationResult.Success
        val lease = watched.value
        val steps = Json.parseToJsonElement(fixture("terminal-cursor-sequence.json"))
            .jsonObject.getValue("steps").jsonArray.associate { step ->
                val obj = step.jsonObject
                obj.getValue("id").jsonPrimitive.content to
                    TerminalCursorFrameDecoder.decode(obj.getValue("message"))!!
            }

        assertTrue(controller.applyFrame(lease, steps.getValue("pre-baseline")))
        assertEquals(1, controller.state.value.cursor?.bufferedOutput?.size)
        assertTrue(controller.applyFrame(lease, steps.getValue("baseline")))
        assertEquals("hello", controller.state.value.cursor?.transcript)
        assertTrue(controller.applyFrame(lease, steps.getValue("duplicate")))
        assertEquals("hello!!", controller.state.value.cursor?.transcript)
        assertTrue(controller.applyFrame(lease, steps.getValue("overlap")))
        assertEquals("hello!!xy", controller.state.value.cursor?.transcript)
        assertTrue(controller.applyFrame(lease, steps.getValue("gap")))
        assertTrue(controller.state.value.needsAuthoritativeRefresh)

        val newLease = (controller.watch("terminal-rich", "watch-b")
            as RichChatOperationResult.Success).value
        assertFalse(controller.applyFrame(newLease, steps.getValue("stale-watch")))
        assertEquals("watch-b", controller.state.value.cursor?.watchId)
    }

    @Test
    fun rewatchesRequestCursorV2WithTheRetainedDurablePositionAsResume() = runTest {
        val host = richLease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val gateway = FakeRichChatSessionGateway()
        val controller = RichTerminalController(session, gateway, ForegroundOperationRegistry()) {
            "watch-a"
        }
        val steps = Json.parseToJsonElement(fixture("terminal-cursor-sequence.json"))
            .jsonObject.getValue("steps").jsonArray.associate { step ->
                val obj = step.jsonObject
                obj.getValue("id").jsonPrimitive.content to
                    TerminalCursorFrameDecoder.decode(obj.getValue("message"))!!
            }
        val lease = (controller.watch("terminal-rich", "watch-a")
            as RichChatOperationResult.Success).value
        assertEquals(2, gateway.watchRequests.single().cursorSyncVersion)
        assertEquals(null, gateway.watchRequests.single().resume)

        listOf("pre-baseline", "baseline", "duplicate", "overlap").forEach {
            assertTrue(controller.applyFrame(lease, steps.getValue(it)))
        }
        assertEquals(9L, controller.state.value.cursor?.toCursor)

        // A reconnect retains the durable position and the next watch presents
        // it as v2 resume; the transport negotiates down to v1 on old hosts.
        assertTrue(
            controller.connectionReset(
                host.key,
                "terminal-rich",
                "watch-a",
                com.poracode.app.model.terminal.TerminalConnectionStatus(
                    com.poracode.app.model.terminal.TerminalConnectionPhase.Reconnecting,
                ),
            ),
        )
        controller.watch("terminal-rich", "watch-b")
        val resumed = gateway.watchRequests.last()
        assertEquals(2, resumed.cursorSyncVersion)
        assertEquals(RichTerminalWatchResume("generation-a", 9L), resumed.resume)
    }

    @Test
    fun resumeSuffixAppendsOntoTheRetainedTranscriptAfterRewatch() = runTest {
        val host = richLease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val gateway = FakeRichChatSessionGateway()
        val controller = RichTerminalController(session, gateway, ForegroundOperationRegistry()) {
            "watch-a"
        }
        val steps = Json.parseToJsonElement(fixture("terminal-cursor-sequence.json"))
            .jsonObject.getValue("steps").jsonArray.associate { step ->
                val obj = step.jsonObject
                obj.getValue("id").jsonPrimitive.content to
                    TerminalCursorFrameDecoder.decode(obj.getValue("message"))!!
            }
        val lease = (controller.watch("terminal-rich", "watch-a")
            as RichChatOperationResult.Success).value
        listOf("pre-baseline", "baseline", "duplicate", "overlap").forEach {
            assertTrue(controller.applyFrame(lease, steps.getValue(it)))
        }
        assertEquals("hello!!xy", controller.state.value.cursor?.transcript)

        // Reconnect + rewatch: the seeded cursor keeps the established
        // position under the NEW watch id, so a served resume suffix APPENDS
        // instead of replacing the retained transcript.
        assertTrue(
            controller.connectionReset(
                host.key,
                "terminal-rich",
                "watch-a",
                com.poracode.app.model.terminal.TerminalConnectionStatus(
                    com.poracode.app.model.terminal.TerminalConnectionPhase.Reconnecting,
                ),
            ),
        )
        val rewatchLease = (controller.watch("terminal-rich", "watch-b")
            as RichChatOperationResult.Success).value
        val seeded = controller.state.value.cursor!!
        assertEquals("watch-b", seeded.watchId)
        assertEquals("generation-a", seeded.generation)
        assertTrue(seeded.baselineReceived)
        assertEquals("hello!!xy", seeded.transcript)

        val suffix = com.poracode.app.chat.TerminalCursorFrame(
            kind = com.poracode.app.chat.TerminalCursorFrameKind.BASELINE,
            terminalId = "terminal-rich",
            watchId = "watch-b",
            generation = "generation-a",
            fromCursor = 9L,
            toCursor = 12L,
            data = "abc",
        )
        assertTrue(controller.applyFrame(rewatchLease, suffix))
        assertEquals("hello!!xyabc", controller.state.value.cursor?.transcript)
        assertEquals(12L, controller.state.value.cursor?.toCursor)

        // Up-to-date marker on a later rewatch: an empty continuation keeps
        // the history and still reports authoritative process state.
        controller.connectionReset(
            host.key,
            "terminal-rich",
            "watch-b",
            com.poracode.app.model.terminal.TerminalConnectionStatus(
                com.poracode.app.model.terminal.TerminalConnectionPhase.Reconnecting,
            ),
        )
        controller.watch("terminal-rich", "watch-c")
        val marker = com.poracode.app.chat.TerminalCursorFrame(
            kind = com.poracode.app.chat.TerminalCursorFrameKind.BASELINE,
            terminalId = "terminal-rich",
            watchId = "watch-c",
            generation = "generation-a",
            fromCursor = 12L,
            toCursor = 12L,
            data = "",
        )
        assertFalse(
            controller.applyTransportFrame(
                host.key,
                com.poracode.app.model.terminal.TerminalServerFrame.Cursor(
                    frame = marker,
                    processState = com.poracode.app.model.terminal.TerminalProcessState.Exited,
                ),
            ),
        )
        assertEquals("hello!!xyabc", controller.state.value.cursor?.transcript)
        assertEquals(
            com.poracode.app.model.terminal.TerminalProcessState.Exited,
            controller.state.value.processState,
        )
    }

    @Test
    fun writesAreSerializedAndOldHostFramesAreSuppressed() = runTest {
        val hostA = richLease()
        val session = MutableStateFlow<RichChatHostLease?>(hostA)
        val gateway = FakeRichChatSessionGateway()
        val firstStarted = CompletableDeferred<Unit>()
        val firstRelease = CompletableDeferred<Unit>()
        var writes = 0
        gateway.unitHandler = { name ->
            if (name == "terminal-write") {
                writes += 1
                if (writes == 1) {
                    firstStarted.complete(Unit)
                    firstRelease.await()
                }
            }
        }
        val controller = RichTerminalController(
            session,
            gateway,
            ForegroundOperationRegistry(),
        ) { "watch-a" }
        val watched = controller.watch("terminal-rich") as RichChatOperationResult.Success
        val first = async { controller.write("a") }
        val second = async { controller.write("b") }
        runCurrent()
        firstStarted.await()
        assertEquals(1, writes)
        firstRelease.complete(Unit)
        runCurrent()
        assertTrue(first.await() is RichChatOperationResult.Success)
        assertTrue(second.await() is RichChatOperationResult.Success)
        assertEquals(2, writes)

        session.value = richLease(richConnectionB, generation = 2)
        val frame = TerminalCursorFrameDecoder.decode(
            Json.parseToJsonElement(
                fixture("ws-server-terminal-watch-result-live.json"),
            ),
        )!!
        assertFalse(controller.applyFrame(watched.value, frame))
    }

    @Test
    fun terminalReadAndOperateUseDifferentExactScopes() = runTest {
        val host = richLease(scopes = setOf("terminal:read"))
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val gateway = FakeRichChatSessionGateway()
        val controller = RichTerminalController(
            session,
            gateway,
            ForegroundOperationRegistry(),
        ) { "watch" }
        assertTrue(controller.watch("terminal") is RichChatOperationResult.Success)

        val result = controller.resize(80, 24) as RichChatOperationResult.Failed

        val denied = result.failure as RichChatOperationFailure.AuthorizationDenied
        assertEquals("terminal:operate", denied.requiredScope)
        assertFalse("terminal-resize" in gateway.calls)
    }

    @Test
    fun missingTerminalReadScopeFailsBeforeTransportAndSurfacesPermissionState() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(
            richLease(scopes = setOf("terminal:operate")),
        )
        val gateway = FakeRichChatSessionGateway()
        val controller = RichTerminalController(
            session,
            gateway,
            ForegroundOperationRegistry(),
        ) { "watch" }

        assertTrue(controller.watch("terminal") is RichChatOperationResult.Failed)
        assertEquals(TerminalConnectionPhase.Failed, controller.state.value.connection.phase)
        assertEquals(TerminalConnectionFailure.Permission, controller.state.value.connection.failure)
        assertFalse("terminal-watch" in gateway.calls)
    }

    @Test
    fun staleDismissCannotUnwatchOrClearAReplacementTerminal() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val controller = RichTerminalController(
            session,
            gateway,
            ForegroundOperationRegistry(),
        ) { "watch" }
        val first = (controller.watch("terminal-first") as RichChatOperationResult.Success).value
        val second = (controller.watch("terminal-second") as RichChatOperationResult.Success).value

        assertTrue(controller.unwatch(first) is RichChatOperationResult.Stale)
        assertFalse(controller.clearTerminalIfCurrent(first))
        assertEquals(second, controller.state.value.lease)
        assertFalse("terminal-unwatch" in gateway.calls)

        assertTrue(controller.unwatch(second) is RichChatOperationResult.Success)
        assertTrue(controller.clearTerminalIfCurrent(second))
        assertEquals(null, controller.state.value.lease)
    }

    @Test
    fun detachedTerminalCanBeUnwatchedAfterLocalOwnershipClears() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val controller = RichTerminalController(
            session,
            gateway,
            ForegroundOperationRegistry(),
        ) { "watch" }
        val lease = (controller.watch("terminal") as RichChatOperationResult.Success).value

        assertTrue(controller.clearTerminalIfCurrent(lease))
        assertTrue(controller.unwatchDetached(lease) is RichChatOperationResult.Success)

        assertEquals(null, controller.state.value.lease)
        assertTrue("terminal-unwatch" in gateway.calls)
    }
}
