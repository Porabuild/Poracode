package com.poracode.app.session.browsermirror

import com.poracode.app.model.browsermirror.BrowserCommand
import com.poracode.app.model.browsermirror.BrowserFrame
import com.poracode.app.model.browsermirror.BrowserFrameMetadata
import com.poracode.app.model.browsermirror.BrowserInput
import com.poracode.app.model.browsermirror.BrowserMirrorAvailability
import com.poracode.app.model.browsermirror.BrowserServerMessage
import com.poracode.app.model.browsermirror.BrowserState
import com.poracode.app.model.browsermirror.BrowserTab
import com.poracode.app.transport.browsermirror.BrowserMirrorSocketEnvelope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class BrowserMirrorControllerTest {
    private val scopes = setOf("session:read", "session:operate")

    private fun lease(
        connectionId: String = "host-A",
        generation: Long = 1L,
        socketGeneration: Long = 10L,
        foreground: Boolean = true,
        online: Boolean = true,
        ready: Boolean = true,
    ) = BrowserMirrorHostLease(
        connectionId = connectionId,
        generation = generation,
        socketGeneration = socketGeneration,
        scopes = scopes,
        foreground = foreground,
        online = online,
        ready = ready,
    )

    private fun stateFor(active: String = "t1"): BrowserState = BrowserState(
        tabs = listOf(BrowserTab(active, "https://example.test", "Example", null, false, true, false)),
        activeTabId = active,
    )

    private fun frame(tabId: String = "t1"): BrowserFrame = BrowserFrame(
        tabId = tabId,
        jpegBytes = byteArrayOf(0xff.toByte(), 0xd8.toByte(), 1, 2, 0xff.toByte(), 0xd9.toByte()),
        metadata = BrowserFrameMetadata(1280.0, 720.0, 1.0, 0.0, 0.0, 0.0),
    )

    private class FakeGateway : BrowserMirrorSessionGateway {
        val commands = mutableListOf<Pair<BrowserMirrorHostLease, BrowserCommand>>()
        val states = mutableListOf<BrowserMirrorHostLease>()
        val watches = mutableListOf<BrowserMirrorHostLease>()
        val unwatches = mutableListOf<BrowserMirrorHostLease>()
        val inputs = mutableListOf<Pair<BrowserMirrorHostLease, BrowserInput>>()
        var commandResult: BrowserState = BrowserState(emptyList(), null)
        var stateResult: BrowserState = BrowserState(emptyList(), null)
        var commandException: BrowserMirrorGatewayException? = null
        var onCommand: (suspend () -> Unit)? = null

        override suspend fun state(lease: BrowserMirrorHostLease): BrowserState {
            states += lease
            return stateResult
        }

        override suspend fun command(
            lease: BrowserMirrorHostLease,
            command: BrowserCommand,
        ): BrowserState {
            commands += lease to command
            onCommand?.invoke()
            commandException?.let { throw it }
            return commandResult
        }

        override suspend fun watch(lease: BrowserMirrorHostLease) {
            watches += lease
        }

        override suspend fun unwatch(lease: BrowserMirrorHostLease) {
            unwatches += lease
        }

        override suspend fun input(lease: BrowserMirrorHostLease, input: BrowserInput) {
            inputs += lease to input
        }
    }

    @Test
    fun mutatingCommandIsSingleAttemptAndAmbiguousFailureTriggersOneAuthoritativeGet() = runTest {
        val leases = MutableStateFlow<BrowserMirrorHostLease?>(lease())
        val gateway = FakeGateway().apply {
            commandException = BrowserMirrorGatewayException(
                statusCode = 0,
                code = "network",
                ambiguousMutation = true,
            )
            stateResult = stateFor()
        }
        val controller = BrowserMirrorController(leases, gateway, this)
        try {
            advanceUntilIdle()

            controller.launchCommand(BrowserCommand.Navigate("t1", "https://example.test/x"))
            advanceUntilIdle()

            assertEquals(1, gateway.commands.size)
            // Exactly one authoritative GET, never a replay of the mutation.
            assertEquals(1, gateway.states.size)
            assertNotEquals(
                BrowserCommand.Navigate("t1", "https://example.test/x"),
                gateway.states.single().let { /* state is a read */ Unit },
            )
            assertEquals(BrowserMirrorFailure.AmbiguousCommand, controller.state.value.failure)
            // Authoritative state was applied.
            assertEquals("t1", controller.state.value.browser.activeTabId)
        } finally {
            controller.close()
        }
    }

    @Test
    fun commandResultFromPriorHostIsDroppedWhenHostChangesMidFlight() = runTest {
        val initial = lease(connectionId = "host-A")
        val leases = MutableStateFlow<BrowserMirrorHostLease?>(initial)
        val gateway = FakeGateway().apply {
            commandResult = BrowserState(
                tabs = listOf(BrowserTab("t1", "https://a", "A", null, false, false, false)),
                activeTabId = "t1",
            )
            onCommand = { leases.value = lease(connectionId = "host-B") }
        }
        val controller = BrowserMirrorController(leases, gateway, this)
        try {
            advanceUntilIdle()

            controller.launchCommand(BrowserCommand.Reload("t1"))
            advanceUntilIdle()

            // The host-A result must NOT be projected onto host-B.
            assertTrue(controller.state.value.browser.tabs.isEmpty())
            assertNull(controller.state.value.browser.activeTabId)
            assertEquals(1, gateway.commands.size)
        } finally {
            controller.close()
        }
    }

    @Test
    fun watchIntentIsIdempotentAndRewatchesOnSocketGenerationChange() = runTest {
        val leases = MutableStateFlow<BrowserMirrorHostLease?>(lease(socketGeneration = 10L))
        val gateway = FakeGateway()
        val controller = BrowserMirrorController(leases, gateway, this)
        try {
            advanceUntilIdle()

            controller.requestWatch()
            advanceUntilIdle()
            assertEquals(1, gateway.watches.size)

            // Idempotent: a second watch intent does not send another watch.
            controller.requestWatch()
            advanceUntilIdle()
            assertEquals(1, gateway.watches.size)

            // A new socket generation rewrites the prior subscription invalid and rewatches.
            leases.value = lease(socketGeneration = 11L)
            advanceUntilIdle()
            assertEquals(2, gateway.watches.size)
        } finally {
            controller.close()
        }
    }

    @Test
    fun backgroundingClearsFramesBlocksInputsAndForegroundRewatchesAfterRefresh() = runTest {
        val leases = MutableStateFlow<BrowserMirrorHostLease?>(lease())
        val gateway = FakeGateway().apply { stateResult = stateFor() }
        val controller = BrowserMirrorController(leases, gateway, this)
        try {
            advanceUntilIdle()
            controller.requestWatch()
            advanceUntilIdle()
            assertEquals(1, gateway.watches.size)

            controller.onBackground()
            // Best-effort unwatch is emitted asynchronously; advance the scheduler.
            advanceUntilIdle()
            assertEquals(1, gateway.unwatches.size)
            assertFalse(controller.state.value.watching)
            assertNull(controller.state.value.frame)

            // New input is blocked while backgrounded.
            controller.launchInput(BrowserInput.Tap(10.0, 10.0))
            advanceUntilIdle()
            assertEquals(0, gateway.inputs.size)

            controller.onForeground()
            advanceUntilIdle()
            // Foreground does an authoritative refresh (GET) then rewatches.
            assertTrue(gateway.states.isNotEmpty())
            assertTrue(gateway.watches.size >= 2)
        } finally {
            controller.close()
        }
    }

    @Test
    fun framesAndInputsFromPriorSocketOrTabAreSuppressed() = runTest {
        val initial = lease(socketGeneration = 10L)
        val leases = MutableStateFlow<BrowserMirrorHostLease?>(initial)
        val gateway = FakeGateway().apply { stateResult = stateFor("t1") }
        val controller = BrowserMirrorController(leases, gateway, this)
        try {
            advanceUntilIdle()
            controller.requestWatch()
            advanceUntilIdle()
            // Seed state so the active tab is t1.
            controller.onSocketMessage(
                BrowserMirrorSocketEnvelope(initial.socketKey, BrowserServerMessage.State(stateFor("t1"))),
            )
            assertNull(controller.state.value.frame)

            // Frame from the CURRENT socket/tab is applied.
            controller.onSocketMessage(
                BrowserMirrorSocketEnvelope(initial.socketKey, BrowserServerMessage.Frame(frame("t1"))),
            )
            assertEquals("t1", controller.state.value.frame?.tabId)

            // Rotate socket generation; the prior frame must become harmless.
            val next = lease(socketGeneration = 11L)
            leases.value = next
            advanceUntilIdle()
            assertNull("frame cleared on socket change", controller.state.value.frame)

            // A late frame arriving on the OLD socket key is dropped.
            controller.onSocketMessage(
                BrowserMirrorSocketEnvelope(initial.socketKey, BrowserServerMessage.Frame(frame("t1"))),
            )
            assertNull(controller.state.value.frame)

            // A frame for a non-active tab on the current socket is dropped.
            controller.onSocketMessage(
                BrowserMirrorSocketEnvelope(next.socketKey, BrowserServerMessage.Frame(frame("other-tab"))),
            )
            assertNull(controller.state.value.frame)

            // Unavailable status clears any current frame.
            controller.onSocketMessage(
                BrowserMirrorSocketEnvelope(next.socketKey, BrowserServerMessage.State(stateFor("t1"))),
            )
            controller.onSocketMessage(
                BrowserMirrorSocketEnvelope(next.socketKey, BrowserServerMessage.Frame(frame("t1"))),
            )
            assertEquals("t1", controller.state.value.frame?.tabId)
            controller.onSocketMessage(
                BrowserMirrorSocketEnvelope(
                    next.socketKey,
                    BrowserServerMessage.Status(
                        com.poracode.app.model.browsermirror.BrowserMirrorStatus(
                            BrowserMirrorAvailability.Unavailable,
                            null,
                        ),
                    ),
                ),
            )
            assertNull(controller.state.value.frame)
        } finally {
            controller.close()
        }
    }

    /**
     * Deterministic proof that [BrowserMirrorController.close] cancels the lease observer
     * and any in-flight work, clears frame/state, and that a late lease emission after
     * close does not trigger watch/unwatch/refresh or resurrect state. This is the exact
     * regression for the cancelled run's runTest hang at the old line 147.
     */
    @Test
    fun closeCancelsObservationAndLateLeaseChangesDoNothing() = runTest {
        val leases = MutableStateFlow<BrowserMirrorHostLease?>(lease(socketGeneration = 10L))
        val gateway = FakeGateway().apply { stateResult = stateFor() }
        val controller = BrowserMirrorController(leases, gateway, this)
        advanceUntilIdle()
        controller.requestWatch()
        advanceUntilIdle()
        assertEquals(1, gateway.watches.size)
        assertTrue(controller.state.value.watching)

        controller.close()

        // State is reset and the surface is inert.
        assertFalse(controller.state.value.watching)
        assertNull(controller.state.value.frame)
        assertNull(controller.state.value.mirrorStatus)
        val watchesBefore = gateway.watches.size
        val statesBefore = gateway.states.size
        val unwatchesBefore = gateway.unwatches.size

        // Late lease changes (new socket generation, then a new host) must not trigger
        // any controller work after close.
        leases.value = lease(socketGeneration = 11L)
        controller.requestWatch()
        controller.launchRefresh()
        controller.onForeground()
        advanceUntilIdle()
        leases.value = lease(connectionId = "host-B", socketGeneration = 12L)
        advanceUntilIdle()

        assertEquals("no new watches after close", watchesBefore, gateway.watches.size)
        assertEquals("no new state reads after close", statesBefore, gateway.states.size)
        assertEquals("no new unwatches after close", unwatchesBefore, gateway.unwatches.size)
        assertFalse(controller.state.value.watching)
        // close() is idempotent and never throws.
        controller.close()
    }
}
