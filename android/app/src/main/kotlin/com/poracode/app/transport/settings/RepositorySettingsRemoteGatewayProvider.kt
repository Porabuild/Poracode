package com.poracode.app.transport.settings

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.session.settings.SettingsHostLease
import com.poracode.app.storage.MultiHostCredentialRepository
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext

/** Resolves the exact host token and caches the gateway per `(connectionId, endpoint, token)`. */
class RepositorySettingsRemoteGatewayProvider(
    private val repository: MultiHostCredentialRepository,
    private val factory: SettingsRemoteGatewayFactory,
    private val ioDispatcher: CoroutineDispatcher,
) : SettingsRemoteGatewayProvider {
    private data class CacheKey(val id: ClientConnectionId, val endpoint: String, val token: String)
    private val lock = Any()
    private var cached: Pair<CacheKey, SettingsRemoteGateway>? = null

    fun clearCache() {
        synchronized(lock) { cached = null }
    }

    override suspend fun gatewayFor(lease: SettingsHostLease): SettingsRemoteGateway? {
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
