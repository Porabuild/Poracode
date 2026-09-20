package com.poracode.app.protocol

/**
 * Pure decisions for flushing pending thread-item interests after WebSocket ready.
 * Interests set during Connecting must be sent once the handshake completes.
 */
object ThreadItemInterestDecisions {
    /**
     * After ready, always re-send the current interest set (empty is fine and
     * robust). Returning true for any ready transition is acceptable.
     */
    fun shouldFlushInterestsOnReady(): Boolean = true

    /** Payload type for the control frame. */
    const val MESSAGE_TYPE: String = "thread-item-interests"

    fun sortedUnique(threadIds: List<String>): List<String> =
        threadIds.distinct().sorted()
}
