package com.poracode.app.transport.browsermirror

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.session.browsermirror.BrowserMirrorHostLease
import com.poracode.app.storage.MultiHostCredentialRepository
import com.poracode.app.transport.ForegroundNetworkGate
import com.poracode.app.transport.RemoteApiClient
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient

/**
 * Resolves credentials for the exact selected [BrowserMirrorHostLease.connectionId] for
 * every operation and composes the no-retry [BrowserMirrorHttpClient] bound to the shared
 * live socket. Tokens are never cached here; a stale selection returns null so the gateway
 * reports `stale_lease` rather than operating against the wrong host.
 */
class RepositoryBrowserMirrorTransportProvider(
    private val repository: MultiHostCredentialRepository,
    private val ioDispatcher: CoroutineDispatcher,
    private val wireSocketProvider: () -> BrowserMirrorWireSocket?,
    private val client: OkHttpClient = RemoteApiClient.defaultClient(),
    private val networkGate: ForegroundNetworkGate = ForegroundNetworkGate.shared,
) : BrowserMirrorTransportProvider {
    override suspend fun transportsFor(lease: BrowserMirrorHostLease): BrowserMirrorHostTransports? {
        val credentials = withContext(ioDispatcher) {
            repository.credentialsFor(ClientConnectionId(lease.connectionId))
        } ?: return null
        if (credentials.profile.protocolVersion != 3) return null
        val socket = wireSocketProvider() ?: return null
        val http = BrowserMirrorHttpClient(
            endpoint = credentials.profile.httpBaseUrl,
            accessToken = credentials.accessToken,
            socket = socket,
            client = client,
            networkGate = networkGate,
        )
        return BrowserMirrorHostTransports(http)
    }
}
