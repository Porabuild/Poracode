package com.poracode.app.session

import com.poracode.remote.v3.generated.RemotePairingMachine
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * Consent and bootstrap deferral for deep-link pairing candidates.
 *
 * The coordinator owns the network attempt; this controller owns only the
 * pending confirmation secret and the loopback candidate held behind launch
 * bootstrap, so the coordinator stays focused on durable pairing.
 */
internal class PairingConsentController(
    private val scope: CoroutineScope,
    private val state: () -> AppSession.UiState,
    private val accessToken: () -> String?,
    private val updateState: ((AppSession.UiState) -> AppSession.UiState) -> Unit,
    private val pair: (
        input: PairingCoordinator.PairingInput,
        fingerprint: String,
        certFingerprint: String?,
    ) -> Unit,
) {
    private var pendingSecret: PendingPairSecret? = null
    private var bootstrapInFlight = false
    private var deferredAutoPair: DeferredAutoPair? = null

    private data class DeferredAutoPair(
        val endpoint: String,
        val credential: String,
        val fingerprint: String,
        val certFingerprint: String?,
    )

    /** The launch bootstrap owns the first session operation until it completes. */
    fun noteBootstrapStarted() {
        bootstrapInFlight = true
    }

    /** Starts a loopback link deferred behind launch bootstrap. The replacement
     * check runs again because bootstrap may have loaded a stored pair while the
     * link was waiting. */
    fun resumeDeferredAutoPair() {
        scope.launch {
            bootstrapInFlight = false
            val candidate = deferredAutoPair ?: return@launch
            deferredAutoPair = null
            if (state().profile != null && !accessToken().isNullOrBlank()) {
                present(
                    endpoint = candidate.endpoint,
                    credential = candidate.credential,
                    fingerprint = candidate.fingerprint,
                    certFingerprint = candidate.certFingerprint,
                )
                return@launch
            }
            pair(
                input(candidate.endpoint, candidate.credential),
                candidate.fingerprint,
                candidate.certFingerprint,
            )
        }
    }

    /** Shows consent, defers behind bootstrap, or starts the pair attempt. */
    fun presentOrPair(
        external: Boolean,
        endpoint: String,
        credential: String,
        fingerprint: String,
        certFingerprint: String?,
        replacesExistingPair: Boolean,
    ) {
        if (SessionPolicies.shouldShowBrowsableConfirm(
                fromBrowsableIntent = external,
                endpoint = endpoint,
                replacesExistingPair = replacesExistingPair,
            )
        ) {
            deferredAutoPair = null
            present(endpoint, credential, fingerprint, certFingerprint)
            return
        }
        if (bootstrapInFlight) {
            deferredAutoPair = DeferredAutoPair(endpoint, credential, fingerprint, certFingerprint)
            pendingSecret = null
            updateState { it.copy(pendingPairConfirm = null, globalError = null) }
            return
        }
        pair(input(endpoint, credential), fingerprint, certFingerprint)
    }

    fun confirmPendingPair() {
        val secret = pendingSecret ?: return
        pendingSecret = null
        updateState { it.copy(pendingPairConfirm = null) }
        pair(
            input(secret.endpoint, secret.credential),
            secret.fingerprint,
            secret.certFingerprint,
        )
    }

    fun cancelPendingPair() {
        clearPendingSecret()
        updateState { it.copy(pendingPairConfirm = null) }
    }

    fun clearPendingSecret() {
        pendingSecret = null
        if (state().pendingPairConfirm != null) {
            updateState { it.copy(pendingPairConfirm = null) }
        }
    }

    /** Drops a link waiting on bootstrap without touching a visible consent card. */
    fun clearDeferredAutoPair() {
        deferredAutoPair = null
    }

    private fun present(
        endpoint: String,
        credential: String,
        fingerprint: String,
        certFingerprint: String?,
    ) {
        pendingSecret = PendingPairSecret(
            endpoint = endpoint,
            credential = credential,
            fingerprint = fingerprint,
            sanitizedHost = RemotePairingMachine.sanitizedHostLabel(endpoint),
            certFingerprint = certFingerprint,
        )
        updateState {
            it.copy(
                pendingPairConfirm = AppSession.PendingPairConfirmUi(
                    sanitizedHost = RemotePairingMachine.sanitizedHostLabel(endpoint),
                    endpoint = endpoint,
                    fingerprint = fingerprint,
                ),
                globalError = null,
            )
        }
    }

    private fun input(endpoint: String, credential: String) =
        PairingCoordinator.PairingInput(
            pairingUrlOrEmpty = "",
            manualBaseUrl = endpoint,
            manualToken = credential,
        )
}
