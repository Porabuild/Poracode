package com.poracode.app.ui.richchat

import com.poracode.app.chat.RichPendingSteer
import org.junit.Assert.assertEquals
import org.junit.Test

class RichFollowUpQueueUiLogicTest {
    @Test
    fun followUpSubmitActionMirrorsTheDesktopDefaults() {
        assertEquals(RichFollowUpSubmitAction.SEND, followUpSubmitAction(isTurnActive = false, queueInsteadOfSteer = false))
        assertEquals(RichFollowUpSubmitAction.SEND, followUpSubmitAction(isTurnActive = false, queueInsteadOfSteer = true))
        // Steer is the desktop default while working; long-press queues.
        assertEquals(RichFollowUpSubmitAction.STEER, followUpSubmitAction(isTurnActive = true, queueInsteadOfSteer = false))
        assertEquals(RichFollowUpSubmitAction.QUEUE, followUpSubmitAction(isTurnActive = true, queueInsteadOfSteer = true))
    }

    @Test
    fun reorderTargetsUseStableBeforeIdAnchors() {
        val items = listOf(
            pending("a"),
            pending("b"),
            pending("c"),
            pending("d"),
        )
        // Move up lands before the item currently above; boundary is a no-op.
        assertEquals(QueueReorderTarget.None, queueMoveUpTarget(items, 0))
        assertEquals(QueueReorderTarget.Before("a"), queueMoveUpTarget(items, 1))
        assertEquals(QueueReorderTarget.Before("c"), queueMoveUpTarget(items, 3))
        // Move down lands after the item currently below: before the one
        // after that, or the tail for the penultimate slot.
        assertEquals(QueueReorderTarget.Before("c"), queueMoveDownTarget(items, 0))
        assertEquals(QueueReorderTarget.Tail, queueMoveDownTarget(items, 2))
        assertEquals(QueueReorderTarget.None, queueMoveDownTarget(items, 3))
    }

    private fun pending(id: String): RichPendingSteer =
        RichPendingSteer(id = id, prompt = "prompt-$id", stagedAtEpochMs = 1.0)
}
