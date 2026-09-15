package com.poracode.app.model

enum class ProjectNameProblem {
    EMPTY,
    RESERVED,
    ILLEGAL_CHARACTER,
    TOO_LONG,
}

enum class CloneUrlProblem {
    EMPTY,
    LEADING_DASH,
    REMOTE_HELPER,
    DISALLOWED_SCHEME,
    INVALID_SYNTAX,
}

private val illegalProjectNameCharacters = Regex("[/\\\\:*?\"<>|]")
private val helperCloneUrl = Regex("^[a-z0-9+.-]*::", RegexOption.IGNORE_CASE)
private val schemeCloneUrl = Regex("^([a-z][a-z0-9+.-]*):\\/\\/", RegexOption.IGNORE_CASE)
private val bareSchemeCloneUrl = Regex("^([a-z][a-z0-9+.-]*):", RegexOption.IGNORE_CASE)
private val scpCloneUrl = Regex("^[^/\\\\:]+@[^/\\\\:]+:.+$")
private val safeCloneSchemes = setOf("https", "http", "ssh", "git", "ftp", "ftps")

/** ECMAScript String.trim whitespace, including BOM (U+FEFF). */
fun String.trimJsWhitespace(): String = trim { character ->
    character in '\u0009'..'\u000D' ||
        character == '\u0020' ||
        character == '\u00A0' ||
        character == '\u1680' ||
        character in '\u2000'..'\u200A' ||
        character == '\u2028' ||
        character == '\u2029' ||
        character == '\u202F' ||
        character == '\u205F' ||
        character == '\u3000' ||
        character == '\uFEFF'
}

/** Mirrors the authoritative cross-platform folder-name check. */
fun projectNameProblem(name: String): ProjectNameProblem? {
    val candidate = name.trimJsWhitespace()
    if (candidate.isEmpty()) return ProjectNameProblem.EMPTY
    if (candidate == "." || candidate == "..") return ProjectNameProblem.RESERVED
    if (illegalProjectNameCharacters.containsMatchIn(candidate)) {
        return ProjectNameProblem.ILLEGAL_CHARACTER
    }
    if (candidate.length > 255) return ProjectNameProblem.TOO_LONG
    return null
}

/**
 * Checks only transport safety. The caller retains the original opaque URL;
 * this function never rewrites it or any embedded path.
 */
fun cloneUrlProblem(rawUrl: String): CloneUrlProblem? {
    val url = rawUrl.trimJsWhitespace()
    if (url.isEmpty()) return CloneUrlProblem.EMPTY
    if (url.startsWith('-')) return CloneUrlProblem.LEADING_DASH
    if (helperCloneUrl.containsMatchIn(url)) return CloneUrlProblem.REMOTE_HELPER

    val scheme = schemeCloneUrl.find(url)?.groupValues?.get(1)?.lowercase()
    if (scheme != null) {
        return if (scheme in safeCloneSchemes) null else CloneUrlProblem.DISALLOWED_SCHEME
    }

    if (bareSchemeCloneUrl.containsMatchIn(url) && !scpCloneUrl.matches(url)) {
        return CloneUrlProblem.DISALLOWED_SCHEME
    }
    return if (scpCloneUrl.matches(url)) null else CloneUrlProblem.INVALID_SYNTAX
}

fun isValidProjectName(name: String): Boolean = projectNameProblem(name) == null

fun isSafeCloneUrl(url: String): Boolean = cloneUrlProblem(url) == null
