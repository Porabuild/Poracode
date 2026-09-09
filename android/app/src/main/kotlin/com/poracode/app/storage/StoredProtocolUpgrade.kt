package com.poracode.app.storage

import com.poracode.app.protocol.ProtocolConstants

/** Only reviewed storage generations may reuse credentials for a fresh live handshake. */
internal object StoredProtocolUpgrade {
    const val PREVIOUS_VERSION = 9

    fun importedBinding(version: Int): Int? = when (version) {
        0 -> ProtocolConstants.REMOTE_PROTOCOL_VERSION
        PREVIOUS_VERSION, ProtocolConstants.REMOTE_PROTOCOL_VERSION -> version
        else -> null
    }
}
