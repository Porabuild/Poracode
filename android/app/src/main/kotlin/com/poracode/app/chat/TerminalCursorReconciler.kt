package com.poracode.app.chat

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull

enum class TerminalCursorFrameKind {
    BASELINE,
    OUTPUT,
}

data class TerminalCursorFrame(
    val kind: TerminalCursorFrameKind,
    val terminalId: String,
    val watchId: String,
    val generation: String?,
    val fromCursor: Long,
    val toCursor: Long,
    val data: String,
)

data class TerminalCursorState(
    val watchId: String,
    val baselineReceived: Boolean = false,
    val generation: String? = null,
    val toCursor: Long = 0L,
    /** Bounded tail. Cursor coordinates remain absolute even after trimming. */
    val transcript: String = "",
    val bufferedOutput: List<TerminalCursorFrame> = emptyList(),
    val bufferedUtf16Units: Int = 0,
    val needsResync: Boolean = false,
) {
    init {
        require(watchId.isNotEmpty()) { "watchId must not be empty" }
        require(toCursor >= 0L) { "toCursor must not be negative" }
        require(transcript.length <= TerminalCursorReconciler.MAX_TRANSCRIPT_UTF16_UNITS)
    }

    companion object {
        fun watching(watchId: String): TerminalCursorState = TerminalCursorState(watchId)

        fun established(
            watchId: String,
            generation: String?,
            toCursor: Long,
            transcript: String = "",
        ): TerminalCursorState = TerminalCursorState(
            watchId = watchId,
            baselineReceived = true,
            generation = generation,
            toCursor = toCursor,
            transcript = transcript.takeLast(TerminalCursorReconciler.MAX_TRANSCRIPT_UTF16_UNITS),
        )
    }
}

enum class TerminalCursorAction {
    BUFFER,
    REPLACE,
    IGNORE,
    APPEND,
    APPEND_UNSEEN_SUFFIX,
    RESYNC,
}

data class TerminalCursorResult(
    val state: TerminalCursorState,
    val action: TerminalCursorAction,
    val appendedText: String = "",
)

object TerminalCursorFrameDecoder {
    fun decode(value: JsonElement): TerminalCursorFrame? {
        val objectValue = value.objectOrNull() ?: return null
        val terminalId = objectValue.requiredString("id", allowEmpty = false) ?: return null
        return when (objectValue.requiredString("type")) {
            "terminal-output" -> {
                val data = objectValue.requiredString("data") ?: return null
                val sync = objectValue["cursorSync"]?.objectOrNull() ?: return null
                val generation = sync.requiredString("generation", allowEmpty = false) ?: return null
                decodeRange(TerminalCursorFrameKind.OUTPUT, terminalId, generation, data, sync)
            }
            "terminal-watch-result" -> {
                val sync = objectValue["cursorSync"]?.objectOrNull() ?: return null
                if (sync["version"]?.longOrStrictNull() != 1L) return null
                val watchId = sync.requiredString("watchId", allowEmpty = false) ?: return null
                val result = sync["result"]?.objectOrNull() ?: return null
                if (result.requiredString("status") != "ready") return null
                val generation = when (val raw = result["generation"]) {
                    JsonNull -> null
                    else -> raw?.stringOrNull() ?: return null
                }
                val data = result.requiredString("data") ?: return null
                val from = result["fromCursor"]?.longOrStrictNull() ?: return null
                val to = result["toCursor"]?.longOrStrictNull() ?: return null
                TerminalCursorFrame(
                    TerminalCursorFrameKind.BASELINE,
                    terminalId,
                    watchId,
                    generation,
                    from,
                    to,
                    data,
                ).takeIf(::validRange)
            }
            else -> null
        }
    }

    private fun decodeRange(
        kind: TerminalCursorFrameKind,
        terminalId: String,
        generation: String?,
        data: String,
        sync: kotlinx.serialization.json.JsonObject,
    ): TerminalCursorFrame? {
        if (sync["version"]?.longOrStrictNull() != 1L) return null
        val watchId = sync.requiredString("watchId", allowEmpty = false) ?: return null
        val from = sync["fromCursor"]?.longOrStrictNull() ?: return null
        val to = sync["toCursor"]?.longOrStrictNull() ?: return null
        return TerminalCursorFrame(kind, terminalId, watchId, generation, from, to, data)
            .takeIf(::validRange)
    }

    private fun validRange(frame: TerminalCursorFrame): Boolean =
        frame.fromCursor >= 0L &&
            frame.toCursor >= frame.fromCursor &&
            frame.toCursor - frame.fromCursor == frame.data.length.toLong()
}

