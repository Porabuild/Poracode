package com.poracode.app.session.projects

import com.poracode.app.model.BrowseHostDirectoryResult
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

data class HostDirectoryNavigation(
    val requestedPath: String? = null,
    val listing: BrowseHostDirectoryResult? = null,
    val loading: Boolean = false,
    val failure: ProjectOperationFailure? = null,
)

data class HostDirectoryState(
    /** One navigation state per exact host session; paths are never cache keys. */
    val sessions: Map<ProjectSessionKey, HostDirectoryNavigation> = emptyMap(),
)

class HostDirectoryController(
    private val session: StateFlow<ProjectHostLease?>,
    private val gateway: ProjectSessionGateway,
) {
    private val revisions = ConcurrentHashMap<ProjectSessionKey, AtomicLong>()
    private val mutableState = MutableStateFlow(HostDirectoryState())
    val state: StateFlow<HostDirectoryState> = mutableState.asStateFlow()

    suspend fun navigate(path: String): ProjectOperationResult<BrowseHostDirectoryResult> {
        val (captured, gateFailure) = session.currentLease(ProjectCapability.Manage)
        if (captured == null) return ProjectOperationResult.Failed(requireNotNull(gateFailure))
        val lease = captured
        val revision = nextRevision(lease.key)
        // Never leave a previous directory visible while a new location is unresolved.
        update(lease.key) {
            HostDirectoryNavigation(
                requestedPath = path,
                listing = null,
                loading = gateFailure == null,
                failure = gateFailure,
            )
        }
        if (gateFailure != null) return ProjectOperationResult.Failed(gateFailure)
        try {
            val result = gateway.browseHostDirectory(lease, path)
            if (!isCurrent(lease, revision)) return ProjectOperationResult.Stale
            update(lease.key) {
                HostDirectoryNavigation(
                    requestedPath = path,
                    listing = result,
                    loading = false,
                )
            }
            return ProjectOperationResult.Success(result)
        } catch (error: CancellationException) {
            if (isCurrent(lease, revision)) {
                update(lease.key) { it.copy(listing = null, loading = false) }
            }
            throw error
        } catch (error: Throwable) {
            if (!isCurrent(lease, revision)) return ProjectOperationResult.Stale
            val failure = error.asProjectFailure(ProjectCapability.Manage, false)
            update(lease.key) {
                it.copy(listing = null, loading = false, failure = failure)
            }
            return ProjectOperationResult.Failed(failure)
        }
    }

    fun clear(lease: ProjectHostLease) {
        revisions[lease.key]?.incrementAndGet()
        mutableState.update { current ->
            current.copy(sessions = current.sessions - lease.key)
        }
    }

    private fun nextRevision(key: ProjectSessionKey): Long =
        revisions.computeIfAbsent(key) { AtomicLong() }.incrementAndGet()

    private fun isCurrent(lease: ProjectHostLease, revision: Long): Boolean =
        session.isCurrent(lease) && revisions[lease.key]?.get() == revision

    private fun update(
        key: ProjectSessionKey,
        transform: (HostDirectoryNavigation) -> HostDirectoryNavigation,
    ) {
        mutableState.update { current ->
            val prior = current.sessions[key] ?: HostDirectoryNavigation()
            current.copy(sessions = current.sessions + (key to transform(prior)))
        }
    }
}
