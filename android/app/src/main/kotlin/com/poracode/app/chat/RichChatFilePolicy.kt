package com.poracode.app.chat

import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.ProjectLocationKind
import com.poracode.app.model.WslProjectLocation
import java.io.ByteArrayOutputStream
import java.nio.charset.CodingErrorAction

/** A file reference the chat can present as a downloadable card. */
data class RichChatFileRef(
    /** Decoded filesystem path for a safe local source (host-side file). */
    val path: String,
    /** Display basename, already decoded (never raw percent encoding). */
    val fileName: String,
    /** Typed `kind:"file"` payloads bypass the artifact-extension gate. */
    val isTypedFile: Boolean,
)

/** Parsed media-ticket access, mirroring the renderer's chatFileMediaRequest. */
sealed interface RichChatFileAccess {
    /** Path relative to (or inside) the project root — `access:"project"`. */
    data class Project(val relativePath: String) : RichChatFileAccess

    /** Absolute path outside the root — `access:"external"`. */
    data class External(val path: String) : RichChatFileAccess
}

class RichChatFilePolicyException(val reason: String) : Exception(reason)

object RichChatFilePolicy {
    val ARTIFACT_EXTENSIONS: Set<String> = setOf(
        "zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar",
        "pdf", "doc", "docx", "odt", "rtf", "ppt", "pptx", "odp",
        "xls", "xlsx", "ods", "csv", "tsv", "epub", "txt",
        "apk", "aab", "ipa", "dmg", "pkg", "exe", "msi", "deb", "rpm",
    )

    private val SCHEME = Regex("^[a-zA-Z][a-zA-Z0-9+.-]*:")
    private val DRIVE = Regex("^[a-zA-Z]:[\\\\/]")

    /** Bare filesystem paths, `file://` and canonical `poracode-local://local/` only. */
    fun isSafeFileSource(src: String): Boolean {
        if (src.isEmpty()) return false
        for (ch in src) if (ch.code < 0x20 || ch.code == 0x7F) return false
        if (SCHEME.containsMatchIn(src) && !DRIVE.containsMatchIn(src)) {
            val head = src.lowercase()
            if (head.startsWith("file://")) return true
            if (!head.startsWith("poracode-local://local")) return false
            return src.length == 22 || src[22] in "/?#"
        }
        return true
    }

    /**
     * Decoded local filesystem path for a safe file source, exactly once.
     * `file://` authority becomes the UNC host; canonical `poracode-local://`
     * strips the `local` authority. Bare paths keep literal `%`/`#`/`?`.
     */
    fun localPath(src: String): String? {
        if (!isSafeFileSource(src)) return null
        val lower = src.lowercase()
        when {
            lower.startsWith("poracode-local://local") -> {
                if (src.length == 22 || src[22] != '/') return null
                val rest = src.substring(22).substringBefore('#').substringBefore('?')
                if (rest.isEmpty()) return null
                val decoded = percentDecodeOnce(rest)?.takeIf(::isDecodedPath) ?: return null
                // Canonical /C:/x and /x both strip to filesystem roots.
                if (decoded.startsWith("/")) {
                    val tail = decoded.substring(1)
                    if (tail.length > 2 && tail[1] == ':') return tail
                }
                return decoded
            }
            lower.startsWith("file://") -> {
                val rest = src.substring(7).substringBefore('#').substringBefore('?')
                val decoded = percentDecodeOnce(rest)?.takeIf(::isDecodedPath) ?: return null
                // `file://host/share` -> UNC `//host/share`; `file:///C:/x`
                // -> `C:/x`; `file://localhost` is the local root like the
                // shared chatVideoFilePath behavior, not a UNC host.
                if (decoded.startsWith("//")) return decoded
                if (!decoded.startsWith("/")) {
                    if (decoded.lowercase().startsWith("localhost/")) {
                        // Local root: keep the leading-slash suffix after the
                        // authority (no extra slash), with the same drive
                        // stripping as `file:///C:`.
                        val suffix = decoded.substring("localhost".length)
                        if (suffix.length > 3 && suffix[2] == ':') return suffix.substring(1)
                        return suffix
                    }
                    return "//$decoded"
                }
                val tail = decoded.substring(1)
                if (tail.length > 2 && tail[1] == ':') return tail
                return decoded
            }
            else -> return src
        }
    }

