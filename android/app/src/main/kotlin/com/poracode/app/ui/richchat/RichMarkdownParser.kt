package com.poracode.app.ui.richchat

internal sealed interface RichMarkdownBlock {
    data class Heading(val level: Int, val text: String) : RichMarkdownBlock
    data class Paragraph(val text: String) : RichMarkdownBlock
    data class OrderedList(val items: List<String>) : RichMarkdownBlock
    data class UnorderedList(val items: List<String>) : RichMarkdownBlock
    data class Code(val language: String?, val source: String) : RichMarkdownBlock
    data class Table(val headers: List<String>, val rows: List<List<String>>) : RichMarkdownBlock
    data class Quote(val text: String) : RichMarkdownBlock
}

internal object RichMarkdownParser {
    fun parse(source: String): List<RichMarkdownBlock> {
        val lines = source.lines()
        val blocks = mutableListOf<RichMarkdownBlock>()
        var index = 0
        while (index < lines.size) {
            val line = lines[index]
            if (line.isBlank()) {
                index += 1
                continue
            }

            if (line.startsWith("```")) {
                val language = line.drop(3).trim().ifEmpty { null }
                index += 1
                val code = mutableListOf<String>()
                while (index < lines.size && !lines[index].startsWith("```")) {
                    code += lines[index]
                    index += 1
                }
                if (index < lines.size) index += 1
                blocks += RichMarkdownBlock.Code(language, code.joinToString("\n"))
                continue
            }

            heading(line)?.let {
                blocks += it
                index += 1
                continue
            }

            if (index + 1 < lines.size && isTableRow(line) && isTableDivider(lines[index + 1])) {
                val headers = tableCells(line)
                index += 2
                val rows = mutableListOf<List<String>>()
                while (index < lines.size && isTableRow(lines[index])) {
                    rows += tableCells(lines[index])
                    index += 1
                }
                blocks += RichMarkdownBlock.Table(headers, rows)
                continue
            }

            if (line.trimStart().startsWith(">")) {
                val quote = mutableListOf<String>()
                while (index < lines.size && lines[index].trimStart().startsWith(">")) {
                    quote += lines[index].trimStart().drop(1).trimStart()
                    index += 1
                }
                blocks += RichMarkdownBlock.Quote(quote.joinToString("\n"))
                continue
            }

            orderedItem(line)?.let { first ->
                val items = mutableListOf(first)
                index += 1
                while (index < lines.size) {
                    val item = orderedItem(lines[index]) ?: break
                    items += item
                    index += 1
                }
                blocks += RichMarkdownBlock.OrderedList(items)
                continue
            }

            unorderedItem(line)?.let { first ->
                val items = mutableListOf(first)
                index += 1
                while (index < lines.size) {
                    val item = unorderedItem(lines[index]) ?: break
                    items += item
                    index += 1
                }
                blocks += RichMarkdownBlock.UnorderedList(items)
                continue
            }

            val paragraph = mutableListOf(line)
            index += 1
            while (index < lines.size && !startsBlock(lines[index], lines.getOrNull(index + 1))) {
                paragraph += lines[index]
                index += 1
            }
            blocks += RichMarkdownBlock.Paragraph(paragraph.joinToString("\n"))
        }
        return blocks
    }

    private fun heading(line: String): RichMarkdownBlock.Heading? {
        val count = line.takeWhile { it == '#' }.length
        if (count !in 1..6 || line.getOrNull(count) != ' ') return null
        return RichMarkdownBlock.Heading(count, line.drop(count + 1))
    }

    private fun orderedItem(line: String): String? {
        val trimmed = line.trimStart()
        val separator = trimmed.indexOf('.')
        if (separator <= 0 || trimmed.getOrNull(separator + 1) != ' ') return null
        if (!trimmed.take(separator).all(Char::isDigit)) return null
        return trimmed.drop(separator + 2)
    }

    private fun unorderedItem(line: String): String? {
        val trimmed = line.trimStart()
        return when {
            trimmed.startsWith("- ") || trimmed.startsWith("* ") -> trimmed.drop(2)
            else -> null
        }
    }

    private fun isTableRow(line: String): Boolean = line.contains('|') && tableCells(line).size > 1

    private fun isTableDivider(line: String): Boolean {
        val cells = tableCells(line)
        return cells.isNotEmpty() && cells.all { cell ->
            val divider = cell.replace(":", "").trim()
            divider.length >= 3 && divider.all { it == '-' }
        }
    }

    private fun tableCells(line: String): List<String> = line.trim()
        .removePrefix("|")
        .removeSuffix("|")
        .split('|')
        .map(String::trim)

    private fun startsBlock(line: String, next: String?): Boolean {
        val trimmed = line.trimStart()
        return line.isBlank() || line.startsWith("```") || heading(line) != null ||
            trimmed.startsWith(">") || orderedItem(line) != null || unorderedItem(line) != null ||
            (next != null && isTableRow(line) && isTableDivider(next))
    }
}
