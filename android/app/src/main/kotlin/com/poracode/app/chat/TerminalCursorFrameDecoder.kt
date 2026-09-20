package com.poracode.app.chat

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
        return TerminalCursorFrame(kind, terminalId, watchId, generation, from, to, data)
            .takeIf(TerminalCursorReconciler::isValid)
    }
}
