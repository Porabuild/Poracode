// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RouteshellU2DSnapshotResponse_611f9fdfa6(
    @SerialName("gitState") val gitState: RemoteField<RouteshellU2DSnapshotResponseU2DGitState_4331716fe2> = RemoteField.Missing,
    @SerialName("gitSummariesByThread") val gitSummariesByThread: RemoteField<RouteshellU2DSnapshotResponseU2DGitSummariesByThread_aca97eda78> = RemoteField.Missing,
    @SerialName("projects") val projects: List<RouteprojectU2DCommandResponseU2DProject_1bee38d9c4>,
    @SerialName("runtimeSummariesByThread") val runtimeSummariesByThread: RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThread_fc9d6f4c26,
    @SerialName("snapshotSeq") val snapshotSeq: Long,
    @SerialName("threads") val threads: List<RouteshellU2DSnapshotResponseU2DThreadsU2DItem_85fe4f2f37>,
    @SerialName("updatedAt") val updatedAt: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("gitState", "RouteshellU2DSnapshotResponseU2DGitState_4331716fe2", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("gitSummariesByThread", "RouteshellU2DSnapshotResponseU2DGitSummariesByThread_aca97eda78", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projects", "List<RouteprojectU2DCommandResponseU2DProject_1bee38d9c4>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeSummariesByThread", "RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThread_fc9d6f4c26", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("snapshotSeq", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threads", "List<RouteshellU2DSnapshotResponseU2DThreadsU2DItem_85fe4f2f37>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("updatedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteterminalU2DResizeRequest_55ee222c09(
    @SerialName("cols") val cols: Long,
    @SerialName("rows") val rows: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cols", "Long", true, false, 20.0, 400.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("rows", "Long", true, false, 5.0, 200.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteterminalU2DStartRequest_142a10f7fa(
    @SerialName("initialSize") val initialSize: RemoteField<RouteterminalU2DResizeRequest_55ee222c09> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("shellId") val shellId: String,
    @SerialName("startInHome") val startInHome: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("worktreePath") val worktreePath: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("initialSize", "RouteterminalU2DResizeRequest_55ee222c09", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("shellId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("startInHome", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteterminalU2DWriteRequest_6c6fca7050(
    @SerialName("data") val data: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("data", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D10U2DKind_53ceafeed2 {
    @SerialName("archive") ARCHIVE,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D10_431be1ab7e(
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D10U2DKind_53ceafeed2,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D10U2DKind_53ceafeed2", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D11U2DKind_c7bfc39efc {
    @SerialName("unarchive") UNARCHIVE,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D11_a93ba7bf23(
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D11U2DKind_c7bfc39efc,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D11U2DKind_c7bfc39efc", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D12_370ff0ec0a(
    @SerialName("kind") val kind: RouteschedulesU2DCommandRequestU2DOptionU2D3U2DKind_4d5989d27d,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteschedulesU2DCommandRequestU2DOptionU2D3U2DKind_4d5989d27d", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D1U2DKind_a1f40266b6 {
    @SerialName("prepare-worktree") PREPAREU2DWORKTREE,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D1_b01e26e043(
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D1U2DKind_a1f40266b6,
    @SerialName("projectId") val projectId: String,
    @SerialName("worktreePath") val worktreePath: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D1U2DKind_a1f40266b6", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D2U2DKind_60fc988aef {
    @SerialName("start") START,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D2_6efd374b59(
    @SerialName("agentInstanceId") val agentInstanceId: RemoteField<String> = RemoteField.Missing,
    @SerialName("agentKind") val agentKind: String,
    @SerialName("config") val config: ProcedurerollbackThreadConversationRequestU2DConfig_03b0262a8a,
    @SerialName("focus") val focus: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("groupId") val groupId: RemoteField<String> = RemoteField.Missing,
    @SerialName("groupName") val groupName: RemoteField<String> = RemoteField.Missing,
    @SerialName("isNewWorktree") val isNewWorktree: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D2U2DKind_60fc988aef,
    @SerialName("launchRuntime") val launchRuntime: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("parentThreadId") val parentThreadId: RemoteField<String> = RemoteField.Missing,
    @SerialName("prNumber") val prNumber: RemoteField<Long> = RemoteField.Missing,
    @SerialName("presentationMode") val presentationMode: RemoteField<ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6> = RemoteField.Missing,
    @SerialName("projectId") val projectId: String,
    @SerialName("prompt") val prompt: String,
    @SerialName("segments") val segments: RemoteField<List<ProcedurestageThreadInputRequestU2DSegmentsU2DItem_e957595c81>> = RemoteField.Missing,
    @SerialName("title") val title: RemoteField<String> = RemoteField.Missing,
    @SerialName("userMessageItemId") val userMessageItemId: RemoteField<String> = RemoteField.Missing,
    @SerialName("worktreeBranch") val worktreeBranch: RemoteField<String> = RemoteField.Missing,
    @SerialName("worktreePath") val worktreePath: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentInstanceId", "String", false, false, null, null, 1, 120, null, null, "^[a-z0-9][a-z0-9_\\-:.]*$", null, listOf()),
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("config", "ProcedurerollbackThreadConversationRequestU2DConfig_03b0262a8a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("focus", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("groupId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("groupName", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("isNewWorktree", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D2U2DKind_60fc988aef", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("launchRuntime", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("parentThreadId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prNumber", "Long", false, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationMode", "ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prompt", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("segments", "List<ProcedurestageThreadInputRequestU2DSegmentsU2DItem_e957595c81>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("userMessageItemId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeBranch", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D3U2DKind_f399af5f8d {
    @SerialName("set-group") SETU2DGROUP,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D3_a656e9f996(
    @SerialName("groupId") val groupId: String,
    @SerialName("groupName") val groupName: String,
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D3U2DKind_f399af5f8d,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("groupId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("groupName", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D3U2DKind_f399af5f8d", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D4U2DKind_356ae1fc45 {
    @SerialName("rename") RENAME,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D4_2e4d2aaed0(
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D4U2DKind_356ae1fc45,
    @SerialName("title") val title: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D4U2DKind_356ae1fc45", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D5U2DKind_4ec1299a98 {
    @SerialName("acknowledge") ACKNOWLEDGE,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D5_c3363423bb(
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D5U2DKind_4ec1299a98,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D5U2DKind_4ec1299a98", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D6U2DKind_a9e065ca18 {
    @SerialName("set-done") SETU2DDONE,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D6_80906c6ddc(
    @SerialName("done") val done: Boolean,
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D6U2DKind_a9e065ca18,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("done", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D6U2DKind_a9e065ca18", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D7U2DKind_833ef472e7 {
    @SerialName("set-starred") SETU2DSTARRED,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D7_ebd70a208b(
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D7U2DKind_833ef472e7,
    @SerialName("starred") val starred: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D7U2DKind_833ef472e7", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("starred", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D8U2DKind_49f72e8cc5 {
    @SerialName("set-worktree") SETU2DWORKTREE,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D8_b79d8f64de(
    @SerialName("isNewWorktree") val isNewWorktree: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D8U2DKind_49f72e8cc5,
    @SerialName("worktreeBranch") val worktreeBranch: RemoteField<String> = RemoteField.Missing,
    @SerialName("worktreePath") val worktreePath: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("isNewWorktree", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D8U2DKind_49f72e8cc5", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeBranch", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D9U2DKind_6a0abedb39 {
    @SerialName("delete-worktree-group") DELETEU2DWORKTREEU2DGROUP,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D9_09765c7778(
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D9U2DKind_6a0abedb39,
    @SerialName("projectId") val projectId: String,
    @SerialName("threadIds") val threadIds: List<String>,
    @SerialName("worktreePath") val worktreePath: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D9U2DKind_6a0abedb39", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadIds", "List<String>", true, false, null, null, null, null, 1, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RoutethreadU2DCommandRequest_3376a05db1.Serializer::class)
sealed interface RoutethreadU2DCommandRequest_3376a05db1 {
    data class Option1(val value: RoutethreadU2DCommandRequestU2DOptionU2D1_b01e26e043) : RoutethreadU2DCommandRequest_3376a05db1
    data class Option2(val value: RoutethreadU2DCommandRequestU2DOptionU2D2_6efd374b59) : RoutethreadU2DCommandRequest_3376a05db1
    data class Option3(val value: RoutethreadU2DCommandRequestU2DOptionU2D3_a656e9f996) : RoutethreadU2DCommandRequest_3376a05db1
    data class Option4(val value: RoutethreadU2DCommandRequestU2DOptionU2D4_2e4d2aaed0) : RoutethreadU2DCommandRequest_3376a05db1
    data class Option5(val value: RoutethreadU2DCommandRequestU2DOptionU2D5_c3363423bb) : RoutethreadU2DCommandRequest_3376a05db1
    data class Option6(val value: RoutethreadU2DCommandRequestU2DOptionU2D6_80906c6ddc) : RoutethreadU2DCommandRequest_3376a05db1
    data class Option7(val value: RoutethreadU2DCommandRequestU2DOptionU2D7_ebd70a208b) : RoutethreadU2DCommandRequest_3376a05db1
    data class Option8(val value: RoutethreadU2DCommandRequestU2DOptionU2D8_b79d8f64de) : RoutethreadU2DCommandRequest_3376a05db1
    data class Option9(val value: RoutethreadU2DCommandRequestU2DOptionU2D9_09765c7778) : RoutethreadU2DCommandRequest_3376a05db1
    data class Option10(val value: RoutethreadU2DCommandRequestU2DOptionU2D10_431be1ab7e) : RoutethreadU2DCommandRequest_3376a05db1
    data class Option11(val value: RoutethreadU2DCommandRequestU2DOptionU2D11_a93ba7bf23) : RoutethreadU2DCommandRequest_3376a05db1
    data class Option12(val value: RoutethreadU2DCommandRequestU2DOptionU2D12_370ff0ec0a) : RoutethreadU2DCommandRequest_3376a05db1
    object Serializer : KSerializer<RoutethreadU2DCommandRequest_3376a05db1> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutethreadU2DCommandRequest_3376a05db1")
        override fun deserialize(decoder: Decoder): RoutethreadU2DCommandRequest_3376a05db1 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutethreadU2DCommandRequest_3376a05db1 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutethreadU2DCommandRequest_3376a05db1>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("prepare-worktree")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D1_b01e26e043>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("start")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D2_6efd374b59>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("set-group")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D3_a656e9f996>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("rename")))) { Option4(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D4_2e4d2aaed0>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("acknowledge")))) { Option5(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D5_c3363423bb>(element)) }
            RemoteUnionCodec.tryOption(matches, 6, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("set-done")))) { Option6(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D6_80906c6ddc>(element)) }
            RemoteUnionCodec.tryOption(matches, 7, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("set-starred")))) { Option7(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D7_ebd70a208b>(element)) }
            RemoteUnionCodec.tryOption(matches, 8, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("set-worktree")))) { Option8(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D8_b79d8f64de>(element)) }
            RemoteUnionCodec.tryOption(matches, 9, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("delete-worktree-group")))) { Option9(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D9_09765c7778>(element)) }
            RemoteUnionCodec.tryOption(matches, 10, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("archive")))) { Option10(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D10_431be1ab7e>(element)) }
            RemoteUnionCodec.tryOption(matches, 11, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("unarchive")))) { Option11(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D11_a93ba7bf23>(element)) }
            RemoteUnionCodec.tryOption(matches, 12, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("delete")))) { Option12(jsonDecoder.json.decodeFromJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D12_370ff0ec0a>(element)) }
            return RemoteUnionCodec.single("RoutethreadU2DCommandRequest_3376a05db1", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutethreadU2DCommandRequest_3376a05db1) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutethreadU2DCommandRequest_3376a05db1 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D1_b01e26e043>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D2_6efd374b59>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D3_a656e9f996>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D4_2e4d2aaed0>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D5_c3363423bb>(value.value)
                is Option6 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D6_80906c6ddc>(value.value)
                is Option7 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D7_ebd70a208b>(value.value)
                is Option8 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D8_b79d8f64de>(value.value)
                is Option9 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D9_09765c7778>(value.value)
                is Option10 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D10_431be1ab7e>(value.value)
                is Option11 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D11_a93ba7bf23>(value.value)
                is Option12 -> jsonEncoder.json.encodeToJsonElement<RoutethreadU2DCommandRequestU2DOptionU2D12_370ff0ec0a>(value.value)
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
