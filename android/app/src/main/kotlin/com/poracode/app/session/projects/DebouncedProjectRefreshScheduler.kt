package com.poracode.app.session.projects

import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Host-scoped refresh coalescing; stale leases and hosts without read scope no-op. */
class DebouncedProjectRefreshScheduler(
    private val scope: CoroutineScope,
    private val dispatcher: CoroutineDispatcher,
    private val currentLease: () -> ProjectHostLease?,
    private val refresh: () -> Unit,
    private val delayMs: Long = DEFAULT_DELAY_MS,
) : ProjectRefreshScheduler {
    init {
        require(delayMs >= 0) { "delayMs must not be negative" }
    }

    private val jobs = ConcurrentHashMap<ProjectSessionKey, Job>()

    override fun request(lease: ProjectHostLease) {
        val job = scope.launch(dispatcher) {
            delay(delayMs)
            val current = currentLease()
            if (current?.key == lease.key &&
                current.online &&
                current.ready &&
                ProjectCapability.Read.scope in current.scopes
            ) {
                refresh()
            }
        }
        jobs.put(lease.key, job)?.cancel()
        job.invokeOnCompletion { jobs.remove(lease.key, job) }
    }

    fun close() {
        jobs.values.forEach(Job::cancel)
        jobs.clear()
    }

    companion object {
        const val DEFAULT_DELAY_MS = 600L
    }
}
