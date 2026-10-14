package com.poracode.app.ui.projects

import org.junit.Assert.assertEquals
import org.junit.Test

class ProjectCloneNamingTest {
    @Test
    fun `derives name from https url`() {
        assertEquals("repo", projectNameFromCloneUrl("https://github.com/owner/repo.git"))
        assertEquals("repo", projectNameFromCloneUrl("https://github.com/owner/repo"))
    }

    @Test
    fun `derives name from ssh scp-style url`() {
        assertEquals("repo", projectNameFromCloneUrl("git@github.com:owner/repo.git"))
    }

    @Test
    fun `derives name from ssh url scheme`() {
        assertEquals("repo", projectNameFromCloneUrl("ssh://git@host.example.com/owner/repo.git"))
    }

    @Test
    fun `strips trailing slash`() {
        assertEquals("repo", projectNameFromCloneUrl("https://github.com/owner/repo/"))
    }

    @Test
    fun `strips query and fragment suffixes`() {
        assertEquals("repo", projectNameFromCloneUrl("https://github.com/owner/repo.git?ref=main"))
        assertEquals("repo", projectNameFromCloneUrl("https://github.com/owner/repo#readme"))
    }

    @Test
    fun `trims surrounding whitespace`() {
        assertEquals("repo", projectNameFromCloneUrl("  https://github.com/owner/repo.git  "))
    }

    @Test
    fun `returns empty string for input with no derivable segment`() {
        assertEquals("", projectNameFromCloneUrl(""))
        assertEquals("", projectNameFromCloneUrl("   "))
        assertEquals("", projectNameFromCloneUrl(".git"))
        assertEquals("", projectNameFromCloneUrl("///"))
    }

    @Test
    fun `falls back to the whole trimmed value when there is no separator`() {
        assertEquals("repo", projectNameFromCloneUrl("repo.git"))
    }
}
