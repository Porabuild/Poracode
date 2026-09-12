package com.poracode.app.session.projects

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ProjectWorkspaceTarget
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Coalesces authoritative project-Git refresh on remote-git-state revision
 * transitions. Bound to the current exact host+project+location lease and the
 * single active workspace [ProjectWorkspaceTarget]; a revision is refreshed at
 * most once, duplicate/stale/other-host revisions are ignored, and background /
 * host-swap / unpair (lease regression) suppresses the in-flight refresh.
 *
 * Task-owned: one cancellation-safe coroutine job per active target. There is no
 * untracked scope collector; the coordinator launches under the injected
 * [scope] and cancels its predecessor on every new target/revision/lease change.
 */
internal class GitStateRefreshCoordinator(
    private val scope: CoroutineScope,
    private val dispatcher: CoroutineDispatcher,
    private val currentLease: () -> ProjectHostLease?,
    private val refreshGit: suspend (ProjectWorkspaceTarget) -> Unit,
    private val delayMs: Long = DEFAULT_DELAY_MS,
) {
    @Volatile
    private var activeTarget: ProjectWorkspaceTarget? = null
    private val lastRefreshedRevision = ConcurrentHashMap<String, Int>()
    private val lock = Any()

    fun setActiveTarget(target: ProjectWorkspaceTarget?) {
        synchronized(lock) {
            activeTarget = target
            pendingJob()?.cancel()
        }
    }

    /**
     * A newly accepted host-scoped Git-state [revision] was observed for
     * [connectionId]. Refresh the active target exactly once for that revision,
     * coalescing rapid transitions. Stale / other-host / background events never
     * launch an extra refresh.
     */
    fun onRevisionSeen(connectionId: ClientConnectionId, revision: Int) {
        if (revision <= 0) return
        val target = activeTarget ?: return
        if (target.identity.connectionId != connectionId) return
        val lease = currentLease() ?: return
        if (!leaseAccepts(lease, connectionId)) return
        val key = targetKey(target)
        synchronized(lock) {
            val last = lastRefreshedRevision[key] ?: 0
            if (revision <= last) return // duplicate or older; already refreshed
            lastRefreshedRevision[key] = revision
            pendingJob()?.cancel()
            val captured = target
            setPendingJob(
                scope.launch(dispatcher) {
                    delay(delayMs) // coalesce bursts of patches
                    val current = currentLease() ?: return@launch
                    if (!leaseAccepts(current, connectionId)) return@launch
                    val stillActive = activeTarget
                    if (stillActive == null ||
                        stillActive.identity.connectionId != connectionId ||
                        stillActive != captured
                    ) {
                        return@launch
                    }
                    try {
                        refreshGit(captured)
                    } catch (_: CancellationException) {
                        // Coalesced away or lease changed; no retry loop.
                    } catch (_: Exception) {
                        // Transient failure: the next accepted revision retries.
                    }
                },
            )
        }
    }

    /** Lease regressed or host swapped: cancel the in-flight refresh; keep dedupe memory. */
    fun onLeaseChanged() {
        synchronized(lock) {
            pendingJob()?.cancel()
        }
    }

    private fun leaseAccepts(lease: ProjectHostLease, connectionId: ClientConnectionId): Boolean =
        lease.connectionId == connectionId && lease.online && lease.ready

    private fun targetKey(target: ProjectWorkspaceTarget): String =
        target.identity.connectionId.value + "\u0000" +
            target.identity.projectId + "\u0000" +
            target.location.path

    @Volatile private var jobRef: Job? = null
    private fun pendingJob(): Job? = jobRef
    private fun setPendingJob(job: Job?) {
        jobRef = job
    }

    companion object {
        const val DEFAULT_DELAY_MS = 200L
    }
}
