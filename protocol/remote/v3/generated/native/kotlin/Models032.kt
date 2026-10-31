// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RoutescheduleU2DRunsU2DReadQuery_08eb4244d2(
    @SerialName("id") val id: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTask_7ab420c1b7(
    @SerialName("agentKind") val agentKind: String,
    @SerialName("automation") val automation: RemoteField<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshot_fdddba9ec6> = RemoteField.Missing,
    @SerialName("config") val config: RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DConfig_f69100925f,
    @SerialName("enabled") val enabled: Boolean,
    @SerialName("name") val name: String,
    @SerialName("projectId") val projectId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("prompt") val prompt: String,
    @SerialName("recurrence") val recurrence: RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrence_12f751ee47,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("automation", "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshot_fdddba9ec6", false, false, null, null, null, null, null, null, null, null, listOf("schedule.automation")),
            RemoteFieldDescriptor("config", "RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DConfig_f69100925f", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("enabled", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, 120, null, null, null, null, listOf("string.trim")),
            RemoteFieldDescriptor("projectId", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prompt", "String", true, false, null, null, 1, 50000, null, null, null, null, listOf("string.trim")),
            RemoteFieldDescriptor("recurrence", "RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrence_12f751ee47", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteschedulesU2DCommandRequestU2DOptionU2D1_7ac92dcb74(
    @SerialName("kind") val kind: RouteexperimentU2DCommandRequestU2DOptionU2D1U2DKind_1f45188862,
    @SerialName("task") val task: RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTask_7ab420c1b7,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteexperimentU2DCommandRequestU2DOptionU2D1U2DKind_1f45188862", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("task", "RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTask_7ab420c1b7", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteschedulesU2DCommandRequestU2DOptionU2D2_455b16a806(
    @SerialName("id") val id: String,
    @SerialName("kind") val kind: RouteprojectU2DCommandRequestU2DOptionU2D4U2DKind_cbc64d1458,
    @SerialName("task") val task: RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTask_7ab420c1b7,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("kind", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DKind_cbc64d1458", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("task", "RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTask_7ab420c1b7", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteschedulesU2DCommandRequestU2DOptionU2D3U2DKind_4d5989d27d {
    @SerialName("delete") DELETE,
}

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

@Serializable(with = RouteschedulesU2DCommandRequest_8be22931a5.Serializer::class)
sealed interface RouteschedulesU2DCommandRequest_8be22931a5 {
    data class Option1(val value: RouteschedulesU2DCommandRequestU2DOptionU2D1_7ac92dcb74) : RouteschedulesU2DCommandRequest_8be22931a5
    data class Option2(val value: RouteschedulesU2DCommandRequestU2DOptionU2D2_455b16a806) : RouteschedulesU2DCommandRequest_8be22931a5
    data class Option3(val value: RouteschedulesU2DCommandRequestU2DOptionU2D3_e7cab2d2c0) : RouteschedulesU2DCommandRequest_8be22931a5
    data class Option4(val value: RouteschedulesU2DCommandRequestU2DOptionU2D4_09f700fdeb) : RouteschedulesU2DCommandRequest_8be22931a5
    object Serializer : KSerializer<RouteschedulesU2DCommandRequest_8be22931a5> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouteschedulesU2DCommandRequest_8be22931a5")
        override fun deserialize(decoder: Decoder): RouteschedulesU2DCommandRequest_8be22931a5 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouteschedulesU2DCommandRequest_8be22931a5 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouteschedulesU2DCommandRequest_8be22931a5>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("create")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RouteschedulesU2DCommandRequestU2DOptionU2D1_7ac92dcb74>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("update")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RouteschedulesU2DCommandRequestU2DOptionU2D2_455b16a806>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("delete")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RouteschedulesU2DCommandRequestU2DOptionU2D3_e7cab2d2c0>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("run")))) { Option4(jsonDecoder.json.decodeFromJsonElement<RouteschedulesU2DCommandRequestU2DOptionU2D4_09f700fdeb>(element)) }
            return RemoteUnionCodec.single("RouteschedulesU2DCommandRequest_8be22931a5", matches)
        }
        override fun serialize(encoder: Encoder, value: RouteschedulesU2DCommandRequest_8be22931a5) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouteschedulesU2DCommandRequest_8be22931a5 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RouteschedulesU2DCommandRequestU2DOptionU2D1_7ac92dcb74>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RouteschedulesU2DCommandRequestU2DOptionU2D2_455b16a806>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RouteschedulesU2DCommandRequestU2DOptionU2D3_e7cab2d2c0>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<RouteschedulesU2DCommandRequestU2DOptionU2D4_09f700fdeb>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class RouteschedulesU2DCommandResponse_bc1920595e(
    @SerialName("schedule") val schedule: RemoteField<RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItem_14f6b52f84> = RemoteField.Missing,
    @SerialName("schedules") val schedules: List<RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItem_14f6b52f84>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("schedule", "RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItem_14f6b52f84", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("schedules", "List<RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItem_14f6b52f84>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RoutesettingsU2DReadResponseU2DSettingsU2DAgentSettings_deb61378c1 = Map<String, RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaults_cff1242509>

@Serializable
data class RoutesettingsU2DReadResponseU2DSettingsU2DCrewsU2DItemU2DLead_77f2cf560a(
    @SerialName("agentKind") val agentKind: String,
    @SerialName("contextSize") val contextSize: RemoteField<String> = RemoteField.Missing,
    @SerialName("effort") val effort: RemoteField<String> = RemoteField.Missing,
    @SerialName("fast") val fast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("model") val model: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, 128, null, null, null, null, listOf()),
            RemoteFieldDescriptor("contextSize", "String", false, false, null, null, 1, 64, null, null, null, null, listOf()),
            RemoteFieldDescriptor("effort", "String", false, false, null, null, 1, 64, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "String", true, false, null, null, 1, 256, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutesettingsU2DReadResponseU2DSettingsU2DCrewsU2DItemU2DRolesU2DItem_236f000609(
    @SerialName("brief") val brief: RemoteField<String> = RemoteField.Missing,
    @SerialName("fallbacks") val fallbacks: RemoteField<List<ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DFallbacksU2DItem_c33d76cdf9>> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("label") val label: String,
    @SerialName("noEdits") val noEdits: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1> = RemoteField.Missing,
    @SerialName("parallel") val parallel: RemoteField<Long> = RemoteField.Missing,
    @SerialName("selection") val selection: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DFallbacksU2DItem_c33d76cdf9,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("brief", "String", false, false, null, null, null, 160, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fallbacks", "List<ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DFallbacksU2DItem_c33d76cdf9>", false, false, null, null, null, null, null, 3, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^[a-z0-9][a-z0-9-]{0,31}$", null, listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, 1, 24, null, null, null, null, listOf()),
            RemoteFieldDescriptor("noEdits", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("parallel", "Long", false, false, 1.0, 4.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("selection", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DFallbacksU2DItem_c33d76cdf9", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutesettingsU2DReadResponseU2DSettingsU2DCrewsU2DItem_261c257787(
    @SerialName("favorite") val favorite: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("lastUsedAt") val lastUsedAt: RemoteField<Long> = RemoteField.Missing,
    @SerialName("lead") val lead: RoutesettingsU2DReadResponseU2DSettingsU2DCrewsU2DItemU2DLead_77f2cf560a,
    @SerialName("name") val name: String,
    @SerialName("policy") val policy: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DPolicy_5e585becfd,
    @SerialName("roles") val roles: List<RoutesettingsU2DReadResponseU2DSettingsU2DCrewsU2DItemU2DRolesU2DItem_236f000609>,
    @SerialName("updatedAt") val updatedAt: RemoteField<Long> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("favorite", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, 64, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastUsedAt", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lead", "RoutesettingsU2DReadResponseU2DSettingsU2DCrewsU2DItemU2DLead_77f2cf560a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, 40, null, null, null, null, listOf()),
            RemoteFieldDescriptor("policy", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DPolicy_5e585becfd", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("roles", "List<RoutesettingsU2DReadResponseU2DSettingsU2DCrewsU2DItemU2DRolesU2DItem_236f000609>", true, false, null, null, null, null, 1, 6, null, null, listOf()),
            RemoteFieldDescriptor("updatedAt", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

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
data class RoutesettingsU2DReadResponseU2DSettings_5a8607ab99(
    @SerialName("agentSettings") val agentSettings: RoutesettingsU2DReadResponseU2DSettingsU2DAgentSettings_deb61378c1,
    @SerialName("commitGenEffort") val commitGenEffort: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("commitGenFast") val commitGenFast: Boolean,
    @SerialName("commitGenModel") val commitGenModel: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("commitGenProvider") val commitGenProvider: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("commitGenSelection") val commitGenSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = RemoteField.Missing,
    @SerialName("conflictResolverEffort") val conflictResolverEffort: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("conflictResolverFast") val conflictResolverFast: Boolean,
    @SerialName("conflictResolverModel") val conflictResolverModel: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("conflictResolverPresentationMode") val conflictResolverPresentationMode: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6,
    @SerialName("conflictResolverProvider") val conflictResolverProvider: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("conflictResolverSelection") val conflictResolverSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = RemoteField.Missing,
    @SerialName("crews") val crews: RemoteField<List<RoutesettingsU2DReadResponseU2DSettingsU2DCrewsU2DItem_261c257787>> = RemoteField.Missing,
    @SerialName("disabledAgents") val disabledAgents: List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("disabledBuiltInMcpServers") val disabledBuiltInMcpServers: RoutesettingsU2DReadResponseU2DSettingsU2DDisabledBuiltInMcpServers_65899fb957,
    @SerialName("enabledMcpServers") val enabledMcpServers: RoutesettingsU2DReadResponseU2DSettingsU2DEnabledMcpServers_2d677fb041,
    @SerialName("experimentJudgeSelection") val experimentJudgeSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = RemoteField.Missing,
    @SerialName("followUpBehavior") val followUpBehavior: RoutesettingsU2DReadResponseU2DSettingsU2DFollowUpBehavior_6fcb1a55c0,
    @SerialName("hiddenModels") val hiddenModels: RoutesettingsU2DReadResponseU2DSettingsU2DHiddenModels_86d5d72e84,
    @SerialName("prAutomationDefault") val prAutomationDefault: RoutesettingsU2DReadResponseU2DSettingsU2DPrAutomationDefault_6df05d56a8,
    @SerialName("prMergeMethod") val prMergeMethod: ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DMergeMethodsU2DItem_9c01de6b08,
    @SerialName("providerOrder") val providerOrder: List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("searchExclude") val searchExclude: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1U2DExclude_cda18ebe4a> = RemoteField.Missing,
    @SerialName("searchUseIgnoreFiles") val searchUseIgnoreFiles: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("titleGenEffort") val titleGenEffort: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("titleGenFast") val titleGenFast: Boolean,
    @SerialName("titleGenModel") val titleGenModel: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("titleGenProvider") val titleGenProvider: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("titleGenSelection") val titleGenSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = RemoteField.Missing,
    @SerialName("usage") val usage: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DUsage_18dc352c9a> = RemoteField.Missing,
    @SerialName("worktreeBasePath") val worktreeBasePath: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("worktreeStorageMode") val worktreeStorageMode: RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1U2DMode_953c573b19,
    @SerialName("wslCommitGenEffort") val wslCommitGenEffort: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("wslCommitGenFast") val wslCommitGenFast: Boolean,
    @SerialName("wslCommitGenModel") val wslCommitGenModel: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("wslCommitGenProvider") val wslCommitGenProvider: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("wslCommitGenSelection") val wslCommitGenSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = RemoteField.Missing,
    @SerialName("wslConflictResolverEffort") val wslConflictResolverEffort: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("wslConflictResolverFast") val wslConflictResolverFast: Boolean,
    @SerialName("wslConflictResolverModel") val wslConflictResolverModel: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("wslConflictResolverPresentationMode") val wslConflictResolverPresentationMode: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6,
    @SerialName("wslConflictResolverProvider") val wslConflictResolverProvider: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("wslConflictResolverSelection") val wslConflictResolverSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = RemoteField.Missing,
    @SerialName("wslTitleGenEffort") val wslTitleGenEffort: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("wslTitleGenFast") val wslTitleGenFast: Boolean,
    @SerialName("wslTitleGenModel") val wslTitleGenModel: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("wslTitleGenProvider") val wslTitleGenProvider: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("wslTitleGenSelection") val wslTitleGenSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = RemoteField.Missing,
    @SerialName("wslWorktreeBasePath") val wslWorktreeBasePath: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentSettings", "RoutesettingsU2DReadResponseU2DSettingsU2DAgentSettings_deb61378c1", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commitGenEffort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commitGenFast", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commitGenModel", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commitGenProvider", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commitGenSelection", "ProcedureextractContextRequestU2DSelection_32c3720f64", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverEffort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverFast", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverModel", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverPresentationMode", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverProvider", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conflictResolverSelection", "ProcedureextractContextRequestU2DSelection_32c3720f64", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("crews", "List<RoutesettingsU2DReadResponseU2DSettingsU2DCrewsU2DItem_261c257787>", false, false, null, null, null, null, null, 24, null, null, listOf()),
            RemoteFieldDescriptor("disabledAgents", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledBuiltInMcpServers", "RoutesettingsU2DReadResponseU2DSettingsU2DDisabledBuiltInMcpServers_65899fb957", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("enabledMcpServers", "RoutesettingsU2DReadResponseU2DSettingsU2DEnabledMcpServers_2d677fb041", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("experimentJudgeSelection", "ProcedureextractContextRequestU2DSelection_32c3720f64", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("followUpBehavior", "RoutesettingsU2DReadResponseU2DSettingsU2DFollowUpBehavior_6fcb1a55c0", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("hiddenModels", "RoutesettingsU2DReadResponseU2DSettingsU2DHiddenModels_86d5d72e84", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prAutomationDefault", "RoutesettingsU2DReadResponseU2DSettingsU2DPrAutomationDefault_6df05d56a8", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prMergeMethod", "ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DMergeMethodsU2DItem_9c01de6b08", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerOrder", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("searchExclude", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1U2DExclude_cda18ebe4a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("searchUseIgnoreFiles", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("titleGenEffort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("titleGenFast", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("titleGenModel", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("titleGenProvider", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("titleGenSelection", "ProcedureextractContextRequestU2DSelection_32c3720f64", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("usage", "RoutesettingsU2DReadResponseU2DSettingsU2DUsage_18dc352c9a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeBasePath", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreeStorageMode", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1U2DMode_953c573b19", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCommitGenEffort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCommitGenFast", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCommitGenModel", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCommitGenProvider", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslCommitGenSelection", "ProcedureextractContextRequestU2DSelection_32c3720f64", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverEffort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverFast", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverModel", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverPresentationMode", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverProvider", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslConflictResolverSelection", "ProcedureextractContextRequestU2DSelection_32c3720f64", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslTitleGenEffort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslTitleGenFast", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslTitleGenModel", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslTitleGenProvider", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslTitleGenSelection", "ProcedureextractContextRequestU2DSelection_32c3720f64", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslWorktreeBasePath", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutesettingsU2DReadResponse_f87159e788(
    @SerialName("settings") val settings: RoutesettingsU2DReadResponseU2DSettings_5a8607ab99,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("settings", "RoutesettingsU2DReadResponseU2DSettings_5a8607ab99", true, false, null, null, null, null, null, null, null, null, listOf()),
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
