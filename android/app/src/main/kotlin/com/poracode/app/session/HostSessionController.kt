package com.poracode.app.session

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.HostCatalogSnapshot
import com.poracode.app.model.HostRecord
import com.poracode.app.storage.HostMutationResult
import com.poracode.app.storage.HostOperationKind
import com.poracode.app.storage.MultiHostCredentialRepository
import com.poracode.app.storage.SessionCredentialRepository
import com.poracode.app.storage.SessionCredentials
import com.poracode.app.transport.RemoteApiGatewayFactory
import com.poracode.app.transport.RemoteEventSocketFactory
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class HostUiCatalog(
    val hosts: List<HostRecord> = emptyList(),
    val selectedConnectionId: ClientConnectionId? = null,
    val lru: List<ClientConnectionId> = emptyList(),
)

/** Safe host receipt/selection/removal coordinator; all stale generations no-op. */
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
        val snapshot = repository?.let { withContext(ioDispatcher) { it.catalogSnapshot() } }
            ?: return null
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
            val result = withContext(ioDispatcher) {
                repository.selectHost(connectionId, receipt)
            }
            if (!result.didApply || !owner.isCurrent(operation)) return@launch
            pool.forget(SessionPoolKey.Host(connectionId))
            val snapshot = refreshCatalog() ?: return@launch
            val selected = snapshot.selected ?: return@launch
            val credentials = withContext(ioDispatcher) {
                repository.credentialsFor(selected.connectionId)
            } ?: return@launch surfaceStoreError()
            if (!owner.isCurrent(operation)) return@launch
            installSelected(credentials)
            warmSecondary(snapshot)
            refreshHostSnapshots(snapshot)
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
            } catch (_: Exception) {
                surfaceStoreError()
                return@launch
            }
            val result = withContext(ioDispatcher) {
                repository.removeHost(connectionId, receipt)
            }
            if (!result.didApply || !owner.isCurrent(operation)) return@launch
            pool.forget(SessionPoolKey.Host(connectionId))
            val snapshot = refreshCatalog() ?: return@launch
            val selected = snapshot.selected ?: run {
                installEmpty()
                return@launch
            }
            if (snapshot.selectedConnectionId == selectedAtReceipt) {
                warmSecondary(snapshot)
                return@launch
            }
            val credentials = withContext(ioDispatcher) {
                repository.credentialsFor(selected.connectionId)
            } ?: return@launch surfaceStoreError()
            if (!owner.isCurrent(operation)) return@launch
            installSelected(credentials)
            warmSecondary(snapshot)
            refreshHostSnapshots(snapshot)
        }
    }

    suspend fun warmSecondary(snapshot: HostCatalogSnapshot? = null) {
        val repository = repository ?: return
        if (!isForeground()) return
        val current = snapshot ?: refreshCatalog() ?: return
        val secondaryId = current.document.secondaryLru ?: return
        val secondary = current.document.host(secondaryId) ?: return
        if (!hasEndpointPermission(secondary.httpBaseUrl)) return
        val key = SessionPoolKey.Host(secondaryId)
        if (pool.liveKeys().contains(key)) return
        val credentials = withContext(ioDispatcher) { repository.credentialsFor(secondaryId) }
            ?: return
        val api = apiFactory.create(credentials.profile.httpBaseUrl, credentials.accessToken)
        val socket = socketFactory.create(api)
        socket.setListener(null)
        val lease = pool.install(key, socket) ?: run {
            socket.destroy()
            return
        }
        if (!pool.isValid(lease) || !isForeground()) {
            pool.forget(key)
            return
        }
        socket.start(pool.cache(key).lastSeenSeq ?: 0)
    }

    /** Fetches non-selected host snapshots without opening extra live sockets. */
    suspend fun refreshHostSnapshots(snapshot: HostCatalogSnapshot? = null) {
        val repository = repository ?: return
        if (!isForeground()) return
        val current = snapshot ?: refreshCatalog() ?: return
        current.hosts
            .filter { it.connectionId != current.selectedConnectionId }
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

    fun onBackground() = pool.onBackground()

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

    private fun publish(snapshot: HostCatalogSnapshot) {
        pool.updatePolicy(snapshot.selectedConnectionId, snapshot.lru)
        val retained = snapshot.hosts.mapTo(mutableSetOf()) { it.connectionId }
        updateState {
            it.copy(
                hostCatalog = HostUiCatalog(
                    hosts = snapshot.hosts,
                    selectedConnectionId = snapshot.selectedConnectionId,
                    lru = snapshot.lru,
                ),
                hostSnapshots = it.hostSnapshots.filterKeys(retained::contains),
            )
        }
    }

    private fun surfaceStoreError() {
        updateState { it.copy(phase = AppSession.Phase.LocalStoreInconsistent) }
    }
}
