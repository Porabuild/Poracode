package com.poracode.app.session

import com.poracode.app.storage.CredentialMutationOutcome
import com.poracode.app.storage.SessionCredentialLoadOutcome
import com.poracode.app.storage.SessionCredentialRepository

internal fun publishUnpairResult(
    outcome: CredentialMutationOutcome,
    loaded: SessionCredentialLoadOutcome,
    credentials: SessionCredentialRepository,
    updateState: ((AppSession.UiState) -> AppSession.UiState) -> Unit,
    setAccessToken: (String?) -> Unit,
) {
    val leftover = credentials.hasPendingClearMarker() || credentials.hasV2DocumentForTests()
    if (outcome is CredentialMutationOutcome.Failed && leftover) {
        updateState {
            it.copy(
                phase = AppSession.Phase.LocalStoreInconsistent,
                globalError = "Could not clear stored credentials.",
                isPairing = false,
            )
        }
        return
    }
    when (loaded) {
        SessionCredentialLoadOutcome.Empty -> {
            setAccessToken(null)
            updateState { AppSession.UiState(phase = AppSession.Phase.NeedsPairing) }
        }
        is SessionCredentialLoadOutcome.Loaded -> {
            setAccessToken(loaded.credentials.accessToken)
            updateState {
                it.copy(
                    profile = loaded.credentials.profile,
                    isPairing = false,
                    phase = AppSession.Phase.Ready,
                )
            }
        }
        is SessionCredentialLoadOutcome.Rejected.ProtocolMismatch -> {
            updateState {
                it.copy(
                    profile = loaded.credentials.profile,
                    phase = AppSession.Phase.ProtocolIncompatible,
                    isPairing = false,
                )
            }
        }
        is SessionCredentialLoadOutcome.Rejected -> {
            updateState {
                it.copy(
                    phase = AppSession.Phase.LocalStoreInconsistent,
                    globalError = "Could not clear stored credentials.",
                    isPairing = false,
                )
            }
        }
    }
}
