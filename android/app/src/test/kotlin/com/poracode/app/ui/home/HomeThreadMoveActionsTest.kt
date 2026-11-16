package com.poracode.app.ui.home

import com.poracode.app.model.HOME_PROJECT_ID
import com.poracode.app.model.RemoteThread
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HomeThreadMoveActionsTest {
    @Test
    fun generatedBranchesFollowTheSharedScheme() {
        repeat(20) {
            val branch = generateWorktreeBranch()
            assertTrue(
                "unexpected branch: $branch",
                branch.matches(Regex("poracode/[a-z]+-[a-z]+-[0-9a-f]{8}")),
            )
        }
    }

    @Test
    fun onlyPlainProjectThreadsCanMove() {
        assertTrue(canMoveThreadToWorktree(thread()))
        assertFalse(canMoveThreadToWorktree(null))
        assertFalse(canMoveThreadToWorktree(thread(worktreePath = "/repo/.worktrees/a")))
        assertFalse(canMoveThreadToWorktree(thread(archived = true)))
        assertFalse(canMoveThreadToWorktree(thread(projectId = HOME_PROJECT_ID)))
    }

    private fun thread(
        projectId: String = "project-1",
        worktreePath: String? = null,
        archived: Boolean? = null,
    ): RemoteThread = RemoteThread(
        id = "thread-1",
        projectId = projectId,
        title = "Thread",
        agentKind = "agent",
        status = "idle",
        attention = "none",
        worktreePath = worktreePath,
        archived = archived,
        createdAt = "2026-01-01T00:00:00Z",
        updatedAt = "2026-01-01T00:00:00Z",
    )
}
