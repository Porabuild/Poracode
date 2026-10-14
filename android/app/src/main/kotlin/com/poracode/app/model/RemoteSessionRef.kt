package com.poracode.app.model

import kotlinx.serialization.Serializable

/**
 * The supervisor's `SessionRef` for a live structured session: the provider
 * session id plus the optional opaque execution identity captured when the
 * session was created. Absent on hosts predating the field and on threads
 * without a structured session.
 */
@Serializable
data class RemoteSessionRef(
    val providerSessionId: String,
    val discoveredAt: String,
    val executionIdentity: String? = null,
)

