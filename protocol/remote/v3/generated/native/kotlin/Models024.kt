// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RouteschedulesU2DCommandRequestU2DOptionU2D3_e7cab2d2c0(
    @SerialName("id") val id: String,
    @SerialName("kind") val kind: RouteschedulesU2DCommandRequestU2DOptionU2D3U2DKind_4d5989d27d,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("kind", "RouteschedulesU2DCommandRequestU2DOptionU2D3U2DKind_4d5989d27d", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteschedulesU2DCommandRequestU2DOptionU2D4U2DKind_d12ea65516 {
    @SerialName("run") RUN,
}

@Serializable
data class RouteschedulesU2DCommandRequestU2DOptionU2D4_09f700fdeb(
    @SerialName("id") val id: String,
    @SerialName("kind") val kind: RouteschedulesU2DCommandRequestU2DOptionU2D4U2DKind_d12ea65516,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("kind", "RouteschedulesU2DCommandRequestU2DOptionU2D4U2DKind_d12ea65516", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RouteschedulesU2DCommandRequest_72e4a424a2.Serializer::class)
sealed interface RouteschedulesU2DCommandRequest_72e4a424a2 {
    data class Option1(val value: RouteschedulesU2DCommandRequestU2DOptionU2D1_0b430722c6) : RouteschedulesU2DCommandRequest_72e4a424a2
    data class Option2(val value: RouteschedulesU2DCommandRequestU2DOptionU2D2_9278450827) : RouteschedulesU2DCommandRequest_72e4a424a2
    data class Option3(val value: RouteschedulesU2DCommandRequestU2DOptionU2D3_e7cab2d2c0) : RouteschedulesU2DCommandRequest_72e4a424a2
    data class Option4(val value: RouteschedulesU2DCommandRequestU2DOptionU2D4_09f700fdeb) : RouteschedulesU2DCommandRequest_72e4a424a2
    object Serializer : KSerializer<RouteschedulesU2DCommandRequest_72e4a424a2> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouteschedulesU2DCommandRequest_72e4a424a2")
        override fun deserialize(decoder: Decoder): RouteschedulesU2DCommandRequest_72e4a424a2 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouteschedulesU2DCommandRequest_72e4a424a2 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouteschedulesU2DCommandRequest_72e4a424a2>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("create")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RouteschedulesU2DCommandRequestU2DOptionU2D1_0b430722c6>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("update")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RouteschedulesU2DCommandRequestU2DOptionU2D2_9278450827>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("delete")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RouteschedulesU2DCommandRequestU2DOptionU2D3_e7cab2d2c0>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("run")))) { Option4(jsonDecoder.json.decodeFromJsonElement<RouteschedulesU2DCommandRequestU2DOptionU2D4_09f700fdeb>(element)) }
            return RemoteUnionCodec.single("RouteschedulesU2DCommandRequest_72e4a424a2", matches)
        }
        override fun serialize(encoder: Encoder, value: RouteschedulesU2DCommandRequest_72e4a424a2) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouteschedulesU2DCommandRequest_72e4a424a2 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RouteschedulesU2DCommandRequestU2DOptionU2D1_0b430722c6>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RouteschedulesU2DCommandRequestU2DOptionU2D2_9278450827>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RouteschedulesU2DCommandRequestU2DOptionU2D3_e7cab2d2c0>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<RouteschedulesU2DCommandRequestU2DOptionU2D4_09f700fdeb>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class RouteschedulesU2DCommandResponseU2DScheduleU2DLastStatus_aafa839556 {
    @SerialName("never") NEVER,
    @SerialName("running") RUNNING,
    @SerialName("succeeded") SUCCEEDED,
    @SerialName("failed") FAILED,
}

