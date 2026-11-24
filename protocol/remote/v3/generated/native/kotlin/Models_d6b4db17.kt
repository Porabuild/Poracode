// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
typealias RouteagentU2DProfilesU2DCommandResponseU2DProfiles_444f48ad16 = Map<String, RouteagentU2DProfilesU2DCommandResponseU2DInstance_b6587f8e60>

@Serializable
data class RouteagentU2DProfilesU2DCommandResponse_504e56daa5(
    @SerialName("instance") val instance: RemoteField<RouteagentU2DProfilesU2DCommandResponseU2DInstance_b6587f8e60> = RemoteField.Missing,
    @SerialName("profiles") val profiles: RouteagentU2DProfilesU2DCommandResponseU2DProfiles_444f48ad16,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("instance", "RouteagentU2DProfilesU2DCommandResponseU2DInstance_b6587f8e60", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("profiles", "RouteagentU2DProfilesU2DCommandResponseU2DProfiles_444f48ad16", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteagentU2DProfilesU2DReadResponse_c97404be97(
    @SerialName("profiles") val profiles: RouteagentU2DProfilesU2DCommandResponseU2DProfiles_444f48ad16,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("profiles", "RouteagentU2DProfilesU2DCommandResponseU2DProfiles_444f48ad16", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteagentU2DSlashU2DCommandsPath_626533cdf1(
    @SerialName("kind") val kind: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteagentU2DSlashU2DCommandsResponse_d50d163800(
    @SerialName("commands") val commands: List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSlashCommandsU2DItem_7324613e41>,
    @SerialName("kind") val kind: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("commands", "List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSlashCommandsU2DItem_7324613e41>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteagentU2DStatusesQuery_b09b259cd2(
    @SerialName("slashCommands") val slashCommands: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("slashCommands", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteagentU2DStatusesResponse_0170ad7cfc(
    @SerialName("detecting") val detecting: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("updatedAt") val updatedAt: String,
    @SerialName("windows") val windows: List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItem_def077222f>,
    @SerialName("wsl") val wsl: List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItem_def077222f>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("detecting", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("updatedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("windows", "List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItem_def077222f>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wsl", "List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItem_def077222f>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteattachmentU2DUploadQuery_f22a438b83(
    @SerialName("name") val name: String,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, 255, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteautomationsU2DSnapshotQueryU2DFilter_479fd2dce7 {
    @SerialName("unread") UNREAD,
    @SerialName("all") ALL,
    @SerialName("archived") ARCHIVED,
}

@Serializable
data class RouteautomationsU2DSnapshotQuery_8cdebfa85e(
    @SerialName("cursor") val cursor: RemoteField<String> = RemoteField.Missing,
    @SerialName("filter") val filter: RouteautomationsU2DSnapshotQueryU2DFilter_479fd2dce7,
    @SerialName("limit") val limit: RemoteField<Long> = RemoteField.Missing,
    @SerialName("search") val search: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cursor", "String", false, false, null, null, null, null, null, null, "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z\\|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\$", null, listOf()),
            RemoteFieldDescriptor("filter", "RouteautomationsU2DSnapshotQueryU2DFilter_479fd2dce7", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("limit", "Long", false, false, 1.0, 100.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("search", "String", false, false, null, null, null, 200, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D1U2DKind_c028422c57 {
    @SerialName("none") NONE,
}

@Serializable
data class RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D1_4545388132(
    @SerialName("kind") val kind: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D1U2DKind_c028422c57,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D1U2DKind_c028422c57", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D2U2DKind_5bbcf9e475 {
    @SerialName("ai-evaluated") AIU2DEVALUATED,
}

@Serializable
data class RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D2_e800870318(
    @SerialName("confidenceThreshold") val confidenceThreshold: Double,
    @SerialName("kind") val kind: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D2U2DKind_5bbcf9e475,
    @SerialName("stopWhen") val stopWhen: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("confidenceThreshold", "Double", true, false, 0.0, 1.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D2U2DKind_5bbcf9e475", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("stopWhen", "String", true, false, null, null, 1, 2000, null, null, null, null, listOf("string.trim")),
        ), listOf())
    }
}

@Serializable(with = RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286.Serializer::class)
sealed interface RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286 {
    data class Option1(val value: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D1_4545388132) : RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286
    data class Option2(val value: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D2_e800870318) : RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286
    object Serializer : KSerializer<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286")
        override fun deserialize(decoder: Decoder): RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("none")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D1_4545388132>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("ai-evaluated")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D2_e800870318>(element)) }
            return RemoteUnionCodec.single("RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286", matches)
        }
        override fun serialize(encoder: Encoder, value: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D1_4545388132>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D2_e800870318>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

typealias RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMaxIterations_e82ae39cda = Long?

@Serializable
enum class RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMisfirePolicy_bb479bc584 {
    @SerialName("skip") SKIP,
    @SerialName("coalesce") COALESCE,
    @SerialName("run-latest") RUNU2DLATEST,
}

@Serializable
enum class RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D1U2DKind_046f6b1ae1 {
    @SerialName("new-thread") NEWU2DTHREAD,
}

@Serializable
data class RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D1_4ec1d31e87(
    @SerialName("kind") val kind: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D1U2DKind_046f6b1ae1,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D1U2DKind_046f6b1ae1", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D2U2DKind_54e79a700c {
    @SerialName("heartbeat") HEARTBEAT,
}

@Serializable
data class RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D2_a93427ae1f(
    @SerialName("kind") val kind: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D2U2DKind_54e79a700c,
    @SerialName("targetThreadId") val targetThreadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D2U2DKind_54e79a700c", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("targetThreadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
