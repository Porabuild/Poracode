package com.poracode.app.transport.projects

import com.poracode.app.protocol.projects.SessionImportContract
import com.poracode.app.protocol.projects.SessionImportFilter
import com.poracode.app.protocol.projects.SessionImportListing
import com.poracode.app.transport.RemoteApiClient

/**
 * Generated-codec HTTP client for the `listImportableSessions` procedure.
 */
class SessionImportClient(
    private val http: RemoteApiClient,
) {
    suspend fun listImportableSessions(
        filter: SessionImportFilter = SessionImportFilter(),
    ): SessionImportListing {
        val body = SessionImportContract.encodeListRequest(filter)
        val raw = http.requestText(
            path = SessionImportContract.PROCEDURE_PATH,
            method = "POST",
            jsonBody = body,
            timeoutMs = 30_000L,
            retryableRead = true,
        )
        return SessionImportContract.decodeListResponse(raw)
    }
}
