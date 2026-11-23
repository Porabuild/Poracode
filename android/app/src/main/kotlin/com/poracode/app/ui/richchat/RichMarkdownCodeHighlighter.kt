package com.poracode.app.ui.richchat

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import com.poracode.app.ui.projects.workspace.DiffSyntaxLanguage
import com.poracode.app.ui.projects.workspace.DiffTokenKind
import com.poracode.app.ui.projects.workspace.resolveDiffSyntaxLanguage
import com.poracode.app.ui.projects.workspace.tokenizeDiffLine

internal object RichMarkdownCodeHighlighter {
    fun resolveLanguage(fenceLanguage: String?): DiffSyntaxLanguage? {
        val raw = fenceLanguage?.trim()?.lowercase()?.takeIf(String::isNotEmpty) ?: return null
        return when (raw) {
            "kt", "kotlin" -> DiffSyntaxLanguage.Kotlin
            "swift" -> DiffSyntaxLanguage.Swift
            "ts", "tsx", "typescript", "js", "jsx", "javascript", "mjs", "cjs" -> DiffSyntaxLanguage.TypeScript
            "json", "jsonc" -> DiffSyntaxLanguage.Json
            "yml", "yaml" -> DiffSyntaxLanguage.Yaml
            "xml", "html", "svg" -> DiffSyntaxLanguage.Xml
            "gradle", "kts" -> DiffSyntaxLanguage.Gradle
            "md", "markdown", "mdx" -> DiffSyntaxLanguage.Markdown
            "sh", "bash", "zsh", "shell" -> DiffSyntaxLanguage.Shell
            "py", "python" -> DiffSyntaxLanguage.Python
            else -> resolveDiffSyntaxLanguage("file.$raw")
        }
    }

    fun highlight(source: String, fenceLanguage: String?, isDark: Boolean): AnnotatedString {
        val language = resolveLanguage(fenceLanguage) ?: return AnnotatedString(source)
        val keywordColor = if (isDark) Color(0xFFCF8EF4) else Color(0xFF7C3AED)
        val stringColor = if (isDark) Color(0xFF98C379) else Color(0xFF15803D)
        val numberColor = if (isDark) Color(0xFFD19A66) else Color(0xFFB45309)
        val commentColor = if (isDark) Color(0xFF7F848E) else Color(0xFF6B7280)

        return buildAnnotatedString {
            val lines = source.split('\n')
            lines.forEachIndexed { index, line ->
                if (index > 0) append('\n')
                tokenizeDiffLine(line, language).forEach { token ->
                    when (token.kind) {
                        DiffTokenKind.Plain -> append(token.text)
                        DiffTokenKind.Keyword -> withStyle(
                            SpanStyle(color = keywordColor, fontWeight = FontWeight.Medium),
                        ) { append(token.text) }
                        DiffTokenKind.StringLiteral -> withStyle(
                            SpanStyle(color = stringColor),
                        ) { append(token.text) }
                        DiffTokenKind.Number -> withStyle(
                            SpanStyle(color = numberColor),
                        ) { append(token.text) }
                        DiffTokenKind.Comment -> withStyle(
                            SpanStyle(color = commentColor, fontStyle = FontStyle.Italic),
                        ) { append(token.text) }
                    }
                }
            }
        }
    }
}
