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
    val trends: SettingsProfileTrendsProjection?,
)

data class SettingsProfileProviderDeltaRow(
    val provider: String,
    val deltaPercent: Int,
)

data class SettingsProfileTrendsProjection(
    val yesterdayPrompts: Long,
    val yesterdayTopProvider: String?,
    val yesterdayTopProviderPercent: Int?,
    val yesterdayTokens: Long?,
    val last7dPrompts: Long,
    val last7dDeltaPercent: Int?,
    val avgTaskSeconds: Int?,
    val weekendPercent: Int?,
    val cacheHitPercent: Int?,
    val providerSwitch: Pair<String, String>?,
    val modelSwitch: Pair<String, String>?,
    val providerDeltas: List<SettingsProfileProviderDeltaRow>,
)

data class SettingsProfileTokenProviderRow(
    val providerId: String,
    val label: String,
    val tokens: Long,
    val estimatedCostUsd: Double?,
)

private fun compactModelLabel(key: String, label: String): String {
    val sep = key.indexOf('\u001f')
    return if (sep >= 0 && sep + 1 < key.length) key.substring(sep + 1) else label
}

private fun parseProfileTrends(
    coreRecent: kotlinx.serialization.json.JsonObject?,
    tokenRecent: kotlinx.serialization.json.JsonObject?,
): SettingsProfileTrendsProjection? {
    val yesterday = coreRecent?.obj("yesterday") ?: return null
    val last7d = coreRecent.obj("last7d") ?: return null
    val prev7d = coreRecent.obj("prev7d")
    val last30d = coreRecent.obj("last30d")

    val yesterdayPrompts = yesterday.long("prompts") ?: 0L
    val yTop = yesterday.objects("providers").firstOrNull()
    val yTopLabel = yTop?.string("label")
    val yTopPct = yTop?.double("percent")?.let { kotlin.math.round(it).toInt() }

    val last7dPrompts = last7d.long("prompts") ?: 0L
    val prev7dPrompts = prev7d?.long("prompts") ?: 0L
    val weekDeltaPct = if (prev7dPrompts > 0L) {
        kotlin.math.round(((last7dPrompts - prev7dPrompts).toDouble() / prev7dPrompts) * 100.0).toInt()
    } else null

    val totalTurnMs = last7d.long("totalTurnMs") ?: 0L
    val avgTaskSeconds = if (last7dPrompts > 0L && totalTurnMs >= 1000L) {
        (totalTurnMs / last7dPrompts / 1000L).toInt()
    } else null

    val weekdayPrompts = (last30d?.long("weekdayPrompts") ?: 0L)
    val weekendPrompts = (last30d?.long("weekendPrompts") ?: 0L)
    val rhythmTotal = weekdayPrompts + weekendPrompts
    val weekendPercent = if (rhythmTotal >= 15L && weekendPrompts > 0L) {
        kotlin.math.round((weekendPrompts.toDouble() / rhythmTotal) * 100.0).toInt()
    } else null

    val prevProviders = prev7d?.objects("providers").orEmpty()
    val currProviders = last7d.objects("providers")
    val prevTopProv = prevProviders.firstOrNull()
    val currTopProv = currProviders.firstOrNull()
    val providerSwitch = if (
        prev7dPrompts >= 8L && last7dPrompts >= 8L &&
        prevTopProv != null && currTopProv != null &&
        prevTopProv.string("key") != currTopProv.string("key") &&
        (prevTopProv.double("percent") ?: 0.0) >= 30.0 &&
        (currTopProv.double("percent") ?: 0.0) >= 30.0
    ) {
        val from = prevTopProv.string("label")
        val to = currTopProv.string("label")
        if (from != null && to != null) from to to else null
    } else null

    val prevTopModel = prev7d?.objects("models")?.firstOrNull()
    val currTopModel = last7d.objects("models").firstOrNull()
    val modelSwitch = if (
        prev7dPrompts >= 8L && last7dPrompts >= 8L &&
        prevTopModel != null && currTopModel != null &&
        prevTopModel.string("key") != currTopModel.string("key") &&
        (prevTopModel.double("percent") ?: 0.0) >= 30.0 &&
        (currTopModel.double("percent") ?: 0.0) >= 30.0
    ) {
        val fromKey = prevTopModel.string("key").orEmpty()
        val fromLabel = prevTopModel.string("label").orEmpty()
        val toKey = currTopModel.string("key").orEmpty()
        val toLabel = currTopModel.string("label").orEmpty()
        val from = compactModelLabel(fromKey, fromLabel)
        val to = compactModelLabel(toKey, toLabel)
        if (from.isNotBlank() && to.isNotBlank() && from != to) from to to else null
    } else null

    val prevMap = prevProviders.mapNotNull { p ->
        val k = p.string("key") ?: return@mapNotNull null
        val lbl = p.string("label") ?: k
        val cnt = p.double("count") ?: 0.0
        k to (lbl to cnt)
    }.toMap()
    val currMap = currProviders.mapNotNull { p ->
        val k = p.string("key") ?: return@mapNotNull null
        val lbl = p.string("label") ?: k
        val cnt = p.double("count") ?: 0.0
        k to (lbl to cnt)
    }.toMap()
    val deltas = (prevMap.keys + currMap.keys).mapNotNull { key ->
        val prevEntry = prevMap[key]
        val currEntry = currMap[key]
        val prevCount = prevEntry?.second ?: 0.0
        val currCount = currEntry?.second ?: 0.0
        if (prevCount < 5.0 || kotlin.math.abs(currCount - prevCount) < 3.0) return@mapNotNull null
        val pct = kotlin.math.round(((currCount - prevCount) / prevCount) * 100.0).toInt()
        if (kotlin.math.abs(pct) < 15) return@mapNotNull null
        val label = currEntry?.first ?: prevEntry!!.first
        SettingsProfileProviderDeltaRow(label, pct)
    }.sortedByDescending { kotlin.math.abs(it.deltaPercent) }.take(2)

    val yTokens = tokenRecent?.obj("yesterday")?.long("tokens")?.takeIf { it > 0L }
    val tokLast7d = tokenRecent?.obj("last7d")
    val inputTokens = tokLast7d?.long("inputTokens") ?: 0L
    val cacheRead = tokLast7d?.long("cacheReadTokens") ?: 0L
    val cacheWrite = tokLast7d?.long("cacheWriteTokens") ?: 0L
    val inputTotal = inputTokens + cacheRead + cacheWrite
    val cacheHitPercent = if (inputTotal >= 10_000L && cacheRead > 0L) {
        kotlin.math.round((cacheRead.toDouble() / inputTotal) * 100.0).toInt()
    } else null

    return SettingsProfileTrendsProjection(
        yesterdayPrompts = yesterdayPrompts,
        yesterdayTopProvider = yTopLabel,
        yesterdayTopProviderPercent = yTopPct,
        yesterdayTokens = yTokens,
        last7dPrompts = last7dPrompts,
        last7dDeltaPercent = weekDeltaPct,
        avgTaskSeconds = avgTaskSeconds,
        weekendPercent = weekendPercent,
        cacheHitPercent = cacheHitPercent,
        providerSwitch = providerSwitch,
        modelSwitch = modelSwitch,
        providerDeltas = deltas,
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
        trends = parseProfileTrends(core?.canonical?.obj("recent"), tokensCanonical?.obj("recent")),
    )
}
