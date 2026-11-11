// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class ProcedureworkflowAgentChatResult_f975b14607(
    @SerialName("events") val events: List<ProceduresubagentSubscribeResultU2DHistoryU2DItem_9262f6553e>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("events", "List<ProceduresubagentSubscribeResultU2DHistoryU2DItem_9262f6553e>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureworkflowGetRunRequest_13324e3fec(
    @SerialName("includeAgentChats") val includeAgentChats: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("location") val location: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("manifestPath") val manifestPath: String,
    @SerialName("transcriptDir") val transcriptDir: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("includeAgentChats", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("location", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("manifestPath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("transcriptDir", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItemU2DChatU2DItemU2DRole_7e386bfca4 {
    @SerialName("user") USER,
    @SerialName("assistant") ASSISTANT,
    @SerialName("tool") TOOL,
}

@Serializable
data class ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItemU2DChatU2DItem_4878a3657a(
    @SerialName("role") val role: ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItemU2DChatU2DItemU2DRole_7e386bfca4,
    @SerialName("text") val text: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("timestamp") val timestamp: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("title") val title: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("role", "ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItemU2DChatU2DItemU2DRole_7e386bfca4", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("text", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("timestamp", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItemU2DState_5a17efba35 {
    @SerialName("queued") QUEUED,
    @SerialName("running") RUNNING,
    @SerialName("done") DONE,
    @SerialName("failed") FAILED,
    @SerialName("cancelled") CANCELLED,
}

@Serializable
data class ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItem_da546ba4a0(
    @SerialName("agentId") val agentId: String,
    @SerialName("attempt") val attempt: RemoteField<Long> = RemoteField.Missing,
    @SerialName("chat") val chat: RemoteField<List<ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItemU2DChatU2DItem_4878a3657a>> = RemoteField.Missing,
    @SerialName("durationMs") val durationMs: RemoteField<Long> = RemoteField.Missing,
    @SerialName("label") val label: String,
    @SerialName("lastProgressAt") val lastProgressAt: RemoteField<Long> = RemoteField.Missing,
    @SerialName("lastToolName") val lastToolName: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("model") val model: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("phaseIndex") val phaseIndex: RemoteField<Long> = RemoteField.Missing,
    @SerialName("phaseTitle") val phaseTitle: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("promptPreview") val promptPreview: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("queuedAt") val queuedAt: RemoteField<Long> = RemoteField.Missing,
    @SerialName("resultPreview") val resultPreview: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("startedAt") val startedAt: RemoteField<Long> = RemoteField.Missing,
    @SerialName("state") val state: RemoteField<ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItemU2DState_5a17efba35> = RemoteField.Missing,
    @SerialName("tokens") val tokens: RemoteField<Long> = RemoteField.Missing,
    @SerialName("toolCalls") val toolCalls: RemoteField<Long> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("attempt", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("chat", "List<ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItemU2DChatU2DItem_4878a3657a>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("durationMs", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastProgressAt", "Long", false, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastToolName", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("phaseIndex", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("phaseTitle", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("promptPreview", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("queuedAt", "Long", false, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("resultPreview", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("startedAt", "Long", false, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("state", "ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItemU2DState_5a17efba35", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tokens", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("toolCalls", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItem_59cd628901(
    @SerialName("agents") val agents: List<ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItem_da546ba4a0>,
    @SerialName("detail") val detail: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("title") val title: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agents", "List<ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItem_da546ba4a0>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("detail", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DStatus_3a008e3c40 {
    @SerialName("running") RUNNING,
    @SerialName("completed") COMPLETED,
    @SerialName("failed") FAILED,
    @SerialName("cancelled") CANCELLED,
    @SerialName("unknown") UNKNOWN,
}

@Serializable
data class ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1_f9da03570b(
    @SerialName("agentCount") val agentCount: Long,
    @SerialName("defaultModel") val defaultModel: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("durationMs") val durationMs: RemoteField<Long> = RemoteField.Missing,
    @SerialName("phases") val phases: List<ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItem_59cd628901>,
    @SerialName("runId") val runId: String,
    @SerialName("scriptPath") val scriptPath: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("startTime") val startTime: RemoteField<Long> = RemoteField.Missing,
    @SerialName("status") val status: ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DStatus_3a008e3c40,
    @SerialName("summary") val summary: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("taskId") val taskId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("totalTokens") val totalTokens: RemoteField<Long> = RemoteField.Missing,
    @SerialName("totalToolCalls") val totalToolCalls: RemoteField<Long> = RemoteField.Missing,
    @SerialName("unphasedAgents") val unphasedAgents: List<ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItem_da546ba4a0>,
    @SerialName("workflowName") val workflowName: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentCount", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("defaultModel", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("durationMs", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("phases", "List<ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItem_59cd628901>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scriptPath", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("startTime", "Long", false, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DStatus_3a008e3c40", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("summary", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("taskId", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("totalTokens", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("totalToolCalls", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("unphasedAgents", "List<ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItem_da546ba4a0>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("workflowName", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedureworkflowGetRunResultU2DRun_74659b54c1 = ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1_f9da03570b?

@Serializable
data class ProcedureworkflowGetRunResult_965bd4463b(
    @SerialName("mtimeMs") val mtimeMs: RemoteField<Double> = RemoteField.Missing,
    @SerialName("run") val run: RemoteField<ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1_f9da03570b>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("mtimeMs", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("run", "ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1_f9da03570b", true, true, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurewriteExternalFileRequest_551f784ecd(
    @SerialName("absolutePath") val absolutePath: String,
    @SerialName("baseModifiedAtMs") val baseModifiedAtMs: Double,
    @SerialName("content") val content: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("absolutePath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("baseModifiedAtMs", "Double", true, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("content", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurewriteExternalFileResult_c5c2ecebba(
    @SerialName("modifiedAtMs") val modifiedAtMs: Double,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("modifiedAtMs", "Double", true, false, 0.0, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurewriteProjectFileRequest_aba5d69bfd(
    @SerialName("baseModifiedAtMs") val baseModifiedAtMs: Double,
    @SerialName("content") val content: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("path") val path: String,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("baseModifiedAtMs", "Double", true, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("content", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
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
data class RouteagentU2DStatusesResponse_bed6045a82(
    @SerialName("updatedAt") val updatedAt: String,
    @SerialName("windows") val windows: List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItem_fff3547caa>,
    @SerialName("wsl") val wsl: List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItem_fff3547caa>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("updatedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("windows", "List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItem_fff3547caa>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wsl", "List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItem_fff3547caa>", true, false, null, null, null, null, null, null, null, null, listOf()),
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
            RemoteFieldDescriptor("cursor", "String", false, false, null, null, null, null, null, null, "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z\\|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", null, listOf()),
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
