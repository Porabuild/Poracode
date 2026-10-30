package com.poracode.app.ui.home

import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.WindowsProjectLocation
import com.poracode.app.model.WslProjectLocation
import com.poracode.app.model.stringOrNull
import com.poracode.app.model.threads.ThreadPresentationMode
import com.poracode.app.session.replay.HostReplayCacheUi
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

internal fun homeQuickComposeAgents(
    location: ProjectLocation,
    replay: HostReplayCacheUi,
    presentationMode: ThreadPresentationMode,
): List<AgentStatusEntry> = homeQuickComposeStatuses(location, replay)
    .filter { it.installed && supportsPresentation(it, presentationMode) }
    .distinctBy(AgentStatusEntry::kind)
    .sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.label.ifBlank { it.kind } })

internal fun homeQuickComposeStatuses(
    location: ProjectLocation,
    replay: HostReplayCacheUi,
): List<AgentStatusEntry> = when (location) {
    is WindowsProjectLocation -> if (replay.agentWindowsLoaded) {
        replay.agentWindowsStatuses
    } else {
        replay.agentMergedStatuses.values.filter { it.envKind == AgentStatusEntry.ENV_WINDOWS }
    }
    is WslProjectLocation -> if (replay.agentWslLoaded) {
        replay.agentWslStatuses.filter { it.envDistro == location.distro }
    } else {
        replay.agentMergedStatuses.values.filter {
            it.envKind == AgentStatusEntry.ENV_WSL && it.envDistro == location.distro
        }
    }
    is PosixProjectLocation -> replay.agentMergedStatuses.values.filter {
        it.envKind == AgentStatusEntry.ENV_POSIX || it.envKind.isEmpty()
    }
}

internal fun supportsPresentation(
    status: AgentStatusEntry,
    mode: ThreadPresentationMode,
): Boolean {
    val capabilities = status.capabilities
    val modes = (capabilities["presentationModes"] as? JsonArray)
        ?.mapNotNull(JsonElement::stringOrNull)
        ?.filter(String::isNotBlank)
    if (!modes.isNullOrEmpty()) return mode.wireValue in modes
    capabilities["presentationMode"]?.stringOrNull()?.let { return it == mode.wireValue }
    val scoped = capabilities["presentationCapabilities"] as? JsonObject
    if (scoped?.containsKey(mode.wireValue) == true) return true
    val variants = status.raw["runtimeVariants"] as? JsonObject
    if (variants != null) {
        val hasMode = variants.values.any { variant ->
            (variant as? JsonObject)?.get("presentationMode")?.stringOrNull() == mode.wireValue
        }
        if (hasMode) return true
    }
    return true
}

internal fun homeQuickComposePresentationModes(
    location: ProjectLocation,
    replay: HostReplayCacheUi,
): List<ThreadPresentationMode> = ThreadPresentationMode.entries.filter { mode ->
    homeQuickComposeStatuses(location, replay).any { it.installed && supportsPresentation(it, mode) }
}

internal fun homeQuickComposeWorktrees(
    projectId: String,
    items: List<com.poracode.app.session.HostPresentation.UnifiedThreadItem>,
): List<HomeQuickComposeWorktree> = items.asSequence()
    .filter { it.project.id == projectId }
    .mapNotNull { item ->
        val path = item.thread.worktreePath?.takeIf(String::isNotBlank) ?: return@mapNotNull null
        HomeQuickComposeWorktree(
            path = path,
            branch = item.thread.worktreeBranch?.takeIf(String::isNotBlank),
        )
    }
    .distinctBy { it.path }
    .sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.branch ?: it.path.orEmpty() })
    .toList()
