// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItem_c96dee8710(
    @SerialName("key") val key: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("label") val label: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("totals") val totals: RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItemU2DTotals_e0fa095c6a,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("key", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("totals", "RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItemU2DTotals_e0fa095c6a", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DDayModelsU2DItem_9939fd9aa1(
    @SerialName("day") val day: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("model") val model: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("totals") val totals: RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItemU2DTotals_e0fa095c6a,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("day", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("totals", "RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItemU2DTotals_e0fa095c6a", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DDayProvidersU2DItem_3cba112875(
    @SerialName("day") val day: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("provider") val provider: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("totals") val totals: RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItemU2DTotals_e0fa095c6a,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("day", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("provider", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("totals", "RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItemU2DTotals_e0fa095c6a", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DDaysU2DItem_01b65e34c5(
    @SerialName("day") val day: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("totals") val totals: RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItemU2DTotals_e0fa095c6a,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("day", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("totals", "RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItemU2DTotals_e0fa095c6a", true, false, null, null, null, null, null, null, null, null, listOf()),
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
