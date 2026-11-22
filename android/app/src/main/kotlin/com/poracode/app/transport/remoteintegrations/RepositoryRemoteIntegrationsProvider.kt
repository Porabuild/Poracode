package com.poracode.app.transport.remoteintegrations

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.session.remoteintegrations.IntegrationHostLease
import com.poracode.app.storage.MultiHostCredentialRepository
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext

/** Resolves the exact selected host credential and caches the gateway per `(connectionId, endpoint, token)`. */
class RepositoryRemoteIntegrationsProvider(
    private val repository: MultiHostCredentialRepository,
    private val factory: RemoteIntegrationsGatewayFactory,
    private val ioDispatcher: CoroutineDispatcher,
) : RemoteIntegrationsGatewayProvider {
    private data class CacheKey(val id: ClientConnectionId, val endpoint: String, val token: String)
    private val lock = Any()
    private var cached: Pair<CacheKey, RemoteIntegrationsGateway>? = null

    fun clearCache() {
        synchronized(lock) { cached = null }
    }

    override suspend fun gatewayFor(lease: IntegrationHostLease): RemoteIntegrationsGateway? {
        if (lease.protocolVersion != ProtocolConstants.REMOTE_PROTOCOL_VERSION) return null
        val credentials = withContext(ioDispatcher) {
            repository.credentialsFor(lease.connectionId)
        } ?: return null
        if (credentials.profile.protocolVersion != ProtocolConstants.REMOTE_PROTOCOL_VERSION) {
            return null
        }
        val key = CacheKey(lease.connectionId, credentials.profile.httpBaseUrl, credentials.accessToken)
        return synchronized(lock) {
            cached?.takeIf { it.first == key }?.second
                ?: factory.create(key.endpoint, key.token).also { cached = key to it }
        }
    }
}
