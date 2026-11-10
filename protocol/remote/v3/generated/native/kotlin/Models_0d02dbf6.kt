// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
enum class ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DUnit_c263982707 {
    @SerialName("percent") PERCENT,
    @SerialName("tokens") TOKENS,
    @SerialName("requests") REQUESTS,
    @SerialName("credits") CREDITS,
    @SerialName("usd") USD,
}

@Serializable
data class ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItem_3e6404f865(
    @SerialName("currency") val currency: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("id") val id: ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4,
    @SerialName("label") val label: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("limit") val limit: RemoteField<Double> = RemoteField.Missing,
    @SerialName("resetsAt") val resetsAt: RemoteField<Long> = RemoteField.Missing,
    @SerialName("unit") val unit: RemoteField<ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DUnit_c263982707> = RemoteField.Missing,
    @SerialName("used") val used: RemoteField<Double> = RemoteField.Missing,
    @SerialName("usedPercent") val usedPercent: Double,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("currency", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("limit", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("resetsAt", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("unit", "ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DUnit_c263982707", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("used", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("usedPercent", "Double", true, false, 0.0, 100.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregetProviderUsageResultU2DSnapshotsU2DItem_20d7b1e748(
    @SerialName("authenticatedAs") val authenticatedAs: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("cost") val cost: RemoteField<ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DCost_4147389dac> = RemoteField.Missing,
    @SerialName("credits") val credits: RemoteField<ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DCredits_a39dd04104> = RemoteField.Missing,
    @SerialName("error") val error: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("fetchedAt") val fetchedAt: Long,
    @SerialName("plan") val plan: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("providerId") val providerId: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("rateLimitedUntil") val rateLimitedUntil: RemoteField<Long> = RemoteField.Missing,
    @SerialName("status") val status: ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DStatus_3466b9b69c,
    @SerialName("tokens") val tokens: RemoteField<ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DTokens_36a14ea6cf> = RemoteField.Missing,
    @SerialName("windows") val windows: List<ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItem_3e6404f865>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("authenticatedAs", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("cost", "ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DCost_4147389dac", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("credits", "ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DCredits_a39dd04104", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("error", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fetchedAt", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("plan", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerId", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("rateLimitedUntil", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DStatus_3466b9b69c", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tokens", "ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DTokens_36a14ea6cf", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("windows", "List<ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItem_3e6404f865>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregetProviderUsageResult_b0304b9d9d(
    @SerialName("fromCache") val fromCache: Boolean,
    @SerialName("snapshots") val snapshots: List<ProceduregetProviderUsageResultU2DSnapshotsU2DItem_20d7b1e748>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("fromCache", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("snapshots", "List<ProceduregetProviderUsageResultU2DSnapshotsU2DItem_20d7b1e748>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
