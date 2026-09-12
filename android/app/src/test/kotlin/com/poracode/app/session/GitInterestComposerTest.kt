package com.poracode.app.session

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.RemoteThread
import com.poracode.app.protocol.git.GitInterest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Deterministic proof that [GitInterestComposer] merges the passive target set
 * with the heavy-review variant under the desktop policy constraints: max four,
 * archived exclusion, dedupe by project, exact-host isolation, and that all three
 * authoritative variants are reachable.
 */
class GitInterestComposerTest {
    private val host = ClientConnectionId("10000000-0000-4000-8000-000000000001")
    private val other = ClientConnectionId("20000000-0000-4000-8000-000000000002")

    private fun thread(
        id: String,
        projectId: String = "p1",
        status: String = "working",
        worktree: String? = "/repo",
        archived: Boolean = false,
        updatedAt: String = "2026-01-02T00:00:00.000Z",
    ) = RemoteThread(
        id = id,
        projectId = projectId,
        title = id,
        agentKind = "claude",
        status = status,
        attention = "none",
        worktreePath = worktree,
        archived = archived,
        createdAt = "2026-01-01T00:00:00.000Z",
        updatedAt = updatedAt,
    )

    @Test
    fun passiveOnlyWhenNoHeavyReview() {
        val out = GitInterestComposer.compose(
            threads = listOf(thread("t1"), thread("t2", projectId = "p2")),
            selectedThreadId = "t1",
            connectionId = host,
            heavyReview = null,
        )
        assertTrue(out.all { it is GitInterest.Target })
        assertEquals(2, out.size)
    }

    @Test
    fun pullRequestReviewBundleVariantEmittedForExactHost() {
        val out = GitInterestComposer.compose(
            threads = listOf(thread("t1")),
            selectedThreadId = "t1",
            connectionId = host,
            heavyReview = HeavyReviewTarget.PullRequest(host, "p1", 42, "feature"),
        )
        val pr = out.filterIsInstance<GitInterest.PullRequest>().single()
        assertEquals("p1", pr.projectId)
        assertEquals(42, pr.prNumber)
        assertEquals("feature", pr.branch)
        assertEquals(true, pr.includeReviewBundle)
    }

    @Test
    fun projectListVariantEmitted() {
        val out = GitInterestComposer.compose(
            threads = emptyList(),
            selectedThreadId = null,
            connectionId = host,
            heavyReview = HeavyReviewTarget.ProjectList(host, "p1"),
        )
        val list = out.filterIsInstance<GitInterest.ProjectPullRequests>().single()
        assertEquals("p1", list.projectId)
    }

    @Test
    fun heavyReviewDropsOnConnectionIdMismatch() {
        val out = GitInterestComposer.compose(
            threads = listOf(thread("t1")),
            selectedThreadId = "t1",
            connectionId = host,
            heavyReview = HeavyReviewTarget.PullRequest(other, "p1", 42, "feature"),
        )
        assertFalse(out.any { it is GitInterest.PullRequest })
        assertTrue(out.any { it is GitInterest.Target })
    }

    @Test
    fun heavyReviewSupersedesPassiveTargetForSameProject() {
        val out = GitInterestComposer.compose(
            threads = listOf(thread("t1", projectId = "p1")),
            selectedThreadId = "t1",
            connectionId = host,
            heavyReview = HeavyReviewTarget.PullRequest(host, "p1", 9, "b"),
        )
        assertEquals(1, out.size)
        assertTrue(out.first() is GitInterest.PullRequest)
    }

    @Test
    fun archivedThreadsExcludedFromPassiveSet() {
        val out = GitInterestComposer.compose(
            threads = listOf(thread("t1", archived = true), thread("t2", projectId = "p2")),
            selectedThreadId = null,
            connectionId = host,
            heavyReview = null,
        )
        assertTrue(out.none { it is GitInterest.Target && it.projectId == "p1" })
    }

    @Test
    fun cappedAtFourIncludingHeavyReview() {
        val threads = (1..6).map { thread("t$it", projectId = "p$it") }
        val out = GitInterestComposer.compose(
            threads = threads,
            selectedThreadId = "t1",
            connectionId = host,
            heavyReview = HeavyReviewTarget.PullRequest(host, "px", 1, "b"),
        )
        assertEquals(com.poracode.app.protocol.git.GitInterestPolicy.MAX_REMOTE_GIT_TARGET_INTERESTS, out.size)
    }
}
