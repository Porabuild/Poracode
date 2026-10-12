// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable(with = RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItem_97d27c4efa.Serializer::class)
sealed interface RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItem_97d27c4efa {
    data class Option1(val value: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItemU2DOptionU2D1_fb3dd6021c) : RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItem_97d27c4efa
    data class Option2(val value: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItemU2DOptionU2D2_9c44204b65) : RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItem_97d27c4efa
    object Serializer : KSerializer<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItem_97d27c4efa> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItem_97d27c4efa")
        override fun deserialize(decoder: Decoder): RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItem_97d27c4efa {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItem_97d27c4efa supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItem_97d27c4efa>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("toggle")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItemU2DOptionU2D1_fb3dd6021c>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("select")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItemU2DOptionU2D2_9c44204b65>(element)) }
            return RemoteUnionCodec.single("RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItem_97d27c4efa", matches)
        }
        override fun serialize(encoder: Encoder, value: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItem_97d27c4efa) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItem_97d27c4efa supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItemU2DOptionU2D1_fb3dd6021c>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItemU2DOptionU2D2_9c44204b65>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGui_dac2ab59fa(
    @SerialName("approvalPolicies") val approvalPolicies: RemoteField<List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>> = RemoteField.Missing,
    @SerialName("bypassPermissions") val bypassPermissions: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DBypassPermissions_97dee2d496> = RemoteField.Missing,
    @SerialName("contextSizes") val contextSizes: RemoteField<List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>> = RemoteField.Missing,
    @SerialName("defaultApprovalPolicy") val defaultApprovalPolicy: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("defaultApprovalsReviewer") val defaultApprovalsReviewer: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("defaultContextSize") val defaultContextSize: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("defaultEffort") val defaultEffort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("defaultHiddenModels") val defaultHiddenModels: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("defaultSandboxMode") val defaultSandboxMode: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("disabledSkillNames") val disabledSkillNames: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("efforts") val efforts: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("fastDisabledReason") val fastDisabledReason: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("fastModels") val fastModels: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("liveInputMode") val liveInputMode: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DLiveInputMode_cb81a9dbb8> = RemoteField.Missing,
    @SerialName("modelContextSizes") val modelContextSizes: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelContextSizes_e163a1a222> = RemoteField.Missing,
    @SerialName("modelDefaultEfforts") val modelDefaultEfforts: RemoteField<ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67> = RemoteField.Missing,
    @SerialName("modelEfforts") val modelEfforts: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelContextSizes_e163a1a222> = RemoteField.Missing,
    @SerialName("modelFamilies") val modelFamilies: RemoteField<List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItem_1be1630ac3>> = RemoteField.Missing,
    @SerialName("modelSubProvider") val modelSubProvider: RemoteField<ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67> = RemoteField.Missing,
    @SerialName("models") val models: RemoteField<List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>> = RemoteField.Missing,
    @SerialName("modes") val modes: RemoteField<List<ProcedureconnectThreadVoiceRequestU2DConfigU2DMode_01e21946e9>> = RemoteField.Missing,
    @SerialName("presentationMode") val presentationMode: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6> = RemoteField.Missing,
    @SerialName("presentationModes") val presentationModes: RemoteField<List<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6>> = RemoteField.Missing,
    @SerialName("requiresTerminalFocusBeforeInput") val requiresTerminalFocusBeforeInput: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("runtimeLabel") val runtimeLabel: RemoteField<String> = RemoteField.Missing,
    @SerialName("sandboxModes") val sandboxModes: RemoteField<List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>> = RemoteField.Missing,
    @SerialName("settingDefs") val settingDefs: RemoteField<List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItem_97d27c4efa>> = RemoteField.Missing,
    @SerialName("showRuntimeLabelInPicker") val showRuntimeLabelInPicker: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("slashCommands") val slashCommands: RemoteField<List<RouteagentU2DSlashU2DCommandsResponseU2DCommandsU2DItem_7324613e41>> = RemoteField.Missing,
    @SerialName("subProviders") val subProviders: RemoteField<List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>> = RemoteField.Missing,
    @SerialName("supportsDirectInput") val supportsDirectInput: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("supportsResume") val supportsResume: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("thinkingModels") val thinkingModels: RemoteField<List<String>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("approvalPolicies", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("bypassPermissions", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DBypassPermissions_97dee2d496", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("contextSizes", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("defaultApprovalPolicy", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("defaultApprovalsReviewer", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("defaultContextSize", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("defaultEffort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("defaultHiddenModels", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("defaultSandboxMode", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledSkillNames", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("efforts", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fastDisabledReason", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fastModels", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("liveInputMode", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DLiveInputMode_cb81a9dbb8", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modelContextSizes", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelContextSizes_e163a1a222", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modelDefaultEfforts", "ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modelEfforts", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelContextSizes_e163a1a222", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modelFamilies", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItem_1be1630ac3>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modelSubProvider", "ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("models", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modes", "List<ProcedureconnectThreadVoiceRequestU2DConfigU2DMode_01e21946e9>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationMode", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationModes", "List<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("requiresTerminalFocusBeforeInput", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeLabel", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sandboxModes", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("settingDefs", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItem_97d27c4efa>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("showRuntimeLabelInPicker", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("slashCommands", "List<RouteagentU2DSlashU2DCommandsResponseU2DCommandsU2DItem_7324613e41>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("subProviders", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("supportsDirectInput", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("supportsResume", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("thinkingModels", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilities_f2810a4b12(
    @SerialName("gui") val gui: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGui_dac2ab59fa> = RemoteField.Missing,
    @SerialName("terminal") val terminal: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGui_dac2ab59fa> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("gui", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGui_dac2ab59fa", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("terminal", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGui_dac2ab59fa", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationMode_c9a954a3af {
    @SerialName("terminal") TERMINAL,
    @SerialName("gui") GUI,
}

@Serializable
data class RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DThreadTitleCommandsU2DItem_8b1889f351(
    @SerialName("argumentSubcommands") val argumentSubcommands: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("command") val command: String,
    @SerialName("controlArguments") val controlArguments: RemoteField<List<String>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("argumentSubcommands", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("command", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("controlArguments", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilities_ca70f506a7(
    @SerialName("agentSettingsDefaults") val agentSettingsDefaults: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaults_cff1242509> = RemoteField.Missing,
    @SerialName("approvalPolicies") val approvalPolicies: List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>,
    @SerialName("bypassPermissions") val bypassPermissions: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DBypassPermissions_97dee2d496> = RemoteField.Missing,
    @SerialName("contextSizes") val contextSizes: RemoteField<List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>> = RemoteField.Missing,
    @SerialName("crossagentMcpRouting") val crossagentMcpRouting: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DCrossagentMcpRouting_d1d29954f5> = RemoteField.Missing,
    @SerialName("defaultApprovalPolicy") val defaultApprovalPolicy: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("defaultApprovalsReviewer") val defaultApprovalsReviewer: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("defaultContextSize") val defaultContextSize: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("defaultEffort") val defaultEffort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("defaultHiddenModels") val defaultHiddenModels: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("defaultSandboxMode") val defaultSandboxMode: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("disabledSkillNames") val disabledSkillNames: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("efforts") val efforts: List<String>,
    @SerialName("fastDisabledReason") val fastDisabledReason: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("fastModels") val fastModels: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("liveInputMode") val liveInputMode: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DLiveInputMode_88480e7409,
    @SerialName("liveVoice") val liveVoice: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DLiveVoice_62c3e7fb25> = RemoteField.Missing,
    @SerialName("mcpConfigSource") val mcpConfigSource: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DMcpConfigSource_96776c817a> = RemoteField.Missing,
    @SerialName("mcpScope") val mcpScope: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DMcpScope_65e6698fa7> = RemoteField.Missing,
    @SerialName("modelContextSizes") val modelContextSizes: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelContextSizes_e163a1a222> = RemoteField.Missing,
    @SerialName("modelDefaultEfforts") val modelDefaultEfforts: RemoteField<ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67> = RemoteField.Missing,
    @SerialName("modelEfforts") val modelEfforts: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelEfforts_b4a8e17084,
    @SerialName("modelFamilies") val modelFamilies: RemoteField<List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItem_1be1630ac3>> = RemoteField.Missing,
    @SerialName("modelSubProvider") val modelSubProvider: RemoteField<ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67> = RemoteField.Missing,
    @SerialName("models") val models: List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>,
    @SerialName("modes") val modes: List<ProcedureconnectThreadVoiceRequestU2DConfigU2DMode_01e21946e9>,
    @SerialName("presentationCapabilities") val presentationCapabilities: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilities_f2810a4b12> = RemoteField.Missing,
    @SerialName("presentationMode") val presentationMode: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationMode_c9a954a3af,
    @SerialName("presentationModes") val presentationModes: RemoteField<List<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6>> = RemoteField.Missing,
    @SerialName("readsImageAttachmentsFromHost") val readsImageAttachmentsFromHost: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("readsPdfAttachmentsFromHost") val readsPdfAttachmentsFromHost: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("reportsSkillCatalog") val reportsSkillCatalog: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("requiresTerminalFocusBeforeInput") val requiresTerminalFocusBeforeInput: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("requiresWorkspaceLocalAttachments") val requiresWorkspaceLocalAttachments: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("runtimeLabel") val runtimeLabel: RemoteField<String> = RemoteField.Missing,
    @SerialName("sandboxModes") val sandboxModes: List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>,
    @SerialName("settingDefs") val settingDefs: List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItem_97d27c4efa>,
    @SerialName("showRuntimeLabelInPicker") val showRuntimeLabelInPicker: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("slashCommands") val slashCommands: RemoteField<List<RouteagentU2DSlashU2DCommandsResponseU2DCommandsU2DItem_7324613e41>> = RemoteField.Missing,
    @SerialName("subProviders") val subProviders: RemoteField<List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>> = RemoteField.Missing,
    @SerialName("supportsDirectInput") val supportsDirectInput: Boolean,
    @SerialName("supportsOneShot") val supportsOneShot: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("supportsResume") val supportsResume: Boolean,
    @SerialName("supportsTextOnlyOneShot") val supportsTextOnlyOneShot: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("thinkingModels") val thinkingModels: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("threadTitleCommands") val threadTitleCommands: RemoteField<List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DThreadTitleCommandsU2DItem_8b1889f351>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentSettingsDefaults", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaults_cff1242509", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("approvalPolicies", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("bypassPermissions", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DBypassPermissions_97dee2d496", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("contextSizes", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("crossagentMcpRouting", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DCrossagentMcpRouting_d1d29954f5", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("defaultApprovalPolicy", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("defaultApprovalsReviewer", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("defaultContextSize", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("defaultEffort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("defaultHiddenModels", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("defaultSandboxMode", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledSkillNames", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("efforts", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fastDisabledReason", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fastModels", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("liveInputMode", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DLiveInputMode_88480e7409", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("liveVoice", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DLiveVoice_62c3e7fb25", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mcpConfigSource", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DMcpConfigSource_96776c817a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mcpScope", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DMcpScope_65e6698fa7", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modelContextSizes", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelContextSizes_e163a1a222", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modelDefaultEfforts", "ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modelEfforts", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelEfforts_b4a8e17084", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modelFamilies", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItem_1be1630ac3>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modelSubProvider", "ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("models", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("modes", "List<ProcedureconnectThreadVoiceRequestU2DConfigU2DMode_01e21946e9>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationCapabilities", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilities_f2810a4b12", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationMode", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationMode_c9a954a3af", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationModes", "List<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("readsImageAttachmentsFromHost", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("readsPdfAttachmentsFromHost", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reportsSkillCatalog", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("requiresTerminalFocusBeforeInput", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("requiresWorkspaceLocalAttachments", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeLabel", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sandboxModes", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("settingDefs", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItem_97d27c4efa>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("showRuntimeLabelInPicker", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("slashCommands", "List<RouteagentU2DSlashU2DCommandsResponseU2DCommandsU2DItem_7324613e41>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("subProviders", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("supportsDirectInput", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("supportsOneShot", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("supportsResume", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("supportsTextOnlyOneShot", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("thinkingModels", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadTitleCommands", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DThreadTitleCommandsU2DItem_8b1889f351>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DEnvKind_9eed5c4959 {
    @SerialName("windows") WINDOWS,
    @SerialName("wsl") WSL,
    @SerialName("posix") POSIX,
}

@Serializable
data class RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DPresentationAuthStates_678d084ee2(
    @SerialName("gui") val gui: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthState_2363c4dd0a> = RemoteField.Missing,
    @SerialName("terminal") val terminal: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthState_2363c4dd0a> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("gui", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthState_2363c4dd0a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("terminal", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthState_2363c4dd0a", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DPresentationAuthUsesProviderLogin_473e9b7f47(
    @SerialName("gui") val gui: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("terminal") val terminal: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("gui", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("terminal", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DProviderMetadataU2DConnectedProvidersU2DItem_0a5d0a3885(
    @SerialName("detail") val detail: RemoteField<String> = RemoteField.Missing,
    @SerialName("id") val id: RemoteField<String> = RemoteField.Missing,
    @SerialName("label") val label: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("detail", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DProviderMetadata_197c2b8c01(
    @SerialName("authMethod") val authMethod: RemoteField<String> = RemoteField.Missing,
    @SerialName("authenticatedAs") val authenticatedAs: RemoteField<String> = RemoteField.Missing,
    @SerialName("connectedProviders") val connectedProviders: RemoteField<List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DProviderMetadataU2DConnectedProvidersU2DItem_0a5d0a3885>> = RemoteField.Missing,
    @SerialName("organization") val organization: RemoteField<String> = RemoteField.Missing,
    @SerialName("plan") val plan: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("authMethod", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("authenticatedAs", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("connectedProviders", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DProviderMetadataU2DConnectedProvidersU2DItem_0a5d0a3885>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("organization", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("plan", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DRuntimeVariantsU2DValue_fe5593c9ec(
    @SerialName("authLogoutSupported") val authLogoutSupported: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("authMethods") val authMethods: RemoteField<List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966>> = RemoteField.Missing,
    @SerialName("authState") val authState: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthState_2363c4dd0a,
    @SerialName("authUsesProviderLogin") val authUsesProviderLogin: Boolean,
    @SerialName("capabilities") val capabilities: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilities_ca70f506a7,
    @SerialName("installationSource") val installationSource: RemoteField<String> = RemoteField.Missing,
    @SerialName("installed") val installed: Boolean,
    @SerialName("loginCommand") val loginCommand: RemoteField<String> = RemoteField.Missing,
    @SerialName("loginCommandDisplay") val loginCommandDisplay: RemoteField<String> = RemoteField.Missing,
    @SerialName("preferTerminalLogin") val preferTerminalLogin: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("presentationMode") val presentationMode: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6,
    @SerialName("providerMetadata") val providerMetadata: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DProviderMetadata_197c2b8c01> = RemoteField.Missing,
    @SerialName("version") val version: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("authLogoutSupported", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("authMethods", "List<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("authState", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthState_2363c4dd0a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("authUsesProviderLogin", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("capabilities", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilities_ca70f506a7", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("installationSource", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("installed", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("loginCommand", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("loginCommandDisplay", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("preferTerminalLogin", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationMode", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerMetadata", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DProviderMetadata_197c2b8c01", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DRuntimeVariants_fcdee201e3 = Map<String, RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DRuntimeVariantsU2DValue_fe5593c9ec>

typealias RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DSessionRuntimeRoutingU2DPrefixes_b84e449d1a = Map<String, String>

@Serializable
data class RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DSessionRuntimeRouting_d221b1853e(
    @SerialName("fallbackRuntime") val fallbackRuntime: RemoteField<String> = RemoteField.Missing,
    @SerialName("prefixes") val prefixes: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DSessionRuntimeRoutingU2DPrefixes_b84e449d1a,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("fallbackRuntime", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prefixes", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DSessionRuntimeRoutingU2DPrefixes_b84e449d1a", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c(
    @SerialName("args") val args: List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("binary") val binary: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("args", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("binary", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DInstaller_540ab9236f(
    @SerialName("posix") val posix: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c,
    @SerialName("windows") val windows: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("posix", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("windows", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdate_ae00c10b95(
    @SerialName("brew") val brew: RemoteField<String> = RemoteField.Missing,
    @SerialName("builtIn") val builtIn: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c> = RemoteField.Missing,
    @SerialName("homebrewCask") val homebrewCask: RemoteField<String> = RemoteField.Missing,
    @SerialName("installer") val installer: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DInstaller_540ab9236f> = RemoteField.Missing,
    @SerialName("latestVersionUrls") val latestVersionUrls: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("npm") val npm: RemoteField<String> = RemoteField.Missing,
    @SerialName("verifyBuiltInVersionChange") val verifyBuiltInVersionChange: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("winget") val winget: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("brew", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("builtIn", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("homebrewCask", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("installer", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DInstaller_540ab9236f", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("latestVersionUrls", "List<String>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("npm", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("verifyBuiltInVersionChange", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("winget", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
