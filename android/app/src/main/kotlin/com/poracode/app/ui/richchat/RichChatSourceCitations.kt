package com.poracode.app.ui.richchat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.poracode.app.ui.components.PoracodeChip
import com.poracode.app.ui.theme.PoracodeIcons

internal data class RichSourceCitation(
    val path: String,
    val startLine: Int? = null,
    val endLine: Int? = null,
) {
    val fileName: String get() = path.substringAfterLast('/')
    val chipLabel: String
        get() = when {
            startLine != null && endLine != null && endLine != startLine -> "$fileName:$startLine-$endLine"
            startLine != null -> "$fileName:$startLine"
            else -> fileName
        }
}

/** Optional callback for opening a referenced project file at a 1-based line number. */
internal val LocalOpenProjectFileCitation =
    staticCompositionLocalOf<((path: String, line: Int?) -> Unit)?> { null }

internal object RichSourceCitationParser {
    private val REF_TAG = Regex("""<ref_(?:file|snippet)\s+([^>]*?)/?>""")
    private val ATTR_FILE = Regex("""file="([^"]+)"""")
    private val ATTR_LINES = Regex("""lines="(\d+)(?:-(\d+))?"""")

    fun extract(text: String): List<RichSourceCitation> {
        val seen = LinkedHashSet<RichSourceCitation>()
        REF_TAG.findAll(text).forEach { match ->
            val attrs = match.groupValues[1]
            val file = ATTR_FILE.find(attrs)?.groupValues?.get(1)?.trim()?.takeIf(String::isNotEmpty)
                ?: return@forEach
            val linesMatch = ATTR_LINES.find(attrs)
            val start = linesMatch?.groupValues?.get(1)?.toIntOrNull()
            val end = linesMatch?.groupValues?.get(2)?.toIntOrNull()
            seen.add(RichSourceCitation(path = file, startLine = start, endLine = end))
        }
        return seen.toList()
    }

    fun stripTags(text: String): String = REF_TAG.replace(text, "").replace(Regex(" {2,}"), " ").trim()
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun RichChatSourceCitationRow(
    citations: List<RichSourceCitation>,
    modifier: Modifier = Modifier,
) {
    if (citations.isEmpty()) return
    val openFile = LocalOpenProjectFileCitation.current
    FlowRow(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        citations.forEach { citation ->
            PoracodeChip(
                text = citation.chipLabel,
                icon = PoracodeIcons.Description,
                onClick = openFile?.let { open -> { open(citation.path, citation.startLine) } },
            )
        }
    }
}
