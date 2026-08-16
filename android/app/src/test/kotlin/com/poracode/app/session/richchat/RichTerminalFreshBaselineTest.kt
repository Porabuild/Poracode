package com.poracode.app.session.richchat

import com.poracode.app.session.replay.ReplayOutcome
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
 * Proof the terminal-reset side effect clears only the affected exact-host/thread
 * terminal cursor/state and requests exactly one fresh watch, while duplicate,
 * other-thread, background, host-swapped, or dismissed outcomes never launch an
 * extra watch.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class RichTerminalFreshBaselineTest {
    private fun freshBaseline(threadId: String) = ReplayOutcome(
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

    @Test
    fun freshBaselineForPresentedTerminalRequestsExactlyOneWatch() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val runtime = RichChatSessionRuntime(session, gateway, { "w-${gateway.calls.size}" }, this)
        runtime.presentTerminal("term-1")
        advanceUntilIdle()
        val before = watchCount(gateway)

        runtime.handleReplaySideEffect(freshBaseline("term-1"))
        advanceUntilIdle()
        assertEquals("exactly one fresh watch", before + 1, watchCount(gateway))
        assertTrue("lease preserved", runtime.terminal.state.value.lease?.terminalId == "term-1")
        assertNull("cursor state cleared", runtime.terminal.state.value.processState)
    }

    @Test
    fun freshBaselineForOtherThreadIdIsNoOp() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val runtime = RichChatSessionRuntime(session, gateway, { "w" }, this)
        runtime.presentTerminal("term-1")
        advanceUntilIdle()
        val before = watchCount(gateway)

        runtime.handleReplaySideEffect(freshBaseline("other-thread"))
        advanceUntilIdle()
        assertEquals(before, watchCount(gateway))
    }

    @Test
    fun freshBaselineWithoutPresentedTerminalIsNoOp() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val runtime = RichChatSessionRuntime(session, gateway, { "w" }, this)
        runtime.handleReplaySideEffect(freshBaseline("term-1"))
        advanceUntilIdle()
        assertEquals(0, watchCount(gateway))
    }

    @Test
    fun freshBaselineAfterBackgroundIsNoOp() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val runtime = RichChatSessionRuntime(session, gateway, { "w" }, this)
        runtime.presentTerminal("term-1")
        advanceUntilIdle()
        runtime.enterBackground()
        val before = watchCount(gateway)

        runtime.handleReplaySideEffect(freshBaseline("term-1"))
        advanceUntilIdle()
        assertEquals(before, watchCount(gateway))
    }

    @Test
    fun freshBaselineAfterHostSwapIsNoOp() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease(connectionId = richConnectionA))
        val gateway = FakeRichChatSessionGateway()
        val runtime = RichChatSessionRuntime(session, gateway, { "w" }, this)
        runtime.presentTerminal("term-1")
        advanceUntilIdle()
        // Host swapped to a different connection/generation.
        session.value = richLease(connectionId = richConnectionB, generation = 99L)
        val before = watchCount(gateway)

        runtime.handleReplaySideEffect(freshBaseline("term-1"))
        advanceUntilIdle()
        assertEquals(before, watchCount(gateway))
        assertFalse("no stale reset leaked", runtime.terminal.state.value.needsAuthoritativeRefresh)
    }
}
