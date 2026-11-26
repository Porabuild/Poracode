package com.poracode.app.session.richchat

import com.poracode.app.chat.RichRuntimeEvent

/**
 * One scoped viewer admission for an active delegated roster row. Current
 * hosts return empty [history] and stream child output on the normal live
 * frame; legacy hosts may replay the drained buffer and omit [leaseMs].
 */
data class RichChatDelegatedWatchResult(
    val history: List<RichRuntimeEvent>,
    val leaseMs: Long?,
)

/** Scoped delegated-agent viewer operations on a host session. */
interface RichChatDelegatedWatchGateway {
    /**
     * Scoped viewer lease for one active delegated parent. Current hosts drain
     * child output into the normal live stream and return empty history; a
     * legacy host may return the drained buffer and no lease duration.
     */
    suspend fun subscribeDelegatedAgent(
        lease: RichChatHostLease,
        threadId: String,
        parentItemId: String,
        viewerId: String,
    ): RichChatDelegatedWatchResult = throw RichChatGatewayException(
        501,
        "delegated_watch_unavailable",
        false,
    )

    /** Best-effort release using the same viewer id ever sent to subscribe. */
    suspend fun unsubscribeDelegatedAgent(
        lease: RichChatHostLease,
        threadId: String,
        parentItemId: String,
        viewerId: String,
    ) {}
}
