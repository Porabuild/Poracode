package com.poracode.app.ui.terminal

import com.poracode.remote.v3.generated.TerminalCursorColumnChange
import com.poracode.remote.v3.generated.TerminalCursorReconciler

data class TerminalRenderedDocument(
    val lines: List<String>,
    /** Same logical lines as [lines], grouped into style runs for ANSI-colored rendering. */
    val styledLines: List<List<TerminalStyledRun>>,
    val revision: Long,
)

/**
 * Small bounded ANSI/plain terminal projection optimized for append-only cursor
 * transcripts. `columnChanges` carries accepted PTY widths as chronological
 * absolute UTF-16 markers; `fromCursor` is the absolute cursor of `source`'s
 * first unit. A null `columns` marker (or no markers at all) keeps the original
 * widthless projection for that span.
 */
class TerminalTextBuffer(
    private val maxLines: Int = 5_000,
    private val maxLineUtf16Units: Int = 8_192,
) {
    private val lineUnitLimit = minOf(maxLineUtf16Units, TerminalCursorReconciler.MAX_TRANSCRIPT_UTF16_UNITS)
    private val lineCellLimit = 2 * lineUnitLimit
    private data class Cell(val text: String, val style: TerminalAnsiStyle, val width: Int = 1)

    private class Line {
        var softWrapped = false
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
    private var activeLineIndex = 0
    private var renderedCells = 0
    private var source = ""
    private var geometryFromCursor = 0L
    private var appliedColumnChanges: List<TerminalCursorColumnChange> = emptyList()
    private var lastScalarCursor = -1L
    private var columns: Int? = null
    private var cursorColumn = 0
    private var wrapPending = false
    private var canJoinPrevious = false
    private var pendingHighSurrogate: Char? = null
    private var inControlString = false
    private var controlStringEscape = false
    private var escape = StringBuilder()
    private var style = TerminalAnsiStyle()
    private var revision = 0L
    private var cachedTerminalDocument: TerminalRenderedDocument? = null

    /**
     * Projects [transcript] (absolute cursor [fromCursor]) into the rendered
     * document. Pure appends reuse the incremental parser; a changed retained
     * prefix — different anchor, rewritten applied markers, or non-append text —
     * replays the bounded transcript under the full marker list.
     */
    fun update(
        transcript: String,
        fromCursor: Long = 0,
        columnChanges: List<TerminalCursorColumnChange> = emptyList(),
    ): TerminalRenderedDocument {
        if (transcript == source && fromCursor == geometryFromCursor &&
            columnChanges == appliedColumnChanges
        ) {
            return snapshot()
        }
        // Only markers already folded into cells can invalidate the retained
        // prefix; pending markers beyond the last consumed scalar are free to
        // differ without a reproject.
        val prefixIntact = transcript.startsWith(source) && fromCursor == geometryFromCursor &&
            appliedColumnChanges.filter { it.fromCursor <= lastScalarCursor } ==
            columnChanges.filter { it.fromCursor <= lastScalarCursor }
        if (prefixIntact) {
            append(transcript.substring(source.length), columnChanges)
        } else {
            reset()
            geometryFromCursor = fromCursor
            append(transcript, columnChanges)
        }
        appliedColumnChanges = columnChanges
        source = transcript
        revision += 1L
        return snapshot()
    }

    private fun append(value: String, columnChanges: List<TerminalCursorColumnChange>) {
        val markers = columnChanges.filter { it.fromCursor > lastScalarCursor }
        var markerIndex = 0
        val hadPendingSurrogate = pendingHighSurrogate != null
        val text = pendingHighSurrogate?.let { it + value } ?: value
        pendingHighSurrogate = null
        var scalarCursor = geometryFromCursor + source.length - if (hadPendingSurrogate) 1L else 0L
        var index = 0
        while (index < text.length) {
            if (Character.isHighSurrogate(text[index]) && index == text.lastIndex) {
                pendingHighSurrogate = text[index]
                break
            }
            val codePoint = Character.codePointAt(text, index)
            val charCount = Character.charCount(codePoint)
            // Markers apply before the scalar at their absolute cursor —
            // including escape bytes — so a width change landing inside a CSI
            // is visible to that sequence's terminating command.
            while (markerIndex < markers.size && markers[markerIndex].fromCursor <= scalarCursor) {
                val next = usableColumns(markers[markerIndex].columns)
                if (next != columns) {
                    // A pending wrap means the logical cursor sits one cell
                    // past the right edge; keep that position across the
                    // transition instead of clamping onto the last cell.
                    if (wrapPending) cursorColumn += 1
                    columns = next
                    if (next != null) cursorColumn = minOf(cursorColumn, next - 1)
                    wrapPending = false
                }
                markerIndex += 1
            }
            lastScalarCursor = scalarCursor
            accept(codePoint)
            scalarCursor += charCount
            index += charCount
        }
        trimLines()
    }

    /** Usable observed width (20...400); anything else is an unknown span. */
    private fun usableColumns(value: Int?): Int? =
        value?.takeIf { it in MIN_TERMINAL_COLUMNS..MAX_TERMINAL_COLUMNS }

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
            0x0d -> {
                cursorColumn = 0
                wrapPending = false
            }
            0x08 -> backspace()
            0x09 -> {
                val boundedColumns = columns
                if (boundedColumns != null) {
                    // Move to the next tab stop clamped inside the width
                    // without materializing filler cells.
                    cursorColumn = minOf(
                        cursorColumn + TAB_WIDTH - cursorColumn % TAB_WIDTH,
                        boundedColumns - 1,
                    )
                } else {
                    repeat(TAB_WIDTH - cursorColumn % TAB_WIDTH) { write(0x20) }
                }
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
            'A' -> {
                if (columns != null) {
                    var remaining = columnCount(arguments)
                    while (remaining > 0 && activeLineIndex > 0 && activeLine().softWrapped) {
                        activeLineIndex -= 1
                        remaining -= 1
                    }
                    wrapPending = false
                }
            }
            'G' -> {
                cursorColumn = (columnCount(arguments) - 1).coerceAtMost(cursorRightLimit())
                wrapPending = false
            }
            'H', 'f' -> {
                cursorColumn = 0
                wrapPending = false
            }
            'C' -> {
                cursorColumn =
                    (cursorColumn + columnCount(arguments)).coerceAtMost(cursorRightLimit())
                wrapPending = false
            }
            'D' -> {
                cursorColumn = (cursorColumn - columnCount(arguments)).coerceAtLeast(0)
                wrapPending = false
            }
            'm' -> style = applyTerminalSgr(parseSgrParameters(arguments), style)
            // Unsupported cursor controls are intentionally presentation-only.
            else -> Unit
        }
    }

    /** CSI column argument; omitted means 1, and hostile magnitudes stay inside the line window. */
    private fun columnCount(arguments: String): Int =
        (arguments.toIntOrNull() ?: 1).coerceIn(1, lineCellLimit)

    private fun cursorRightLimit(): Int = columns?.let { it - 1 } ?: lineCellLimit

    private fun parseSgrParameters(arguments: String): List<Int> =
        if (arguments.isEmpty()) {
            listOf(0)
        } else {
            arguments.split(';').map { it.toIntOrNull() ?: 0 }
        }

    private fun write(codePoint: Int) {
        val text = String(Character.toChars(codePoint))
        val scalarWidth = TerminalUnicodeWidth.columns(codePoint)
        var width = if (scalarWidth == 0 && canJoinPrevious) 0 else maxOf(1, scalarWidth)
        val boundedColumns = columns
        if (boundedColumns != null && width > 0) {
            if (wrapPending) softWrap()
            width = minOf(width, boundedColumns)
            if (cursorColumn + width > boundedColumns) {
                val wrappedLine = activeLine()
                val missing = (boundedColumns - wrappedLine.cells.size).coerceAtLeast(0)
                if (missing > 0) {
                    reserveCells(missing)
                    while (wrappedLine.cells.size < boundedColumns) {
                        wrappedLine.add(Cell(" ", style))
                        renderedCells += 1
                    }
                } else {
                    eraseCell(wrappedLine, cursorColumn)
                }
                softWrap()
            }
        }
        val line = activeLine()
        if (width > 0) {
            if (cursorColumn + width - line.cells.size > MAX_RENDERED_CELLS) {
                cursorColumn = MAX_RENDERED_CELLS - width
            }
            reserveCells(maxOf(0, cursorColumn + width - line.cells.size))
        }
        val previousSize = line.cells.size
        if (width == 0) {
            val joiningColumn = cursorColumn + if (wrapPending) 1 else 0
            var previous = minOf(joiningColumn, line.cells.size) - 1
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
            if (boundedColumns == null) {
                cursorColumn += width
            } else {
                val end = cursorColumn + width
                if (end >= boundedColumns) {
                    cursorColumn = boundedColumns - 1
                    wrapPending = true
                } else {
                    cursorColumn = end
                    wrapPending = false
                }
            }
        }
        trimLine(line)
        renderedCells += line.cells.size - previousSize
    }

    private fun softWrap() {
        wrapPending = false
        if (advanceRow(softWrapped = true)) renderedCells += 1
        cursorColumn = 0
        trimLines()
    }

    private fun activeLine(): Line = lines[activeLineIndex]

    private fun advanceRow(softWrapped: Boolean): Boolean {
        if (activeLineIndex == lines.lastIndex) {
            lines += Line().apply { this.softWrapped = softWrapped }
            activeLineIndex = lines.lastIndex
            return true
        }
        activeLineIndex += 1
        lines[activeLineIndex].softWrapped = softWrapped
        return false
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
        if (advanceRow(softWrapped = false)) renderedCells += 1
        if (columns == null) cursorColumn = 0
        wrapPending = false
        trimLines()
    }

    private fun backspace() {
        if (cursorColumn <= 0) return
        cursorColumn -= 1
        wrapPending = false
    }

    private fun clearLine(mode: Int) {
        val line = activeLine()
        val previousSize = line.cells.size
        val eraseColumn = cursorColumn + if (wrapPending) 1 else 0
        when (mode) {
            1 -> repeat(minOf(eraseColumn + 1, line.cells.size)) { eraseCell(line, it) }
            2 -> line.trim(line.cells.size, fromStart = true)
            else -> if (eraseColumn < line.cells.size) {
                eraseCell(line, eraseColumn)
                line.trim(line.cells.size - eraseColumn, fromStart = false)
            }
        }
        trimLine(line)
        renderedCells += line.cells.size - previousSize
    }

    private fun clearScreen() {
        lines.clear()
        lines += Line()
        activeLineIndex = 0
        cursorColumn = 0
        wrapPending = false
        renderedCells = 0
    }

    private fun trimLines() {
        reserveCells(0)
    }

    private fun reserveCells(additional: Int) {
        while (lines.size > 1 &&
            (renderedCells + additional > MAX_RENDERED_CELLS || lines.size > maxLines)
        ) {
            // The active row must stay attached: evict the oldest non-active
            // row and keep activeLineIndex on the same Line.
            val evictIndex = if (activeLineIndex > 0) 0 else 1
            val evicted = lines.removeAt(evictIndex)
            renderedCells -= evicted.cells.size + 1
            if (evictIndex == 0) {
                activeLineIndex -= 1
            } else if (!evicted.softWrapped && lines.size > evictIndex) {
                // The removed row opened a hard line boundary; move it onto
                // the next surviving row so it cannot merge into the active
                // soft-wrap group.
                lines[evictIndex].softWrapped = false
            }
        }
        if (renderedCells + additional > MAX_RENDERED_CELLS) {
            val line = activeLine()
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
        wrapPending = false
        columns = null
        lastScalarCursor = -1L
        source = ""
    }

    private fun snapshot(): TerminalRenderedDocument {
        cachedTerminalDocument?.takeIf { it.revision == revision }?.let { return it }
        // Soft-wrapped rows join into one logical line; real line breaks —
        // including empty rows — start a new one, matching the iOS document.
        // Cells stream straight into the line text and the open style run so
        // a long wrapped line stays linear instead of re-concatenating runs.
        val texts = mutableListOf<String>()
        val styled = mutableListOf<List<TerminalStyledRun>>()
        val text = StringBuilder()
        val runs = mutableListOf<TerminalStyledRun>()
        val runText = StringBuilder()
        var runStyle: TerminalAnsiStyle? = null
        fun flushRun() {
            val style = runStyle ?: return
            runs += TerminalStyledRun(runText.toString(), style)
            runText.setLength(0)
            runStyle = null
        }
        fun flushLine() {
            flushRun()
            texts += text.toString()
            styled += runs.toList()
            text.setLength(0)
            runs.clear()
        }
        var started = false
        for (line in lines) {
            if (!line.softWrapped && started) flushLine()
            started = true
            for (cell in line.cells) {
                if (cell.text.isEmpty()) continue
                text.append(cell.text)
                if (cell.style != runStyle) {
                    flushRun()
                    runStyle = cell.style
                }
                runText.append(cell.text)
            }
        }
        flushLine()
        val document = TerminalRenderedDocument(texts, styled, revision)
        cachedTerminalDocument = document
        return document
    }

    private companion object {
        const val TAB_WIDTH = 8
        const val MAX_ESCAPE_LENGTH = 64
        const val MAX_RENDERED_CELLS = 2 * TerminalCursorReconciler.MAX_TRANSCRIPT_UTF16_UNITS
        const val MIN_TERMINAL_COLUMNS = 20
        const val MAX_TERMINAL_COLUMNS = 400
        val CONTROL_STRING_INTRODUCERS = setOf(']'.code, 'P'.code, 'X'.code, '^'.code, '_'.code)
    }
}
