package com.poracode.app.session

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.HostCatalogSnapshot
import com.poracode.app.model.RemoteWebSocketServerMessage
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.storage.HostOperationKind
import com.poracode.app.storage.MultiHostCredentialRepository
import com.poracode.app.storage.SessionCredentialRepository
import com.poracode.app.storage.SessionCredentials
import com.poracode.app.transport.RemoteApiGatewayFactory
import com.poracode.app.transport.RemoteEventSocket
import com.poracode.app.transport.RemoteEventSocketFactory
import com.poracode.app.transport.RemoteWebSocketClient
import com.poracode.app.transport.TlsCertPinStore
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

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
    private val offlineLock = Any()
    /** Secondary host states preserved across background/foreground until Online. */
    private val offlineBeforeSuspend =
        mutableMapOf<ClientConnectionId, RemoteWebSocketClient.ConnectionState>()
    private val capabilityRefresh = this.repository?.let {
        HostCapabilityRefresh(it, apiFactory, ioDispatcher, isForeground, hasEndpointPermission)
    }
    private val peerSnapshots = this.repository?.let {
        HostPeerSnapshotRefresher(
            repository = it,
            scope = scope,
            ioDispatcher = ioDispatcher,
            pool = pool,
            apiFactory = apiFactory,
            isForeground = isForeground,
            hasEndpointPermission = hasEndpointPermission,
            refreshCatalog = ::refreshCatalog,
            updateState = updateState,
        )
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
        scope.launch { refreshHostSnapshots(snapshot) }
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
                synchronized(offlineLock) { offlineBeforeSuspend.remove(connectionId) }
                pool.forget(SessionPoolKey.Host(connectionId))
                // Publish the new owner only after its credentials are ready. The
                // synchronous install immediately clears the old selected snapshot.
                publish(snapshot)
                installSelected(credentials)
                warmSecondary(snapshot)
                scope.launch { refreshHostSnapshots(snapshot) }
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
                peerSnapshots?.cancel(connectionId)
                synchronized(offlineLock) { offlineBeforeSuspend.remove(connectionId) }
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
                scope.launch { refreshHostSnapshots(snapshot) }
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
        val secondaryId = secondaryLruId(current.selectedConnectionId, current.lru) ?: return
        val secondary = current.document.host(secondaryId) ?: return
        if (secondary.protocolVersion != ProtocolConstants.REMOTE_PROTOCOL_VERSION ||
            !hasEndpointPermission(secondary.httpBaseUrl)
        ) {
            clearRestoredSecondaryState(secondaryId)
            return
        }
        val key = SessionPoolKey.Host(secondaryId)
        if (pool.liveKeys().contains(key)) return
        val credentials = withContext(ioDispatcher) { repository.credentialsFor(secondaryId) }
            ?: return clearRestoredSecondaryState(secondaryId)
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
        // listener that discards everything (WS7 finding 6). The cursor keeps
        // its event-stream epoch, so a restarted host refuses it instead of
        // replaying past the new instance's first events.
        val (seq, epoch) = pool.cachedAppliedCursor(key)
        socket.start(seq ?: 0, epoch)
    }

    suspend fun refreshHostSnapshots(snapshot: HostCatalogSnapshot? = null) {
        peerSnapshots?.refreshAll(snapshot)
    }

    fun onBackground() {
        peerSnapshots?.cancelAll()
        val currentState = state()
        val secondaryId = secondaryLruId(
            currentState.hostCatalog.selectedConnectionId,
            currentState.hostCatalog.lru,
        )
        synchronized(offlineLock) {
            currentState.hostCatalog.connectionStates.forEach { (id, connState) ->
                if (id != currentState.hostCatalog.selectedConnectionId &&
                    secondaryId != null &&
                    id == secondaryId &&
                    (connState == RemoteWebSocketClient.ConnectionState.Failed ||
                        connState == RemoteWebSocketClient.ConnectionState.SessionExpired)
                ) {
                    offlineBeforeSuspend[id] = connState
                } else {
                    offlineBeforeSuspend.remove(id)
                }
            }
            offlineBeforeSuspend.keys.retainAll { secondaryId != null && it == secondaryId }
        }
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
            .forEach { host ->
                synchronized(offlineLock) { offlineBeforeSuspend.remove(host.connectionId) }
                pool.forget(SessionPoolKey.Host(host.connectionId))
            }
        val currentState = state()
        val selectedId = currentState.hostCatalog.selectedConnectionId
        val secondaryIdNow = secondaryLruId(selectedId, currentState.hostCatalog.lru)
        val retainedIdsNow = currentState.hostCatalog.hosts.mapTo(mutableSetOf()) { it.connectionId }
        val restoredOfflineStates = synchronized(offlineLock) {
            offlineBeforeSuspend.keys.retainAll { id ->
                isRetainedSecondary(id, retainedIdsNow, selectedId, secondaryIdNow)
            }
            offlineBeforeSuspend.toMap()
        }
        if (restoredOfflineStates.isNotEmpty()) {
            updateState { current ->
                val secondaryId = secondaryLruId(
                    current.hostCatalog.selectedConnectionId,
                    current.hostCatalog.lru,
                )
                val retainedIds = current.hostCatalog.hosts.mapTo(mutableSetOf()) { it.connectionId }
                val restored = restoredOfflineStates.filterKeys { id ->
                    isRetainedSecondary(
                        id,
                        retainedIds,
                        current.hostCatalog.selectedConnectionId,
                        secondaryId,
                    )
                }
                if (restored.isEmpty()) current
                else current.copy(
                    hostCatalog = current.hostCatalog.copy(
                        connectionStates = restored + current.hostCatalog.connectionStates,
                    ),
                )
            }
        }
        pool.onForeground { key, socket, lease ->
            if (key is SessionPoolKey.Host && key.id != selectedId) {
                socket.setListener(SecondaryHostListener(key.id, lease))
            }
        }
        scope.launch {
            warmSecondary()
            refreshHostSnapshots()
        }
    }

    private fun isRetainedSecondary(
        id: ClientConnectionId,
        retainedIds: Set<ClientConnectionId>,
        selectedId: ClientConnectionId?,
        secondaryId: ClientConnectionId?,
    ): Boolean = id in retainedIds && id != selectedId && secondaryId != null && id == secondaryId

    private fun clearRestoredSecondaryState(connectionId: ClientConnectionId) {
        synchronized(offlineLock) { offlineBeforeSuspend.remove(connectionId) }
        updateState { current ->
            if (connectionId !in current.hostCatalog.connectionStates) current
            else current.copy(
                hostCatalog = current.hostCatalog.copy(
                    connectionStates = current.hostCatalog.connectionStates - connectionId,
                ),
            )
        }
    }

    private suspend fun readCatalog(): HostCatalogSnapshot? =
        repository?.let { withContext(ioDispatcher) { it.catalogSnapshot() } }

    private fun publish(snapshot: HostCatalogSnapshot) {
        pool.updatePolicy(snapshot.selectedConnectionId, snapshot.lru)
        val canonical = compactHostsByEndpoint(deriveEnvironmentEndpoints(snapshot))
        val retained = canonical.hosts.mapTo(mutableSetOf()) { it.connectionId }
        val secondaryId = secondaryLruId(canonical.selectedConnectionId, canonical.lru)
        synchronized(offlineLock) {
            offlineBeforeSuspend.keys.retainAll { id ->
                isRetainedSecondary(id, retained, canonical.selectedConnectionId, secondaryId)
            }
        }
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
                        id == secondaryId
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
            val effectiveState = synchronized(offlineLock) {
                val savedState = offlineBeforeSuspend[connectionId]
                if (savedState == null) {
                    state
                } else when (state) {
                    RemoteWebSocketClient.ConnectionState.Connecting,
                    RemoteWebSocketClient.ConnectionState.Reconnecting -> savedState
                    RemoteWebSocketClient.ConnectionState.Online -> {
                        offlineBeforeSuspend.remove(connectionId)
                        state
                    }
                    RemoteWebSocketClient.ConnectionState.Failed,
                    RemoteWebSocketClient.ConnectionState.SessionExpired -> {
                        offlineBeforeSuspend[connectionId] = state
                        state
                    }
                    else -> state
                }
            }
            updateState { current ->
                if (current.hostCatalog.hosts.none { it.connectionId == connectionId }) current
                else current.copy(
                    hostCatalog = current.hostCatalog.copy(
                        connectionStates = current.hostCatalog.connectionStates +
                            (connectionId to effectiveState),
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
