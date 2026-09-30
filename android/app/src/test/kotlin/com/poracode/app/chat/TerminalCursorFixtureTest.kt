package com.poracode.app.chat

import com.poracode.remote.v3.generated.TerminalCursorAction
import com.poracode.remote.v3.generated.TerminalCursorFrame
import com.poracode.remote.v3.generated.TerminalCursorFrameKind
import com.poracode.remote.v3.generated.TerminalCursorReconciler
import com.poracode.remote.v3.generated.TerminalCursorState

import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TerminalCursorFixtureTest {
    @Test
    fun fixtureCoversBufferReplaceDuplicateOverlapGapGenerationNullAndStaleActions() {
        val fixture = readRichFixture("terminal-cursor-sequence.json")
        val actual = fixture.getValue("steps").jsonArray.map { stepValue ->
            val step = stepValue.jsonObject
            val id = step.getValue("id").stringOrNull()!!
            val currentWatch = step.getValue("currentWatchId").stringOrNull()!!
            val previous = step["previous"]
            val state = if (previous == null || previous is JsonNull) {
                TerminalCursorState.watching(currentWatch)
            } else {
                val objectValue = previous.jsonObject
                val generation = when (val raw = objectValue["generation"]) {
                    JsonNull -> null
                    else -> raw?.stringOrNull()
                }
                TerminalCursorState.established(
                    currentWatch,
                    generation,
                    objectValue.getValue("toCursor").longOrStrictNull()!!,
                    transcript = "seed",
                )
            }
            val frame = TerminalCursorFrameDecoder.decode(step.getValue("message"))!!
            val result = TerminalCursorReconciler.reconcile(state, frame)
            Triple(id, result, step.getValue("expected").jsonObject)
        }

        for ((id, result, expected) in actual) {
            assertEquals(id, expectedAction(expected.getValue("consumerAction").stringOrNull()!!), result.action)
            if (result.action == TerminalCursorAction.RESYNC) assertTrue(id, result.state.needsResync)
        }
        assertEquals("xy", actual.single { it.first == "overlap" }.second.appendedText)
        assertFalse(actual.single { it.first == "stale-watch" }.second.state.needsResync)
        assertEquals("tail", actual.single { it.first == "null-generation" }.second.state.transcript)
    }

    @Test
    fun v2ResumeSuffixBaselineAppendsAtTheDurablePosition() {
        val state = TerminalCursorState.established("watch", "generation-a", 108, transcript = "kept")
        val continuation = TerminalCursorFrame(
            TerminalCursorFrameKind.BASELINE, "terminal", "watch", "generation-a", 108, 111, "ijk",
        )
        val appended = TerminalCursorReconciler.reconcile(state, continuation)
        assertEquals(TerminalCursorAction.APPEND, appended.action)
        assertEquals("keptijk", appended.state.transcript)
        assertEquals(111L, appended.state.toCursor)

        val fullWindow = TerminalCursorFrame(
            TerminalCursorFrameKind.BASELINE, "terminal", "watch", "generation-a", 0, 3, "xyz",
        )
        val replaced = TerminalCursorReconciler.reconcile(state, fullWindow)
        assertEquals(TerminalCursorAction.REPLACE, replaced.action)
        assertEquals("xyz", replaced.state.transcript)

        val generationChange = TerminalCursorFrame(
            TerminalCursorFrameKind.BASELINE, "terminal", "watch", "generation-b", 108, 111, "ijk",
        )
        val resnapshotted = TerminalCursorReconciler.reconcile(state, generationChange)
        assertEquals(TerminalCursorAction.REPLACE, resnapshotted.action)
    }

    @Test
    fun v2ContinuationClearsAPendingResyncAndTheUpToDateMarkerIgnoresCleanly() {
        // A drift RESYNC armed needsResync; the authoritative continuation
        // covers everything through its toCursor, so it must clear the flag
        // (otherwise every later output keeps returning RESYNC).
        val drifted = TerminalCursorState.established(
            "watch",
            "generation-a",
            108,
            transcript = "kept",
        ).copy(needsResync = true)
        val continuation = TerminalCursorFrame(
            TerminalCursorFrameKind.BASELINE, "terminal", "watch", "generation-a", 108, 111, "ijk",
        )
        val appended = TerminalCursorReconciler.reconcile(drifted, continuation)
        assertEquals(TerminalCursorAction.APPEND, appended.action)
        assertFalse(appended.state.needsResync)

        // Up-to-date marker: empty continuation at the retained position.
        val marker = TerminalCursorFrame(
            TerminalCursorFrameKind.BASELINE, "terminal", "watch", "generation-a", 111, 111, "",
        )
        val current = TerminalCursorReconciler.reconcile(appended.state, marker)
        assertEquals(TerminalCursorAction.IGNORE, current.action)
        assertFalse(current.state.needsResync)
        assertEquals("keptijk", current.state.transcript)
    }

    @Test
    fun exactAppendAndPreBaselineDrainUseUtf16CursorUnits() {
        var state = TerminalCursorState.watching("watch")
        val early = frame(
            TerminalCursorFrameKind.OUTPUT,
            "watch",
            "generation",
            5,
            8,
            "😀!",
        )
        val buffered = TerminalCursorReconciler.reconcile(state, early)
        assertEquals(TerminalCursorAction.BUFFER, buffered.action)

        val baselineText = "A😀e\u0301"
        val baseline = frame(
            TerminalCursorFrameKind.BASELINE,
            "watch",
            "generation",
            0,
            5,
            baselineText,
        )
        val replaced = TerminalCursorReconciler.reconcile(buffered.state, baseline)
        assertEquals(TerminalCursorAction.REPLACE, replaced.action)
        assertEquals(8L, replaced.state.toCursor)
        assertEquals(baselineText + "😀!", replaced.state.transcript)

        val appended = TerminalCursorReconciler.reconcile(
            replaced.state,
            frame(TerminalCursorFrameKind.OUTPUT, "watch", "generation", 8, 9, "x"),
        )
        assertEquals(TerminalCursorAction.APPEND, appended.action)
        assertEquals("x", appended.appendedText)
        assertEquals(9L, appended.state.toCursor)
    }

    @Test
    fun transcriptAndPreBaselineBufferAreBoundedAtTwoHundredThousandUtf16Units() {
        val oversized = "a".repeat(TerminalCursorReconciler.MAX_TRANSCRIPT_UTF16_UNITS + 7)
        val baseline = frame(
            TerminalCursorFrameKind.BASELINE,
            "watch",
            "generation",
            0,
            oversized.length.toLong(),
            oversized,
        )
        val result = TerminalCursorReconciler.reconcile(
            TerminalCursorState.watching("watch"),
            baseline,
        )
        assertEquals(TerminalCursorReconciler.MAX_TRANSCRIPT_UTF16_UNITS, result.state.transcript.length)
        assertEquals(oversized.length.toLong(), result.state.toCursor)

        val tooMuchBeforeBaseline = frame(
            TerminalCursorFrameKind.OUTPUT,
            "watch",
            "generation",
            0,
            oversized.length.toLong(),
            oversized,
        )
        val overflow = TerminalCursorReconciler.reconcile(
            TerminalCursorState.watching("watch"),
            tooMuchBeforeBaseline,
        )
        assertEquals(TerminalCursorAction.RESYNC, overflow.action)
        assertTrue(overflow.state.bufferedOutput.isEmpty())
    }

    private fun expectedAction(value: String): TerminalCursorAction = when (value) {
        "buffer" -> TerminalCursorAction.BUFFER
        "replace" -> TerminalCursorAction.REPLACE
        "ignore" -> TerminalCursorAction.IGNORE
        "append-unseen-suffix" -> TerminalCursorAction.APPEND_UNSEEN_SUFFIX
        "resync" -> TerminalCursorAction.RESYNC
        else -> error("Unknown fixture action $value")
    }

    private fun frame(
        kind: TerminalCursorFrameKind,
        watchId: String,
        generation: String?,
        from: Long,
        to: Long,
        data: String,
    ): TerminalCursorFrame = TerminalCursorFrame(
        kind,
        "terminal",
        watchId,
        generation,
        from,
        to,
        data,
    )
}
