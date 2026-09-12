package com.poracode.app.ui.projects.workspace

/**
 * Languages the lightweight diff syntax highlighter understands, keyed off file extension. This
 * intentionally covers only the languages this repo's diffs actually show; anything else falls
 * back to [resolveDiffSyntaxLanguage] returning null, which renders as plain (uncolored) text.
 */
internal enum class DiffSyntaxLanguage {
    Kotlin,
    Swift,
    TypeScript,
    Json,
    Yaml,
    Xml,
    Gradle,
    Markdown,
    Shell,
    Python,
}

/** Resolves a highlighting language from a file path's extension (and, for Gradle, its name). */
internal fun resolveDiffSyntaxLanguage(path: String?): DiffSyntaxLanguage? {
    if (path.isNullOrBlank()) return null
    val fileName = path.substringAfterLast('/').lowercase()
    val ext = fileName.substringAfterLast('.', "")
    return when {
        ext == "kts" -> DiffSyntaxLanguage.Gradle
        ext == "kt" -> DiffSyntaxLanguage.Kotlin
        ext == "swift" -> DiffSyntaxLanguage.Swift
        ext in TYPESCRIPT_EXTENSIONS -> DiffSyntaxLanguage.TypeScript
        ext == "json" || ext == "jsonc" -> DiffSyntaxLanguage.Json
        ext == "yml" || ext == "yaml" -> DiffSyntaxLanguage.Yaml
        ext == "xml" -> DiffSyntaxLanguage.Xml
        ext == "gradle" -> DiffSyntaxLanguage.Gradle
        ext == "md" || ext == "mdx" || ext == "markdown" -> DiffSyntaxLanguage.Markdown
        ext == "sh" || ext == "bash" || ext == "zsh" -> DiffSyntaxLanguage.Shell
        ext == "py" -> DiffSyntaxLanguage.Python
        else -> null
    }
}

private val TYPESCRIPT_EXTENSIONS =
    setOf("ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts")

/** A classified run of characters within a single diff line's text. */
internal enum class DiffTokenKind { Plain, Keyword, StringLiteral, Number, Comment }

internal data class DiffToken(val text: String, val kind: DiffTokenKind)

private data class LanguageSpec(
    val keywords: Set<String>,
    val lineComment: String? = null,
    val blockCommentStart: String? = null,
    val blockCommentEnd: String? = null,
    val stringQuotes: Set<Char> = emptySet(),
)

/**
 * Tokenizes a single diff line's visible text for syntax highlighting. This is a small,
 * dependency-free scanner — not a real parser — so block comments are only recognized within the
 * bounds of a single line (diff lines are already rendered independently, so cross-line comment
 * state is not tracked). Returns a single [DiffTokenKind.Plain] token for unknown languages or
 * empty text.
 */
internal fun tokenizeDiffLine(text: String, language: DiffSyntaxLanguage?): List<DiffToken> {
    if (language == null || text.isEmpty()) return listOf(DiffToken(text, DiffTokenKind.Plain))
    return tokenize(text, languageSpec(language))
}

private fun languageSpec(language: DiffSyntaxLanguage): LanguageSpec = when (language) {
    DiffSyntaxLanguage.Kotlin -> LanguageSpec(
        keywords = KOTLIN_KEYWORDS,
        lineComment = "//",
        blockCommentStart = "/*",
        blockCommentEnd = "*/",
        stringQuotes = setOf('"', '\''),
    )

    DiffSyntaxLanguage.Gradle -> LanguageSpec(
        keywords = GRADLE_KEYWORDS,
        lineComment = "//",
        blockCommentStart = "/*",
        blockCommentEnd = "*/",
        stringQuotes = setOf('"', '\''),
    )

    DiffSyntaxLanguage.Swift -> LanguageSpec(
        keywords = SWIFT_KEYWORDS,
        lineComment = "//",
        blockCommentStart = "/*",
        blockCommentEnd = "*/",
        stringQuotes = setOf('"'),
    )

    DiffSyntaxLanguage.TypeScript -> LanguageSpec(
        keywords = TYPESCRIPT_KEYWORDS,
        lineComment = "//",
        blockCommentStart = "/*",
        blockCommentEnd = "*/",
        stringQuotes = setOf('"', '\'', '`'),
    )

    DiffSyntaxLanguage.Json -> LanguageSpec(
        keywords = setOf("true", "false", "null"),
        stringQuotes = setOf('"'),
    )

    DiffSyntaxLanguage.Yaml -> LanguageSpec(
        keywords = setOf("true", "false", "null", "yes", "no"),
        lineComment = "#",
        stringQuotes = setOf('"', '\''),
    )

    DiffSyntaxLanguage.Xml -> LanguageSpec(
        keywords = emptySet(),
        blockCommentStart = "<!--",
        blockCommentEnd = "-->",
        stringQuotes = setOf('"', '\''),
    )

    DiffSyntaxLanguage.Markdown -> LanguageSpec(
        keywords = emptySet(),
        stringQuotes = setOf('`'),
    )

    DiffSyntaxLanguage.Shell -> LanguageSpec(
        keywords = SHELL_KEYWORDS,
        lineComment = "#",
        stringQuotes = setOf('"', '\''),
    )

    DiffSyntaxLanguage.Python -> LanguageSpec(
        keywords = PYTHON_KEYWORDS,
        lineComment = "#",
        stringQuotes = setOf('"', '\''),
    )
}

