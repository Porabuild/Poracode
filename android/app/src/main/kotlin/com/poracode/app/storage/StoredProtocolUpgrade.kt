package com.poracode.app.storage

import com.poracode.app.protocol.ProtocolConstants

/** Only reviewed storage generations may reuse credentials for a fresh live handshake. */
internal object StoredProtocolUpgrade {
    const val PREVIOUS_VERSION = 9

    // v10–v14 changed the wire while preserving stored host/token custody.
    // Import retains the binding until a verified rebind. Keep this list
    // explicit and mirrored in iOS `PreservedPairingUpgrade`.
    fun isEligibleStoredProtocol(version: Int?): Boolean =
        version == PREVIOUS_VERSION || version == 10 || version == 11 || version == 12 ||
            version == 13 || version == 14

    fun importedBinding(version: Int): Int? = when (version) {
        0 -> ProtocolConstants.REMOTE_PROTOCOL_VERSION
        PREVIOUS_VERSION, 10, 11, 12, 13, 14, ProtocolConstants.REMOTE_PROTOCOL_VERSION -> version
        else -> null
    }
}
