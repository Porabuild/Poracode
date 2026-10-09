// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable(with = RoutethreadU2DCommandRequest_e4ebf19966.Serializer::class)
sealed interface RoutethreadU2DCommandRequest_e4ebf19966 {
    data class Option1(val value: RoutethreadU2DCommandRequestU2DOptionU2D1_b01e26e043) : RoutethreadU2DCommandRequest_e4ebf19966
    data class Option2(val value: RoutethreadU2DCommandRequestU2DOptionU2D2_bb811acb44) : RoutethreadU2DCommandRequest_e4ebf19966
    data class Option3(val value: RoutethreadU2DCommandRequestU2DOptionU2D3_21cd039cb3) : RoutethreadU2DCommandRequest_e4ebf19966
    data class Option4(val value: RoutethreadU2DCommandRequestU2DOptionU2D4_1ae7de2180) : RoutethreadU2DCommandRequest_e4ebf19966
    data class Option5(val value: RoutethreadU2DCommandRequestU2DOptionU2D5_2e4d2aaed0) : RoutethreadU2DCommandRequest_e4ebf19966
    data class Option6(val value: RoutethreadU2DCommandRequestU2DOptionU2D6_c3363423bb) : RoutethreadU2DCommandRequest_e4ebf19966
    data class Option7(val value: RoutethreadU2DCommandRequestU2DOptionU2D7_80906c6ddc) : RoutethreadU2DCommandRequest_e4ebf19966
    data class Option8(val value: RoutethreadU2DCommandRequestU2DOptionU2D8_ebd70a208b) : RoutethreadU2DCommandRequest_e4ebf19966
    data class Option9(val value: RoutethreadU2DCommandRequestU2DOptionU2D9_b79d8f64de) : RoutethreadU2DCommandRequest_e4ebf19966
    data class Option10(val value: RoutethreadU2DCommandRequestU2DOptionU2D10_09765c7778) : RoutethreadU2DCommandRequest_e4ebf19966
    data class Option11(val value: RoutethreadU2DCommandRequestU2DOptionU2D11_431be1ab7e) : RoutethreadU2DCommandRequest_e4ebf19966
    data class Option12(val value: RoutethreadU2DCommandRequestU2DOptionU2D12_a93ba7bf23) : RoutethreadU2DCommandRequest_e4ebf19966
    data class Option13(val value: RoutethreadU2DCommandRequestU2DOptionU2D13_370ff0ec0a) : RoutethreadU2DCommandRequest_e4ebf19966
    data class Option14(val value: RoutethreadU2DCommandRequestU2DOptionU2D14_2062bc5ac9) : RoutethreadU2DCommandRequest_e4ebf19966
    data class Option15(val value: RoutethreadU2DCommandRequestU2DOptionU2D15_69af29ff38) : RoutethreadU2DCommandRequest_e4ebf19966
    object Serializer : KSerializer<RoutethreadU2DCommandRequest_e4ebf19966> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutethreadU2DCommandRequest_e4ebf19966")
        override fun deserialize(decoder: Decoder): RoutethreadU2DCommandRequest_e4ebf19966 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutethreadU2DCommandRequest_e4ebf19966 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutethreadU2DCommandRequest_e4ebf19966>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("prepare-worktree")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D1_b01e26e043>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("start")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D2_bb811acb44>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("set-group")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D3_21cd039cb3>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("clear-group")))) { Option4(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D4_1ae7de2180>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("rename")))) { Option5(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D5_2e4d2aaed0>(element)) }
            RemoteUnionCodec.tryOption(matches, 6, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("acknowledge")))) { Option6(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D6_c3363423bb>(element)) }
            RemoteUnionCodec.tryOption(matches, 7, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("set-done")))) { Option7(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D7_80906c6ddc>(element)) }
            RemoteUnionCodec.tryOption(matches, 8, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("set-starred")))) { Option8(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D8_ebd70a208b>(element)) }
            RemoteUnionCodec.tryOption(matches, 9, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("set-worktree")))) { Option9(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D9_b79d8f64de>(element)) }
            RemoteUnionCodec.tryOption(matches, 10, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("delete-worktree-group")))) { Option10(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D10_09765c7778>(element)) }
            RemoteUnionCodec.tryOption(matches, 11, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("archive")))) { Option11(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D11_431be1ab7e>(element)) }
            RemoteUnionCodec.tryOption(matches, 12, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("unarchive")))) { Option12(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D12_a93ba7bf23>(element)) }
            RemoteUnionCodec.tryOption(matches, 13, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("delete")))) { Option13(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D13_370ff0ec0a>(element)) }
            RemoteUnionCodec.tryOption(matches, 14, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("reorder")))) { Option14(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D14_2062bc5ac9>(element)) }
            RemoteUnionCodec.tryOption(matches, 15, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("set-workspace")))) { Option15(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D15_69af29ff38>(element)) }
            return RemoteUnionCodec.single("RoutethreadU2DCommandRequest_e4ebf19966", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutethreadU2DCommandRequest_e4ebf19966) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutethreadU2DCommandRequest_e4ebf19966 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D1_b01e26e043>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D2_bb811acb44>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D3_21cd039cb3>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D4_1ae7de2180>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D5_2e4d2aaed0>(value.value)
                is Option6 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D6_c3363423bb>(value.value)
                is Option7 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D7_80906c6ddc>(value.value)
                is Option8 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D8_ebd70a208b>(value.value)
                is Option9 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D9_b79d8f64de>(value.value)
                is Option10 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D10_09765c7778>(value.value)
                is Option11 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D11_431be1ab7e>(value.value)
                is Option12 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D12_a93ba7bf23>(value.value)
                is Option13 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D13_370ff0ec0a>(value.value)
                is Option14 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D14_2062bc5ac9>(value.value)
                is Option15 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D15_69af29ff38>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class RoutethreadU2DGoalRequestU2DOptionU2D1U2DAction_10209383e3 {
    @SerialName("edit") EDIT,
}

