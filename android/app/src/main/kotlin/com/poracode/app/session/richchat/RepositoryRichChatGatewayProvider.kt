package com.poracode.app.session.richchat

import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.storage.MultiHostCredentialRepository
import com.poracode.app.transport.ForegroundNetworkGate
import com.poracode.app.transport.RemoteApiClient
import com.poracode.app.transport.richchat.RichChatRemoteClient
import com.poracode.app.transport.terminal.NoOpTerminalTransportObserver
import com.poracode.app.transport.terminal.ProductionTerminalWatchTransport
import com.poracode.app.transport.terminal.TerminalTransportObserver
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import java.util.concurrent.atomic.AtomicReference

/** Resolves credentials by exact host lease and composes only the no-retry production client. */
class RepositoryRichChatGatewayProvider(
    private val repository: MultiHostCredentialRepository,
    private val ioDispatcher: CoroutineDispatcher,
    private val client: OkHttpClient = RemoteApiClient.defaultClient(),
    private val networkGate: ForegroundNetworkGate = ForegroundNetworkGate.shared,
    private val commands: RichThreadCommandTransport? = null,
    private val terminalWatch: RichTerminalWatchTransport? = null,
    private val terminalScope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
) : RichChatGatewayProvider {
    private data class CachedClientKey(
        val hostKey: RichChatHostKey,
        val endpoint: String,
        val token: String,
        val desktopId: String,
    )

    private data class CachedClientEntry(
        val key: CachedClientKey,
        val http: RemoteApiClient,
        val rich: RichChatRemoteClient,
        val advisory: com.poracode.app.transport.richchat.RichChatAdvisoryClient,
    )

    private val terminalObserver = AtomicReference<TerminalTransportObserver>(
        NoOpTerminalTransportObserver,
    )
    private val terminalLock = Any()
    private val clientLock = Any()
    private var cachedClient: CachedClientEntry? = null
    private var productionTerminal: Pair<RichChatHostKey, ProductionTerminalWatchTransport>? = null
    private var foreground = true

    fun setTerminalObserver(observer: TerminalTransportObserver?) {
        terminalObserver.set(observer ?: NoOpTerminalTransportObserver)
    }

    fun clearCaches() {
        synchronized(clientLock) {
            cachedClient?.http?.clearReadCache()
            cachedClient = null
        }
    }

    fun trimMemory() {
        synchronized(clientLock) {
            cachedClient?.http?.clearReadCache()
        }
    }

    fun enterBackground() = synchronized(terminalLock) {
        foreground = false
        productionTerminal?.second?.enterBackground()
    }

    fun enterForeground() = synchronized(terminalLock) {
        foreground = true
        productionTerminal?.second?.enterForeground()
    }

    fun close() {
        clearCaches()
        synchronized(terminalLock) {
            productionTerminal?.second?.close()
            productionTerminal = null
            terminalObserver.set(NoOpTerminalTransportObserver)
        }
    }

    suspend fun advisoryClientFor(lease: RichChatHostLease): com.poracode.app.transport.richchat.RichChatAdvisoryClient? =
        resolveCachedClient(lease)?.advisory

    override suspend fun bundleFor(lease: RichChatHostLease): RichChatGatewayBundle? {
        val entry = resolveCachedClient(lease) ?: return null
        val http = entry.http
        val rich = entry.rich
        return RichChatGatewayBundle(
            core = http,
            rich = rich.transport,
            mutationDelivery = RichChatMutationDelivery.SingleAttempt,
            commands = commands ?: RichThreadCommandTransport { threadId, command ->
                rich.transport.threadCommand(threadId, command)
            },
            terminalWatch = terminalWatch ?: productionTerminalFor(lease, http),
            binary = rich.binary,
            files = com.poracode.app.transport.richchat.RichChatRemoteFileExecutor(http),
        )
    }

    private suspend fun resolveCachedClient(lease: RichChatHostLease): CachedClientEntry? {
        val credentials = withContext(ioDispatcher) {
            repository.credentialsFor(lease.connectionId)
        } ?: return null
        if (credentials.profile.protocolVersion != ProtocolConstants.REMOTE_PROTOCOL_VERSION) return null
        val endpoint = credentials.profile.httpBaseUrl
        val token = credentials.accessToken
        val desktopId = lease.desktopId.ifEmpty { credentials.profile.desktopId }
        val key = CachedClientKey(lease.key, endpoint, token, desktopId)
        return synchronized(clientLock) {
            val existing = cachedClient
            val resolved = if (existing != null && existing.key == key) {
                existing
            } else {
                existing?.http?.clearReadCache()
                val http = RemoteApiClient(
                    endpoint = endpoint,
                    accessToken = token,
                    client = client.newBuilder().retryOnConnectionFailure(false).build(),
                    networkGate = networkGate,
                )
                if (desktopId.isNotEmpty()) http.observeDesktopId(desktopId)
                val rich = RichChatRemoteClient(http)
                val advisory = com.poracode.app.transport.richchat.RichChatAdvisoryClient(http)
                CachedClientEntry(key, http, rich, advisory).also { cachedClient = it }
            }
            resolved.http.declareRuntimeHistoryNotices(lease.noticesSupported)
            resolved.http.declareTerminalCursorSyncV2(lease.terminalCursorSyncV2Supported)
            resolved
        }
    }

    private fun productionTerminalFor(
        lease: RichChatHostLease,
        http: RemoteApiClient,
    ): ProductionTerminalWatchTransport = synchronized(terminalLock) {
        productionTerminal?.takeIf { it.first == lease.key }?.second ?: run {
            productionTerminal?.second?.close()
            ProductionTerminalWatchTransport(
                host = lease.key,
                http = http,
                client = client,
                scope = terminalScope,
                networkGate = networkGate,
                observer = { terminalObserver.get() },
            ).also { transport ->
                if (!foreground) transport.enterBackground()
                productionTerminal = lease.key to transport
            }
        }
    }
}
