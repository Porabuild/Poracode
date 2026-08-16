package com.poracode.app.ui.terminal

data class TerminalRenderedDocument(
    val lines: List<String>,
    val revision: Long,
)

/** Small bounded ANSI/plain terminal projection optimized for append-only cursor transcripts. */
class TerminalTextBuffer(
    private val maxLines: Int = 5_000,
    private val maxLineUtf16Units: Int = 8_192,
) {
    private val lines = mutableListOf(StringBuilder())
    private var source = ""
    private var cursorColumn = 0
    private var escape = StringBuilder()
    private var revision = 0L

    fun update(transcript: String): TerminalRenderedDocument {
        if (transcript == source) return snapshot()
        if (transcript.startsWith(source)) {
            append(transcript.substring(source.length))
        } else {
            reset()
            append(transcript)
        }
        source = transcript
        revision += 1L
        return snapshot()
    }

    private fun append(value: String) {
        value.forEach(::accept)
        trimLines()
    }

    private fun accept(character: Char) {
        if (escape.isNotEmpty()) {
            escape.append(character)
            val completeCsi = escape.length > 2 && escape[1] == '[' &&
                character.code in 0x40..0x7e
            val unsupportedEscape = escape.length == 2 && escape[1] != '['
            if (escape.length > MAX_ESCAPE_LENGTH || completeCsi || unsupportedEscape) {
                finishEscape()
            }
            return
        }
        when (character) {
            '\u001b' -> escape.append(character)
            '\n' -> newLine()
            '\r' -> cursorColumn = 0
            '\b' -> backspace()
            '\t' -> repeat(TAB_WIDTH - cursorColumn % TAB_WIDTH) { write(' ') }
            else -> if (character >= ' ' && character != '\u007f') write(character)
        }
    }

    private fun finishEscape() {
        val sequence = escape.toString()
        escape = StringBuilder()
        if (!sequence.startsWith("\u001b[")) return
        val command = sequence.lastOrNull() ?: return
        val arguments = sequence.substring(2, sequence.length - 1)
        when (command) {
            'K' -> clearLine(arguments.toIntOrNull() ?: 0)
            'J' -> if ((arguments.toIntOrNull() ?: 0) == 2) clearScreen()
            'G' -> cursorColumn = ((arguments.toIntOrNull() ?: 1) - 1).coerceAtLeast(0)
            'H', 'f' -> cursorColumn = 0
            // SGR and unsupported cursor controls are intentionally presentation-only.
            else -> Unit
        }
    }

    private fun write(character: Char) {
        val line = lines.last()
        if (cursorColumn < line.length) line.setCharAt(cursorColumn, character)
        else {
            while (line.length < cursorColumn) line.append(' ')
            line.append(character)
        }
        cursorColumn += 1
        if (line.length > maxLineUtf16Units) {
            line.delete(0, line.length - maxLineUtf16Units)
            cursorColumn = line.length
        }
    }

    private fun newLine() {
        lines += StringBuilder()
        cursorColumn = 0
        trimLines()
    }

    private fun backspace() {
        if (cursorColumn <= 0) return
        cursorColumn -= 1
    }

    private fun clearLine(mode: Int) {
        val line = lines.last()
        when (mode) {
            1 -> if (line.isNotEmpty()) line.delete(0, (cursorColumn + 1).coerceAtMost(line.length))
            2 -> {
                line.clear()
                cursorColumn = 0
            }
            else -> if (cursorColumn < line.length) line.delete(cursorColumn, line.length)
        }
    }

    private fun clearScreen() {
        lines.clear()
        lines += StringBuilder()
        cursorColumn = 0
    }

    private fun trimLines() {
        val overflow = lines.size - maxLines
        if (overflow > 0) lines.subList(0, overflow).clear()
    }

    private fun reset() {
        lines.clear()
        lines += StringBuilder()
        cursorColumn = 0
        escape = StringBuilder()
        source = ""
    }

    private fun snapshot() = TerminalRenderedDocument(lines.map(StringBuilder::toString), revision)

    private companion object {
        const val TAB_WIDTH = 8
        const val MAX_ESCAPE_LENGTH = 64
    }
}
