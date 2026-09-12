package com.poracode.app.ui.projects.workspace

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DiffSyntaxHighlighterTest {
    @Test
    fun resolvesLanguagesFromExtension() {
        assertEquals(DiffSyntaxLanguage.Kotlin, resolveDiffSyntaxLanguage("app/Foo.kt"))
        assertEquals(DiffSyntaxLanguage.Gradle, resolveDiffSyntaxLanguage("app/build.gradle.kts"))
        assertEquals(DiffSyntaxLanguage.Gradle, resolveDiffSyntaxLanguage("build.gradle"))
        assertEquals(DiffSyntaxLanguage.Swift, resolveDiffSyntaxLanguage("App/Foo.swift"))
        assertEquals(DiffSyntaxLanguage.TypeScript, resolveDiffSyntaxLanguage("src/foo.ts"))
        assertEquals(DiffSyntaxLanguage.TypeScript, resolveDiffSyntaxLanguage("src/Foo.tsx"))
        assertEquals(DiffSyntaxLanguage.TypeScript, resolveDiffSyntaxLanguage("src/foo.js"))
        assertEquals(DiffSyntaxLanguage.TypeScript, resolveDiffSyntaxLanguage("src/Foo.jsx"))
        assertEquals(DiffSyntaxLanguage.Json, resolveDiffSyntaxLanguage("package.json"))
        assertEquals(DiffSyntaxLanguage.Yaml, resolveDiffSyntaxLanguage(".github/workflows/ci.yml"))
        assertEquals(DiffSyntaxLanguage.Xml, resolveDiffSyntaxLanguage("res/values/strings.xml"))
        assertEquals(DiffSyntaxLanguage.Markdown, resolveDiffSyntaxLanguage("README.md"))
        assertEquals(DiffSyntaxLanguage.Shell, resolveDiffSyntaxLanguage("scripts/build.sh"))
        assertEquals(DiffSyntaxLanguage.Python, resolveDiffSyntaxLanguage("tools/gen.py"))
    }

    @Test
    fun fallsBackToNullForUnknownExtension() {
        assertNull(resolveDiffSyntaxLanguage("Dockerfile"))
        assertNull(resolveDiffSyntaxLanguage("notes.txt"))
        assertNull(resolveDiffSyntaxLanguage(null))
        assertNull(resolveDiffSyntaxLanguage(""))
    }

    @Test
    fun unknownLanguageProducesSinglePlainToken() {
        val tokens = tokenizeDiffLine("val x = 1", null)
        assertEquals(listOf(DiffToken("val x = 1", DiffTokenKind.Plain)), tokens)
    }

    @Test
    fun emptyTextProducesSinglePlainToken() {
        val tokens = tokenizeDiffLine("", DiffSyntaxLanguage.Kotlin)
        assertEquals(listOf(DiffToken("", DiffTokenKind.Plain)), tokens)
    }

    @Test
    fun classifiesKeywords() {
        val tokens = tokenizeDiffLine("val x = 1", DiffSyntaxLanguage.Kotlin)
        val keyword = tokens.first { it.text == "val" }
        assertEquals(DiffTokenKind.Keyword, keyword.kind)
        val identifier = tokens.first { it.text == "x" }
        assertEquals(DiffTokenKind.Plain, identifier.kind)
    }

    @Test
    fun classifiesStringLiteralsWithEscapes() {
        val tokens = tokenizeDiffLine("""val s = "a\"b" + c""", DiffSyntaxLanguage.Kotlin)
        val string = tokens.first { it.kind == DiffTokenKind.StringLiteral }
        assertEquals(""""a\"b"""", string.text)
    }

    @Test
    fun classifiesUnterminatedStringToEndOfLine() {
        val tokens = tokenizeDiffLine("""val s = "unterminated""", DiffSyntaxLanguage.Kotlin)
        val string = tokens.first { it.kind == DiffTokenKind.StringLiteral }
        assertEquals(""""unterminated""", string.text)
    }

    @Test
    fun classifiesLineComments() {
        val tokens = tokenizeDiffLine("val x = 1 // trailing comment", DiffSyntaxLanguage.Kotlin)
        val comment = tokens.first { it.kind == DiffTokenKind.Comment }
        assertEquals("// trailing comment", comment.text)
    }

    @Test
    fun classifiesBlockCommentsWithinALine() {
        val tokens = tokenizeDiffLine("val x = /* inline */ 1", DiffSyntaxLanguage.Kotlin)
        val comment = tokens.first { it.kind == DiffTokenKind.Comment }
        assertEquals("/* inline */", comment.text)
    }

    @Test
    fun unterminatedBlockCommentRunsToEndOfLine() {
        val tokens = tokenizeDiffLine("val x = /* unterminated", DiffSyntaxLanguage.Kotlin)
        val comment = tokens.first { it.kind == DiffTokenKind.Comment }
        assertEquals("/* unterminated", comment.text)
    }

    @Test
    fun classifiesNumbers() {
        val tokens = tokenizeDiffLine("val x = 42 + 3.14", DiffSyntaxLanguage.Kotlin)
        val numbers = tokens.filter { it.kind == DiffTokenKind.Number }.map { it.text }
        assertEquals(listOf("42", "3.14"), numbers)
    }

    @Test
    fun pythonHashCommentsAndKeywords() {
        val tokens = tokenizeDiffLine("def foo():  # comment", DiffSyntaxLanguage.Python)
        assertEquals(DiffTokenKind.Keyword, tokens.first { it.text == "def" }.kind)
        assertEquals(DiffTokenKind.Comment, tokens.first { it.kind == DiffTokenKind.Comment }.kind)
        assertTrue(tokens.first { it.kind == DiffTokenKind.Comment }.text.startsWith("#"))
    }

    @Test
    fun shellKeywordsAndComments() {
        val tokens = tokenizeDiffLine("if [ -f x ]; then # comment", DiffSyntaxLanguage.Shell)
        assertEquals(DiffTokenKind.Keyword, tokens.first { it.text == "if" }.kind)
        assertEquals(DiffTokenKind.Keyword, tokens.first { it.text == "then" }.kind)
    }

    @Test
    fun xmlHighlightsBlockCommentsAndAttributeStrings() {
        val tokens = tokenizeDiffLine("""<!-- note --><tag attr="value"/>""", DiffSyntaxLanguage.Xml)
        assertEquals(DiffTokenKind.Comment, tokens.first().kind)
        assertEquals("<!-- note -->", tokens.first().text)
        val string = tokens.first { it.kind == DiffTokenKind.StringLiteral }
        assertEquals(""""value"""", string.text)
    }

    @Test
    fun jsonHighlightsLiteralsAndStrings() {
        val tokens = tokenizeDiffLine(""""key": true, "n": 1""", DiffSyntaxLanguage.Json)
        assertEquals(DiffTokenKind.StringLiteral, tokens.first().kind)
        assertEquals(DiffTokenKind.Keyword, tokens.first { it.text == "true" }.kind)
        assertEquals(DiffTokenKind.Number, tokens.first { it.text == "1" }.kind)
    }

    @Test
    fun markdownTreatsBackticksAsInlineCodeStrings() {
        val tokens = tokenizeDiffLine("run `pnpm test` now", DiffSyntaxLanguage.Markdown)
        val string = tokens.first { it.kind == DiffTokenKind.StringLiteral }
        assertEquals("`pnpm test`", string.text)
    }

    @Test
    fun reassemblingTokensReproducesOriginalLine() {
        val samples = listOf(
            "val x = \"hi\" // comment" to DiffSyntaxLanguage.Kotlin,
            "def foo(a, b):  # note" to DiffSyntaxLanguage.Python,
            "<tag a=\"b\"><!-- c --></tag>" to DiffSyntaxLanguage.Xml,
            "" to DiffSyntaxLanguage.Json,
        )
        for ((text, language) in samples) {
            val tokens = tokenizeDiffLine(text, language)
            assertEquals(text, tokens.joinToString("") { it.text })
        }
    }
}
