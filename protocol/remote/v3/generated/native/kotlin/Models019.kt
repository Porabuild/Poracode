// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132(
    @SerialName("active") val active: Long,
    @SerialName("queued") val queued: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("active", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("queued", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironments_2f4c1755c2(
    @SerialName("posix") val posix: RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132,
    @SerialName("windows") val windows: RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132,
    @SerialName("wsl") val wsl: RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("posix", "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("windows", "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wsl", "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DLong_164937b9a5(
    @SerialName("active") val active: Long,
    @SerialName("executionMs") val executionMs: RemoteField<Double> = RemoteField.Missing,
    @SerialName("limit") val limit: Long,
    @SerialName("maxActive") val maxActive: Long,
    @SerialName("maxExecutionMs") val maxExecutionMs: RemoteField<Double> = RemoteField.Missing,
    @SerialName("maxQueueWaitMs") val maxQueueWaitMs: RemoteField<Double> = RemoteField.Missing,
    @SerialName("queueWaitMs") val queueWaitMs: RemoteField<Double> = RemoteField.Missing,
    @SerialName("queued") val queued: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("active", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("executionMs", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("limit", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxActive", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxExecutionMs", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxQueueWaitMs", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("queueWaitMs", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("queued", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcesses_f80bf20556(
    @SerialName("admitted") val admitted: Long,
    @SerialName("cancellations") val cancellations: Long,
    @SerialName("environments") val environments: RemoteField<RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironments_2f4c1755c2> = RemoteField.Missing,
    @SerialName("long") val long: RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DLong_164937b9a5,
    @SerialName("queueFullRefusals") val queueFullRefusals: Long,
    @SerialName("short") val short: RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DLong_164937b9a5,
    @SerialName("slowFetches") val slowFetches: RemoteField<Long> = RemoteField.Missing,
    @SerialName("waitTimeoutRefusals") val waitTimeoutRefusals: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("admitted", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("cancellations", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("environments", "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironments_2f4c1755c2", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("long", "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DLong_164937b9a5", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("queueFullRefusals", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("short", "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DLong_164937b9a5", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("slowFetches", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("waitTimeoutRefusals", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemetricsResponseU2DHostResourceAdmissionU2DPolicy_280719966e(
    @SerialName("maxActiveAgentSessions") val maxActiveAgentSessions: Long,
    @SerialName("maxActiveGenerationHelpers") val maxActiveGenerationHelpers: Long,
    @SerialName("maxActiveTerminalShells") val maxActiveTerminalShells: Long,
    @SerialName("overloadRetryAfterMs") val overloadRetryAfterMs: Long,
    @SerialName("refuseNewStarts") val refuseNewStarts: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("maxActiveAgentSessions", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxActiveGenerationHelpers", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxActiveTerminalShells", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("overloadRetryAfterMs", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("refuseNewStarts", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutemetricsResponseU2DHostResourceAdmissionU2DResolutionU2DKind_cd6770504a {
    @SerialName("configured") CONFIGURED,
    @SerialName("absent") ABSENT,
    @SerialName("missing") MISSING,
    @SerialName("retained") RETAINED,
    @SerialName("unavailable") UNAVAILABLE,
}

@Serializable
enum class RoutemetricsResponseU2DHostResourceAdmissionU2DResolutionU2DProblem_6ef72b13e3 {
    @SerialName("settings-document-unreadable") SETTINGSU2DDOCUMENTU2DUNREADABLE,
    @SerialName("settings-document-unparseable") SETTINGSU2DDOCUMENTU2DUNPARSEABLE,
    @SerialName("settings-document-not-object") SETTINGSU2DDOCUMENTU2DNOTU2DOBJECT,
    @SerialName("host-resource-admission-invalid") HOSTU2DRESOURCEU2DADMISSIONU2DINVALID,
}

@Serializable
data class RoutemetricsResponseU2DHostResourceAdmissionU2DResolution_c0edab91e2(
    @SerialName("kind") val kind: RoutemetricsResponseU2DHostResourceAdmissionU2DResolutionU2DKind_cd6770504a,
    @SerialName("problem") val problem: RemoteField<RoutemetricsResponseU2DHostResourceAdmissionU2DResolutionU2DProblem_6ef72b13e3> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutemetricsResponseU2DHostResourceAdmissionU2DResolutionU2DKind_cd6770504a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("problem", "RoutemetricsResponseU2DHostResourceAdmissionU2DResolutionU2DProblem_6ef72b13e3", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4(
    @SerialName("active") val active: Long,
    @SerialName("pending") val pending: Long,
    @SerialName("retiring") val retiring: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("active", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pending", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("retiring", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

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
data class RouteprU2DWatchU2DAgentU2DSyncRequestU2DConfig_048d1517dd(
    @SerialName("effort") val effort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("fast") val fast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("model") val model: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("effort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteprU2DWatchU2DAgentU2DSyncRequest_43aa74a688(
    @SerialName("agentKind") val agentKind: String,
    @SerialName("config") val config: RouteprU2DWatchU2DAgentU2DSyncRequestU2DConfig_048d1517dd,
    @SerialName("projectId") val projectId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("config", "RouteprU2DWatchU2DAgentU2DSyncRequestU2DConfig_048d1517dd", true, false, null, null, null, null, null, null, null, null, listOf()),
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
enum class RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DBlockedReasonU2DOptionU2D1_f434bf2c3d {
    @SerialName("agent-unavailable") AGENTU2DUNAVAILABLE,
    @SerialName("worktree-unavailable") WORKTREEU2DUNAVAILABLE,
}

typealias RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DBlockedReason_6a323d2278 = RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DBlockedReasonU2DOptionU2D1_f434bf2c3d?

@Serializable
data class RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_4e69a9e250(
    @SerialName("activeThreadId") val activeThreadId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("agentKind") val agentKind: RemoteField<String> = RemoteField.Missing,
    @SerialName("autoMerge") val autoMerge: Boolean,
    @SerialName("blockedReason") val blockedReason: RemoteField<RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DBlockedReasonU2DOptionU2D1_f434bf2c3d>,
    @SerialName("config") val config: RemoteField<RouteprU2DWatchU2DAgentU2DSyncRequestU2DConfig_048d1517dd> = RemoteField.Missing,
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
            RemoteFieldDescriptor("blockedReason", "RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DBlockedReasonU2DOptionU2D1_f434bf2c3d", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("config", "RouteprU2DWatchU2DAgentU2DSyncRequestU2DConfig_048d1517dd", false, false, null, null, null, null, null, null, null, null, listOf()),
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

typealias RouteprU2DWatchU2DReadResponseU2DWatch_1cd9a2d7dc = RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_4e69a9e250?

@Serializable
data class RouteprU2DWatchU2DReadResponse_d5dfa02f74(
    @SerialName("watch") val watch: RemoteField<RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_4e69a9e250>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("watch", "RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_4e69a9e250", true, true, null, null, null, null, null, null, null, null, listOf("pr-watch.agent-required-when-enabled")),
        ), listOf())
    }
}
