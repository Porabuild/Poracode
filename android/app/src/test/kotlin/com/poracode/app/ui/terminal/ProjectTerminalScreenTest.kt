package com.poracode.app.ui.terminal

import com.poracode.app.model.terminal.TerminalConnectionPhase
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ProjectTerminalScreenTest {
    @Test
    fun initialActionWaitsForLiveConnectionAndCanOnlySendOnce() {
        val live = TerminalConnectionPhase.Live
        for (phase in TerminalConnectionPhase.entries.filter { it != live }) {
            assertFalse(shouldSendProjectInitialCommand("pnpm test", false, true, true, phase))
        }
        assertFalse(shouldSendProjectInitialCommand("pnpm test", false, false, false, live))
        assertFalse(shouldSendProjectInitialCommand("pnpm test", false, true, false, live))
        assertTrue(shouldSendProjectInitialCommand("pnpm test", false, true, true, live))
        assertFalse(shouldSendProjectInitialCommand("pnpm test", true, true, true, live))
        assertFalse(shouldSendProjectInitialCommand("  ", false, true, true, live))
    }
}
