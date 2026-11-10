package com.poracode.app.chat

import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/**
 * Mirrors `splitInlineVisuals` in `src/shared/inlineVisuals.ts`, pinned by
 * `protocol/remote/v3/fixtures/rich-inline-visuals.json`.
 */
sealed interface RichInlineVisualPart {
    data class Markdown(val text: String) : RichInlineVisualPart
    data class Visual(val version: Int, val title: String, val html: String, val complete: Boolean) : RichInlineVisualPart
    data class Native(val version: Int, val title: String, val source: String, val complete: Boolean) : RichInlineVisualPart
}

/**
 * One rendered unit of an assistant reply. Native visuals keep their fenced
 * source on mobile; authored HTML runs only in the sandboxed web view.
 */
sealed interface RichInlineVisualBlock {
    data class Markdown(val text: String) : RichInlineVisualBlock
    data class Html(val visual: RichHtmlVisualPresentation) : RichInlineVisualBlock
    data class Source(val language: String, val source: String) : RichInlineVisualBlock
}

data class RichHtmlVisualPresentation(
    val title: String,
    val html: String,
    val version: Int,
    val complete: Boolean,
    val limited: Boolean,
) {
    enum class SourceOnlyReason { INCOMPLETE, UNSUPPORTED, LIMITED, TOO_LARGE }

    val sourceOnlyReason: SourceOnlyReason?
        get() = when {
            !complete -> SourceOnlyReason.INCOMPLETE
            version != RichInlineVisualParser.FORMAT_VERSION -> SourceOnlyReason.UNSUPPORTED
            limited -> SourceOnlyReason.LIMITED
            html.toByteArray(Charsets.UTF_8).size > RichInlineVisualParser.MAX_SOURCE_BYTES -> SourceOnlyReason.TOO_LARGE
            else -> null
        }
}

object RichInlineVisualParser {
    const val FORMAT_VERSION = 1
    /** Each preview owns its own web view and sandboxed frames. */
    const val MAX_PREVIEWS_PER_MESSAGE = 4
    /** The sandbox proxy bounds the whole document, leaving room for the bootstrap. */
    const val MAX_SOURCE_BYTES = 256 * 1024 - 8 * 1024
    /** Reported page heights clamp to this CSS px range. */
    const val MIN_HEIGHT = 80.0
    const val MAX_HEIGHT = 2000.0
    const val ELISION_NOTICE_PREFIX = "[... poracode elided "
    const val ELISION_HEAD_UTF16_UNITS = 256_128

    /**
     * Blocks for a settled reply, or null when it holds no visual fence or when
     * retained history cannot prove that a fenced body is intact.
     */
    fun blocks(text: String, settled: Boolean): List<RichInlineVisualBlock>? {
        if (!settled || !(text.contains("poracode-html-v") || text.contains("poracode-visual-v")) || isElided(text)) {
            return null
        }
        val parts = split(text)
        if (parts.none { it !is RichInlineVisualPart.Markdown }) return null
        var previews = 0
        return parts.map { part ->
            when (part) {
                is RichInlineVisualPart.Markdown -> RichInlineVisualBlock.Markdown(part.text)
                is RichInlineVisualPart.Visual -> RichInlineVisualBlock.Html(
                    RichHtmlVisualPresentation(
                        title = part.title,
                        html = part.html,
                        version = part.version,
                        complete = part.complete,
                        limited = previews++ >= MAX_PREVIEWS_PER_MESSAGE,
                    ),
                )
                is RichInlineVisualPart.Native -> RichInlineVisualBlock.Source(
                    if (part.title.isEmpty()) "poracode-visual-v${part.version}" else "poracode-visual-v${part.version} ${part.title}",
                    part.source,
                )
            }
        }
    }

    /** Only absolute, credential-free web URLs leave the sandbox, after confirmation. */
    fun linkUrl(text: String?): String? {
        if (text == null || text.length > 2048) return null
        val url = text.toHttpUrlOrNull() ?: return null
        return text.takeIf { url.username.isEmpty() && url.password.isEmpty() }
    }

    fun isElided(text: String): Boolean = text.take(ELISION_HEAD_UTF16_UNITS).contains(ELISION_NOTICE_PREFIX)

