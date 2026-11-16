package com.poracode.app.session.richchat

private val ESC: Char = 0x1B.toChar()
private val BEL: Char = 0x07.toChar()

/**
 * Answers the terminal-identity queries an interactive shell emits on the PTY
 * byte stream (Primary/Secondary Device Attributes, Device Status Reports,
 * XTVERSION), mirroring what xterm does for the PWA so login shells such as
 * fish do not stall for their ~10 s query fallback.
 *
 * Live (`output`) frames are scanned for queries and answered; the assembled
 * `baseline` replay only advances the tracked cursor so cursor-position reports
 * stay accurate without emitting stale replies for historical queries — the
 * same reply-suppression rule `terminalQuerySuppression` applies to the PWA's
 * transcript replay.
 *
 * This is a bounded projection, not a full emulator: it tracks the cursor
 * row/column through the printable and cursor-movement subset the PTY stream
 * uses so `ESC[6n` reports a plausible position.
 */
class TerminalQueryResponder(private val onReply: (String) -> Unit) {
    private var pending = StringBuilder()
    private var row = 1
    private var column = 1
    private var inStringSequence = false
    private var stringEscape = false

    /** Historical replay: advance cursor position only, never answer queries. */
    fun offerBaseline(data: String) = scan(data, answerQueries = false)

    /** New PTY output: advance cursor position and answer queries. */
    fun offerLive(data: String) = scan(data, answerQueries = true)

    fun reset() {
        pending.setLength(0)
        row = 1
        column = 1
        inStringSequence = false
        stringEscape = false
    }

    private fun scan(chunk: String, answerQueries: Boolean) {
        val buffer = pending.toString() + chunk
        pending.setLength(0)
        var i = 0
        while (i < buffer.length) {
            val c = buffer[i]
            if (inStringSequence) {
                if (stringEscape) stringEscape = false
                else if (c == ESC) stringEscape = true
                else if (c == BEL) inStringSequence = false
                i++
                continue
            }
            if (c == ESC) {
                val end = escapeEnd(buffer, i)
                if (end < 0) {
                    pending.append(buffer, i, buffer.length)
                    return
                }
                handleEscape(buffer.substring(i, end), answerQueries)
                i = end
                continue
            }
            when (c) {
                '\n' -> { row++; column = 1 }
                '\r' -> column = 1
                '\b' -> column = maxOf(1, column - 1)
                '\t' -> column += 8 - ((column - 1) % 8)
                else -> if (c >= ' ') column += cellWidth(c)
            }
            i++
        }
    }

    /** Exclusive end index of the escape/string sequence at [start], or -1 if incomplete. */
    private fun escapeEnd(buffer: String, start: Int): Int {
        if (start + 1 >= buffer.length) return -1
        val kind = buffer[start + 1]
        if (kind == ']' || kind == 'P' || kind == 'X' || kind == '^' || kind == '_') {
            var sawEsc = false
            var i = start + 2
            while (i < buffer.length) {
                val c = buffer[i]
                if (sawEsc) {
                    if (c == '\\') return i + 1
                    sawEsc = false
                } else if (c == BEL) {
                    return i + 1
                } else if (c == ESC) {
                    sawEsc = true
                }
                i++
            }
            return -1
        }
        if (kind == '[') {
            var i = start + 2
            while (i < buffer.length) {
                if (buffer[i].code in 0x40..0x7E) return i + 1
                i++
            }
            return -1
        }
        if (buffer[start + 1].code in 0x30..0x7E) return start + 2
        return -1
    }

    private fun handleEscape(sequence: String, answerQueries: Boolean) {
        if (sequence.length < 3 || sequence[0] != ESC || sequence[1] != '[') return
        val final = sequence[sequence.length - 1]
        val body = sequence.substring(2, sequence.length - 1)
        when {
            final == 'c' -> if (answerQueries) reply(deviceAttributes(body))
            final == 'n' -> if (answerQueries) reply(statusReport(body))
            final == 'q' && body.startsWith(">") ->
                if (answerQueries) reply("${ESC}P>|poracode${ESC}\\")
            final == 'p' && body.contains("$") ->
                if (answerQueries) reply("${ESC}[0;0${'$'}y")
            else -> applyCursorMovement(body, final)
        }
    }

    private fun reply(text: String) { if (text.isNotEmpty()) onReply(text) }

    private fun deviceAttributes(body: String): String = when {
        body.startsWith(">") -> "${ESC}[>0;276;0c"
        body.startsWith("=") -> ""
        else -> "${ESC}[?1;2c"
    }

    private fun statusReport(body: String): String = when (body) {
        "5" -> "${ESC}[0n"
        "6" -> "${ESC}[$row;${column}R"
        "?6" -> "${ESC}[?$row;$column;1R"
        else -> ""
    }

    private fun applyCursorMovement(body: String, final: Char) {
        val params = body.split(';').map { it.toIntOrNull() ?: 0 }
        val first = params.firstOrNull() ?: 0
        val n = if (first == 0) 1 else first
        when (final) {
            'A' -> row = maxOf(1, row - n)
            'B' -> row += n
            'C' -> column += n
            'D' -> column = maxOf(1, column - n)
            'E' -> { row += n; column = 1 }
            'F' -> { row = maxOf(1, row - n); column = 1 }
            'G', '`' -> column = maxOf(1, if (first == 0) 1 else first)
            'd' -> row = maxOf(1, if (first == 0) 1 else first)
            'H', 'f' -> {
                row = maxOf(1, params.getOrNull(0)?.takeIf { it > 0 } ?: 1)
                column = maxOf(1, params.getOrNull(1)?.takeIf { it > 0 } ?: 1)
            }
            'J' -> if (first == 0 || first == 2 || first == 3) {
                if (first != 1) { row = 1; column = 1 }
            }
        }
    }

    private fun cellWidth(c: Char): Int {
        val v = c.code
        return if ((v in 0x1100..0x115F) || (v in 0x2E80..0xA4CF) ||
            (v in 0xAC00..0xD7A3) || (v in 0xF900..0xFAFF) ||
            (v in 0xFE30..0xFE6F) || (v in 0xFF00..0xFF60) ||
            (v in 0xFFE0..0xFFE6) || (v in 0x1F300..0x1FAFF) ||
            (v in 0x20000..0x3FFFD)
        ) 2 else 1
    }
}
