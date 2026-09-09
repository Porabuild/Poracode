package com.poracode.app.ui.terminal

import com.poracode.app.chat.readRichFixture
import com.poracode.app.chat.TerminalCursorReconciler
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class TerminalTextBufferTest {
    @Test
    fun cursorPaddingBoundsTheWholeDocumentAndKeepsTheRecentSuffix() {
        val buffer = TerminalTextBuffer()
        val paddedRow = " ".repeat(1_000) + "X\n"
        val prefix = "oldest sentinel\n" + "\u001b[1000CX\n".repeat(500)
        buffer.update(prefix)
        val output = buffer.update(prefix + "tail 漢字🌐").lines.joinToString("\n")
        assertTrue(output.length <= 2 * TerminalCursorReconciler.MAX_TRANSCRIPT_UTF16_UNITS)
        assertFalse(output.contains("oldest sentinel"))
        assertTrue(output.endsWith(paddedRow + paddedRow + "tail 漢字🌐"))
    }

    @Test
    fun wideTextDoesNotLoseHalfItsConfiguredUtf16LineBudget() {
        val source = "漢".repeat(8_192)
        assertEquals(source, TerminalTextBuffer().update(source).lines.single())
    }

    @Test
    fun eraseAndBaselineReplacementReleaseTheRenderedBudget() {
        val buffer = TerminalTextBuffer()
        val erase = "\u001b[1000CX\r\u001b[2K\r".repeat(500)
        assertEquals(listOf("KEEP", "DONE"), buffer.update("KEEP\n" + erase + "DONE").lines)
        val expanded = "\u001b[1000CX\n".repeat(500)
        buffer.update(expanded)
        assertEquals(listOf("fresh 漢字🌐"), buffer.update("fresh 漢字🌐").lines)
        assertEquals(listOf("reset"), buffer.update("fresh 漢字🌐\u001b[2Jreset").lines)
    }

    @Test
    fun sharedUnicodeColumnProjectionMatchesAtEveryUtf16Split() {
        for (item in readRichFixture("terminal-unicode-projection.json").getValue("cases").jsonArray) {
            val value = item.jsonObject
            val source = value.getValue("input").jsonPrimitive.content
            val expected = value.getValue("expected").jsonPrimitive.content
            for (split in 0..source.length) {
                val buffer = TerminalTextBuffer()
                buffer.update(source.substring(0, split))
                assertEquals(
                    value.getValue("id").jsonPrimitive.content + " split=" + split,
                    expected,
                    buffer.update(source).lines.joinToString("\n"),
                )
            }
        }
    }

    @Test
    fun trimmingDoesNotSplitSurrogatePairsOrWideCells() {
        val buffer = TerminalTextBuffer(maxLineUtf16Units = 4)
        assertEquals(listOf("🌐🌐"), buffer.update("🌐🌐🌐").lines)
        assertEquals(listOf("X"), buffer.update("🌐🌐🌐\r\u001b[KX").lines)
        assertTrue(
            TerminalTextBuffer(maxLineUtf16Units = 4)
                .update("e" + "\u0301".repeat(10)).lines.single().length <= 4,
        )
    }

    @Test
    fun incrementallyProjectsAnsiCarriageReturnBackspaceAndClearLine() {
        val buffer = TerminalTextBuffer()
        buffer.update("progress 10%\rprogress 20%")
        val appended = buffer.update("progress 10%\rprogress 20%\b\b5%\n\u001b[31mready\u001b[0m")

        assertEquals("progress 25%", appended.lines[0])
        assertEquals("ready", appended.lines[1])
        assertFalse(appended.lines.joinToString().contains('\u001b'))

        val cleared = buffer.update("before\u001b[2Kafter")
        assertEquals(listOf("      after"), cleared.lines)
    }

    @Test
    fun projectsSgrColorAndStyleIntoRuns() {
        val buffer = TerminalTextBuffer()
        val document = buffer.update("\u001b[1;31mred-bold\u001b[0m plain")

        val runs = document.styledLines[0]
        assertEquals(2, runs.size)
        assertEquals("red-bold", runs[0].text)
        assertTrue(runs[0].style.bold)
        assertEquals(TerminalAnsiColor.Standard(1), runs[0].style.foreground)
        assertEquals(" plain", runs[1].text)
        assertEquals(TerminalAnsiStyle(), runs[1].style)
    }

    @Test
    fun sgrRunsSurviveCarriageReturnOverwrite() {
        val buffer = TerminalTextBuffer()
        val document = buffer.update("\u001b[32mok\u001b[0m\rok")

        assertEquals("ok", document.lines[0])
        assertEquals(1, document.styledLines[0].size)
        assertEquals(TerminalAnsiStyle(), document.styledLines[0][0].style)
    }

    @Test
    fun outputIsBoundedByLinesAndLineLength() {
        val buffer = TerminalTextBuffer(maxLines = 3, maxLineUtf16Units = 4)
        val document = buffer.update("123456\na\nb\nc")
        assertEquals(listOf("a", "b", "c"), document.lines)
    }

    @Test
    fun hostileColumnArgumentsStayWithinTheLineBound() {
        val buffer = TerminalTextBuffer(maxLineUtf16Units = 32)
        val document = buffer.update("x\u001b[999999999Cy\u001b[2147483647Gz")

        assertTrue(document.lines.single().length <= 32)
        assertTrue(document.lines.single().endsWith("z"))
    }

    @Test
    fun unchangedTranscriptReusesTheCachedDocument() {
        val buffer = TerminalTextBuffer()
        val first = buffer.update("same")

        assertSame(first, buffer.update("same"))

        val appended = buffer.update("same more")
        assertNotSame(first, appended)
        assertEquals(2L, appended.revision)
    }

    @Test
    fun projectTerminalAutoStartsOnceOnlyWhenTheExactLeaseCanOperate() {
        assertTrue(
            shouldAutoStartProjectTerminal(
                autoStartKey = "desktop:4",
                autoStartRequested = false,
                canOperate = true,
                busy = false,
                hasTerminalLease = false,
                hasProjectLocation = true,
            ),
        )
        assertFalse(
            shouldAutoStartProjectTerminal(
                autoStartKey = "desktop:4",
                autoStartRequested = true,
                canOperate = true,
                busy = false,
                hasTerminalLease = false,
                hasProjectLocation = true,
            ),
        )
        assertFalse(
            shouldAutoStartProjectTerminal(
                autoStartKey = null,
                autoStartRequested = false,
                canOperate = true,
                busy = false,
                hasTerminalLease = false,
                hasProjectLocation = true,
            ),
        )
        assertFalse(
            canStartProjectTerminal(
                canOperate = true,
                busy = false,
                hasTerminalLease = true,
                hasProjectLocation = true,
            ),
        )
    }
}
