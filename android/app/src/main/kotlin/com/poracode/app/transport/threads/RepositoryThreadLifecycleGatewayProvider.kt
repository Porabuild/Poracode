package com.poracode.app.transport.threads

import com.poracode.app.session.threads.ThreadHostLease
import com.poracode.app.storage.MultiHostCredentialRepository
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext

/** Resolves the exact host vault for each operation and never retains a bearer token. */
class RepositoryThreadLifecycleGatewayProvider(
    private val repository: MultiHostCredentialRepository,
    private val factory: ThreadLifecycleRemoteGatewayFactory,
    private val ioDispatcher: CoroutineDispatcher,
) : ThreadLifecycleRemoteGatewayProvider {
    override suspend fun gatewayFor(lease: ThreadHostLease): ThreadLifecycleRemoteGateway? {
        val credentials = withContext(ioDispatcher) {
            repository.credentialsFor(lease.connectionId)
        } ?: return null
        if (credentials.profile.protocolVersion != 3) return null
        return factory.create(credentials.profile.httpBaseUrl, credentials.accessToken)
    }
}
