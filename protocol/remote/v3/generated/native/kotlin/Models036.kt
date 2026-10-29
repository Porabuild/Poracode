// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable(with = RoutethreadU2DCommandRequest_b31e6e3498.Serializer::class)
sealed interface RoutethreadU2DCommandRequest_b31e6e3498 {
    data class Option1(val value: RoutethreadU2DCommandRequestU2DOptionU2D1_8d889103a9) : RoutethreadU2DCommandRequest_b31e6e3498
    data class Option2(val value: RoutethreadU2DCommandRequestU2DOptionU2D2_b01e26e043) : RoutethreadU2DCommandRequest_b31e6e3498
    data class Option3(val value: RoutethreadU2DCommandRequestU2DOptionU2D3_b34d955e5d) : RoutethreadU2DCommandRequest_b31e6e3498
    data class Option4(val value: RoutethreadU2DCommandRequestU2DOptionU2D4_21cd039cb3) : RoutethreadU2DCommandRequest_b31e6e3498
    data class Option5(val value: RoutethreadU2DCommandRequestU2DOptionU2D5_1ae7de2180) : RoutethreadU2DCommandRequest_b31e6e3498
    data class Option6(val value: RoutethreadU2DCommandRequestU2DOptionU2D6_2e4d2aaed0) : RoutethreadU2DCommandRequest_b31e6e3498
    data class Option7(val value: RoutethreadU2DCommandRequestU2DOptionU2D7_c3363423bb) : RoutethreadU2DCommandRequest_b31e6e3498
    data class Option8(val value: RoutethreadU2DCommandRequestU2DOptionU2D8_80906c6ddc) : RoutethreadU2DCommandRequest_b31e6e3498
    data class Option9(val value: RoutethreadU2DCommandRequestU2DOptionU2D9_ebd70a208b) : RoutethreadU2DCommandRequest_b31e6e3498
    data class Option10(val value: RoutethreadU2DCommandRequestU2DOptionU2D10_b79d8f64de) : RoutethreadU2DCommandRequest_b31e6e3498
    data class Option11(val value: RoutethreadU2DCommandRequestU2DOptionU2D11_09765c7778) : RoutethreadU2DCommandRequest_b31e6e3498
    data class Option12(val value: RoutethreadU2DCommandRequestU2DOptionU2D12_431be1ab7e) : RoutethreadU2DCommandRequest_b31e6e3498
    data class Option13(val value: RoutethreadU2DCommandRequestU2DOptionU2D13_a93ba7bf23) : RoutethreadU2DCommandRequest_b31e6e3498
    data class Option14(val value: RoutethreadU2DCommandRequestU2DOptionU2D14_370ff0ec0a) : RoutethreadU2DCommandRequest_b31e6e3498
    data class Option15(val value: RoutethreadU2DCommandRequestU2DOptionU2D15_2062bc5ac9) : RoutethreadU2DCommandRequest_b31e6e3498
    data class Option16(val value: RoutethreadU2DCommandRequestU2DOptionU2D16_efd9410c75) : RoutethreadU2DCommandRequest_b31e6e3498
    data class Option17(val value: RoutethreadU2DCommandRequestU2DOptionU2D17_69af29ff38) : RoutethreadU2DCommandRequest_b31e6e3498
    data class Option18(val value: RoutethreadU2DCommandRequestU2DOptionU2D18_4985039121) : RoutethreadU2DCommandRequest_b31e6e3498
    object Serializer : KSerializer<RoutethreadU2DCommandRequest_b31e6e3498> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutethreadU2DCommandRequest_b31e6e3498")
        override fun deserialize(decoder: Decoder): RoutethreadU2DCommandRequest_b31e6e3498 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutethreadU2DCommandRequest_b31e6e3498 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutethreadU2DCommandRequest_b31e6e3498>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("fork")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D1_8d889103a9>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("prepare-worktree")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D2_b01e26e043>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("start")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D3_b34d955e5d>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("set-group")))) { Option4(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D4_21cd039cb3>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("clear-group")))) { Option5(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D5_1ae7de2180>(element)) }
            RemoteUnionCodec.tryOption(matches, 6, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("rename")))) { Option6(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D6_2e4d2aaed0>(element)) }
            RemoteUnionCodec.tryOption(matches, 7, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("acknowledge")))) { Option7(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D7_c3363423bb>(element)) }
            RemoteUnionCodec.tryOption(matches, 8, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("set-done")))) { Option8(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D8_80906c6ddc>(element)) }
            RemoteUnionCodec.tryOption(matches, 9, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("set-starred")))) { Option9(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D9_ebd70a208b>(element)) }
            RemoteUnionCodec.tryOption(matches, 10, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("set-worktree")))) { Option10(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D10_b79d8f64de>(element)) }
            RemoteUnionCodec.tryOption(matches, 11, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("delete-worktree-group")))) { Option11(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D11_09765c7778>(element)) }
            RemoteUnionCodec.tryOption(matches, 12, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("archive")))) { Option12(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D12_431be1ab7e>(element)) }
            RemoteUnionCodec.tryOption(matches, 13, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("unarchive")))) { Option13(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D13_a93ba7bf23>(element)) }
            RemoteUnionCodec.tryOption(matches, 14, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("delete")))) { Option14(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D14_370ff0ec0a>(element)) }
            RemoteUnionCodec.tryOption(matches, 15, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("reorder")))) { Option15(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D15_2062bc5ac9>(element)) }
            RemoteUnionCodec.tryOption(matches, 16, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("reorder-flat")))) { Option16(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D16_efd9410c75>(element)) }
            RemoteUnionCodec.tryOption(matches, 17, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("set-workspace")))) { Option17(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D17_69af29ff38>(element)) }
            RemoteUnionCodec.tryOption(matches, 18, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("create")))) { Option18(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D18_4985039121>(element)) }
            return RemoteUnionCodec.single("RoutethreadU2DCommandRequest_b31e6e3498", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutethreadU2DCommandRequest_b31e6e3498) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutethreadU2DCommandRequest_b31e6e3498 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D1_8d889103a9>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D2_b01e26e043>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D3_b34d955e5d>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D4_21cd039cb3>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D5_1ae7de2180>(value.value)
                is Option6 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D6_2e4d2aaed0>(value.value)
                is Option7 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D7_c3363423bb>(value.value)
                is Option8 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D8_80906c6ddc>(value.value)
                is Option9 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D9_ebd70a208b>(value.value)
                is Option10 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D10_b79d8f64de>(value.value)
                is Option11 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D11_09765c7778>(value.value)
                is Option12 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D12_431be1ab7e>(value.value)
                is Option13 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D13_a93ba7bf23>(value.value)
                is Option14 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D14_370ff0ec0a>(value.value)
                is Option15 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D15_2062bc5ac9>(value.value)
                is Option16 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D16_efd9410c75>(value.value)
                is Option17 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D17_69af29ff38>(value.value)
                is Option18 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D18_4985039121>(value.value)
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
data class RoutethreadU2DHistoryQuery_677d43553d(
    @SerialName("completedTurnsLimit") val completedTurnsLimit: RemoteField<Long> = RemoteField.Missing,
    @SerialName("deferBodies") val deferBodies: RemoteField<RoutethreadU2DHistoryU2DItemsQueryU2DDeferBodies_30a537a934> = RemoteField.Missing,
    @SerialName("maxBytes") val maxBytes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("maxDecodeBytes") val maxDecodeBytes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("notices") val notices: RemoteField<RoutethreadU2DHistoryU2DChangesQueryU2DNotices_f67f6cbe63> = RemoteField.Missing,
    @SerialName("omitScrollback") val omitScrollback: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("projection") val projection: RemoteField<RoutethreadU2DHistoryU2DChangesQueryU2DProjection_72a4409660> = RemoteField.Missing,
    @SerialName("reads") val reads: RemoteField<RouteprojectU2DListQueryU2DReads_4659e6d395> = RemoteField.Missing,
    @SerialName("runtimePage") val runtimePage: RemoteField<RouteconversationU2DSearchQueryU2DVersion_8795ea0289> = RemoteField.Missing,
    @SerialName("targetTimelineEntryCount") val targetTimelineEntryCount: RemoteField<Long> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("completedTurnsLimit", "Long", false, false, 1.0, 500.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("deferBodies", "RoutethreadU2DHistoryU2DItemsQueryU2DDeferBodies_30a537a934", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxBytes", "Long", false, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxDecodeBytes", "Long", false, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("notices", "RoutethreadU2DHistoryU2DChangesQueryU2DNotices_f67f6cbe63", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("omitScrollback", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projection", "RoutethreadU2DHistoryU2DChangesQueryU2DProjection_72a4409660", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reads", "RouteprojectU2DListQueryU2DReads_4659e6d395", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimePage", "RouteconversationU2DSearchQueryU2DVersion_8795ea0289", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("targetTimelineEntryCount", "Long", false, false, 1.0, 100.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DHistoryResponse_5b71f859e6(
    @SerialName("backgroundTasks") val backgroundTasks: RemoteField<ProcedurereadThreadBackgroundTasksResult_00675d64d4> = RemoteField.Missing,
    @SerialName("completedTurns") val completedTurns: List<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DCompletedTurnsU2DItem_df96bd315b>,
    @SerialName("completedTurnsNextCursor") val completedTurnsNextCursor: RemoteField<String> = RemoteField.Missing,
    @SerialName("contextUsage") val contextUsage: RemoteField<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b>,
    @SerialName("followUpQueue") val followUpQueue: RemoteField<ProceduregetThreadFollowUpQueueResultU2DOptionU2D1_0174a8d738> = RemoteField.Missing,
    @SerialName("historyProjection") val historyProjection: RemoteField<RoutethreadU2DHistoryU2DChangesQueryU2DProjection_72a4409660> = RemoteField.Missing,
    @SerialName("reads") val reads: RemoteField<RouteprojectU2DListQueryU2DReads_4659e6d395> = RemoteField.Missing,
    @SerialName("runtimeItems") val runtimeItems: List<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeItemsU2DItem_8fa99a81fa>,
    @SerialName("runtimeNextCursor") val runtimeNextCursor: RemoteField<Long> = RemoteField.Missing,
    @SerialName("runtimeNotice") val runtimeNotice: RemoteField<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNotice_1468dfe9a2> = RemoteField.Missing,
    @SerialName("runtimeResumeCursor") val runtimeResumeCursor: RemoteField<String> = RemoteField.Missing,
    @SerialName("runtimeStateCurrent") val runtimeStateCurrent: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("snapshotSeq") val snapshotSeq: Long,
    @SerialName("terminalScrollback") val terminalScrollback: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("terminalSize") val terminalSize: RemoteField<ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09> = RemoteField.Missing,
    @SerialName("thread") val thread: RouteshellU2DSnapshotResponseU2DThreadsU2DItem_19a6d2a8a6,
    @SerialName("updatedAt") val updatedAt: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("backgroundTasks", "ProcedurereadThreadBackgroundTasksResult_00675d64d4", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("completedTurns", "List<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DCompletedTurnsU2DItem_df96bd315b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("completedTurnsNextCursor", "String", false, true, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("contextUsage", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("followUpQueue", "ProceduregetThreadFollowUpQueueResultU2DOptionU2D1_0174a8d738", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("historyProjection", "RoutethreadU2DHistoryU2DChangesQueryU2DProjection_72a4409660", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reads", "RouteprojectU2DListQueryU2DReads_4659e6d395", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeItems", "List<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeItemsU2DItem_8fa99a81fa>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeNextCursor", "Long", false, true, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeNotice", "RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNotice_1468dfe9a2", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeResumeCursor", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeStateCurrent", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("snapshotSeq", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("terminalScrollback", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("terminalSize", "ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("thread", "RouteshellU2DSnapshotResponseU2DThreadsU2DItem_19a6d2a8a6", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("updatedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DHistoryU2DChangesQueryU2DNotices_f67f6cbe63 {
    @SerialName("v1") V1,
}

@Serializable
enum class RoutethreadU2DHistoryU2DChangesQueryU2DProjection_72a4409660 {
    @SerialName("details-v1") DETAILSU2DV1,
}

@Serializable
data class RoutethreadU2DHistoryU2DChangesQuery_095b77a7c8(
    @SerialName("afterSeq") val afterSeq: RemoteField<Long> = RemoteField.Missing,
    @SerialName("cursor") val cursor: String,
    @SerialName("maxBytes") val maxBytes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("maxDecodeBytes") val maxDecodeBytes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("notices") val notices: RoutethreadU2DHistoryU2DChangesQueryU2DNotices_f67f6cbe63,
    @SerialName("projection") val projection: RemoteField<RoutethreadU2DHistoryU2DChangesQueryU2DProjection_72a4409660> = RemoteField.Missing,
    @SerialName("reads") val reads: RouteprojectU2DListQueryU2DReads_4659e6d395,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("afterSeq", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("cursor", "String", true, false, null, null, 1, 4096, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxBytes", "Long", false, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxDecodeBytes", "Long", false, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("notices", "RoutethreadU2DHistoryU2DChangesQueryU2DNotices_f67f6cbe63", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projection", "RoutethreadU2DHistoryU2DChangesQueryU2DProjection_72a4409660", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reads", "RouteprojectU2DListQueryU2DReads_4659e6d395", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DKind_9e712b4f87 {
    @SerialName("snapshot") SNAPSHOT,
}

@Serializable
data class RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DCompletedTurnsU2DItem_df96bd315b(
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
data class RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeItemsU2DItem_8fa99a81fa(
    @SerialName("detailsDeferred") val detailsDeferred: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("parentItemId") val parentItemId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("payload") val payload: RemoteField<JsonElement> = RemoteField.Missing,
    @SerialName("state") val state: RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThreadU2DValueU2DLatestItemState_2472eab79a,
    @SerialName("streams") val streams: ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67,
    @SerialName("type") val type: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("detailsDeferred", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1", false, false, null, null, null, null, null, null, null, null, listOf()),
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
enum class RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNoticeU2DKind_f8afe6df00 {
    @SerialName("history-incomplete") HISTORYU2DINCOMPLETE,
}

@Serializable
enum class RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNoticeU2DReason_9780f521bc {
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
enum class RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNoticeU2DSource_77a7dec7ed {
    @SerialName("exact") EXACT,
    @SerialName("suspect") SUSPECT,
}

@Serializable
data class RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNotice_1468dfe9a2(
    @SerialName("acknowledgedCount") val acknowledgedCount: Long,
    @SerialName("firstAcknowledgedAt") val firstAcknowledgedAt: Long,
    @SerialName("kind") val kind: RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNoticeU2DKind_f8afe6df00,
    @SerialName("lastAcknowledgedAt") val lastAcknowledgedAt: Long,
    @SerialName("reason") val reason: RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNoticeU2DReason_9780f521bc,
    @SerialName("refusedBytes") val refusedBytes: Long,
    @SerialName("refusedEvents") val refusedEvents: Long,
    @SerialName("source") val source: RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNoticeU2DSource_77a7dec7ed,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("acknowledgedCount", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("firstAcknowledgedAt", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNoticeU2DKind_f8afe6df00", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastAcknowledgedAt", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reason", "RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNoticeU2DReason_9780f521bc", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("refusedBytes", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("refusedEvents", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("source", "RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNoticeU2DSource_77a7dec7ed", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshot_ac9a64d31e(
    @SerialName("backgroundTasks") val backgroundTasks: RemoteField<ProcedurereadThreadBackgroundTasksResult_00675d64d4> = RemoteField.Missing,
    @SerialName("completedTurns") val completedTurns: List<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DCompletedTurnsU2DItem_df96bd315b>,
    @SerialName("completedTurnsNextCursor") val completedTurnsNextCursor: RemoteField<String>,
    @SerialName("contextUsage") val contextUsage: RemoteField<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b>,
    @SerialName("followUpQueue") val followUpQueue: RemoteField<ProceduregetThreadFollowUpQueueResultU2DOptionU2D1_0174a8d738> = RemoteField.Missing,
    @SerialName("historyProjection") val historyProjection: RemoteField<RoutethreadU2DHistoryU2DChangesQueryU2DProjection_72a4409660> = RemoteField.Missing,
    @SerialName("reads") val reads: RouteprojectU2DListQueryU2DReads_4659e6d395,
    @SerialName("runtimeItems") val runtimeItems: List<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeItemsU2DItem_8fa99a81fa>,
    @SerialName("runtimeNextCursor") val runtimeNextCursor: RemoteField<Long> = RemoteField.Missing,
    @SerialName("runtimeNotice") val runtimeNotice: RemoteField<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNotice_1468dfe9a2> = RemoteField.Missing,
    @SerialName("runtimeResumeCursor") val runtimeResumeCursor: RemoteField<String> = RemoteField.Missing,
    @SerialName("runtimeStateCurrent") val runtimeStateCurrent: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("snapshotSeq") val snapshotSeq: Long,
    @SerialName("terminalScrollback") val terminalScrollback: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("terminalSize") val terminalSize: RemoteField<ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09> = RemoteField.Missing,
    @SerialName("thread") val thread: RouteshellU2DSnapshotResponseU2DThreadsU2DItem_19a6d2a8a6,
    @SerialName("updatedAt") val updatedAt: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("backgroundTasks", "ProcedurereadThreadBackgroundTasksResult_00675d64d4", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("completedTurns", "List<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DCompletedTurnsU2DItem_df96bd315b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("completedTurnsNextCursor", "String", true, true, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("contextUsage", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("followUpQueue", "ProceduregetThreadFollowUpQueueResultU2DOptionU2D1_0174a8d738", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("historyProjection", "RoutethreadU2DHistoryU2DChangesQueryU2DProjection_72a4409660", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reads", "RouteprojectU2DListQueryU2DReads_4659e6d395", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeItems", "List<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeItemsU2DItem_8fa99a81fa>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeNextCursor", "Long", false, true, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeNotice", "RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNotice_1468dfe9a2", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeResumeCursor", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeStateCurrent", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("snapshotSeq", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("terminalScrollback", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("terminalSize", "ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("thread", "RouteshellU2DSnapshotResponseU2DThreadsU2DItem_19a6d2a8a6", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("updatedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1_40fa2f9d3d(
    @SerialName("kind") val kind: RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DKind_9e712b4f87,
    @SerialName("snapshot") val snapshot: RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshot_ac9a64d31e,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DKind_9e712b4f87", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("snapshot", "RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshot_ac9a64d31e", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D2U2DBatchesU2DItem_7335440d3a(
    @SerialName("events") val events: List<ProceduresubagentSubscribeResultU2DHistoryU2DItem_878159c48a>,
    @SerialName("seq") val seq: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("events", "List<ProceduresubagentSubscribeResultU2DHistoryU2DItem_878159c48a>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("seq", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D2U2DKind_e1a91348d8 {
    @SerialName("events") EVENTS,
}

@Serializable
data class RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D2_f8728ddcf8(
    @SerialName("backgroundTasks") val backgroundTasks: RemoteField<ProcedurereadThreadBackgroundTasksResult_00675d64d4> = RemoteField.Missing,
    @SerialName("batches") val batches: List<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D2U2DBatchesU2DItem_7335440d3a>,
    @SerialName("completedTurns") val completedTurns: List<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DCompletedTurnsU2DItem_df96bd315b>,
    @SerialName("completedTurnsNextCursor") val completedTurnsNextCursor: RemoteField<String> = RemoteField.Missing,
    @SerialName("contextUsage") val contextUsage: RemoteField<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b>,
    @SerialName("followUpQueue") val followUpQueue: RemoteField<ProceduregetThreadFollowUpQueueResultU2DOptionU2D1_0174a8d738> = RemoteField.Missing,
    @SerialName("kind") val kind: RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D2U2DKind_e1a91348d8,
    @SerialName("runtimeNotice") val runtimeNotice: RemoteField<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNotice_1468dfe9a2> = RemoteField.Missing,
    @SerialName("runtimeResumeCursor") val runtimeResumeCursor: String,
    @SerialName("runtimeStateCurrent") val runtimeStateCurrent: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("snapshotSeq") val snapshotSeq: Long,
    @SerialName("thread") val thread: RouteshellU2DSnapshotResponseU2DThreadsU2DItem_19a6d2a8a6,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("backgroundTasks", "ProcedurereadThreadBackgroundTasksResult_00675d64d4", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("batches", "List<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D2U2DBatchesU2DItem_7335440d3a>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("completedTurns", "List<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DCompletedTurnsU2DItem_df96bd315b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("completedTurnsNextCursor", "String", false, true, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("contextUsage", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("followUpQueue", "ProceduregetThreadFollowUpQueueResultU2DOptionU2D1_0174a8d738", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D2U2DKind_e1a91348d8", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeNotice", "RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNotice_1468dfe9a2", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeResumeCursor", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeStateCurrent", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("snapshotSeq", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("thread", "RouteshellU2DSnapshotResponseU2DThreadsU2DItem_19a6d2a8a6", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
