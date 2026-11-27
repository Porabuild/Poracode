package com.poracode.app.ui.terminal

import com.poracode.app.chat.longOrStrictNull
import com.poracode.app.chat.readRichFixture
import com.poracode.remote.v3.generated.TerminalCursorColumnChange
import com.poracode.remote.v3.generated.TerminalCursorReconciler
import kotlinx.serialization.json.JsonNull
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

    @Test
    fun columnReplayFixtureRendersTheRecordedLogicalTail() {
        val fixture = readRichFixture("terminal-column-replay.json")
        for (item in fixture.getValue("cases").jsonArray) {
            val value = item.jsonObject
            val id = value.getValue("id").jsonPrimitive.content
            val input = value.getValue("input").jsonPrimitive.content
            val expected = value.getValue("expectedTail").jsonArray
                .map { it.jsonPrimitive.content }
            val markers = replayMarkers(value.getValue("columnChanges").jsonArray)
            val document = TerminalTextBuffer().update(input, 0, markers)
            val actual = document.lines.map { it.trim() }
            assertEquals(id, expected, actual.takeLast(expected.size))
            assertEquals(document.lines.size, document.styledLines.size)
        }
    }

    @Test
    fun unknownAndAbsentWidthMarkersKeepTheWidthlessProjection() {
        val item = readRichFixture("terminal-column-replay.json")
            .getValue("cases").jsonArray.first().jsonObject
        val input = item.getValue("input").jsonPrimitive.content
        val legacy = TerminalTextBuffer().update(input).lines
        assertEquals(
            legacy,
            TerminalTextBuffer()
                .update(input, 0, listOf(TerminalCursorColumnChange(0, null))).lines,
        )
        // A known width followed by an unknown tail returns the tail to the
        // widthless projection; short leading rows make the whole render equal.
        assertEquals(
            legacy,
            TerminalTextBuffer()
                .update(
                    input,
                    0,
                    listOf(
                        TerminalCursorColumnChange(0, 48),
                        TerminalCursorColumnChange(10, null),
                    ),
                ).lines,
        )
    }

    @Test
    fun columnMarkersAreAbsoluteSoAShiftedTranscriptMatches() {
        val item = readRichFixture("terminal-column-replay.json")
            .getValue("cases").jsonArray.first().jsonObject
        val input = item.getValue("input").jsonPrimitive.content
        val shifted = TerminalTextBuffer().update(
            input,
            500,
            listOf(
                TerminalCursorColumnChange(500, 48),
                TerminalCursorColumnChange(834, 100),
            ),
        ).lines
        val unshifted = TerminalTextBuffer().update(
            input,
            0,
            listOf(
                TerminalCursorColumnChange(0, 48),
                TerminalCursorColumnChange(334, 100),
            ),
        ).lines
        assertEquals(unshifted, shifted)
    }

    @Test
    fun incrementalAppendPreservesTheCanonicalWidthHistory() {
        val item = readRichFixture("terminal-column-replay.json")
            .getValue("cases").jsonArray.first().jsonObject
        val input = item.getValue("input").jsonPrimitive.content
        val markers = replayMarkers(item.getValue("columnChanges").jsonArray)
        val oneShot = TerminalTextBuffer().update(input, 0, markers).lines

        val buffer = TerminalTextBuffer()
        buffer.update(input.substring(0, 100), 0, markers)
        assertEquals(oneShot, buffer.update(input, 0, markers).lines)

        // A front-trimmed transcript re-anchors at a nonzero cursor and must
        // reproduce the same projection as a fresh buffer on the tail.
        val trimmed = input.substring(200)
        buffer.update(input, 0, markers)
        val trimmedDoc = buffer.update(trimmed, 200, markers).lines
        assertEquals(TerminalTextBuffer().update(trimmed, 200, markers).lines, trimmedDoc)
    }

    @Test
    fun identicalTextWithDifferentRecordedWidthsReprojects() {
        // 25 x's wrap at width 20 but fit at width 30; the \r overwrite then
        // lands on different rows, so the logical projection must differ.
        val text = "x".repeat(25) + "\rY"
        val buffer = TerminalTextBuffer()
        assertEquals(
            listOf("x".repeat(20) + "Y" + "x".repeat(4)),
            buffer.update(text, 0, listOf(TerminalCursorColumnChange(0, 20))).lines,
        )
        assertEquals(
            listOf("Y" + "x".repeat(24)),
            buffer.update(text, 0, listOf(TerminalCursorColumnChange(0, 30))).lines,
        )
    }

    @Test
    fun widthGrowthAtThePendingWrapContinuesPastTheEdge() {
        // 20 x's at width 20 leave a pending wrap; growing to 40 must place Y
        // just past the edge rather than overwriting the last x.
        val grown = TerminalTextBuffer().update(
            "x".repeat(20) + "YZ",
            0,
            listOf(
                TerminalCursorColumnChange(0, 20),
                TerminalCursorColumnChange(20, 40),
            ),
        )
        assertEquals(listOf("x".repeat(20) + "YZ"), grown.lines)

        // A known→unknown transition at the same boundary resumes widthless
        // flow from the logical position past the edge.
        val unknown = TerminalTextBuffer().update(
            "x".repeat(20) + "Y" + "z".repeat(30),
            0,
            listOf(
                TerminalCursorColumnChange(0, 20),
                TerminalCursorColumnChange(20, null),
            ),
        )
        assertEquals(listOf("x".repeat(20) + "Y" + "z".repeat(30)), unknown.lines)
    }

    @Test
    fun knownWidthTabStopsClampInsideTheWidth() {
        // 18 x's + TAB + Y at width 20: the next stop clamps to column 19.
        val stopped = TerminalTextBuffer().update(
            "x".repeat(18) + "\tY",
            0,
            listOf(TerminalCursorColumnChange(0, 20)),
        )
        assertEquals(listOf("x".repeat(18) + " " + "Y"), stopped.lines)

        // 20 x's leave a pending wrap; TAB keeps it and Y wraps onward. The
        // soft-wrapped row joins back into the same logical line.
        val wrapped = TerminalTextBuffer().update(
            "x".repeat(20) + "\tY",
            0,
            listOf(TerminalCursorColumnChange(0, 20)),
        )
        assertEquals(listOf("x".repeat(20) + "Y"), wrapped.lines)
    }

    @Test
    fun longWrappedUniformStyleLineKeepsOneLogicalLineAndRun() {
        // 1,000 soft-wrap boundaries must not degrade the projection: one
        // logical line and one merged style run, however the cells stream.
        val text = "x".repeat(20_000)
        val document = TerminalTextBuffer().update(
            text,
            0,
            listOf(TerminalCursorColumnChange(0, 20)),
        )
        assertEquals(listOf(text), document.lines)
        val runs = document.styledLines.single()
        assertEquals(1, runs.size)
        assertEquals(text, runs[0].text)
    }

    @Test
    fun styledRunsMergeAcrossASoftWrapBoundary() {
        val document = TerminalTextBuffer().update(
            "\u001b[31m" + "x".repeat(20) + "Y",
            0,
            listOf(TerminalCursorColumnChange(0, 20)),
        )
        assertEquals(listOf("x".repeat(20) + "Y"), document.lines)
        val runs = document.styledLines.single()
        assertEquals(1, runs.size)
        assertEquals("x".repeat(20) + "Y", runs[0].text)
        assertEquals(TerminalAnsiColor.Standard(1), runs[0].style.foreground)
    }

    @Test
    fun rightMarginWideGlyphClearsTheBoundaryCell() {
        val document = TerminalTextBuffer().update(
            "x".repeat(20) + "\u001b[20G界",
            0,
            listOf(TerminalCursorColumnChange(0, 20)),
        )
        assertEquals(listOf("x".repeat(19) + " " + "界"), document.lines)
    }

    @Test
    fun boundedLargeCursorMovementStaysInsideTheWidth() {
        val document = TerminalTextBuffer().update(
            "a\u001b[${Int.MAX_VALUE}Cy",
            0,
            listOf(TerminalCursorColumnChange(0, 20)),
        )
        assertEquals("a" + " ".repeat(18) + "y", document.lines.single())
    }

    @Test
    fun widthMarkerInsideACsiSequenceAppliesBeforeTheCommandExecutes() {
        val document = TerminalTextBuffer().update(
            "a\u001b[25GY",
            0,
            listOf(
                TerminalCursorColumnChange(0, 20),
                TerminalCursorColumnChange(3, 40),
            ),
        )
        assertEquals("a" + " ".repeat(23) + "Y", document.lines.single())
    }

    @Test
    fun evictionKeepsTheActiveRowAttachedWhenTheCursorReturnsToTheTop() {
        // 21 x's at width 20 wrap once; the width-400 marker then fills each
        // following row to the right margin. CSI 997A returns to the first
        // row and the trailing write forces an eviction at the cell cap.
        val rows = 997
        val source = "x".repeat(21) + "\u001b[400Gx" + "x\u001b[400Gx".repeat(rows - 1) +
            "\u001b[${rows}A\u001b[400GQ"
        val geometry = listOf(
            TerminalCursorColumnChange(0, 20),
            TerminalCursorColumnChange(21, 400),
        )

        val document = TerminalTextBuffer().update(source, 0, geometry)

        // Every row soft-wraps into a single logical line; Q must land at
        // column 399 of the first row instead of a detached Line.
        val wrappedRow = "x" + " ".repeat(398) + "x"
        assertEquals(
            "x".repeat(20) + " ".repeat(379) + "Q" + wrappedRow.repeat(rows - 1),
            document.lines.single(),
        )
        assertTrue(
            document.lines.joinToString("\n").length <=
                2 * TerminalCursorReconciler.MAX_TRANSCRIPT_UTF16_UNITS,
        )
    }

    private fun replayMarkers(array: kotlinx.serialization.json.JsonArray) =
        array.map { entry ->
            val value = entry.jsonObject
            TerminalCursorColumnChange(
                fromCursor = value.getValue("fromCursor").longOrStrictNull()!!,
                columns = when (val raw = value["columns"]) {
                    JsonNull -> null
                    else -> raw?.longOrStrictNull()?.toInt()
                },
            )
        }

    @Test
    fun startRetryIsOfferedOnlyForALeaselessFailureThatCouldStartNow() {
        assertTrue(shouldOfferTerminalStartRetry(true, canOperate = true, busy = false, hasTerminalLease = false, hasProjectLocation = true))
        assertFalse(shouldOfferTerminalStartRetry(false, canOperate = true, busy = false, hasTerminalLease = false, hasProjectLocation = true))
        assertFalse(shouldOfferTerminalStartRetry(true, canOperate = false, busy = false, hasTerminalLease = false, hasProjectLocation = true))
        assertFalse(shouldOfferTerminalStartRetry(true, canOperate = true, busy = true, hasTerminalLease = false, hasProjectLocation = true))
        assertFalse(shouldOfferTerminalStartRetry(true, canOperate = true, busy = false, hasTerminalLease = true, hasProjectLocation = true))
        assertFalse(shouldOfferTerminalStartRetry(true, canOperate = true, busy = false, hasTerminalLease = false, hasProjectLocation = false))
    }
}
