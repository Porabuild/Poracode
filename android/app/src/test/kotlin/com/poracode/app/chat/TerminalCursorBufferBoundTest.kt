package com.poracode.app.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TerminalCursorBufferBoundTest {
    @Test
    fun zeroLengthPreBaselineFramesCannotGrowTheBufferWithoutBound() {
        var state = TerminalCursorState.watching("watch")
        val frame = TerminalCursorFrame(
            kind = TerminalCursorFrameKind.OUTPUT,
            terminalId = "terminal",
            watchId = "watch",
            generation = "generation",
            fromCursor = 0,
            toCursor = 0,
            data = "",
        )
        repeat(1_024) {
            state = TerminalCursorReconciler.reconcile(state, frame).state
        }

        val overflow = TerminalCursorReconciler.reconcile(state, frame)

        assertEquals(TerminalCursorAction.RESYNC, overflow.action)
        assertTrue(overflow.state.needsResync)
        assertTrue(overflow.state.bufferedOutput.isEmpty())
    }
}