object TerminalCursorReconciler {
    const val MAX_TRANSCRIPT_UTF16_UNITS: Int = 200_000
    private const val MAX_BUFFERED_UTF16_UNITS: Int = 200_000
    private const val MAX_BUFFERED_FRAMES: Int = 1_024

    fun reconcile(
        state: TerminalCursorState,
        frame: TerminalCursorFrame,
    ): TerminalCursorResult {
        if (frame.watchId != state.watchId) {
            return TerminalCursorResult(state, TerminalCursorAction.IGNORE)
        }
        if (!validRange(frame)) return resync(state)
        if (frame.kind == TerminalCursorFrameKind.BASELINE) return replaceBaseline(state, frame)
        if (!state.baselineReceived) return bufferBeforeBaseline(state, frame)
        if (state.needsResync) return resync(state)
        return appendOutput(state, frame)
    }

    private fun replaceBaseline(
        state: TerminalCursorState,
        frame: TerminalCursorFrame,
    ): TerminalCursorResult {
        var next = state.copy(
            baselineReceived = true,
            generation = frame.generation,
            toCursor = frame.toCursor,
            transcript = boundedTail(frame.data),
            bufferedOutput = emptyList(),
            bufferedUtf16Units = 0,
            needsResync = false,
        )
        if (frame.generation != null) {
            for (buffered in state.bufferedOutput) {
                val result = appendOutput(next, buffered)
                next = result.state
                if (result.action == TerminalCursorAction.RESYNC) break
            }
        }
        return TerminalCursorResult(next, TerminalCursorAction.REPLACE)
    }

    private fun bufferBeforeBaseline(
        state: TerminalCursorState,
        frame: TerminalCursorFrame,
    ): TerminalCursorResult {
        if (frame.generation == null) return resync(state)
        val units = state.bufferedUtf16Units.toLong() + frame.data.length.toLong()
        if (units > MAX_BUFFERED_UTF16_UNITS ||
            state.bufferedOutput.size >= MAX_BUFFERED_FRAMES
        ) {
            return resync(
                state.copy(bufferedOutput = emptyList(), bufferedUtf16Units = 0),
            )
        }
        return TerminalCursorResult(
            state.copy(
                bufferedOutput = state.bufferedOutput + frame,
                bufferedUtf16Units = units.toInt(),
            ),
            TerminalCursorAction.BUFFER,
        )
    }

    private fun appendOutput(
        state: TerminalCursorState,
        frame: TerminalCursorFrame,
    ): TerminalCursorResult {
        if (state.generation == null || frame.generation == null) return resync(state)
        if (state.generation != frame.generation) return resync(state)
        if (frame.toCursor <= state.toCursor) {
            return TerminalCursorResult(state, TerminalCursorAction.IGNORE)
        }
        if (frame.fromCursor > state.toCursor) return resync(state)
        val overlap = (state.toCursor - frame.fromCursor).coerceAtLeast(0L)
        if (overlap > frame.data.length.toLong()) return resync(state)
        val suffix = frame.data.substring(overlap.toInt())
        val action = if (overlap == 0L) {
            TerminalCursorAction.APPEND
        } else {
            TerminalCursorAction.APPEND_UNSEEN_SUFFIX
        }
        val next = state.copy(
            toCursor = frame.toCursor,
            transcript = appendBounded(state.transcript, suffix),
        )
        return TerminalCursorResult(next, action, suffix)
    }

    private fun resync(state: TerminalCursorState): TerminalCursorResult =
        TerminalCursorResult(state.copy(needsResync = true), TerminalCursorAction.RESYNC)

    private fun validRange(frame: TerminalCursorFrame): Boolean =
        frame.fromCursor >= 0L &&
            frame.toCursor >= frame.fromCursor &&
            frame.toCursor - frame.fromCursor == frame.data.length.toLong()

    private fun boundedTail(value: String): String =
        if (value.length <= MAX_TRANSCRIPT_UTF16_UNITS) value
        else value.substring(value.length - MAX_TRANSCRIPT_UTF16_UNITS)

    private fun appendBounded(previous: String, suffix: String): String {
        if (suffix.length >= MAX_TRANSCRIPT_UTF16_UNITS) return boundedTail(suffix)
        val keepPrevious = MAX_TRANSCRIPT_UTF16_UNITS - suffix.length
        return boundedTail(previous).takeLast(keepPrevious) + suffix
    }
}
