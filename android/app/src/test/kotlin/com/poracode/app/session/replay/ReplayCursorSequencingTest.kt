package com.poracode.app.session.replay

import com.poracode.app.model.array
import com.poracode.app.model.asObjectOrNull
import com.poracode.app.model.obj
import com.poracode.app.model.string
import com.poracode.app.protocol.EventStreamCursor
import com.poracode.app.transport.ws.BrowserFramePeek
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Cursor/event invariants driven by the parity tape's `sequencing` section:
 * ready never advances, contiguous applies, duplicate ignored, gap requests one
 * resync without mutating, authoritative resync-required replaces exactly and
 * re-enables application, and all browser/terminal frames stay out-of-band
 * (never decode as event, never mutate, never advance the cursor).
 */
class ReplayCursorSequencingTest {
    private val tape = ReplayFixtureSupport.readFixtureJson("replay-git-state-parity-tape.json")
    private val section = tape["sequencing"] as JsonObject

    @Test
    fun sequencingMatchesTapeDispositionsAndCursors() {
        val cursor = EventStreamCursor()
        val outOfBandTypes = section.array("outOfBandTypes")!!
            .map { (it as kotlinx.serialization.json.JsonPrimitive).content }
            .toHashSet()
        val messages = section.array("messages")!!.map { it as JsonObject }

        messages.forEach { raw ->
            val id = raw.string("id")!!
            val message = raw.obj("message")!!
            val expected = raw.obj("expected")!!
            val expectedDisposition = expected.string("disposition")!!
            val expectedCursor = expected.string("cursor")!!.toInt()

            val type = message.string("type")
            val outcome = when {
                BrowserFramePeek.isBrowserMirror(message.toString()) -> Outcome.OutOfBand
                type in outOfBandTypes -> Outcome.OutOfBand
                type == "ready" -> {
                    cursor.noteReady(message.string("seq")!!.toInt())
                    Outcome.Ready
                }
                type == "event" -> when (cursor.disposition(message.string("seq")!!.toInt())) {
                    EventStreamCursor.EventDisposition.Apply -> {
                        cursor.markEventApplied(message.string("seq")!!.toInt())
                        Outcome.Applied
                    }
                    EventStreamCursor.EventDisposition.Ignore -> Outcome.Duplicate
                    EventStreamCursor.EventDisposition.Gap -> {
                        cursor.markResyncRequested()
                        Outcome.Gap
                    }
                }
                type == "resync-required" -> {
                    // Authoritative exact replacement; re-enables application.
                    cursor.replaceFromAuthoritativeResync(message.string("seq")!!.toInt())
                    Outcome.AuthoritativeResync
                }
                else -> Outcome.OutOfBand
            }
            assertEquals("$id disposition", expectedDisposition, outcome.label)
            assertEquals("$id cursor", expectedCursor, cursor.appliedSeq ?: 0)
        }
    }

    @Test
    fun resyncRequiredReplacesExactlyAndClearsPending() {
        val cursor = EventStreamCursor()
        cursor.markEventApplied(10)
        cursor.markResyncRequested()
        // Authoritative replacement may regress after a server restart.
        cursor.replaceFromAuthoritativeResync(4)
        assertEquals(4, cursor.appliedSeq)
        // Pending cleared so the next contiguous event applies.
        assertEquals(
            EventStreamCursor.EventDisposition.Apply,
            cursor.disposition(5),
        )
    }

    private enum class Outcome(val label: String) {
        Ready("ready"),
        Applied("applied"),
        Duplicate("duplicate"),
        Gap("gap"),
        AuthoritativeResync("authoritative-resync"),
        OutOfBand("out-of-band"),
    }
}