@Serializable
data class RoutethreadU2DGoalRequestU2DOptionU2D1_f3c2d2c491(
    @SerialName("action") val action: RoutethreadU2DGoalRequestU2DOptionU2D1U2DAction_10209383e3,
    @SerialName("objective") val objective: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "RoutethreadU2DGoalRequestU2DOptionU2D1U2DAction_10209383e3", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("objective", "String", true, false, null, null, 1, 4000, null, null, null, null, listOf("string.trim")),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DGoalRequestU2DOptionU2D2U2DAction_2d862d697d {
    @SerialName("pause") PAUSE,
    @SerialName("resume") RESUME,
    @SerialName("clear") CLEAR,
}

@Serializable
data class RoutethreadU2DGoalRequestU2DOptionU2D2_43d29f1d5a(
    @SerialName("action") val action: RoutethreadU2DGoalRequestU2DOptionU2D2U2DAction_2d862d697d,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "RoutethreadU2DGoalRequestU2DOptionU2D2U2DAction_2d862d697d", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RoutethreadU2DGoalRequest_54c8350637.Serializer::class)
sealed interface RoutethreadU2DGoalRequest_54c8350637 {
    data class Option1(val value: RoutethreadU2DGoalRequestU2DOptionU2D1_f3c2d2c491) : RoutethreadU2DGoalRequest_54c8350637
    data class Option2(val value: RoutethreadU2DGoalRequestU2DOptionU2D2_43d29f1d5a) : RoutethreadU2DGoalRequest_54c8350637
    object Serializer : KSerializer<RoutethreadU2DGoalRequest_54c8350637> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutethreadU2DGoalRequest_54c8350637")
        override fun deserialize(decoder: Decoder): RoutethreadU2DGoalRequest_54c8350637 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutethreadU2DGoalRequest_54c8350637 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutethreadU2DGoalRequest_54c8350637>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("edit")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DGoalRequestU2DOptionU2D1_f3c2d2c491>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("pause"), JsonPrimitive("resume"), JsonPrimitive("clear")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DGoalRequestU2DOptionU2D2_43d29f1d5a>(element)) }
            return RemoteUnionCodec.single("RoutethreadU2DGoalRequest_54c8350637", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutethreadU2DGoalRequest_54c8350637) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutethreadU2DGoalRequest_54c8350637 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DGoalRequestU2DOptionU2D1_f3c2d2c491>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DGoalRequestU2DOptionU2D2_43d29f1d5a>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class RoutethreadU2DHistoryQueryU2DRuntimePage_8795ea0289 {
    @SerialName("1") N1,
}

