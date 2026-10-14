package com.poracode.app.ui.richchat

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The notice banner renders cumulative counters as lower bounds. These labels
 * are locale-neutral technical tokens; the exact byte value is never presented
 * as an exact loss total.
 */
class RichChatHistoryNoticeFormatTest {
    @Test
    fun lowerBoundByteLabelsAreStableAcrossMagnitudes() {
        assertEquals("0 B", formatLowerBoundBytes(0))
        assertEquals("999 B", formatLowerBoundBytes(999))
        assertEquals("1.0 KB", formatLowerBoundBytes(1_000))
        assertEquals("1.0 KB", formatLowerBoundBytes(1_024))
        assertEquals("123 KB", formatLowerBoundBytes(123_456))
        assertEquals("1.5 MB", formatLowerBoundBytes(1_500_000))
        assertEquals("2.0 GB", formatLowerBoundBytes(2_000_000_000))
    }
}
