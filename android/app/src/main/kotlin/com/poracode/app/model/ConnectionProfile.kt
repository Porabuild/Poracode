package com.poracode.app.model

import com.poracode.app.protocol.ProtocolConstants
import kotlinx.serialization.Serializable

/**
 * Non-secret connection metadata (token lives only in Keystore-backed storage).
 * Store schema version for future migrations of local connection metadata.
 *
 * [protocolVersion] binds the stored profile to a remote protocol generation
 * (must equal [ProtocolConstants.REMOTE_PROTOCOL_VERSION] for live use).
 */
@Serializable
data class ConnectionProfile(
    val desktopId: String,
    val label: String,
    val httpBaseUrl: String,
    val wsBaseUrl: String,
    val appVersion: String,
    val hostMode: String? = null,
    val platform: String? = null,
    val scopes: List<String> = emptyList(),
    val tokenExpiresAt: String? = null,
    val pairedAtEpochMs: Long,
    val protocolVersion: Int = ProtocolConstants.REMOTE_PROTOCOL_VERSION,
) {
    companion object {
        /** Bump + migrate or invalidate when the persisted shape becomes incompatible. */
        const val STORE_VERSION = 1
    }
}

@Serializable
data class ConnectionStoreDocument(
    val version: Int,
    val profile: ConnectionProfile? = null,
)
