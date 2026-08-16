package com.poracode.app.session.richchat

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
    private val terminalObserver = AtomicReference<TerminalTransportObserver>(
        NoOpTerminalTransportObserver,
    )
    private val terminalLock = Any()
    private var productionTerminal: Pair<RichChatHostKey, ProductionTerminalWatchTransport>? = null
    private var foreground = true

    fun setTerminalObserver(observer: TerminalTransportObserver?) {
        terminalObserver.set(observer ?: NoOpTerminalTransportObserver)
    }

    fun enterBackground() = synchronized(terminalLock) {
        foreground = false
        productionTerminal?.second?.enterBackground()
    }

    fun enterForeground() = synchronized(terminalLock) {
        foreground = true
        productionTerminal?.second?.enterForeground()
    }

    fun close() = synchronized(terminalLock) {
        productionTerminal?.second?.close()
        productionTerminal = null
        terminalObserver.set(NoOpTerminalTransportObserver)
    }

    override suspend fun bundleFor(lease: RichChatHostLease): RichChatGatewayBundle? {
        val credentials = withContext(ioDispatcher) {
            repository.credentialsFor(lease.connectionId)
        } ?: return null
        if (credentials.profile.protocolVersion != 3) return null
        val endpoint = credentials.profile.httpBaseUrl
        val token = credentials.accessToken
        val http = RemoteApiClient(
            endpoint = endpoint,
            accessToken = token,
            client = client.newBuilder().retryOnConnectionFailure(false).build(),
            networkGate = networkGate,
        )
        val rich = RichChatRemoteClient(
            endpoint = endpoint,
            accessToken = token,
            client = client,
            networkGate = networkGate,
        )
        return RichChatGatewayBundle(
            core = http,
            rich = rich.transport,
            mutationDelivery = RichChatMutationDelivery.SingleAttempt,
            commands = commands ?: RichThreadCommandTransport { threadId, command ->
                rich.transport.threadCommand(threadId, command)
            },
            terminalWatch = terminalWatch ?: productionTerminalFor(lease, http),
            binary = rich.binary,
        )
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
