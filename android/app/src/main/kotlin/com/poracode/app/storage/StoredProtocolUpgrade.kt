package com.poracode.app.storage

import com.poracode.app.protocol.ProtocolConstants

/** Only reviewed storage generations may reuse credentials for a fresh live handshake. */
internal object StoredProtocolUpgrade {
    const val PREVIOUS_VERSION = 9

    // v10/v11/v12 changed wire content, not stored credential identity. v13 adds
    // per-request writer admission and strict selection configs on the wire; the
    // stored host/token binding is unchanged. Keep this list explicit (mirrored in
    // iOS `PreservedPairingUpgrade.isEligibleStoredProtocol`); never derive it from
    // `REMOTE_PROTOCOL_VERSION - 1`.
    fun isEligibleStoredProtocol(version: Int?): Boolean =
        version == PREVIOUS_VERSION || version == 10 || version == 11 || version == 12

    fun importedBinding(version: Int): Int? = when (version) {
        0 -> ProtocolConstants.REMOTE_PROTOCOL_VERSION
        PREVIOUS_VERSION, 10, 11, 12, ProtocolConstants.REMOTE_PROTOCOL_VERSION -> version
        else -> null
    }
}
