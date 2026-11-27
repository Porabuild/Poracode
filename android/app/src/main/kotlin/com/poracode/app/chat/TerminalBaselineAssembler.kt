package com.poracode.app.chat

import com.poracode.remote.v3.generated.TerminalCursorColumnChange
import com.poracode.remote.v3.generated.TerminalCursorFrame
import com.poracode.remote.v3.generated.TerminalCursorFrameKind

import com.poracode.app.model.terminal.TerminalBaselineChunk
import com.poracode.app.model.terminal.TerminalDimensions
import com.poracode.app.model.terminal.TerminalProcessState

/**
 * Cursor-sync v2 baseline assembly (mirrors the shared
 * `TerminalWatchSessionV2.handleChunk` rules): strictly ordered contiguous
 * chunks for one watchId assemble into exactly one v1-shaped BASELINE frame,
 * so the reconciler contract is unchanged. Duplicate chunk indices are
 * ignored (and never re-acknowledged); gaps, overlaps, mid-stream generation
 * changes, resume-flag flips, and assembly overflow discard the assembly so
 * the caller resyncs with one fresh watch.
 *
 * Each accepted chunk may carry one observed width covering its whole
 * `[fromCursor, toCursor)` span; usable widths accumulate as bounded known
 * spans and the completed frame emits the canonical marker list (explicit
 * null gaps, coalesced contiguous widths, at most the wire cap).
 */
class TerminalBaselineAssembler(private val maxUnits: Int = MAX_ASSEMBLY_UTF16_UNITS) {
    private var assembly: Assembly? = null

    /** Clears any partial assembly (new attempt, watch change, or discard). */
    fun reset() {
        assembly = null
    }

    fun offer(chunk: TerminalBaselineChunk): Outcome {
        val current = assembly
        if (current == null) {
            assembly = Assembly(
                generation = chunk.generation,
                fromCursor = chunk.fromCursor,
                resumeServed = chunk.resumeServed,
                expectedIndex = 1,
                toCursor = chunk.toCursor,
                parts = if (chunk.data.isEmpty()) mutableListOf() else mutableListOf(chunk.data),
                units = chunk.data.length,
            )
        } else if (
            chunk.chunkIndex != current.expectedIndex ||
            chunk.generation != current.generation ||
            chunk.fromCursor != current.toCursor ||
            chunk.resumeServed != current.resumeServed
        ) {
            // Duplicate index ⇒ ignore an already-counted chunk (no re-ack);
            // any other discontinuity discards the assembly.
            if (chunk.chunkIndex <= current.expectedIndex - 1) return Outcome.Duplicate
            reset()
            return Outcome.Discard
        } else {
            current.expectedIndex += 1
            current.toCursor = chunk.toCursor
            if (chunk.data.isNotEmpty()) current.parts.add(chunk.data)
            current.units += chunk.data.length
        }
        recordWidth(chunk)

        if (chunk.chunkIndex < chunk.chunkCount - 1) {
            if ((assembly?.units ?: 0) > maxUnits) {
                reset()
                return Outcome.Discard
            }
            return Outcome.Acknowledge(chunk.toCursor)
        }
        val done = assembly ?: return Outcome.Discard
        reset()
        val changes = snapshotColumnChanges(done.columnSpans, done.fromCursor, done.toCursor)
        return Outcome.Complete(
            frame = TerminalCursorFrame(
                kind = TerminalCursorFrameKind.BASELINE,
                terminalId = chunk.terminalId,
                watchId = chunk.watchId,
                generation = done.generation,
                fromCursor = done.fromCursor,
                toCursor = done.toCursor,
                data = done.parts.joinToString(""),
                columnChanges = if (changes.any { it.columns != null }) changes else emptyList(),
            ),
            throughCursor = chunk.toCursor,
            processState = chunk.processState,
            dimensions = chunk.dimensions,
        )
    }

