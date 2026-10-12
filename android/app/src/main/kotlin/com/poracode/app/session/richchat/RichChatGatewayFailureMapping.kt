package com.poracode.app.session.richchat

import com.poracode.app.model.RemoteClientException
import com.poracode.app.transport.RemoteMutationClassification
import com.poracode.app.transport.richchat.RichChatAuthorizationException
import com.poracode.app.transport.richchat.RichChatInvalidRequestException
import com.poracode.app.transport.richchat.RichChatInvalidResponseException
import com.poracode.app.transport.richchat.RichChatMutationOutcomeUnknownException
import com.poracode.app.transport.richchat.RichChatRemoteRejectedException
import com.poracode.app.transport.richchat.RichChatRevertFailedException
import com.poracode.app.transport.richchat.RichChatTransportUnavailableException

/**
 * Error classification for the generated rich-chat gateway, split from
 * [GeneratedRichChatSessionGateway] below the source-size gate.
 */

internal fun RemoteClientException.sanitized(mutation: Boolean): RichChatGatewayException =
    RichChatGatewayException(
        statusCode = status,
        code = code.takeIf(SAFE_RICH_CHAT_ERROR_CODES::contains) ?: "remote_error",
        requestMayHaveCommitted =
            RemoteMutationClassification.requestMayHaveCommitted(this, mutation),
        cause = this,
    )

/**
 * The paired host's procedure allowlist predates a verb, so its `/api/git/call`
 * passthrough answers HTTP 403 `git_procedure_not_allowed`. The only inventory
 * failure that means "this host predates the seam" — every other failure must
 * surface instead of masquerading as "no actions".
 */
internal const val RICH_CHAT_PROCEDURE_NOT_ALLOWED = "git_procedure_not_allowed"

internal fun Exception.sanitized(mutation: Boolean): RichChatGatewayException = when (this) {
    is RichChatAuthorizationException -> RichChatGatewayException(status, "forbidden", false, this)
    is RichChatRemoteRejectedException -> RichChatGatewayException(status, "remote_error", false, this)
    is RichChatRevertFailedException ->
        RichChatGatewayException(null, "checkpoint_revert_failed", false, this)
    is RichChatMutationOutcomeUnknownException ->
        RichChatGatewayException(null, "outcome_unknown", true, this)
    is RichChatTransportUnavailableException -> RichChatGatewayException(0, "network", mutation, this)
    is RichChatInvalidRequestException -> RichChatGatewayException(400, "invalid_request", false, this)
    is RichChatInvalidResponseException ->
        RichChatGatewayException(500, "invalid_response", mutation, this)
    else -> RichChatGatewayException(0, "network", mutation, this)
}

internal val SAFE_RICH_CHAT_ERROR_CODES = setOf(
    "invalid_token",
    "unauthorized",
    "forbidden",
    "missing_scope",
    "network",
    "timeout",
    "invalid_response",
    "response_too_large",
    "request_failed",
    "not_modified",
    "command_outcome_uncertain",
    // Older-history continuation outcomes: the controller ends the `ct1.` walk
    // on these instead of surfacing a thread failure.
    "route_unavailable",
    "invalid_thread_cursor",
    // Declared host vocabulary: the procedure allowlist rejected the verb. The
    // code must survive sanitization so the session-action inventory can tell
    // "host predates the seam" apart from a real denial.
    RICH_CHAT_PROCEDURE_NOT_ALLOWED,
)
