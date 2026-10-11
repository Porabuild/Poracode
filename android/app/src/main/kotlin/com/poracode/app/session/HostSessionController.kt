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
import com.poracode.app.transport.TlsCertPinStore
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

/**
 * Legacy **direct** stores may hold several rows per endpoint; show one, most
 * recent first. Environment records are never compacted or hidden: two
 * different environment grants may normalize to one endpoint (A4), and the
 * fail-closed conflict is surfaced rather than one row silently disappearing.
 */
internal fun compactHostsByEndpoint(snapshot: HostCatalogSnapshot): HostCatalogSnapshot {
    val directEndpoints = snapshot.hosts.filter { it.environment == null }
        .map { it.httpBaseUrl }
    if (directEndpoints.distinct().size == directEndpoints.size) return snapshot
    val byId = snapshot.hosts.associateBy { it.connectionId }
    val ordered = snapshot.lru.mapNotNull(byId::get) +
        snapshot.hosts.filter { it.connectionId !in snapshot.lru }
    val seen = mutableSetOf<String>()
    val hosts = ordered.filter { host -> host.environment != null || seen.add(host.httpBaseUrl) }
    val ids = hosts.mapTo(mutableSetOf()) { it.connectionId }
    return HostCatalogSnapshot(
        snapshot.document.copy(
            hosts = hosts,
            lru = snapshot.lru.filter { it in ids },
        ),
        snapshot.registryExists,
        snapshot.revision,
    )
}

/**
 * Presents environment records with the endpoint derived from the **current**
 * parent record (residual 2). The stored URL on an environment record is only a
 * pairing-time snapshot. A missing/nested parent keeps the record visible with
 * its stored endpoint; every credential and authority read still fails closed
 * before any fetch, and no stale URL is ever dialed in its place.
 */
internal fun deriveEnvironmentEndpoints(snapshot: HostCatalogSnapshot): HostCatalogSnapshot {
    if (snapshot.hosts.none { it.environment != null }) return snapshot
    val byId = snapshot.hosts.associateBy { it.connectionId }
    val hosts = snapshot.hosts.map { host ->
        val reference = host.environment ?: return@map host
        val parent = byId[reference.parentConnectionId] ?: return@map host
        if (parent.environment != null) return@map host
        val endpoint = com.poracode.app.model.EnvironmentEndpoints
            .proxyEndpoint(parent, reference.environmentId) ?: return@map host
        val wsEndpoint = com.poracode.app.protocol.PairingUrl.toWebSocketBaseUrl(endpoint)
        if (host.httpBaseUrl == endpoint && host.wsBaseUrl == wsEndpoint) {
            host
        } else {
            host.copy(httpBaseUrl = endpoint, wsBaseUrl = wsEndpoint)
        }
    }
    return if (hosts == snapshot.hosts) {
        snapshot
    } else {
        snapshot.copy(document = snapshot.document.copy(hosts = hosts))
    }
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
    private val capabilityRefresh = this.repository?.let {
        HostCapabilityRefresh(it, apiFactory, ioDispatcher, isForeground, hasEndpointPermission)
    }

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
        // The environment endpoint is derived from the current parent, so a
        // parent re-pair/base-URL/port change moves this record's endpoint. Drop
        // the warm socket for the old endpoint before installing the new client:
        // the reconnect never reuses a client pointed at the old authority.
        val installed = state().profile
        if (installed != null && installed.httpBaseUrl != credentials.profile.httpBaseUrl) {
            pool.forget(SessionPoolKey.Host(selected.connectionId))
        }
        installSelected(credentials)
        warmSecondary(snapshot)
        refreshHostSnapshots(snapshot)
        refreshSelectedCapabilities()
    }

    /**
     * C1 capability freshness on connect: observes the live descriptor and
     * persists missing/additional capabilities through an identity-fenced
     * metadata mutation. A failed fetch changes nothing.
     */
    suspend fun refreshSelectedCapabilities() {
        val refresher = capabilityRefresh ?: return
        val store = this.repository ?: return
        val snapshot = readCatalog() ?: return
        val selected = snapshot.selected ?: return
        val credentials = withContext(ioDispatcher) {
            store.credentialsFor(selected.connectionId)
        } ?: return
        if (!refresher.refresh(selected.connectionId, credentials)) return
        publish(readCatalog() ?: return)
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
                refreshSelectedCapabilities()
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
                    ?.let { credentials ->
                        // Environment records share the parent endpoint's host:port:
                        // their removal must never drop the parent's pin. The parent
                        // cascade removes the pin through the parent record itself.
                        if (credentials.profile.environment == null) {
                            TlsCertPinStore.remove(credentials.profile.httpBaseUrl)
                        }
                        beforeRemove(connectionId, credentials)
                    }
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
        // Resume from the seq the previous secondary socket had applied; a
        // fresh start at 0 makes the server replay its whole history to a
        // listener that discards everything (WS7 finding 6).
        socket.start(pool.cachedLastSeenSeq(key) ?: 0)
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
        val canonical = compactHostsByEndpoint(deriveEnvironmentEndpoints(snapshot))
        val retained = canonical.hosts.mapTo(mutableSetOf()) { it.connectionId }
        for (host in canonical.hosts) {
            // Pins are owned by the direct parent record: an environment record
            // resolves the same host:port, so re-registering its (possibly stale)
            // copy could evict the live parent pin. Parent endpoint TLS pin only.
            if (host.environment == null) {
                TlsCertPinStore.register(host.httpBaseUrl, host.certFingerprint)
            }
        }
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
