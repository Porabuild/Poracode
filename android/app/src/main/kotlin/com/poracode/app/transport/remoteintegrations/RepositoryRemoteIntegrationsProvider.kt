package com.poracode.app.transport.remoteintegrations

import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.session.remoteintegrations.IntegrationHostLease
import com.poracode.app.storage.MultiHostCredentialRepository
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext

/** Resolves the exact selected host credential for every operation and never caches secrets. */
class RepositoryRemoteIntegrationsProvider(
    private val repository: MultiHostCredentialRepository,
    private val factory: RemoteIntegrationsGatewayFactory,
    private val ioDispatcher: CoroutineDispatcher,
) : RemoteIntegrationsGatewayProvider {
    override suspend fun gatewayFor(lease: IntegrationHostLease): RemoteIntegrationsGateway? {
        if (lease.protocolVersion != ProtocolConstants.REMOTE_PROTOCOL_VERSION) return null
        val credentials = withContext(ioDispatcher) {
            repository.credentialsFor(lease.connectionId)
        } ?: return null
        if (credentials.profile.protocolVersion != ProtocolConstants.REMOTE_PROTOCOL_VERSION) {
            return null
        }
        return factory.create(credentials.profile.httpBaseUrl, credentials.accessToken)
    }
}
