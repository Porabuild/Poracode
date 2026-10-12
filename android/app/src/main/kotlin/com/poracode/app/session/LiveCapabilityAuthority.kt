package com.poracode.app.session

import com.poracode.app.model.RemoteEnvironmentDescriptor

/**
 * Single owner for the live-capability transition state — the epoch and the
 * connect-time descriptor cache — extracted from [LiveConnectionController].
 *
 * The lock is supplied by the controller so guard + publication stay one
 * indivisible critical section across the socket listener (IO) and install/
 * destroy (main): an invalidation either precedes the guard read (rejected) or
 * follows the publication entirely (its own clear supersedes). Socket identity
 * stays with the controller; within one socket the epoch is the staleness
 * authority.
 */
internal class LiveCapabilityAuthority(
    private val lock: Any,
    private val updateState: ((AppSession.UiState) -> AppSession.UiState) -> Unit,
) {
    private var epoch = 0L
    private var initialCapabilities: RemoteEnvironmentDescriptor.Capabilities? = null

    /** Capability from a previous connection/state is never authority for the next one. */
    fun invalidate() {
        synchronized(lock) {
            epoch += 1
            initialCapabilities = null
            updateState { s ->
                s.copy(
                    liveBrowserForwardVersions = emptySet(),
                    liveRuntimeHistoryNoticeVersions = emptySet(),
                    liveProjectCommandResultVersions = emptySet(),
                )
            }
        }
    }

    /** Drop the connect-time capability cache under the guard (e.g. on background). */
    fun invalidateInitial() {
        synchronized(lock) { initialCapabilities = null }
    }

    /** New socket generation: an in-flight refresh from a previous socket is stale by definition. */
    fun beginSocket() {
        synchronized(lock) { epoch += 1 }
    }

    /** Epoch for this state observation; a same-socket reconnect invalidates older refreshes. */
    fun beginObservation(): Long = synchronized(lock) { ++epoch }

    fun isCurrentEpoch(candidate: Long): Boolean = synchronized(lock) { epoch == candidate }

    /** Cache a descriptor preflight observation for the next Online publication. */
    fun cacheInitial(capabilities: RemoteEnvironmentDescriptor.Capabilities?) {
        synchronized(lock) { initialCapabilities = capabilities }
    }

    /** Takes and clears the connect-time cache; the caller's guard already validated the epoch. */
    fun consumeInitial(): RemoteEnvironmentDescriptor.Capabilities? = synchronized(lock) {
        initialCapabilities.also { initialCapabilities = null }
    }
}