@Serializable
data class RoutethreadU2DHistoryQuery_c94252b9b1(
    @SerialName("completedTurnsLimit") val completedTurnsLimit: RemoteField<Long> = RemoteField.Missing,
    @SerialName("maxBytes") val maxBytes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("maxDecodeBytes") val maxDecodeBytes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("notices") val notices: RemoteField<RoutethreadU2DHistoryU2DItemsQueryU2DNotices_f67f6cbe63> = RemoteField.Missing,
    @SerialName("omitScrollback") val omitScrollback: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("reads") val reads: RemoteField<RouteprojectU2DListQueryU2DReads_4659e6d395> = RemoteField.Missing,
    @SerialName("runtimePage") val runtimePage: RemoteField<RoutethreadU2DHistoryQueryU2DRuntimePage_8795ea0289> = RemoteField.Missing,
    @SerialName("targetTimelineEntryCount") val targetTimelineEntryCount: RemoteField<Long> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("completedTurnsLimit", "Long", false, false, 1.0, 500.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxBytes", "Long", false, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxDecodeBytes", "Long", false, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("notices", "RoutethreadU2DHistoryU2DItemsQueryU2DNotices_f67f6cbe63", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("omitScrollback", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reads", "RouteprojectU2DListQueryU2DReads_4659e6d395", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimePage", "RoutethreadU2DHistoryQueryU2DRuntimePage_8795ea0289", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("targetTimelineEntryCount", "Long", false, false, 1.0, 100.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DHistoryResponseU2DCompletedTurnsU2DItem_df96bd315b(
    @SerialName("anchorItemId") val anchorItemId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("endedAt") val endedAt: String,
    @SerialName("startedAt") val startedAt: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("anchorItemId", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("endedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("startedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DHistoryResponse_052ddaf6f1(
    @SerialName("backgroundTasks") val backgroundTasks: RemoteField<ProcedurereadThreadBackgroundTasksResult_17dfab19af> = RemoteField.Missing,
    @SerialName("completedTurns") val completedTurns: List<RoutethreadU2DHistoryResponseU2DCompletedTurnsU2DItem_df96bd315b>,
    @SerialName("completedTurnsNextCursor") val completedTurnsNextCursor: RemoteField<String> = RemoteField.Missing,
    @SerialName("contextUsage") val contextUsage: RemoteField<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b>,
    @SerialName("followUpQueue") val followUpQueue: RemoteField<ProceduregetThreadFollowUpQueueResultU2DOptionU2D1_0174a8d738> = RemoteField.Missing,
    @SerialName("reads") val reads: RemoteField<RouteprojectU2DListQueryU2DReads_4659e6d395> = RemoteField.Missing,
    @SerialName("runtimeItems") val runtimeItems: List<RoutethreadU2DHistoryU2DItemsResponseU2DItemsU2DItem_4c1171296b>,
    @SerialName("runtimeNextCursor") val runtimeNextCursor: RemoteField<Long> = RemoteField.Missing,
    @SerialName("runtimeNotice") val runtimeNotice: RemoteField<RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNotice_1468dfe9a2> = RemoteField.Missing,
    @SerialName("snapshotSeq") val snapshotSeq: Long,
    @SerialName("terminalScrollback") val terminalScrollback: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("terminalSize") val terminalSize: RemoteField<ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09> = RemoteField.Missing,
    @SerialName("thread") val thread: RouteshellU2DSnapshotResponseU2DThreadsU2DItem_df1aff1490,
    @SerialName("updatedAt") val updatedAt: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("backgroundTasks", "ProcedurereadThreadBackgroundTasksResult_17dfab19af", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("completedTurns", "List<RoutethreadU2DHistoryResponseU2DCompletedTurnsU2DItem_df96bd315b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("completedTurnsNextCursor", "String", false, true, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("contextUsage", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("followUpQueue", "ProceduregetThreadFollowUpQueueResultU2DOptionU2D1_0174a8d738", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reads", "RouteprojectU2DListQueryU2DReads_4659e6d395", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeItems", "List<RoutethreadU2DHistoryU2DItemsResponseU2DItemsU2DItem_4c1171296b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeNextCursor", "Long", false, true, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeNotice", "RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNotice_1468dfe9a2", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("snapshotSeq", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("terminalScrollback", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("terminalSize", "ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("thread", "RouteshellU2DSnapshotResponseU2DThreadsU2DItem_df1aff1490", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("updatedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DHistoryU2DItemsQueryU2DNotices_f67f6cbe63 {
    @SerialName("v1") V1,
}

@Serializable
data class RoutethreadU2DHistoryU2DItemsQuery_a0f0c9734c(
    @SerialName("beforePosition") val beforePosition: RemoteField<Long> = RemoteField.Missing,
    @SerialName("limit") val limit: RemoteField<Long> = RemoteField.Missing,
    @SerialName("maxBytes") val maxBytes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("maxDecodeBytes") val maxDecodeBytes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("notices") val notices: RemoteField<RoutethreadU2DHistoryU2DItemsQueryU2DNotices_f67f6cbe63> = RemoteField.Missing,
    @SerialName("reads") val reads: RemoteField<RouteprojectU2DListQueryU2DReads_4659e6d395> = RemoteField.Missing,
    @SerialName("targetTimelineEntryCount") val targetTimelineEntryCount: RemoteField<Long> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("beforePosition", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("limit", "Long", false, false, 1.0, 500.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxBytes", "Long", false, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxDecodeBytes", "Long", false, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("notices", "RoutethreadU2DHistoryU2DItemsQueryU2DNotices_f67f6cbe63", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reads", "RouteprojectU2DListQueryU2DReads_4659e6d395", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("targetTimelineEntryCount", "Long", false, false, 1.0, 100.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DHistoryU2DItemsResponseU2DItemsU2DItem_4c1171296b(
    @SerialName("id") val id: String,
    @SerialName("parentItemId") val parentItemId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("payload") val payload: RemoteField<JsonElement> = RemoteField.Missing,
    @SerialName("state") val state: RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThreadU2DValueU2DLatestItemState_2472eab79a,
    @SerialName("streams") val streams: ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67,
    @SerialName("type") val type: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("parentItemId", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("payload", "JsonElement", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("state", "RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThreadU2DValueU2DLatestItemState_2472eab79a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("streams", "ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNoticeU2DKind_f8afe6df00 {
    @SerialName("history-incomplete") HISTORYU2DINCOMPLETE,
}

@Serializable
enum class RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNoticeU2DReason_9780f521bc {
    @SerialName("thread-events") THREADU2DEVENTS,
    @SerialName("thread-bytes") THREADU2DBYTES,
    @SerialName("global-events") GLOBALU2DEVENTS,
    @SerialName("global-bytes") GLOBALU2DBYTES,
    @SerialName("oversize") OVERSIZE,
    @SerialName("age") AGE,
    @SerialName("degraded") DEGRADED,
    @SerialName("rebase-dropped") REBASEU2DDROPPED,
    @SerialName("shutdown") SHUTDOWN,
    @SerialName("unclean-epoch") UNCLEANU2DEPOCH,
}

@Serializable
enum class RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNoticeU2DSource_77a7dec7ed {
    @SerialName("exact") EXACT,
    @SerialName("suspect") SUSPECT,
}

@Serializable
data class RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNotice_1468dfe9a2(
    @SerialName("acknowledgedCount") val acknowledgedCount: Long,
    @SerialName("firstAcknowledgedAt") val firstAcknowledgedAt: Long,
    @SerialName("kind") val kind: RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNoticeU2DKind_f8afe6df00,
    @SerialName("lastAcknowledgedAt") val lastAcknowledgedAt: Long,
    @SerialName("reason") val reason: RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNoticeU2DReason_9780f521bc,
    @SerialName("refusedBytes") val refusedBytes: Long,
    @SerialName("refusedEvents") val refusedEvents: Long,
    @SerialName("source") val source: RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNoticeU2DSource_77a7dec7ed,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("acknowledgedCount", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("firstAcknowledgedAt", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNoticeU2DKind_f8afe6df00", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastAcknowledgedAt", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reason", "RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNoticeU2DReason_9780f521bc", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("refusedBytes", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("refusedEvents", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("source", "RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNoticeU2DSource_77a7dec7ed", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DHistoryU2DItemsResponse_7b055156a7(
    @SerialName("items") val items: List<RoutethreadU2DHistoryU2DItemsResponseU2DItemsU2DItem_4c1171296b>,
    @SerialName("nextCursor") val nextCursor: RemoteField<Long>,
    @SerialName("reads") val reads: RemoteField<RouteprojectU2DListQueryU2DReads_4659e6d395> = RemoteField.Missing,
    @SerialName("runtimeNotice") val runtimeNotice: RemoteField<RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNotice_1468dfe9a2> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("items", "List<RoutethreadU2DHistoryU2DItemsResponseU2DItemsU2DItem_4c1171296b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("nextCursor", "Long", true, true, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reads", "RouteprojectU2DListQueryU2DReads_4659e6d395", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeNotice", "RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNotice_1468dfe9a2", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
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
data class RoutethreadU2DListResponse_ae046e1dbb(
    @SerialName("gitSummariesByThread") val gitSummariesByThread: RemoteField<RouteshellU2DSnapshotResponseU2DGitSummariesByThread_aca97eda78> = RemoteField.Missing,
    @SerialName("inventoryFrontier") val inventoryFrontier: RemoteField<String> = RemoteField.Missing,
    @SerialName("nextCursor") val nextCursor: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("reads") val reads: RemoteField<RouteprojectU2DListQueryU2DReads_4659e6d395> = RemoteField.Missing,
    @SerialName("runtimeSummariesByThread") val runtimeSummariesByThread: RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThread_fc9d6f4c26,
    @SerialName("threads") val threads: List<RouteshellU2DSnapshotResponseU2DThreadsU2DItem_df1aff1490>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("gitSummariesByThread", "RouteshellU2DSnapshotResponseU2DGitSummariesByThread_aca97eda78", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("inventoryFrontier", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("nextCursor", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reads", "RouteprojectU2DListQueryU2DReads_4659e6d395", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeSummariesByThread", "RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThread_fc9d6f4c26", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threads", "List<RouteshellU2DSnapshotResponseU2DThreadsU2DItem_df1aff1490>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RoutethreadU2DRuntimeU2DGapResponseU2DNotice_214ae58e6e = RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNotice_1468dfe9a2?

@Serializable
data class RoutethreadU2DRuntimeU2DGapResponse_6da82c72b2(
    @SerialName("gap") val gap: RemoteField<RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D1U2DDescriptor_c66f09c621>,
    @SerialName("notice") val notice: RemoteField<RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNotice_1468dfe9a2>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("gap", "RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D1U2DDescriptor_c66f09c621", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("notice", "RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNotice_1468dfe9a2", true, true, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DRuntimeU2DGapU2DAcknowledgeQuery_3b681a533b(
    @SerialName("notices") val notices: RoutethreadU2DHistoryU2DItemsQueryU2DNotices_f67f6cbe63,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("notices", "RoutethreadU2DHistoryU2DItemsQueryU2DNotices_f67f6cbe63", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DRuntimeU2DGapU2DAcknowledgeRequest_d4605651db(
    @SerialName("episodeToken") val episodeToken: String,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("episodeToken", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D1U2DDescriptor_c66f09c621(
    @SerialName("createdAt") val createdAt: Long,
    @SerialName("reason") val reason: RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNoticeU2DReason_9780f521bc,
    @SerialName("refusedBytes") val refusedBytes: Long,
    @SerialName("refusedEvents") val refusedEvents: Long,
    @SerialName("source") val source: RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNoticeU2DSource_77a7dec7ed,
    @SerialName("token") val token: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("createdAt", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reason", "RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNoticeU2DReason_9780f521bc", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("refusedBytes", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("refusedEvents", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("source", "RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNoticeU2DSource_77a7dec7ed", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("token", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D1U2DOutcome_c62b342ed8 {
    @SerialName("applied") APPLIED,
}
