package com.poracode.app.session

import com.poracode.app.protocol.PairingIntentDecisions

/** Maps pairing-failure phases without bloating [PairingCoordinator]. */
internal object PairingPhaseMapping {
    fun mapPairingFailurePhase(
        previousPhase: AppSession.Phase,
        hasRetainedCredential: Boolean,
    ): AppSession.Phase {
        val mapped = PairingIntentDecisions.phaseAfterPairingFailure(
            previousPhase = previousPhase.toDecisionPhase(),
            hasRetainedCredential = hasRetainedCredential,
        )
        return mapped.toSessionPhase()
    }

    private fun AppSession.Phase.toDecisionPhase(): PairingIntentDecisions.SessionPhase =
        when (this) {
            AppSession.Phase.Launching -> PairingIntentDecisions.SessionPhase.Launching
            AppSession.Phase.NeedsPairing -> PairingIntentDecisions.SessionPhase.NeedsPairing
            AppSession.Phase.ReconnectingStored ->
                PairingIntentDecisions.SessionPhase.ReconnectingStored
            AppSession.Phase.Connecting -> PairingIntentDecisions.SessionPhase.Connecting
            AppSession.Phase.Ready -> PairingIntentDecisions.SessionPhase.Ready
            AppSession.Phase.SessionExpired ->
                PairingIntentDecisions.SessionPhase.SessionExpired
            AppSession.Phase.ProtocolIncompatible ->
                PairingIntentDecisions.SessionPhase.ProtocolIncompatible
            AppSession.Phase.LocalStoreInconsistent ->
                PairingIntentDecisions.SessionPhase.LocalStoreInconsistent
            AppSession.Phase.LocalNetworkPermissionRequired ->
                PairingIntentDecisions.SessionPhase.Connecting
        }

    private fun PairingIntentDecisions.SessionPhase.toSessionPhase(): AppSession.Phase =
        when (this) {
            PairingIntentDecisions.SessionPhase.Launching -> AppSession.Phase.Launching
            PairingIntentDecisions.SessionPhase.NeedsPairing ->
                AppSession.Phase.NeedsPairing
            PairingIntentDecisions.SessionPhase.ReconnectingStored ->
                AppSession.Phase.ReconnectingStored
            PairingIntentDecisions.SessionPhase.Connecting -> AppSession.Phase.Connecting
            PairingIntentDecisions.SessionPhase.Ready -> AppSession.Phase.Ready
            PairingIntentDecisions.SessionPhase.SessionExpired ->
                AppSession.Phase.SessionExpired
            PairingIntentDecisions.SessionPhase.ProtocolIncompatible ->
                AppSession.Phase.ProtocolIncompatible
            PairingIntentDecisions.SessionPhase.LocalStoreInconsistent ->
                AppSession.Phase.LocalStoreInconsistent
        }
}
