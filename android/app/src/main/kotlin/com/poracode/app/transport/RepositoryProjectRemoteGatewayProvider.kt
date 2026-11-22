package com.poracode.app.transport

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.session.projects.ProjectHostLease
import com.poracode.app.storage.MultiHostCredentialRepository
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext

/** Resolves credentials by exact connection id and caches gateways per `(connectionId, endpoint, token)`. */
class RepositoryProjectRemoteGatewayProvider(
    private val repository: MultiHostCredentialRepository,
    private val factory: ProjectRemoteGatewayFactory,
    private val ioDispatcher: CoroutineDispatcher,
) : ProjectRemoteGatewayProvider {
    private data class CacheKey(val id: ClientConnectionId, val endpoint: String, val token: String)
    private val lock = Any()
    private var cached: Pair<CacheKey, ProjectRemoteGateway>? = null

    fun clearCache() {
        synchronized(lock) { cached = null }
    }

    override suspend fun gatewayFor(lease: ProjectHostLease): ProjectRemoteGateway? {
        val credentials = withContext(ioDispatcher) {
            repository.credentialsFor(lease.connectionId)
        } ?: return null
        if (credentials.profile.protocolVersion != ProtocolConstants.REMOTE_PROTOCOL_VERSION) return null
        val key = CacheKey(lease.connectionId, credentials.profile.httpBaseUrl, credentials.accessToken)
        return synchronized(lock) {
            cached?.takeIf { it.first == key }?.second
                ?: factory.create(key.endpoint, key.token).also { cached = key to it }
        }
    }
}
