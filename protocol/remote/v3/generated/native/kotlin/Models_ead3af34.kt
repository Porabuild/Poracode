// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RoutethreadU2DHistoryU2DItemsResponse_2b43031625(
    @SerialName("historyProjection") val historyProjection: RemoteField<RoutethreadU2DHistoryU2DChangesQueryU2DProjection_72a4409660> = RemoteField.Missing,
    @SerialName("items") val items: List<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeItemsU2DItem_8fa99a81fa>,
    @SerialName("nextCursor") val nextCursor: RemoteField<Long>,
    @SerialName("reads") val reads: RemoteField<RouteprojectU2DListQueryU2DReads_4659e6d395> = RemoteField.Missing,
    @SerialName("runtimeNotice") val runtimeNotice: RemoteField<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNotice_1468dfe9a2> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("historyProjection", "RoutethreadU2DHistoryU2DChangesQueryU2DProjection_72a4409660", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("items", "List<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeItemsU2DItem_8fa99a81fa>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("nextCursor", "Long", true, true, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reads", "RouteprojectU2DListQueryU2DReads_4659e6d395", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeNotice", "RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNotice_1468dfe9a2", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DHistoryU2DPromptsResponseU2DPromptsU2DItem_f249cae065(
    @SerialName("itemId") val itemId: String,
    @SerialName("position") val position: Long,
    @SerialName("text") val text: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("itemId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("position", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("text", "String", true, false, null, null, null, 600, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DHistoryU2DPromptsResponse_3264c4f1e6(
    @SerialName("prompts") val prompts: List<RoutethreadU2DHistoryU2DPromptsResponseU2DPromptsU2DItem_f249cae065>,
    @SerialName("truncated") val truncated: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("prompts", "List<RoutethreadU2DHistoryU2DPromptsResponseU2DPromptsU2DItem_f249cae065>", true, false, null, null, null, null, null, 2000, null, null, listOf()),
            RemoteFieldDescriptor("truncated", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D1U2DItemsU2DItem_9b9783ff6a(
    @SerialName("inputDigest") val inputDigest: String,
    @SerialName("itemId") val itemId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("inputDigest", "String", true, false, null, null, null, null, null, null, "^[a-f0-9]{64}\$", null, listOf()),
            RemoteFieldDescriptor("itemId", "String", true, false, null, null, 1, 512, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D1_1e2e59a6d1(
    @SerialName("items") val items: List<RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D1U2DItemsU2DItem_9b9783ff6a>,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("items", "List<RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D1U2DItemsU2DItem_9b9783ff6a>", true, false, null, null, null, null, 1, 32, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D2_0de685fcf4(
    @SerialName("items") val items: List<RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D1U2DItemsU2DItem_9b9783ff6a>,
    @SerialName("version") val version: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D2U2DVersion_f8ba039a2f,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("items", "List<RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D1U2DItemsU2DItem_9b9783ff6a>", true, false, null, null, null, null, 1, 32, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D2U2DVersion_f8ba039a2f", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D3_57cb887824(
    @SerialName("items") val items: List<RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D1U2DItemsU2DItem_9b9783ff6a>,
    @SerialName("version") val version: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowProjectionU2DVersion_135f7ef79d,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("items", "List<RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D1U2DItemsU2DItem_9b9783ff6a>", true, false, null, null, null, null, 1, 32, null, null, listOf()),
            RemoteFieldDescriptor("version", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowProjectionU2DVersion_135f7ef79d", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D4_dc890acec2(
    @SerialName("items") val items: List<RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D1U2DItemsU2DItem_9b9783ff6a>,
    @SerialName("version") val version: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowViewProjectionU2DVersion_e6cfd13a74,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("items", "List<RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D1U2DItemsU2DItem_9b9783ff6a>", true, false, null, null, null, null, 1, 32, null, null, listOf()),
            RemoteFieldDescriptor("version", "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowViewProjectionU2DVersion_e6cfd13a74", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D5_eaec87ff9d(
    @SerialName("items") val items: List<RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D1U2DItemsU2DItem_9b9783ff6a>,
    @SerialName("version") val version: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DVersion_cf69e7793f,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("items", "List<RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D1U2DItemsU2DItem_9b9783ff6a>", true, false, null, null, null, null, 1, 32, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DVersion_cf69e7793f", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RoutethreadU2DItemU2DPresentationsRequest_d7cd89eba3.Serializer::class)
sealed interface RoutethreadU2DItemU2DPresentationsRequest_d7cd89eba3 {
    data class Option1(val value: RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D1_1e2e59a6d1) : RoutethreadU2DItemU2DPresentationsRequest_d7cd89eba3
    data class Option2(val value: RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D2_0de685fcf4) : RoutethreadU2DItemU2DPresentationsRequest_d7cd89eba3
    data class Option3(val value: RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D3_57cb887824) : RoutethreadU2DItemU2DPresentationsRequest_d7cd89eba3
    data class Option4(val value: RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D4_dc890acec2) : RoutethreadU2DItemU2DPresentationsRequest_d7cd89eba3
    data class Option5(val value: RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D5_eaec87ff9d) : RoutethreadU2DItemU2DPresentationsRequest_d7cd89eba3
    object Serializer : KSerializer<RoutethreadU2DItemU2DPresentationsRequest_d7cd89eba3> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutethreadU2DItemU2DPresentationsRequest_d7cd89eba3")
        override fun deserialize(decoder: Decoder): RoutethreadU2DItemU2DPresentationsRequest_d7cd89eba3 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutethreadU2DItemU2DPresentationsRequest_d7cd89eba3 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutethreadU2DItemU2DPresentationsRequest_d7cd89eba3>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "version", listOf(JsonPrimitive(1.0)))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D1_1e2e59a6d1>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "version", listOf(JsonPrimitive(2.0)))) { Option2(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D2_0de685fcf4>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "version", listOf(JsonPrimitive(3.0)))) { Option3(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D3_57cb887824>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "version", listOf(JsonPrimitive(4.0)))) { Option4(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D4_dc890acec2>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "version", listOf(JsonPrimitive(5.0)))) { Option5(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D5_eaec87ff9d>(element)) }
            return RemoteUnionCodec.single("RoutethreadU2DItemU2DPresentationsRequest_d7cd89eba3", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutethreadU2DItemU2DPresentationsRequest_d7cd89eba3) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutethreadU2DItemU2DPresentationsRequest_d7cd89eba3 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D1_1e2e59a6d1>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D2_0de685fcf4>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D3_57cb887824>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D4_dc890acec2>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D5_eaec87ff9d>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D1_d59ce91ef6(
    @SerialName("items") val items: List<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntry_cc236ef91a>,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("items", "List<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntry_cc236ef91a>", true, false, null, null, null, null, null, 32, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D2_f6e7e7b61d(
    @SerialName("items") val items: List<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D2U2DEntry_74fc41a249>,
    @SerialName("version") val version: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D2U2DVersion_f8ba039a2f,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("items", "List<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D2U2DEntry_74fc41a249>", true, false, null, null, null, null, null, 32, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D2U2DVersion_f8ba039a2f", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItemU2DOptionU2D1U2DHeaderU2DWorkflow_decb92bc1a(
    @SerialName("name") val name: RemoteField<String> = RemoteField.Missing,
    @SerialName("runId") val runId: String,
    @SerialName("summary") val summary: RemoteField<String> = RemoteField.Missing,
    @SerialName("transcriptDir") val transcriptDir: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("name", "String", false, false, null, null, null, 512, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runId", "String", true, false, null, null, 1, 512, null, null, null, null, listOf()),
            RemoteFieldDescriptor("summary", "String", false, false, null, null, null, 4096, null, null, null, null, listOf()),
            RemoteFieldDescriptor("transcriptDir", "String", true, false, null, null, 1, 4096, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItemU2DOptionU2D1U2DHeader_e07628c606(
    @SerialName("workflow") val workflow: RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItemU2DOptionU2D1U2DHeaderU2DWorkflow_decb92bc1a,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("workflow", "RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItemU2DOptionU2D1U2DHeaderU2DWorkflow_decb92bc1a", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItemU2DOptionU2D1_2168d80c99(
    @SerialName("header") val header: RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItemU2DOptionU2D1U2DHeader_e07628c606,
    @SerialName("inputDigest") val inputDigest: String,
    @SerialName("itemId") val itemId: String,
    @SerialName("status") val status: ProcedureghPollPullRequestsResultU2DOptionU2D1U2DStatus_0200f968d2,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("header", "RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItemU2DOptionU2D1U2DHeader_e07628c606", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("inputDigest", "String", true, false, null, null, null, null, null, null, "^[a-f0-9]{64}\$", null, listOf()),
            RemoteFieldDescriptor("itemId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedureghPollPullRequestsResultU2DOptionU2D1U2DStatus_0200f968d2", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItem_bd72dfdbe3.Serializer::class)
sealed interface RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItem_bd72dfdbe3 {
    data class Option1(val value: RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItemU2DOptionU2D1_2168d80c99) : RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItem_bd72dfdbe3
    data class Option2(val value: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D2_2504426b50) : RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItem_bd72dfdbe3
    object Serializer : KSerializer<RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItem_bd72dfdbe3> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItem_bd72dfdbe3")
        override fun deserialize(decoder: Decoder): RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItem_bd72dfdbe3 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItem_bd72dfdbe3 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItem_bd72dfdbe3>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("ready")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItemU2DOptionU2D1_2168d80c99>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("unavailable")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D2_2504426b50>(element)) }
            return RemoteUnionCodec.single("RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItem_bd72dfdbe3", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItem_bd72dfdbe3) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItem_bd72dfdbe3 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItemU2DOptionU2D1_2168d80c99>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D2_2504426b50>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}
