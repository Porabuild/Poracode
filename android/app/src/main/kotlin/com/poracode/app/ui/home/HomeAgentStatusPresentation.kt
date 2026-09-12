package com.poracode.app.ui.home

import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.WindowsProjectLocation
import com.poracode.app.model.WslProjectLocation
import com.poracode.app.session.replay.HostReplayCacheUi

/** Resolves capabilities from the thread's exact execution environment. */
internal fun resolveThreadAgentStatus(
    agentKind: String,
    projectLocation: ProjectLocation?,
    replay: HostReplayCacheUi,
): AgentStatusEntry? {
    val candidates = when (projectLocation) {
        is WindowsProjectLocation -> if (replay.agentWindowsLoaded) {
            replay.agentWindowsStatuses
        } else {
            replay.agentMergedStatuses.values.filter {
                it.envKind == AgentStatusEntry.ENV_WINDOWS
            }
        }
        is WslProjectLocation -> if (replay.agentWslLoaded) {
            replay.agentWslStatuses
        } else {
            replay.agentMergedStatuses.values.filter { it.envKind == AgentStatusEntry.ENV_WSL }
        }
        is PosixProjectLocation -> replay.agentMergedStatuses.values.filter {
            it.envKind == AgentStatusEntry.ENV_POSIX || it.envKind.isEmpty()
        }
        null -> return null
    }
    return candidates.firstOrNull { status ->
        status.kind == agentKind &&
            status.installed &&
            (projectLocation !is WslProjectLocation || status.envDistro == projectLocation.distro)
    }
}
