package com.poracode.app.ui.projects.workspace

/**
 * Old/new line numbers for a single rendered diff line, mirroring the dual gutter shown by the
 * iOS `NativeUnifiedDiffView`. Both sides are null for diff metadata/header lines (including hunk
 * headers themselves); only one side is populated for pure additions/deletions; both sides are
 * populated for context lines.
 */
internal data class DiffLineNumber(
    val old: Int?,
    val new: Int?,
)

/** Parsed `@@ -old,count +new,count @@` hunk header starting line numbers. */
internal data class DiffHunkStart(
    val old: Int,
    val new: Int,
)

/** True when [text] looks like a unified-diff hunk header line (`@@ ... @@`). */
internal fun isDiffHunkHeader(text: String): Boolean = text.startsWith("@@")

/**
 * Parses a `@@ -a,b +c,d @@` hunk header into its old/new starting line numbers. Returns null for
 * malformed headers (missing fields, missing `-`/`+` prefixes, or a non-numeric start) so callers
 * can fall back to "unknown" line numbers rather than propagate a bad guess.
 */
internal fun parseDiffHunkHeader(text: String): DiffHunkStart? {
    val fields = text.split(' ').filter { it.isNotEmpty() }
    if (fields.size < 3) return null
    val old = parseHunkSide(fields.getOrNull(1), '-') ?: return null
    val new = parseHunkSide(fields.getOrNull(2), '+') ?: return null
    return DiffHunkStart(old, new)
}

private fun parseHunkSide(field: String?, prefix: Char): Int? {
    if (field == null || field.firstOrNull() != prefix) return null
    val body = field.drop(1).substringBefore(',')
    return body.toIntOrNull()
}

/**
 * Walks a parsed diff's lines in order, tracking the old/new line counters across `@@` hunk
 * headers, and returns the gutter numbers to display for each line. Counters reset to unknown
 * (null) at the start of the document and whenever a hunk header fails to parse, so a malformed
 * header never produces misleading numbers for the lines that follow it.
 */
internal fun computeDiffLineNumbers(lines: List<GitDiffLine>): List<DiffLineNumber> {
    var oldLine: Int? = null
    var newLine: Int? = null
    val result = ArrayList<DiffLineNumber>(lines.size)
    for (line in lines) {
        if (line.kind == GitDiffLineKind.Header && isDiffHunkHeader(line.text)) {
            val starts = parseDiffHunkHeader(line.text)
            oldLine = starts?.old
            newLine = starts?.new
            result.add(DiffLineNumber(null, null))
            continue
        }
        when (line.kind) {
            GitDiffLineKind.Header -> result.add(DiffLineNumber(null, null))

            GitDiffLineKind.Addition -> {
                result.add(DiffLineNumber(null, newLine))
                newLine = newLine?.plus(1)
            }

            GitDiffLineKind.Deletion -> {
                result.add(DiffLineNumber(oldLine, null))
                oldLine = oldLine?.plus(1)
            }

            GitDiffLineKind.Context -> {
                result.add(DiffLineNumber(oldLine, newLine))
                oldLine = oldLine?.plus(1)
                newLine = newLine?.plus(1)
            }
        }
    }
    return result
}