    /**
     * Strict UTF-8 percent decoding — literal Unicode spans are UTF-8 encoded
     * alongside percent triplets; malformed escapes or UTF-8 reject the whole
     * destination (REPORT mode, never replacement chars).
     */
    fun percentDecodeOnce(value: String): String? {
        if ('%' !in value) return value
        val bytes = ByteArrayOutputStream(value.length)
        var i = 0
        while (i < value.length) {
            val ch = value[i]
            if (ch == '%') {
                if (i + 2 >= value.length) return null
                val hi = Character.digit(value[i + 1], 16)
                val lo = Character.digit(value[i + 2], 16)
                if (hi < 0 || lo < 0) return null
                bytes.write((hi shl 4) or lo)
                i += 3
            } else {
                // Encode the whole literal span at once so surrogate pairs
                // (e.g. emoji mixed with percent escapes) stay valid UTF-8.
                var end = i + 1
                while (end < value.length && value[end] != '%') end++
                bytes.write(value.substring(i, end).toByteArray(Charsets.UTF_8))
                i = end
            }
        }
        val decoder = Charsets.UTF_8.newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT)
        return try {
            decoder.decode(java.nio.ByteBuffer.wrap(bytes.toByteArray())).toString()
        } catch (_: Exception) {
            null
        }
    }

    /** Reject control characters, empty results and traversal after decoding. */
    private fun isDecodedPath(path: String): Boolean =
        path.isNotEmpty() && path.none { it.code < 0x20 || it.code == 0x7F } && !hasTraversal(path)

    fun basename(path: String): String {
        val trimmed = path.trimEnd('/', '\\')
        return trimmed.substringAfterLast('/').substringAfterLast('\\').ifEmpty { path }
    }

    /** Artifact classification for a plain-markdown path; dotfile `.zip` is inert. */
    fun isArtifactPath(path: String, mimeType: String? = null): Boolean {
        if (mimeType == "application/octet-stream" || mimeType == "application/pdf") return true
        val name = basename(path)
        val dot = name.lastIndexOf('.')
        if (dot <= 0) return false
        return name.substring(dot + 1).lowercase() in ARTIFACT_EXTENSIONS
    }

    fun isDownloadSource(src: String, mimeType: String? = null): Boolean {
        val path = localPath(src) ?: return false
        return isArtifactPath(path, mimeType)
    }

    /** Typed `kind:"file"` blocks: any safe, traversal-free local path. */
    fun typedFileRef(path: String, name: String?): RichChatFileRef? {
        val local = localPath(path)?.takeIf { !hasTraversal(it) } ?: return null
        val explicit = name?.trim().orEmpty()
        return RichChatFileRef(local, explicit.ifEmpty { basename(local) }, true)
    }

    /**
     * Single-decoding markdown destination: URL sources decode through
     * `localPath`; bare destinations decode once here — literal `%` in a typed
     * raw path is preserved because `localPath` returns bare paths untouched.
     */
    fun decodedMarkdownDestination(src: String): String? {
        if (SCHEME.containsMatchIn(src) && !DRIVE.containsMatchIn(src)) {
            return localPath(src)
        }
        val decoded = percentDecodeOnce(src)?.takeIf(::isDecodedPath) ?: return null
        return if (isSafeFileSource(decoded)) decoded else null
    }

    /** Markdown-link card ref (artifact-gated, traversal-free). */
    fun markdownFileRef(src: String, name: String? = null): RichChatFileRef? {
        val destination = decodedMarkdownDestination(src) ?: return null
        if (!isArtifactPath(destination) || hasTraversal(destination)) return null
        val explicit = name?.trim().orEmpty()
        return RichChatFileRef(destination, explicit.ifEmpty { basename(destination) }, false)
    }

    /**
     * Parses text that is entirely one `[label](dest)` or `[label](<dest>)`.
     * Returns label + RAW (still-escaped) destination; decoding happens once
     * in `markdownFileRef`/`decodedMarkdownDestination`.
     */
    fun markdownLink(text: String): Pair<String, String>? {
        val trimmed = text.trim()
        if (!trimmed.startsWith("[")) return null
        val close = trimmed.indexOf(']')
        if (close <= 1 || trimmed.getOrNull(close + 1) != '(') return null
        val label = trimmed.substring(1, close)
        var rest = trimmed.substring(close + 2)
        val destination: String
        if (rest.startsWith("<")) {
            val end = rest.indexOf('>')
            if (end < 0) return null
            destination = rest.substring(1, end)
            rest = rest.substring(end + 1)
            // The closing paren of `(<dest>)` must be consumed exactly.
            if (!rest.startsWith(")")) return null
            rest = rest.substring(1)
        } else {
            val collected = StringBuilder()
            var i = 0
            var closed = false
            var depth = 0
            while (i < rest.length) {
                val ch = rest[i]
                if (ch == '\\' && i + 1 < rest.length && rest[i + 1] in "()\\") {
                    // Markdown escapes collapse once at parse; backslashes
                    // before other characters (Windows separators) survive.
                    collected.append(rest[i + 1])
                    i += 2
                    continue
                }
                if (ch == '(') depth++
                if (ch == ')') {
                    if (depth == 0) {
                        closed = true
                        i += 1
                        break
                    }
                    depth--
                }
                collected.append(ch)
                i += 1
            }
            if (!closed) return null
            destination = collected.toString()
            rest = rest.substring(i)
        }
        if (rest.isNotBlank() || destination.isEmpty()) return null
        return label to destination
    }

    private fun isAbsoluteFsPath(path: String): Boolean =
        path.startsWith("/") || path.startsWith("\\") || DRIVE.containsMatchIn(path)

    /** Records a leading `/` or `//` prefix before stripping empty/`.` segments; `..` never collapses. */
    private fun normalizeSeparators(path: String): String {
        var prefix = ""
        var rest = path
        if (rest.startsWith("\\\\") || rest.startsWith("//")) {
            prefix = "//"
            rest = rest.substring(2)
        } else if (rest.startsWith("/") || rest.startsWith("\\")) {
            prefix = "/"
            rest = rest.substring(1)
        }
        val parts = rest.split('/', '\\').filter { it.isNotEmpty() && it != "." }
        return prefix + parts.joinToString("/")
    }

    private fun hasTraversal(path: String): Boolean =
        path.split('/', '\\').any { it == ".." }

    /**
     * Mirror of the renderer's `chatFileMediaRequest`: contained absolutes →
     * project-relative, outside absolutes → explicit external, relatives →
     * project. `..` throws in every form; `remoteServerId` rejects.
     */
    fun resolve(path: String, location: ProjectLocation): RichChatFileAccess {
        if (location.remoteServerId != null) {
            throw RichChatFilePolicyException("unsupported_location")
        }
        if (path.isEmpty()) throw RichChatFilePolicyException("empty_path")
        if (hasTraversal(path)) throw RichChatFilePolicyException("traversal")
        val normalized = normalizeSeparators(path)
        if (hasTraversal(normalized)) throw RichChatFilePolicyException("traversal")
        if (normalized.isEmpty() || normalized == "/" || normalized == "//") {
            throw RichChatFilePolicyException("root_is_not_file")
        }
        if (!isAbsoluteFsPath(normalized)) {
            return RichChatFileAccess.Project(normalized)
        }
        val roots = when (location.kind) {
            ProjectLocationKind.POSIX -> listOf(normalizeSeparators(location.path))
            ProjectLocationKind.WINDOWS -> listOf(normalizeSeparators(location.path))
            ProjectLocationKind.WSL -> (location as WslProjectLocation).let { wslLocation ->
                listOf(
                    normalizeSeparators(wslLocation.linuxPath),
                    normalizeSeparators(wslLocation.uncPath),
                )
            }
        }
        val insensitive = location.kind == ProjectLocationKind.WINDOWS
        val haystack = if (insensitive) normalized.lowercase() else normalized
        for (rawRoot in roots) {
            // A "/" root is kept — it contains every POSIX descendant.
            val root = if (rawRoot == "/") "/" else rawRoot.trimEnd('/')
            if (root.isEmpty()) continue
            val needle = if (insensitive) root.lowercase() else root
            if (normalized.startsWith("//") && !needle.startsWith("//")) continue
            if (needle == "/") {
                // A "/" root contains POSIX descendants but never UNC shares.
                if (haystack.startsWith("/") && !haystack.startsWith("//")) {
                    return RichChatFileAccess.Project(normalized.trimStart('/'))
                }
                continue
            }
            if (haystack == needle) throw RichChatFilePolicyException("root_is_not_file")
            if (haystack.startsWith("$needle/")) {
                return RichChatFileAccess.Project(normalized.substring(needle.length + 1))
            }
        }
        return RichChatFileAccess.External(normalized)
    }

    /** Safe download filename: basename only; separators, controls, `.`/`..`/empty rejected. */
    fun sanitizedFileName(name: String): String {
        val cleaned = basename(name).filter {
            it.code >= 0x20 && it.code != 0x7F && it != '/' && it != '\\' && it != ':'
        }.trim()
        return if (cleaned.isEmpty() || cleaned == "." || cleaned == "..") "download" else cleaned
    }

    /** `attachment` disposition + `application/octet-stream` semantics. */
    fun isAttachmentResponse(contentDisposition: String?, contentType: String?): Boolean {
        val disposition = contentDisposition?.lowercase() ?: return false
        if (!(disposition == "attachment" || disposition.startsWith("attachment;"))) return false
        val type = contentType?.substringBefore(';')?.trim()?.lowercase()
        return type == "application/octet-stream"
    }
}
