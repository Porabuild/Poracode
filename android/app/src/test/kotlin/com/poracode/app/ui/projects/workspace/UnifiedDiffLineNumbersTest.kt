package com.poracode.app.ui.projects.workspace

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UnifiedDiffLineNumbersTest {
    @Test
    fun parsesWellFormedHunkHeader() {
        assertEquals(DiffHunkStart(12, 34), parseDiffHunkHeader("@@ -12,6 +34,8 @@ fun foo() {"))
        assertEquals(DiffHunkStart(1, 1), parseDiffHunkHeader("@@ -1 +1 @@"))
    }

    @Test
    fun rejectsMalformedHunkHeaders() {
        assertNull(parseDiffHunkHeader("@@ malformed @@"))
        assertNull(parseDiffHunkHeader("@@ -a,6 +34,8 @@"))
        assertNull(parseDiffHunkHeader("@@ 12,6 34,8 @@"))
        assertNull(parseDiffHunkHeader("@@"))
        assertNull(parseDiffHunkHeader("@@ -12,6 @@"))
    }

    @Test
    fun recognizesHunkHeaderPrefix() {
        assertTrue(isDiffHunkHeader("@@ -1,2 +1,2 @@"))
        assertFalse(isDiffHunkHeader("diff --git a/x b/x"))
        assertFalse(isDiffHunkHeader("+added line"))
    }

    @Test
    fun assignsNumbersAcrossSingleHunkWithContextAdditionsAndDeletions() {
        val diff = """
            diff --git a/x b/x
            index 1..2 100644
            --- a/x
            +++ b/x
            @@ -1,3 +1,4 @@
             unchanged
            -removed
            +added one
            +added two
             trailing
        """.trimIndent()
        val document = parseGitDiff(diff)
        val numbers = computeDiffLineNumbers(document.lines)

        // diff --git / index / --- / +++ header lines: no numbers.
        assertEquals(DiffLineNumber(null, null), numbers[0])
        assertEquals(DiffLineNumber(null, null), numbers[1])
        assertEquals(DiffLineNumber(null, null), numbers[2])
        assertEquals(DiffLineNumber(null, null), numbers[3])
        // @@ hunk header itself: no numbers.
        assertEquals(DiffLineNumber(null, null), numbers[4])
        // " unchanged" context line: old=1, new=1.
        assertEquals(DiffLineNumber(1, 1), numbers[5])
        // "-removed" deletion: old=2, no new.
        assertEquals(DiffLineNumber(2, null), numbers[6])
        // "+added one" addition: no old, new=2.
        assertEquals(DiffLineNumber(null, 2), numbers[7])
        // "+added two" addition: no old, new=3.
        assertEquals(DiffLineNumber(null, 3), numbers[8])
        // " trailing" context: old=3, new=4.
        assertEquals(DiffLineNumber(3, 4), numbers[9])
    }

    @Test
    fun assignsNumbersAcrossMultipleHunks() {
        val diff = """
            @@ -1,2 +1,2 @@
             a
            -b
            +b2
            @@ -10,2 +10,3 @@
             c
            +d
             e
        """.trimIndent()
        val document = parseGitDiff(diff)
        val numbers = computeDiffLineNumbers(document.lines)

        assertEquals(DiffLineNumber(null, null), numbers[0]) // first hunk header
        assertEquals(DiffLineNumber(1, 1), numbers[1]) // a
        assertEquals(DiffLineNumber(2, null), numbers[2]) // -b
        assertEquals(DiffLineNumber(null, 2), numbers[3]) // +b2
        assertEquals(DiffLineNumber(null, null), numbers[4]) // second hunk header resets counters
        assertEquals(DiffLineNumber(10, 10), numbers[5]) // c
        assertEquals(DiffLineNumber(null, 11), numbers[6]) // +d
        assertEquals(DiffLineNumber(11, 12), numbers[7]) // e
    }

    @Test
    fun addedOnlyFileHasOnlyNewNumbers() {
        val diff = """
            @@ -0,0 +1,2 @@
            +line one
            +line two
        """.trimIndent()
        val numbers = computeDiffLineNumbers(parseGitDiff(diff).lines)
        assertEquals(DiffLineNumber(null, null), numbers[0])
        assertEquals(DiffLineNumber(null, 1), numbers[1])
        assertEquals(DiffLineNumber(null, 2), numbers[2])
    }

    @Test
    fun deletedOnlyFileHasOnlyOldNumbers() {
        val diff = """
            @@ -1,2 +0,0 @@
            -line one
            -line two
        """.trimIndent()
        val numbers = computeDiffLineNumbers(parseGitDiff(diff).lines)
        assertEquals(DiffLineNumber(null, null), numbers[0])
        assertEquals(DiffLineNumber(1, null), numbers[1])
        assertEquals(DiffLineNumber(2, null), numbers[2])
    }

    @Test
    fun malformedHunkHeaderResetsCountersToUnknownForFollowingLines() {
        val diff = """
            @@ garbage @@
             a
            +b
        """.trimIndent()
        val numbers = computeDiffLineNumbers(parseGitDiff(diff).lines)
        assertEquals(DiffLineNumber(null, null), numbers[0])
        assertEquals(DiffLineNumber(null, null), numbers[1])
        assertEquals(DiffLineNumber(null, null), numbers[2])
    }
}
