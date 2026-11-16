package com.poracode.app.ui

import com.poracode.app.model.GitStateJsonAdapter
import com.poracode.app.model.GitStateSnapshot
import com.poracode.app.model.RemoteGitSummary
import com.poracode.app.model.RemoteThread
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test

/**
 * `GitSummaryResolver.forThread` resolution order: the published
 * `gitSummariesByThread` entry wins, then the precomputed `gitState` target
 * index for the thread's project + worktree (worktree-level and
 * project-level), else null. The index is built once per gitState change by
 * `GitStateJsonAdapter.decodeTargetSummaries`, so these tests exercise the
 * same production path.
 */
class GitSummaryResolverTest {

    private fun thread(id: String, projectId: String, worktreePath: String?) = RemoteThread(
        id = id,
        projectId = projectId,
        title = id,
        agentKind = "codex",
        status = "idle",
        attention = "none",
        worktreePath = worktreePath,
        createdAt = "2026-01-01T00:00:00Z",
        updatedAt = "2026-01-01T00:00:00Z",
    )

    private fun summary(branch: String, insertions: Int, deletions: Int) = RemoteGitSummary(
        isRepo = true,
        branch = branch,
        totalInsertions = insertions,
        totalDeletions = deletions,
        ahead = 0,
        behind = 0,
        pr = null,
    )

    private fun status(branch: String, insertions: Int, deletions: Int) = buildJsonObject {
        put("isRepo", JsonPrimitive(true))
        put("branch", JsonPrimitive(branch))
        put("totalInsertions", JsonPrimitive(insertions))
        put("totalDeletions", JsonPrimitive(deletions))
        put("ahead", JsonPrimitive(0))
        put("behind", JsonPrimitive(0))
    }

    private fun target(projectId: String, worktreePath: String?, branch: String, ins: Int, del: Int) =
        buildJsonObject {
            put(
                "ref",
                buildJsonObject {
                    put("hostId", JsonPrimitive("h"))
                    put("projectId", JsonPrimitive(projectId))
                    if (worktreePath != null) put("worktreePath", JsonPrimitive(worktreePath))
                },
            )
            put("refreshedAt", JsonPrimitive("t"))
            put("status", status(branch, ins, del))
        }

    private fun gitState(vararg targets: Pair<String, JsonObject>) = GitStateSnapshot(
        revision = 1,
        targets = targets.associate { (k, v) -> k to v },
    )

    private fun index(vararg targets: Pair<String, JsonObject>) =
        GitStateJsonAdapter.decodeTargetSummaries(gitState(*targets))

    @Test
    fun publishedSummaryWinsOverGitState() {
        val published = summary("published", 7, 3)
        val t = thread("t1", "p", "/w")
        val result = GitSummaryResolver.forThread(
            t,
            mapOf("t1" to published),
            index("k" to target("p", "/w", "fallback", 1, 1)),
        )
        assertSame(published, result)
        assertEquals("published", result?.branch)
        assertEquals(7, result?.totalInsertions)
    }

    @Test
    fun worktreeTargetFallback() {
        val t = thread("t1", "p", "/w")
        val result = GitSummaryResolver.forThread(
            t,
            emptyMap(),
            index("k" to target("p", "/w", "master", 1, 1)),
        )
        assertEquals("master", result?.branch)
        assertEquals(1, result?.totalInsertions)
        assertEquals(1, result?.totalDeletions)
        assertNull(result?.pr)
    }

    @Test
    fun projectLevelTargetFallback() {
        val t = thread("t1", "p", null)
        val result = GitSummaryResolver.forThread(
            t,
            emptyMap(),
            index("k" to target("p", null, "main", 2, 0)),
        )
        assertEquals("main", result?.branch)
        assertEquals(2, result?.totalInsertions)
    }

    @Test
    fun missReturnsNull() {
        val t = thread("t1", "p", "/w")
        val result = GitSummaryResolver.forThread(
            t,
            emptyMap(),
            index("k" to target("other", "/w", "x", 1, 1)),
        )
        assertNull(result)
    }
}
