// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D5_aa2e4e9d65(
    @SerialName("invocation") val invocation: String,
    @SerialName("kind") val kind: ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D5U2DKind_2a65cef1bc,
    @SerialName("name") val name: String,
    @SerialName("path") val path: String,
    @SerialName("pluginId") val pluginId: RemoteField<String> = RemoteField.Missing,
    @SerialName("pluginName") val pluginName: RemoteField<String> = RemoteField.Missing,
    @SerialName("provider") val provider: String,
    @SerialName("scope") val scope: ProcedureimportSkillsRequestU2DSkillsU2DItemU2DDestinationScope_ac6ea0fc11,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("invocation", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D5U2DKind_2a65cef1bc", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pluginId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pluginName", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("provider", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scope", "ProcedureimportSkillsRequestU2DSkillsU2DItemU2DDestinationScope_ac6ea0fc11", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D6U2DKind_c669b4e26b {
    @SerialName("mcp") MCP,
}

@Serializable
data class ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D6_501221cdcb(
    @SerialName("id") val id: String,
    @SerialName("kind") val kind: ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D6U2DKind_c669b4e26b,
    @SerialName("name") val name: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D6U2DKind_c669b4e26b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedurestageThreadInputRequestU2DSegmentsU2DItem_e957595c81.Serializer::class)
sealed interface ProcedurestageThreadInputRequestU2DSegmentsU2DItem_e957595c81 {
    data class Option1(val value: ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D1_5ea9560782) : ProcedurestageThreadInputRequestU2DSegmentsU2DItem_e957595c81
    data class Option2(val value: ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D2_12ca2594dc) : ProcedurestageThreadInputRequestU2DSegmentsU2DItem_e957595c81
    data class Option3(val value: ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D3_43372628ac) : ProcedurestageThreadInputRequestU2DSegmentsU2DItem_e957595c81
    data class Option4(val value: ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D4_0e036ef4da) : ProcedurestageThreadInputRequestU2DSegmentsU2DItem_e957595c81
    data class Option5(val value: ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D5_aa2e4e9d65) : ProcedurestageThreadInputRequestU2DSegmentsU2DItem_e957595c81
    data class Option6(val value: ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D6_501221cdcb) : ProcedurestageThreadInputRequestU2DSegmentsU2DItem_e957595c81
    object Serializer : KSerializer<ProcedurestageThreadInputRequestU2DSegmentsU2DItem_e957595c81> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedurestageThreadInputRequestU2DSegmentsU2DItem_e957595c81")
        override fun deserialize(decoder: Decoder): ProcedurestageThreadInputRequestU2DSegmentsU2DItem_e957595c81 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedurestageThreadInputRequestU2DSegmentsU2DItem_e957595c81 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedurestageThreadInputRequestU2DSegmentsU2DItem_e957595c81>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("text")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D1_5ea9560782>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("file")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D2_12ca2594dc>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("attachment")))) { Option3(jsonDecoder.json.decodeFromJsonElement<ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D3_43372628ac>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("diff_comment")))) { Option4(jsonDecoder.json.decodeFromJsonElement<ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D4_0e036ef4da>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("skill")))) { Option5(jsonDecoder.json.decodeFromJsonElement<ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D5_aa2e4e9d65>(element)) }
            RemoteUnionCodec.tryOption(matches, 6, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("mcp")))) { Option6(jsonDecoder.json.decodeFromJsonElement<ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D6_501221cdcb>(element)) }
            return RemoteUnionCodec.single("ProcedurestageThreadInputRequestU2DSegmentsU2DItem_e957595c81", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedurestageThreadInputRequestU2DSegmentsU2DItem_e957595c81) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedurestageThreadInputRequestU2DSegmentsU2DItem_e957595c81 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D1_5ea9560782>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D2_12ca2594dc>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D3_43372628ac>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D4_0e036ef4da>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D5_aa2e4e9d65>(value.value)
                is Option6 -> jsonEncoder.json.encodeToJsonElement<ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D6_501221cdcb>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class ProcedurestageThreadInputRequest_77f4b98720(
    @SerialName("prompt") val prompt: String,
    @SerialName("segments") val segments: RemoteField<List<ProcedurestageThreadInputRequestU2DSegmentsU2DItem_e957595c81>> = RemoteField.Missing,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("prompt", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("segments", "List<ProcedurestageThreadInputRequestU2DSegmentsU2DItem_e957595c81>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduresubagentSubscribeRequest_ff495aee3e(
    @SerialName("parentItemId") val parentItemId: String,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("parentItemId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DType_a799b0e11e {
    @SerialName("usage.spent") USAGEU2ESPENT,
}

@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DUsageU2DCounterKind_91a5d2d349 {
    @SerialName("cumulative") CUMULATIVE,
    @SerialName("per-call") PERU2DCALL,
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DUsage_0fce2ade01(
    @SerialName("counter") val counter: Long,
    @SerialName("counterKind") val counterKind: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DUsageU2DCounterKind_91a5d2d349,
    @SerialName("epoch") val epoch: Long,
    @SerialName("fresh") val fresh: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("model") val model: RemoteField<String> = RemoteField.Missing,
    @SerialName("occurredAt") val occurredAt: RemoteField<Long> = RemoteField.Missing,
    @SerialName("sampleId") val sampleId: String,
    @SerialName("scopeId") val scopeId: String,
    @SerialName("turnId") val turnId: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("counter", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("counterKind", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DUsageU2DCounterKind_91a5d2d349", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("epoch", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fresh", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("occurredAt", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sampleId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scopeId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("turnId", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10_9b83e18a93(
    @SerialName("threadId") val threadId: String,
    @SerialName("type") val type: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DType_a799b0e11e,
    @SerialName("usage") val usage: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DUsage_0fce2ade01,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DType_a799b0e11e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("usage", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DUsage_0fce2ade01", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11U2DPayloadU2DOptionsU2DItem_f2bb61aa3b(
    @SerialName("description") val description: RemoteField<String> = RemoteField.Missing,
    @SerialName("label") val label: String,
    @SerialName("optionId") val optionId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("description", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("optionId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11U2DPayload_fd95a83e5b(
    @SerialName("details") val details: RemoteField<JsonElement> = RemoteField.Missing,
    @SerialName("multiSelect") val multiSelect: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("options") val options: RemoteField<List<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11U2DPayloadU2DOptionsU2DItem_f2bb61aa3b>> = RemoteField.Missing,
    @SerialName("summary") val summary: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("details", "JsonElement", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("multiSelect", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("options", "List<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11U2DPayloadU2DOptionsU2DItem_f2bb61aa3b>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("summary", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11U2DRequestType_c733570a5a {
    @SerialName("command_execution_approval") COMMANDU5FEXECUTIONU5FAPPROVAL,
    @SerialName("file_read_approval") FILEU5FREADU5FAPPROVAL,
    @SerialName("file_change_approval") FILEU5FCHANGEU5FAPPROVAL,
    @SerialName("apply_patch_approval") APPLYU5FPATCHU5FAPPROVAL,
    @SerialName("tool_call_approval") TOOLU5FCALLU5FAPPROVAL,
    @SerialName("tool_user_input") TOOLU5FUSERU5FINPUT,
    @SerialName("auth_refresh") AUTHU5FREFRESH,
}

@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11U2DType_fcb2eed91b {
    @SerialName("request.opened") REQUESTU2EOPENED,
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11_15179deb98(
    @SerialName("payload") val payload: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11U2DPayload_fd95a83e5b,
    @SerialName("requestId") val requestId: String,
    @SerialName("requestType") val requestType: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11U2DRequestType_c733570a5a,
    @SerialName("threadId") val threadId: String,
    @SerialName("type") val type: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11U2DType_fcb2eed91b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("payload", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11U2DPayload_fd95a83e5b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("requestId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("requestType", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11U2DRequestType_c733570a5a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11U2DType_fcb2eed91b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12U2DOutcome_506f036707 {
    @SerialName("accepted") ACCEPTED,
    @SerialName("declined") DECLINED,
    @SerialName("answered") ANSWERED,
    @SerialName("cancelled") CANCELLED,
}

@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12U2DType_d92fe09fa7 {
    @SerialName("request.resolved") REQUESTU2ERESOLVED,
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12_e011332682(
    @SerialName("outcome") val outcome: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12U2DOutcome_506f036707,
    @SerialName("requestId") val requestId: String,
    @SerialName("threadId") val threadId: String,
    @SerialName("type") val type: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12U2DType_d92fe09fa7,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("outcome", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12U2DOutcome_506f036707", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("requestId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12U2DType_d92fe09fa7", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D13U2DType_a023928e20 {
    @SerialName("warning") WARNING,
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D13_e9d3d0a9b8(
    @SerialName("message") val message: String,
    @SerialName("threadId") val threadId: String,
    @SerialName("type") val type: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D13U2DType_a023928e20,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("message", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D13U2DType_a023928e20", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D14_f7a8f76390(
    @SerialName("message") val message: String,
    @SerialName("threadId") val threadId: String,
    @SerialName("type") val type: ProcedurebeginMcpServerOauthResultU2DOptionU2D3U2DStatus_c086073e61,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("message", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurebeginMcpServerOauthResultU2DOptionU2D3U2DStatus_c086073e61", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D1U2DType_b7ac3adaa0 {
    @SerialName("session.started") SESSIONU2ESTARTED,
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D1_2778fa8937(
    @SerialName("threadId") val threadId: String,
    @SerialName("turnId") val turnId: RemoteField<String> = RemoteField.Missing,
    @SerialName("type") val type: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D1U2DType_b7ac3adaa0,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("turnId", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D1U2DType_b7ac3adaa0", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D2U2DType_000753aa3e {
    @SerialName("session.exited") SESSIONU2EEXITED,
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D2_66846085f3(
    @SerialName("reason") val reason: RemoteField<String> = RemoteField.Missing,
    @SerialName("threadId") val threadId: String,
    @SerialName("type") val type: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D2U2DType_000753aa3e,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("reason", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D2U2DType_000753aa3e", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D3U2DType_9f20fb68ee {
    @SerialName("turn.started") TURNU2ESTARTED,
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D3_4244283735(
    @SerialName("threadId") val threadId: String,
    @SerialName("turnId") val turnId: String,
    @SerialName("type") val type: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D3U2DType_9f20fb68ee,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("turnId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D3U2DType_9f20fb68ee", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D4U2DState_115555b2d2 {
    @SerialName("completed") COMPLETED,
    @SerialName("failed") FAILED,
    @SerialName("interrupted") INTERRUPTED,
    @SerialName("cancelled") CANCELLED,
}

@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D4U2DType_cdcee850f2 {
    @SerialName("turn.completed") TURNU2ECOMPLETED,
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D4_85d2dd31fd(
    @SerialName("state") val state: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D4U2DState_115555b2d2,
    @SerialName("threadId") val threadId: String,
    @SerialName("turnId") val turnId: String,
    @SerialName("type") val type: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D4U2DType_cdcee850f2,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("state", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D4U2DState_115555b2d2", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("turnId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D4U2DType_cdcee850f2", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5U2DItemType_9fed07fec8 {
    @SerialName("user_message") USERU5FMESSAGE,
    @SerialName("assistant_message") ASSISTANTU5FMESSAGE,
    @SerialName("reasoning") REASONING,
    @SerialName("plan") PLAN,
    @SerialName("goal") GOAL,
    @SerialName("command_execution") COMMANDU5FEXECUTION,
    @SerialName("file_change") FILEU5FCHANGE,
    @SerialName("tool_call") TOOLU5FCALL,
    @SerialName("mcp_tool_call") MCPU5FTOOLU5FCALL,
    @SerialName("image_view") IMAGEU5FVIEW,
    @SerialName("dynamic_tool_call") DYNAMICU5FTOOLU5FCALL,
    @SerialName("web_search") WEBU5FSEARCH,
    @SerialName("question_answer") QUESTIONU5FANSWER,
    @SerialName("error") ERROR,
}

@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5U2DType_441bce375b {
    @SerialName("item.started") ITEMU2ESTARTED,
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5_fc5c2dcf18(
    @SerialName("itemId") val itemId: String,
    @SerialName("itemType") val itemType: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5U2DItemType_9fed07fec8,
    @SerialName("parentItemId") val parentItemId: RemoteField<String> = RemoteField.Missing,
    @SerialName("payload") val payload: RemoteField<JsonElement> = RemoteField.Missing,
    @SerialName("threadId") val threadId: String,
    @SerialName("type") val type: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5U2DType_441bce375b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("itemId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("itemType", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5U2DItemType_9fed07fec8", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("parentItemId", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("payload", "JsonElement", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5U2DType_441bce375b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D6U2DType_9189c3f251 {
    @SerialName("item.updated") ITEMU2EUPDATED,
}
