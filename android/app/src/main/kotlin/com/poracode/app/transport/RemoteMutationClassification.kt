package com.poracode.app.transport

import com.poracode.app.model.RemoteClientException

/**
 * Single rule for mutation-outcome ambiguity across every remote domain.
 *
 * A mutation is ambiguous — [requestMayHaveCommitted] — when the request could have
 * reached the server and been applied before the failure was observed: HTTP >= 500,
 * no response at all (status <= 0), or a client-side transport/decode classification
 * (network, timeout, invalid response, oversize response). 4xx rejections, scope and
 * validation failures are definite, and reads are always definite regardless of status.
 */
object RemoteMutationClassification {
    /** Client-assigned codes that mean the outcome of a sent mutation is unknown. */
    val ambiguousCodes: Set<String> = setOf(
        "network",
        "timeout",
        "invalid_response",
        "response_too_large",
    )

    fun isAmbiguousOutcome(status: Int, code: String): Boolean =
        status <= 0 || status >= 500 || code in ambiguousCodes

    fun requestMayHaveCommitted(status: Int, code: String, mutation: Boolean): Boolean =
        mutation && isAmbiguousOutcome(status, code)

    fun requestMayHaveCommitted(error: RemoteClientException, mutation: Boolean): Boolean =
        requestMayHaveCommitted(error.status, error.code, mutation)
}
