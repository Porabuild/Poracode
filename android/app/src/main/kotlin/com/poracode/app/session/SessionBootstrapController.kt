package com.poracode.app.session

import com.poracode.app.model.RemoteClientException
import com.poracode.app.storage.MultiHostCredentialRepository
import com.poracode.app.storage.StoredProtocolUpgrade
import com.poracode.app.transport.RemoteApiGatewayFactory
import com.poracode.app.protocol.RemoteAccessScopes
import com.poracode.app.storage.SessionCredentialLoadOutcome
import com.poracode.app.storage.SessionCredentialRepository
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Owns durable-session bootstrap attempts and suppresses stale completion. */
internal class SessionBootstrapController(
    private val credentials: SessionCredentialRepository,
    private val scope: CoroutineScope,
    private val jobs: SessionLifecycleJobs,
    private val owner: SessionOperationOwner,
    private val hosts: HostSessionController,
    private val live: LiveConnectionController,
    private val ioDispatcher: CoroutineDispatcher,
    private val apiFactory: RemoteApiGatewayFactory,
    private val hasEndpointPermission: (String) -> Boolean,
    private val updateState: ((AppSession.UiState) -> AppSession.UiState) -> Unit,
) {
    private val attempt = AtomicInteger(0)

    fun start() {
        val attemptAtStart = attempt.incrementAndGet()
        val job = scope.launch {
            val token = owner.begin(SessionOperationOwner.Kind.Bootstrap)
            updateState { it.copy(phase = AppSession.Phase.Launching) }
            val outcome = try {
                withContext(ioDispatcher) { credentials.loadOutcome() }
            } catch (error: CancellationException) {
                if (attempt.get() != attemptAtStart) throw error
                throw error
            } catch (_: Exception) {
                if (!owner.isCurrent(token)) return@launch
                updateState { it.copy(phase = AppSession.Phase.LocalStoreInconsistent) }
                return@launch
            }
            if (!owner.isCurrent(token)) return@launch
            try {
                hosts.refreshCatalog()
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                if (!owner.isCurrent(token)) return@launch
                updateState { it.copy(phase = AppSession.Phase.LocalStoreInconsistent) }
                return@launch
            }
            if (!owner.isCurrent(token)) return@launch
            when (outcome) {
                SessionCredentialLoadOutcome.Empty ->
                    updateState { it.copy(phase = AppSession.Phase.NeedsPairing) }

                is SessionCredentialLoadOutcome.Loaded -> {
                    val loaded = outcome.credentials
                    live.accessToken = loaded.accessToken
                    updateState {
                        it.copy(
                            profile = loaded.profile,
                            phase = AppSession.Phase.ReconnectingStored,
                            canSessionRead = RemoteAccessScopes.canRead(loaded.profile.scopes),
                            canSessionOperate = RemoteAccessScopes.canOperate(loaded.profile.scopes),
                        )
                    }
                    if (!owner.isCurrent(token)) return@launch
                    if (!hasEndpointPermission(loaded.profile.httpBaseUrl)) {
                        updateState {
                            it.copy(phase = AppSession.Phase.LocalNetworkPermissionRequired)
                        }
                        return@launch
                    }
                    live.connectWithStoredSession(loaded.profile, loaded.accessToken)
                }

                is SessionCredentialLoadOutcome.Rejected.ProtocolMismatch -> {
                    val stored = outcome.credentials
                    updateState {
                        it.copy(
                            profile = stored.profile,
                            phase = AppSession.Phase.ProtocolIncompatible,
                            canSessionRead = false,
                            canSessionOperate = false,
                        )
                    }
                    val repository = credentials as? MultiHostCredentialRepository ?: return@launch
                    if (!StoredProtocolUpgrade.isEligibleStoredProtocol(stored.profile.protocolVersion)) return@launch
                    if (!hasEndpointPermission(stored.profile.httpBaseUrl)) {
                        updateState { it.copy(phase = AppSession.Phase.LocalNetworkPermissionRequired) }
                        return@launch
                    }
                    updateState { it.copy(phase = AppSession.Phase.ReconnectingStored) }
                    try {
                        val upgraded = upgradeStoredPairing(
                            repository, stored, apiFactory, ioDispatcher,
                            isCurrent = { owner.isCurrent(token) },
                        ) ?: return@launch
                        if (!owner.isCurrent(token)) return@launch
                        hosts.refreshCatalog()
                        if (!owner.isCurrent(token)) return@launch
                        live.accessToken = upgraded.accessToken
                        live.connectWithStoredSession(upgraded.profile, upgraded.accessToken)
                    } catch (error: CancellationException) {
                        throw error
                    } catch (error: Exception) {
                        if (!owner.isCurrent(token)) return@launch
                        val phase = when {
                            error is StoredPairingUpgradePersistenceFailure ->
                                AppSession.Phase.LocalStoreInconsistent
                            error is RemoteClientException && error.isUnauthorized ->
                                AppSession.Phase.SessionExpired
                            error is RemoteClientException && error.code == "protocol_version_mismatch" ->
                                AppSession.Phase.ProtocolIncompatible
                            else -> AppSession.Phase.ReconnectingStored
                        }
                        updateState { it.copy(phase = phase, globalError = error.message) }
                    }
                }

                SessionCredentialLoadOutcome.Rejected.FutureDocument,
                SessionCredentialLoadOutcome.Rejected.Corrupt,
                SessionCredentialLoadOutcome.Rejected.CiphertextMismatch,
                SessionCredentialLoadOutcome.Rejected.LegacyInconsistent,
                SessionCredentialLoadOutcome.Rejected.LocalStoreInconsistent,
                -> updateState { it.copy(phase = AppSession.Phase.LocalStoreInconsistent) }
            }
        }
        jobs.replace(SessionLifecycleJobs.BOOTSTRAP, job)
    }

    internal fun resetForTests() {
        attempt.set(0)
    }

    internal fun hasStartedForTests(): Boolean = attempt.get() > 0

    internal fun attemptForTests(): Int = attempt.get()
}
