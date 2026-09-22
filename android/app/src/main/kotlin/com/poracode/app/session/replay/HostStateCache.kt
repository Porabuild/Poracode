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
 *
 * The agent-statuses base boundary is bounded by [AgentBaseBounds]: a count,
 * estimated-byte, and retained-age budget over queued live transitions. Because
 * those transitions are ordered deltas (a dropped per-agent update would leave
 * the base's older value visible), overflow does not trim the queue — it voids
 * the attempted base install and reports that authoritative recovery is
 * required.
 */
class HostStateCache(
    private val agentBaseBounds: AgentBaseBounds = AgentBaseBounds(),
    private val arrivalClockMs: () -> Long = { System.nanoTime() / 1_000_000L },
) {
    /** Count/byte/age budget for the pending agent-statuses base transitions. */
    data class AgentBaseBounds(
        val maxTransitions: Int = MAX_PENDING_AGENT_BASE_TRANSITIONS,
        val maxBytes: Long = MAX_PENDING_AGENT_BASE_BYTES,
        val maxAgeMs: Long = MAX_PENDING_AGENT_BASE_AGE_MS,
    )

    /** Outcome of an authoritative agent-statuses base install attempt. */
    data class AgentBaseInstall(
        /**
         * The attempted base was invalidated (buffer overflow or retained-age
         * expiry): nothing was installed and the caller must run one bounded
         * authoritative recovery.
         */
        val requiresAuthoritativeRecovery: Boolean,
        /**
         * The seed's attempt token no longer owns the boundary (a newer
         * `beginAgentStatusesBase` superseded it): nothing was installed and
         * nothing was consumed. The caller must ignore this result; the newer
         * attempt's fetch owns the boundary and will report its own outcome.
         */
        val stale: Boolean = false,
    )

    companion object {
        /**
         * Queue bound for ordered base transitions. 512 transitions is far
         * above a realistic detection burst; the base fetch itself is bounded
         * by a 15s timeout.
         */
        const val MAX_PENDING_AGENT_BASE_TRANSITIONS = 512

        /** Estimated-byte bound over queued transitions (host frames ≤ 1 MiB). */
        const val MAX_PENDING_AGENT_BASE_BYTES = 4L * 1024 * 1024

        /** Retained-age bound (defense in depth behind the fetch timeout). */
        const val MAX_PENDING_AGENT_BASE_AGE_MS = 60_000L
    }

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
    @Synchronized
    fun bindHost(hostId: String): Boolean {
        if (this.hostId == hostId) return false
        clearInternal()
        this.hostId = hostId
        return true
    }

    @Synchronized
    fun clear() {
        clearInternal()
    }

    /** Caller holds the monitor. */
    private fun clearInternal() {
        hostId = null
        stateRef = SequencedEventApplier.ReplayState()
        // Host switch/unpair releases any open base boundary; otherwise live
        // transitions buffered for the old host would install onto the new one.
        // The attempt token advances so an in-flight seed from before the
        // switch can never match a later boundary (tokens are never reused).
        pendingAgentBaseGeneration += 1
        pendingAgentBaseTransitions = null
        pendingAgentBaseInvalidated = false
        pendingAgentBaseBytes = 0L
        pendingAgentBaseOldestArrivalMs = Long.MIN_VALUE
    }

    /**
     * Seed the authoritative baseline from a freshly fetched shell snapshot.
     * Git state replaces only when its revision is at least the current one (no
     * regression); summaries replace only while the cache is still empty, so an
     * ordinary shell refresh never discards event-applied state. Pass
     * [authoritative] = true for a resync transaction (force replace).
     *
     * Synchronized like the agent-status buffer: every stateRef mutation is a
     * read-modify-write across the WebSocket reader and Main threads, and a
     * lost update here silently drops event-applied state (WS7 P1-17).
     */
    @Synchronized
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

    @Synchronized
    fun replace(state: SequencedEventApplier.ReplayState) {
        stateRef = state
    }

    // Bootstrap/resync hydration of agent statuses (GET /api/agent-statuses base).
    private data class PendingAgentTransition(
        val transition: SequencedEventApplier.Transition,
        val estimatedBytes: Long,
        val arrivalMs: Long,
    )

    @Volatile
    private var pendingAgentBaseTransitions: MutableList<PendingAgentTransition>? = null

    /** The attempted base was voided by buffer overflow or retained-age expiry. */
    @Volatile
    private var pendingAgentBaseInvalidated: Boolean = false

    /**
     * Attempt token for the open boundary. `beginAgentStatusesBase` advances it
     * and hands it to the caller, which must present it to
     * [seedAgentStatusesBase]; a seed with an older token is stale and must not
     * consume or install anything. Never reset, so tokens are never reused.
     */
    @Volatile
    private var pendingAgentBaseGeneration: Long = 0L

    private var pendingAgentBaseBytes: Long = 0L
    private var pendingAgentBaseOldestArrivalMs: Long = Long.MIN_VALUE

    val agentStatusesBasePending: Boolean
        get() = pendingAgentBaseTransitions != null

    /** Retained estimated bytes for the open boundary (accounting; exposed for tests). */
    fun agentStatusesBaseBufferedBytes(): Long = synchronized(this) { pendingAgentBaseBytes }

    /** Result of queueing one live agent transition behind the open boundary. */
    enum class AgentTransitionBufferResult {
        /** Buffered; the ordered base install still covers it. */
        Buffered,

        /** Boundary closed or already invalidated; apply the transition directly. */
        Rejected,

        /**
         * A count/byte/age bound overflowed. The attempted base is void — it
         * must not install and the caller must request authoritative recovery.
         * The transition was NOT preserved, so the caller must not advance the
         * cursor for it.
         */
        Invalidated,
    }

    /**
     * Open the install-buffer boundary: live agent transitions queue until the
     * base lands. Returns the attempt token the matching [seedAgentStatusesBase]
     * must present.
     *
     * A reopen is a *fresh* boundary. The caller opens it immediately before
     * issuing a new authoritative read, so that read covers every transition
     * queued before it. Keeping a previous attempt's transitions would apply
     * pre-read deltas on top of the newer base (stale values winning), and
     * keeping their byte/age counters would let the window exceed its hard
     * bounds. The token makes the pairing explicit: an older attempt's seed can
     * never consume the newer boundary.
     */
    fun beginAgentStatusesBase(): Long = synchronized(this) {
        pendingAgentBaseGeneration += 1
        pendingAgentBaseTransitions = mutableListOf()
        pendingAgentBaseInvalidated = false
        pendingAgentBaseBytes = 0L
        pendingAgentBaseOldestArrivalMs = Long.MIN_VALUE
        pendingAgentBaseGeneration
    }

    /**
     * Queue one live agent transition while the base fetch is in flight.
     *
     * Ordered-install semantics: transitions are deltas, so a bound overflow
     * cannot silently trim the queue (a dropped per-agent update would leave a
     * stale base value visible). Overflow instead voids the whole attempt and
     * demands recovery.
     *
     * Synchronized against [seedAgentStatusesBase]'s snapshot-and-close: the
     * WebSocket reader thread appends here while Main seeds, and an unsynchronized
     * append during seed's iteration would throw or silently lose the transition.
     */
    fun bufferAgentStatusesTransition(
        transition: SequencedEventApplier.Transition,
    ): AgentTransitionBufferResult {
        synchronized(this) {
            val buffer = pendingAgentBaseTransitions ?: return AgentTransitionBufferResult.Rejected
            if (pendingAgentBaseInvalidated) return AgentTransitionBufferResult.Invalidated
            val arrivalMs = arrivalClockMs()
            val estimatedBytes = estimateTransitionBytes(transition)
            if (pendingAgentBaseOldestArrivalMs == Long.MIN_VALUE) {
                pendingAgentBaseOldestArrivalMs = arrivalMs
            }
            val overCount = buffer.size + 1 > agentBaseBounds.maxTransitions
            val overBytes = pendingAgentBaseBytes + estimatedBytes > agentBaseBounds.maxBytes
            // Retained age against the append-time monotonic clock, not an
            // arrival span: an old head is void even with no newer arrivals.
            val overAge = arrivalMs - pendingAgentBaseOldestArrivalMs > agentBaseBounds.maxAgeMs
            if (overCount || overBytes || overAge) {
                // Invalidate the attempted base: drop the queue (it is no
                // longer an ordered prefix), keep the boundary closed to
                // further transitions, and ask for recovery.
                pendingAgentBaseTransitions = null
                pendingAgentBaseInvalidated = true
                pendingAgentBaseBytes = 0L
                pendingAgentBaseOldestArrivalMs = Long.MIN_VALUE
                return AgentTransitionBufferResult.Invalidated
            }
            buffer.add(PendingAgentTransition(transition, estimatedBytes, arrivalMs))
            pendingAgentBaseBytes += estimatedBytes
        }
        return AgentTransitionBufferResult.Buffered
    }

    /**
     * Install the authoritative agent-statuses base fetched over HTTP, then
     * apply buffered transitions in arrival order. The base REPLACES the
     * merged map (and the WSL bulk list): identities the host no longer
     * reports are pruned, and an empty base yields an empty map. Buffered
     * live transitions re-apply on top, so newer events win.
     *
     * [generation] is the attempt token returned by [beginAgentStatusesBase].
     * A seed whose token was superseded by a newer boundary is stale: it
     * installs nothing, consumes nothing, and returns
     * [AgentBaseInstall.stale] so the caller can ignore it. This keeps a
     * slower older fetch from draining the newer attempt's queue and applying
     * its older base over newer state.
     *
     * When the buffer was invalidated, or the oldest retained transition
     * outlived the age budget (ordered delta replay is incomplete), the base
     * is NOT installed and the result demands authoritative recovery.
     */
    @Synchronized
    fun seedAgentStatusesBase(
        native: List<AgentStatusEntry>,
        wsl: List<AgentStatusEntry>,
        generation: Long = pendingAgentBaseGeneration,
    ): AgentBaseInstall {
        val (buffered, invalidated) = synchronized(this) {
            if (generation != pendingAgentBaseGeneration) {
                return AgentBaseInstall(requiresAuthoritativeRecovery = false, stale = true)
            }
            val buffered = pendingAgentBaseTransitions
            val invalidated = pendingAgentBaseInvalidated
            pendingAgentBaseTransitions = null
            pendingAgentBaseInvalidated = false
            pendingAgentBaseBytes = 0L
            pendingAgentBaseOldestArrivalMs = Long.MIN_VALUE
            buffered to invalidated
        }
        // Expiry is evaluated again at consume: a base fetch that outlived the
        // age budget releases its queue and demands recovery instead of
        // replaying arbitrarily stale deltas (or silently dropping them, which
        // would pin the base's older values).
        val expired = buffered?.firstOrNull()?.let { pending ->
            arrivalClockMs() - pending.arrivalMs > agentBaseBounds.maxAgeMs
        } == true
        if (invalidated || expired) {
            // Ordered replay is impossible; do not install a base that would
            // silently pin stale values. The caller runs one recovery pass.
            return AgentBaseInstall(requiresAuthoritativeRecovery = true)
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
        for (pending in buffered.orEmpty()) {
            state = SequencedEventApplier.apply(state, pending.transition).state
        }
        if (state != stateRef) stateRef = state
        return AgentBaseInstall(requiresAuthoritativeRecovery = false)
    }

    /**
     * Conservative decoded-payload estimate (`toString` renders this
     * transition's payload once; UTF-16 length × 3 upper-bounds UTF-8 bytes).
     */
    private fun estimateTransitionBytes(transition: SequencedEventApplier.Transition): Long =
        transition.toString().length.toLong() * 3L + 64L

    /** Ensure a thread has a replay entry (preserving existing fields). */
    @Synchronized
    fun ensureThread(threadId: String, watchIntent: Boolean) {
        if (stateRef.threads[threadId] != null) return
        stateRef = stateRef.copy(
            threads = stateRef.threads + (
                threadId to SequencedEventApplier.ReplayThreadState(terminalWatchIntent = watchIntent)
            ),
        )
    }
}
