// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RouteshellU2DSnapshotResponseU2DGitStateU2DTargetsU2DValue_d68bbd0856(
    @SerialName("pullRequestKey") val pullRequestKey: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("ref") val ref: RouteshellU2DSnapshotResponseU2DGitStateU2DTargetsU2DValueU2DRef_725be166aa,
    @SerialName("refreshedAt") val refreshedAt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("sourceInfo") val sourceInfo: RemoteField<ProceduregitGetWorktreeSourceBranchResult_4864c5f65a> = RemoteField.Missing,
    @SerialName("status") val status: RemoteField<ProceduregetGitStatusResult_c1d4a9f752> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("pullRequestKey", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ref", "RouteshellU2DSnapshotResponseU2DGitStateU2DTargetsU2DValueU2DRef_725be166aa", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("refreshedAt", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sourceInfo", "ProceduregitGetWorktreeSourceBranchResult_4864c5f65a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProceduregetGitStatusResult_c1d4a9f752", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteshellU2DSnapshotResponseU2DGitStateU2DTargets_7675a7cd6a = Map<String, RouteshellU2DSnapshotResponseU2DGitStateU2DTargetsU2DValue_d68bbd0856>

@Serializable
data class RouteshellU2DSnapshotResponseU2DGitState_4331716fe2(
    @SerialName("projectPullRequestLists") val projectPullRequestLists: RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestLists_d8ae5c3a60,
    @SerialName("projects") val projects: RouteshellU2DSnapshotResponseU2DGitStateU2DProjects_1da8031b61,
    @SerialName("pullRequestKeyByBranch") val pullRequestKeyByBranch: ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67,
    @SerialName("pullRequests") val pullRequests: RouteshellU2DSnapshotResponseU2DGitStateU2DPullRequests_4c858ee6a4,
    @SerialName("revision") val revision: Long,
    @SerialName("targets") val targets: RouteshellU2DSnapshotResponseU2DGitStateU2DTargets_7675a7cd6a,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("projectPullRequestLists", "RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestLists_d8ae5c3a60", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projects", "RouteshellU2DSnapshotResponseU2DGitStateU2DProjects_1da8031b61", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pullRequestKeyByBranch", "ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pullRequests", "RouteshellU2DSnapshotResponseU2DGitStateU2DPullRequests_4c858ee6a4", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("revision", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("targets", "RouteshellU2DSnapshotResponseU2DGitStateU2DTargets_7675a7cd6a", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DGitSummariesByThreadU2DValueU2DPrU2DOptionU2D1_1c58197f24(
    @SerialName("checksStatus") val checksStatus: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("isDraft") val isDraft: Boolean,
    @SerialName("number") val number: Long,
    @SerialName("state") val state: ProcedureghCreatePrResultU2DState_79fd49e14d,
    @SerialName("title") val title: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("url") val url: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("checksStatus", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("isDraft", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("number", "Long", true, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("state", "ProcedureghCreatePrResultU2DState_79fd49e14d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteshellU2DSnapshotResponseU2DGitSummariesByThreadU2DValueU2DPr_9d263023fc = RouteshellU2DSnapshotResponseU2DGitSummariesByThreadU2DValueU2DPrU2DOptionU2D1_1c58197f24?

@Serializable
data class RouteshellU2DSnapshotResponseU2DGitSummariesByThreadU2DValue_b2a9cad3f0(
    @SerialName("ahead") val ahead: Long,
    @SerialName("behind") val behind: Long,
    @SerialName("branch") val branch: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("isRepo") val isRepo: Boolean,
    @SerialName("pr") val pr: RemoteField<RouteshellU2DSnapshotResponseU2DGitSummariesByThreadU2DValueU2DPrU2DOptionU2D1_1c58197f24>,
    @SerialName("totalDeletions") val totalDeletions: Long,
    @SerialName("totalInsertions") val totalInsertions: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("ahead", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("behind", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("branch", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("isRepo", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pr", "RouteshellU2DSnapshotResponseU2DGitSummariesByThreadU2DValueU2DPrU2DOptionU2D1_1c58197f24", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("totalDeletions", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("totalInsertions", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteshellU2DSnapshotResponseU2DGitSummariesByThread_aca97eda78 = Map<String, RouteshellU2DSnapshotResponseU2DGitSummariesByThreadU2DValue_b2a9cad3f0>

typealias RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThreadU2DValueU2DContextUsage_e47ad2358c = ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b?

@Serializable
enum class RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThreadU2DValueU2DLatestItemState_2472eab79a {
    @SerialName("started") STARTED,
    @SerialName("updated") UPDATED,
    @SerialName("completed") COMPLETED,
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThreadU2DValue_5d401c152e(
    @SerialName("contextUsage") val contextUsage: RemoteField<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b> = RemoteField.Missing,
    @SerialName("itemCount") val itemCount: Long,
    @SerialName("latestItemId") val latestItemId: RemoteField<String> = RemoteField.Missing,
    @SerialName("latestItemState") val latestItemState: RemoteField<RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThreadU2DValueU2DLatestItemState_2472eab79a> = RemoteField.Missing,
    @SerialName("latestItemType") val latestItemType: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("contextUsage", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("itemCount", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("latestItemId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("latestItemState", "RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThreadU2DValueU2DLatestItemState_2472eab79a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("latestItemType", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThread_fc9d6f4c26 = Map<String, RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThreadU2DValue_5d401c152e>

@Serializable
data class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D1_66504fdb43(
    @SerialName("kind") val kind: ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D1U2DKind_5465dd986b,
    @SerialName("path") val path: String,
    @SerialName("remoteServerId") val remoteServerId: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D1U2DKind_5465dd986b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, 4096, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remoteServerId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D2_8b72b09d5c(
    @SerialName("distro") val distro: String,
    @SerialName("kind") val kind: ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D2U2DKind_2d8274eae5,
    @SerialName("linuxPath") val linuxPath: String,
    @SerialName("remoteServerId") val remoteServerId: RemoteField<String> = RemoteField.Missing,
    @SerialName("uncPath") val uncPath: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("distro", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D2U2DKind_2d8274eae5", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("linuxPath", "String", true, false, null, null, 1, 4096, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remoteServerId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("uncPath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D3_8850f6c7f1(
    @SerialName("kind") val kind: ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D3U2DKind_835d30ad47,
    @SerialName("path") val path: String,
    @SerialName("remoteServerId") val remoteServerId: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D3U2DKind_835d30ad47", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, 4096, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remoteServerId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1.Serializer::class)
sealed interface RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1 {
    data class Option1(val value: RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D1_66504fdb43) : RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1
    data class Option2(val value: RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D2_8b72b09d5c) : RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1
    data class Option3(val value: RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D3_8850f6c7f1) : RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1
    object Serializer : KSerializer<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1")
        override fun deserialize(decoder: Decoder): RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("windows")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D1_66504fdb43>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("wsl")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D2_8b72b09d5c>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("posix")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D3_8850f6c7f1>(element)) }
            return RemoteUnionCodec.single("RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1", matches)
        }
        override fun serialize(encoder: Encoder, value: RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D1_66504fdb43>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D2_8b72b09d5c>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D3_8850f6c7f1>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAttention_58edfaf9f7 {
    @SerialName("none") NONE,
    @SerialName("working") WORKING,
    @SerialName("needs_approval") NEEDSU5FAPPROVAL,
    @SerialName("needs_reply") NEEDSU5FREPLY,
    @SerialName("error") ERROR,
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DGroupsU2DItem_2e2f445a74(
    @SerialName("id") val id: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("name") val name: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DRole_09201de15f {
    @SerialName("model") MODEL,
    @SerialName("effort") EFFORT,
    @SerialName("mode") MODE,
    @SerialName("thinking") THINKING,
    @SerialName("fast") FAST,
    @SerialName("context") CONTEXT,
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DValuesU2DItem_0465e7aaae(
    @SerialName("group") val group: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("name") val name: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("value") val value: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("group", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("value", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1_84503a3e63(
    @SerialName("category") val category: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("currentValue") val currentValue: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("groups") val groups: List<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DGroupsU2DItem_2e2f445a74>,
    @SerialName("id") val id: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("name") val name: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("role") val role: RemoteField<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DRole_09201de15f> = RemoteField.Missing,
    @SerialName("type") val type: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItemU2DOptionU2D2U2DType_36b9fe91ec,
    @SerialName("values") val values: List<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DValuesU2DItem_0465e7aaae>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("category", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("currentValue", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("groups", "List<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DGroupsU2DItem_2e2f445a74>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("role", "RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DRole_09201de15f", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItemU2DOptionU2D2U2DType_36b9fe91ec", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("values", "List<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DValuesU2DItem_0465e7aaae>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D2U2DType_2c671d62fd {
    @SerialName("boolean") BOOLEAN,
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D2_93cbcfd8dc(
    @SerialName("category") val category: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("currentValue") val currentValue: Boolean,
    @SerialName("id") val id: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("name") val name: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("role") val role: RemoteField<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DRole_09201de15f> = RemoteField.Missing,
    @SerialName("type") val type: RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D2U2DType_2c671d62fd,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("category", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("currentValue", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("role", "RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DRole_09201de15f", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D2U2DType_2c671d62fd", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D3U2DType_91b38b813d {
    @SerialName("unsupported") UNSUPPORTED,
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D3_0a0c8726ed(
    @SerialName("category") val category: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("controlType") val controlType: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("id") val id: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("name") val name: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("role") val role: RemoteField<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DRole_09201de15f> = RemoteField.Missing,
    @SerialName("type") val type: RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D3U2DType_91b38b813d,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("category", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("controlType", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("role", "RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DRole_09201de15f", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D3U2DType_91b38b813d", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItem_d4a49a3cee.Serializer::class)
sealed interface RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItem_d4a49a3cee {
    data class Option1(val value: RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1_84503a3e63) : RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItem_d4a49a3cee
    data class Option2(val value: RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D2_93cbcfd8dc) : RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItem_d4a49a3cee
    data class Option3(val value: RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D3_0a0c8726ed) : RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItem_d4a49a3cee
    object Serializer : KSerializer<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItem_d4a49a3cee> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItem_d4a49a3cee")
        override fun deserialize(decoder: Decoder): RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItem_d4a49a3cee {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItem_d4a49a3cee supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItem_d4a49a3cee>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("select")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1_84503a3e63>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("boolean")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D2_93cbcfd8dc>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("unsupported")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D3_0a0c8726ed>(element)) }
            return RemoteUnionCodec.single("RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItem_d4a49a3cee", matches)
        }
        override fun serialize(encoder: Encoder, value: RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItem_d4a49a3cee) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItem_d4a49a3cee supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1_84503a3e63>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D2_93cbcfd8dc>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D3_0a0c8726ed>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

typealias RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptions_9b050dd484 = List<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItem_d4a49a3cee>?

@Serializable
enum class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DThreadStatusSource_8f73948792 {
    @SerialName("cli_hook") CLIU5FHOOK,
    @SerialName("terminal_parse") TERMINALU5FPARSE,
    @SerialName("server") SERVER,
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DThreadsU2DItem_df1aff1490(
    @SerialName("activeTurnStartedAt") val activeTurnStartedAt: RemoteField<String> = RemoteField.Missing,
    @SerialName("additionalDirectories") val additionalDirectories: RemoteField<List<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1>> = RemoteField.Missing,
    @SerialName("agentInstanceId") val agentInstanceId: RemoteField<String> = RemoteField.Missing,
    @SerialName("agentKind") val agentKind: String,
    @SerialName("archived") val archived: Boolean,
    @SerialName("archivedAt") val archivedAt: RemoteField<String> = RemoteField.Missing,
    @SerialName("attention") val attention: RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAttention_58edfaf9f7,
    @SerialName("canResumeWithConfig") val canResumeWithConfig: Boolean,
    @SerialName("config") val config: ProcedureconnectThreadVoiceRequestU2DConfig_c721e8abc0,
    @SerialName("createdAt") val createdAt: String,
    @SerialName("done") val done: Boolean,
    @SerialName("doneAt") val doneAt: RemoteField<String> = RemoteField.Missing,
    @SerialName("errorMessage") val errorMessage: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("groupId") val groupId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("groupName") val groupName: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("lastTurnEndedAt") val lastTurnEndedAt: RemoteField<String> = RemoteField.Missing,
    @SerialName("lastTurnStartedAt") val lastTurnStartedAt: RemoteField<String> = RemoteField.Missing,
    @SerialName("parentThreadId") val parentThreadId: RemoteField<String> = RemoteField.Missing,
    @SerialName("prNumber") val prNumber: RemoteField<Double> = RemoteField.Missing,
    @SerialName("presentationMode") val presentationMode: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6> = RemoteField.Missing,
    @SerialName("projectId") val projectId: String,
    @SerialName("remoteId") val remoteId: RemoteField<String> = RemoteField.Missing,
    @SerialName("remoteServerId") val remoteServerId: RemoteField<String> = RemoteField.Missing,
    @SerialName("sessionConfigOptions") val sessionConfigOptions: RemoteField<List<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItem_d4a49a3cee>> = RemoteField.Missing,
    @SerialName("sessionRef") val sessionRef: RemoteField<ProcedureensureThreadRunningRequestU2DSessionRef_25df6feb29> = RemoteField.Missing,
    @SerialName("slashCommands") val slashCommands: RemoteField<List<RouteagentU2DSlashU2DCommandsResponseU2DCommandsU2DItem_7324613e41>> = RemoteField.Missing,
    @SerialName("starred") val starred: Boolean,
    @SerialName("status") val status: ProcedureensureThreadRunningRequestU2DProviderSwitchU2DPreviousStatus_8c61ed237d,
    @SerialName("threadStatusSource") val threadStatusSource: RemoteField<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DThreadStatusSource_8f73948792> = RemoteField.Missing,
    @SerialName("title") val title: String,
    @SerialName("updatedAt") val updatedAt: String,
    @SerialName("workspaceGrantRevision") val workspaceGrantRevision: RemoteField<Long> = RemoteField.Missing,
    @SerialName("workspaceId") val workspaceId: RemoteField<String> = RemoteField.Missing,
    @SerialName("worktreeBranch") val worktreeBranch: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("worktreePath") val worktreePath: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("activeTurnStartedAt", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("additionalDirectories", "List<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1>", false, false, null, null, null, null, null, 16, null, null, listOf()),
            RemoteFieldDescriptor("agentInstanceId", "String", false, false, null, null, 1, 120, null, null, "^[a-z0-9][a-z0-9_\\-:.]*$", null, listOf()),
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("archived", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("archivedAt", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("attention", "RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAttention_58edfaf9f7", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("canResumeWithConfig", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("config", "ProcedureconnectThreadVoiceRequestU2DConfig_c721e8abc0", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("createdAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("done", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("doneAt", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("errorMessage", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("groupId", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("groupName", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastTurnEndedAt", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastTurnStartedAt", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("parentThreadId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prNumber", "Double", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationMode", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remoteId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remoteServerId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sessionConfigOptions", "List<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItem_d4a49a3cee>", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sessionRef", "ProcedureensureThreadRunningRequestU2DSessionRef_25df6feb29", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("slashCommands", "List<RouteagentU2DSlashU2DCommandsResponseU2DCommandsU2DItem_7324613e41>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("starred", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedureensureThreadRunningRequestU2DProviderSwitchU2DPreviousStatus_8c61ed237d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadStatusSource", "RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DThreadStatusSource_8f73948792", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("updatedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("workspaceGrantRevision", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("workspaceId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeBranch", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