private fun tokenize(text: String, spec: LanguageSpec): List<DiffToken> {
    val tokens = mutableListOf<DiffToken>()
    val plain = StringBuilder()
    val length = text.length

    fun flushPlain() {
        if (plain.isNotEmpty()) {
            tokens.add(DiffToken(plain.toString(), DiffTokenKind.Plain))
            plain.clear()
        }
    }

    var i = 0
    while (i < length) {
        val c = text[i]

        val blockStart = spec.blockCommentStart
        if (blockStart != null && text.startsWith(blockStart, i)) {
            flushPlain()
            val endIndex = spec.blockCommentEnd?.let { end -> text.indexOf(end, i + blockStart.length) } ?: -1
            val stop = if (endIndex >= 0) endIndex + (spec.blockCommentEnd?.length ?: 0) else length
            tokens.add(DiffToken(text.substring(i, stop), DiffTokenKind.Comment))
            i = stop
            continue
        }

        val lineComment = spec.lineComment
        if (lineComment != null && text.startsWith(lineComment, i)) {
            flushPlain()
            tokens.add(DiffToken(text.substring(i), DiffTokenKind.Comment))
            i = length
            continue
        }

        if (c in spec.stringQuotes) {
            flushPlain()
            val start = i
            i++
            while (i < length) {
                if (text[i] == '\\' && i + 1 < length) {
                    i += 2
                    continue
                }
                if (text[i] == c) {
                    i++
                    break
                }
                i++
            }
            tokens.add(DiffToken(text.substring(start, i), DiffTokenKind.StringLiteral))
            continue
        }

        if (c.isDigit()) {
            flushPlain()
            val start = i
            while (i < length && (text[i].isLetterOrDigit() || text[i] == '.' || text[i] == '_')) i++
            tokens.add(DiffToken(text.substring(start, i), DiffTokenKind.Number))
            continue
        }

        if (c.isLetter() || c == '_') {
            flushPlain()
            val start = i
            while (i < length && (text[i].isLetterOrDigit() || text[i] == '_')) i++
            val word = text.substring(start, i)
            tokens.add(DiffToken(word, if (word in spec.keywords) DiffTokenKind.Keyword else DiffTokenKind.Plain))
            continue
        }

        plain.append(c)
        i++
    }
    flushPlain()
    return tokens
}

private val KOTLIN_KEYWORDS = setOf(
    "package", "import", "class", "object", "interface", "fun", "val", "var", "if", "else",
    "when", "for", "while", "do", "return", "break", "continue", "is", "as", "in", "out", "null",
    "true", "false", "this", "super", "override", "private", "protected", "public", "internal",
    "companion", "init", "constructor", "data", "sealed", "enum", "annotation", "inline",
    "noinline", "crossinline", "reified", "suspend", "operator", "infix", "tailrec", "vararg",
    "lateinit", "by", "get", "set", "typealias", "where", "try", "catch", "finally", "throw",
    "actual", "expect", "abstract", "open", "final", "const",
)

private val GRADLE_KEYWORDS = KOTLIN_KEYWORDS + setOf(
    "plugins", "dependencies", "implementation", "api", "testImplementation",
    "androidTestImplementation", "apply", "from", "version", "id", "repositories", "task",
    "def", "kapt", "ksp",
)

private val SWIFT_KEYWORDS = setOf(
    "import", "class", "struct", "enum", "protocol", "extension", "func", "var", "let", "if",
    "else", "guard", "switch", "case", "default", "for", "while", "repeat", "return", "break",
    "continue", "in", "is", "as", "nil", "true", "false", "self", "Self", "super", "private",
    "fileprivate", "internal", "public", "open", "static", "final", "override", "mutating",
    "nonmutating", "init", "deinit", "subscript", "typealias", "associatedtype", "where",
    "throws", "throw", "try", "catch", "defer", "lazy", "weak", "unowned", "inout", "some",
    "any", "async", "await", "actor", "do",
)

private val TYPESCRIPT_KEYWORDS = setOf(
    "import", "export", "from", "as", "default", "function", "const", "let", "var", "if",
    "else", "switch", "case", "break", "continue", "for", "while", "do", "return", "class",
    "extends", "implements", "interface", "type", "enum", "namespace", "public", "private",
    "protected", "static", "readonly", "abstract", "new", "this", "super", "null", "undefined",
    "true", "false", "typeof", "instanceof", "in", "of", "try", "catch", "finally", "throw",
    "async", "await", "yield", "void", "delete", "get", "set", "module", "declare", "is",
    "keyof", "infer", "satisfies",
)

private val SHELL_KEYWORDS = setOf(
    "if", "then", "else", "elif", "fi", "for", "while", "do", "done", "case", "esac",
    "function", "return", "exit", "export", "local", "readonly", "in", "until", "select",
    "time", "set", "unset", "shift", "trap",
)

private val PYTHON_KEYWORDS = setOf(
    "def", "class", "import", "from", "as", "if", "elif", "else", "for", "while", "try",
    "except", "finally", "raise", "return", "yield", "break", "continue", "pass", "lambda",
    "with", "global", "nonlocal", "del", "assert", "in", "is", "not", "and", "or", "True",
    "False", "None", "async", "await", "self",
)
