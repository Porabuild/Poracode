package com.poracode.app.session.richchat

import com.poracode.app.model.terminal.TerminalConnectionPhase
import com.poracode.app.model.terminal.TerminalConnectionStatus
import com.poracode.app.model.terminal.TerminalServerFrame
import com.poracode.app.model.terminal.TerminalWatchError
import com.poracode.app.model.terminal.TerminalWatchErrorCode
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ProjectTerminalReconnectTest {
    @Test
    fun transportSuspendedNotificationStillArmsForegroundRewatch() = runTest {
        val host = richLease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val gateway = FakeRichChatSessionGateway()
        val runtime = RichChatSessionRuntime(session, gateway, { "watch-${gateway.calls.size}" }, this)
        runtime.presentProjectTerminalSurface()
        runtime.presentTerminal("owned-shell")
        advanceUntilIdle()
        val watchId = runtime.terminal.state.value.cursor!!.watchId
        // Production composition suspends the transport before the runtime.
        runtime.terminalObserver.onStatus(
            host.key, "owned-shell", watchId,
            TerminalConnectionStatus(TerminalConnectionPhase.Suspended),
        )
        runtime.enterBackground()
        runtime.enterForeground()
        runtime.reconcileSession()
        advanceUntilIdle()
        assertEquals("same shell must rewatch even without a host-key change", 2,
            gateway.calls.count { it == "terminal-watch" })
        assertEquals("owned-shell", runtime.terminal.state.value.lease?.terminalId)
    }

    @Test
    fun delayedWatchCallbacksCannotChangeSuspendedTerminalState() = runTest {
        val host = richLease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val gateway = FakeRichChatSessionGateway()
        val runtime = RichChatSessionRuntime(session, gateway, { "watch" }, this)
        runtime.presentProjectTerminalSurface()
        runtime.presentTerminal("owned-shell")
        advanceUntilIdle()
        runtime.enterBackground()
        val suspended = runtime.terminal.state.value
        runtime.terminalObserver.onStatus(
            host.key, "owned-shell", "watch", TerminalConnectionStatus(TerminalConnectionPhase.Live),
        )
        assertEquals("late live status", suspended, runtime.terminal.state.value)
        runtime.terminalObserver.onConnectionReset(
            host.key, "owned-shell", "watch", TerminalConnectionStatus(TerminalConnectionPhase.Connecting),
        )
        assertEquals("late reset", suspended, runtime.terminal.state.value)
        runtime.terminalObserver.onFrame(host.key, TerminalServerFrame.WatchError(
            TerminalWatchError("owned-shell", "watch", TerminalWatchErrorCode.NotFound, false),
        ))
        assertEquals("late watch error", suspended, runtime.terminal.state.value)
        // Foregrounding opens the network gate before a replacement watch is
        // installed. An old queued callback still has no authority in that gap.
        runtime.enterForeground()
        runtime.terminalObserver.onStatus(
            host.key, "owned-shell", "watch", TerminalConnectionStatus(TerminalConnectionPhase.Live),
        )
        assertEquals("old watch before foreground rewatch", suspended, runtime.terminal.state.value)
    }

    @Test
    fun backgroundReconnectRewatchesSameShellWithoutStartingAnotherProcess() = runTest {
        val originalHost = richLease()
        val session = MutableStateFlow<RichChatHostLease?>(originalHost)
        val gateway = FakeRichChatSessionGateway()
        val runtime = RichChatSessionRuntime(session, gateway, { "watch-${gateway.calls.size}" }, this)
        runtime.presentProjectTerminalSurface()
        runtime.presentTerminal("owned-shell")
        advanceUntilIdle()
        assertEquals(1, gateway.calls.count { it == "terminal-watch" })

        runtime.enterBackground()
        session.value = originalHost.copy(generation = 2, online = false, ready = false)
        runtime.reconcileSession()
        assertEquals("owned-shell", runtime.terminal.state.value.lease?.terminalId)
        runtime.terminal.write("must not send\n")
        assertEquals(0, gateway.calls.count { it == "terminal-write" })
        runtime.enterForeground()
        runtime.reconcileSession()
        advanceUntilIdle()
        assertEquals(1, gateway.calls.count { it == "terminal-watch" })

        session.value = session.value!!.copy(online = true, ready = true)
        runtime.reconcileSession()
        advanceUntilIdle()
        runtime.reconcileSession()
        advanceUntilIdle()
        assertEquals("owned-shell", runtime.terminal.state.value.lease?.terminalId)
        assertEquals(session.value!!.key, runtime.terminal.state.value.lease?.host?.key)
        assertEquals(2, gateway.calls.count { it == "terminal-watch" })
        assertEquals(0, gateway.calls.count { it == "terminal-start" })
    }

    @Test
    fun hostReplacementClearsShellAndNeverWatchesItOnOtherHost() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val runtime = RichChatSessionRuntime(session, gateway, { "watch" }, this)
        runtime.presentProjectTerminalSurface()
        runtime.presentTerminal("owned-shell")
        advanceUntilIdle()
        session.value = richLease(connectionId = richConnectionB, generation = 2)
        runtime.reconcileSession()
        advanceUntilIdle()
        assertNull(runtime.terminal.state.value.lease)
        assertEquals(1, gateway.calls.count { it == "terminal-watch" })
    }

    @Test
    fun rePairOnSameConnectionDoesNotReuseOldShell() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val runtime = RichChatSessionRuntime(session, gateway, { "watch" }, this)
        runtime.presentProjectTerminalSurface()
        runtime.presentTerminal("owned-shell")
        advanceUntilIdle()
        session.value = richLease(generation = 2)
        runtime.reconcileSession()
        advanceUntilIdle()
        assertNull(runtime.terminal.state.value.lease)
        assertEquals(1, gateway.calls.count { it == "terminal-watch" })
    }

    @Test
    fun dismissWhileOfflineDoesNotReattachOnReturn() = runTest {
        val originalHost = richLease()
        val session = MutableStateFlow<RichChatHostLease?>(originalHost)
        val gateway = FakeRichChatSessionGateway()
        val runtime = RichChatSessionRuntime(session, gateway, { "watch" }, this)
        runtime.presentProjectTerminalSurface()
        runtime.presentTerminal("owned-shell")
        advanceUntilIdle()
        runtime.enterBackground()
        session.value = originalHost.copy(generation = 2, online = false)
        runtime.reconcileSession()
        runtime.dismissProjectTerminalSurface()
        session.value = session.value!!.copy(online = true)
        runtime.enterForeground()
        runtime.reconcileSession()
        advanceUntilIdle()
        assertNull(runtime.terminal.state.value.lease)
        assertEquals(1, gateway.calls.count { it == "terminal-watch" })
    }
}
