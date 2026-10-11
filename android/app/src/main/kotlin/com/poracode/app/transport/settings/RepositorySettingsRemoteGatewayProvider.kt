package com.poracode.app.transport.settings

import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.session.settings.SettingsHostLease
import com.poracode.app.storage.MultiHostCredentialRepository
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext

/** Resolves the exact host token on every operation. This provider never caches credentials. */
class RepositorySettingsRemoteGatewayProvider(
    private val repository: MultiHostCredentialRepository,
    private val factory: SettingsRemoteGatewayFactory,
    private val ioDispatcher: CoroutineDispatcher,
) : SettingsRemoteGatewayProvider {
    override suspend fun gatewayFor(lease: SettingsHostLease): SettingsRemoteGateway? {
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
