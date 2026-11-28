package com.poracode.app.session

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.HostCatalogSnapshot
import com.poracode.app.model.HostRecord
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.storage.MultiHostCredentialRepository
import com.poracode.app.transport.RemoteApiGatewayFactory
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Fetches non-selected host snapshots concurrently with per-host coalescing
 * so one offline/hanging host never stalls or duplicates online peers.
 */
internal class HostPeerSnapshotRefresher(
    private val repository: MultiHostCredentialRepository,
    private val scope: CoroutineScope,
    private val ioDispatcher: CoroutineDispatcher,
    private val pool: SessionPool,
    private val apiFactory: RemoteApiGatewayFactory,
    private val isForeground: () -> Boolean,
    private val hasEndpointPermission: (String) -> Boolean,
    private val refreshCatalog: suspend () -> HostCatalogSnapshot?,
    private val updateState: ((AppSession.UiState) -> AppSession.UiState) -> Unit,
) {
    private val lock = Any()
    private val hostSnapshotJobs = mutableMapOf<ClientConnectionId, Job>()

    suspend fun refreshAll(snapshot: HostCatalogSnapshot? = null) {
        if (!isForeground()) return
        val current = snapshot ?: refreshCatalog() ?: return
        val peers = current.hosts
            .filter { it.connectionId != current.selectedConnectionId }
            .filter { it.protocolVersion == ProtocolConstants.REMOTE_PROTOCOL_VERSION }
            .filter { hasEndpointPermission(it.httpBaseUrl) }
            .filter { "session:read" in it.scopes }
        if (peers.isEmpty()) return
        coroutineScope {
            peers.forEach { host ->
                launch {
                    refreshPeer(host)
                }
            }
        }
    }

    fun cancel(connectionId: ClientConnectionId) {
        synchronized(lock) {
            hostSnapshotJobs.remove(connectionId)?.cancel()
        }
    }

    fun cancelAll() {
        val jobsToCancel = synchronized(lock) {
            hostSnapshotJobs.values.toList().also { hostSnapshotJobs.clear() }
        }
        jobsToCancel.forEach { it.cancel() }
    }

    private suspend fun refreshPeer(host: HostRecord) {
        val existingJob = synchronized(lock) { hostSnapshotJobs[host.connectionId] }
        if (existingJob != null && existingJob.isActive) {
            existingJob.join()
            return
        }
        val expectedBaseUrl = host.httpBaseUrl
        lateinit var launched: Job
        val job = scope.launch(start = CoroutineStart.LAZY) {
            try {
                val credentials = withContext(ioDispatcher) {
                    repository.credentialsFor(host.connectionId)
                } ?: return@launch
                if (credentials.profile.httpBaseUrl != expectedBaseUrl) return@launch
                val remoteSnapshot = try {
                    withContext(ioDispatcher) {
                        apiFactory.create(
                            credentials.profile.httpBaseUrl,
                            credentials.accessToken,
                        ).snapshot()
                    }
                } catch (error: CancellationException) {
                    throw error
                } catch (_: Exception) {
                    return@launch
                }
                updateState { currentState ->
                    val currentRecord = currentState.hostCatalog.hosts.firstOrNull {
                        it.connectionId == host.connectionId
                    }
                    if (currentRecord == null || currentRecord.httpBaseUrl != expectedBaseUrl) {
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
            } finally {
                synchronized(lock) {
                    if (hostSnapshotJobs[host.connectionId] === launched) {
                        hostSnapshotJobs.remove(host.connectionId)
                    }
                }
            }
        }
        launched = job
        val activeToJoin = synchronized(lock) {
            val active = hostSnapshotJobs[host.connectionId]
            if (active != null && active.isActive) {
                active
            } else {
                hostSnapshotJobs[host.connectionId] = job
                null
            }
        }
        if (activeToJoin != null) {
            job.cancel()
            activeToJoin.join()
            return
        }
        job.start()
        job.join()
    }
}
