package com.poracode.app.session.replay

import com.poracode.app.model.PersistedRuntimeItem
import com.poracode.app.model.array
import com.poracode.app.model.asObjectOrNull
import com.poracode.app.model.int
import com.poracode.app.model.obj
import com.poracode.app.model.string
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Drives [SequencedEventApplier] directly from the parity tape: thread-reset
 * target isolation + terminal-watch-intent preserve + fresh baseline signal,
 * thread-exited transcript preserve + pending-steer clear + nullable exit code,
 * agent identity merge, windows/wsl full-replace + loaded-empty distinction,
 * and git-summaries full replacement including exact-empty clearing.
 */
class SequencedEventApplierTapeTest {
    private val tape = ReplayFixtureSupport.readFixtureJson("replay-git-state-parity-tape.json")

    @Test
    fun lifecycleTransitionsMatchExpectedAfterForEachThread() {
        val transitions = tape.obj("lifecycle")!!.array("transitions")!!
        transitions.forEach { raw ->
            val entry = raw as JsonObject
            val state = buildStateFromBefore(entry.obj("before")!!)
            val event = entry.obj("message")!!.obj("event")!!
            val transition = SequencedEventApplier.decode(event)
                ?: error("${entry.string("id")} did not decode")
            val result = SequencedEventApplier.apply(state, transition)
            assertAfter(entry.string("id")!!, entry.obj("expectedAfter")!!, transition, result)
        }
    }

    @Test
    fun agentStatusIdentityMergeAndLoadedEmpty() {
        val agent = tape.obj("agentStatus")!!
        val events = agent.array("events")!!
        var state = SequencedEventApplier.ReplayState()
        events.forEach { raw ->
            val entry = raw as JsonObject
            val event = entry.obj("message")!!.obj("event")!!
            val result = SequencedEventApplier.apply(
                state,
                SequencedEventApplier.decode(event)!!,
            )
            state = result.state
            val expected = entry.obj("expected")!!
            assertEquals(
                "${entry.string("id")} updated keys",
                expected.array("updated")!!.map { (it as JsonPrimitive).content }.toSet(),
                state.mergedByUpdate.keys,
            )
            assertEquals(
                "${entry.string("id")} windows keys",
                expected.array("windows")!!.map { (it as JsonPrimitive).content },
                state.windowsList.map { it.identityKey },
            )
            assertEquals(
                "${entry.string("id")} wsl keys",
                expected.array("wsl")!!.map { (it as JsonPrimitive).content },
                state.wslList.map { it.identityKey },
            )
            val loaded = expected.obj("loaded")!!
            assertEquals("${entry.string("id")} windows loaded", loaded["windows"].toString() == "true", state.windowsLoaded)
            assertEquals("${entry.string("id")} wsl loaded", loaded["wsl"].toString() == "true", state.wslLoaded)
        }
    }

    @Test
    fun gitSummariesFullReplacementIncludingExactEmpty() {
        val summaries = tape.obj("gitSummaries")!!
        val events = summaries.array("events")!!
        var state = SequencedEventApplier.ReplayState()
        events.forEach { raw ->
            val entry = raw as JsonObject
            val event = entry.obj("message")!!.obj("event")!!
            state = SequencedEventApplier.apply(state, SequencedEventApplier.decode(event)!!).state
            val expectedIds = entry.array("expectedThreadIds")!!.map { (it as JsonPrimitive).content }
            assertEquals("${entry.string("id")} thread ids", expectedIds.toSet(), state.gitSummaries.keys)
        }
        // Later replacement does not resurrect removed keys.
        assertTrue(state.gitSummaries.keys == setOf("thread-summary-c"))
    }

    @Test
    fun replayableStateEventsAllDecodeAndApply() {
        val fixture = ReplayFixtureSupport.readFixtureJson("replayable-state-events.json")
        val events = fixture.array("events")!!
        var state = SequencedEventApplier.ReplayState()
        events.forEach { raw ->
            val entry = raw as JsonObject
            val event = entry["event"]!!
            val transition = SequencedEventApplier.decode(event)
                ?: error("${entry.string("id")} did not decode")
            state = SequencedEventApplier.apply(state, transition).state
        }
        // agent-status-updated merged one identity; windows/wsl loaded-empty stay not-loaded until their event.
        assertTrue(state.mergedByUpdate.containsKey("codex|posix|"))
        // windows-agent-statuses had one entry then would be replaced; the single fixture replaced it.
        assertEquals(true, state.windowsLoaded)
        assertEquals(listOf("claude|windows|"), state.windowsList.map { it.identityKey })
        // wsl-agent-statuses was explicitly empty → loaded-empty.
        assertEquals(true, state.wslLoaded)
        assertTrue(state.wslList.isEmpty())
        // remote-git-summaries replaced with two threads.
        assertEquals(setOf("thread-gui-1", "thread-terminal-1"), state.gitSummaries.keys)
        assertEquals(9, state.gitState.revision)
    }

    private fun buildStateFromBefore(before: JsonObject): SequencedEventApplier.ReplayState {
        val threads = before.entries.associate { (threadId, value) ->
            val obj = value as JsonObject
            val baseline = obj.obj("terminalBaseline")?.let {
                SequencedEventApplier.TerminalBaseline(
                    generation = it.string("generation")!!,
                    outputLength = it.int("outputLength")!!,
                )
            }
            threadId to SequencedEventApplier.ReplayThreadState(
                transcriptItems = obj.string("transcript")?.takeIf { it.isNotEmpty() }?.let {
                    listOf(PersistedRuntimeItem(id = it, type = "text", state = "completed"))
                } ?: emptyList(),
                pendingSteerId = obj.string("pendingSteerId"),
                terminalWatchIntent = obj["terminalWatchIntent"].toString() == "true",
                terminalBaseline = baseline,
            )
        }
        return SequencedEventApplier.ReplayState(threads = threads)
    }

    private fun assertAfter(
        id: String,
        expectedAfter: JsonObject,
        transition: SequencedEventApplier.Transition,
        result: SequencedEventApplier.ApplyResult,
    ) {
        val state = result.state
        expectedAfter.entries.forEach { (threadId, value) ->
            val expected = value as JsonObject
            val thread = state.threads[threadId]!!
            val expectedTranscript = expected.string("transcript").orEmpty()
            assertEquals(
                "$id [$threadId] transcript presence",
                expectedTranscript.isEmpty(),
                thread.transcriptItems.isEmpty(),
            )
            assertEquals("$id [$threadId] pendingSteerId", expected.string("pendingSteerId"), thread.pendingSteerId)
            assertEquals(
                "$id [$threadId] terminalWatchIntent",
                expected["terminalWatchIntent"].toString() == "true",
                thread.terminalWatchIntent,
            )
            val baseline = expected.obj("terminalBaseline")
            if (transition is SequencedEventApplier.Transition.ThreadReset && threadId == transition.threadId) {
                assertNull("$id [$threadId] baseline cleared on reset", thread.terminalBaseline)
                assertTrue("$id [$threadId] fresh baseline requested", threadId in result.freshBaselineThreadIds)
            } else if (baseline != null) {
                assertEquals(baseline.string("generation"), thread.terminalBaseline?.generation)
                assertEquals(baseline.int("outputLength"), thread.terminalBaseline?.outputLength)
            }
        }
    }
}
