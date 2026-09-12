package com.poracode.app.protocol

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EventStreamCursorTest {
    @Test
    fun readyNeverAdvancesAppliedCursor() {
        val cursor = EventStreamCursor(appliedSeq = 10)
        cursor.noteReady(42)
        assertEquals(10, cursor.appliedSeq)
    }

    @Test
    fun readyWithNilCursorStaysNil() {
        val cursor = EventStreamCursor()
        cursor.noteReady(5)
        assertNull(cursor.appliedSeq)
    }

    @Test
    fun readyBeforeReplayDoesNotSkipReplayEvents() {
        // Server: ready(12) then replay event seq=11,12 for lastSeenSeq=10.
        val cursor = EventStreamCursor(appliedSeq = 10)
        cursor.noteReady(12)
        assertEquals(10, cursor.appliedSeq)
        assertEquals(EventStreamCursor.EventDisposition.Apply, cursor.disposition(11))
        cursor.markEventApplied(11)
        assertEquals(EventStreamCursor.EventDisposition.Apply, cursor.disposition(12))
        cursor.markEventApplied(12)
        assertEquals(12, cursor.appliedSeq)
    }

    @Test
    fun contiguousApplyAdvancesAfterMark() {
        val cursor = EventStreamCursor(appliedSeq = 10)
        assertEquals(EventStreamCursor.EventDisposition.Apply, cursor.disposition(11))
        cursor.markEventApplied(11)
        assertEquals(11, cursor.appliedSeq)
        assertEquals(EventStreamCursor.EventDisposition.Apply, cursor.disposition(12))
    }

    @Test
    fun duplicateAndStaleAreIgnored() {
        val cursor = EventStreamCursor(appliedSeq = 10)
        assertEquals(EventStreamCursor.EventDisposition.Ignore, cursor.disposition(10))
        assertEquals(EventStreamCursor.EventDisposition.Ignore, cursor.disposition(9))
        cursor.markEventApplied(11)
        assertEquals(EventStreamCursor.EventDisposition.Ignore, cursor.disposition(11))
    }

    @Test
    fun gapThenContiguousWhilePendingIsIgnored() {
        val cursor = EventStreamCursor(appliedSeq = 10)
        assertEquals(EventStreamCursor.EventDisposition.Gap, cursor.disposition(13))
        assertTrue(cursor.shouldRequestResync)
        cursor.markResyncRequested()
        assertFalse(cursor.shouldRequestResync)
        assertTrue(cursor.resyncPending)
        // Contiguous-looking frames while pending must NOT apply.
        assertEquals(EventStreamCursor.EventDisposition.Ignore, cursor.disposition(11))
        assertEquals(EventStreamCursor.EventDisposition.Ignore, cursor.disposition(14))
        assertFalse(cursor.shouldRequestResync)
        cursor.clearResyncPending()
        assertTrue(cursor.shouldRequestResync)
        assertEquals(EventStreamCursor.EventDisposition.Apply, cursor.disposition(11))
    }

    @Test
    fun resyncRequiredLowerSeqAllowed() {
        val cursor = EventStreamCursor(appliedSeq = 100)
        cursor.replaceFromResyncRequired(7)
        assertEquals(7, cursor.appliedSeq)
        assertTrue(cursor.resyncPending)
        // Still pending — must ignore even contiguous next.
        assertEquals(EventStreamCursor.EventDisposition.Ignore, cursor.disposition(8))
        cursor.clearResyncPending()
        assertEquals(EventStreamCursor.EventDisposition.Apply, cursor.disposition(8))
    }

    @Test
    fun resyncRequiredReplacesCursorExactlyNotMax() {
        val cursor = EventStreamCursor(appliedSeq = 42)
        cursor.replaceFromResyncRequired(0)
        assertEquals(0, cursor.appliedSeq)
        assertTrue(cursor.resyncPending)
        // Can lower further.
        cursor.replaceFromResyncRequired(0)
        assertEquals(0, cursor.appliedSeq)
    }

    @Test
    fun authoritativeSnapshotUsesMaxAndDoesNotClearPending() {
        val cursor = EventStreamCursor(appliedSeq = 40)
        cursor.markResyncRequested()
        cursor.noteAuthoritativeSnapshot(42)
        assertEquals(42, cursor.appliedSeq)
        assertTrue(cursor.resyncPending)
        cursor.noteAuthoritativeSnapshot(41)
        assertEquals(42, cursor.appliedSeq)
        assertTrue(cursor.resyncPending)
    }

    @Test
    fun authoritativeResyncReplacesExactlyAndMayRegress() {
        val cursor = EventStreamCursor(appliedSeq = 80)
        cursor.markResyncRequested()
        cursor.replaceFromAuthoritativeResync(12)
        assertEquals(12, cursor.appliedSeq)
        assertFalse(cursor.resyncPending)
        assertEquals(EventStreamCursor.EventDisposition.Apply, cursor.disposition(13))
    }

    @Test
    fun authoritativeSnapshotSetsWhenNil() {
        val cursor = EventStreamCursor()
        cursor.noteAuthoritativeSnapshot(7)
        assertEquals(7, cursor.appliedSeq)
    }

    @Test
    fun firstEventWithNilCursorApplies() {
        val cursor = EventStreamCursor()
        assertEquals(EventStreamCursor.EventDisposition.Apply, cursor.disposition(3))
        cursor.markEventApplied(3)
        assertEquals(3, cursor.appliedSeq)
        assertEquals(EventStreamCursor.EventDisposition.Gap, cursor.disposition(5))
    }

    @Test
    fun dropDuplicateAfterApply() {
        val cursor = EventStreamCursor(appliedSeq = 5)
        cursor.markEventApplied(6)
        assertEquals(EventStreamCursor.EventDisposition.Ignore, cursor.disposition(6))
        assertEquals(EventStreamCursor.EventDisposition.Ignore, cursor.disposition(4))
    }

    @Test
    fun serverSequenceRegressionAllowedAfterClear() {
        val cursor = EventStreamCursor(appliedSeq = 50)
        cursor.replaceFromResyncRequired(0)
        cursor.clearResyncPending()
        assertEquals(0, cursor.appliedSeq)
        assertEquals(EventStreamCursor.EventDisposition.Apply, cursor.disposition(1))
    }
}
