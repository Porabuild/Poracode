package com.poracode.app.protocol

/**
 * Pure decisions for deep-link pairing intents and failed-pair recovery.
 * Keeps MainActivity / AppSession behavior unit-testable without Android runtime.
 */
object PairingIntentDecisions {
    /**
     * Extract a one-shot pairing URL from intent data. Non-blank data is
     * considered consumable; callers must clear Intent.data after extract so
     * rotation/recreation cannot re-redeem a burned token.
     */
    fun extractPairingData(dataString: String?): String? =
        dataString?.trim()?.takeIf { it.isNotEmpty() }

    /**
     * Failed pairing must not regress a valid loaded session to NeedsPairing.
     *
     * @param previousPhase phase before the pairing attempt began
     * @param hasRetainedCredential true when profile + token remain after the failure
     */
    enum class SessionPhase {
        Launching,
        NeedsPairing,
        ReconnectingStored,
        Connecting,
        Ready,
        SessionExpired,
        ProtocolIncompatible,
        LocalStoreInconsistent,
    }

    fun phaseAfterPairingFailure(
        previousPhase: SessionPhase,
        hasRetainedCredential: Boolean,
    ): SessionPhase {
        if (!hasRetainedCredential) return SessionPhase.NeedsPairing
        return when (previousPhase) {
            SessionPhase.Ready,
            SessionPhase.SessionExpired,
            SessionPhase.ReconnectingStored,
            SessionPhase.ProtocolIncompatible,
            SessionPhase.LocalStoreInconsistent,
            -> previousPhase
            // Connecting that interrupted a live session should restore Ready when
            // credentials remain (stale deep-link while already paired).
            SessionPhase.Connecting -> SessionPhase.Ready
            SessionPhase.Launching,
            SessionPhase.NeedsPairing,
            -> SessionPhase.NeedsPairing
        }
    }

    /**
     * Whether a BROWSABLE deep link should present a confirmation UI instead of
     * immediately starting pair. Always true for browsable intents so a link can
     * never silently replace an existing different endpoint/desktop.
     */
    fun requiresBrowsableConfirmation(fromBrowsableIntent: Boolean): Boolean =
        fromBrowsableIntent

    /**
     * Process-lifetime fingerprint dedup: skip re-dispatch of the same burned link.
     * Fingerprint must never include the raw secret in logs or saved state.
     */
    fun shouldSkipDuplicateFingerprint(
        fingerprint: String,
        seen: Set<String>,
    ): Boolean = fingerprint.isNotEmpty() && seen.contains(fingerprint)

    fun afterFingerprintConsumed(
        fingerprint: String,
        seen: Set<String>,
    ): Set<String> =
        if (fingerprint.isEmpty()) seen else seen + fingerprint
}

/**
 * Pure decisions for flushing pending thread-item interests after WebSocket ready.
 * Interests set during Connecting must be sent once the handshake completes.
 */
object ThreadItemInterestDecisions {
    /**
     * After ready, always re-send the current interest set (empty is fine and
     * robust). Returning true for any ready transition is acceptable.
     */
    fun shouldFlushInterestsOnReady(): Boolean = true

    /** Payload type for the control frame. */
    const val MESSAGE_TYPE: String = "thread-item-interests"

    fun sortedUnique(threadIds: List<String>): List<String> =
        threadIds.distinct().sorted()
}
