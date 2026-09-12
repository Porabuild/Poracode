package com.poracode.app.ui.terminal

import com.poracode.app.chat.TerminalCursorReconciler

data class TerminalRenderedDocument(
    val lines: List<String>,
    /** Same rows as [lines], grouped into style runs for ANSI-colored rendering. */
    val styledLines: List<List<TerminalStyledRun>>,
    val revision: Long,
)

/** Small bounded ANSI/plain terminal projection optimized for append-only cursor transcripts. */
class TerminalTextBuffer(
    private val maxLines: Int = 5_000,
    private val maxLineUtf16Units: Int = 8_192,
) {
    private val lineUnitLimit = minOf(maxLineUtf16Units, TerminalCursorReconciler.MAX_TRANSCRIPT_UTF16_UNITS)
    private val lineCellLimit = 2 * lineUnitLimit
    private data class Cell(val text: String, val style: TerminalAnsiStyle, val width: Int = 1)

    private class Line {
        var cells = ArrayDeque<Cell>()
            private set
        var utf16Units = 0
        private var peakCells = 0

        fun add(cell: Cell) {
            cells += cell
            utf16Units += cell.text.length
            peakCells = maxOf(peakCells, cells.size)
        }

        fun set(column: Int, cell: Cell) {
            utf16Units += cell.text.length - cells[column].text.length
            cells[column] = cell
        }

        fun trim(count: Int, fromStart: Boolean) {
            repeat(count) {
                val removed = if (fromStart) cells.removeFirst() else cells.removeLast()
                utf16Units -= removed.text.length
            }
            // Erasing a large row must release its backing array, not only its cells.
            if (cells.isEmpty() || cells.size < peakCells / 2) {
                cells = ArrayDeque(cells)
                peakCells = cells.size
            }
        }
    }

    private val lines = ArrayDeque<Line>().apply { add(Line()) }
    private var renderedCells = 0
    private var source = ""
    private var cursorColumn = 0
    private var canJoinPrevious = false
    private var pendingHighSurrogate: Char? = null
    private var inControlString = false
    private var controlStringEscape = false
    private var escape = StringBuilder()
    private var style = TerminalAnsiStyle()
    private var revision = 0L
    private var cachedTerminalDocument: TerminalRenderedDocument? = null

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
        val text = pendingHighSurrogate?.let { it + value } ?: value
        pendingHighSurrogate = null
        var index = 0
        while (index < text.length) {
            if (Character.isHighSurrogate(text[index]) && index == text.lastIndex) {
                pendingHighSurrogate = text[index]
                break
            }
            val codePoint = Character.codePointAt(text, index)
            accept(codePoint)
            index += Character.charCount(codePoint)
        }
        trimLines()
    }

    private fun accept(codePoint: Int) {
        if (inControlString) {
            if (codePoint == 0x07 || (controlStringEscape && codePoint == 0x5c)) {
                inControlString = false
                controlStringEscape = false
            } else {
                controlStringEscape = codePoint == 0x1b
            }
            return
        }
        if (escape.isNotEmpty()) {
            if (escape.length == 1 && codePoint in CONTROL_STRING_INTRODUCERS) {
                escape.clear()
                inControlString = true
                return
            }
            escape.appendCodePoint(codePoint)
            val completeCsi = escape.length > 2 && escape[1] == '[' && codePoint in 0x40..0x7e
            val unsupportedEscape = escape.length == 2 && escape[1] != '['
            if (escape.length > MAX_ESCAPE_LENGTH || completeCsi || unsupportedEscape) finishEscape()
            return
        }
        if (codePoint < 0x20) canJoinPrevious = false
        when (codePoint) {
            0x1b -> escape.append('\u001b')
            0x0a -> newLine()
            0x0d -> cursorColumn = 0
            0x08 -> backspace()
            0x09 -> {
                repeat(TAB_WIDTH - cursorColumn % TAB_WIDTH) { write(0x20) }
                canJoinPrevious = false
            }
            else -> if (codePoint >= 0x20 && codePoint != 0x7f) write(codePoint)
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
            'G' -> cursorColumn = columnCount(arguments) - 1
            'H', 'f' -> cursorColumn = 0
            'C' -> cursorColumn =
                (cursorColumn + columnCount(arguments)).coerceAtMost(lineCellLimit)
            'D' -> cursorColumn = (cursorColumn - columnCount(arguments)).coerceAtLeast(0)
            'm' -> style = applyTerminalSgr(parseSgrParameters(arguments), style)
            // Unsupported cursor controls are intentionally presentation-only.
            else -> Unit
        }
    }

    /** CSI column argument; omitted means 1, and hostile magnitudes stay inside the line window. */
    private fun columnCount(arguments: String): Int =
        (arguments.toIntOrNull() ?: 1).coerceIn(1, lineCellLimit)

    private fun parseSgrParameters(arguments: String): List<Int> =
        if (arguments.isEmpty()) {
            listOf(0)
        } else {
            arguments.split(';').map { it.toIntOrNull() ?: 0 }
        }

    private fun write(codePoint: Int) {
        val line = lines.last()
        val text = String(Character.toChars(codePoint))
        val scalarWidth = TerminalUnicodeWidth.columns(codePoint)
        val width = if (scalarWidth == 0 && canJoinPrevious) 0 else maxOf(1, scalarWidth)
        if (width > 0) {
            if (cursorColumn + width - line.cells.size > MAX_RENDERED_CELLS) {
                cursorColumn = MAX_RENDERED_CELLS - width
            }
            reserveCells(maxOf(0, cursorColumn + width - line.cells.size))
        }
        val previousSize = line.cells.size
        if (width == 0) {
            var previous = minOf(cursorColumn, line.cells.size) - 1
            while (previous >= 0 && line.cells[previous].width == 0) previous -= 1
            if (previous >= 0) {
                val cell = line.cells[previous]
                line.set(previous, cell.copy(text = cell.text + text))
            }
        } else {
            canJoinPrevious = true
            while (line.cells.size < cursorColumn + width) line.add(Cell(" ", style))
            repeat(width) { eraseCell(line, cursorColumn + it) }
            line.set(cursorColumn, Cell(text, style, width))
            if (width == 2) line.set(cursorColumn + 1, Cell("", style, 0))
            cursorColumn += width
        }
        trimLine(line)
        renderedCells += line.cells.size - previousSize
    }

    private fun eraseCell(line: Line, column: Int) {
        if (column >= line.cells.size) return
        val width = line.cells[column].width
        if (width == 0 && column > 0) line.set(column - 1, Cell(" ", style))
        else if (width == 2 && column + 1 < line.cells.size) line.set(column + 1, Cell(" ", style))
        line.set(column, Cell(" ", style))
    }

    private fun trimLine(line: Line) {
        if (line.utf16Units <= lineUnitLimit && line.cells.size <= lineCellLimit) return
        var removed = 0
        var remainingUnits = line.utf16Units
        while (removed < line.cells.size &&
            (remainingUnits > lineUnitLimit || line.cells.size - removed > lineCellLimit)
        ) {
            remainingUnits -= line.cells[removed].text.length
            removed += 1
        }
        // A retained row must not begin with the continuation of a discarded wide glyph.
        if (removed < line.cells.size && line.cells[removed].width == 0) removed += 1
        line.trim(removed, fromStart = true)
        cursorColumn = (cursorColumn - removed).coerceAtLeast(0)
    }

    private fun newLine() {
        reserveCells(1)
        lines += Line()
        renderedCells += 1
        cursorColumn = 0
        trimLines()
    }

    private fun backspace() {
        if (cursorColumn <= 0) return
        cursorColumn -= 1
    }

    private fun clearLine(mode: Int) {
        val line = lines.last()
        val previousSize = line.cells.size
        when (mode) {
            1 -> repeat(minOf(cursorColumn + 1, line.cells.size)) { eraseCell(line, it) }
            2 -> line.trim(line.cells.size, fromStart = true)
            else -> if (cursorColumn < line.cells.size) {
                eraseCell(line, cursorColumn)
                line.trim(line.cells.size - cursorColumn, fromStart = false)
            }
        }
        trimLine(line)
        renderedCells += line.cells.size - previousSize
    }

    private fun clearScreen() {
        lines.clear()
        lines += Line()
        cursorColumn = 0
        renderedCells = 0
    }

    private fun trimLines() {
        reserveCells(0)
    }

    private fun reserveCells(additional: Int) {
        while (lines.size > 1 &&
            (renderedCells + additional > MAX_RENDERED_CELLS || lines.size > maxLines)
        ) {
            renderedCells -= lines.removeFirst().cells.size + 1
        }
        if (renderedCells + additional > MAX_RENDERED_CELLS) {
            val line = lines.last()
            var removed = minOf(renderedCells + additional - MAX_RENDERED_CELLS, line.cells.size)
            if (removed < line.cells.size && line.cells[removed].width == 0) removed += 1
            line.trim(removed, fromStart = true)
            renderedCells -= removed
            cursorColumn = (cursorColumn - removed).coerceAtLeast(0)
        }
    }

    private fun reset() {
        clearScreen()
        escape = StringBuilder()
        style = TerminalAnsiStyle()
        pendingHighSurrogate = null
        inControlString = false
        controlStringEscape = false
        canJoinPrevious = false
        source = ""
    }

    private fun snapshot(): TerminalRenderedDocument {
        cachedTerminalDocument?.takeIf { it.revision == revision }?.let { return it }
        val document = TerminalRenderedDocument(
            lines = lines.map { line -> line.cells.joinToString("") { it.text } },
            styledLines = lines.map(::styledRuns),
            revision = revision,
        )
        cachedTerminalDocument = document
        return document
    }

    private fun styledRuns(line: Line): List<TerminalStyledRun> {
        val runs = mutableListOf<TerminalStyledRun>()
        val text = StringBuilder()
        var runStyle: TerminalAnsiStyle? = null
        for (cell in line.cells) {
            if (cell.text.isEmpty()) continue
            if (runStyle != null && runStyle != cell.style) {
                runs += TerminalStyledRun(text.toString(), runStyle)
                text.clear()
            }
            runStyle = cell.style
            text.append(cell.text)
        }
        if (runStyle != null) runs += TerminalStyledRun(text.toString(), runStyle)
        return runs
    }

    private companion object {
        const val TAB_WIDTH = 8
        const val MAX_ESCAPE_LENGTH = 64
        const val MAX_RENDERED_CELLS = 2 * TerminalCursorReconciler.MAX_TRANSCRIPT_UTF16_UNITS
        val CONTROL_STRING_INTRODUCERS = setOf(']'.code, 'P'.code, 'X'.code, '^'.code, '_'.code)
    }
}
