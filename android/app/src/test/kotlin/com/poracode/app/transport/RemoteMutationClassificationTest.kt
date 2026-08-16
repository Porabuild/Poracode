package com.poracode.app.transport

import com.poracode.app.model.RemoteClientException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoteMutationClassificationTest {
    private data class Case(
        val status: Int,
        val code: String,
        val ambiguous: Boolean,
        val description: String,
    )

    private val cases = listOf(
        Case(500, "request_failed", true, "server 500 after send"),
        Case(502, "request_failed", true, "bad gateway after send"),
        Case(503, "request_failed", true, "server 503 after send"),
        Case(504, "request_failed", true, "gateway timeout after send"),
        Case(0, "network", true, "connection lost before response"),
        Case(0, "timeout", true, "request timed out"),
        Case(-1, "network", true, "no response status at all"),
        Case(200, "invalid_response", true, "response failed to decode after send"),
        Case(200, "response_too_large", true, "response exceeded bounds after send"),
        Case(400, "invalid_request", false, "validation rejection"),
        Case(401, "invalid_token", false, "authentication rejection"),
        Case(403, "missing_scope", false, "scope rejection"),
        Case(404, "not_found", false, "resource rejection"),
        Case(409, "conflict", false, "conflict rejection"),
        Case(422, "unprocessable_entity", false, "semantic rejection"),
        Case(200, "ok", false, "successful response"),
    )

    @Test
    fun ambiguityDecisionIsStatusAndCodeDriven() {
        for (case in cases) {
            assertEquals(
                case.description,
                case.ambiguous,
                RemoteMutationClassification.isAmbiguousOutcome(case.status, case.code),
            )
        }
    }

    @Test
    fun mutationsInheritAmbiguityAndReadsAreAlwaysDefinite() {
        for (case in cases) {
            assertEquals(
                "mutation: ${case.description}",
                case.ambiguous,
                RemoteMutationClassification.requestMayHaveCommitted(
                    case.status,
                    case.code,
                    mutation = true,
                ),
            )
            assertFalse(
                "read: ${case.description}",
                RemoteMutationClassification.requestMayHaveCommitted(
                    case.status,
                    case.code,
                    mutation = false,
                ),
            )
        }
    }

    @Test
    fun remoteClientExceptionsClassifyThroughStatusAndCode() {
        assertTrue(
            RemoteMutationClassification.requestMayHaveCommitted(
                RemoteClientException("lost", 503, "request_failed"),
                mutation = true,
            ),
        )
        assertFalse(
            RemoteMutationClassification.requestMayHaveCommitted(
                RemoteClientException("lost", 503, "request_failed"),
                mutation = false,
            ),
        )
        assertFalse(
            RemoteMutationClassification.requestMayHaveCommitted(
                RemoteClientException("denied", 403, "missing_scope"),
                mutation = true,
            ),
        )
    }
}
