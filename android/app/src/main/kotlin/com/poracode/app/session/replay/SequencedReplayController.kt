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
        if (cache.agentStatusesBasePending && isAgentStatusesTransition(transition)) {
            // Base fetch in flight: queue instead of applying, so the HTTP base
            // lands first and the live update wins afterwards. The transition is
            // durably queued, so the sequenced cursor may advance.
            cache.bufferAgentStatusesTransition(transition)
            return ReplayOutcome(
                handled = true,
                applied = true,
                transition = transition,
                gitStateChanged = false,
                resetThreadIds = emptySet(),
                freshBaselineThreadIds = emptySet(),
                agentWindowsLoadedChanged = transition is SequencedEventApplier.Transition.WindowsAgentStatuses,
                agentWslLoadedChanged = transition is SequencedEventApplier.Transition.WslAgentStatuses,
                agentMergedChanged = transition is SequencedEventApplier.Transition.AgentStatusUpdated,
                gitSummariesChanged = false,
                threadExitedId = null,
            )
        }
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

    /** Open the agent-statuses base install-buffer boundary (bootstrap/resync hydration). */
    fun beginAgentStatusesBase() = cache.beginAgentStatusesBase()

    /** Install the authoritative HTTP agent-statuses base, then drain buffered live transitions. */
    fun seedAgentStatusesBase(
        native: List<com.poracode.app.model.AgentStatusEntry>,
        wsl: List<com.poracode.app.model.AgentStatusEntry>,
    ) {
        cache.seedAgentStatusesBase(native, wsl)
    }

    private fun isAgentStatusesTransition(transition: SequencedEventApplier.Transition): Boolean =
        transition is SequencedEventApplier.Transition.AgentStatusUpdated ||
            transition is SequencedEventApplier.Transition.WindowsAgentStatuses ||
            transition is SequencedEventApplier.Transition.WslAgentStatuses

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
