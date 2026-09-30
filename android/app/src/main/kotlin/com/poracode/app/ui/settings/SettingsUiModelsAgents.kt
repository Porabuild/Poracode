package com.poracode.app.ui.settings

import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.model.settings.AgentStatusesSnapshot
import com.poracode.app.model.settings.ProviderUsageSnapshot
import kotlinx.serialization.json.JsonObject

data class SettingsAgentRow(
    val key: String,
    val label: String,
    val installed: Boolean,
    val version: String?,
    val authState: String,
    val environment: String?,
)

data class SettingsUsageMeter(
    val label: String,
    val usedPercent: Double,
)

data class SettingsProviderUsageRow(
    val providerId: String,
    val status: String,
    val plan: String?,
    val meters: List<SettingsUsageMeter>,
)

data class SettingsAgentsProjection(
    val agents: List<SettingsAgentRow>,
    val usage: List<SettingsProviderUsageRow>,
    val usageFromCache: Boolean,
)

/** Explicit per-environment load state derived from the authoritative agent cache. */
enum class SettingsAgentEnvironment { Windows, Wsl }

enum class SettingsAgentLoadState { NotLoaded, LoadedEmpty, Populated }

data class SettingsAgentEnvironmentSection(
    val environment: SettingsAgentEnvironment,
    val loadState: SettingsAgentLoadState,
    val agents: List<SettingsAgentRow>,
)

/**
 * Authoritative agent projection split by environment. The host replay cache
 * ([com.poracode.app.session.replay.HostReplayCacheUi]) carries explicit loaded
 * flags per environment (Windows/WSL full scans); the on-demand settings API
 * snapshot is the fallback. Not-loaded is distinct from loaded-empty so an empty
 * authoritative scan is never shown as a spinner.
 */
data class SettingsAuthoritativeAgents(
    val sections: List<SettingsAgentEnvironmentSection>,
) {
    companion object {
        val EMPTY = SettingsAuthoritativeAgents(emptyList())
    }
}

internal fun projectAgents(
    statuses: AgentStatusesSnapshot?,
    usage: ProviderUsageSnapshot?,
): SettingsAgentsProjection {
    val agents = buildList {
        statuses?.windows.orEmpty().mapTo(this) { it.agentRow("native") }
        statuses?.wsl.orEmpty().mapTo(this) { it.agentRow("wsl") }
    }.sortedWith(compareBy<SettingsAgentRow> { it.label.lowercase() }.thenBy { it.key })
    val providers = usage?.snapshots.orEmpty().mapNotNull { value ->
        val providerId = value.string("providerId") ?: return@mapNotNull null
        SettingsProviderUsageRow(
            providerId = providerId,
            status = value.string("status") ?: "unknown",
            plan = value.string("plan"),
            meters = value.objects("windows").mapNotNull { window ->
                val label = window.string("label") ?: return@mapNotNull null
                val percent = window.double("usedPercent") ?: return@mapNotNull null
                SettingsUsageMeter(label, percent.coerceIn(0.0, 100.0))
            },
        )
    }.sortedBy { it.providerId.lowercase() }
    return SettingsAgentsProjection(agents, providers, usage?.fromCache == true)
}

/**
 * Project the authoritative host-replay agent cache per environment, falling back
 * to the on-demand settings API snapshot. Replay loaded flags distinguish a not-yet-
 * scanned environment from a scanned-but-empty one.
 */
internal fun projectAuthoritativeAgents(
    cache: com.poracode.app.session.replay.HostReplayCacheUi,
    statuses: AgentStatusesSnapshot?,
): SettingsAuthoritativeAgents {
    val windows = environmentSection(
        environment = SettingsAgentEnvironment.Windows,
        replayLoaded = cache.agentWindowsLoaded,
        replayAgents = cache.agentWindowsStatuses,
        snapshotAgents = statuses?.windows,
        defaultEnvironment = "native",
    )
    val wsl = environmentSection(
        environment = SettingsAgentEnvironment.Wsl,
        replayLoaded = cache.agentWslLoaded,
        replayAgents = cache.agentWslStatuses,
        snapshotAgents = statuses?.wsl,
        defaultEnvironment = "wsl",
    )
    return SettingsAuthoritativeAgents(listOf(windows, wsl))
}

private fun environmentSection(
    environment: SettingsAgentEnvironment,
    replayLoaded: Boolean,
    replayAgents: List<AgentStatusEntry>,
    snapshotAgents: List<JsonObject>?,
    defaultEnvironment: String,
): SettingsAgentEnvironmentSection {
    val rows: List<SettingsAgentRow>
    val loaded: Boolean
    when {
        replayLoaded -> {
            rows = replayAgents.map { it.toRow(defaultEnvironment) }
            loaded = true
        }
        snapshotAgents != null -> {
            rows = snapshotAgents.map { it.agentRow(defaultEnvironment) }
            loaded = true
        }
        else -> {
            rows = emptyList()
            loaded = false
        }
    }
    val state = when {
        !loaded -> SettingsAgentLoadState.NotLoaded
        rows.isEmpty() -> SettingsAgentLoadState.LoadedEmpty
        else -> SettingsAgentLoadState.Populated
    }
    return SettingsAgentEnvironmentSection(environment, state, rows)
        .sorted()
}

private fun SettingsAgentEnvironmentSection.sorted(): SettingsAgentEnvironmentSection =
    copy(agents = agents.sortedWith(compareBy<SettingsAgentRow> { it.label.lowercase() }.thenBy { it.key }))

private fun AgentStatusEntry.toRow(defaultEnvironment: String): SettingsAgentRow {
    val environment = when (envKind) {
        AgentStatusEntry.ENV_WINDOWS, AgentStatusEntry.ENV_WSL, AgentStatusEntry.ENV_POSIX -> envKind
        else -> defaultEnvironment
    }
    return SettingsAgentRow(
        key = identityKey,
        label = label.ifBlank { kind },
        installed = installed,
        version = version,
        authState = authState.ifBlank { "unknown" },
        environment = environment,
    )
}

private fun JsonObject.agentRow(defaultEnvironment: String): SettingsAgentRow {
    val kind = string("kind") ?: "agent"
    val environment = string("envDistro") ?: string("envKind") ?: defaultEnvironment
    return SettingsAgentRow(
        key = "$kind:$environment",
        label = string("label") ?: kind,
        installed = bool("installed"),
        version = string("version"),
        authState = string("authState") ?: "unknown",
        environment = environment,
    )
}