    fun split(text: String): List<RichInlineVisualPart> {
        val parts = mutableListOf<RichInlineVisualPart>()
        val markdown = StringBuilder()
        var fence: Pair<Char, Int>? = null
        var pending: Pending? = null
        for (line in lines(text)) {
            val match = fenceMatch(withoutLineEnding(line))
            val open = fence
            if (open != null) {
                val closes = match != null && match.marker == open.first && match.length >= open.second &&
                    jsTrim(match.info).isEmpty()
                if (closes) {
                    val visual = pending
                    if (visual != null) {
                        parts += visual.part(complete = true)
                        pending = null
                    } else {
                        markdown.append(line)
                    }
                    fence = null
                } else if (pending != null) {
                    pending.body.append(line)
                } else {
                    markdown.append(line)
                }
                continue
            }
            if (match != null && !(match.marker == '`' && match.info.contains('`'))) {
                fence = match.marker to match.length
                val header = header(jsTrim(match.info))
                if (header != null) {
                    if (markdown.isNotEmpty()) parts += RichInlineVisualPart.Markdown(markdown.toString())
                    markdown.setLength(0)
                    pending = Pending(header.native, header.version, header.title)
                    continue
                }
            }
            markdown.append(line)
        }
        pending?.let { parts += it.part(complete = false) }
        if (markdown.isNotEmpty()) parts += RichInlineVisualPart.Markdown(markdown.toString())
        return parts
    }

    private class Pending(val native: Boolean, val version: Int, val title: String) {
        val body = StringBuilder()

        fun part(complete: Boolean): RichInlineVisualPart = if (native) {
            RichInlineVisualPart.Native(version, title, body.toString(), complete)
        } else {
            RichInlineVisualPart.Visual(version, title, body.toString(), complete)
        }
    }

    private data class FenceMatch(val marker: Char, val length: Int, val info: String)

    private data class Header(val native: Boolean, val version: Int, val title: String)

    /** Lines keep their `\n`, matching `/[^\n]*(?:\n|$)/g`. */
    private fun lines(text: String): List<String> {
        val lines = mutableListOf<String>()
        var start = 0
        while (start < text.length) {
            val end = text.indexOf('\n', start)
            if (end < 0) {
                lines += text.substring(start)
                break
            }
            lines += text.substring(start, end + 1)
            start = end + 1
        }
        return lines
    }

    private fun withoutLineEnding(line: String): String {
        if (!line.endsWith('\n')) return line
        val body = line.dropLast(1)
        return if (body.endsWith('\r')) body.dropLast(1) else body
    }

    /** `/^ {0,3}(`{3,}|~{3,})(.*)$/` without the JavaScript line terminators `.` refuses. */
    private fun fenceMatch(body: String): FenceMatch? {
        var index = 0
        while (index < body.length && index < 3 && body[index] == ' ') index++
        val marker = body.getOrNull(index)?.takeIf { it == '`' || it == '~' } ?: return null
        val start = index
        while (index < body.length && body[index] == marker) index++
        val info = body.substring(index)
        if (index - start < 3 || info.any { it == '\r' || it == '\u2028' || it == '\u2029' }) return null
        return FenceMatch(marker, index - start, info)
    }

    /** `/^poracode-(html|visual)-v(\d+)(?:[\t ]+(.*))?$/` on a trimmed info string. */
    private fun header(info: String): Header? {
        val native = when {
            info.startsWith("poracode-html-v") -> false
            info.startsWith("poracode-visual-v") -> true
            else -> return null
        }
        val rest = info.removePrefix(if (native) "poracode-visual-v" else "poracode-html-v")
        val digits = rest.takeWhile { it in '0'..'9' }
        val remainder = rest.drop(digits.length)
        if (digits.isEmpty() || (remainder.isNotEmpty() && remainder[0] != '\t' && remainder[0] != ' ')) return null
        val title = jsTrim(remainder.trimStart { it == '\t' || it == ' ' }).take(200)
        return Header(native, digits.toIntOrNull() ?: Int.MAX_VALUE, title)
    }

    /** ECMAScript `String.prototype.trim` whitespace and line terminators. */
    private fun jsTrim(text: String): String = text.trim { char ->
        char in '\u0009'..'\u000D' || char == ' ' || char == '\u00A0' || char == '\u1680' ||
            char in '\u2000'..'\u200A' || char == '\u2028' || char == '\u2029' || char == '\u202F' ||
            char == '\u205F' || char == '\u3000' || char == '\uFEFF'
    }
}
