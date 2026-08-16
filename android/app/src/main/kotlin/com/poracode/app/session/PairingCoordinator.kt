package com.poracode.app.session

import com.poracode.app.model.ConnectionProfile
import com.poracode.app.model.RemoteClientException
import com.poracode.app.protocol.PairingException
import com.poracode.app.protocol.PairingIntentDecisions
import com.poracode.app.protocol.PairingUrl
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.protocol.RemoteAccessScopes
import com.poracode.app.storage.CredentialMutationOutcome
import com.poracode.app.storage.DurableOperationToken
import com.poracode.app.storage.SessionCredentialLoadOutcome
import com.poracode.app.storage.SessionCredentialRepository
import com.poracode.app.transport.RemoteApiGatewayFactory
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Pairing + unpair + pending deep-link secrets.
 * Durable tokens allocate at UI receipt so delayed Pair A cannot beat Unpair/Pair B.
 */
class PairingCoordinator(
    private val credentials: SessionCredentialRepository,
    private val scope: CoroutineScope,
    private val jobs: SessionLifecycleJobs,
    private val owner: SessionOperationOwner,
    private val apiFactory: RemoteApiGatewayFactory,
    private val ioDispatcher: CoroutineDispatcher,
    private val state: () -> AppSession.UiState,
    private val updateState: ((AppSession.UiState) -> AppSession.UiState) -> Unit,
    private val accessToken: () -> String?,
    private val setAccessToken: (String?) -> Unit,
    private val destroyLiveForHostSwap: () -> Unit,
    /** Install API client + token after successful durable commit; then start live. */
    private val onPairCommitted: suspend (profile: ConnectionProfile, accessToken: String) -> Unit,
    private val onUnpairComplete: () -> Unit,
    private val onCatalogChanged: suspend () -> Unit = {},
) {
    private var pendingPairSecret: PendingPairSecret? = null
    private val consumedPairFingerprints = mutableSetOf<String>()

    data class PairingInput(
        val pairingUrlOrEmpty: String = "",
        val manualBaseUrl: String = "",
        val manualToken: String = "",
    )

    fun handleIncomingPairingUrl(raw: String, external: Boolean) {
        val route = PairingUrl.parseDeepLink(raw)
        val endpoint: String
        val credential: String
        if (route != null) {
            endpoint = route.endpoint
            credential = route.token
        } else {
            val parts = PairingUrl.parseParts(raw) ?: return
            endpoint = PairingUrl.normalizeEndpoint(raw)
            credential = parts.token
        }
        val fingerprint = SessionPolicies.pairingFingerprint(endpoint, credential)
        if (PairingIntentDecisions.shouldSkipDuplicateFingerprint(
                fingerprint,
                consumedPairFingerprints,
            )
        ) {
            return
        }
        // Default EVERY externally delivered Intent URL to sanitized explicit confirmation.
        if (external) {
            pendingPairSecret = PendingPairSecret(
                endpoint = endpoint,
                credential = credential,
                fingerprint = fingerprint,
                sanitizedHost = SessionPolicies.sanitizedHostLabel(endpoint),
            )
            updateState {
                it.copy(
                    pendingPairConfirm = AppSession.PendingPairConfirmUi(
                        sanitizedHost = SessionPolicies.sanitizedHostLabel(endpoint),
                        endpoint = endpoint,
                        fingerprint = fingerprint,
                    ),
                    globalError = null,
                )
            }
            return
        }
        // Direct in-app manual form only: pair without confirmation.
        pair(
            PairingInput(
                pairingUrlOrEmpty = "",
                manualBaseUrl = endpoint,
                manualToken = credential,
            ),
            fingerprint = fingerprint,
        )
    }

    fun confirmPendingPair() {
        val secret = pendingPairSecret ?: return
        pendingPairSecret = null
        updateState { it.copy(pendingPairConfirm = null) }
        pair(
            PairingInput(
                pairingUrlOrEmpty = "",
                manualBaseUrl = secret.endpoint,
                manualToken = secret.credential,
            ),
            fingerprint = secret.fingerprint,
        )
    }

    fun cancelPendingPair() {
        clearPendingPairSecret()
        updateState { it.copy(pendingPairConfirm = null) }
    }

    fun clearPendingPairSecret() {
        pendingPairSecret = null
        if (state().pendingPairConfirm != null) {
            updateState { it.copy(pendingPairConfirm = null) }
        }
    }

    fun pair(input: PairingInput, fingerprint: String? = null) {
        // Exclusive UI owner + durable intent at public receipt (sync, ordered).
        val sessionToken = owner.begin(SessionOperationOwner.Kind.Pair)
        val durable = credentials.beginDurableOperation(DurableOperationToken.Kind.Pair)
        val previousPhase = state().phase
        val retainedProfile = state().profile
        val retainedToken = accessToken()
        val job = scope.launch {
            updateState {
                it.copy(
                    isPairing = true,
                    globalError = null,
                    sessionExpired = false,
                    phase = AppSession.Phase.Connecting,
                    pendingPairConfirm = null,
                )
            }
            pendingPairSecret = null
            try {
                val (endpoint, credential) = resolvePairing(input)
                val fp = fingerprint ?: SessionPolicies.pairingFingerprint(endpoint, credential)
                if (PairingIntentDecisions.shouldSkipDuplicateFingerprint(
                        fp,
                        consumedPairFingerprints,
                    )
                ) {
                    clearPairingUiIfCurrent(
                        sessionToken,
                        previousPhase,
                        retainedProfile,
                        retainedToken,
                        error = null,
                    )
                    return@launch
                }

                val client = apiFactory.create(endpoint, null)
                val environment = withContext(ioDispatcher) { client.environment() }
                if (!owner.isCurrent(sessionToken)) return@launch
                val requestedScopes = RemoteAccessScopes.scopesToRequest(environment.auth.scopes)
                if (requestedScopes.isEmpty()) {
                    throw RemoteClientException(
                        NO_KNOWN_SCOPES_MESSAGE,
                        status = 400,
                        code = "no_known_scopes",
                    )
                }
                val tokenResult = withContext(ioDispatcher) {
                    client.exchangePairingCredential(credential, scopes = requestedScopes)
                }
                if (!owner.isCurrent(sessionToken)) return@launch

                val wsBase = PairingUrl.toWebSocketBaseUrl(endpoint)
                val profile = ConnectionProfile(
                    desktopId = environment.desktopId,
                    label = environment.label,
                    httpBaseUrl = endpoint,
                    wsBaseUrl = wsBase,
                    appVersion = environment.appVersion,
                    hostMode = environment.hostMode,
                    platform = environment.platform,
                    scopes = tokenResult.scopes,
                    tokenExpiresAt = tokenResult.expiresAt,
                    pairedAtEpochMs = System.currentTimeMillis(),
                    protocolVersion = ProtocolConstants.REMOTE_PROTOCOL_VERSION,
                )

                if (!owner.isCurrent(sessionToken)) return@launch

                val outcome = try {
                    withContext(NonCancellable + ioDispatcher) {
                        credentials.commit(profile, tokenResult.accessToken, owning = durable)
                    }
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    reconcileFromDisk(
                        sessionToken,
                        previousPhase,
                        retainedProfile,
                        retainedToken,
                        error = e.message ?: "Pairing failed",
                    )
                    return@launch
                }

                if (outcome.applied) {
                    consumedPairFingerprints.add(fp)
                }
                if (!owner.isCurrent(sessionToken)) return@launch
                when (outcome) {
                    CredentialMutationOutcome.AppliedCurrent ->
                        installCommittedPair(profile, tokenResult.accessToken)
                    CredentialMutationOutcome.AppliedSuperseded,
                    CredentialMutationOutcome.RejectedBeforeApply,
                    is CredentialMutationOutcome.Failed,
                    -> reconcileFromDisk(
                        sessionToken,
                        previousPhase,
                        retainedProfile,
                        retainedToken,
                        error = if (outcome is CredentialMutationOutcome.Failed) {
                            outcome.reason ?: "Pairing failed"
                        } else {
                            null
                        },
                    )
                }
            } catch (e: CancellationException) {
                withContext(NonCancellable + ioDispatcher) {
                    reconcileFromDisk(
                        sessionToken,
                        previousPhase,
                        retainedProfile,
                        retainedToken,
                        error = null,
                    )
                }
                throw e
            } catch (e: Exception) {
                reconcileFromDisk(
                    sessionToken,
                    previousPhase,
                    retainedProfile,
                    retainedToken,
                    error = e.message ?: "Pairing failed",
                )
            }
        }
        jobs.replace(SessionLifecycleJobs.PAIR, job)
    }

    /** Explicit disconnect wins over older operations and completes its durable clear. */
    fun unpair() {
        val sessionToken = owner.begin(SessionOperationOwner.Kind.Unpair)
        // Claim durable generation before tear-down so delayed Pair A cannot commit after.
        val durable = credentials.beginDurableOperation(DurableOperationToken.Kind.Unpair)
        owner.bumpSessionGeneration()
        val job = scope.launch {
            clearPendingPairSecret()
            onUnpairComplete()
            val (outcome, loaded) = withContext(NonCancellable + ioDispatcher) {
                val cleared = credentials.clear(owning = durable)
                cleared to credentials.loadOutcome()
            }
            if (!owner.isCurrent(sessionToken)) return@launch
            publishUnpairResult(outcome, loaded)
            onCatalogChanged()
        }
        jobs.replace(SessionLifecycleJobs.UNPAIR, job)
    }

    private fun installCommittedPair(profile: ConnectionProfile, token: String) {
        destroyLiveForHostSwap()
        owner.bumpSessionGeneration()
        setAccessToken(token)
        updateState {
            it.copy(
                profile = profile,
                isPairing = false,
                sessionExpired = false,
                canSessionRead = RemoteAccessScopes.canRead(profile.scopes),
                canSessionOperate = RemoteAccessScopes.canOperate(profile.scopes),
                openThreadId = null,
                threadSnapshot = null,
                threadItems = emptyList(),
                threadOlderCursor = null,
                threadLoadState = AppSession.LoadState.Idle,
                threadLoadError = null,
                snapshot = null,
                projectsLoadState = AppSession.LoadState.Idle,
                projectsLoadError = null,
                threadDomain = com.poracode.app.protocol.ThreadRuntimeDomainState(),
            )
        }
        scope.launch { onPairCommitted(profile, token) }
    }

    private suspend fun reconcileFromDisk(
        sessionToken: SessionOperationOwner.Token,
        previousPhase: AppSession.Phase,
        retainedProfile: ConnectionProfile?,
        retainedToken: String?,
        error: String?,
    ) {
        val loaded = try {
            credentials.loadOutcome()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            if (owner.isCurrent(sessionToken)) {
                updateState {
                    it.copy(
                        isPairing = false,
                        phase = AppSession.Phase.LocalStoreInconsistent,
                        globalError = error ?: it.globalError,
                    )
                }
            }
            return
        }
        if (!owner.isCurrent(sessionToken)) return
        when (loaded) {
            SessionCredentialLoadOutcome.Empty -> {
                setAccessToken(null)
                updateState {
                    AppSession.UiState(
                        phase = AppSession.Phase.NeedsPairing,
                        isPairing = false,
                        globalError = error,
                    )
                }
            }
            is SessionCredentialLoadOutcome.Loaded -> {
                val creds = loaded.credentials
                val already =
                    state().profile?.desktopId == creds.profile.desktopId &&
                        accessToken() == creds.accessToken
                if (already) {
                    updateState {
                        it.copy(
                            isPairing = false,
                            globalError = error ?: it.globalError,
                            phase = if (it.phase == AppSession.Phase.Connecting) {
                                AppSession.Phase.Ready
                            } else {
                                it.phase
                            },
                        )
                    }
                } else {
                    installCommittedPair(creds.profile, creds.accessToken)
                    if (error != null) {
                        updateState { it.copy(globalError = error) }
                    }
                }
            }
            is SessionCredentialLoadOutcome.Rejected.ProtocolMismatch -> {
                updateState {
                    it.copy(
                        isPairing = false,
                        profile = loaded.credentials.profile,
                        phase = AppSession.Phase.ProtocolIncompatible,
                        globalError = error ?: it.globalError,
                    )
                }
            }
            is SessionCredentialLoadOutcome.Rejected -> {
                updateState {
                    it.copy(
                        isPairing = false,
                        phase = AppSession.Phase.LocalStoreInconsistent,
                        globalError = error ?: it.globalError,
                    )
                }
            }
        }
        @Suppress("UNUSED_VARIABLE")
        val ignored = previousPhase to retainedProfile to retainedToken
    }

    private fun publishUnpairResult(
        outcome: CredentialMutationOutcome,
        loaded: SessionCredentialLoadOutcome,
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

    private fun clearPairingUiIfCurrent(
        sessionToken: SessionOperationOwner.Token,
        previousPhase: AppSession.Phase,
        retainedProfile: ConnectionProfile?,
        retainedToken: String?,
        error: String?,
    ) {
        if (!owner.isCurrent(sessionToken)) return
        val hasCredential = (retainedProfile != null && !retainedToken.isNullOrBlank()) ||
            (state().profile != null && !accessToken().isNullOrBlank())
        val nextPhase = PairingPhaseMapping.mapPairingFailurePhase(previousPhase, hasCredential)
        updateState {
            it.copy(
                isPairing = false,
                globalError = error ?: it.globalError,
                phase = nextPhase,
                profile = it.profile ?: retainedProfile,
                sessionExpired = nextPhase == AppSession.Phase.SessionExpired ||
                    it.sessionExpired,
            )
        }
    }

    private fun resolvePairing(input: PairingInput): Pair<String, String> {
        val pasted = input.pairingUrlOrEmpty.trim()
        if (pasted.isNotEmpty()) {
            val deep = PairingUrl.parseDeepLink(pasted)
            if (deep != null) return deep.endpoint to deep.token
            val parts = PairingUrl.parseParts(pasted)
            if (parts != null) {
                return PairingUrl.normalizeEndpoint(pasted) to parts.token
            }
            if (input.manualToken.trim().isNotEmpty()) {
                return PairingUrl.normalizeEndpoint(pasted) to input.manualToken.trim()
            }
            throw PairingException.MissingToken
        }
        val base = input.manualBaseUrl.trim()
        val token = input.manualToken.trim()
        if (base.isEmpty()) throw PairingException.InvalidUrl
        if (token.isEmpty()) throw PairingException.MissingToken
        return PairingUrl.normalizeEndpoint(base) to token
    }

    companion object {
        const val NO_KNOWN_SCOPES_MESSAGE =
            "This server did not advertise any supported remote-access scopes."

        fun mapPairingFailurePhase(
            previousPhase: AppSession.Phase,
            hasRetainedCredential: Boolean,
        ): AppSession.Phase = PairingPhaseMapping.mapPairingFailurePhase(
            previousPhase,
            hasRetainedCredential,
        )
    }
}
