// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3_1a2e4e377d(
    @SerialName("items") val items: List<RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItem_bd72dfdbe3>,
    @SerialName("version") val version: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowProjectionU2DVersion_135f7ef79d,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("items", "List<RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItem_bd72dfdbe3>", true, false, null, null, null, null, null, 32, null, null, listOf()),
            RemoteFieldDescriptor("version", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowProjectionU2DVersion_135f7ef79d", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1U2DHeaderU2DWorkflowViewU2DLiveAgentsU2DItem_6beecd6e51(
    @SerialName("label") val label: String,
    @SerialName("model") val model: RemoteField<String> = RemoteField.Missing,
    @SerialName("phaseTitle") val phaseTitle: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("label", "String", true, false, null, null, null, 4096, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "String", false, false, null, null, null, 512, null, null, null, null, listOf()),
            RemoteFieldDescriptor("phaseTitle", "String", false, false, null, null, null, 512, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1U2DHeaderU2DWorkflowViewU2DPhasesU2DItem_2b6a5e7f6f(
    @SerialName("detail") val detail: RemoteField<String> = RemoteField.Missing,
    @SerialName("title") val title: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("detail", "String", false, false, null, null, null, 4096, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", true, false, null, null, null, 512, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1U2DHeaderU2DWorkflowView_885827b9aa(
    @SerialName("description") val description: RemoteField<String> = RemoteField.Missing,
    @SerialName("liveAgents") val liveAgents: List<RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1U2DHeaderU2DWorkflowViewU2DLiveAgentsU2DItem_6beecd6e51>,
    @SerialName("phases") val phases: List<RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1U2DHeaderU2DWorkflowViewU2DPhasesU2DItem_2b6a5e7f6f>,
    @SerialName("plannedAgents") val plannedAgents: List<RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1U2DHeaderU2DWorkflowViewU2DLiveAgentsU2DItem_6beecd6e51>,
    @SerialName("runId") val runId: RemoteField<String> = RemoteField.Missing,
    @SerialName("transcriptDir") val transcriptDir: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("description", "String", false, false, null, null, null, 4096, null, null, null, null, listOf()),
            RemoteFieldDescriptor("liveAgents", "List<RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1U2DHeaderU2DWorkflowViewU2DLiveAgentsU2DItem_6beecd6e51>", true, false, null, null, null, null, null, 1024, null, null, listOf()),
            RemoteFieldDescriptor("phases", "List<RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1U2DHeaderU2DWorkflowViewU2DPhasesU2DItem_2b6a5e7f6f>", true, false, null, null, null, null, null, 256, null, null, listOf()),
            RemoteFieldDescriptor("plannedAgents", "List<RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1U2DHeaderU2DWorkflowViewU2DLiveAgentsU2DItem_6beecd6e51>", true, false, null, null, null, null, null, 1024, null, null, listOf()),
            RemoteFieldDescriptor("runId", "String", false, false, null, null, null, 512, null, null, null, null, listOf()),
            RemoteFieldDescriptor("transcriptDir", "String", false, false, null, null, null, 4096, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1U2DHeader_547dd82d60(
    @SerialName("workflowView") val workflowView: RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1U2DHeaderU2DWorkflowView_885827b9aa,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("workflowView", "RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1U2DHeaderU2DWorkflowView_885827b9aa", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1_44564cf7f2(
    @SerialName("header") val header: RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1U2DHeader_547dd82d60,
    @SerialName("inputDigest") val inputDigest: String,
    @SerialName("itemId") val itemId: String,
    @SerialName("status") val status: ProcedureghPollPullRequestsResultU2DOptionU2D1U2DStatus_0200f968d2,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("header", "RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1U2DHeader_547dd82d60", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("inputDigest", "String", true, false, null, null, null, null, null, null, "^[a-f0-9]{64}$", null, listOf()),
            RemoteFieldDescriptor("itemId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedureghPollPullRequestsResultU2DOptionU2D1U2DStatus_0200f968d2", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItem_a2b4a35ec5.Serializer::class)
sealed interface RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItem_a2b4a35ec5 {
    data class Option1(val value: RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1_44564cf7f2) : RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItem_a2b4a35ec5
    data class Option2(val value: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D2_2504426b50) : RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItem_a2b4a35ec5
    object Serializer : KSerializer<RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItem_a2b4a35ec5> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItem_a2b4a35ec5")
        override fun deserialize(decoder: Decoder): RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItem_a2b4a35ec5 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItem_a2b4a35ec5 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItem_a2b4a35ec5>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("ready")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1_44564cf7f2>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("unavailable")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D2_2504426b50>(element)) }
            return RemoteUnionCodec.single("RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItem_a2b4a35ec5", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItem_a2b4a35ec5) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItem_a2b4a35ec5 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1_44564cf7f2>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D2_2504426b50>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4_0700d342f3(
    @SerialName("items") val items: List<RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItem_a2b4a35ec5>,
    @SerialName("version") val version: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowViewProjectionU2DVersion_e6cfd13a74,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("items", "List<RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItem_a2b4a35ec5>", true, false, null, null, null, null, null, 32, null, null, listOf()),
            RemoteFieldDescriptor("version", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowViewProjectionU2DVersion_e6cfd13a74", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D5_8c108b5dbe(
    @SerialName("items") val items: List<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntry_29b593c001>,
    @SerialName("version") val version: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DVersion_cf69e7793f,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("items", "List<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntry_29b593c001>", true, false, null, null, null, null, null, 32, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DVersion_cf69e7793f", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RoutethreadU2DItemU2DPresentationsResponse_7336226743.Serializer::class)
sealed interface RoutethreadU2DItemU2DPresentationsResponse_7336226743 {
    data class Option1(val value: RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D1_d59ce91ef6) : RoutethreadU2DItemU2DPresentationsResponse_7336226743
    data class Option2(val value: RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D2_f6e7e7b61d) : RoutethreadU2DItemU2DPresentationsResponse_7336226743
    data class Option3(val value: RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3_1a2e4e377d) : RoutethreadU2DItemU2DPresentationsResponse_7336226743
    data class Option4(val value: RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4_0700d342f3) : RoutethreadU2DItemU2DPresentationsResponse_7336226743
    data class Option5(val value: RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D5_8c108b5dbe) : RoutethreadU2DItemU2DPresentationsResponse_7336226743
    object Serializer : KSerializer<RoutethreadU2DItemU2DPresentationsResponse_7336226743> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutethreadU2DItemU2DPresentationsResponse_7336226743")
        override fun deserialize(decoder: Decoder): RoutethreadU2DItemU2DPresentationsResponse_7336226743 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutethreadU2DItemU2DPresentationsResponse_7336226743 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutethreadU2DItemU2DPresentationsResponse_7336226743>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "version", listOf(JsonPrimitive(1.0)))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D1_d59ce91ef6>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "version", listOf(JsonPrimitive(2.0)))) { Option2(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D2_f6e7e7b61d>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "version", listOf(JsonPrimitive(3.0)))) { Option3(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3_1a2e4e377d>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "version", listOf(JsonPrimitive(4.0)))) { Option4(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4_0700d342f3>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "version", listOf(JsonPrimitive(5.0)))) { Option5(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D5_8c108b5dbe>(element)) }
            return RemoteUnionCodec.single("RoutethreadU2DItemU2DPresentationsResponse_7336226743", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutethreadU2DItemU2DPresentationsResponse_7336226743) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutethreadU2DItemU2DPresentationsResponse_7336226743 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D1_d59ce91ef6>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D2_f6e7e7b61d>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3_1a2e4e377d>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4_0700d342f3>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D5_8c108b5dbe>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class RoutethreadU2DListQuery_64900cfb16(
    @SerialName("cursor") val cursor: RemoteField<String> = RemoteField.Missing,
    @SerialName("limit") val limit: RemoteField<Long> = RemoteField.Missing,
    @SerialName("maxBytes") val maxBytes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("maxDecodeBytes") val maxDecodeBytes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("mode") val mode: RemoteField<RouteprojectU2DListQueryU2DMode_902ee7904a> = RemoteField.Missing,
    @SerialName("order") val order: RemoteField<RouteprojectU2DListQueryU2DOrder_42146530bc> = RemoteField.Missing,
    @SerialName("reads") val reads: RemoteField<RouteprojectU2DListQueryU2DReads_4659e6d395> = RemoteField.Missing,
    @SerialName("summaries") val summaries: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cursor", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("limit", "Long", false, false, 1.0, 200.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxBytes", "Long", false, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxDecodeBytes", "Long", false, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mode", "RouteprojectU2DListQueryU2DMode_902ee7904a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("order", "RouteprojectU2DListQueryU2DOrder_42146530bc", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reads", "RouteprojectU2DListQueryU2DReads_4659e6d395", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("summaries", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DListResponse_dfb0d1c562(
    @SerialName("gitSummariesByThread") val gitSummariesByThread: RemoteField<RouteshellU2DSnapshotResponseU2DGitSummariesByThread_aca97eda78> = RemoteField.Missing,
    @SerialName("inventoryFrontier") val inventoryFrontier: RemoteField<String> = RemoteField.Missing,
    @SerialName("nextCursor") val nextCursor: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("reads") val reads: RemoteField<RouteprojectU2DListQueryU2DReads_4659e6d395> = RemoteField.Missing,
    @SerialName("runtimeSummariesByThread") val runtimeSummariesByThread: RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThread_fc9d6f4c26,
    @SerialName("threads") val threads: List<RouteshellU2DSnapshotResponseU2DThreadsU2DItem_b37f60804a>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("gitSummariesByThread", "RouteshellU2DSnapshotResponseU2DGitSummariesByThread_aca97eda78", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("inventoryFrontier", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("nextCursor", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reads", "RouteprojectU2DListQueryU2DReads_4659e6d395", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeSummariesByThread", "RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThread_fc9d6f4c26", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threads", "List<RouteshellU2DSnapshotResponseU2DThreadsU2DItem_b37f60804a>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RoutethreadU2DRuntimeU2DGapResponseU2DNotice_214ae58e6e = RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNotice_1468dfe9a2?

@Serializable
data class RoutethreadU2DRuntimeU2DGapResponse_6da82c72b2(
    @SerialName("gap") val gap: RemoteField<RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D1U2DDescriptor_c66f09c621>,
    @SerialName("notice") val notice: RemoteField<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNotice_1468dfe9a2>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("gap", "RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D1U2DDescriptor_c66f09c621", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("notice", "RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNotice_1468dfe9a2", true, true, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
