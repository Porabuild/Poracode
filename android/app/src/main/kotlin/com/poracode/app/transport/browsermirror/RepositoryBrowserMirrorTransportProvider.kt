package com.poracode.app.transport.browsermirror

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.protocol.ProtocolConstants
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
    private data class CacheKey(
        val id: String,
        val endpoint: String,
        val token: String,
        val socket: BrowserMirrorWireSocket,
    )

    private val lock = Any()
    private var cached: Pair<CacheKey, BrowserMirrorHostTransports>? = null

    fun clearCache() {
        synchronized(lock) { cached = null }
    }

    override suspend fun transportsFor(lease: BrowserMirrorHostLease): BrowserMirrorHostTransports? {
        val credentials = withContext(ioDispatcher) {
            repository.credentialsFor(ClientConnectionId(lease.connectionId))
        } ?: return null
        if (credentials.profile.protocolVersion != ProtocolConstants.REMOTE_PROTOCOL_VERSION) return null
        val socket = wireSocketProvider() ?: return null
        val key = CacheKey(lease.connectionId, credentials.profile.httpBaseUrl, credentials.accessToken, socket)
        return synchronized(lock) {
            cached?.takeIf { it.first == key }?.second ?: BrowserMirrorHostTransports(
                BrowserMirrorHttpClient(
                    endpoint = key.endpoint,
                    accessToken = key.token,
                    socket = socket,
                    client = client,
                    networkGate = networkGate,
                ),
            ).also { cached = key to it }
        }
    }
}
