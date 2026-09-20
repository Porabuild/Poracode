package com.poracode.app.chat

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

        if (chunk.chunkIndex < chunk.chunkCount - 1) {
            if ((assembly?.units ?: 0) > maxUnits) {
                reset()
                return Outcome.Discard
            }
            return Outcome.Acknowledge(chunk.toCursor)
        }
        val done = assembly ?: return Outcome.Discard
        reset()
        return Outcome.Complete(
            frame = TerminalCursorFrame(
                kind = TerminalCursorFrameKind.BASELINE,
                terminalId = chunk.terminalId,
                watchId = chunk.watchId,
                generation = done.generation,
                fromCursor = done.fromCursor,
                toCursor = done.toCursor,
                data = done.parts.joinToString(""),
            ),
            throughCursor = chunk.toCursor,
            processState = chunk.processState,
            dimensions = chunk.dimensions,
        )
    }

    private class Assembly(
        val generation: String?,
        val fromCursor: Long,
        val resumeServed: Boolean,
        var expectedIndex: Int,
        var toCursor: Long,
        val parts: MutableList<String>,
        var units: Int,
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
    }
}
