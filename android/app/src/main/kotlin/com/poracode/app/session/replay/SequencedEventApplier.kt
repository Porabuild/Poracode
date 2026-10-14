package com.poracode.app.session.replay

import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.model.GitStateJsonAdapter
import com.poracode.app.model.GitStatePatch
import com.poracode.app.model.GitStateSnapshot
import com.poracode.app.model.PersistedRuntimeItem
import com.poracode.app.model.RemoteGitSummary
import com.poracode.app.model.applyGitStatePatch
import com.poracode.app.model.asObjectOrNull
import com.poracode.app.model.int
import com.poracode.app.model.string
import kotlinx.serialization.json.JsonElement

/**
 * Pure decoder + reducer for the seven sequenced replay transitions. This is
 * the behavioral oracle: it owns target isolation, identity-merge, full-replace
 * (including loaded-empty), and strict-increasing Git patch semantics. The
 * session router mirrors its results into [com.poracode.app.session.AppSession.UiState]
 * and the host cache; cursor advancement happens only after a successful apply.
 *
 * Browser mirror / terminal-output frames never reach here — they are routed
 * out-of-band by [com.poracode.app.transport.ws.WsFrameRouter] / the raw sink
 * and must not decode as a replay transition or advance the cursor.
 */
object SequencedEventApplier {

    /** Per-thread replay state. Other threads are byte-for-byte isolated. */
    data class ReplayThreadState(
        val transcriptItems: List<PersistedRuntimeItem> = emptyList(),
        val pendingSteerId: String? = null,
        val terminalWatchIntent: Boolean = false,
        val terminalBaseline: TerminalBaseline? = null,
        val runtimeDomain: com.poracode.app.protocol.ThreadRuntimeDomainState =
            com.poracode.app.protocol.ThreadRuntimeDomainState(),
        val exited: Boolean = false,
        val exitCode: Int? = null,
    )

    data class TerminalBaseline(val generation: String, val outputLength: Int)

    /** Host-scoped cache reduced from the seven transitions. */
    data class ReplayState(
        val threads: Map<String, ReplayThreadState> = emptyMap(),
        val mergedByUpdate: Map<String, AgentStatusEntry> = emptyMap(),
        val windowsList: List<AgentStatusEntry> = emptyList(),
        val windowsLoaded: Boolean = false,
        val wslList: List<AgentStatusEntry> = emptyList(),
        val wslLoaded: Boolean = false,
        val gitSummaries: Map<String, RemoteGitSummary> = emptyMap(),
        val gitState: GitStateSnapshot = GitStateSnapshot.EMPTY,
    )

    sealed class Transition {
        data class ThreadReset(val threadId: String) : Transition()
        data class ThreadExited(val threadId: String, val exitCode: Int?) : Transition()
        data class AgentStatusUpdated(val status: AgentStatusEntry) : Transition()
        data class WindowsAgentStatuses(val statuses: List<AgentStatusEntry>) : Transition()
        data class WslAgentStatuses(val statuses: List<AgentStatusEntry>) : Transition()
        data class RemoteGitSummaries(val summaries: Map<String, RemoteGitSummary>) : Transition()
        data class RemoteGitState(val patch: GitStatePatch) : Transition()
    }

    /** Apply outcome; side-effects the router must honor (e.g. fresh baseline). */
    data class ApplyResult(
        val state: ReplayState,
        val applied: Boolean,
        val gitStateApplied: Boolean,
        val resetThreadIds: Set<String> = emptySet(),
        val freshBaselineThreadIds: Set<String> = emptySet(),
    )

    /** Returns null when the event is not one of the seven replay transitions. */
    fun decode(event: JsonElement): Transition? {
        val obj = event.asObjectOrNull() ?: return null
        return when (obj.string("type")) {
            "thread-reset" -> obj.string("threadId")?.let { Transition.ThreadReset(it) }
            "thread-exited" -> {
                val id = obj.string("threadId") ?: return null
                val code = obj.int("exitCode")
                Transition.ThreadExited(id, code)
            }
            "agent-status-updated" ->
                GitStateJsonAdapter.decodeAgentStatus(obj["status"])?.let { Transition.AgentStatusUpdated(it) }
            "windows-agent-statuses" ->
                Transition.WindowsAgentStatuses(GitStateJsonAdapter.decodeAgentStatuses(obj["statuses"]))
            "wsl-agent-statuses" ->
                Transition.WslAgentStatuses(GitStateJsonAdapter.decodeAgentStatuses(obj["statuses"]))
            "remote-git-summaries" ->
                Transition.RemoteGitSummaries(GitStateJsonAdapter.decodeSummaries(obj["summaries"]))
            "remote-git-state" ->
                GitStateJsonAdapter.decodePatch(obj["patch"])?.let { Transition.RemoteGitState(it) }
            else -> null
        }
    }

    fun apply(state: ReplayState, transition: Transition): ApplyResult {
        val gitStateApplied: Boolean
        val next = when (transition) {
            is Transition.ThreadReset -> {
                gitStateApplied = false
                val id = transition.threadId
                val prior = state.threads[id] ?: ReplayThreadState()
                val reset = prior.copy(
                    transcriptItems = emptyList(),
                    pendingSteerId = null,
                    runtimeDomain = com.poracode.app.protocol.ThreadRuntimeDomainState(),
                    terminalBaseline = null,
                    // Preserve terminalWatchIntent; a fresh baseline+watch is requested.
                    exited = false,
                    exitCode = null,
                )
                state.copy(threads = state.threads + (id to reset))
            }

            is Transition.ThreadExited -> {
                gitStateApplied = false
                val id = transition.threadId
                val prior = state.threads[id] ?: ReplayThreadState()
                // Preserve transcript + terminal watch intent; clear pending steer.
                val exited = prior.copy(
                    pendingSteerId = null,
                    exited = true,
                    exitCode = transition.exitCode,
                )
                state.copy(threads = state.threads + (id to exited))
            }

            is Transition.AgentStatusUpdated -> {
                gitStateApplied = false
                // Merge by exact identity (kind, envKind, envDistro).
                state.copy(
                    mergedByUpdate = state.mergedByUpdate + (transition.status.identityKey to transition.status),
                )
            }

            is Transition.WindowsAgentStatuses -> {
                gitStateApplied = false
                // Full replace; [] is loaded-empty, not loading/unknown.
                state.copy(
                    windowsList = transition.statuses,
                    windowsLoaded = true,
                )
            }

            is Transition.WslAgentStatuses -> {
                gitStateApplied = false
                state.copy(
                    wslList = transition.statuses,
                    wslLoaded = true,
                )
            }

            is Transition.RemoteGitSummaries -> {
                gitStateApplied = false
                // Full replacement, including exact-empty clearing.
                state.copy(gitSummaries = transition.summaries)
            }

            is Transition.RemoteGitState -> {
                val before = state.gitState
                val after = applyGitStatePatch(before, transition.patch)
                gitStateApplied = after.revision != before.revision
                state.copy(gitState = after)
            }
        }

        val resetIds = when (transition) {
            is Transition.ThreadReset -> setOf(transition.threadId)
            else -> emptySet()
        }
        val freshBaseline = when (transition) {
            is Transition.ThreadReset -> setOf(transition.threadId)
            else -> emptySet()
        }
        return ApplyResult(
            state = next,
            applied = true,
            gitStateApplied = gitStateApplied,
            resetThreadIds = resetIds,
            freshBaselineThreadIds = freshBaseline,
        )
    }
}
