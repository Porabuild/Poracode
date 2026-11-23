// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class ProceduregetProviderUsageRequest_f2b9759b60(
    @SerialName("force") val force: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("providerIds") val providerIds: RemoteField<List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("force", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerIds", "List<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregetProviderUsageResultU2DRingLayoutsU2DValue_4b47ae3fc7(
    @SerialName("innerWindowId") val innerWindowId: RemoteField<String> = RemoteField.Missing,
    @SerialName("outerWindowId") val outerWindowId: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("innerWindowId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("outerWindowId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProceduregetProviderUsageResultU2DRingLayouts_80c5703401 = Map<String, ProceduregetProviderUsageResultU2DRingLayoutsU2DValue_4b47ae3fc7>

@Serializable
enum class ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203 {
    @SerialName("today") TODAY,
    @SerialName("7d") N7D,
    @SerialName("30d") N30D,
    @SerialName("cycle") CYCLE,
}

@Serializable
data class ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DCost_4147389dac(
    @SerialName("amount") val amount: Double,
    @SerialName("currency") val currency: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("estimated") val estimated: Boolean,
    @SerialName("period") val period: ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("amount", "Double", true, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("currency", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("estimated", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("period", "ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DCredits_a39dd04104(
    @SerialName("balance") val balance: Double,
    @SerialName("currency") val currency: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("label") val label: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("unlimited") val unlimited: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("balance", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("currency", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("unlimited", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DStatus_3466b9b69c {
    @SerialName("ok") OK,
    @SerialName("auth-missing") AUTHU2DMISSING,
    @SerialName("app-not-running") APPU2DNOTU2DRUNNING,
    @SerialName("rate-limited") RATEU2DLIMITED,
    @SerialName("quota-hit") QUOTAU2DHIT,
    @SerialName("unsupported") UNSUPPORTED,
    @SerialName("error") ERROR,
}

@Serializable
data class ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DTokens_36a14ea6cf(
    @SerialName("cacheRead") val cacheRead: RemoteField<Double> = RemoteField.Missing,
    @SerialName("cacheWrite") val cacheWrite: RemoteField<Double> = RemoteField.Missing,
    @SerialName("input") val input: RemoteField<Double> = RemoteField.Missing,
    @SerialName("output") val output: RemoteField<Double> = RemoteField.Missing,
    @SerialName("period") val period: RemoteField<ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203> = RemoteField.Missing,
    @SerialName("total") val total: RemoteField<Double> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cacheRead", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("cacheWrite", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("input", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("output", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("period", "ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("total", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DIdU2DOptionU2D1_7e8114c3dd {
    @SerialName("session-5h") SESSIONU2D5H,
    @SerialName("daily") DAILY,
    @SerialName("weekly") WEEKLY,
    @SerialName("weekly-opus") WEEKLYU2DOPUS,
    @SerialName("weekly-sonnet") WEEKLYU2DSONNET,
    @SerialName("weekly-fable") WEEKLYU2DFABLE,
    @SerialName("monthly") MONTHLY,
    @SerialName("extra-usage") EXTRAU2DUSAGE,
    @SerialName("cursor-auto") CURSORU2DAUTO,
    @SerialName("cursor-api") CURSORU2DAPI,
}

@Serializable(with = ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4.Serializer::class)
sealed interface ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4 {
    data class Option1(val value: ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DIdU2DOptionU2D1_7e8114c3dd) : ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4
    data class Option2(val value: String) : ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4
    data class Option3(val value: String) : ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4
    data class Option4(val value: String) : ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4
    data class Option5(val value: String) : ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4
    object Serializer : KSerializer<ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4")
        override fun deserialize(decoder: Decoder): ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesString(element, literals = listOf(JsonPrimitive("session-5h"), JsonPrimitive("daily"), JsonPrimitive("weekly"), JsonPrimitive("weekly-opus"), JsonPrimitive("weekly-sonnet"), JsonPrimitive("weekly-fable"), JsonPrimitive("monthly"), JsonPrimitive("extra-usage"), JsonPrimitive("cursor-auto"), JsonPrimitive("cursor-api")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DIdU2DOptionU2D1_7e8114c3dd>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesString(element, pattern = "^gemini:.+")) { Option2(jsonDecoder.json.decodeFromJsonElement<String>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesString(element, pattern = "^codex:.+")) { Option3(jsonDecoder.json.decodeFromJsonElement<String>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesString(element, pattern = "^antigravity:.+")) { Option4(jsonDecoder.json.decodeFromJsonElement<String>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesString(element, pattern = "^factory:.+")) { Option5(jsonDecoder.json.decodeFromJsonElement<String>(element)) }
            return RemoteUnionCodec.first("ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4", matches)
        }
        override fun serialize(encoder: Encoder, value: ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DIdU2DOptionU2D1_7e8114c3dd>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<String>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<String>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<String>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<String>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}
