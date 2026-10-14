package com.poracode.app.ui.settings

import com.poracode.app.model.settings.ProfileCoreStatsSnapshot
import com.poracode.app.model.settings.ProfileDevicesSnapshot
import com.poracode.app.model.settings.ProfileIdentityRequest
import com.poracode.app.model.settings.ProfileIdentitySnapshot
import com.poracode.app.model.settings.ProfileTokenStatsSnapshot

data class SettingsIdentityDraft(
    val name: String,
    val handle: String,
    val avatarColor: String,
) {
    val isValid: Boolean
        get() = name.length <= 80 && handle.trim().removePrefix("@").length <= 40 &&
            avatarColor.length <= 64

    fun request(): ProfileIdentityRequest {
        require(isValid)
        return ProfileIdentityRequest(name.trim(), handle.trim().removePrefix("@"), avatarColor.trim())
    }

    companion object {
        val Empty = SettingsIdentityDraft("", "", "#6750A4")
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
    val goalsSet: Long?,
    val workflowRuns: Long?,
    val subagentRuns: Long?,
    val totalSkillsUsed: Long?,
    val mcpToolCalls: Long?,
    val tokenStatsAvailable: Boolean,
    val lifetimeTokens: Long?,
    val peakDayTokens: Long?,
    val tokenProviders: List<SettingsProfileTokenProviderRow>,
)

data class SettingsProfileTokenProviderRow(
    val providerId: String,
    val label: String,
    val tokens: Long,
    val estimatedCostUsd: Double?,
)

internal fun projectProfile(
    devices: ProfileDevicesSnapshot?,
    core: ProfileCoreStatsSnapshot?,
    tokens: ProfileTokenStatsSnapshot?,
    identityResponse: ProfileIdentitySnapshot?,
): SettingsProfileProjection {
    val identity = identityResponse?.identity ?: core?.identity
    val totals = core?.canonical?.obj("totals")
    val insights = core?.canonical?.obj("insights")
    val tokensCanonical = tokens?.canonical
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
        goalsSet = totals?.long("goalsSet"),
        workflowRuns = insights?.long("workflowRuns"),
        subagentRuns = insights?.long("subagentRuns"),
        totalSkillsUsed = insights?.long("totalSkillsUsed"),
        mcpToolCalls = insights?.long("mcpToolCalls"),
        tokenStatsAvailable = tokens?.available == true,
        lifetimeTokens = tokensCanonical?.long("lifetimeTokens"),
        peakDayTokens = tokensCanonical?.long("peakDayTokens"),
        tokenProviders = tokensCanonical?.objects("providers").orEmpty().mapNotNull { value ->
            val providerId = value.string("provider") ?: return@mapNotNull null
            val tokenCount = value.long("tokens") ?: return@mapNotNull null
            SettingsProfileTokenProviderRow(
                providerId = providerId,
                label = value.string("label") ?: providerId,
                tokens = tokenCount,
                estimatedCostUsd = value.double("estimatedCostUsd"),
            )
        },
    )
}
