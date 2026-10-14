package com.poracode.app.transport.settingsintegrations

import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.session.settingsintegrations.SettingsIntegrationsLease
import com.poracode.app.storage.MultiHostCredentialRepository
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext

/** Resolves the exact selected host credential for each attempt and never caches it. */
class RepositorySettingsIntegrationsProvider(
    private val repository: MultiHostCredentialRepository,
    private val factory: SettingsIntegrationsRemoteGatewayFactory,
    private val ioDispatcher: CoroutineDispatcher,
) : SettingsIntegrationsRemoteGatewayProvider {
    override suspend fun gatewayFor(
        lease: SettingsIntegrationsLease,
    ): SettingsIntegrationsRemoteGateway? {
        if (lease.protocolVersion != ProtocolConstants.REMOTE_PROTOCOL_VERSION) return null
        val credentials = withContext(ioDispatcher) {
            repository.credentialsFor(lease.connectionId)
        } ?: return null
        if (credentials.profile.protocolVersion != ProtocolConstants.REMOTE_PROTOCOL_VERSION) return null
        return factory.create(credentials.profile.httpBaseUrl, credentials.accessToken)
    }
}
