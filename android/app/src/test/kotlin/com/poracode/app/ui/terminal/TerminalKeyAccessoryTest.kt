package com.poracode.app.ui.terminal

import org.junit.Assert.assertEquals
import org.junit.Test

class TerminalKeyAccessoryTest {
    @Test
    fun unmodifiedKeysEncodeClassicControlSequences() {
        assertEquals("\u001b", terminalVirtualKeySequence(TerminalVirtualKey.Escape, ctrlActive = false))
        assertEquals("\r", terminalVirtualKeySequence(TerminalVirtualKey.Enter, ctrlActive = false))
        assertEquals("\u007f", terminalVirtualKeySequence(TerminalVirtualKey.Backspace, ctrlActive = false))
        assertEquals("\u001b[A", terminalVirtualKeySequence(TerminalVirtualKey.Up, ctrlActive = false))
        assertEquals("\u001b[B", terminalVirtualKeySequence(TerminalVirtualKey.Down, ctrlActive = false))
        assertEquals("\u001b[C", terminalVirtualKeySequence(TerminalVirtualKey.Right, ctrlActive = false))
        assertEquals("\u001b[D", terminalVirtualKeySequence(TerminalVirtualKey.Left, ctrlActive = false))
    }

    @Test
    fun ctrlModifierUpgradesArrowsToCsiUAndLeavesNonArrowsUnmodified() {
        assertEquals("\u001b[1;5A", terminalVirtualKeySequence(TerminalVirtualKey.Up, ctrlActive = true))
        assertEquals("\u001b[1;5D", terminalVirtualKeySequence(TerminalVirtualKey.Left, ctrlActive = true))
        // Escape/Enter/Backspace have no distinct Ctrl-modified form in this key set.
        assertEquals("\u001b", terminalVirtualKeySequence(TerminalVirtualKey.Escape, ctrlActive = true))
        assertEquals("\r", terminalVirtualKeySequence(TerminalVirtualKey.Enter, ctrlActive = true))
    }
}
