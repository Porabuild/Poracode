package com.poracode.app.session

import com.poracode.app.model.RemoteClientException
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.protocol.RemoteAccessScopes
import com.poracode.app.storage.HostMutationResult
import com.poracode.app.storage.HostOperationKind
import com.poracode.app.storage.MultiHostCredentialRepository
import com.poracode.app.storage.SessionCredentials
import com.poracode.app.transport.RemoteApiGatewayFactory
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext

internal class StoredPairingUpgradePersistenceFailure(cause: Exception) : Exception(cause.message, cause)

/** Verifies network compatibility and bearer access before a journaled binding update. */
internal suspend fun upgradeStoredPairing(
    repository: MultiHostCredentialRepository,
    stored: SessionCredentials,
    apiFactory: RemoteApiGatewayFactory,
    ioDispatcher: CoroutineDispatcher,
    isCurrent: () -> Boolean,
): SessionCredentials? {
    val receipt = repository.beginHostOperation(HostOperationKind.Add)
    val client = apiFactory.create(stored.profile.httpBaseUrl, stored.accessToken)
    val environment = withContext(ioDispatcher) { client.environment() }
    currentCoroutineContext().ensureActive()
    if (!isCurrent()) return null
    if (environment.protocolVersion != ProtocolConstants.REMOTE_PROTOCOL_VERSION ||
        environment.desktopId != stored.profile.desktopId ||
        !RemoteAccessScopes.canRead(stored.profile.scopes)
    ) throw RemoteClientException.protocolMismatch(environment.protocolVersion)
    // Discovery is public. A protected read must succeed before old credentials are rebound.
    withContext(ioDispatcher) { client.snapshot() }
    currentCoroutineContext().ensureActive()
    if (!isCurrent()) return null
    val result = try {
        withContext(ioDispatcher) { repository.upgradeProtocol(stored, receipt) }
    } catch (error: CancellationException) {
        throw error
    } catch (error: Exception) {
        throw StoredPairingUpgradePersistenceFailure(error)
    }
    currentCoroutineContext().ensureActive()
    if (!isCurrent() || result != HostMutationResult.Applied) return null
    return stored.copy(
        profile = stored.profile.copy(
            protocolVersion = ProtocolConstants.REMOTE_PROTOCOL_VERSION,
            browserForwardVersions = emptyList(),
        ),
    )
}
