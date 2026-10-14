package com.poracode.app.protocol.git

import com.poracode.app.model.array
import com.poracode.app.model.string
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Passive Git-target interest selection driven by the parity tape's
 * `gitInterests.threads` + `expectedPassiveTargetInterests`: selection wins,
 * then live turns, dedup by project+worktree, archived excluded, max four.
 */
class GitInterestPolicyTapeTest {
    private val tape = object {
        val json: JsonObject = run {
            val stream = javaClass.classLoader!!.getResourceAsStream(
                "fixtures/replay-git-state-parity-tape.json",
            )!!
            val raw = stream.bufferedReader().use { it.readText() }
            com.poracode.app.model.RemoteJson.parseToJsonElement(raw) as JsonObject
        }
    }.json

    @Test
    fun passiveTargetsMatchTapeSelectionWinsThenActiveDedupMaxFour() {
        val section = tape["gitInterests"] as JsonObject
        val threads = section.array("threads")!!.map { it as JsonObject }.map { raw ->
            GitInterestPolicy.GitInterestThread(
                id = raw.string("id")!!,
                projectId = raw.string("projectId")!!,
                worktreePath = raw.string("worktreePath"),
                status = raw.string("status")!!,
                archived = raw["archived"].toString() == "true",
                updatedAt = raw.string("updatedAt")!!,
            )
        }
        val selected = section.string("selectedThreadId")!!

        val result = GitInterestPolicy.buildPassiveTargetInterests(
            threads,
            GitInterestPolicy.PassiveOptions(selectedThreadId = selected),
        )

        val expected = section.array("expectedPassiveTargetInterests")!!.map { it as JsonObject }
        assertEquals(expected.size, result.size)
        assertEquals(GitInterestPolicy.MAX_REMOTE_GIT_TARGET_INTERESTS, result.size)
        expected.forEachIndexed { index, raw ->
            val interest = result[index] as GitInterest.Target
            assertEquals(raw.string("projectId"), interest.projectId)
            assertEquals(raw.string("worktreePath"), interest.worktreePath)
            assertEquals(true, interest.includePrDetails)
        }
    }

    @Test
    fun archivedExcludedAndDuplicateProjectWorktreeCollapsed() {
        val threads = listOf(
            thread("sel", "p1", "/w", "idle", false, "2026-01-03T00:00:00.000Z"),
            thread("dup", "p1", "/w", "working", false, "2026-01-04T00:00:00.000Z"),
            thread("archived", "p2", "/a", "working", true, "2026-01-05T00:00:00.000Z"),
            thread("active", "p3", "/b", "needs_approval", false, "2026-01-02T00:00:00.000Z"),
        )
        val result = GitInterestPolicy.buildPassiveTargetInterests(
            threads,
            GitInterestPolicy.PassiveOptions(selectedThreadId = "sel"),
        )
        val pairs = result.map { it as GitInterest.Target; it.projectId to it.worktreePath }
        assertEquals(listOf("p1" to "/w", "p3" to "/b"), pairs)
    }

    @Test
    fun limitZeroReturnsEmpty() {
        val result = GitInterestPolicy.buildPassiveTargetInterests(
            listOf(thread("x", "p", "/w", "working", false, "1")),
            GitInterestPolicy.PassiveOptions(selectedThreadId = null, limit = 0),
        )
        assertTrue(result.isEmpty())
    }

    private fun thread(
        id: String,
        projectId: String,
        worktreePath: String,
        status: String,
        archived: Boolean,
        updatedAt: String,
    ) = GitInterestPolicy.GitInterestThread(id, projectId, worktreePath, status, archived, updatedAt)
}
