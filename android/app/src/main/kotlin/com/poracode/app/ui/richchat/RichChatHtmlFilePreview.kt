package com.poracode.app.ui.richchat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.chat.RichChatFilePolicy
import com.poracode.app.chat.RichChatFileRef
import com.poracode.app.chat.RichHtmlVisualPresentation
import com.poracode.app.chat.RichInlineVisualParser
import com.poracode.app.session.richchat.RichChatOperationResult
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

internal fun isHtmlFileRef(ref: RichChatFileRef): Boolean {
    val ext = ref.fileName.substringAfterLast('.', "").lowercase()
    return ext == "html" || ext == "htm"
}

/**
 * Sandboxed inline preview for workspace `.html`/`.htm` file cards, mirroring PWA `HtmlVisualFile.tsx`.
 */
@Composable
internal fun RichChatHtmlFilePreviewCard(
    ref: RichChatFileRef,
    modifier: Modifier = Modifier,
) {
    val actions = LocalRichChatFileActions.current
    val scope = rememberCoroutineScope()
    val colors = PoracodeTheme.colors
    var loading by remember(ref.path) { mutableStateOf(false) }
    var expanded by remember(ref.path) { mutableStateOf(false) }
    var htmlContent by remember(ref.path) { mutableStateOf<String?>(null) }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(colors.surface)
            .padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(PoracodeIcons.Public, contentDescription = null, tint = colors.accent, modifier = Modifier.size(18.dp))
            Text(
                ref.fileName,
                style = PoracodeTextStyles.rowTitle,
                color = colors.foreground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            if (loading) {
                CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
            } else if (actions != null) {
                OutlinedButton(
                    onClick = {
                        if (expanded) {
                            expanded = false
                        } else if (htmlContent != null) {
                            expanded = true
                        } else {
                            val access = runCatching { RichChatFilePolicy.resolve(ref.path, actions.location) }.getOrNull()
                                ?: return@OutlinedButton
                            loading = true
                            scope.launch {
                                val result = actions.controller.downloadFile(
                                    request = access,
                                    projectLocation = actions.location,
                                    suggestedName = ref.fileName,
                                    destinationDirectory = actions.cacheDirectory,
                                )
                                if (result is RichChatOperationResult.Success) {
                                    val content = withContext(Dispatchers.IO) {
                                        runCatching { result.value.file.readText(Charsets.UTF_8) }.getOrNull().also {
                                            result.value.directory.deleteRecursively()
                                        }
                                    }
                                    if (content != null) {
                                        htmlContent = content
                                        expanded = true
                                    }
                                }
                                loading = false
                            }
                        }
                    },
                ) {
                    Text(if (expanded) "Hide" else "Preview")
                }
            }
        }
        val html = htmlContent
        if (expanded && html != null) {
            RichHtmlVisualView(
                RichHtmlVisualPresentation(
                    title = ref.fileName,
                    html = html,
                    version = RichInlineVisualParser.FORMAT_VERSION,
                    complete = true,
                    limited = false,
                ),
            )
        }
    }
}

internal object RichMathAndTaskHelper {
    private val replacements = listOf(
        "\\alpha" to "α", "\\beta" to "β", "\\gamma" to "γ", "\\delta" to "δ",
        "\\epsilon" to "ε", "\\theta" to "θ", "\\lambda" to "λ", "\\mu" to "μ",
        "\\pi" to "π", "\\sigma" to "σ", "\\omega" to "ω", "\\Delta" to "Δ",
        "\\Sigma" to "Σ", "\\Omega" to "Ω", "\\sum" to "∑", "\\prod" to "∏",
        "\\int" to "∫", "\\sqrt" to "√", "\\infty" to "∞", "\\pm" to "±",
        "\\times" to "×", "\\cdot" to "·", "\\div" to "÷", "\\leq" to "≤",
        "\\le" to "≤", "\\geq" to "≥", "\\ge" to "≥", "\\neq" to "≠",
        "\\ne" to "≠", "\\approx" to "≈", "\\to" to "→", "\\rightarrow" to "→",
        "\\leftarrow" to "←", "\\Rightarrow" to "⇒", "\\in" to "∈", "\\notin" to "∉",
        "^2" to "²", "^3" to "³", "^n" to "ⁿ",
    )

    data class ParsedListItem(val depth: Int, val taskChecked: Boolean?, val text: String)

    fun parseListItem(raw: String): ParsedListItem {
        val spaces = raw.takeWhile { it == ' ' }.length
        val depth = (spaces / 2).coerceIn(0, 4)
        val trimmed = raw.drop(spaces)
        return when {
            trimmed.startsWith("[x] ") || trimmed.startsWith("[X] ") -> ParsedListItem(depth, true, trimmed.drop(4))
            trimmed.startsWith("[ ] ") -> ParsedListItem(depth, false, trimmed.drop(4))
            else -> ParsedListItem(depth, null, trimmed)
        }
    }

    fun formatLatex(expr: String): String {
        var out = expr
        replacements.forEach { (k, v) -> out = out.replace(k, v) }
        return out
    }

    fun expandInlineMath(text: String): String {
        if (!text.contains('$')) return text
        val sb = StringBuilder(text.length)
        var i = 0
        while (i < text.length) {
            if (text[i] == '$') {
                val isBlock = i + 1 < text.length && text[i + 1] == '$'
                val delim = if (isBlock) "$$" else "$"
                val start = i + delim.length
                val end = text.indexOf(delim, start)
                if (end > start) {
                    sb.append(formatLatex(text.substring(start, end).trim()))
                    i = end + delim.length
                    continue
                }
            }
            sb.append(text[i])
            i += 1
        }
        return sb.toString()
    }
}
