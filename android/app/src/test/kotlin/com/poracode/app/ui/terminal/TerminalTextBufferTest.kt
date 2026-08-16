package com.poracode.app.ui.terminal

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class TerminalTextBufferTest {
    @Test
    fun incrementallyProjectsAnsiCarriageReturnBackspaceAndClearLine() {
        val buffer = TerminalTextBuffer()
        buffer.update("progress 10%\rprogress 20%")
        val appended = buffer.update("progress 10%\rprogress 20%\b\b5%\n\u001b[31mready\u001b[0m")

        assertEquals("progress 25%", appended.lines[0])
        assertEquals("ready", appended.lines[1])
        assertFalse(appended.lines.joinToString().contains('\u001b'))

        val cleared = buffer.update("before\u001b[2Kafter")
        assertEquals(listOf("after"), cleared.lines)
    }

    @Test
    fun outputIsBoundedByLinesAndLineLength() {
        val buffer = TerminalTextBuffer(maxLines = 3, maxLineUtf16Units = 4)
        val document = buffer.update("123456\na\nb\nc")
        assertEquals(listOf("a", "b", "c"), document.lines)
    }
}
