// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30d_f27f5fbb46(
    @SerialName("activeDays") val activeDays: Long,
    @SerialName("aiActions") val aiActions: List<RouteprofileU2DCoreU2DStatsResponseU2DAiActionsU2DItem_bb42560f34>,
    @SerialName("days") val days: Long,
    @SerialName("effortTurns") val effortTurns: Long,
    @SerialName("efforts") val efforts: List<RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc>,
    @SerialName("fastTurns") val fastTurns: Long,
    @SerialName("goals") val goals: Long,
    @SerialName("hours") val hours: List<RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30dU2DHoursU2DItem_0b5160b377>,
    @SerialName("longestTaskMs") val longestTaskMs: Long,
    @SerialName("mcpToolCalls") val mcpToolCalls: Long,
    @SerialName("mcps") val mcps: List<RouteprofileU2DCoreU2DStatsResponseU2DMcpsU2DItem_9137d87075>,
    @SerialName("messages") val messages: Long,
    @SerialName("models") val models: List<RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc>,
    @SerialName("modes") val modes: List<RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc>,
    @SerialName("prompts") val prompts: Long,
    @SerialName("providers") val providers: List<RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc>,
    @SerialName("skills") val skills: List<RouteprofileU2DCoreU2DStatsResponseU2DMcpsU2DItem_9137d87075>,
    @SerialName("skillsUsed") val skillsUsed: Long,
    @SerialName("subagentRuns") val subagentRuns: Long,
    @SerialName("threads") val threads: Long,
    @SerialName("totalTurnMs") val totalTurnMs: Long,
    @SerialName("weekdayPrompts") val weekdayPrompts: Long,
    @SerialName("weekendPrompts") val weekendPrompts: Long,
    @SerialName("workflowRuns") val workflowRuns: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("activeDays", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("aiActions", "List<RouteprofileU2DCoreU2DStatsResponseU2DAiActionsU2DItem_bb42560f34>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("days", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("effortTurns", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("efforts", "List<RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fastTurns", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("goals", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("hours", "List<RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30dU2DHoursU2DItem_0b5160b377>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("longestTaskMs", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mcpToolCalls", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mcps", "List<RouteprofileU2DCoreU2DStatsResponseU2DMcpsU2DItem_9137d87075>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("messages", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("models", "List<RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modes", "List<RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prompts", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providers", "List<RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("skills", "List<RouteprofileU2DCoreU2DStatsResponseU2DMcpsU2DItem_9137d87075>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("skillsUsed", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("subagentRuns", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threads", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("totalTurnMs", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("weekdayPrompts", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("weekendPrompts", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("workflowRuns", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprofileU2DCoreU2DStatsResponseU2DRecent_d2af525e07(
    @SerialName("last30d") val last30d: RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30d_f27f5fbb46,
    @SerialName("last7d") val last7d: RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30d_f27f5fbb46,
    @SerialName("prev30d") val prev30d: RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30d_f27f5fbb46,
    @SerialName("prev7d") val prev7d: RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30d_f27f5fbb46,
    @SerialName("today") val today: RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30d_f27f5fbb46,
    @SerialName("windowHours") val windowHours: RemoteField<List<RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30dU2DHoursU2DItem_0b5160b377>> = RemoteField.Missing,
    @SerialName("yesterday") val yesterday: RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30d_f27f5fbb46,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("last30d", "RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30d_f27f5fbb46", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("last7d", "RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30d_f27f5fbb46", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prev30d", "RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30d_f27f5fbb46", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prev7d", "RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30d_f27f5fbb46", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("today", "RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30d_f27f5fbb46", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("windowHours", "List<RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30dU2DHoursU2DItem_0b5160b377>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("yesterday", "RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30d_f27f5fbb46", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprofileU2DCoreU2DStatsResponseU2DTotals_22f3597ef0(
    @SerialName("activeDays") val activeDays: Long,
    @SerialName("currentStreakDays") val currentStreakDays: Long,
    @SerialName("goalsSet") val goalsSet: Long,
    @SerialName("longestStreakDays") val longestStreakDays: Long,
    @SerialName("longestTaskMs") val longestTaskMs: Long,
    @SerialName("messagesSent") val messagesSent: Long,
    @SerialName("totalPrompts") val totalPrompts: Long,
    @SerialName("totalThreads") val totalThreads: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("activeDays", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("currentStreakDays", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("goalsSet", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("longestStreakDays", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("longestTaskMs", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("messagesSent", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("totalPrompts", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("totalThreads", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprofileU2DCoreU2DStatsResponse_42cbe66f12(
    @SerialName("accounts") val accounts: List<RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc>,
    @SerialName("aiActions") val aiActions: List<RouteprofileU2DCoreU2DStatsResponseU2DAiActionsU2DItem_bb42560f34>,
    @SerialName("availableAccounts") val availableAccounts: List<RouteprofileU2DCoreU2DStatsResponseU2DAvailableAccountsU2DItem_9ec272a824>,
    @SerialName("device") val device: RouteprofileU2DCoreU2DStatsResponseU2DDevice_26f96950d2,
    @SerialName("generatedAt") val generatedAt: Long,
    @SerialName("identity") val identity: RouteprofileU2DCoreU2DStatsResponseU2DIdentity_da76232259,
    @SerialName("insights") val insights: RouteprofileU2DCoreU2DStatsResponseU2DInsights_d1beee40ea,
    @SerialName("mcps") val mcps: List<RouteprofileU2DCoreU2DStatsResponseU2DMcpsU2DItem_9137d87075>,
    @SerialName("models") val models: List<RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc>,
    @SerialName("modes") val modes: List<RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc>,
    @SerialName("promptHeatmap") val promptHeatmap: RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmap_c1094a243b,
    @SerialName("providers") val providers: List<RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc>,
    @SerialName("recent") val recent: RemoteField<RouteprofileU2DCoreU2DStatsResponseU2DRecent_d2af525e07> = RemoteField.Missing,
    @SerialName("scope") val scope: RouteprofileU2DCoreU2DStatsRequestU2DScope_b99ee3af30,
    @SerialName("skills") val skills: List<RouteprofileU2DCoreU2DStatsResponseU2DMcpsU2DItem_9137d87075>,
    @SerialName("timezoneOffsetMinutes") val timezoneOffsetMinutes: Long,
    @SerialName("totals") val totals: RouteprofileU2DCoreU2DStatsResponseU2DTotals_22f3597ef0,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("accounts", "List<RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("aiActions", "List<RouteprofileU2DCoreU2DStatsResponseU2DAiActionsU2DItem_bb42560f34>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("availableAccounts", "List<RouteprofileU2DCoreU2DStatsResponseU2DAvailableAccountsU2DItem_9ec272a824>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("device", "RouteprofileU2DCoreU2DStatsResponseU2DDevice_26f96950d2", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("generatedAt", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("identity", "RouteprofileU2DCoreU2DStatsResponseU2DIdentity_da76232259", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("insights", "RouteprofileU2DCoreU2DStatsResponseU2DInsights_d1beee40ea", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mcps", "List<RouteprofileU2DCoreU2DStatsResponseU2DMcpsU2DItem_9137d87075>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("models", "List<RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modes", "List<RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("promptHeatmap", "RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmap_c1094a243b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providers", "List<RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("recent", "RouteprofileU2DCoreU2DStatsResponseU2DRecent_d2af525e07", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scope", "RouteprofileU2DCoreU2DStatsRequestU2DScope_b99ee3af30", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("skills", "List<RouteprofileU2DCoreU2DStatsResponseU2DMcpsU2DItem_9137d87075>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("timezoneOffsetMinutes", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("totals", "RouteprofileU2DCoreU2DStatsResponseU2DTotals_22f3597ef0", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
