package com.poracode.app.session.replay

import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.model.RemoteGitSummary

/**
 * Host-scoped replay/cache projection exposed through [com.poracode.app.session.AppSession.UiState].
 * Grouped as a single field so the UiState data class stays compact and the
 * exact-host cache clears atomically on host switch/unpair.
 */
data class HostReplayCacheUi(
    val gitSummariesByThread: Map<String, RemoteGitSummary> = emptyMap(),
    val agentMergedStatuses: Map<String, AgentStatusEntry> = emptyMap(),
    val agentWindowsStatuses: List<AgentStatusEntry> = emptyList(),
    val agentWindowsLoaded: Boolean = false,
    val agentWslStatuses: List<AgentStatusEntry> = emptyList(),
    val agentWslLoaded: Boolean = false,
    val gitStateRevision: Int = 0,
) {
    companion object {
        val EMPTY = HostReplayCacheUi()
    }
}
