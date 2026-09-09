package com.poracode.app.session.replay

import com.poracode.app.model.AgentStatusEntry
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

    // Bootstrap/resync hydration of agent statuses (GET /api/agent-statuses base).
    @Volatile
    private var pendingAgentBaseTransitions: MutableList<SequencedEventApplier.Transition>? = null

    val agentStatusesBasePending: Boolean
        get() = pendingAgentBaseTransitions != null

    /** Open the install-buffer boundary: live agent transitions queue until the base lands. */
    fun beginAgentStatusesBase() {
        synchronized(this) { if (pendingAgentBaseTransitions == null) pendingAgentBaseTransitions = mutableListOf() }
    }

    /** Returns true when the transition was buffered (boundary open).
     * Synchronized against [seedAgentStatusesBase]'s snapshot-and-close: the
     * WebSocket reader thread appends here while Main seeds, and an unsynchronized
     * append during seed's iteration would throw or silently lose the transition. */
    fun bufferAgentStatusesTransition(transition: SequencedEventApplier.Transition): Boolean {
        synchronized(this) {
            val buffer = pendingAgentBaseTransitions ?: return false
            buffer.add(transition)
        }
        return true
    }

    /**
     * Install the authoritative agent-statuses base fetched over HTTP, then
     * apply buffered transitions in arrival order. The base REPLACES the
     * merged map (and the WSL bulk list): identities the host no longer
     * reports are pruned, and an empty base yields an empty map. Buffered
     * live transitions re-apply on top, so newer events win.
     */
    fun seedAgentStatusesBase(
        native: List<AgentStatusEntry>,
        wsl: List<AgentStatusEntry>,
    ) {
        val buffered = synchronized(this) {
            val buffered = pendingAgentBaseTransitions
            pendingAgentBaseTransitions = null
            buffered
        }
        var state = stateRef
        val baseMap = linkedMapOf<String, AgentStatusEntry>()
        for (entry in native) {
            val normalized = if (entry.envKind == AgentStatusEntry.ENV_POSIX) {
                entry
            } else {
                entry.copy(envKind = AgentStatusEntry.ENV_POSIX)
            }
            baseMap[normalized.identityKey] = normalized
        }
        state = state.copy(
            mergedByUpdate = baseMap,
            wslList = wsl,
            wslLoaded = true,
        )
        for (transition in buffered.orEmpty()) {
            state = SequencedEventApplier.apply(state, transition).state
        }
        if (state != stateRef) stateRef = state
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
