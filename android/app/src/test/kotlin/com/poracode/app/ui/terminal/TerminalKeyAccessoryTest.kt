package com.poracode.app.ui.terminal

import com.poracode.remote.v3.generated.terminalHardwareKeySequence
import com.poracode.remote.v3.generated.TerminalHardwareKey
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

    // Reconciled divergences from the hand-written encoder (spec
    // terminalKeyEncodingSpec.ts): the generated encoder now also covers the
    // edges the old Android copy got wrong, byte-identically to iOS.

    @Test
    fun hardwareCtrlFoldMissesUseCsiU() {
        // Android already sent CSI-u here; iOS used to pass the character
        // through unmodified. The spec keeps CSI-u.
        fun chord(character: String, shift: Boolean = false) = terminalHardwareKeySequence(
            TerminalHardwareKey.Character,
            character = character,
            isCtrl = true, isShift = shift, isAlt = false, isMeta = false,
        )
        assertEquals("\u001b[49;5u", chord("1"))
        assertEquals("\u001b[49;6u", chord("1", shift = true))
        assertEquals("\u001b[32;5u", chord(" "))
        // DEL is outside the fold band, so it is a fold miss too.
        assertEquals("\u001b[127;5u", chord("\u007f"))
    }

    @Test
    fun hardwareUnmappableCharactersFallBackToBareSequences() {
        // Android used to emit CSI-u with the first UTF-16 unit, putting a
        // lone surrogate into the PTY stream. The spec keeps iOS's fallback.
        assertEquals(
            "👍🏻",
            terminalHardwareKeySequence(
                TerminalHardwareKey.Character,
                character = "👍🏻",
                isCtrl = false, isShift = false, isAlt = true, isMeta = false,
            ),
        )
        // A single supplementary scalar maps by code point, not by UTF-16 unit.
        assertEquals(
            "\u001b[128077;3u",
            terminalHardwareKeySequence(
                TerminalHardwareKey.Character,
                character = "👍",
                isCtrl = false, isShift = false, isAlt = true, isMeta = false,
            ),
        )
    }

    @Test
    fun hardwareC0FoldMeasuresUnicodeScalars() {
        // 'ß' uppercases to the two-scalar "SS": no fold (Android used to
        // throw on `.single()` here), and no scalar CSI-u code point either,
        // so the keystroke passes through.
        assertEquals(
            "ß",
            terminalHardwareKeySequence(
                TerminalHardwareKey.Character,
                character = "ß",
                isCtrl = true, isShift = false, isAlt = false, isMeta = false,
            ),
        )
        // A single non-ASCII scalar whose uppercase lands in the band folds.
        assertEquals(
            "\u0013",
            terminalHardwareKeySequence(
                TerminalHardwareKey.Character,
                character = "ſ",
                isCtrl = true, isShift = false, isAlt = false, isMeta = false,
            ),
        )
    }
}
