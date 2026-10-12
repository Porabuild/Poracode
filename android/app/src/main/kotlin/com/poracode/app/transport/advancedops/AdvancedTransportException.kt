package com.poracode.app.transport.advancedops

import com.poracode.app.model.RemoteClientException
import com.poracode.app.transport.RemoteMutationClassification

/** Sanitized failure: descriptions never include server bodies, messages, tokens or paths. */
class AdvancedTransportException private constructor(
    val statusCode: Int,
    val safeCode: String,
    val ambiguity: Boolean,
    cause: Throwable? = null,
) : Exception("Remote advanced operation failed.", cause) {
    companion object {
        fun invalidRequest(cause: Throwable) =
            AdvancedTransportException(400, "invalid_request", false, cause)

        fun timeout() = AdvancedTransportException(0, "timeout", true)

        fun unavailable() = AdvancedTransportException(0, "network", true)

        fun malformed(cause: Throwable) =
            AdvancedTransportException(500, "invalid_response", true, cause)

        fun remote(error: RemoteClientException): AdvancedTransportException {
            val safe = error.code.takeIf(SAFE_CODES::contains) ?: "remote_error"
            val ambiguous =
                RemoteMutationClassification.isAmbiguousOutcome(error.status, error.code)
            return AdvancedTransportException(error.status, safe, ambiguous, error)
        }
    }
}

private val SAFE_CODES = setOf(
    "invalid_token",
    "unauthorized",
    "forbidden",
    "missing_scope",
    "invalid_response",
    "response_too_large",
    "request_failed",
    "not_modified",
    "network",
    "timeout",
)
