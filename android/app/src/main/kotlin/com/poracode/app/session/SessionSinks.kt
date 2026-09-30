package com.poracode.app.session

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.session.replay.ReplayOutcome
import kotlinx.serialization.json.JsonElement

/**
 * Mutable sinks the session exposes to UI/integration code, extracted from
 * [AppSession] so the controller graph can consume them without the session
 * owning their storage inline.
 */
internal class SessionSinks {
    @Volatile
    var richChatEventSink: ((Int, JsonElement) -> Unit)? = null

    @Volatile
    var replaySideEffectSink: ((ReplayOutcome) -> Unit)? = null

    @Volatile
    var heavyReviewTargetSupplier: (() -> HeavyReviewTarget?)? = null
}

/**
 * A deep link/push open of a thread that belongs to a host other than the
 * selected one. The host install consumes it once that host becomes selected;
 * a later different deep link replaces the pending target.
 */
internal class PendingThreadOpenState {
    @Volatile
    private var connectionId: ClientConnectionId? = null

    @Volatile
    private var threadId: String? = null

    fun set(connectionId: ClientConnectionId, threadId: String) {
        this.connectionId = connectionId
        this.threadId = threadId
    }

    fun takeIfSelected(selectedConnectionId: ClientConnectionId?): String? {
        val pendingConnection = connectionId ?: return null
        if (pendingConnection != selectedConnectionId) return null
        val pendingThread = threadId
        connectionId = null
        threadId = null
        return pendingThread
    }

    fun clear() {
        connectionId = null
        threadId = null
    }
}
