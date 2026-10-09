// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RoutemetricsResponseU2DHostResourceAdmissionU2DUsage_1618be77eb(
    @SerialName("agentSessions") val agentSessions: RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4,
    @SerialName("generationHelpers") val generationHelpers: RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4,
    @SerialName("refusals") val refusals: Long,
    @SerialName("terminalShells") val terminalShells: RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4,
    @SerialName("total") val total: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentSessions", "RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("generationHelpers", "RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("refusals", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("terminalShells", "RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("total", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemetricsResponseU2DHostResourceAdmission_710b6ecb78(
    @SerialName("gitProcesses") val gitProcesses: RemoteField<RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcesses_f80bf20556> = RemoteField.Missing,
    @SerialName("policy") val policy: RoutemetricsResponseU2DHostResourceAdmissionU2DPolicy_280719966e,
    @SerialName("resolution") val resolution: RoutemetricsResponseU2DHostResourceAdmissionU2DResolution_c0edab91e2,
    @SerialName("usage") val usage: RoutemetricsResponseU2DHostResourceAdmissionU2DUsage_1618be77eb,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("gitProcesses", "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcesses_f80bf20556", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("policy", "RoutemetricsResponseU2DHostResourceAdmissionU2DPolicy_280719966e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("resolution", "RoutemetricsResponseU2DHostResourceAdmissionU2DResolution_c0edab91e2", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("usage", "RoutemetricsResponseU2DHostResourceAdmissionU2DUsage_1618be77eb", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemetricsResponseU2DProcess_9f6e05a566(
    @SerialName("heapUsedBytes") val heapUsedBytes: Long,
    @SerialName("rssBytes") val rssBytes: Long,
    @SerialName("uptimeSeconds") val uptimeSeconds: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("heapUsedBytes", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("rssBytes", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("uptimeSeconds", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemetricsResponseU2DRemote_99cf08bb5d(
    @SerialName("activeWebSocketClients") val activeWebSocketClients: Long,
    @SerialName("eventBufferEntries") val eventBufferEntries: Long,
    @SerialName("lastEventSeq") val lastEventSeq: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("activeWebSocketClients", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("eventBufferEntries", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastEventSeq", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemetricsResponse_f983f1aded(
    @SerialName("hostResourceAdmission") val hostResourceAdmission: RemoteField<RoutemetricsResponseU2DHostResourceAdmission_710b6ecb78> = RemoteField.Missing,
    @SerialName("process") val process: RoutemetricsResponseU2DProcess_9f6e05a566,
    @SerialName("remote") val remote: RoutemetricsResponseU2DRemote_99cf08bb5d,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("hostResourceAdmission", "RoutemetricsResponseU2DHostResourceAdmission_710b6ecb78", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("process", "RoutemetricsResponseU2DProcess_9f6e05a566", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("remote", "RoutemetricsResponseU2DRemote_99cf08bb5d", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteportU2DEnterRequest_4067ad04bf(
    @SerialName("id") val id: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteportU2DEnterResponse_72ce7899de(
    @SerialName("enterPath") val enterPath: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("enterPath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteportU2DForwardRequest_a26f77dd4a(
    @SerialName("targetPort") val targetPort: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("targetPort", "Long", true, false, 1.0, 65535.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteportU2DForwardResponseU2DForward_247ec4acb4(
    @SerialName("createdAt") val createdAt: Long,
    @SerialName("id") val id: String,
    @SerialName("listenPort") val listenPort: Long,
    @SerialName("targetPort") val targetPort: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("createdAt", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("listenPort", "Long", true, false, 1.0, 65535.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("targetPort", "Long", true, false, 1.0, 65535.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteportU2DForwardResponse_04de8f3da1(
    @SerialName("connectTicket") val connectTicket: String,
    @SerialName("enterPath") val enterPath: RemoteField<String> = RemoteField.Missing,
    @SerialName("forward") val forward: RouteportU2DForwardResponseU2DForward_247ec4acb4,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("connectTicket", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("enterPath", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("forward", "RouteportU2DForwardResponseU2DForward_247ec4acb4", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteportsU2DReadResponseU2DDetectedU2DItemU2DProtocol_cb34d50832 {
    @SerialName("http") HTTP,
    @SerialName("unknown") UNKNOWN,
}

@Serializable
data class RouteportsU2DReadResponseU2DDetectedU2DItem_40aab29508(
    @SerialName("label") val label: RemoteField<String> = RemoteField.Missing,
    @SerialName("port") val port: Long,
    @SerialName("protocol") val protocol: RouteportsU2DReadResponseU2DDetectedU2DItemU2DProtocol_cb34d50832,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("label", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("port", "Long", true, false, 1.0, 65535.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("protocol", "RouteportsU2DReadResponseU2DDetectedU2DItemU2DProtocol_cb34d50832", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteportsU2DReadResponse_ea993e5b2d(
    @SerialName("detected") val detected: List<RouteportsU2DReadResponseU2DDetectedU2DItem_40aab29508>,
    @SerialName("forwards") val forwards: List<RouteportU2DForwardResponseU2DForward_247ec4acb4>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("detected", "List<RouteportsU2DReadResponseU2DDetectedU2DItem_40aab29508>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("forwards", "List<RouteportU2DForwardResponseU2DForward_247ec4acb4>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprU2DWatchU2DAgentU2DSyncRequestU2DConfig_f69100925f(
    @SerialName("contextSize") val contextSize: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("effort") val effort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("fast") val fast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("model") val model: String,
    @SerialName("selectionBinding") val selectionBinding: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBinding_a11ab76af3> = RemoteField.Missing,
    @SerialName("thinking") val thinking: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("contextSize", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("effort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("selectionBinding", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBinding_a11ab76af3", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("thinking", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprU2DWatchU2DAgentU2DSyncRequest_b2c8fd1712(
    @SerialName("agentKind") val agentKind: String,
    @SerialName("config") val config: RouteprU2DWatchU2DAgentU2DSyncRequestU2DConfig_f69100925f,
    @SerialName("projectId") val projectId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("config", "RouteprU2DWatchU2DAgentU2DSyncRequestU2DConfig_f69100925f", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprU2DWatchU2DCheckRequest_22fb635ee9(
    @SerialName("prNumber") val prNumber: Long,
    @SerialName("projectId") val projectId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("prNumber", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DBlockedReasonU2DOptionU2D1_95e237e577 {
    @SerialName("agent-unavailable") AGENTU2DUNAVAILABLE,
    @SerialName("worktree-unavailable") WORKTREEU2DUNAVAILABLE,
    @SerialName("duplicate-project-watches") DUPLICATEU2DPROJECTU2DWATCHES,
}

typealias RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DBlockedReason_7dccd2754f = RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DBlockedReasonU2DOptionU2D1_95e237e577?

@Serializable
data class RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_ad717b4672(
    @SerialName("activeThreadId") val activeThreadId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("agentKind") val agentKind: RemoteField<String> = RemoteField.Missing,
    @SerialName("autoMerge") val autoMerge: Boolean,
    @SerialName("blockedReason") val blockedReason: RemoteField<RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DBlockedReasonU2DOptionU2D1_95e237e577>,
    @SerialName("config") val config: RemoteField<RouteprU2DWatchU2DAgentU2DSyncRequestU2DConfig_f69100925f> = RemoteField.Missing,
    @SerialName("headBranch") val headBranch: String,
    @SerialName("lastCheckKey") val lastCheckKey: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("lastCommentCursor") val lastCommentCursor: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("lastError") val lastError: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("lastReviewCommentCursor") val lastReviewCommentCursor: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("lastReviewCursor") val lastReviewCursor: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("prNumber") val prNumber: Long,
    @SerialName("projectId") val projectId: String,
    @SerialName("watchEnabled") val watchEnabled: Boolean,
    @SerialName("worktreePath") val worktreePath: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("activeThreadId", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("agentKind", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("autoMerge", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("blockedReason", "RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DBlockedReasonU2DOptionU2D1_95e237e577", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("config", "RouteprU2DWatchU2DAgentU2DSyncRequestU2DConfig_f69100925f", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("headBranch", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastCheckKey", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastCommentCursor", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastError", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastReviewCommentCursor", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastReviewCursor", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prNumber", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("watchEnabled", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf("pr-watch.agent-required-when-enabled"))
    }
}

typealias RouteprU2DWatchU2DReadResponseU2DWatch_2407db87eb = RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_ad717b4672?

@Serializable
data class RouteprU2DWatchU2DReadResponse_2dfd7e74f3(
    @SerialName("watch") val watch: RemoteField<RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_ad717b4672>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("watch", "RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_ad717b4672", true, true, null, null, null, null, null, null, null, null, listOf("pr-watch.agent-required-when-enabled")),
        ), listOf())
    }
}

@Serializable
data class RouteprU2DWatchU2DUpsertRequest_39a57fc9a7(
    @SerialName("agentKind") val agentKind: RemoteField<String> = RemoteField.Missing,
    @SerialName("autoMerge") val autoMerge: Boolean,
    @SerialName("config") val config: RemoteField<RouteprU2DWatchU2DAgentU2DSyncRequestU2DConfig_f69100925f> = RemoteField.Missing,
    @SerialName("headBranch") val headBranch: String,
    @SerialName("prNumber") val prNumber: Long,
    @SerialName("projectId") val projectId: String,
    @SerialName("watchEnabled") val watchEnabled: Boolean,
    @SerialName("worktreePath") val worktreePath: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKind", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("autoMerge", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("config", "RouteprU2DWatchU2DAgentU2DSyncRequestU2DConfig_f69100925f", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("headBranch", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prNumber", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("watchEnabled", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf("pr-watch.agent-required-when-enabled"))
    }
}

@Serializable
data class RouteprU2DWatchU2DUpsertResponse_6db0176745(
    @SerialName("watch") val watch: RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_ad717b4672,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("watch", "RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_ad717b4672", true, false, null, null, null, null, null, null, null, null, listOf("pr-watch.agent-required-when-enabled")),
        ), listOf())
    }
}

@Serializable
data class RouteprocedureU2DCallRequest_d566f2fb6a(
    @SerialName("payload") val payload: JsonElement,
    @SerialName("procedure") val procedure: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("payload", "JsonElement", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("procedure", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteprofileU2DCoreU2DStatsRequestU2DScope_b99ee3af30 {
    @SerialName("device") DEVICE,
    @SerialName("all") ALL,
}

@Serializable
enum class RouteprofileU2DCoreU2DStatsRequestU2DWindow_ae26bc52b7 {
    @SerialName("7d") N7D,
    @SerialName("30d") N30D,
    @SerialName("all") ALL,
}

@Serializable
data class RouteprofileU2DCoreU2DStatsRequest_f76e77baae(
    @SerialName("deviceId") val deviceId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("provider") val provider: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("scope") val scope: RemoteField<RouteprofileU2DCoreU2DStatsRequestU2DScope_b99ee3af30> = RemoteField.Missing,
    @SerialName("utcOffsetMinutes") val utcOffsetMinutes: Double,
    @SerialName("window") val window: RemoteField<RouteprofileU2DCoreU2DStatsRequestU2DWindow_ae26bc52b7> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("deviceId", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("provider", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scope", "RouteprofileU2DCoreU2DStatsRequestU2DScope_b99ee3af30", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("utcOffsetMinutes", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("window", "RouteprofileU2DCoreU2DStatsRequestU2DWindow_ae26bc52b7", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc(
    @SerialName("count") val count: Double,
    @SerialName("key") val key: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("label") val label: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("percent") val percent: Double,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("count", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("key", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("percent", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteprofileU2DCoreU2DStatsResponseU2DAiActionsU2DItemU2DType_645d18fd9a {
    @SerialName("commit") COMMIT,
    @SerialName("pr") PR,
    @SerialName("conflict") CONFLICT,
}

@Serializable
data class RouteprofileU2DCoreU2DStatsResponseU2DAiActionsU2DItem_bb42560f34(
    @SerialName("count") val count: Long,
    @SerialName("label") val label: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("topModel") val topModel: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("topProvider") val topProvider: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("type") val type: RouteprofileU2DCoreU2DStatsResponseU2DAiActionsU2DItemU2DType_645d18fd9a,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("count", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("topModel", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("topProvider", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "RouteprofileU2DCoreU2DStatsResponseU2DAiActionsU2DItemU2DType_645d18fd9a", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprofileU2DCoreU2DStatsResponseU2DAvailableAccountsU2DItem_9ec272a824(
    @SerialName("key") val key: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("label") val label: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("key", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
