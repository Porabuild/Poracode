// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DLiveVoice_62c3e7fb25(
    @SerialName("dataChannel") val dataChannel: String,
    @SerialName("transport") val transport: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DLiveVoiceU2DTransport_9a8b3412f7,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("dataChannel", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("transport", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DLiveVoiceU2DTransport_9a8b3412f7", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DMcpConfigSource_96776c817a {
    @SerialName("thread") THREAD,
    @SerialName("agentSettings") AGENTSETTINGS,
}

@Serializable
enum class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DMcpScopeU2DGui_38b68e422d {
    @SerialName("none") NONE,
    @SerialName("launch") LAUNCH,
    @SerialName("always") ALWAYS,
}

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DMcpScope_65e6698fa7(
    @SerialName("gui") val gui: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DMcpScopeU2DGui_38b68e422d> = RemoteField.Missing,
    @SerialName("terminal") val terminal: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DMcpScopeU2DGui_38b68e422d> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("gui", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DMcpScopeU2DGui_38b68e422d", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("terminal", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DMcpScopeU2DGui_38b68e422d", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelContextSizes_e163a1a222 = Map<String, List<String>>

typealias ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelEfforts_b4a8e17084 = Map<String, List<String>>

@Serializable
enum class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DBindingsU2DEffort_b6a98d4e6e {
    @SerialName("model") MODEL,
    @SerialName("config") CONFIG,
}

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DBindings_369773f703(
    @SerialName("effort") val effort: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DBindingsU2DEffort_b6a98d4e6e,
    @SerialName("fast") val fast: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DBindingsU2DEffort_b6a98d4e6e,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("effort", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DBindingsU2DEffort_b6a98d4e6e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fast", "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DBindingsU2DEffort_b6a98d4e6e", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DMembersU2DItem_413ace8627(
    @SerialName("effort") val effort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("fast") val fast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("model") val model: String,
    @SerialName("selections") val selections: ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("effort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("selections", "ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DRedundantValues_47eb55b96b(
    @SerialName("contextSize") val contextSize: RemoteField<List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>> = RemoteField.Missing,
    @SerialName("effort") val effort: RemoteField<List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>> = RemoteField.Missing,
    @SerialName("fast") val fast: RemoteField<List<Boolean>> = RemoteField.Missing,
    @SerialName("thinking") val thinking: RemoteField<List<Boolean>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("contextSize", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("effort", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fast", "List<Boolean>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("thinking", "List<Boolean>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DSelectorsU2DItemU2DOptionsU2DItem_85cd2a40f7(
    @SerialName("id") val id: String,
    @SerialName("label") val label: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DSelectorsU2DItem_b4441316f1(
    @SerialName("id") val id: String,
    @SerialName("labelKey") val labelKey: String,
    @SerialName("options") val options: List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DSelectorsU2DItemU2DOptionsU2DItem_85cd2a40f7>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("labelKey", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("options", "List<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DSelectorsU2DItemU2DOptionsU2DItem_85cd2a40f7>", true, false, null, null, null, null, 1, null, null, null, listOf()),
        ), listOf())
    }
}
