package com.poracode.app.session.replay

import com.poracode.app.model.GitStateJsonAdapter
import com.poracode.app.model.RemoteShellSnapshot

/**
 * Exact-host-scoped cache for the sequenced replay surface: the merged agent
 * status map, the Windows/WSL full-scan lists (with their loaded flags), the
 * per-thread Git summaries, and the normalized Git/PR state. Bound to a single
 * host identity and cleared on host switch/unpair so colliding project/thread
 * IDs across hosts can never share state.
 */
class HostStateCache {
    @Volatile
    private var hostId: String? = null

    @Volatile
    private var stateRef: SequencedEventApplier.ReplayState = SequencedEventApplier.ReplayState()

    val state: SequencedEventApplier.ReplayState
        get() = stateRef

    /**
     * Bind to [hostId]; a change clears every cache (no cross-host leakage).
     * Returns true when the bind cleared an existing (different) host's cache.
     */
    fun bindHost(hostId: String): Boolean {
        if (this.hostId == hostId) return false
        clearInternal()
        this.hostId = hostId
        return true
    }

    fun clear() {
        clearInternal()
    }

    private fun clearInternal() {
        hostId = null
        stateRef = SequencedEventApplier.ReplayState()
    }

    /**
     * Seed the authoritative baseline from a freshly fetched shell snapshot.
     * Git state replaces only when its revision is at least the current one (no
     * regression); summaries replace only while the cache is still empty, so an
     * ordinary shell refresh never discards event-applied state. Pass
     * [authoritative] = true for a resync transaction (force replace).
     */
    fun seedFromShell(shell: RemoteShellSnapshot, authoritative: Boolean = false) {
        val summaries = shell.gitSummariesByThread?.let { GitStateJsonAdapter.decodeSummaries(it) }
        val gitState = shell.gitState?.let { GitStateJsonAdapter.decodeSnapshot(it) }
        val current = stateRef
        val nextSummaries = when {
            summaries == null -> current.gitSummaries
            authoritative -> summaries
            current.gitSummaries.isEmpty() -> summaries
            else -> current.gitSummaries
        }
        val nextGitState = when {
            gitState == null -> current.gitState
            authoritative -> gitState
            current.gitState.revision == 0 -> gitState
            gitState.revision >= current.gitState.revision -> gitState
            else -> current.gitState
        }
        if (nextSummaries !== current.gitSummaries || nextGitState !== current.gitState) {
            stateRef = current.copy(gitSummaries = nextSummaries, gitState = nextGitState)
        }
    }

    fun replace(state: SequencedEventApplier.ReplayState) {
        stateRef = state
    }

    /** Ensure a thread has a replay entry (preserving existing fields). */
    fun ensureThread(threadId: String, watchIntent: Boolean) {
        if (stateRef.threads[threadId] != null) return
        stateRef = stateRef.copy(
            threads = stateRef.threads + (
                threadId to SequencedEventApplier.ReplayThreadState(terminalWatchIntent = watchIntent)
            ),
        )
    }
}
