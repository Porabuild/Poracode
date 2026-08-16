package com.poracode.app.session.richchat

import com.poracode.app.chat.RichPendingSteerEnvelope
import com.poracode.app.chat.RichReducer
import com.poracode.app.chat.RichRuntimeEvent
import com.poracode.app.chat.RichThreadState

/**
 * Decoded live frame queued against the selected thread. Extracted from
 * [RichChatController] to keep that controller under the source-size gate.
 * Behavior is unchanged: events remain strictly decoded and the frame sequence
 * is consumed, but neither owns rich-chat state — warnings flow through thread
 * status elsewhere, while usage is owned by the desktop main-process ledger.
 */
internal data class RichChatLiveFrame(
    val sequence: Int?,
    val events: List<RichRuntimeEvent>,
    val pendingSteer: RichPendingSteerEnvelope?,
)

internal fun reduceLiveFrame(state: RichThreadState, frame: RichChatLiveFrame): RichThreadState {
    val stateEvents = frame.events.filterNot {
        it is RichRuntimeEvent.Warning || it is RichRuntimeEvent.UsageSpent
    }
    var next = RichReducer.reduceAll(state, stateEvents)
    frame.pendingSteer?.let { next = RichReducer.applyPendingSteer(next, it) }
    return next
}
