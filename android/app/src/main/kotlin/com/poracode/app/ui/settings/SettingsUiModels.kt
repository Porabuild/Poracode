package com.poracode.app.ui.settings

import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.settings.AgentStatusesSnapshot
import com.poracode.app.model.settings.HostSettingsPatch
import com.poracode.app.model.settings.HostSettingsSnapshot
import com.poracode.app.model.settings.ProfileCoreStatsSnapshot
import com.poracode.app.model.settings.ProfileDevicesSnapshot
import com.poracode.app.model.settings.ProfileIdentityRequest
import com.poracode.app.model.settings.ProfileIdentitySnapshot
import com.poracode.app.model.settings.ProfileTokenStatsSnapshot
import com.poracode.app.model.settings.ProviderUsageSnapshot
import com.poracode.app.session.settings.SettingsHostLease
import com.poracode.app.session.settings.SettingsOperationFailure
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put

enum class SettingsPane {
    Host,
    Agents,
    Profile,
    Preferences,
}

data class SettingsUiAccess(
    val hasSelection: Boolean,
    val compatible: Boolean,
    val online: Boolean,
    val ready: Boolean,
    val canRead: Boolean,
    val canWrite: Boolean,
) {
    companion object {
        fun from(lease: SettingsHostLease?): SettingsUiAccess {
            val compatible = lease?.protocolVersion == 8
            val online = lease?.online == true
            val ready = lease?.ready == true
            return SettingsUiAccess(
                hasSelection = lease != null,
                compatible = compatible,
                online = online,
                ready = ready,
                canRead = compatible && online && ready && "session:read" in lease!!.scopes,
                canWrite = compatible && online && ready && "session:operate" in lease!!.scopes,
            )
        }
    }
}

data class SettingsHostMetadata(
    val connectionId: ClientConnectionId,
    val label: String,
    val appVersion: String,
    val platform: String?,
    val hostMode: String?,
)

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

data class SettingsIdentityDraft(
    val name: String,
    val handle: String,
    val avatarColor: String,
) {
    val isValid: Boolean
        get() = name.length <= 80 && handle.length <= 40 && avatarColor.length <= 64 &&
            COLOR.matches(avatarColor)

    fun request(): ProfileIdentityRequest {
        require(isValid)
        return ProfileIdentityRequest(name.trim(), handle.trim().removePrefix("@"), avatarColor.trim())
    }

    companion object {
        val Empty = SettingsIdentityDraft("", "", "#6750A4")
        private val COLOR = Regex("^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$")
    }
}

data class SettingsProfileDeviceRow(
    val label: String,
    val platform: String,
    val current: Boolean,
)

data class SettingsProfileProjection(
    val identity: SettingsIdentityDraft,
    val devices: List<SettingsProfileDeviceRow>,
    val totalThreads: Long?,
    val totalPrompts: Long?,
    val messagesSent: Long?,
    val currentStreakDays: Long?,
    val tokenStatsAvailable: Boolean,
    val lifetimeTokens: Long?,
)

data class SettingsPreferencesDraft(
    val titleGenerationFast: Boolean,
    val commitGenerationFast: Boolean,
    val conflictResolutionFast: Boolean,
) {
    fun patchFrom(baseline: SettingsPreferencesDraft): HostSettingsPatch? {
        val fields = buildJsonObject {
            if (titleGenerationFast != baseline.titleGenerationFast) {
                put("titleGenFast", titleGenerationFast)
            }
            if (commitGenerationFast != baseline.commitGenerationFast) {
                put("commitGenFast", commitGenerationFast)
            }
            if (conflictResolutionFast != baseline.conflictResolutionFast) {
                put("conflictResolverFast", conflictResolutionFast)
            }
        }
        return fields.takeIf { it.isNotEmpty() }?.let(HostSettingsPatch::from)
    }
}

sealed interface SettingsMutationOutcome {
    data object Applied : SettingsMutationOutcome
    data object Stale : SettingsMutationOutcome
    data class Failed(
        val failure: SettingsOperationFailure,
        val refreshedAfterAmbiguousResult: Boolean,
    ) : SettingsMutationOutcome
}

data class SettingsMutationState(
    val profileSaving: Boolean = false,
    val settingsSaving: Boolean = false,
    val profileOutcome: SettingsMutationOutcome? = null,
    val settingsOutcome: SettingsMutationOutcome? = null,
)

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

internal fun projectProfile(
    devices: ProfileDevicesSnapshot?,
    core: ProfileCoreStatsSnapshot?,
    tokens: ProfileTokenStatsSnapshot?,
    identityResponse: ProfileIdentitySnapshot?,
): SettingsProfileProjection {
    val identity = identityResponse?.identity ?: core?.identity
    val totals = core?.canonical?.obj("totals")
    return SettingsProfileProjection(
        identity = SettingsIdentityDraft(
            name = identity?.string("name").orEmpty(),
            handle = identity?.string("handle").orEmpty(),
            avatarColor = identity?.string("avatarColor") ?: SettingsIdentityDraft.Empty.avatarColor,
        ),
        devices = devices?.devices.orEmpty().mapNotNull { value ->
            val label = value.string("label") ?: return@mapNotNull null
            SettingsProfileDeviceRow(
                label = label,
                platform = value.string("platform").orEmpty(),
                current = value.bool("isCurrent") ||
                    value.string("id") == devices?.currentDeviceId,
            )
        },
        totalThreads = totals?.long("totalThreads"),
        totalPrompts = totals?.long("totalPrompts"),
        messagesSent = totals?.long("messagesSent"),
        currentStreakDays = totals?.long("currentStreakDays"),
        tokenStatsAvailable = tokens?.available == true,
        lifetimeTokens = tokens?.canonical?.long("lifetimeTokens"),
    )
}

internal fun projectPreferences(snapshot: HostSettingsSnapshot?): SettingsPreferencesDraft? {
    val settings = snapshot?.settings ?: return null
    return SettingsPreferencesDraft(
        titleGenerationFast = settings.bool("titleGenFast"),
        commitGenerationFast = settings.bool("commitGenFast"),
        conflictResolutionFast = settings.bool("conflictResolverFast"),
    )
}

internal fun SettingsOperationFailure.isAmbiguousMutation(): Boolean =
    this is SettingsOperationFailure.Remote && requestMayHaveCommitted

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

private fun JsonObject.string(name: String): String? =
    (get(name) as? JsonPrimitive)?.takeIf { it.isString }?.content

private fun JsonObject.bool(name: String): Boolean =
    (get(name) as? JsonPrimitive)?.booleanOrNull == true

private fun JsonObject.long(name: String): Long? =
    (get(name) as? JsonPrimitive)?.longOrNull

private fun JsonObject.double(name: String): Double? =
    (get(name) as? JsonPrimitive)?.doubleOrNull

private fun JsonObject.obj(name: String): JsonObject? = get(name) as? JsonObject

private fun JsonObject.objects(name: String): List<JsonObject> =
    (get(name) as? JsonArray).orEmpty().mapNotNull { it as? JsonObject }
