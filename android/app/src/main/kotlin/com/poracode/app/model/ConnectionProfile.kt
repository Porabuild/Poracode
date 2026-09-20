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
    /**
     * Handshake capability `capabilities.browserForward.versions`, captured at
     * pairing like the other environment metadata. Empty on records from older
     * hosts or app versions: browser entry unsupported, raw forwarding unaffected.
     */
    val browserForwardVersions: List<Int> = emptyList(),
    /** QR `#fp=` SHA-256 of the TLS leaf DER. Absent on records paired before V6 A.2. */
    val certFingerprint: String? = null,
    /** Host-declared services from `GET /api/host/describe`. Absent on records paired before V6 C.2. */
    val hostCapabilities: HostServiceCapabilities? = null,
) {
    companion object {
        /** Bump + migrate or invalidate when the persisted shape becomes incompatible. */
        const val STORE_VERSION = 1
    }
}

/** Host-declared service capabilities from `GET /api/host/describe` (V6 C.2). */
@Serializable
data class HostServiceCapabilities(
    val ssh: Boolean = false,
    val browserPanel: Boolean = false,
    val chromeBridge: Boolean = false,
    val computerUse: Boolean = false,
    val nativeSecrets: Boolean = false,
    val portForward: Boolean = false,
    val autoUpdate: Boolean = false,
    val osNotifications: Boolean = false,
) {
    companion object {
        val UNKNOWN = HostServiceCapabilities()
    }
}

@Serializable
data class HostDescribeResponse(
    val capabilities: HostServiceCapabilities,
)

@Serializable
data class ConnectionStoreDocument(
    val version: Int,
    val profile: ConnectionProfile? = null,
)
