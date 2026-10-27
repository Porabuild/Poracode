// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable(with = RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensity_01baf573c6.Serializer::class)
sealed interface RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensity_01baf573c6 {
    data class Option1(val value: ProcedureprobeMcpServerResultU2DOptionU2D2U2DToolCount_499c88c1c5) : RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensity_01baf573c6
    data class Option2(val value: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72) : RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensity_01baf573c6
    data class Option3(val value: RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D3_f8ba039a2f) : RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensity_01baf573c6
    data class Option4(val value: RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D4_135f7ef79d) : RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensity_01baf573c6
    data class Option5(val value: RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D5_e6cfd13a74) : RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensity_01baf573c6
    object Serializer : KSerializer<RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensity_01baf573c6> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensity_01baf573c6")
        override fun deserialize(decoder: Decoder): RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensity_01baf573c6 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensity_01baf573c6 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensity_01baf573c6>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesNumber(element, integer = false, literals = listOf(JsonPrimitive(0.0)))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedureprobeMcpServerResultU2DOptionU2D2U2DToolCount_499c88c1c5>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesNumber(element, integer = false, literals = listOf(JsonPrimitive(1.0)))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesNumber(element, integer = false, literals = listOf(JsonPrimitive(2.0)))) { Option3(jsonDecoder.json.decodeFromJsonElement<RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D3_f8ba039a2f>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesNumber(element, integer = false, literals = listOf(JsonPrimitive(3.0)))) { Option4(jsonDecoder.json.decodeFromJsonElement<RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D4_135f7ef79d>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesNumber(element, integer = false, literals = listOf(JsonPrimitive(4.0)))) { Option5(jsonDecoder.json.decodeFromJsonElement<RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D5_e6cfd13a74>(element)) }
            return RemoteUnionCodec.first("RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensity_01baf573c6", matches)
        }
        override fun serialize(encoder: Encoder, value: RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensity_01baf573c6) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensity_01baf573c6 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedureprobeMcpServerResultU2DOptionU2D2U2DToolCount_499c88c1c5>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D3_f8ba039a2f>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D4_135f7ef79d>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D5_e6cfd13a74>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItem_07cc5ea327(
    @SerialName("count") val count: Long,
    @SerialName("day") val day: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("intensity") val intensity: RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensity_01baf573c6,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("count", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("day", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("intensity", "RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensity_01baf573c6", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DMetric_b7f9b9a51e {
    @SerialName("prompts") PROMPTS,
    @SerialName("tokens") TOKENS,
}

@Serializable
data class RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmap_c1094a243b(
    @SerialName("cells") val cells: List<RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItem_07cc5ea327>,
    @SerialName("max") val max: Long,
    @SerialName("metric") val metric: RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DMetric_b7f9b9a51e,
    @SerialName("windowDays") val windowDays: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cells", "List<RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItem_07cc5ea327>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("max", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("metric", "RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DMetric_b7f9b9a51e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("windowDays", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
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

@Serializable
data class RouteprofileU2DTokenU2DStatsResponseU2DCosts_70dc157e54(
    @SerialName("accounts") val accounts: List<RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItem_9751de90fd>,
    @SerialName("days") val days: List<RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DDaysU2DItem_d0762ef770>,
    @SerialName("models") val models: List<RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItem_9751de90fd>,
    @SerialName("pricing") val pricing: List<RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DPricingU2DItem_8ca5860ab0>,
    @SerialName("providers") val providers: List<RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItem_9751de90fd>,
    @SerialName("totals") val totals: RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItemU2DTotals_05af39c3e9,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("accounts", "List<RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItem_9751de90fd>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("days", "List<RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DDaysU2DItem_d0762ef770>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("models", "List<RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItem_9751de90fd>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pricing", "List<RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DPricingU2DItem_8ca5860ab0>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providers", "List<RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItem_9751de90fd>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("totals", "RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItemU2DTotals_05af39c3e9", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprofileU2DTokenU2DStatsResponse_8951a961f8(
    @SerialName("accounts") val accounts: List<RouteprofileU2DTokenU2DStatsResponseU2DAccountsU2DItem_c30da54b85>,
    @SerialName("available") val available: Boolean,
    @SerialName("costs") val costs: RemoteField<RouteprofileU2DTokenU2DStatsResponseU2DCosts_70dc157e54> = RemoteField.Missing,
    @SerialName("device") val device: RouteprofileU2DCoreU2DStatsResponseU2DDevice_26f96950d2,
    @SerialName("generatedAt") val generatedAt: Long,
    @SerialName("lifetimeTokens") val lifetimeTokens: Long,
    @SerialName("models") val models: List<RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc>,
    @SerialName("peakDay") val peakDay: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("peakDayTokens") val peakDayTokens: Long,
    @SerialName("providers") val providers: List<RouteprofileU2DTokenU2DStatsResponseU2DAccountsU2DItem_c30da54b85>,
    @SerialName("scope") val scope: RouteprofileU2DCoreU2DStatsRequestU2DScope_b99ee3af30,
    @SerialName("timezoneOffsetMinutes") val timezoneOffsetMinutes: Long,
    @SerialName("tokenHeatmap") val tokenHeatmap: RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmap_c1094a243b,
    @SerialName("unavailableProviders") val unavailableProviders: List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("windowDays") val windowDays: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("accounts", "List<RouteprofileU2DTokenU2DStatsResponseU2DAccountsU2DItem_c30da54b85>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("available", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("costs", "RouteprofileU2DTokenU2DStatsResponseU2DCosts_70dc157e54", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("device", "RouteprofileU2DCoreU2DStatsResponseU2DDevice_26f96950d2", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("generatedAt", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lifetimeTokens", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("models", "List<RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("peakDay", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("peakDayTokens", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providers", "List<RouteprofileU2DTokenU2DStatsResponseU2DAccountsU2DItem_c30da54b85>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scope", "RouteprofileU2DCoreU2DStatsRequestU2DScope_b99ee3af30", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("timezoneOffsetMinutes", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tokenHeatmap", "RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmap_c1094a243b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("unavailableProviders", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("windowDays", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteprojectU2DCommandRequestU2DOptionU2D1U2DKind_4cb4c97502 {
    @SerialName("add-existing") ADDU2DEXISTING,
}

@Serializable
data class RouteprojectU2DCommandRequestU2DOptionU2D1_468209f9bb(
    @SerialName("kind") val kind: RouteprojectU2DCommandRequestU2DOptionU2D1U2DKind_4cb4c97502,
    @SerialName("name") val name: RemoteField<String> = RemoteField.Missing,
    @SerialName("path") val path: String,
    @SerialName("workspaceId") val workspaceId: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteprojectU2DCommandRequestU2DOptionU2D1U2DKind_4cb4c97502", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("workspaceId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprojectU2DCommandRequestU2DOptionU2D2_2b7595c3da(
    @SerialName("kind") val kind: RouteexperimentU2DCommandRequestU2DOptionU2D1U2DKind_1f45188862,
    @SerialName("name") val name: String,
    @SerialName("parentPath") val parentPath: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteexperimentU2DCommandRequestU2DOptionU2D1U2DKind_1f45188862", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("parentPath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteprojectU2DCommandRequestU2DOptionU2D3U2DKind_8793e38088 {
    @SerialName("clone") CLONE,
}

@Serializable
data class RouteprojectU2DCommandRequestU2DOptionU2D3_da66851500(
    @SerialName("kind") val kind: RouteprojectU2DCommandRequestU2DOptionU2D3U2DKind_8793e38088,
    @SerialName("name") val name: String,
    @SerialName("parentPath") val parentPath: String,
    @SerialName("source") val source: ProcedurecloneRepoRequestU2DSource_76b2c94b29,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteprojectU2DCommandRequestU2DOptionU2D3U2DKind_8793e38088", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("parentPath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("source", "ProcedurecloneRepoRequestU2DSource_76b2c94b29", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteprojectU2DCommandRequestU2DOptionU2D4U2DKind_cbc64d1458 {
    @SerialName("update") UPDATE,
}

typealias RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DGhAccount_eb2798e2cc = ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff?

typealias RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DMcpServers_637f685cb2 = List<ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1>?

@Serializable
data class RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1U2DActionsU2DItem_1544bc59ff(
    @SerialName("command") val command: String,
    @SerialName("icon") val icon: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("name") val name: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("command", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("icon", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1_cd124b21d9(
    @SerialName("actions") val actions: RemoteField<List<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1U2DActionsU2DItem_1544bc59ff>> = RemoteField.Missing,
    @SerialName("cleanupScript") val cleanupScript: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("setupScript") val setupScript: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("worktreeCopyPatterns") val worktreeCopyPatterns: RemoteField<List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("actions", "List<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1U2DActionsU2DItem_1544bc59ff>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("cleanupScript", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("setupScript", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeCopyPatterns", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScripts_3155b0e864 = RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1_cd124b21d9?

typealias RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1U2DExclude_cda18ebe4a = Map<String, Boolean>
