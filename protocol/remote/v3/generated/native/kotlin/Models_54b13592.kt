// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
enum class RoutememoryU2DCatalogResponseU2DOptionU2D1U2DResultU2DCaptureTiming_21aabfa824 {
    @SerialName("settle-2m") SETTLEU2D2M,
    @SerialName("settle-90s") SETTLEU2D90S,
    @SerialName("custom") CUSTOM,
    @SerialName("lifecycle") LIFECYCLE,
}

@Serializable
data class RoutememoryU2DCatalogResponseU2DOptionU2D1U2DResultU2DLastDreamCountsU2DOptionU2D1_7ef1b245d5(
    @SerialName("promoted") val promoted: Long,
    @SerialName("retired") val retired: Long,
    @SerialName("suggested") val suggested: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("promoted", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("retired", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("suggested", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RoutememoryU2DCatalogResponseU2DOptionU2D1U2DResultU2DLastDreamCounts_4fbe9bf7e2 = RoutememoryU2DCatalogResponseU2DOptionU2D1U2DResultU2DLastDreamCountsU2DOptionU2D1_7ef1b245d5?

@Serializable
enum class RoutememoryU2DCatalogResponseU2DOptionU2D1U2DResultU2DThreadModeU2DOptionU2D1_28f26b87e5 {
    @SerialName("learn") LEARN,
    @SerialName("recall") RECALL,
    @SerialName("incognito") INCOGNITO,
}

typealias RoutememoryU2DCatalogResponseU2DOptionU2D1U2DResultU2DThreadMode_7d35bc9ac5 = RoutememoryU2DCatalogResponseU2DOptionU2D1U2DResultU2DThreadModeU2DOptionU2D1_28f26b87e5?

@Serializable
data class RoutememoryU2DCatalogResponseU2DOptionU2D1U2DResult_61b9b3b3c2(
    @SerialName("captureTiming") val captureTiming: RoutememoryU2DCatalogResponseU2DOptionU2D1U2DResultU2DCaptureTiming_21aabfa824,
    @SerialName("enabled") val enabled: Boolean,
    @SerialName("entryCount") val entryCount: Long,
    @SerialName("lastDreamAt") val lastDreamAt: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>,
    @SerialName("lastDreamCounts") val lastDreamCounts: RemoteField<RoutememoryU2DCatalogResponseU2DOptionU2D1U2DResultU2DLastDreamCountsU2DOptionU2D1_7ef1b245d5> = RemoteField.Missing,
    @SerialName("lastDreamRunId") val lastDreamRunId: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("lastDreamSummary") val lastDreamSummary: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>,
    @SerialName("learning") val learning: Boolean,
    @SerialName("pendingCandidates") val pendingCandidates: Long,
    @SerialName("suggestionCount") val suggestionCount: Long,
    @SerialName("syncEnabled") val syncEnabled: Boolean,
    @SerialName("threadMode") val threadMode: RemoteField<RoutememoryU2DCatalogResponseU2DOptionU2D1U2DResultU2DThreadModeU2DOptionU2D1_28f26b87e5>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("captureTiming", "RoutememoryU2DCatalogResponseU2DOptionU2D1U2DResultU2DCaptureTiming_21aabfa824", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("enabled", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("entryCount", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastDreamAt", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastDreamCounts", "RoutememoryU2DCatalogResponseU2DOptionU2D1U2DResultU2DLastDreamCountsU2DOptionU2D1_7ef1b245d5", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastDreamRunId", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastDreamSummary", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("learning", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pendingCandidates", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("suggestionCount", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("syncEnabled", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadMode", "RoutememoryU2DCatalogResponseU2DOptionU2D1U2DResultU2DThreadModeU2DOptionU2D1_28f26b87e5", true, true, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutememoryU2DCatalogResponseU2DOptionU2D1_c991d95877(
    @SerialName("action") val action: ProcedurehexVoiceRequestU2DOptionU2D10U2DAction_79cc8fd877,
    @SerialName("result") val result: RoutememoryU2DCatalogResponseU2DOptionU2D1U2DResult_61b9b3b3c2,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "ProcedurehexVoiceRequestU2DOptionU2D10U2DAction_79cc8fd877", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("result", "RoutememoryU2DCatalogResponseU2DOptionU2D1U2DResult_61b9b3b3c2", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutememoryU2DCatalogResponseU2DOptionU2D2U2DResultU2DItemU2DSource_c3be644314 {
    @SerialName("learned") LEARNED,
    @SerialName("user") USER,
    @SerialName("import") IMPORT,
    @SerialName("dream") DREAM,
}

@Serializable
data class RoutememoryU2DCatalogResponseU2DOptionU2D2U2DResultU2DItem_ae014c623e(
    @SerialName("archived") val archived: Boolean,
    @SerialName("body") val body: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("category") val category: RoutememoryU2DCatalogRequestU2DOptionU2D3U2DEntryU2DCategory_e3c6a49a61,
    @SerialName("confidence") val confidence: Double,
    @SerialName("createdAt") val createdAt: String,
    @SerialName("id") val id: String,
    @SerialName("lastUsedAt") val lastUsedAt: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>,
    @SerialName("lockedByUser") val lockedByUser: Boolean,
    @SerialName("pinned") val pinned: Boolean,
    @SerialName("polarity") val polarity: RoutememoryU2DCatalogRequestU2DOptionU2D3U2DEntryU2DPolarity_6c042b493a,
    @SerialName("projectId") val projectId: RemoteField<String>,
    @SerialName("quote") val quote: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>,
    @SerialName("repoKey") val repoKey: RemoteField<String> = RemoteField.Missing,
    @SerialName("scope") val scope: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11,
    @SerialName("source") val source: RoutememoryU2DCatalogResponseU2DOptionU2D2U2DResultU2DItemU2DSource_c3be644314,
    @SerialName("summary") val summary: String,
    @SerialName("updatedAt") val updatedAt: String,
    @SerialName("usageCount") val usageCount: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("archived", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("body", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("category", "RoutememoryU2DCatalogRequestU2DOptionU2D3U2DEntryU2DCategory_e3c6a49a61", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("confidence", "Double", true, false, 0.0, 1.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("createdAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastUsedAt", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lockedByUser", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pinned", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("polarity", "RoutememoryU2DCatalogRequestU2DOptionU2D3U2DEntryU2DPolarity_6c042b493a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, true, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("quote", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("repoKey", "String", false, true, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scope", "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("source", "RoutememoryU2DCatalogResponseU2DOptionU2D2U2DResultU2DItemU2DSource_c3be644314", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("summary", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("updatedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("usageCount", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutememoryU2DCatalogResponseU2DOptionU2D2_761c60edbc(
    @SerialName("action") val action: ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0,
    @SerialName("result") val result: List<RoutememoryU2DCatalogResponseU2DOptionU2D2U2DResultU2DItem_ae014c623e>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("result", "List<RoutememoryU2DCatalogResponseU2DOptionU2D2U2DResultU2DItem_ae014c623e>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutememoryU2DCatalogResponseU2DOptionU2D3_c2bfd0a01d(
    @SerialName("action") val action: ProceduremanageModelProvidersRequestU2DOptionU2D2U2DAction_a2bcbae622,
    @SerialName("result") val result: RoutememoryU2DCatalogResponseU2DOptionU2D2U2DResultU2DItem_ae014c623e,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "ProceduremanageModelProvidersRequestU2DOptionU2D2U2DAction_a2bcbae622", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("result", "RoutememoryU2DCatalogResponseU2DOptionU2D2U2DResultU2DItem_ae014c623e", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutememoryU2DCatalogResponseU2DOptionU2D4_a51e1a467e(
    @SerialName("action") val action: RoutememoryU2DCatalogRequestU2DOptionU2D4U2DAction_4d5989d27d,
    @SerialName("result") val result: RoutedeviceU2DDetachResponse_badd682f35,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "RoutememoryU2DCatalogRequestU2DOptionU2D4U2DAction_4d5989d27d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("result", "RoutedeviceU2DDetachResponse_badd682f35", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RoutememoryU2DCatalogResponse_d2a9e452ab.Serializer::class)
sealed interface RoutememoryU2DCatalogResponse_d2a9e452ab {
    data class Option1(val value: RoutememoryU2DCatalogResponseU2DOptionU2D1_c991d95877) : RoutememoryU2DCatalogResponse_d2a9e452ab
    data class Option2(val value: RoutememoryU2DCatalogResponseU2DOptionU2D2_761c60edbc) : RoutememoryU2DCatalogResponse_d2a9e452ab
    data class Option3(val value: RoutememoryU2DCatalogResponseU2DOptionU2D3_c2bfd0a01d) : RoutememoryU2DCatalogResponse_d2a9e452ab
    data class Option4(val value: RoutememoryU2DCatalogResponseU2DOptionU2D4_a51e1a467e) : RoutememoryU2DCatalogResponse_d2a9e452ab
    object Serializer : KSerializer<RoutememoryU2DCatalogResponse_d2a9e452ab> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutememoryU2DCatalogResponse_d2a9e452ab")
        override fun deserialize(decoder: Decoder): RoutememoryU2DCatalogResponse_d2a9e452ab {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutememoryU2DCatalogResponse_d2a9e452ab supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutememoryU2DCatalogResponse_d2a9e452ab>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("status")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutememoryU2DCatalogResponseU2DOptionU2D1_c991d95877>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("list")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RoutememoryU2DCatalogResponseU2DOptionU2D2_761c60edbc>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("save")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RoutememoryU2DCatalogResponseU2DOptionU2D3_c2bfd0a01d>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("delete")))) { Option4(jsonDecoder.json.decodeFromJsonElement<RoutememoryU2DCatalogResponseU2DOptionU2D4_a51e1a467e>(element)) }
            return RemoteUnionCodec.single("RoutememoryU2DCatalogResponse_d2a9e452ab", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutememoryU2DCatalogResponse_d2a9e452ab) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutememoryU2DCatalogResponse_d2a9e452ab supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutememoryU2DCatalogResponseU2DOptionU2D1_c991d95877>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RoutememoryU2DCatalogResponseU2DOptionU2D2_761c60edbc>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RoutememoryU2DCatalogResponseU2DOptionU2D3_c2bfd0a01d>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<RoutememoryU2DCatalogResponseU2DOptionU2D4_a51e1a467e>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class RoutememoryU2DSyncRequestU2DTombstonesU2DItem_29dd431b6b(
    @SerialName("deletedAt") val deletedAt: String,
    @SerialName("id") val id: String,
    @SerialName("projectId") val projectId: RemoteField<String>,
    @SerialName("repoKey") val repoKey: RemoteField<String> = RemoteField.Missing,
    @SerialName("scope") val scope: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("deletedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, true, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("repoKey", "String", false, true, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scope", "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutememoryU2DSyncRequest_e391f3a6d9(
    @SerialName("entries") val entries: List<RoutememoryU2DCatalogResponseU2DOptionU2D2U2DResultU2DItem_ae014c623e>,
    @SerialName("tombstones") val tombstones: List<RoutememoryU2DSyncRequestU2DTombstonesU2DItem_29dd431b6b>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("entries", "List<RoutememoryU2DCatalogResponseU2DOptionU2D2U2DResultU2DItem_ae014c623e>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tombstones", "List<RoutememoryU2DSyncRequestU2DTombstonesU2DItem_29dd431b6b>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutememoryU2DSyncResponse_ac0baafa13(
    @SerialName("state") val state: RoutememoryU2DSyncRequest_e391f3a6d9,
    @SerialName("synced") val synced: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("state", "RoutememoryU2DSyncRequest_e391f3a6d9", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("synced", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DCheckout_164937b9a5(
    @SerialName("active") val active: Long,
    @SerialName("executionMs") val executionMs: RemoteField<Double> = RemoteField.Missing,
    @SerialName("limit") val limit: Long,
    @SerialName("maxActive") val maxActive: Long,
    @SerialName("maxExecutionMs") val maxExecutionMs: RemoteField<Double> = RemoteField.Missing,
    @SerialName("maxQueueWaitMs") val maxQueueWaitMs: RemoteField<Double> = RemoteField.Missing,
    @SerialName("queueWaitMs") val queueWaitMs: RemoteField<Double> = RemoteField.Missing,
    @SerialName("queued") val queued: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("active", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("executionMs", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("limit", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxActive", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxExecutionMs", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxQueueWaitMs", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("queueWaitMs", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("queued", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132(
    @SerialName("active") val active: Long,
    @SerialName("queued") val queued: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("active", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("queued", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironments_2f4c1755c2(
    @SerialName("posix") val posix: RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132,
    @SerialName("windows") val windows: RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132,
    @SerialName("wsl") val wsl: RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("posix", "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("windows", "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wsl", "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcesses_d864f91b7c(
    @SerialName("admitted") val admitted: Long,
    @SerialName("cancellations") val cancellations: Long,
    @SerialName("checkout") val checkout: RemoteField<RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DCheckout_164937b9a5> = RemoteField.Missing,
    @SerialName("environments") val environments: RemoteField<RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironments_2f4c1755c2> = RemoteField.Missing,
    @SerialName("long") val long: RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DCheckout_164937b9a5,
    @SerialName("queueFullRefusals") val queueFullRefusals: Long,
    @SerialName("short") val short: RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DCheckout_164937b9a5,
    @SerialName("slowFetches") val slowFetches: RemoteField<Long> = RemoteField.Missing,
    @SerialName("waitTimeoutRefusals") val waitTimeoutRefusals: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("admitted", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("cancellations", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("checkout", "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DCheckout_164937b9a5", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("environments", "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironments_2f4c1755c2", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("long", "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DCheckout_164937b9a5", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("queueFullRefusals", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("short", "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DCheckout_164937b9a5", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("slowFetches", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("waitTimeoutRefusals", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemetricsResponseU2DHostResourceAdmissionU2DPolicy_280719966e(
    @SerialName("maxActiveAgentSessions") val maxActiveAgentSessions: Long,
    @SerialName("maxActiveGenerationHelpers") val maxActiveGenerationHelpers: Long,
    @SerialName("maxActiveTerminalShells") val maxActiveTerminalShells: Long,
    @SerialName("overloadRetryAfterMs") val overloadRetryAfterMs: Long,
    @SerialName("refuseNewStarts") val refuseNewStarts: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("maxActiveAgentSessions", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxActiveGenerationHelpers", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxActiveTerminalShells", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("overloadRetryAfterMs", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("refuseNewStarts", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutemetricsResponseU2DHostResourceAdmissionU2DResolutionU2DKind_cd6770504a {
    @SerialName("configured") CONFIGURED,
    @SerialName("absent") ABSENT,
    @SerialName("missing") MISSING,
    @SerialName("retained") RETAINED,
    @SerialName("unavailable") UNAVAILABLE,
}

@Serializable
enum class RoutemetricsResponseU2DHostResourceAdmissionU2DResolutionU2DProblem_6ef72b13e3 {
    @SerialName("settings-document-unreadable") SETTINGSU2DDOCUMENTU2DUNREADABLE,
    @SerialName("settings-document-unparseable") SETTINGSU2DDOCUMENTU2DUNPARSEABLE,
    @SerialName("settings-document-not-object") SETTINGSU2DDOCUMENTU2DNOTU2DOBJECT,
    @SerialName("host-resource-admission-invalid") HOSTU2DRESOURCEU2DADMISSIONU2DINVALID,
}

@Serializable
data class RoutemetricsResponseU2DHostResourceAdmissionU2DResolution_c0edab91e2(
    @SerialName("kind") val kind: RoutemetricsResponseU2DHostResourceAdmissionU2DResolutionU2DKind_cd6770504a,
    @SerialName("problem") val problem: RemoteField<RoutemetricsResponseU2DHostResourceAdmissionU2DResolutionU2DProblem_6ef72b13e3> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutemetricsResponseU2DHostResourceAdmissionU2DResolutionU2DKind_cd6770504a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("problem", "RoutemetricsResponseU2DHostResourceAdmissionU2DResolutionU2DProblem_6ef72b13e3", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4(
    @SerialName("active") val active: Long,
    @SerialName("pending") val pending: Long,
    @SerialName("retiring") val retiring: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("active", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pending", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("retiring", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemetricsResponseU2DHostResourceAdmissionU2DUsage_1618be77eb(
    @SerialName("agentSessions") val agentSessions: RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4,
    @SerialName("generationHelpers") val generationHelpers: RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4,
    @SerialName("refusals") val refusals: Long,
    @SerialName("terminalShells") val terminalShells: RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4,
    @SerialName("total") val total: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentSessions", "RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("generationHelpers", "RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("refusals", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("terminalShells", "RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("total", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemetricsResponseU2DHostResourceAdmission_dffaae3821(
    @SerialName("gitProcesses") val gitProcesses: RemoteField<RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcesses_d864f91b7c> = RemoteField.Missing,
    @SerialName("policy") val policy: RoutemetricsResponseU2DHostResourceAdmissionU2DPolicy_280719966e,
    @SerialName("resolution") val resolution: RoutemetricsResponseU2DHostResourceAdmissionU2DResolution_c0edab91e2,
    @SerialName("usage") val usage: RoutemetricsResponseU2DHostResourceAdmissionU2DUsage_1618be77eb,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("gitProcesses", "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcesses_d864f91b7c", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("policy", "RoutemetricsResponseU2DHostResourceAdmissionU2DPolicy_280719966e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("resolution", "RoutemetricsResponseU2DHostResourceAdmissionU2DResolution_c0edab91e2", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("usage", "RoutemetricsResponseU2DHostResourceAdmissionU2DUsage_1618be77eb", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemetricsResponseU2DProcess_9f6e05a566(
    @SerialName("heapUsedBytes") val heapUsedBytes: Long,
    @SerialName("rssBytes") val rssBytes: Long,
    @SerialName("uptimeSeconds") val uptimeSeconds: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("heapUsedBytes", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("rssBytes", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("uptimeSeconds", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
