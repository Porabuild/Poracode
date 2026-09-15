package com.poracode.app.ui.projects.workspace

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.ui.components.EmptyStateView

private val GUTTER_COLUMN_WIDTH = 34.dp

/**
 * Shared monospaced unified-diff renderer used by the working-tree git pane and the pull-request
 * review pane so both surfaces stay visually identical. Renders a dual old/new line-number gutter
 * and lightweight, dependency-free syntax highlighting (subordinate to the add/delete/header diff
 * coloring) on top of the plain unified-diff text.
 */
@Composable
internal fun UnifiedDiffView(
    title: String,
    diff: String,
    emptyMessage: String,
    modifier: Modifier = Modifier,
    path: String? = title,
) {
    val document = remember(diff) { parseGitDiff(diff) }
    if (document.lines.all { it.text.isBlank() }) {
        EmptyStateView(title, emptyMessage, modifier)
        return
    }
    val lineNumbers = remember(document) { computeDiffLineNumbers(document.lines) }
    val language = remember(path) { resolveDiffSyntaxLanguage(path) }
    val horizontal = rememberScrollState()
    Column(modifier) {
        Text(
            title,
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            style = MaterialTheme.typography.titleSmall,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        HorizontalDivider()
        if (document.truncated) {
            Text(
                stringResource(R.string.workspace_diff_truncated),
                modifier = Modifier.padding(12.dp),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.tertiary,
            )
        }
        LazyColumn(Modifier.fillMaxSize()) {
            items(document.lines.size) { index ->
                val line = document.lines[index]
                val numbers = lineNumbers[index]
                Row(
                    modifier = Modifier.fillMaxWidth().horizontalScroll(horizontal),
                ) {
                    Text(
                        numbers.old?.toString().orEmpty(),
                        modifier = Modifier.width(GUTTER_COLUMN_WIDTH),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontFamily = FontFamily.Monospace,
                        textAlign = TextAlign.End,
                        softWrap = false,
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Text(
                        numbers.new?.toString().orEmpty(),
                        modifier = Modifier.width(GUTTER_COLUMN_WIDTH),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontFamily = FontFamily.Monospace,
                        textAlign = TextAlign.End,
                        softWrap = false,
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Spacer(Modifier.width(8.dp))
                    DiffLineText(line, language)
                }
            }
        }
    }
}

/**
 * Renders a single diff line's text. Syntax highlighting is only applied to context lines so the
 * add/delete/header diff coloring always stays the dominant, unmistakable signal; header and
 * changed lines render in their plain diff color with no token coloring layered on top.
 */
@Composable
private fun DiffLineText(line: GitDiffLine, language: DiffSyntaxLanguage?) {
    val displayText = line.text.ifEmpty { " " }
    val diffColor = diffLineColor(line.kind)
    if (line.kind == GitDiffLineKind.Context && language != null) {
        val tokens = remember(displayText, language) { tokenizeDiffLine(displayText, language) }
        val keywordColor = MaterialTheme.colorScheme.primary
        val stringColor = MaterialTheme.colorScheme.secondary
        val numberColor = MaterialTheme.colorScheme.secondary
        val commentColor = MaterialTheme.colorScheme.onSurfaceVariant
        val annotated = buildAnnotatedString {
            for (token in tokens) {
                val color = when (token.kind) {
                    DiffTokenKind.Keyword -> keywordColor
                    DiffTokenKind.StringLiteral -> stringColor
                    DiffTokenKind.Number -> numberColor
                    DiffTokenKind.Comment -> commentColor
                    DiffTokenKind.Plain -> diffColor
                }
                withStyle(SpanStyle(color = color)) {
                    append(token.text)
                }
            }
        }
        Text(
            annotated,
            fontFamily = FontFamily.Monospace,
            softWrap = false,
            style = MaterialTheme.typography.bodySmall,
        )
    } else {
        Text(
            displayText,
            color = diffColor,
            fontFamily = FontFamily.Monospace,
            softWrap = false,
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

@Composable
internal fun diffLineColor(kind: GitDiffLineKind): Color = when (kind) {
    GitDiffLineKind.Header -> MaterialTheme.colorScheme.primary
    GitDiffLineKind.Addition -> MaterialTheme.colorScheme.tertiary
    GitDiffLineKind.Deletion -> MaterialTheme.colorScheme.error
    GitDiffLineKind.Context -> MaterialTheme.colorScheme.onSurface
}
