package com.poracode.app.session.richchat

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.StateFlow

/** Remote watch cleanup after the visible surface has synchronously dropped local ownership. */
internal class RichTerminalDetachedCleanup(
    private val session: StateFlow<RichChatHostLease?>,
    private val gateway: RichChatSessionGateway,
    private val lifecycle: ForegroundOperationRegistry,
) {
    suspend fun unwatch(expected: RichTerminalLease): RichChatOperationResult<Unit> {
        if (!lifecycle.isForeground) return RichChatOperationResult.Stale
        val (host, failure) = session.currentLease(RichChatCapability.TerminalRead)
        if (host == null || failure != null) {
            return RichChatOperationResult.Failed(
                failure ?: RichChatOperationFailure.NoSession,
            )
        }
        if (expected.host.key != host.key) return RichChatOperationResult.Stale
        return try {
            gateway.unwatchTerminal(host, expected.terminalId)
            RichChatOperationResult.Success(Unit)
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            RichChatOperationResult.Failed(
                error.asRichChatFailure(RichChatCapability.TerminalRead, false),
            )
        }
    }
}
