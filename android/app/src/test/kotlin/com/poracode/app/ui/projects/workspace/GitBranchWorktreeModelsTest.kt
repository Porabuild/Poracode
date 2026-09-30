package com.poracode.app.ui.projects.workspace

import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.WindowsProjectLocation
import com.poracode.app.model.WslProjectLocation
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GitBranchWorktreeModelsTest {
    @Test
    fun `decodes branch list`() {
        val json = buildJsonObject {
            put("current", "main")
            put(
                "branches",
                JsonArray(
                    listOf(
                        buildJsonObject {
                            put("name", "main")
                            put("current", true)
                            put("isRemote", false)
                            put("commit", "abc123")
                        },
                        buildJsonObject {
                            put("name", "origin/main")
                            put("current", false)
                            put("isRemote", true)
                            put("commit", "abc123")
                            put("remote", "origin")
                        },
                    ),
                ),
            )
        }
        val result = requireNotNull(decodeGitBranchList(json))
        assertEquals("main", result.current)
        assertEquals(2, result.branches.size)
        assertTrue(result.branches[0].current)
        assertTrue(result.branches[1].isRemote)
        assertEquals("origin", result.branches[1].remote)
    }

    @Test
    fun `decode returns null for missing or malformed json`() {
        assertNull(decodeGitBranchList(null))
        assertNull(decodeGitBranchList(JsonPrimitive("not-an-object")))
        assertNull(decodeGitWorktreeList(null))
    }

    @Test
    fun `decodes worktree list`() {
        val json = buildJsonObject {
            put(
                "worktrees",
                JsonArray(
                    listOf(
                        buildJsonObject {
                            put("path", "/repo")
                            put("branch", "main")
                            put("commit", "abc123")
                            put("isMain", true)
                        },
                        buildJsonObject {
                            put("path", "/repo-feature")
                            put("branch", "feature")
                            put("commit", "def456")
                            put("isMain", false)
                        },
                    ),
                ),
            )
        }
        val result = requireNotNull(decodeGitWorktreeList(json))
        assertEquals(2, result.size)
        assertEquals("/repo", result[0].path)
        assertTrue(result[0].isMain)
        assertEquals("/repo-feature", result[1].path)
    }

    @Test
    fun `activeWorktreePaths reflects the real worktree list, never an empty default`() {
        assertEquals(emptyList<String>(), activeWorktreePaths(null))
        val worktrees = listOf(
            GitWorktreeInfo(path = "/repo", branch = "main", commit = "abc", isMain = true),
            GitWorktreeInfo(path = "/repo-feature", branch = "feature", commit = "def", isMain = false),
        )
        assertEquals(listOf("/repo", "/repo-feature"), activeWorktreePaths(worktrees))
    }

    @Test
    fun `worktreeScopedLocation rewrites posix and windows paths`() {
        val posix = PosixProjectLocation(path = "/repo")
        assertEquals(
            PosixProjectLocation(path = "/repo-feature"),
            worktreeScopedLocation(posix, "/repo-feature"),
        )
        val windows = WindowsProjectLocation(path = "C:\\repo")
        assertEquals(
            WindowsProjectLocation(path = "C:\\repo-feature"),
            worktreeScopedLocation(windows, "C:\\repo-feature"),
        )
    }

    @Test
    fun `worktreeScopedLocation leaves wsl locations untouched`() {
        val wsl = WslProjectLocation(distro = "Ubuntu", linuxPath = "/repo", uncPath = "\\\\wsl$\\Ubuntu\\repo")
        assertEquals(wsl, worktreeScopedLocation(wsl, "/repo-feature"))
    }
}
