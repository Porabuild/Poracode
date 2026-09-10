package com.poracode.app.storage

import com.poracode.app.protocol.ProtocolConstants

/** Only reviewed storage generations may reuse credentials for a fresh live handshake. */
internal object StoredProtocolUpgrade {
    const val PREVIOUS_VERSION = 9

    // v10 changed runtime broadcasts, not stored credential identity.
    fun isEligibleStoredProtocol(version: Int?): Boolean = version == PREVIOUS_VERSION || version == 10

    fun importedBinding(version: Int): Int? = when (version) {
        0 -> ProtocolConstants.REMOTE_PROTOCOL_VERSION
        PREVIOUS_VERSION, 10, ProtocolConstants.REMOTE_PROTOCOL_VERSION -> version
        else -> null
    }
}
