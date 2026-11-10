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
