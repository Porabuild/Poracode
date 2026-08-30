package com.poracode.app.transport

import com.poracode.app.session.projects.ProjectHostLease
import com.poracode.app.storage.MultiHostCredentialRepository
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext

/** Resolves credentials by exact connection id for each operation; tokens are never cached here. */
class RepositoryProjectRemoteGatewayProvider(
    private val repository: MultiHostCredentialRepository,
    private val factory: ProjectRemoteGatewayFactory,
    private val ioDispatcher: CoroutineDispatcher,
) : ProjectRemoteGatewayProvider {
    override suspend fun gatewayFor(lease: ProjectHostLease): ProjectRemoteGateway? {
        val credentials = withContext(ioDispatcher) {
            repository.credentialsFor(lease.connectionId)
        } ?: return null
        if (credentials.profile.protocolVersion != 8) return null
        return factory.create(credentials.profile.httpBaseUrl, credentials.accessToken)
    }
}
