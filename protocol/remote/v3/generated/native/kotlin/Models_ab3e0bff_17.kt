// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
enum class RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DThreadStatusSource_8f73948792 {
    @SerialName("cli_hook") CLIU5FHOOK,
    @SerialName("terminal_parse") TERMINALU5FPARSE,
    @SerialName("server") SERVER,
}

@Serializable
data class RouteshellU2DSnapshotResponseU2DThreadsU2DItem_aae5723e41(
    @SerialName("activeTurnStartedAt") val activeTurnStartedAt: RemoteField<String> = RemoteField.Missing,
    @SerialName("additionalDirectories") val additionalDirectories: RemoteField<List<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1>> = RemoteField.Missing,
    @SerialName("agentInstanceId") val agentInstanceId: RemoteField<String> = RemoteField.Missing,
    @SerialName("agentKind") val agentKind: String,
    @SerialName("archived") val archived: Boolean,
    @SerialName("archivedAt") val archivedAt: RemoteField<String> = RemoteField.Missing,
    @SerialName("attention") val attention: RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAttention_58edfaf9f7,
    @SerialName("canResumeWithConfig") val canResumeWithConfig: Boolean,
    @SerialName("config") val config: ProcedureconnectThreadVoiceRequestU2DConfig_281d24bbba,
    @SerialName("createdAt") val createdAt: String,
    @SerialName("done") val done: Boolean,
    @SerialName("doneAt") val doneAt: RemoteField<String> = RemoteField.Missing,
    @SerialName("errorMessage") val errorMessage: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("forkedFrom") val forkedFrom: RemoteField<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DForkedFrom_8edde8b52f> = RemoteField.Missing,
    @SerialName("groupId") val groupId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("groupName") val groupName: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("interruptedTurn") val interruptedTurn: RemoteField<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DInterruptedTurn_2127b6212a> = RemoteField.Missing,
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
    @SerialName("slashCommands") val slashCommands: RemoteField<List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSlashCommandsU2DItem_7324613e41>> = RemoteField.Missing,
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
            RemoteFieldDescriptor("config", "ProcedureconnectThreadVoiceRequestU2DConfig_281d24bbba", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("createdAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("done", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("doneAt", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("errorMessage", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("forkedFrom", "RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DForkedFrom_8edde8b52f", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("groupId", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("groupName", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("interruptedTurn", "RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DInterruptedTurn_2127b6212a", false, false, null, null, null, null, null, null, null, null, listOf()),
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
            RemoteFieldDescriptor("slashCommands", "List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSlashCommandsU2DItem_7324613e41>", false, false, null, null, null, null, null, null, null, null, listOf()),
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
