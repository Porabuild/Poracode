package com.poracode.app.session

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.HostCatalogSnapshot
import com.poracode.app.model.HostRecord
import com.poracode.app.model.RemoteWebSocketServerMessage
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.storage.HostMutationResult
import com.poracode.app.storage.HostOperationKind
import com.poracode.app.storage.MultiHostCredentialRepository
import com.poracode.app.storage.SessionCredentialRepository
import com.poracode.app.storage.SessionCredentials
import com.poracode.app.transport.RemoteApiGatewayFactory
import com.poracode.app.transport.RemoteEventSocketFactory
import com.poracode.app.transport.RemoteEventSocket
import com.poracode.app.transport.RemoteWebSocketClient
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class HostUiCatalog(
    val hosts: List<HostRecord> = emptyList(),
    val selectedConnectionId: ClientConnectionId? = null,
    val lru: List<ClientConnectionId> = emptyList(),
    val connectionStates: Map<ClientConnectionId, RemoteWebSocketClient.ConnectionState> =
        emptyMap(),
)

/** Legacy stores may hold several rows per endpoint; show one, most recent first. */
internal fun compactHostsByEndpoint(snapshot: HostCatalogSnapshot): HostCatalogSnapshot {
    if (snapshot.hosts.map { it.httpBaseUrl }.distinct().size == snapshot.hosts.size) {
        return snapshot
    }
    val byId = snapshot.hosts.associateBy { it.connectionId }
    val ordered = snapshot.lru.mapNotNull(byId::get) +
        snapshot.hosts.filter { it.connectionId !in snapshot.lru }
    val seen = mutableSetOf<String>()
    val hosts = ordered.filter { host -> seen.add(host.httpBaseUrl) }
    val ids = hosts.mapTo(mutableSetOf()) { it.connectionId }
    return HostCatalogSnapshot(
        snapshot.document.copy(
            hosts = hosts,
            lru = snapshot.lru.filter { it in ids },
        ),
        snapshot.registryExists,
    )
}

