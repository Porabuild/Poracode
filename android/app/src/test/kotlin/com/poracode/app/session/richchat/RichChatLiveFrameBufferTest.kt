package com.poracode.app.session.richchat

import com.poracode.app.chat.RichPayloadPatch
import com.poracode.app.chat.RichRuntimeEvent
import com.poracode.app.chat.RichThreadKey
import com.poracode.app.model.ClientConnectionId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Bounded recovery for the rich-chat history-read frame buffer: count, byte,
 * and retained-age bounds with oldest-first eviction (the newest window
 * survives, matching the shared bounded-recovery tape and the other
 * incremental buffers). Any eviction — including expiry at replay — sets
 * `overflow`, which the controller folds into `needsAuthoritativeRefresh`; the
 * replay is never silently claimed converged.
 */
class RichChatLiveFrameBufferTest {
    private val key = RichThreadKey(ClientConnectionId("30000000-0000-4000-8000-000000000003"), "thread-a")

    private fun frame(sequence: Int) = RichChatLiveFrame(
        sequence = sequence,
        events = listOf(
            RichRuntimeEvent.ItemStarted(
                threadKey = key,
                itemId = "item-$sequence",
                itemType = "assistant_message",
                payload = RichPayloadPatch.Absent,
                parentItemId = null,
            ),
        ),
    )

    @Test
    fun countOverflowEvictsOldestAndRetainsTheNewestWindow() {
        val buffer = RichChatLiveFrameBuffer(maxFrames = 2, maxBytes = 1_000_000, maxAgeMs = 600_000)
        buffer.buffer(frame(1))
        buffer.buffer(frame(2))
        assertFalse(buffer.overflow)
        buffer.buffer(frame(3))
        assertTrue(buffer.overflow)
        assertEquals("the newest window is retained, not the oldest", 2, buffer.bufferedCount())
        assertTrue(buffer.bufferedEstimatedBytes() > 0L)

        val replayed = buffer.replayAfterSnapshot(richSnapshot(seq = 0))
        assertTrue(replayed.hadOverflow)
        assertEquals(setOf("item-2", "item-3"), replayed.transcript.itemsById.keys)
    }

    @Test
    fun oversizedFrameIsEvictedRatherThanRefused() {
        val buffer = RichChatLiveFrameBuffer(maxFrames = 8, maxBytes = 1, maxAgeMs = 600_000)
        buffer.buffer(frame(1))
        assertTrue(buffer.overflow)
        assertEquals(0, buffer.bufferedCount())
        assertEquals(0L, buffer.bufferedEstimatedBytes())
    }

    @Test
    fun retainedAgeOverflowEvictsOldestAndFlagsRecovery() {
        var now = 0L
        val buffer = RichChatLiveFrameBuffer(
            maxFrames = 8,
            maxBytes = 1_000_000,
            maxAgeMs = 100,
            arrivalClockMs = { now },
        )
        buffer.buffer(frame(1))
        now = 200
        buffer.buffer(frame(2))
        assertTrue(buffer.overflow)
        assertEquals(1, buffer.bufferedCount())

        val replayed = buffer.replayAfterSnapshot(richSnapshot(seq = 0))
        assertTrue(replayed.hadOverflow)
        assertEquals(setOf("item-2"), replayed.transcript.itemsById.keys)
    }

    @Test
    fun expiredWindowWithoutNewInputDropsFramesAtReplayAndFlagsRecovery() {
        var now = 0L
        val buffer = RichChatLiveFrameBuffer(
            maxFrames = 8,
            maxBytes = 1_000_000,
            maxAgeMs = 100,
            arrivalClockMs = { now },
        )
        buffer.buffer(frame(1))
        now = 50
        buffer.buffer(frame(2))
        assertFalse("no append-time eviction happened", buffer.overflow)

        // Quiet stream: the read outlives the age budget with no new input.
        now = 120
        val replayed = buffer.replayAfterSnapshot(richSnapshot(seq = 0))
        assertTrue(replayed.hadOverflow)
        assertEquals("the expired head is never replayed", setOf("item-2"), replayed.transcript.itemsById.keys)
        assertEquals(0, buffer.bufferedCount())
        assertEquals(0L, buffer.bufferedEstimatedBytes())
        assertFalse(buffer.overflow)
    }

    @Test
    fun replayAndResetReleaseFramesAndOverflow() {
        var now = 0L
        val buffer = RichChatLiveFrameBuffer(
            maxFrames = 8,
            maxBytes = 1_000_000,
            maxAgeMs = 100,
            arrivalClockMs = { now },
        )
        buffer.buffer(frame(1))
        now = 200
        buffer.buffer(frame(2))
        assertTrue(buffer.overflow)
        assertEquals(1, buffer.bufferedCount())

        buffer.reset()
        assertFalse(buffer.overflow)
        assertEquals(0, buffer.bufferedCount())
        assertEquals(0L, buffer.bufferedEstimatedBytes())

        buffer.buffer(frame(3))
        val replay = buffer.replayAfterSnapshot(richSnapshot(seq = 2))
        assertFalse(replay.hadOverflow)
        assertFalse(buffer.overflow)
        assertEquals(0, buffer.bufferedCount())
        assertEquals(0L, buffer.bufferedEstimatedBytes())
    }
}
