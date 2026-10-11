package com.poracode.app.ui.projects.workspace

import org.junit.Assert.assertEquals
import org.junit.Test

class ProjectFilePathUtilsTest {
    @Test
    fun `joins posix root and relative path`() {
        assertEquals("/repo/src/App.kt", absoluteFilePath("/repo", "src/App.kt"))
    }

    @Test
    fun `joins windows root and relative path`() {
        assertEquals("C:\\repo\\src\\App.kt", absoluteFilePath("C:\\repo", "src/App.kt"))
    }

    @Test
    fun `trims duplicate separators at the join point`() {
        assertEquals("/repo/src/App.kt", absoluteFilePath("/repo/", "/src/App.kt"))
        assertEquals("C:\\repo\\src\\App.kt", absoluteFilePath("C:\\repo\\", "\\src\\App.kt"))
    }

    @Test
    fun `returns drive-letter absolute paths unchanged`() {
        assertEquals("D:\\other\\file.kt", absoluteFilePath("C:\\repo", "D:\\other\\file.kt"))
    }

    @Test
    fun `treats a leading separator as noise because entry paths are project-relative`() {
        // A POSIX leading slash is indistinguishable from separator noise on a project-relative
        // entry path, so it is trimmed and joined rather than treated as an absolute path.
        assertEquals("/repo/etc/hosts", absoluteFilePath("/repo", "/etc/hosts"))
    }

    @Test
    fun `returns the root when the relative path is blank`() {
        assertEquals("/repo", absoluteFilePath("/repo", ""))
    }

    @Test
    fun `falls back to the relative path when root is empty`() {
        assertEquals("src/App.kt", absoluteFilePath("", "src/App.kt"))
    }
}
