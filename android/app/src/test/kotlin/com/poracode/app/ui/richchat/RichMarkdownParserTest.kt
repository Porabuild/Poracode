package com.poracode.app.ui.richchat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RichMarkdownParserTest {
    @Test
    fun parsesHeadingsListsQuotesAndParagraphs() {
        val blocks = RichMarkdownParser.parse(
            """
            # Result

            Intro **text**.

            - Alpha
            - Beta

            1. First
            2. Second

            > Quoted
            > response
            """.trimIndent(),
        )

        assertEquals(RichMarkdownBlock.Heading(1, "Result"), blocks[0])
        assertEquals(RichMarkdownBlock.Paragraph("Intro **text**."), blocks[1])
        assertEquals(RichMarkdownBlock.UnorderedList(listOf("Alpha", "Beta")), blocks[2])
        assertEquals(RichMarkdownBlock.OrderedList(listOf("First", "Second")), blocks[3])
        assertEquals(RichMarkdownBlock.Quote("Quoted\nresponse"), blocks[4])
    }

    @Test
    fun parsesTablesAndFencedCode() {
        val blocks = RichMarkdownParser.parse(
            """
            | Name | State |
            | --- | :---: |
            | Android | Ready |

            ```kotlin
            val answer = 42
            ```
            """.trimIndent(),
        )

        assertEquals(
            RichMarkdownBlock.Table(
                headers = listOf("Name", "State"),
                rows = listOf(listOf("Android", "Ready")),
            ),
            blocks[0],
        )
        assertEquals(
            RichMarkdownBlock.Code("kotlin", "val answer = 42"),
            blocks[1],
        )
    }

    @Test
    fun incompleteStreamingFenceRemainsAVisibleCodeBlock() {
        val blocks = RichMarkdownParser.parse("```swift\nlet streaming = true")

        assertEquals(1, blocks.size)
        assertEquals(RichMarkdownBlock.Code("swift", "let streaming = true"), blocks.single())
    }

    @Test
    fun dividerWithoutAHeaderIsNotPromotedToTable() {
        val blocks = RichMarkdownParser.parse("---\nplain")

        assertTrue(blocks.single() is RichMarkdownBlock.Paragraph)
        assertEquals("---\nplain", (blocks.single() as RichMarkdownBlock.Paragraph).text)
    }

    @Test
    fun inlinePresentationRemovesMarkupAndRetainsLinkTarget() {
        val rendered = richInlineMarkdown(
            "Use **bold**, *italic*, `code`, ~~old~~, and [docs](https://example.test).",
        )

        assertEquals("Use bold, italic, code, old, and docs.", rendered.text)
        assertEquals(
            "https://example.test",
            rendered.getStringAnnotations("URL", 0, rendered.length).single().item,
        )
        assertEquals(5, rendered.spanStyles.size)
    }

    @Test
    fun underscoresInsideIdentifiersRemainLiteral() {
        for (source in listOf("GUI_RESUME_OK", "file__name__part", "日本_語_名", "a\u0301_b_c")) {
            val rendered = richInlineMarkdown(source)
            assertEquals(source, rendered.text)
            assertTrue(rendered.spanStyles.isEmpty())
        }
    }

    @Test
    fun underscoreEmphasisRequiresWordBoundariesAndKeepsInternalUnderscores() {
        val rendered = richInlineMarkdown("(_italic_) __bold__ _file_name_ and `GUI_RESUME_OK`")
        assertEquals("(italic) bold file_name and GUI_RESUME_OK", rendered.text)
        assertEquals(4, rendered.spanStyles.size)
        for (source in listOf("_ leading_", "_trailing _", "__word__suffix")) {
            assertEquals(source, richInlineMarkdown(source).text)
        }
    }
}
