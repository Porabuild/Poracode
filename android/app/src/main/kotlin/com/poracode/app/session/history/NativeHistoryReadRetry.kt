package com.poracode.app.session.history

import com.poracode.app.model.RemoteBoundedReadCodes
import com.poracode.app.model.RemoteClientException
import com.poracode.app.transport.TlsCertPin
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay

/**
 * Bounded read-only transient retry policy matching iOS `NativeHistoryReadRetry`
 * and PWA `hostHistoryRead.ts`. Mutations, authorization refusals, TLS pin
 * failures, cancellations, and protocol violations never retry.
 */
object NativeHistoryReadRetry {
    val delaysMs: LongArray = longArrayOf(250L, 500L)

    val persistenceCodes: Set<String> = setOf(
        "persistence_read_refused",
        "persistence_busy",
        "persistence_degraded",
        "persistence_unavailable",
    )

    private val nonRetryableProtocolCodes: Set<String> = setOf(
        RemoteBoundedReadCodes.PROTOCOL_ERROR,
        RemoteBoundedReadCodes.ROUTE_UNAVAILABLE,
        "invalid_thread_cursor",
        "invalid_reads_capability",
        "invalid_reads_request",
        "invalid_response",
        "cursor_mismatch",
        TlsCertPin.MISMATCH_CODE,
    )

    fun isRetryable(error: Throwable): Boolean {
        if (error is CancellationException) return false
        if (error is RemoteClientException) {
            if (error.isUnauthorized || error.code in nonRetryableProtocolCodes || error.code == "timeout") {
                return false
            }
            return error.isTransportFailure || (error.status == 503 && error.code in persistenceCodes)
        }
        return error is IOException && !TlsCertPin.isMismatch(error)
    }

    suspend fun <T> run(
        validateBeforeAttempt: suspend () -> Unit = {},
        sleep: suspend (Long) -> Unit = { delay(it) },
        block: suspend () -> T,
    ): T {
        var attempt = 0
        while (true) {
            validateBeforeAttempt()
            try {
                return block()
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                if (attempt >= delaysMs.size || !isRetryable(error)) throw error
                validateBeforeAttempt()
                sleep(delaysMs[attempt])
                attempt += 1
            }
        }
    }
}
