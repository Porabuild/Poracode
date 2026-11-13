package com.poracode.app.session

import com.poracode.app.model.ConnectionProfile
import com.poracode.app.model.HostServiceCapabilities
import com.poracode.app.model.RemoteClientException
import com.poracode.app.protocol.PairingUrl
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.protocol.RemoteAccessScopes
import com.poracode.app.storage.CredentialMutationOutcome
import com.poracode.app.storage.DurableOperationToken
import com.poracode.app.storage.SessionCredentialLoadOutcome
import com.poracode.app.storage.SessionCredentialRepository
import com.poracode.app.transport.RemoteApiGatewayFactory
import com.poracode.app.transport.TlsCertPinStore
import com.poracode.remote.v3.generated.RemotePairingMachine
import java.util.concurrent.atomic.AtomicReference
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
    private val consumedPairFingerprints = mutableSetOf<String>()
    private val inFlightPairFingerprint = AtomicReference<String?>(null)
    private val consent = PairingConsentController(
        scope = scope,
        state = state,
        accessToken = accessToken,
        updateState = updateState,
    ) { input, fingerprint, certFingerprint ->
        pair(input, fingerprint, certFingerprint)
    }

    data class PairingInput(
        val pairingUrlOrEmpty: String = "",
        val manualBaseUrl: String = "",
        val manualToken: String = "",
    )

    fun noteBootstrapStarted() = consent.noteBootstrapStarted()

    fun resumeDeferredAutoPair() = consent.resumeDeferredAutoPair()

    fun handleIncomingPairingUrl(raw: String, external: Boolean) {
        val route = runCatching {
            PairingUrl.parseDeepLink(raw) ?: PairingUrl.parseParts(raw)?.let { parts ->
                PairingUrl.DeepLinkRoute(
                    endpoint = PairingUrl.normalizeEndpoint(raw),
                    token = parts.token,
                )
            }
        }.getOrNull() ?: return
        val endpoint = route.endpoint
        val credential = route.token
        val fingerprint = RemotePairingMachine.fingerprint(endpoint, credential)
        if (RemotePairingMachine.shouldSkipDuplicateFingerprint(
                fingerprint,
                consumedPairFingerprints,
            ) || inFlightPairFingerprint.get() == fingerprint
        ) {
            return
        }
        consent.presentOrPair(
            external = external,
            endpoint = endpoint,
            credential = credential,
            fingerprint = fingerprint,
            certFingerprint = PairingUrl.parseCertFingerprint(raw),
            replacesExistingPair = state().profile != null && !accessToken().isNullOrBlank(),
        )
    }

    fun confirmPendingPair() = consent.confirmPendingPair()

    fun cancelPendingPair() = consent.cancelPendingPair()

    fun clearPendingPairSecret() = consent.clearPendingSecret()

    fun pair(
        input: PairingInput,
        fingerprint: String? = null,
        certFingerprint: String? = null,
    ) {
        // A repeated delivery of the same deep link must not cancel the attempt
        // that may already be redeeming its one-time credential.
        if (fingerprint != null) {
            if (inFlightPairFingerprint.get() == fingerprint) return
            inFlightPairFingerprint.set(fingerprint)
        }
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
            consent.clearPendingSecret()
            try {
                val resolved = resolvePairing(input)
                val endpoint = resolved.endpoint
                val credential = resolved.credential
                val pin = certFingerprint ?: resolved.certFingerprint
                val fp = fingerprint ?: RemotePairingMachine.fingerprint(endpoint, credential)
                if (RemotePairingMachine.shouldSkipDuplicateFingerprint(
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

                if (pin != null) {
                    TlsCertPinStore.register(endpoint, pin)
                } else {
                    TlsCertPinStore.remove(endpoint)
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

                client.setAccessToken(tokenResult.accessToken)
                val hostCapabilities = withContext(ioDispatcher) {
                    try {
                        client.describeHost()
                    } catch (e: CancellationException) {
                        throw e
                    } catch (_: Exception) {
                        // Describe is best-effort: server errors, transport failures,
                        // and undecodable payloads all degrade to UNKNOWN and pairing
                        // still proceeds to Ready.
                        HostServiceCapabilities.UNKNOWN
                    }
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
                    // Authoritative absence (older host) downgrades to no browser entry
                    // and to no host-owned environment management.
                    browserForwardVersions =
                        environment.capabilities?.browserForward?.versions.orEmpty(),
                    sshEnvironmentsVersions =
                        environment.capabilities?.sshEnvironments?.versions.orEmpty(),
                    certFingerprint = pin,
                    hostCapabilities = hostCapabilities,
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
        if (fingerprint != null) {
            job.invokeOnCompletion {
                inFlightPairFingerprint.compareAndSet(fingerprint, null)
            }
        }
        jobs.replace(SessionLifecycleJobs.PAIR, job)
    }

    /** Explicit disconnect wins over older operations and completes its durable clear. */
    fun unpair() {
        consent.clearDeferredAutoPair()
        val sessionToken = owner.begin(SessionOperationOwner.Kind.Unpair)
        // Claim durable generation before tear-down so delayed Pair A cannot commit after.
        val durable = credentials.beginDurableOperation(DurableOperationToken.Kind.Unpair)
        owner.bumpSessionGeneration()
        val unpairedEndpoint = state().profile?.httpBaseUrl
        val job = scope.launch {
            clearPendingPairSecret()
            // Unpair clears only the selected host's credentials, so drop only that
            // endpoint's pin; other catalog hosts keep theirs (mirrors
            // HostSessionController.remove addressing pins by profile.httpBaseUrl).
            resolveUnpairedEndpoint(unpairedEndpoint)?.let { TlsCertPinStore.remove(it) }
            onUnpairComplete()
            val (outcome, loaded) = withContext(NonCancellable + ioDispatcher) {
                val cleared = credentials.clear(owning = durable)
                cleared to credentials.loadOutcome()
            }
            if (!owner.isCurrent(sessionToken)) return@launch
            publishUnpairResult(outcome, loaded, credentials, updateState, setAccessToken)
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
        val nextPhase = PairingFailurePhaseMapper.mapPairingFailurePhase(previousPhase, hasCredential)
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

    /**
     * Endpoint whose pin [unpair] drops: the installed profile first, then the durable
     * store for a selected host whose profile was never installed. Both removal sites
     * address pins by `profile.httpBaseUrl`; [TlsCertPinStore] normalizes each to the
     * shared `host:port` key.
     */
    private suspend fun resolveUnpairedEndpoint(fromState: String?): String? {
        if (fromState != null) return fromState
        return runCatching {
            (credentials.loadOutcome() as? SessionCredentialLoadOutcome.Loaded)
                ?.credentials?.profile?.httpBaseUrl
        }.getOrNull()
    }

    companion object {
        const val NO_KNOWN_SCOPES_MESSAGE =
            "This server did not advertise any supported remote-access scopes."

        /** Generated pairing machine (V5 5.2) + [PairingFailurePhaseMapper] adapter. */
        fun mapPairingFailurePhase(
            previousPhase: AppSession.Phase,
            hasRetainedCredential: Boolean,
        ): AppSession.Phase =
            PairingFailurePhaseMapper.mapPairingFailurePhase(previousPhase, hasRetainedCredential)
    }
}