/** Safe host receipt/selection/removal/rename coordinator; all stale generations no-op. */
class HostSessionController(
    repository: SessionCredentialRepository,
    private val scope: CoroutineScope,
    private val ioDispatcher: CoroutineDispatcher,
    private val owner: SessionOperationOwner,
    private val pool: SessionPool,
    private val apiFactory: RemoteApiGatewayFactory,
    private val socketFactory: RemoteEventSocketFactory,
    private val isForeground: () -> Boolean,
    private val hasEndpointPermission: (String) -> Boolean,
    private val state: () -> AppSession.UiState,
    private val updateState: ((AppSession.UiState) -> AppSession.UiState) -> Unit,
    private val installSelected: suspend (SessionCredentials) -> Unit,
    private val installEmpty: () -> Unit,
    private val beforeRemove: suspend (ClientConnectionId, SessionCredentials) -> Unit = { _, _ -> },
) {
    private val repository = repository as? MultiHostCredentialRepository

    suspend fun refreshCatalog(): HostCatalogSnapshot? {
        val snapshot = readCatalog() ?: return null
        publish(snapshot)
        return snapshot
    }

    suspend fun reconcileSelected() {
        val repository = repository ?: return
        val snapshot = refreshCatalog() ?: return
        val selected = snapshot.selected ?: return
        val credentials = withContext(ioDispatcher) {
            repository.credentialsFor(selected.connectionId)
        } ?: return surfaceStoreError()
        installSelected(credentials)
        warmSecondary(snapshot)
        refreshHostSnapshots(snapshot)
    }

    fun select(connectionId: ClientConnectionId) {
        val repository = repository ?: return
        if (state().hostCatalog.selectedConnectionId == connectionId) return
        val operation = owner.begin(SessionOperationOwner.Kind.HostSwap)
        val receipt = repository.beginHostOperation(HostOperationKind.Select)
        scope.launch {
            try {
                val result = withContext(ioDispatcher) {
                    repository.selectHost(connectionId, receipt)
                }
                if (!result.didApply || !owner.isCurrent(operation)) return@launch
                val snapshot = readCatalog() ?: return@launch
                if (snapshot.selectedConnectionId != connectionId) return@launch
                val credentials = withContext(ioDispatcher) {
                    repository.credentialsFor(connectionId)
                } ?: return@launch surfaceStoreError()
                if (!owner.isCurrent(operation)) return@launch
                pool.forget(SessionPoolKey.Host(connectionId))
                // Publish the new owner only after its credentials are ready. The
                // synchronous install immediately clears the old selected snapshot.
                publish(snapshot)
                installSelected(credentials)
                warmSecondary(snapshot)
                refreshHostSnapshots(snapshot)
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                if (owner.isCurrent(operation)) surfaceStoreError()
            }
        }
    }

    fun remove(connectionId: ClientConnectionId) {
        val repository = repository ?: return
        val selectedAtReceipt = state().hostCatalog.selectedConnectionId
        val operation = owner.begin(SessionOperationOwner.Kind.HostSwap)
        val receipt = repository.beginHostOperation(HostOperationKind.Remove)
        scope.launch {
            try {
                withContext(ioDispatcher) { repository.credentialsFor(connectionId) }
                    ?.let { credentials -> beforeRemove(connectionId, credentials) }
                val result = withContext(ioDispatcher) {
                    repository.removeHost(connectionId, receipt)
                }
                if (!result.didApply || !owner.isCurrent(operation)) return@launch
                pool.forget(SessionPoolKey.Host(connectionId))
                val snapshot = readCatalog() ?: return@launch
                val selected = snapshot.selected ?: run {
                    publish(snapshot)
                    installEmpty()
                    return@launch
                }
                if (snapshot.selectedConnectionId == selectedAtReceipt) {
                    publish(snapshot)
                    warmSecondary(snapshot)
                    return@launch
                }
                val credentials = withContext(ioDispatcher) {
                    repository.credentialsFor(selected.connectionId)
                } ?: return@launch surfaceStoreError()
                if (!owner.isCurrent(operation)) return@launch
                publish(snapshot)
                installSelected(credentials)
                warmSecondary(snapshot)
                refreshHostSnapshots(snapshot)
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                if (owner.isCurrent(operation)) surfaceStoreError()
            }
        }
    }

    fun rename(connectionId: ClientConnectionId, label: String) {
        val repository = repository ?: return
        val normalized = label.trim()
        if (normalized.isEmpty() || normalized.length > 80) return
        if (state().hostCatalog.hosts.none { it.connectionId == connectionId }) return
        val receipt = repository.beginHostOperation(HostOperationKind.Rename)
        scope.launch {
            val result = runCatching {
                withContext(ioDispatcher) {
                    repository.renameHost(connectionId, normalized, receipt)
                }
            }.getOrElse {
                surfaceStoreError()
                return@launch
            }
            if (!result.didApply) return@launch
            val snapshot = runCatching { readCatalog() }.getOrElse {
                surfaceStoreError()
                return@launch
            }
            val renamed = snapshot?.document?.host(connectionId) ?: return@launch
            updateState { current ->
                val hosts = current.hostCatalog.hosts.map { host ->
                    if (host.connectionId == connectionId) renamed else host
                }
                current.copy(
                    hostCatalog = current.hostCatalog.copy(hosts = hosts),
                    profile = if (current.hostCatalog.selectedConnectionId == connectionId) {
                        current.profile?.copy(label = renamed.label)
                    } else {
                        current.profile
                    },
                )
            }
        }
    }

    suspend fun warmSecondary(snapshot: HostCatalogSnapshot? = null) {
        val repository = repository ?: return
        if (!isForeground()) return
        val current = snapshot ?: refreshCatalog() ?: return
        val secondaryId = current.document.secondaryLru ?: return
        val secondary = current.document.host(secondaryId) ?: return
        if (secondary.protocolVersion != ProtocolConstants.REMOTE_PROTOCOL_VERSION) return
        if (!hasEndpointPermission(secondary.httpBaseUrl)) return
        val key = SessionPoolKey.Host(secondaryId)
        if (pool.liveKeys().contains(key)) return
        val credentials = withContext(ioDispatcher) { repository.credentialsFor(secondaryId) }
            ?: return
        val api = apiFactory.create(credentials.profile.httpBaseUrl, credentials.accessToken)
        val socket = socketFactory.create(api)
        val lease = pool.install(key, socket) ?: run {
            socket.destroy()
            return
        }
        if (!pool.isValid(lease) || !isForeground()) {
            pool.forget(key)
            return
        }
        socket.setListener(SecondaryHostListener(secondaryId, lease))
        socket.start(pool.cache(key).lastSeenSeq ?: 0)
    }

    /** Fetches non-selected host snapshots without opening extra live sockets. */
    suspend fun refreshHostSnapshots(snapshot: HostCatalogSnapshot? = null) {
        val repository = repository ?: return
        if (!isForeground()) return
        val current = snapshot ?: refreshCatalog() ?: return
        current.hosts
            .filter { it.connectionId != current.selectedConnectionId }
            .filter { it.protocolVersion == ProtocolConstants.REMOTE_PROTOCOL_VERSION }
            .filter { hasEndpointPermission(it.httpBaseUrl) }
            .filter { "session:read" in it.scopes }
            .forEach { host ->
                val credentials = withContext(ioDispatcher) {
                    repository.credentialsFor(host.connectionId)
                } ?: return@forEach
                val remoteSnapshot = runCatching {
                    withContext(ioDispatcher) {
                        apiFactory.create(
                            credentials.profile.httpBaseUrl,
                            credentials.accessToken,
                        ).snapshot()
                    }
                }.getOrNull() ?: return@forEach
                updateState { currentState ->
                    if (currentState.hostCatalog.hosts.none {
                            it.connectionId == host.connectionId
                        }
                    ) {
                        currentState
                    } else {
                        currentState.copy(
                            hostSnapshots = currentState.hostSnapshots +
                                (host.connectionId to remoteSnapshot),
                        )
                    }
                }
                val key = SessionPoolKey.Host(host.connectionId)
                pool.updateCache(key, pool.cache(key).copy(snapshot = remoteSnapshot))
            }
    }

    fun onBackground() {
        updateState { current ->
            current.copy(
                hostCatalog = current.hostCatalog.copy(connectionStates = emptyMap()),
            )
        }
        pool.onBackground()
    }

    fun onForeground() {
        state().hostCatalog.hosts
            .filterNot { hasEndpointPermission(it.httpBaseUrl) }
            .forEach { pool.forget(SessionPoolKey.Host(it.connectionId)) }
        pool.onForeground()
        scope.launch {
            warmSecondary()
            refreshHostSnapshots()
        }
    }

    private suspend fun readCatalog(): HostCatalogSnapshot? =
        repository?.let { withContext(ioDispatcher) { it.catalogSnapshot() } }

    private fun publish(snapshot: HostCatalogSnapshot) {
        pool.updatePolicy(snapshot.selectedConnectionId, snapshot.lru)
        val canonical = compactHostsByEndpoint(snapshot)
        val retained = canonical.hosts.mapTo(mutableSetOf()) { it.connectionId }
        updateState {
            it.copy(
                hostCatalog = HostUiCatalog(
                    hosts = canonical.hosts,
                    selectedConnectionId = canonical.selectedConnectionId,
                    lru = canonical.lru,
                    connectionStates = it.hostCatalog.connectionStates.filterKeys { id ->
                        id == canonical.document.secondaryLru
                    },
                ),
                hostSnapshots = it.hostSnapshots.filterKeys(retained::contains),
            )
        }
    }

    private fun surfaceStoreError() {
        updateState { it.copy(phase = AppSession.Phase.LocalStoreInconsistent) }
    }

    private inner class SecondaryHostListener(
        private val connectionId: ClientConnectionId,
        private val lease: SessionLease,
    ) : RemoteEventSocket.Listener {
        override fun onStateChanged(
            state: RemoteWebSocketClient.ConnectionState,
            detail: String?,
        ) {
            if (!pool.isValid(lease)) return
            updateState { current ->
                if (current.hostCatalog.hosts.none { it.connectionId == connectionId }) current
                else current.copy(
                    hostCatalog = current.hostCatalog.copy(
                        connectionStates = current.hostCatalog.connectionStates +
                            (connectionId to state),
                    ),
                )
            }
        }

        override fun onMessage(message: RemoteWebSocketServerMessage) = Unit
        override fun onResyncRequired(reason: String) = Unit

        override fun onSessionExpired(reason: String) {
            onStateChanged(RemoteWebSocketClient.ConnectionState.SessionExpired, reason)
        }
    }
}
