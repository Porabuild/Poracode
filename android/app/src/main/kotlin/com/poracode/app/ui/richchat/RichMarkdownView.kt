package com.poracode.app.ui.richchat

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.poracode.app.ui.theme.LocalChatTextSizeSp

@Composable
internal fun RichMarkdownView(source: String, modifier: Modifier = Modifier) {
    val blocks = RichMarkdownParser.parse(source)
    SelectionContainer {
        Column(
            modifier = modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            blocks.forEach { block -> RichMarkdownBlockView(block) }
        }
    }
}

@Composable
private fun RichMarkdownBlockView(block: RichMarkdownBlock) {
    val size = LocalChatTextSizeSp.current
    when (block) {
        is RichMarkdownBlock.Heading -> Text(
            text = richInlineMarkdown(block.text),
            style = when (block.level) {
                1 -> MaterialTheme.typography.headlineSmall
                2 -> MaterialTheme.typography.titleLarge
                else -> MaterialTheme.typography.titleMedium
            },
            fontSize = when (block.level) {
                1 -> (size + 7).sp
                2 -> (size + 4).sp
                else -> (size + 2).sp
            },
            fontWeight = FontWeight.SemiBold,
        )
        is RichMarkdownBlock.Paragraph -> MarkdownBodyText(block.text)
        is RichMarkdownBlock.OrderedList -> MarkdownList(block.items, ordered = true)
        is RichMarkdownBlock.UnorderedList -> MarkdownList(block.items, ordered = false)
        is RichMarkdownBlock.Code -> MarkdownCodeBlock(block)
        is RichMarkdownBlock.Table -> MarkdownTable(block)
        is RichMarkdownBlock.Quote -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(
                Modifier
                    .widthIn(min = 3.dp, max = 3.dp)
                    .background(
                        MaterialTheme.colorScheme.outlineVariant,
                        RoundedCornerShape(2.dp),
                    )
                    .padding(vertical = 12.dp),
            )
            Text(
                text = richInlineMarkdown(block.text),
                style = MaterialTheme.typography.bodyMedium,
                fontSize = size.sp,
                lineHeight = (size + 6).sp,
                fontStyle = FontStyle.Italic,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun MarkdownBodyText(text: String) {
    val size = LocalChatTextSizeSp.current
    Text(
        text = richInlineMarkdown(text),
        style = MaterialTheme.typography.bodyMedium,
        fontSize = size.sp,
        lineHeight = (size + 6).sp,
    )
}

@Composable
private fun MarkdownList(items: List<String>, ordered: Boolean) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        items.forEachIndexed { index, item ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = if (ordered) "${index + 1}." else "•",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.widthIn(min = 20.dp),
                )
                MarkdownBodyText(item)
            }
        }
    }
}

@Composable
private fun MarkdownCodeBlock(block: RichMarkdownBlock.Code) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerHighest)
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        block.language?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(
            text = block.source,
            style = MaterialTheme.typography.bodySmall,
            fontFamily = FontFamily.Monospace,
            fontSize = 12.sp,
            lineHeight = 17.sp,
        )
    }
}

@Composable
private fun MarkdownTable(table: RichMarkdownBlock.Table) {
    val columns = maxOf(table.headers.size, table.rows.maxOfOrNull(List<String>::size) ?: 0)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .horizontalScroll(rememberScrollState()),
    ) {
        MarkdownTableRow(table.headers, columns, header = true)
        table.rows.forEach { row ->
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            MarkdownTableRow(row, columns, header = false)
        }
    }
}

@Composable
private fun MarkdownTableRow(cells: List<String>, columns: Int, header: Boolean) {
    Row(
        modifier = Modifier
            .background(
                if (header) MaterialTheme.colorScheme.surfaceContainerHigh else Color.Transparent,
            )
            .padding(horizontal = 4.dp),
    ) {
        repeat(columns) { index ->
            Text(
                text = richInlineMarkdown(cells.getOrElse(index) { "" }),
                style = MaterialTheme.typography.bodySmall,
                fontWeight = if (header) FontWeight.SemiBold else FontWeight.Normal,
                modifier = Modifier
                    .widthIn(min = 112.dp, max = 220.dp)
                    .padding(horizontal = 8.dp, vertical = 7.dp),
            )
        }
    }
}

internal fun richInlineMarkdown(source: String): AnnotatedString = buildAnnotatedString {
    var index = 0
    while (index < source.length) {
        val token = inlineToken(source, index)
        if (token == null) {
            append(source[index])
            index += 1
        } else {
            val start = length
            append(token.text)
            addStyle(token.style, start, length)
            token.url?.let { addStringAnnotation("URL", it, start, length) }
            index = token.endExclusive
        }
    }
}

private data class RichInlineToken(
    val text: String,
    val style: SpanStyle,
    val endExclusive: Int,
    val url: String? = null,
)

private fun inlineToken(source: String, index: Int): RichInlineToken? {
    fun delimited(marker: String, style: SpanStyle): RichInlineToken? {
        if (!source.startsWith(marker, index)) return null
        val underscore = marker[0] == '_'
        if (underscore && (
                source.getOrNull(index - 1)?.isMarkdownWordCharacter() == true ||
                    source.getOrNull(index + marker.length)?.let { it == '_' || it.isWhitespace() } == true
                )
        ) return null
        var end = source.indexOf(marker, index + marker.length)
        while (underscore && end >= 0 && (
                source.getOrNull(end - 1)?.let { it == '_' || it.isWhitespace() } == true ||
                    source.getOrNull(end + marker.length)?.isMarkdownWordCharacter() == true
                )
        ) {
            end = source.indexOf(marker, end + marker.length)
        }
        if (end <= index + marker.length) return null
        return RichInlineToken(
            source.substring(index + marker.length, end),
            style,
            end + marker.length,
        )
    }

    delimited("**", SpanStyle(fontWeight = FontWeight.Bold))?.let { return it }
    delimited("__", SpanStyle(fontWeight = FontWeight.Bold))?.let { return it }
    delimited("~~", SpanStyle(textDecoration = TextDecoration.LineThrough))?.let { return it }
    delimited("`", SpanStyle(fontFamily = FontFamily.Monospace))?.let { return it }

    if (source[index] == '[') {
        val labelEnd = source.indexOf("](", index + 1)
        val urlEnd = if (labelEnd >= 0) source.indexOf(')', labelEnd + 2) else -1
        if (labelEnd > index + 1 && urlEnd > labelEnd + 2) {
            return RichInlineToken(
                text = source.substring(index + 1, labelEnd),
                style = SpanStyle(textDecoration = TextDecoration.Underline),
                endExclusive = urlEnd + 1,
                url = source.substring(labelEnd + 2, urlEnd),
            )
        }
    }

    delimited("*", SpanStyle(fontStyle = FontStyle.Italic))?.let { return it }
    delimited("_", SpanStyle(fontStyle = FontStyle.Italic))?.let { return it }
    return null
}

/** Underscores inside identifiers are text, including Unicode combining marks. */
private fun Char.isMarkdownWordCharacter(): Boolean = isLetterOrDigit() || this == '_' ||
    when (category) {
        CharCategory.NON_SPACING_MARK,
        CharCategory.COMBINING_SPACING_MARK,
        CharCategory.ENCLOSING_MARK -> true
        else -> false
    }
