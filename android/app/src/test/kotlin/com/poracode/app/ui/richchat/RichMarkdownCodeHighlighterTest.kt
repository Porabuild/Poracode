package com.poracode.app.ui.richchat

import com.poracode.app.ui.projects.workspace.DiffSyntaxLanguage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RichMarkdownCodeHighlighterTest {
    @Test
    fun resolvesCommonFenceLanguagesAndAppliesSpanStyles() {
        assertEquals(DiffSyntaxLanguage.Kotlin, RichMarkdownCodeHighlighter.resolveLanguage("kotlin"))
        assertEquals(DiffSyntaxLanguage.TypeScript, RichMarkdownCodeHighlighter.resolveLanguage("tsx"))
        assertEquals(DiffSyntaxLanguage.Python, RichMarkdownCodeHighlighter.resolveLanguage("py"))

        val highlighted = RichMarkdownCodeHighlighter.highlight(
            source = "val x = 42 // answer\nval s = \"hi\"",
            fenceLanguage = "kotlin",
            isDark = true,
        )
        assertEquals("val x = 42 // answer\nval s = \"hi\"", highlighted.text)
        assertTrue(highlighted.spanStyles.isNotEmpty())
    }

    @Test
    fun extractsAndStripsFileAndSnippetReferenceTags() {
        val text = "See <ref_file file=\"/repo/src/App.kt\" /> and <ref_snippet file=\"/repo/src/Main.kt\" lines=\"10-25\" />."
        val citations = RichSourceCitationParser.extract(text)
        assertEquals(2, citations.size)
        assertEquals("App.kt", citations[0].chipLabel)
        assertEquals("Main.kt:10-25", citations[1].chipLabel)
        assertEquals(10, citations[1].startLine)
        assertEquals(25, citations[1].endLine)
        assertEquals("See and .", RichSourceCitationParser.stripTags(text))
    }
}