    /**
     * Fold one accepted chunk's homogeneous width into the assembly's known
     * spans. Empty chunks and unusable widths leave a natural unknown gap
     * instead of consuming the retained-span budget; duplicate and stale
     * chunks never reach this point.
     */
    private fun recordWidth(chunk: TerminalBaselineChunk) {
        val current = assembly ?: return
        if (chunk.data.isEmpty() || chunk.toCursor <= chunk.fromCursor) return
        val columns = usableColumns(chunk.terminalColumns) ?: return
        recordColumnSpan(current.columnSpans, chunk.fromCursor, chunk.toCursor, columns)
    }

    /** Usable observed width (20...400); anything else stays unknown. */
    private fun usableColumns(columns: Int?): Int? =
        columns?.takeIf { it in MIN_TERMINAL_COLUMNS..MAX_TERMINAL_COLUMNS }

    private fun recordColumnSpan(
        spans: MutableList<ColumnSpan>,
        from: Long,
        to: Long,
        columns: Int,
    ) {
        val last = spans.lastOrNull()
        if (last != null && last.toCursor == from && last.columns == columns) {
            last.toCursor = to
            return
        }
        spans.add(ColumnSpan(from, to, columns))
        if (spans.size > MAX_COLUMN_SPANS) spans.removeAt(0)
    }

    /**
     * Canonical marker list over `[fromCursor, toCursor)`: clips retained
     * spans, emits explicit null gaps, and coalesces contiguous equal widths.
     */
    private fun snapshotColumnChanges(
        spans: List<ColumnSpan>,
        fromCursor: Long,
        toCursor: Long,
    ): List<TerminalCursorColumnChange> {
        if (toCursor <= fromCursor) return emptyList()
        val changes = mutableListOf<TerminalCursorColumnChange>()
        var coveredThrough = fromCursor
        fun push(cursor: Long, columns: Int?) {
            if (changes.lastOrNull()?.columns != columns) {
                changes.add(TerminalCursorColumnChange(cursor, columns))
            }
        }
        for (span in spans) {
            if (span.toCursor <= fromCursor) continue
            if (span.fromCursor >= toCursor) break
            val start = maxOf(fromCursor, span.fromCursor)
            if (start > coveredThrough) push(coveredThrough, null)
            push(start, span.columns)
            coveredThrough = minOf(toCursor, span.toCursor)
        }
        if (coveredThrough < toCursor) push(coveredThrough, null)
        return changes
    }

    /** One known-width span in absolute UTF-16 cursor space. */
    private class ColumnSpan(
        val fromCursor: Long,
        var toCursor: Long,
        val columns: Int,
    )

    private class Assembly(
        val generation: String?,
        val fromCursor: Long,
        val resumeServed: Boolean,
        var expectedIndex: Int,
        var toCursor: Long,
        val parts: MutableList<String>,
        var units: Int,
        val columnSpans: MutableList<ColumnSpan> = mutableListOf(),
    )

    sealed interface Outcome {
        /** Chunk counted; acknowledge cumulative `throughCursor`. */
        data class Acknowledge(val throughCursor: Long) : Outcome

        /** Final chunk: assembled baseline plus the final acknowledgment. */
        data class Complete(
            val frame: TerminalCursorFrame,
            val throughCursor: Long,
            val processState: TerminalProcessState,
            val dimensions: TerminalDimensions?,
        ) : Outcome

        /** Already-counted chunk index — ignore, never re-acknowledge. */
        data object Duplicate : Outcome

        /** Discontinuity or overflow — drop the assembly and resync. */
        data object Discard : Outcome
    }

    companion object {
        const val MAX_ASSEMBLY_UTF16_UNITS: Int = 200_000
        private const val MIN_TERMINAL_COLUMNS: Int = 20
        private const val MAX_TERMINAL_COLUMNS: Int = 400
        private const val MAX_COLUMN_SPANS: Int = 1_024
    }
}
