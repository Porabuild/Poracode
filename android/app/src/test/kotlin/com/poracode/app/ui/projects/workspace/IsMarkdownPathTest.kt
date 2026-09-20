package com.poracode.app.ui.projects.workspace

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Kept in its own file rather than appended to ProjectWorkspaceUiLogicTest.kt, which is under
 * concurrent edit by another pass on this branch.
 */
class IsMarkdownPathTest {
    @Test
    fun `recognizes markdown extensions case-insensitively`() {
        assertTrue(isMarkdownPath("README.md"))
        assertTrue(isMarkdownPath("notes.MDX"))
        assertTrue(isMarkdownPath("docs/guide.markdown"))
        assertTrue(isMarkdownPath("docs/guide.MDown"))
    }

    @Test
    fun `rejects non-markdown extensions and edge cases`() {
        assertFalse(isMarkdownPath("README.txt"))
        assertFalse(isMarkdownPath("Makefile"))
        assertFalse(isMarkdownPath("archive.tar.gz"))
        assertFalse(isMarkdownPath("trailing."))
        assertFalse(isMarkdownPath(""))
    }
}
