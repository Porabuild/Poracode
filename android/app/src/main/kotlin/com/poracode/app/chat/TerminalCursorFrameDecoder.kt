package com.poracode.app.chat

import com.poracode.remote.v3.generated.TerminalCursorColumnChange
import com.poracode.remote.v3.generated.TerminalCursorFrame
import com.poracode.remote.v3.generated.TerminalCursorFrameKind
import com.poracode.remote.v3.generated.TerminalCursorReconciler
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull

/**
 * Hand-written coordinator: decodes a `terminal-output` cursor frame or a ready
 * `terminal-watch-result` baseline into the generated [TerminalCursorFrame].
 * The reconciliation decision itself is the generated terminal-cursor machine;
 * only this JSON plumbing stays app-owned (the TS reference is
 * `terminalCursorMachine.ts#decodeTerminalCursorFrameMessage`).
 */
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
                    // Width history only describes output units; an empty ready
                // result (up-to-date resume) discards the optional list.
                columnChanges = if (data.isNotEmpty()) {
                    decodeColumnChanges(result["columnChanges"])
                } else {
                    emptyList()
                },
                ).takeIf(TerminalCursorReconciler::isValid)
            }
            else -> null
        }
    }

    private fun decodeRange(
        kind: TerminalCursorFrameKind,
        terminalId: String,
        generation: String,
        data: String,
        sync: kotlinx.serialization.json.JsonObject,
    ): TerminalCursorFrame? {
        if (sync["version"]?.longOrStrictNull() != 1L) return null
        val watchId = sync.requiredString("watchId", allowEmpty = false) ?: return null
        val from = sync["fromCursor"]?.longOrStrictNull() ?: return null
        val to = sync["toCursor"]?.longOrStrictNull() ?: return null
        // A live output span is homogeneous: one usable width covers the whole
        // accepted range, marked at its start. Absent or unusable widths leave
        // the frame widthless.
        val columnChanges = if (data.isNotEmpty()) {
            sync["terminalColumns"].usableColumns()
                ?.let { listOf(TerminalCursorColumnChange(from, it)) }
                ?: emptyList()
        } else {
            emptyList()
        }
        return TerminalCursorFrame(kind, terminalId, watchId, generation, from, to, data, columnChanges)
            .takeIf(TerminalCursorReconciler::isValid)
    }

    /**
     * Optional ready-result width history. Chronology must be absolute,
     * non-decreasing, safe-integer cursors with usable columns or explicit
     * null; any malformed entry discards the whole optional list while the raw
     * frame stays intact (older hosts simply record no widths).
     */
    private fun decodeColumnChanges(value: JsonElement?): List<TerminalCursorColumnChange> {
        val entries = value?.arrayOrNull() ?: return emptyList()
        if (entries.size > MAX_COLUMN_CHANGES) return emptyList()
        val changes = mutableListOf<TerminalCursorColumnChange>()
        var previous = -1L
        for (entry in entries) {
            val objectValue = entry.objectOrNull() ?: return emptyList()
            if (!objectValue.containsKey("columns")) return emptyList()
            val from = objectValue["fromCursor"]?.longOrStrictNull() ?: return emptyList()
            if (from < 0L || from > MAX_CURSOR || from < previous) return emptyList()
            val columns = when (val raw = objectValue["columns"]) {
                JsonNull -> null
                else -> raw.usableColumns() ?: return emptyList()
            }
            previous = from
            changes.add(TerminalCursorColumnChange(from, columns))
        }
        return changes
    }

    /** Usable observed width (20...400); unusable scalars decode as absent. */
    private fun JsonElement?.usableColumns(): Int? =
        this?.longOrStrictNull()
            ?.takeIf { it in MIN_TERMINAL_COLUMNS..MAX_TERMINAL_COLUMNS }
            ?.toInt()

    private const val MIN_TERMINAL_COLUMNS = 20L
    private const val MAX_TERMINAL_COLUMNS = 400L
    private const val MAX_CURSOR = 9_007_199_254_740_991L
    private const val MAX_COLUMN_CHANGES = 2_049
}
