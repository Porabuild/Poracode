// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RoutethreadU2DHistoryQuery_8015752827(
    @SerialName("completedTurnsLimit") val completedTurnsLimit: RemoteField<Long> = RemoteField.Missing,
    @SerialName("maxBytes") val maxBytes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("maxDecodeBytes") val maxDecodeBytes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("notices") val notices: RemoteField<RoutethreadU2DHistoryU2DChangesQueryU2DNotices_f67f6cbe63> = RemoteField.Missing,
    @SerialName("omitScrollback") val omitScrollback: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("projection") val projection: RemoteField<RoutethreadU2DHistoryU2DChangesQueryU2DProjection_72a4409660> = RemoteField.Missing,
    @SerialName("reads") val reads: RemoteField<RouteprojectU2DListQueryU2DReads_4659e6d395> = RemoteField.Missing,
    @SerialName("runtimePage") val runtimePage: RemoteField<RoutethreadU2DHistoryQueryU2DRuntimePage_8795ea0289> = RemoteField.Missing,
    @SerialName("targetTimelineEntryCount") val targetTimelineEntryCount: RemoteField<Long> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("completedTurnsLimit", "Long", false, false, 1.0, 500.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxBytes", "Long", false, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxDecodeBytes", "Long", false, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("notices", "RoutethreadU2DHistoryU2DChangesQueryU2DNotices_f67f6cbe63", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("omitScrollback", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projection", "RoutethreadU2DHistoryU2DChangesQueryU2DProjection_72a4409660", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reads", "RouteprojectU2DListQueryU2DReads_4659e6d395", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimePage", "RoutethreadU2DHistoryQueryU2DRuntimePage_8795ea0289", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("targetTimelineEntryCount", "Long", false, false, 1.0, 100.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DHistoryResponse_2510935169(
    @SerialName("backgroundTasks") val backgroundTasks: RemoteField<ProcedurereadThreadBackgroundTasksResult_17dfab19af> = RemoteField.Missing,
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
    @SerialName("snapshotSeq") val snapshotSeq: Long,
    @SerialName("terminalScrollback") val terminalScrollback: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("terminalSize") val terminalSize: RemoteField<ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09> = RemoteField.Missing,
    @SerialName("thread") val thread: RouteshellU2DSnapshotResponseU2DThreadsU2DItem_c84f860f0e,
    @SerialName("updatedAt") val updatedAt: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("backgroundTasks", "ProcedurereadThreadBackgroundTasksResult_17dfab19af", false, false, null, null, null, null, null, null, null, null, listOf()),
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
            RemoteFieldDescriptor("snapshotSeq", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("terminalScrollback", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("terminalSize", "ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("thread", "RouteshellU2DSnapshotResponseU2DThreadsU2DItem_c84f860f0e", true, false, null, null, null, null, null, null, null, null, listOf()),
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
    @SerialName("detailsDeferred") val detailsDeferred: RemoteField<ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("parentItemId") val parentItemId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("payload") val payload: RemoteField<JsonElement> = RemoteField.Missing,
    @SerialName("state") val state: RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThreadU2DValueU2DLatestItemState_2472eab79a,
    @SerialName("streams") val streams: ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67,
    @SerialName("type") val type: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("detailsDeferred", "ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1", false, false, null, null, null, null, null, null, null, null, listOf()),
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
data class RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshot_bed5a38964(
    @SerialName("backgroundTasks") val backgroundTasks: RemoteField<ProcedurereadThreadBackgroundTasksResult_17dfab19af> = RemoteField.Missing,
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
    @SerialName("snapshotSeq") val snapshotSeq: Long,
    @SerialName("terminalScrollback") val terminalScrollback: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("terminalSize") val terminalSize: RemoteField<ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09> = RemoteField.Missing,
    @SerialName("thread") val thread: RouteshellU2DSnapshotResponseU2DThreadsU2DItem_c84f860f0e,
    @SerialName("updatedAt") val updatedAt: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("backgroundTasks", "ProcedurereadThreadBackgroundTasksResult_17dfab19af", false, false, null, null, null, null, null, null, null, null, listOf()),
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
            RemoteFieldDescriptor("snapshotSeq", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("terminalScrollback", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("terminalSize", "ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("thread", "RouteshellU2DSnapshotResponseU2DThreadsU2DItem_c84f860f0e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("updatedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1_c1c28d96f8(
    @SerialName("kind") val kind: RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DKind_9e712b4f87,
    @SerialName("snapshot") val snapshot: RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshot_bed5a38964,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DKind_9e712b4f87", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("snapshot", "RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshot_bed5a38964", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D2U2DBatchesU2DItem_6dd3b79310(
    @SerialName("events") val events: List<ProceduresubagentSubscribeResultU2DHistoryU2DItem_e990bf4d50>,
    @SerialName("seq") val seq: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("events", "List<ProceduresubagentSubscribeResultU2DHistoryU2DItem_e990bf4d50>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("seq", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D2U2DKind_e1a91348d8 {
    @SerialName("events") EVENTS,
}

@Serializable
data class RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D2_c509074a76(
    @SerialName("backgroundTasks") val backgroundTasks: RemoteField<ProcedurereadThreadBackgroundTasksResult_17dfab19af> = RemoteField.Missing,
    @SerialName("batches") val batches: List<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D2U2DBatchesU2DItem_6dd3b79310>,
    @SerialName("completedTurns") val completedTurns: List<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DCompletedTurnsU2DItem_df96bd315b>,
    @SerialName("completedTurnsNextCursor") val completedTurnsNextCursor: RemoteField<String> = RemoteField.Missing,
    @SerialName("contextUsage") val contextUsage: RemoteField<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b>,
    @SerialName("followUpQueue") val followUpQueue: RemoteField<ProceduregetThreadFollowUpQueueResultU2DOptionU2D1_0174a8d738> = RemoteField.Missing,
    @SerialName("kind") val kind: RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D2U2DKind_e1a91348d8,
    @SerialName("runtimeNotice") val runtimeNotice: RemoteField<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNotice_1468dfe9a2> = RemoteField.Missing,
    @SerialName("runtimeResumeCursor") val runtimeResumeCursor: String,
    @SerialName("snapshotSeq") val snapshotSeq: Long,
    @SerialName("thread") val thread: RouteshellU2DSnapshotResponseU2DThreadsU2DItem_c84f860f0e,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("backgroundTasks", "ProcedurereadThreadBackgroundTasksResult_17dfab19af", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("batches", "List<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D2U2DBatchesU2DItem_6dd3b79310>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("completedTurns", "List<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DCompletedTurnsU2DItem_df96bd315b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("completedTurnsNextCursor", "String", false, true, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("contextUsage", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("followUpQueue", "ProceduregetThreadFollowUpQueueResultU2DOptionU2D1_0174a8d738", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D2U2DKind_e1a91348d8", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeNotice", "RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNotice_1468dfe9a2", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeResumeCursor", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("snapshotSeq", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("thread", "RouteshellU2DSnapshotResponseU2DThreadsU2DItem_c84f860f0e", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RoutethreadU2DHistoryU2DChangesResponse_1be81c6a50.Serializer::class)
sealed interface RoutethreadU2DHistoryU2DChangesResponse_1be81c6a50 {
    data class Option1(val value: RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1_c1c28d96f8) : RoutethreadU2DHistoryU2DChangesResponse_1be81c6a50
    data class Option2(val value: RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D2_c509074a76) : RoutethreadU2DHistoryU2DChangesResponse_1be81c6a50
    object Serializer : KSerializer<RoutethreadU2DHistoryU2DChangesResponse_1be81c6a50> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutethreadU2DHistoryU2DChangesResponse_1be81c6a50")
        override fun deserialize(decoder: Decoder): RoutethreadU2DHistoryU2DChangesResponse_1be81c6a50 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutethreadU2DHistoryU2DChangesResponse_1be81c6a50 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutethreadU2DHistoryU2DChangesResponse_1be81c6a50>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("snapshot")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1_c1c28d96f8>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("events")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D2_c509074a76>(element)) }
            return RemoteUnionCodec.single("RoutethreadU2DHistoryU2DChangesResponse_1be81c6a50", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutethreadU2DHistoryU2DChangesResponse_1be81c6a50) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutethreadU2DHistoryU2DChangesResponse_1be81c6a50 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1_c1c28d96f8>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D2_c509074a76>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class RoutethreadU2DHistoryU2DItemQuery_ddfa380e07(
    @SerialName("maxBytes") val maxBytes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("maxDecodeBytes") val maxDecodeBytes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("notices") val notices: RoutethreadU2DHistoryU2DChangesQueryU2DNotices_f67f6cbe63,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("maxBytes", "Long", false, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxDecodeBytes", "Long", false, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("notices", "RoutethreadU2DHistoryU2DChangesQueryU2DNotices_f67f6cbe63", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DHistoryU2DItemResponseU2DItem_4c1171296b(
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
data class RoutethreadU2DHistoryU2DItemResponse_69f5ba498b(
    @SerialName("item") val item: RoutethreadU2DHistoryU2DItemResponseU2DItem_4c1171296b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("item", "RoutethreadU2DHistoryU2DItemResponseU2DItem_4c1171296b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DHistoryU2DItemsQuery_625450aae6(
    @SerialName("beforePosition") val beforePosition: RemoteField<Long> = RemoteField.Missing,
    @SerialName("limit") val limit: RemoteField<Long> = RemoteField.Missing,
    @SerialName("maxBytes") val maxBytes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("maxDecodeBytes") val maxDecodeBytes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("notices") val notices: RemoteField<RoutethreadU2DHistoryU2DChangesQueryU2DNotices_f67f6cbe63> = RemoteField.Missing,
    @SerialName("projection") val projection: RemoteField<RoutethreadU2DHistoryU2DChangesQueryU2DProjection_72a4409660> = RemoteField.Missing,
    @SerialName("reads") val reads: RemoteField<RouteprojectU2DListQueryU2DReads_4659e6d395> = RemoteField.Missing,
    @SerialName("targetTimelineEntryCount") val targetTimelineEntryCount: RemoteField<Long> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("beforePosition", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("limit", "Long", false, false, 1.0, 500.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxBytes", "Long", false, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxDecodeBytes", "Long", false, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("notices", "RoutethreadU2DHistoryU2DChangesQueryU2DNotices_f67f6cbe63", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projection", "RoutethreadU2DHistoryU2DChangesQueryU2DProjection_72a4409660", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reads", "RouteprojectU2DListQueryU2DReads_4659e6d395", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("targetTimelineEntryCount", "Long", false, false, 1.0, 100.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

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
