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
}
