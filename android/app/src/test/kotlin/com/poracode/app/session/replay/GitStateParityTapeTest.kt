package com.poracode.app.session.replay

import com.poracode.app.model.GitStateJsonAdapter
import com.poracode.app.model.applyGitStatePatch
import com.poracode.app.model.array
import com.poracode.app.model.asObjectOrNull
import com.poracode.app.model.obj
import com.poracode.app.model.string
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Exact behavioral oracle for remote-git-state patch application, driven
 * directly by `protocol/remote/v3/fixtures/replay-git-state-parity-tape.json`.
 * Covers: first-positive-from-zero, duplicate/lower ignored, removals-before-
 * upserts, null branch delete, omitted-fields preserve, final removal, and the
 * final snapshot key sets.
 */
class GitStateParityTapeTest {
    private val tape = ReplayFixtureSupport.readFixtureJson("replay-git-state-parity-tape.json")
    private val gitState = tape.obj("gitState")!!
    private val keys: Map<String, String> = gitState.obj("keys")!!.entries.associate { (k, v) ->
        k to (v as JsonPrimitive).content
    }

    private fun symbol(name: String): String = keys[name] ?: error("unknown key $name")

    private fun patchAt(index: Int): JsonObject =
        gitState.array("patches")!![index] as JsonObject

    private fun eventPatch(obj: JsonObject) =
        GitStateJsonAdapter.decodePatch(obj.obj("message")!!.obj("event")!!.obj("patch"))!!

    @Test
    fun fullTapeReplayMatchesFinalSnapshotAndPerPatchExpectations() {
        var snap = GitStateJsonAdapter.decodeSnapshot(gitState["initialSnapshot"])!!
        val patches = gitState.array("patches")!!
        val expectedFinal = gitState.obj("expectedFinalSnapshot")!!

        patches.forEach { raw ->
            val entry = raw as JsonObject
            val id = entry.string("id")!!
            val patch = eventPatch(entry)
            val expected = entry.obj("expected")!!
            val before = snap.revision
            val next = applyGitStatePatch(snap, patch)
            val disposition = expected.string("disposition")!!
            if (disposition == "applied") {
                assertEquals("[$id] revision advanced", patch.revision, next.revision)
                assertTrue("[$id] revision moved", next.revision != before)
            } else {
                assertEquals("[$id] $disposition keeps revision", before, next.revision)
            }
            snap = next
            expected.string("revision")?.let { assertEquals("[$id] revision", it.toInt(), snap.revision) }
        }

        // Final snapshot matches the tape's expected final state exactly (actual keys).
        assertEquals(expectedFinal.string("revision")!!.toInt(), snap.revision)
        assertEquals(expectedFinal.obj("projects")!!.keys, snap.projects.keys)
        assertEquals(expectedFinal.obj("targets")!!.keys, snap.targets.keys)
        assertEquals(expectedFinal.obj("pullRequests")!!.keys, snap.pullRequests.keys)
        assertEquals(expectedFinal.obj("pullRequestKeyByBranch")!!.keys, snap.pullRequestKeyByBranch.keys)
        assertEquals(expectedFinal.obj("projectPullRequestLists")!!.keys, snap.projectPullRequestLists.keys)
    }

    @Test
    fun duplicateRevisionIsIgnored() {
        val first = eventPatch(patchAt(0))
        var snap = GitStateJsonAdapter.decodeSnapshot(gitState["initialSnapshot"])!!
        snap = applyGitStatePatch(snap, first)
        val beforeKeys = snap.targets.keys
        // Same revision with a removal must not mutate.
        val dup = eventPatch(patchAt(1))
        val after = applyGitStatePatch(snap, dup)
        assertEquals(snap.revision, after.revision)
        assertEquals(beforeKeys, after.targets.keys)
    }

    @Test
    fun higherPatchRemovesBeforeUpsertsAndNullBranchDeletes() {
        var snap = GitStateJsonAdapter.decodeSnapshot(gitState["initialSnapshot"])!!
        snap = applyGitStatePatch(snap, eventPatch(patchAt(0))) // rev 2: targetMain + targetRemoved
        assertTrue(snap.targets.containsKey(symbol("targetMain")))
        assertTrue(snap.targets.containsKey(symbol("targetRemoved")))

        // rev 3: removes targetMain+targetRemoved then upserts targetMain → only targetMain remains.
        val r3 = applyGitStatePatch(snap, eventPatch(patchAt(3)))
        assertEquals(3, r3.revision)
        assertEquals(setOf(symbol("targetMain")), r3.targets.keys)
        // null branch mapping deletes oldBranch; currentBranch upserted.
        assertFalse(r3.pullRequestKeyByBranch.containsKey(symbol("oldBranch")))
        assertTrue(r3.pullRequestKeyByBranch.containsKey(symbol("currentBranch")))
    }

    @Test
    fun omittedFieldsPreserveStateAndFinalRemovalClears() {
        var snap = GitStateJsonAdapter.decodeSnapshot(gitState["initialSnapshot"])!!
        snap = applyGitStatePatch(snap, eventPatch(patchAt(0))) // rev 2
        snap = applyGitStatePatch(snap, eventPatch(patchAt(3))) // rev 3
        // rev 4: only { revision } — omitted maps preserve.
        val r4 = applyGitStatePatch(snap, eventPatch(patchAt(4)))
        assertEquals(4, r4.revision)
        assertTrue(r4.targets.containsKey(symbol("targetMain")))
        // rev 5: final removal clears targets entirely.
        val r5 = applyGitStatePatch(r4, eventPatch(patchAt(5)))
        assertEquals(5, r5.revision)
        assertTrue(r5.targets.isEmpty())
    }
}
