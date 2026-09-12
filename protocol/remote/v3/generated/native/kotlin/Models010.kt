// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12U2DRequestType_c733570a5a {
    @SerialName("command_execution_approval") COMMANDU5FEXECUTIONU5FAPPROVAL,
    @SerialName("file_read_approval") FILEU5FREADU5FAPPROVAL,
    @SerialName("file_change_approval") FILEU5FCHANGEU5FAPPROVAL,
    @SerialName("apply_patch_approval") APPLYU5FPATCHU5FAPPROVAL,
    @SerialName("tool_call_approval") TOOLU5FCALLU5FAPPROVAL,
    @SerialName("tool_user_input") TOOLU5FUSERU5FINPUT,
    @SerialName("auth_refresh") AUTHU5FREFRESH,
}

@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12U2DType_fcb2eed91b {
    @SerialName("request.opened") REQUESTU2EOPENED,
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12_15179deb98(
    @SerialName("payload") val payload: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12U2DPayload_fd95a83e5b,
    @SerialName("requestId") val requestId: String,
    @SerialName("requestType") val requestType: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12U2DRequestType_c733570a5a,
    @SerialName("threadId") val threadId: String,
    @SerialName("type") val type: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12U2DType_fcb2eed91b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("payload", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12U2DPayload_fd95a83e5b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("requestId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("requestType", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12U2DRequestType_c733570a5a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12U2DType_fcb2eed91b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D13U2DOutcome_506f036707 {
    @SerialName("accepted") ACCEPTED,
    @SerialName("declined") DECLINED,
    @SerialName("answered") ANSWERED,
    @SerialName("cancelled") CANCELLED,
}

@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D13U2DType_d92fe09fa7 {
    @SerialName("request.resolved") REQUESTU2ERESOLVED,
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D13_e011332682(
    @SerialName("outcome") val outcome: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D13U2DOutcome_506f036707,
    @SerialName("requestId") val requestId: String,
    @SerialName("threadId") val threadId: String,
    @SerialName("type") val type: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D13U2DType_d92fe09fa7,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("outcome", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D13U2DOutcome_506f036707", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("requestId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D13U2DType_d92fe09fa7", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D14U2DType_9d72555063 {
    @SerialName("runtime.truncated") RUNTIMEU2ETRUNCATED,
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D14_2a107f95a9(
    @SerialName("itemId") val itemId: String,
    @SerialName("removedCompletedTurnAnchors") val removedCompletedTurnAnchors: List<String>,
    @SerialName("threadId") val threadId: String,
    @SerialName("type") val type: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D14U2DType_9d72555063,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("itemId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("removedCompletedTurnAnchors", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D14U2DType_9d72555063", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D15U2DType_a023928e20 {
    @SerialName("warning") WARNING,
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D15_e9d3d0a9b8(
    @SerialName("message") val message: String,
    @SerialName("threadId") val threadId: String,
    @SerialName("type") val type: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D15U2DType_a023928e20,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("message", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D15U2DType_a023928e20", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D16_f7a8f76390(
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
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5U2DItemType_5455d14071 {
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
    @SerialName("provider_handoff") PROVIDERU5FHANDOFF,
    @SerialName("error") ERROR,
}

@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5U2DType_441bce375b {
    @SerialName("item.started") ITEMU2ESTARTED,
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5_fe7522595f(
    @SerialName("itemId") val itemId: String,
    @SerialName("itemType") val itemType: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5U2DItemType_5455d14071,
    @SerialName("parentItemId") val parentItemId: RemoteField<String> = RemoteField.Missing,
    @SerialName("payload") val payload: RemoteField<JsonElement> = RemoteField.Missing,
    @SerialName("threadId") val threadId: String,
    @SerialName("type") val type: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5U2DType_441bce375b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("itemId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("itemType", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5U2DItemType_5455d14071", true, false, null, null, null, null, null, null, null, null, listOf()),
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

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D6_c55a346c73(
    @SerialName("itemId") val itemId: String,
    @SerialName("payload") val payload: JsonElement,
    @SerialName("threadId") val threadId: String,
    @SerialName("type") val type: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D6U2DType_9189c3f251,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("itemId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("payload", "JsonElement", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D6U2DType_9189c3f251", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D7U2DType_ab52710489 {
    @SerialName("item.completed") ITEMU2ECOMPLETED,
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D7_1371f7bedc(
    @SerialName("itemId") val itemId: String,
    @SerialName("payload") val payload: RemoteField<JsonElement> = RemoteField.Missing,
    @SerialName("threadId") val threadId: String,
    @SerialName("type") val type: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D7U2DType_ab52710489,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("itemId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("payload", "JsonElement", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D7U2DType_ab52710489", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8U2DStream_b5c1f44eaf {
    @SerialName("assistant_text") ASSISTANTU5FTEXT,
    @SerialName("reasoning_text") REASONINGU5FTEXT,
    @SerialName("plan_text") PLANU5FTEXT,
    @SerialName("command_output") COMMANDU5FOUTPUT,
    @SerialName("file_change_output") FILEU5FCHANGEU5FOUTPUT,
}

@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8U2DType_f30731ffd8 {
    @SerialName("content.delta") CONTENTU2EDELTA,
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8_311561bc27(
    @SerialName("delta") val delta: String,
    @SerialName("itemId") val itemId: String,
    @SerialName("stream") val stream: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8U2DStream_b5c1f44eaf,
    @SerialName("threadId") val threadId: String,
    @SerialName("type") val type: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8U2DType_f30731ffd8,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("delta", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("itemId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("stream", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8U2DStream_b5c1f44eaf", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8U2DType_f30731ffd8", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DType_1fbc0e0d79 {
    @SerialName("context.updated") CONTEXTU2EUPDATED,
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsageU2DBreakdownU2DItem_1b3dc298a6(
    @SerialName("id") val id: String,
    @SerialName("label") val label: String,
    @SerialName("tokens") val tokens: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tokens", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b(
    @SerialName("breakdown") val breakdown: RemoteField<List<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsageU2DBreakdownU2DItem_1b3dc298a6>> = RemoteField.Missing,
    @SerialName("maxTokens") val maxTokens: RemoteField<Long> = RemoteField.Missing,
    @SerialName("usedTokens") val usedTokens: RemoteField<Long> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("breakdown", "List<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsageU2DBreakdownU2DItem_1b3dc298a6>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxTokens", "Long", false, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("usedTokens", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9_cdd89e732d(
    @SerialName("threadId") val threadId: String,
    @SerialName("type") val type: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DType_1fbc0e0d79,
    @SerialName("usage") val usage: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DType_1fbc0e0d79", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("usage", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
