package com.poracode.app.session

import com.poracode.remote.v3.generated.RemotePairingMachine
import com.poracode.remote.v3.generated.RemotePairingPhase

/**
 * AppSession phase-type adapter for the GENERATED pairing failure transition
 * ([RemotePairingMachine.phaseAfterPairingFailure], V5 5.2). The transition
 * table itself is generated from the one pairing spec; only the
 * [AppSession.Phase] mapping lives here.
 */
internal object PairingFailurePhaseMapper {
    fun mapPairingFailurePhase(
        previousPhase: AppSession.Phase,
        hasRetainedCredential: Boolean,
    ): AppSession.Phase = RemotePairingMachine.phaseAfterPairingFailure(
        previousPhase = previousPhase.toDecisionPhase(),
        hasRetainedCredential = hasRetainedCredential,
    ).toSessionPhase()

    private fun AppSession.Phase.toDecisionPhase(): RemotePairingPhase =
        when (this) {
            AppSession.Phase.Launching -> RemotePairingPhase.Launching
            AppSession.Phase.NeedsPairing -> RemotePairingPhase.NeedsPairing
            AppSession.Phase.ReconnectingStored -> RemotePairingPhase.ReconnectingStored
            AppSession.Phase.Connecting -> RemotePairingPhase.Connecting
            AppSession.Phase.Ready -> RemotePairingPhase.Ready
            AppSession.Phase.SessionExpired -> RemotePairingPhase.SessionExpired
            AppSession.Phase.ProtocolIncompatible -> RemotePairingPhase.ProtocolIncompatible
            AppSession.Phase.LocalStoreInconsistent -> RemotePairingPhase.LocalStoreInconsistent
            // The permission prompt is a Connecting variant for pairing purposes.
            AppSession.Phase.LocalNetworkPermissionRequired -> RemotePairingPhase.Connecting
        }

    private fun RemotePairingPhase.toSessionPhase(): AppSession.Phase =
        when (this) {
            RemotePairingPhase.Launching -> AppSession.Phase.Launching
            RemotePairingPhase.NeedsPairing -> AppSession.Phase.NeedsPairing
            RemotePairingPhase.ReconnectingStored -> AppSession.Phase.ReconnectingStored
            RemotePairingPhase.Connecting -> AppSession.Phase.Connecting
            RemotePairingPhase.Ready -> AppSession.Phase.Ready
            RemotePairingPhase.SessionExpired -> AppSession.Phase.SessionExpired
            RemotePairingPhase.ProtocolIncompatible -> AppSession.Phase.ProtocolIncompatible
            RemotePairingPhase.LocalStoreInconsistent -> AppSession.Phase.LocalStoreInconsistent
        }
}
