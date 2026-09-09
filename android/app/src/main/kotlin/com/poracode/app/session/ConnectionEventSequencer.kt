package com.poracode.app.session

import java.util.concurrent.atomic.AtomicLong

/**
 * Monotonic ids for connection events: every snapshot attempt takes an id
 * when it starts and every transient failure publication takes one when it
 * is published. A success is recovery evidence only against claims that
 * predate the attempt (claim seq <= attempt seq), so completion of an older
 * request can never retire a newer failure. Publication and retirement
 * reducers live in [LiveSessionStateTransitions]; the refresh pipeline that
 * drives them is [SnapshotRefresher].
 */
internal class ConnectionEventSequencer(
    private val updateState: ((AppSession.UiState) -> AppSession.UiState) -> Unit,
) {
    private val seq = AtomicLong(0L)

    fun next(): Long = seq.incrementAndGet()

    /** Publish a transient transport failure as the connection scope's claim. */
    fun publishFailure(message: String?) {
        updateState {
            LiveSessionStateTransitions.connectionFailed(it, message, next())
        }
    }
}
