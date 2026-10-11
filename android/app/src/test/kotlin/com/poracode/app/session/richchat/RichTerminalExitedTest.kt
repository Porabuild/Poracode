package com.poracode.app.session.richchat

import com.poracode.app.model.terminal.TerminalProcessState
import com.poracode.app.session.replay.ReplayOutcome
import com.poracode.app.session.replay.SequencedEventApplier
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Proof the terminal-exited side effect marks the exact presented terminal as
 * exited (live -> exited), preserves the exit code, disables writes truthfully,
 * never re-opens the PTY, and that other-thread, stale-host, background, and
 * dismissed outcomes are suppressed. Mirrors `RichTerminalFreshBaselineTest` and
 * the iOS `TerminalReplayBridgeTests`.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class RichTerminalExitedTest {
    private fun exitOutcome(
        threadId: String,
        exitCode: Int? = 0,
    ): ReplayOutcome = ReplayOutcome(
        handled = true,
        applied = true,
        transition = SequencedEventApplier.Transition.ThreadExited(threadId, exitCode),
        gitStateChanged = false,
        resetThreadIds = emptySet(),
        freshBaselineThreadIds = emptySet(),
        agentWindowsLoadedChanged = false,
        agentWslLoadedChanged = false,
        agentMergedChanged = false,
        gitSummariesChanged = false,
        threadExitedId = threadId,
    )

    private fun freshBaseline(threadId: String): ReplayOutcome = ReplayOutcome(
        handled = true,
        applied = true,
        transition = null,
        gitStateChanged = false,
        resetThreadIds = emptySet(),
        freshBaselineThreadIds = setOf(threadId),
        agentWindowsLoadedChanged = false,
        agentWslLoadedChanged = false,
        agentMergedChanged = false,
        gitSummariesChanged = false,
        threadExitedId = null,
    )

    private fun watchCount(gateway: FakeRichChatSessionGateway): Int =
        gateway.calls.count { it == "terminal-watch" }

    private fun writeCount(gateway: FakeRichChatSessionGateway): Int =
        gateway.calls.count { it == "terminal-write" }

    @Test
    fun exitMarksPresentedTerminalExitedPreservesCodeAndNeverReopensThePty() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val runtime = RichChatSessionRuntime(session, gateway, { "w" }, this)
        runtime.presentTerminal("term-1")
        advanceUntilIdle()
        val leaseBefore = runtime.terminal.state.value.lease
        val watchesBefore = watchCount(gateway)
        assertNull("live beforehand", runtime.terminal.state.value.processState)

        runtime.handleReplaySideEffect(exitOutcome("term-1", 137))
        advanceUntilIdle()

        val state = runtime.terminal.state.value
        assertEquals("live -> exited", TerminalProcessState.Exited, state.processState)
        assertEquals("exit code preserved", 137, state.exitCode)
        assertEquals("never a second watch", watchesBefore, watchCount(gateway))
        assertEquals("lease retained", "term-1", state.lease?.terminalId)
        assertNull("no spurious failure", state.failure)
        assertTrue("no fresh baseline requested", !state.needsAuthoritativeRefresh)
        assertFalse("generation bumped", leaseBefore?.generation == state.lease?.generation)
    }

    @Test
    fun exitWithoutACodeIsStillMarkedExited() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val runtime = RichChatSessionRuntime(session, gateway, { "w" }, this)
        runtime.presentTerminal("term-1")
        advanceUntilIdle()

        runtime.handleReplaySideEffect(exitOutcome("term-1", exitCode = null))
        advanceUntilIdle()

        val state = runtime.terminal.state.value
        assertEquals(TerminalProcessState.Exited, state.processState)
        assertNull("null exit code preserved", state.exitCode)
    }

    @Test
    fun exitedTerminalRejectsWritesWithoutReachingTransport() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val runtime = RichChatSessionRuntime(session, gateway, { "w" }, this)
        runtime.presentTerminal("term-1")
        advanceUntilIdle()
        runtime.handleReplaySideEffect(exitOutcome("term-1", 0))
        advanceUntilIdle()
        val writesBefore = writeCount(gateway)

        val result = runtime.terminal.write("ls\n")

        assertTrue("write blocked", result is RichChatOperationResult.Failed)
        assertEquals(
            "truthful failure",
            RichChatOperationFailure.NoThread,
            (result as RichChatOperationResult.Failed).failure,
        )
        assertEquals("no transport call", writesBefore, writeCount(gateway))
        assertEquals("still exited", TerminalProcessState.Exited, runtime.terminal.state.value.processState)
    }

    @Test
    fun exitForOtherThreadIdIsNoOp() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val runtime = RichChatSessionRuntime(session, gateway, { "w" }, this)
        runtime.presentTerminal("term-1")
        advanceUntilIdle()
        val watchesBefore = watchCount(gateway)

        runtime.handleReplaySideEffect(exitOutcome("some-other-thread", 9))
        advanceUntilIdle()

        val state = runtime.terminal.state.value
        assertNull("not exited", state.processState)
        assertNull("no exit code", state.exitCode)
        assertEquals(watchesBefore, watchCount(gateway))
    }

    @Test
    fun exitAfterHostSwapIsNoOp() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease(connectionId = richConnectionA))
        val gateway = FakeRichChatSessionGateway()
        val runtime = RichChatSessionRuntime(session, gateway, { "w" }, this)
        runtime.presentTerminal("term-1")
        advanceUntilIdle()
        // Host swapped to a different connection/generation after the lease was taken.
        session.value = richLease(connectionId = richConnectionB, generation = 99L)
        val watchesBefore = watchCount(gateway)

        runtime.handleReplaySideEffect(exitOutcome("term-1", 0))
        advanceUntilIdle()

        val state = runtime.terminal.state.value
        assertNull("not exited on a stale host", state.processState)
        assertEquals(watchesBefore, watchCount(gateway))
    }

    @Test
    fun exitAfterBackgroundIsNoOp() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val runtime = RichChatSessionRuntime(session, gateway, { "w" }, this)
        runtime.presentTerminal("term-1")
        advanceUntilIdle()
        runtime.enterBackground()
        val watchesBefore = watchCount(gateway)

        runtime.handleReplaySideEffect(exitOutcome("term-1", 0))
        advanceUntilIdle()

        assertNull("background surface not mutated", runtime.terminal.state.value.processState)
        assertEquals(watchesBefore, watchCount(gateway))
    }

    @Test
    fun exitWithoutPresentedTerminalIsNoOp() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val runtime = RichChatSessionRuntime(session, gateway, { "w" }, this)

        runtime.handleReplaySideEffect(exitOutcome("term-1", 0))
        advanceUntilIdle()

        assertEquals(0, watchCount(gateway))
        assertNull("dismissed terminal untouched", runtime.terminal.state.value.lease)
    }

    @Test
    fun duplicateExitIsIdempotent() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val runtime = RichChatSessionRuntime(session, gateway, { "w" }, this)
        runtime.presentTerminal("term-1")
        advanceUntilIdle()

        runtime.handleReplaySideEffect(exitOutcome("term-1", 2))
        advanceUntilIdle()
        val firstState = runtime.terminal.state.value
        val watchesAfterFirst = watchCount(gateway)
        assertEquals(TerminalProcessState.Exited, firstState.processState)
        assertEquals(2, firstState.exitCode)

        // A second, replayed or duplicate exit for the same terminal is a no-op.
        runtime.handleReplaySideEffect(exitOutcome("term-1", 2))
        advanceUntilIdle()

        val secondState = runtime.terminal.state.value
        assertEquals("still exited once", TerminalProcessState.Exited, secondState.processState)
        assertEquals("exit code unchanged", 2, secondState.exitCode)
        assertEquals("no extra watch", watchesAfterFirst, watchCount(gateway))
        assertEquals("generation stable", firstState.lease?.generation, secondState.lease?.generation)
    }

    @Test
    fun exitCancelsAPendingRebaselineInsteadOfReopening() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val runtime = RichChatSessionRuntime(session, gateway, { "w-${gateway.calls.size}" }, this)
        runtime.presentTerminal("term-1")
        advanceUntilIdle()
        // A thread-reset requests exactly one fresh watch (the rebaseline)…
        runtime.handleReplaySideEffect(freshBaseline("term-1"))
        advanceUntilIdle()
        val watchesAfterReset = watchCount(gateway)

        // …then the host reports the PTY exited before a third watch could stack.
        runtime.handleReplaySideEffect(exitOutcome("term-1", 0))
        advanceUntilIdle()

        val state = runtime.terminal.state.value
        assertEquals("exited wins over the pending rebaseline", TerminalProcessState.Exited, state.processState)
        assertEquals("no third watch stacked", watchesAfterReset, watchCount(gateway))
    }

    @Test
    fun resetAfterExitClearsExitedAndRequestsExactlyOneFreshWatch() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val runtime = RichChatSessionRuntime(session, gateway, { "w-${gateway.calls.size}" }, this)
        runtime.presentTerminal("term-1")
        advanceUntilIdle()
        runtime.handleReplaySideEffect(exitOutcome("term-1", 5))
        advanceUntilIdle()
        assertEquals(TerminalProcessState.Exited, runtime.terminal.state.value.processState)
        val watchesAfterExit = watchCount(gateway)

        // The PTY restarts: the exited state is cleared and one fresh watch is requested.
        runtime.handleReplaySideEffect(freshBaseline("term-1"))
        advanceUntilIdle()

        val state = runtime.terminal.state.value
        assertNull("exited cleared on reset", state.processState)
        assertNull("stale exit code cleared on reset", state.exitCode)
        assertEquals("exactly one fresh watch", watchesAfterExit + 1, watchCount(gateway))
        assertEquals("term-1", state.lease?.terminalId)
    }
}
