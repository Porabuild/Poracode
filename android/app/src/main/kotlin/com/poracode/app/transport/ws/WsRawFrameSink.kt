package com.poracode.app.transport.ws

/** Generic receiver for raw WebSocket text frames that bypass the event cursor. */
fun interface WsRawFrameSink {
    /**
     * @param generation the [SocketGenerationGate.generation] the frame arrived on,
     * so consumers can reject frames from a torn-down socket without parsing them.
     */
    fun onFrame(generation: Int, text: String)
}

/**
 * Allocation-bounded, streaming top-level discriminator that identifies browser-mirror
 * server frames so they can be routed to a dedicated sink before the generic decoder or
 * the event cursor/transcript reducer ever sees them.
 *
 * JSON object key order is not part of the contract, so this does not assume `"type"`
 * is first. It scans the structure with a tiny state machine that tracks brace depth
 * and string/escape state, recognizes exactly the three browser-mirror `"type"` values
 * (`browser-state`, `browser-frame`, `browser-mirror-status`) when the `"type"` key is
 * at the top level, and rejects decoys that are nested or buried inside a string value.
 *
 * It never copies a large payload merely to classify it: only short strings (≤
 * [SHORT_STRING_LIMIT]) are materialized, and an escape anywhere in a candidate string
 * disqualifies it (the recognized literals contain none). A large base64 `"data"` value
 * is walked for its closing quote without allocation. The scan runs entirely before
 * [com.poracode.app.model.RemoteWebSocketServerMessage.decode]; a frame that peeks true
 * but is malformed is dropped by the ingress decode, never by the cursor.
 */
object BrowserFramePeek {
    private const val TYPE_KEY = "type"
    private val RECOGNIZED = setOf("browser-state", "browser-frame", "browser-mirror-status")
    private const val SHORT_STRING_LIMIT = 32

    fun isBrowserMirror(text: CharSequence): Boolean {
        val type = topLevelTypeValue(text) ?: return false
        return type in RECOGNIZED
    }

    private fun topLevelTypeValue(text: CharSequence): String? {
        val n = text.length
        var i = 0
        var depth = 0
        while (i < n) {
            val c = text[i]
            when {
                c == '"' -> {
                    val token = scanString(text, i)
                    if (token.endIndex <= i) return null
                    if (depth == 1 && token.literal == TYPE_KEY) {
                        return readStringValue(text, token.endIndex)
                    }
                    i = token.endIndex
                }
                c == '{' -> { depth++; i++ }
                c == '}' -> { if (depth > 0) depth--; i++ }
                else -> i++
            }
        }
        return null
    }

    private class ScannedString(val literal: String?, val endIndex: Int)

    /**
     * Walks a JSON string starting at the opening quote at [start]. Returns the materialized
     * [literal] only when the string is short and contains no escape sequence; otherwise
     * [literal] is null and only [endIndex] (one past the closing quote) is meaningful.
     */
    private fun scanString(text: CharSequence, start: Int): ScannedString {
        val n = text.length
        var i = start + 1
        val sb = StringBuilder()
        var short = true
        while (i < n) {
            val c = text[i]
            when {
                c == '\\' -> {
                    short = false
                    val next = i + 1
                    i = when {
                        next >= n -> next
                        text[next] == 'u' && next + 4 < n -> next + 5
                        else -> next + 1
                    }
                }
                c == '"' -> return ScannedString(if (short) sb.toString() else null, i + 1)
                else -> {
                    if (short) {
                        if (sb.length >= SHORT_STRING_LIMIT) short = false else sb.append(c)
                    }
                    i++
                }
            }
        }
        return ScannedString(null, i)
    }

    private fun readStringValue(text: CharSequence, start: Int): String? {
        val n = text.length
        var i = start
        while (i < n && text[i].isJsonWhitespace()) i++
        if (i >= n || text[i] != ':') return null
        i++
        while (i < n && text[i].isJsonWhitespace()) i++
        if (i >= n || text[i] != '"') return null
        return scanString(text, i).literal
    }

    private fun Char.isJsonWhitespace(): Boolean =
        this == ' ' || this == '\t' || this == '\n' || this == '\r'
}
