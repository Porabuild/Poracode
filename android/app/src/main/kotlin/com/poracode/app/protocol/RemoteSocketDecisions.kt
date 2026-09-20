package com.poracode.app.protocol

/**
 * Pure state decisions extracted from [com.poracode.app.transport.RemoteWebSocketClient]
 * for deterministic unit tests without spinning real sockets.
 */
object RemoteSocketDecisions {
    enum class CloseAction {
        SessionExpired,
        Reconnect,
        Ignore,
    }

    enum class OpenAction {
        /** TCP open is not online — stay Connecting until ready. */
        StayConnecting,

        /** Generation mismatch — cancel socket. */
        CancelStale,
    }

    /**
     * onOpen is never online. Only a later `ready` frame marks online and cancels
     * the connect deadline.
     */
    fun onOpenAction(generationMatches: Boolean): OpenAction =
        if (generationMatches) OpenAction.StayConnecting else OpenAction.CancelStale

    fun onCloseAction(
        generationMatches: Boolean,
        stopped: Boolean,
        suspended: Boolean,
        code: Int,
        reason: String,
    ): CloseAction {
        if (!generationMatches || stopped || suspended) return CloseAction.Ignore
        return if (RemoteSocketPolicy.isUnauthorizedClose(code, reason)) {
            CloseAction.SessionExpired
        } else {
            CloseAction.Reconnect
        }
    }

    fun onFailureAction(
        generationMatches: Boolean,
        stopped: Boolean,
        suspended: Boolean,
        closeCode: Int?,
        reason: String?,
    ): CloseAction {
        if (!generationMatches || stopped || suspended) return CloseAction.Ignore
        val code = closeCode ?: 0
        val message = reason.orEmpty()
        return if (RemoteSocketPolicy.isUnauthorizedClose(code, message) ||
            message == RemoteSocketPolicy.SESSION_EXPIRED_REASON
        ) {
            CloseAction.SessionExpired
        } else {
            CloseAction.Reconnect
        }
    }

    /**
     * When to start the health loop: only after ready (not onOpen).
     */
    fun shouldStartHealth(readyReceived: Boolean, generationMatches: Boolean): Boolean =
        readyReceived && generationMatches

    /**
     * Connect deadline fires only when still connecting without ready.
     */
    fun shouldForceConnectTimeout(
        generationMatches: Boolean,
        readyReceived: Boolean,
        stopped: Boolean,
        suspended: Boolean,
        isCurrentSocket: Boolean,
    ): Boolean = generationMatches &&
        !readyReceived &&
        !stopped &&
        !suspended &&
        isCurrentSocket

    /**
     * lastSeenSeq for reconnect: always send a non-negative integer when we have
     * any cursor baseline; snapshot failure uses 0 (not omitted).
     */
    fun lastSeenSeqForConnect(appliedSeq: Int?, snapshotSucceeded: Boolean): Int? {
        if (appliedSeq != null && appliedSeq >= 0) return appliedSeq
        // Snapshot never landed — reconnect with 0 so the server replays from start
        // rather than treating omission as "no snapshot yet / skip replay".
        if (!snapshotSucceeded) return 0
        return null
    }

    /**
     * Unauthorized reconnect delay is fixed 60s; normal uses jittered backoff.
     */
    fun reconnectDelayMs(sessionExpired: Boolean, normalDelayMs: Long): Long =
        if (sessionExpired) RemoteSocketPolicy.UNAUTHORIZED_RECONNECT_MS else normalDelayMs

    /**
     * Resync dispatch: only once while a resync is already pending.
     */
    fun shouldDispatchResync(resyncPending: Boolean): Boolean = !resyncPending

    /**
     * After `newWebSocket`, do not install a socket that already failed/closed
     * synchronously, and do not arm a connect timeout for a dead generation.
     */
    fun shouldInstallSocketAfterNewWebSocket(
        generationMatches: Boolean,
        stopped: Boolean,
        suspended: Boolean,
        alreadyFailedThisGeneration: Boolean,
    ): Boolean = generationMatches &&
        !stopped &&
        !suspended &&
        !alreadyFailedThisGeneration

    /**
     * Stale listeners must not publish state or schedule reconnect.
     */
    fun shouldPublishOrReconnect(
        generationMatches: Boolean,
        stopped: Boolean,
        suspended: Boolean,
    ): Boolean = generationMatches && !stopped && !suspended
}
