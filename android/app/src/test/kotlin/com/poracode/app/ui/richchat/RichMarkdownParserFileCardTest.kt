package com.poracode.app.ui.richchat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RichMarkdownParserFileCardTest {

    @Test
    fun standaloneArtifactLinkIsCard() {
        val blocks = RichMarkdownParser.parse("[release](out/release.zip)")
        assertEquals(1, blocks.size)
        val card = blocks.single() as RichMarkdownBlock.FileCard
        assertEquals("release.zip", card.ref.fileName)
    }

    @Test
    fun standalonePdfLinkIsCard() {
        val blocks = RichMarkdownParser.parse("[report](out/report.pdf)")
        assertTrue(blocks.single() is RichMarkdownBlock.FileCard)
    }

    @Test
    fun artifactOnlyUnorderedListIsCardList() {
        val blocks = RichMarkdownParser.parse(
            "- [zip](out/release.zip)\n- [pdf](out/report.pdf)",
        )
        val list = blocks.single() as RichMarkdownBlock.FileCardList
        assertEquals(2, list.refs.size)
    }

    @Test
    fun mixedListKeepsUnorderedBlock() {
        val blocks = RichMarkdownParser.parse(
            "- [zip](out/release.zip)\n- plain item\n- [pdf](out/report.pdf)",
        )
        assertTrue(blocks.single() is RichMarkdownBlock.UnorderedList)
    }

    @Test
    fun normalListIsUnchanged() {
        val blocks = RichMarkdownParser.parse("- one\n- two")
        assertTrue(blocks.single() is RichMarkdownBlock.UnorderedList)
    }

    @Test
    fun orderedListIsUnchanged() {
        val blocks = RichMarkdownParser.parse("1. [zip](out/release.zip)\n2. [pdf](out/report.pdf)")
        assertTrue(blocks.single() is RichMarkdownBlock.OrderedList)
    }

    @Test
    fun fencedCodeAndImagesAreNotCards() {
        val fenced = RichMarkdownParser.parse("```\n[zip](out/release.zip)\n```")
        assertTrue(fenced.single() is RichMarkdownBlock.Code)
        val image = RichMarkdownParser.parse("![img](out/a.png)")
        assertTrue(image.single() is RichMarkdownBlock.Paragraph)
    }

    @Test
    fun indentedListItemsRemainCodeNotCards() {
        // 4-space-indented list lines are code blocks, never promoted.
        val blocks = RichMarkdownParser.parse("    - [zip](out/a.zip)\n    - [pdf](docs/b.pdf)")
        assertTrue(blocks.all { it !is RichMarkdownBlock.FileCardList && it !is RichMarkdownBlock.FileCard })
        assertTrue(blocks.first() is RichMarkdownBlock.Code)
    }

    @Test
    fun indentedStandaloneLinkIsNotPromoted() {
        // 4-space indented text is code-like, never a card
        val blocks = RichMarkdownParser.parse("    [zip](out/release.zip)")
        assertTrue(blocks.none { it is RichMarkdownBlock.FileCard })
    }

    @Test
    fun nonArtifactLinkStaysProse() {
        val blocks = RichMarkdownParser.parse("[page](out/README.md)")
        assertTrue(blocks.single() is RichMarkdownBlock.Paragraph)
        val link = RichMarkdownParser.parse("[site](https://host/out.zip)")
        assertTrue(link.single() is RichMarkdownBlock.Paragraph)
    }

    @Test
    fun textAroundLinkStaysProse() {
        val blocks = RichMarkdownParser.parse("see [zip](out/release.zip) for details")
        assertTrue(blocks.single() is RichMarkdownBlock.Paragraph)
    }
}
