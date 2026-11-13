// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
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
data class RoutethreadU2DHistoryQuery_598de4be53(
    @SerialName("completedTurnsLimit") val completedTurnsLimit: RemoteField<Long> = RemoteField.Missing,
    @SerialName("deferBodies") val deferBodies: RemoteField<RoutethreadU2DHistoryU2DItemsQueryU2DDeferBodies_30a537a934> = RemoteField.Missing,
    @SerialName("historyCache") val historyCache: RemoteField<RoutethreadU2DHistoryU2DChangesQueryU2DNotices_f67f6cbe63> = RemoteField.Missing,
    @SerialName("historyRevision") val historyRevision: RemoteField<String> = RemoteField.Missing,
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
            RemoteFieldDescriptor("historyCache", "RoutethreadU2DHistoryU2DChangesQueryU2DNotices_f67f6cbe63", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("historyRevision", "String", false, false, null, null, 1, 160, null, null, null, null, listOf()),
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
data class RoutethreadU2DHistoryResponse_d1ba4ef10f(
    @SerialName("backgroundTasks") val backgroundTasks: RemoteField<ProcedurereadThreadBackgroundTasksResult_f5906c75b7> = RemoteField.Missing,
    @SerialName("completedTurns") val completedTurns: List<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DCompletedTurnsU2DItem_df96bd315b>,
    @SerialName("completedTurnsNextCursor") val completedTurnsNextCursor: RemoteField<String> = RemoteField.Missing,
    @SerialName("contextUsage") val contextUsage: RemoteField<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b>,
    @SerialName("followUpQueue") val followUpQueue: RemoteField<ProceduregetThreadFollowUpQueueResultU2DOptionU2D1_0174a8d738> = RemoteField.Missing,
    @SerialName("historyCache") val historyCache: RemoteField<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DHistoryCache_6422ecf430> = RemoteField.Missing,
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
    @SerialName("thread") val thread: RouteshellU2DSnapshotResponseU2DThreadsU2DItem_b37f60804a,
    @SerialName("updatedAt") val updatedAt: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("backgroundTasks", "ProcedurereadThreadBackgroundTasksResult_f5906c75b7", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("completedTurns", "List<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DCompletedTurnsU2DItem_df96bd315b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("completedTurnsNextCursor", "String", false, true, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("contextUsage", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("followUpQueue", "ProceduregetThreadFollowUpQueueResultU2DOptionU2D1_0174a8d738", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("historyCache", "RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DHistoryCache_6422ecf430", false, false, null, null, null, null, null, null, null, null, listOf()),
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
            RemoteFieldDescriptor("thread", "RouteshellU2DSnapshotResponseU2DThreadsU2DItem_b37f60804a", true, false, null, null, null, null, null, null, null, null, listOf()),
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
data class RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DHistoryCache_6422ecf430(
    @SerialName("revision") val revision: String,
    @SerialName("unchanged") val unchanged: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("revision", "String", true, false, null, null, 1, 160, null, null, null, null, listOf()),
            RemoteFieldDescriptor("unchanged", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
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
