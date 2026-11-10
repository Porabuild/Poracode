// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
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
