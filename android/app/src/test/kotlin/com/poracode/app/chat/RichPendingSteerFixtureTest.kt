package com.poracode.app.chat

import kotlinx.serialization.json.jsonArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RichPendingSteerFixtureTest {
    @Test
    fun decodesSetBodyAndSetThenClearBroadcasts() {
        val fixture = readRichFixture("thread-pending-steer-envelope.json")
        val input = RichPendingSteerDecoder.decodeSetBody(fixture.getValue("setBody"))!!
        val broadcasts = fixture.getValue("broadcasts").jsonArray.map {
            RichPendingSteerDecoder.decodeEnvelope(richTestConnectionId, it)!!
        }

        assertEquals("Please include the attachment.", input.prompt)
        assertTrue(input.segments!![1] is RichPromptSegment.Attachment)
        assertEquals(
            RichPromptSegment.Thread("thread-related", "Related investigation"),
            input.segments!![2],
        )
        assertEquals("thread-rich", broadcasts.first().threadKey.threadId)
        assertEquals("steer-rich-1", broadcasts.first().pending!!.id)
        assertEquals(1_786_557_600_000.0, broadcasts.first().pending!!.stagedAtEpochMs, 0.0)
        assertNull(broadcasts.last().pending)

        var state = RichThreadState(broadcasts.first().threadKey)
        state = RichReducer.applyPendingSteer(state, broadcasts.first())
        assertEquals("steer-rich-1", state.pendingSteer?.id)
        state = RichReducer.applyPendingSteer(state, broadcasts.last())
        assertNull(state.pendingSteer)
    }
}
