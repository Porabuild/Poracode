package com.poracode.app.session.replay

import kotlinx.serialization.json.JsonElement

/**
 * Owns the transactional apply of the seven sequenced replay transitions over
 * the [HostStateCache]. The session router decodes via [handle] and advances
 * the cursor only when [ReplayOutcome.applied] is true; side-effect signals
 * (fresh terminal baseline, Git state change) are honored by the router. A
 * stale host or failed apply never mutates the cache or advances the cursor.
 */
class SequencedReplayController(private val cache: HostStateCache) {

    fun handle(event: JsonElement): ReplayOutcome {
        val transition = SequencedEventApplier.decode(event) ?: return ReplayOutcome.NOT_HANDLED
        val result = SequencedEventApplier.apply(cache.state, transition)
        cache.replace(result.state)
        return ReplayOutcome(
            handled = true,
            applied = result.applied,
            transition = transition,
            gitStateChanged = result.gitStateApplied,
            resetThreadIds = result.resetThreadIds,
            freshBaselineThreadIds = result.freshBaselineThreadIds,
            agentWindowsLoadedChanged = transition is SequencedEventApplier.Transition.WindowsAgentStatuses,
            agentWslLoadedChanged = transition is SequencedEventApplier.Transition.WslAgentStatuses,
            agentMergedChanged = transition is SequencedEventApplier.Transition.AgentStatusUpdated,
            gitSummariesChanged = transition is SequencedEventApplier.Transition.RemoteGitSummaries,
            threadExitedId = (transition as? SequencedEventApplier.Transition.ThreadExited)?.threadId,
        )
    }

    /** Snapshot-derived authoritative baseline (shell refresh / resync). */
    fun seedFromShell(shell: com.poracode.app.model.RemoteShellSnapshot, authoritative: Boolean = false) {
        cache.seedFromShell(shell, authoritative)
    }

    fun bindHost(hostId: String): Boolean = cache.bindHost(hostId)
    fun clear() = cache.clear()
    fun ensureThread(threadId: String, watchIntent: Boolean) = cache.ensureThread(threadId, watchIntent)

    val state: SequencedEventApplier.ReplayState
        get() = cache.state
}

data class ReplayOutcome(
    val handled: Boolean,
    val applied: Boolean,
    val transition: SequencedEventApplier.Transition?,
    val gitStateChanged: Boolean,
    val resetThreadIds: Set<String>,
    val freshBaselineThreadIds: Set<String>,
    val agentWindowsLoadedChanged: Boolean,
    val agentWslLoadedChanged: Boolean,
    val agentMergedChanged: Boolean,
    val gitSummariesChanged: Boolean,
    val threadExitedId: String?,
) {
    companion object {
        val NOT_HANDLED = ReplayOutcome(
            handled = false,
            applied = false,
            transition = null,
            gitStateChanged = false,
            resetThreadIds = emptySet(),
            freshBaselineThreadIds = emptySet(),
            agentWindowsLoadedChanged = false,
            agentWslLoadedChanged = false,
            agentMergedChanged = false,
            gitSummariesChanged = false,
            threadExitedId = null,
        )
    }
}
