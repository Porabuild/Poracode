package com.poracode.app.session.richchat

import com.poracode.app.transport.richchat.TerminalStartInput
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class RichChatRouteReachabilityTest {
    @Test
    fun terminalStartReachesGatewayWithOwnedShellId() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val controller = RichTerminalController(
            session,
            gateway,
            ForegroundOperationRegistry(),
        ) { "watch-a" }
        val input = TerminalStartInput(
            shellId = "shell-owned",
            projectLocation = buildJsonObject {
                put("kind", "posix")
                put("path", "/tmp/work")
            },
            initialColumns = 80,
            initialRows = 24,
        )

        val result = controller.start(input)

        assertTrue(result is RichChatOperationResult.Success)
        assertEquals("shell-owned", (result as RichChatOperationResult.Success).value.terminalId)
        assertEquals(listOf("terminal-start"), gateway.calls)
        // The route owns the client-generated shell id; the watch is NOT auto-started here.
        assertFalse("terminal-watch" in gateway.calls)
    }

    @Test
    fun truncateReachesGatewayWithCapturedImmutableItemId() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val controller = RichChatController(session, gateway)
        controller.selectThread("thread-a")
        controller.installAuthoritativeSnapshot(controller.selection.value!!, richSnapshot())

        val result = controller.truncate("item-immutable")

        assertTrue(result is RichChatOperationResult.Success)
        assertEquals(listOf("truncate"), gateway.calls)
    }

    @Test
    fun truncateRejectsBlankItemIdBeforeAnyTransportCall() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val controller = RichChatController(session, gateway)
        controller.selectThread("thread-a")
        controller.installAuthoritativeSnapshot(controller.selection.value!!, richSnapshot())

        val result = controller.truncate("")

        assertTrue(result is RichChatOperationResult.Failed)
        assertTrue(
            (result as RichChatOperationResult.Failed).failure is
                RichChatOperationFailure.InvalidRequest,
        )
        // The UI only ever captures ids from real projected timeline items; an empty id
        // is rejected at the controller boundary and never reaches the transport.
        assertEquals(emptyList<String>(), gateway.calls)
    }

    @Test
    fun closeRuntimeDeliversOnceTearsDownOnlyCurrentSelectionAndRequiresRefreshOnAmbiguity() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val controller = RichChatController(session, gateway)
        controller.selectThread("thread-a")

        val ok = controller.closeThreadRuntime()

        assertTrue(ok is RichChatOperationResult.Success)
        assertEquals(listOf("thread-close"), gateway.calls)
        assertNull(controller.selection.value)

        // Stale host: deliver once, no local teardown for a deselected thread.
        val staleSession = MutableStateFlow<RichChatHostLease?>(richLease())
        val staleGateway = FakeRichChatSessionGateway()
        val started = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        var staleDeliveries = 0
        staleGateway.unitHandler = { name ->
            if (name == "thread-close") {
                staleDeliveries += 1
                started.complete(Unit)
                release.await()
            }
        }
        val staleController = RichChatController(staleSession, staleGateway)
        val lease = (staleController.selectThread("thread-b")
            as RichChatOperationResult.Success).value
        val pending = async { staleController.closeThreadRuntime() }
        runCurrent()
        started.await()
        staleSession.value = richLease(richConnectionB, generation = 2)
        release.complete(Unit)
        advanceUntilIdle()
        assertSame(RichChatOperationResult.Stale, pending.await())
        assertEquals(1, staleDeliveries)
        // The still-selected (now stale) selection is left intact; teardown honors ownership.
        assertEquals(lease.threadId, staleController.selection.value?.threadId)

        // Ambiguous transport: exactly one delivery, refresh required, selection retained.
        val ambSession = MutableStateFlow<RichChatHostLease?>(richLease())
        val ambGateway = FakeRichChatSessionGateway()
        ambGateway.unitHandler = { name ->
            if (name == "thread-close") throw RichChatGatewayException(null, "outcome_unknown", true)
        }
        val ambController = RichChatController(ambSession, ambGateway)
        ambController.selectThread("thread-c")
        val ambiguous = ambController.closeThreadRuntime()
        assertTrue(ambiguous is RichChatOperationResult.Failed)
        assertTrue(ambController.state.value.needsAuthoritativeRefresh)
        assertEquals(1, ambGateway.calls.count { it == "thread-close" })
        assertEquals("thread-c", ambController.selection.value?.threadId)
    }

    @Test
    fun closeRuntimeAndTruncateAreBlockedByBackgroundAndMissingOperateScope() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val controller = RichChatController(session, gateway)
        controller.selectThread("thread-a")
        controller.enterBackground()

        assertEquals(
            RichChatOperationResult.Failed(RichChatOperationFailure.Backgrounded),
            controller.closeThreadRuntime(),
        )
        assertEquals(
            RichChatOperationResult.Failed(RichChatOperationFailure.Backgrounded),
            controller.truncate("item-1"),
        )
        assertEquals(emptyList<String>(), gateway.calls)

        val readOnly = MutableStateFlow<RichChatHostLease?>(
            richLease(scopes = setOf("session:read", "terminal:read", "terminal:operate")),
        )
        val deniedGateway = FakeRichChatSessionGateway()
        val denied = RichChatController(readOnly, deniedGateway)
        denied.selectThread("thread-a")
        val failure = denied.closeThreadRuntime() as RichChatOperationResult.Failed
        assertTrue(failure.failure is RichChatOperationFailure.AuthorizationDenied)
        assertEquals(emptyList<String>(), deniedGateway.calls)
    }
}
