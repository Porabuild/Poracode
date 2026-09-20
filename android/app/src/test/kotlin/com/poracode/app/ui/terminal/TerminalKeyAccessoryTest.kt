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

    // V5 plan 5.1: the Ctrl+letter chord set (Ctrl+C, Ctrl+D, Ctrl+L minimum).

    @Test
    fun ctrlLetterVirtualKeysFoldToC0ControlCodes() {
        assertEquals("\u0004", terminalVirtualKeySequence(TerminalVirtualKey.D, ctrlActive = true))
        assertEquals("\u000c", terminalVirtualKeySequence(TerminalVirtualKey.L, ctrlActive = true))
    }

    @Test
    fun letterVirtualKeysWithoutCtrlTypeTheirCharacter() {
        assertEquals("d", terminalVirtualKeySequence(TerminalVirtualKey.D, ctrlActive = false))
        assertEquals("l", terminalVirtualKeySequence(TerminalVirtualKey.L, ctrlActive = false))
    }

    @Test
    fun hardwarePlainCharactersPassThroughVerbatim() {
        assertEquals(
            "q",
            terminalHardwareKeySequence(
                TerminalHardwareKey.Character,
                character = "q",
                isCtrl = false, isShift = false, isAlt = false, isMeta = false,
            ),
        )
    }

    @Test
    fun hardwareControlChordsFoldToC0ControlCodes() {
        fun chord(character: String) = terminalHardwareKeySequence(
            TerminalHardwareKey.Character,
            character = character,
            isCtrl = true, isShift = false, isAlt = false, isMeta = false,
        )
        assertEquals("\u0003", chord("c"))
        assertEquals("\u0004", chord("d"))
        assertEquals("\u000c", chord("l"))
        assertEquals("\u0001", chord("a"))
        assertEquals("\u001b", chord("["))
    }

    @Test
    fun hardwareShiftUppercasesAndBacktabs() {
        assertEquals(
            "a".uppercase(),
            terminalHardwareKeySequence(
                TerminalHardwareKey.Character,
                character = "a",
                isCtrl = false, isShift = true, isAlt = false, isMeta = false,
            ),
        )
        assertEquals(
            "\u001b[Z",
            terminalHardwareKeySequence(
                TerminalHardwareKey.Tab,
                character = "",
                isCtrl = false, isShift = true, isAlt = false, isMeta = false,
            ),
        )
    }

    @Test
    fun hardwareModifiedKeysUseXtermCsiForms() {
        fun seq(key: TerminalHardwareKey, ctrl: Boolean, shift: Boolean, meta: Boolean) =
            terminalHardwareKeySequence(
                key,
                character = "",
                isCtrl = ctrl, isShift = shift, isAlt = false, isMeta = meta,
            )
        assertEquals("\u001b[1;5A", seq(TerminalHardwareKey.Up, ctrl = true, shift = false, meta = false))
        assertEquals("\u001b[1;2B", seq(TerminalHardwareKey.Down, ctrl = false, shift = true, meta = false))
    }

    @Test
    fun hardwareMetaCharacterUsesCsiU() {
        assertEquals(
            "\u001b[67;9u",
            terminalHardwareKeySequence(
                TerminalHardwareKey.Character,
                character = "c",
                isCtrl = false, isShift = false, isAlt = false, isMeta = true,
            ),
        )
        assertEquals(
            "\u001b[13;5u",
            terminalHardwareKeySequence(
                TerminalHardwareKey.Enter,
                character = "",
                isCtrl = true, isShift = false, isAlt = false, isMeta = false,
            ),
        )
    }

    @Test
    fun hardwareBareFunctionalKeysUseClassicSequences() {
        fun seq(key: TerminalHardwareKey) = terminalHardwareKeySequence(
            key,
            character = "",
            isCtrl = false, isShift = false, isAlt = false, isMeta = false,
        )
        assertEquals("\u001b", seq(TerminalHardwareKey.Escape))
        assertEquals("\r", seq(TerminalHardwareKey.Enter))
        assertEquals("\u007f", seq(TerminalHardwareKey.Backspace))
        assertEquals("\u001b[A", seq(TerminalHardwareKey.Up))
        assertEquals("\u001b[H", seq(TerminalHardwareKey.Home))
        assertEquals("\u001b[5~", seq(TerminalHardwareKey.PageUp))
    }
}