@Serializable
data class RouteschedulesU2DCommandResponseU2DSchedule_73baee1e40(
    @SerialName("agentKind") val agentKind: String,
    @SerialName("config") val config: RouteprU2DWatchU2DAgentU2DSyncRequestU2DConfig_048d1517dd,
    @SerialName("createdAt") val createdAt: String,
    @SerialName("enabled") val enabled: Boolean,
    @SerialName("id") val id: String,
    @SerialName("lastCompletedAt") val lastCompletedAt: RemoteField<String>,
    @SerialName("lastError") val lastError: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("lastResult") val lastResult: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("lastRunAt") val lastRunAt: RemoteField<String>,
    @SerialName("lastStatus") val lastStatus: RouteschedulesU2DCommandResponseU2DScheduleU2DLastStatus_aafa839556,
    @SerialName("name") val name: String,
    @SerialName("nextRunAt") val nextRunAt: RemoteField<String>,
    @SerialName("projectId") val projectId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("prompt") val prompt: String,
    @SerialName("recurrence") val recurrence: RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_370441a9f9,
    @SerialName("updatedAt") val updatedAt: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("config", "RouteprU2DWatchU2DAgentU2DSyncRequestU2DConfig_048d1517dd", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("createdAt", "String", true, false, null, null, null, null, null, null, "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", "date-time", listOf()),
            RemoteFieldDescriptor("enabled", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("lastCompletedAt", "String", true, true, null, null, null, null, null, null, "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", "date-time", listOf()),
            RemoteFieldDescriptor("lastError", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastResult", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastRunAt", "String", true, true, null, null, null, null, null, null, "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", "date-time", listOf()),
            RemoteFieldDescriptor("lastStatus", "RouteschedulesU2DCommandResponseU2DScheduleU2DLastStatus_aafa839556", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, 120, null, null, null, null, listOf("string.trim")),
            RemoteFieldDescriptor("nextRunAt", "String", true, true, null, null, null, null, null, null, "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", "date-time", listOf()),
            RemoteFieldDescriptor("projectId", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prompt", "String", true, false, null, null, 1, 50000, null, null, null, null, listOf("string.trim")),
            RemoteFieldDescriptor("recurrence", "RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_370441a9f9", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("updatedAt", "String", true, false, null, null, null, null, null, null, "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", "date-time", listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteschedulesU2DCommandResponse_320890c24c(
    @SerialName("schedule") val schedule: RemoteField<RouteschedulesU2DCommandResponseU2DSchedule_73baee1e40> = RemoteField.Missing,
    @SerialName("schedules") val schedules: List<RouteschedulesU2DCommandResponseU2DSchedule_73baee1e40>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("schedule", "RouteschedulesU2DCommandResponseU2DSchedule_73baee1e40", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("schedules", "List<RouteschedulesU2DCommandResponseU2DSchedule_73baee1e40>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RoutesettingsU2DReadResponseU2DSettingsU2DAgentSettings_deb61378c1 = Map<String, RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaults_cff1242509>

typealias RoutesettingsU2DReadResponseU2DSettingsU2DDisabledBuiltInMcpServers_65899fb957 = Map<String, Boolean>

typealias RoutesettingsU2DReadResponseU2DSettingsU2DEnabledMcpServers_2d677fb041 = Map<String, Boolean>

@Serializable
enum class RoutesettingsU2DReadResponseU2DSettingsU2DFollowUpBehavior_6fcb1a55c0 {
    @SerialName("steer") STEER,
    @SerialName("queue") QUEUE,
}

typealias RoutesettingsU2DReadResponseU2DSettingsU2DHiddenModels_86d5d72e84 = Map<String, List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>>

@Serializable
enum class RoutesettingsU2DReadResponseU2DSettingsU2DPrAutomationDefault_6df05d56a8 {
    @SerialName("off") OFF,
    @SerialName("fix") FIX,
    @SerialName("merge") MERGE,
}

@Serializable
enum class RoutesettingsU2DReadResponseU2DSettingsU2DPrMergeMethod_9c01de6b08 {
    @SerialName("merge") MERGE,
    @SerialName("squash") SQUASH,
    @SerialName("rebase") REBASE,
}

typealias RoutesettingsU2DReadResponseU2DSettingsU2DUsageU2DProviderRefreshIntervals_ea08f63f22 = Map<String, Long>

@Serializable
data class RoutesettingsU2DReadResponseU2DSettingsU2DUsage_18dc352c9a(
    @SerialName("autoRefresh") val autoRefresh: Boolean,
    @SerialName("collapsedProviders") val collapsedProviders: List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("disabledProviders") val disabledProviders: List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("providerOrder") val providerOrder: List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("providerRefreshIntervals") val providerRefreshIntervals: RoutesettingsU2DReadResponseU2DSettingsU2DUsageU2DProviderRefreshIntervals_ea08f63f22,
    @SerialName("refreshIntervalMinutes") val refreshIntervalMinutes: Long,
    @SerialName("selectedRingGroups") val selectedRingGroups: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986,
    @SerialName("showEstimatedCost") val showEstimatedCost: Boolean,
    @SerialName("showInSidebar") val showInSidebar: Boolean,
    @SerialName("sidebarHiddenProviders") val sidebarHiddenProviders: List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("autoRefresh", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("collapsedProviders", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledProviders", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerOrder", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerRefreshIntervals", "RoutesettingsU2DReadResponseU2DSettingsU2DUsageU2DProviderRefreshIntervals_ea08f63f22", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("refreshIntervalMinutes", "Long", true, false, 2.0, 120.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("selectedRingGroups", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("showEstimatedCost", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("showInSidebar", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sidebarHiddenProviders", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutesettingsU2DReadResponseU2DSettings_837a60dd43(
    @SerialName("agentSettings") val agentSettings: RoutesettingsU2DReadResponseU2DSettingsU2DAgentSettings_deb61378c1,
    @SerialName("commitGenEffort") val commitGenEffort: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("commitGenFast") val commitGenFast: Boolean,
    @SerialName("commitGenModel") val commitGenModel: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("commitGenProvider") val commitGenProvider: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("conflictResolverEffort") val conflictResolverEffort: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("conflictResolverFast") val conflictResolverFast: Boolean,
    @SerialName("conflictResolverModel") val conflictResolverModel: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("conflictResolverPresentationMode") val conflictResolverPresentationMode: ProcedureensureThreadRunningRequestU2DPresentationMode_6508684ba6,
    @SerialName("conflictResolverProvider") val conflictResolverProvider: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("disabledAgents") val disabledAgents: List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("disabledBuiltInMcpServers") val disabledBuiltInMcpServers: RoutesettingsU2DReadResponseU2DSettingsU2DDisabledBuiltInMcpServers_65899fb957,
    @SerialName("enabledMcpServers") val enabledMcpServers: RoutesettingsU2DReadResponseU2DSettingsU2DEnabledMcpServers_2d677fb041,
    @SerialName("followUpBehavior") val followUpBehavior: RoutesettingsU2DReadResponseU2DSettingsU2DFollowUpBehavior_6fcb1a55c0,
    @SerialName("hiddenModels") val hiddenModels: RoutesettingsU2DReadResponseU2DSettingsU2DHiddenModels_86d5d72e84,
    @SerialName("prAutomationDefault") val prAutomationDefault: RoutesettingsU2DReadResponseU2DSettingsU2DPrAutomationDefault_6df05d56a8,
    @SerialName("prMergeMethod") val prMergeMethod: RoutesettingsU2DReadResponseU2DSettingsU2DPrMergeMethod_9c01de6b08,
    @SerialName("providerOrder") val providerOrder: List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("searchExclude") val searchExclude: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1U2DExclude_cda18ebe4a> = RemoteField.Missing,
    @SerialName("searchUseIgnoreFiles") val searchUseIgnoreFiles: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("titleGenEffort") val titleGenEffort: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("titleGenFast") val titleGenFast: Boolean,
    @SerialName("titleGenModel") val titleGenModel: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("titleGenProvider") val titleGenProvider: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("usage") val usage: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DUsage_18dc352c9a> = RemoteField.Missing,
    @SerialName("worktreeBasePath") val worktreeBasePath: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("worktreeStorageMode") val worktreeStorageMode: RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1U2DMode_953c573b19,
    @SerialName("wslCommitGenEffort") val wslCommitGenEffort: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("wslCommitGenFast") val wslCommitGenFast: Boolean,
    @SerialName("wslCommitGenModel") val wslCommitGenModel: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("wslCommitGenProvider") val wslCommitGenProvider: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("wslConflictResolverEffort") val wslConflictResolverEffort: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("wslConflictResolverFast") val wslConflictResolverFast: Boolean,
    @SerialName("wslConflictResolverModel") val wslConflictResolverModel: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("wslConflictResolverPresentationMode") val wslConflictResolverPresentationMode: ProcedureensureThreadRunningRequestU2DPresentationMode_6508684ba6,
    @SerialName("wslConflictResolverProvider") val wslConflictResolverProvider: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("wslTitleGenEffort") val wslTitleGenEffort: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("wslTitleGenFast") val wslTitleGenFast: Boolean,
    @SerialName("wslTitleGenModel") val wslTitleGenModel: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("wslTitleGenProvider") val wslTitleGenProvider: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("wslWorktreeBasePath") val wslWorktreeBasePath: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentSettings", "RoutesettingsU2DReadResponseU2DSettingsU2DAgentSettings_deb61378c1", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commitGenEffort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commitGenFast", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commitGenModel", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commitGenProvider", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverEffort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverFast", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverModel", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverPresentationMode", "ProcedureensureThreadRunningRequestU2DPresentationMode_6508684ba6", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverProvider", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledAgents", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledBuiltInMcpServers", "RoutesettingsU2DReadResponseU2DSettingsU2DDisabledBuiltInMcpServers_65899fb957", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("enabledMcpServers", "RoutesettingsU2DReadResponseU2DSettingsU2DEnabledMcpServers_2d677fb041", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("followUpBehavior", "RoutesettingsU2DReadResponseU2DSettingsU2DFollowUpBehavior_6fcb1a55c0", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("hiddenModels", "RoutesettingsU2DReadResponseU2DSettingsU2DHiddenModels_86d5d72e84", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prAutomationDefault", "RoutesettingsU2DReadResponseU2DSettingsU2DPrAutomationDefault_6df05d56a8", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prMergeMethod", "RoutesettingsU2DReadResponseU2DSettingsU2DPrMergeMethod_9c01de6b08", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerOrder", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("searchExclude", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1U2DExclude_cda18ebe4a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("searchUseIgnoreFiles", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("titleGenEffort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("titleGenFast", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("titleGenModel", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("titleGenProvider", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("usage", "RoutesettingsU2DReadResponseU2DSettingsU2DUsage_18dc352c9a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeBasePath", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeStorageMode", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1U2DMode_953c573b19", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCommitGenEffort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCommitGenFast", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCommitGenModel", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCommitGenProvider", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverEffort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverFast", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverModel", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverPresentationMode", "ProcedureensureThreadRunningRequestU2DPresentationMode_6508684ba6", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverProvider", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslTitleGenEffort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslTitleGenFast", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslTitleGenModel", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslTitleGenProvider", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslWorktreeBasePath", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutesettingsU2DReadResponse_49437ffdd8(
    @SerialName("settings") val settings: RoutesettingsU2DReadResponseU2DSettings_837a60dd43,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("settings", "RoutesettingsU2DReadResponseU2DSettings_837a60dd43", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RoutesettingsU2DWriteRequestU2DDisabledBuiltInMcpServers_79608b5ece = Map<String, Boolean>

@Serializable
enum class RoutesettingsU2DWriteRequestU2DFollowUpBehavior_49162371ff {
    @SerialName("steer") STEER,
    @SerialName("queue") QUEUE,
}

@Serializable
data class RoutesettingsU2DWriteRequestU2DUsage_b6aaa17d32(
    @SerialName("autoRefresh") val autoRefresh: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("collapsedProviders") val collapsedProviders: RemoteField<List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>> = RemoteField.Missing,
    @SerialName("disabledProviders") val disabledProviders: RemoteField<List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>> = RemoteField.Missing,
    @SerialName("providerOrder") val providerOrder: RemoteField<List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>> = RemoteField.Missing,
    @SerialName("providerRefreshIntervals") val providerRefreshIntervals: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DUsageU2DProviderRefreshIntervals_ea08f63f22> = RemoteField.Missing,
    @SerialName("refreshIntervalMinutes") val refreshIntervalMinutes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("selectedRingGroups") val selectedRingGroups: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986> = RemoteField.Missing,
    @SerialName("showEstimatedCost") val showEstimatedCost: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("showInSidebar") val showInSidebar: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("sidebarHiddenProviders") val sidebarHiddenProviders: RemoteField<List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("autoRefresh", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("collapsedProviders", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledProviders", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerOrder", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerRefreshIntervals", "RoutesettingsU2DReadResponseU2DSettingsU2DUsageU2DProviderRefreshIntervals_ea08f63f22", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("refreshIntervalMinutes", "Long", false, false, 2.0, 120.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("selectedRingGroups", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("showEstimatedCost", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("showInSidebar", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sidebarHiddenProviders", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutesettingsU2DWriteRequest_f310784fe2(
    @SerialName("agentSettings") val agentSettings: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DAgentSettings_deb61378c1> = RemoteField.Missing,
    @SerialName("commitGenEffort") val commitGenEffort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("commitGenFast") val commitGenFast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("commitGenModel") val commitGenModel: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("commitGenProvider") val commitGenProvider: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("conflictResolverEffort") val conflictResolverEffort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("conflictResolverFast") val conflictResolverFast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("conflictResolverModel") val conflictResolverModel: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("conflictResolverPresentationMode") val conflictResolverPresentationMode: RemoteField<ProcedureensureThreadRunningRequestU2DPresentationMode_6508684ba6> = RemoteField.Missing,
    @SerialName("conflictResolverProvider") val conflictResolverProvider: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("disabledAgents") val disabledAgents: RemoteField<List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>> = RemoteField.Missing,
    @SerialName("disabledBuiltInMcpServers") val disabledBuiltInMcpServers: RemoteField<RoutesettingsU2DWriteRequestU2DDisabledBuiltInMcpServers_79608b5ece> = RemoteField.Missing,
    @SerialName("enabledMcpServers") val enabledMcpServers: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1U2DExclude_cda18ebe4a> = RemoteField.Missing,
    @SerialName("followUpBehavior") val followUpBehavior: RemoteField<RoutesettingsU2DWriteRequestU2DFollowUpBehavior_49162371ff> = RemoteField.Missing,
    @SerialName("hiddenModels") val hiddenModels: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DHiddenModels_86d5d72e84> = RemoteField.Missing,
    @SerialName("prAutomationDefault") val prAutomationDefault: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DPrAutomationDefault_6df05d56a8> = RemoteField.Missing,
    @SerialName("prMergeMethod") val prMergeMethod: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DPrMergeMethod_9c01de6b08> = RemoteField.Missing,
    @SerialName("providerOrder") val providerOrder: RemoteField<List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>> = RemoteField.Missing,
    @SerialName("searchExclude") val searchExclude: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1U2DExclude_cda18ebe4a> = RemoteField.Missing,
    @SerialName("searchUseIgnoreFiles") val searchUseIgnoreFiles: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("titleGenEffort") val titleGenEffort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("titleGenFast") val titleGenFast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("titleGenModel") val titleGenModel: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("titleGenProvider") val titleGenProvider: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("usage") val usage: RemoteField<RoutesettingsU2DWriteRequestU2DUsage_b6aaa17d32> = RemoteField.Missing,
    @SerialName("worktreeBasePath") val worktreeBasePath: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("worktreeStorageMode") val worktreeStorageMode: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1U2DMode_953c573b19> = RemoteField.Missing,
    @SerialName("wslCommitGenEffort") val wslCommitGenEffort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("wslCommitGenFast") val wslCommitGenFast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("wslCommitGenModel") val wslCommitGenModel: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("wslCommitGenProvider") val wslCommitGenProvider: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("wslConflictResolverEffort") val wslConflictResolverEffort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("wslConflictResolverFast") val wslConflictResolverFast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("wslConflictResolverModel") val wslConflictResolverModel: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("wslConflictResolverPresentationMode") val wslConflictResolverPresentationMode: RemoteField<ProcedureensureThreadRunningRequestU2DPresentationMode_6508684ba6> = RemoteField.Missing,
    @SerialName("wslConflictResolverProvider") val wslConflictResolverProvider: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("wslTitleGenEffort") val wslTitleGenEffort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("wslTitleGenFast") val wslTitleGenFast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("wslTitleGenModel") val wslTitleGenModel: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("wslTitleGenProvider") val wslTitleGenProvider: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("wslWorktreeBasePath") val wslWorktreeBasePath: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentSettings", "RoutesettingsU2DReadResponseU2DSettingsU2DAgentSettings_deb61378c1", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commitGenEffort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commitGenFast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commitGenModel", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commitGenProvider", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverEffort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverFast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverModel", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverPresentationMode", "ProcedureensureThreadRunningRequestU2DPresentationMode_6508684ba6", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverProvider", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledAgents", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledBuiltInMcpServers", "RoutesettingsU2DWriteRequestU2DDisabledBuiltInMcpServers_79608b5ece", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("enabledMcpServers", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1U2DExclude_cda18ebe4a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("followUpBehavior", "RoutesettingsU2DWriteRequestU2DFollowUpBehavior_49162371ff", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("hiddenModels", "RoutesettingsU2DReadResponseU2DSettingsU2DHiddenModels_86d5d72e84", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prAutomationDefault", "RoutesettingsU2DReadResponseU2DSettingsU2DPrAutomationDefault_6df05d56a8", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prMergeMethod", "RoutesettingsU2DReadResponseU2DSettingsU2DPrMergeMethod_9c01de6b08", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerOrder", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("searchExclude", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1U2DExclude_cda18ebe4a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("searchUseIgnoreFiles", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("titleGenEffort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("titleGenFast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("titleGenModel", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("titleGenProvider", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("usage", "RoutesettingsU2DWriteRequestU2DUsage_b6aaa17d32", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeBasePath", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeStorageMode", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1U2DMode_953c573b19", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCommitGenEffort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCommitGenFast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCommitGenModel", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCommitGenProvider", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverEffort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverFast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverModel", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverPresentationMode", "ProcedureensureThreadRunningRequestU2DPresentationMode_6508684ba6", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverProvider", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslTitleGenEffort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslTitleGenFast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslTitleGenModel", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslTitleGenProvider", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslWorktreeBasePath", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteshellU2DSnapshotQuery_b2ca36e3fa(
    @SerialName("maxBytes") val maxBytes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("maxDecodeBytes") val maxDecodeBytes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("order") val order: RemoteField<RouteprojectU2DListQueryU2DOrder_42146530bc> = RemoteField.Missing,
    @SerialName("projectLimit") val projectLimit: RemoteField<Long> = RemoteField.Missing,
    @SerialName("reads") val reads: RemoteField<RouteprojectU2DListQueryU2DReads_4659e6d395> = RemoteField.Missing,
    @SerialName("summaries") val summaries: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("threadLimit") val threadLimit: RemoteField<Long> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("maxBytes", "Long", false, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxDecodeBytes", "Long", false, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("order", "RouteprojectU2DListQueryU2DOrder_42146530bc", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLimit", "Long", false, false, 1.0, 200.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reads", "RouteprojectU2DListQueryU2DReads_4659e6d395", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("summaries", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadLimit", "Long", false, false, 1.0, 200.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
