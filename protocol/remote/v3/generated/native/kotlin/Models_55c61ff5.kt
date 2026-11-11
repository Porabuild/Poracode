// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RouteprofileU2DCoreU2DStatsResponse_14ac0689f2(
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
            RemoteFieldDescriptor("scope", "RouteprofileU2DCoreU2DStatsRequestU2DScope_b99ee3af30", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("skills", "List<RouteprofileU2DCoreU2DStatsResponseU2DMcpsU2DItem_9137d87075>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("timezoneOffsetMinutes", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("totals", "RouteprofileU2DCoreU2DStatsResponseU2DTotals_22f3597ef0", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprofileU2DDevicesResponse_0943be33f9(
    @SerialName("currentDeviceId") val currentDeviceId: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("devices") val devices: List<RouteprofileU2DCoreU2DStatsResponseU2DDevice_26f96950d2>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("currentDeviceId", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("devices", "List<RouteprofileU2DCoreU2DStatsResponseU2DDevice_26f96950d2>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprofileU2DIdentityResponse_e0bc631a25(
    @SerialName("device") val device: RouteprofileU2DCoreU2DStatsResponseU2DDevice_26f96950d2,
    @SerialName("identity") val identity: RouteprofileU2DCoreU2DStatsResponseU2DIdentity_da76232259,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("device", "RouteprofileU2DCoreU2DStatsResponseU2DDevice_26f96950d2", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("identity", "RouteprofileU2DCoreU2DStatsResponseU2DIdentity_da76232259", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprofileU2DTokenU2DStatsResponseU2DAccountsU2DItem_c30da54b85(
    @SerialName("estimatedCostUsd") val estimatedCostUsd: RemoteField<Double> = RemoteField.Missing,
    @SerialName("label") val label: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("percent") val percent: Double,
    @SerialName("provider") val provider: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("tokens") val tokens: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("estimatedCostUsd", "Double", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("percent", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("provider", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tokens", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItemU2DTotals_05af39c3e9(
    @SerialName("categories") val categories: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DUsageU2DTokens_e70be7a06d,
    @SerialName("categorizedTokens") val categorizedTokens: Long,
    @SerialName("estimatedSamples") val estimatedSamples: Long,
    @SerialName("estimatedTokens") val estimatedTokens: Long,
    @SerialName("estimatedUsd") val estimatedUsd: Double,
    @SerialName("observed") val observed: List<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DUsageU2DCost_ad6bb2de51>,
    @SerialName("observedSamples") val observedSamples: Long,
    @SerialName("observedTokens") val observedTokens: Long,
    @SerialName("tokens") val tokens: Long,
    @SerialName("unpricedTokens") val unpricedTokens: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("categories", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DUsageU2DTokens_e70be7a06d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("categorizedTokens", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("estimatedSamples", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("estimatedTokens", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("estimatedUsd", "Double", true, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("observed", "List<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DUsageU2DCost_ad6bb2de51>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("observedSamples", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("observedTokens", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tokens", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("unpricedTokens", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItem_9751de90fd(
    @SerialName("key") val key: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("label") val label: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("totals") val totals: RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItemU2DTotals_05af39c3e9,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("key", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("totals", "RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItemU2DTotals_05af39c3e9", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DDaysU2DItem_d0762ef770(
    @SerialName("day") val day: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("totals") val totals: RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItemU2DTotals_05af39c3e9,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("day", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("totals", "RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItemU2DTotals_05af39c3e9", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DPricingU2DItem_8ca5860ab0(
    @SerialName("cacheRead") val cacheRead: Double,
    @SerialName("cacheWrite") val cacheWrite: Double,
    @SerialName("cacheWrite1h") val cacheWrite1h: Double,
    @SerialName("effectiveFrom") val effectiveFrom: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("id") val id: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("input") val input: Double,
    @SerialName("model") val model: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("output") val output: Double,
    @SerialName("reviewedAt") val reviewedAt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("source") val source: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cacheRead", "Double", true, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("cacheWrite", "Double", true, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("cacheWrite1h", "Double", true, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("effectiveFrom", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("input", "Double", true, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("output", "Double", true, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reviewedAt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("source", "String", true, false, null, null, null, null, null, null, null, "uri", listOf()),
        ), listOf())
    }
}
