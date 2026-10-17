// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
typealias RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResult_66ee2eb4ed = RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1_ae4a760581?

@Serializable
enum class RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DStatus_2151c8edcf {
    @SerialName("running") RUNNING,
    @SerialName("waiting-for-approval") WAITINGU2DFORU2DAPPROVAL,
    @SerialName("succeeded") SUCCEEDED,
    @SerialName("failed") FAILED,
    @SerialName("cancelled") CANCELLED,
    @SerialName("interrupted") INTERRUPTED,
    @SerialName("skipped") SKIPPED,
}

@Serializable
enum class RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DTrigger_56296b74a9 {
    @SerialName("manual") MANUAL,
    @SerialName("scheduled") SCHEDULED,
    @SerialName("retry") RETRY,
}

@Serializable
data class RouteautomationsU2DSnapshotResponseU2DRunsU2DItem_38754692c8(
    @SerialName("attempt") val attempt: RemoteField<Long> = RemoteField.Missing,
    @SerialName("automationSnapshot") val automationSnapshot: RemoteField<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshot_fdddba9ec6> = RemoteField.Missing,
    @SerialName("completedAt") val completedAt: RemoteField<String>,
    @SerialName("error") val error: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("id") val id: String,
    @SerialName("iteration") val iteration: RemoteField<Long> = RemoteField.Missing,
    @SerialName("result") val result: RemoteField<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1_ae4a760581> = RemoteField.Missing,
    @SerialName("scheduleId") val scheduleId: String,
    @SerialName("scheduledFor") val scheduledFor: RemoteField<String> = RemoteField.Missing,
    @SerialName("startedAt") val startedAt: String,
    @SerialName("status") val status: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DStatus_2151c8edcf,
    @SerialName("summary") val summary: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("threadId") val threadId: String,
    @SerialName("trigger") val trigger: RemoteField<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DTrigger_56296b74a9> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("attempt", "Long", false, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("automationSnapshot", "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshot_fdddba9ec6", false, false, null, null, null, null, null, null, null, null, listOf("schedule.automation")),
            RemoteFieldDescriptor("completedAt", "String", true, true, null, null, null, null, null, null, "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", "date-time", listOf()),
            RemoteFieldDescriptor("error", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("iteration", "Long", false, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("result", "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1_ae4a760581", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scheduleId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("scheduledFor", "String", false, false, null, null, null, null, null, null, "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", "date-time", listOf()),
            RemoteFieldDescriptor("startedAt", "String", true, false, null, null, null, null, null, null, "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", "date-time", listOf()),
            RemoteFieldDescriptor("status", "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DStatus_2151c8edcf", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("summary", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("trigger", "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DTrigger_56296b74a9", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DConfig_f69100925f(
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
enum class RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DLastStatus_aa5449703b {
    @SerialName("never") NEVER,
    @SerialName("running") RUNNING,
    @SerialName("waiting-for-approval") WAITINGU2DFORU2DAPPROVAL,
    @SerialName("succeeded") SUCCEEDED,
    @SerialName("failed") FAILED,
    @SerialName("cancelled") CANCELLED,
    @SerialName("interrupted") INTERRUPTED,
    @SerialName("skipped") SKIPPED,
}

@Serializable
enum class RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D1U2DKind_6f5933af03 {
    @SerialName("hourly") HOURLY,
}

@Serializable
data class RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D1_a467b0ed1c(
    @SerialName("kind") val kind: RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D1U2DKind_6f5933af03,
    @SerialName("minute") val minute: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D1U2DKind_6f5933af03", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("minute", "Long", true, false, 0.0, 59.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D2U2DKind_475f91db7d {
    @SerialName("weekly") WEEKLY,
}

@Serializable
data class RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D2_ac7865b2a5(
    @SerialName("days") val days: List<Long>,
    @SerialName("kind") val kind: RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D2U2DKind_475f91db7d,
    @SerialName("time") val time: String,
    @SerialName("timeZone") val timeZone: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("days", "List<Long>", true, false, null, null, null, null, 1, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D2U2DKind_475f91db7d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("time", "String", true, false, null, null, null, null, null, null, "^([01]\\d|2[0-3]):[0-5]\\d$", null, listOf()),
            RemoteFieldDescriptor("timeZone", "String", false, false, null, null, 1, 128, null, null, null, null, listOf("schedule.time-zone", "string.trim")),
        ), listOf())
    }
}

@Serializable
enum class RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D3U2DKind_e5ee0a0722 {
    @SerialName("once") ONCE,
}

@Serializable
data class RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D3_d1c4cb16ae(
    @SerialName("kind") val kind: RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D3U2DKind_e5ee0a0722,
    @SerialName("runAt") val runAt: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D3U2DKind_e5ee0a0722", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runAt", "String", true, false, null, null, null, null, null, null, "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", "date-time", listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D4U2DKind_6cf695d23a {
    @SerialName("interval") INTERVAL,
}

@Serializable
enum class RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D4U2DUnit_e4a434d61c {
    @SerialName("minutes") MINUTES,
    @SerialName("hours") HOURS,
    @SerialName("days") DAYS,
}

@Serializable
data class RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D4_84ccfb83d8(
    @SerialName("every") val every: Long,
    @SerialName("kind") val kind: RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D4U2DKind_6cf695d23a,
    @SerialName("unit") val unit: RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D4U2DUnit_e4a434d61c,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("every", "Long", true, false, 1.0, 999.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D4U2DKind_6cf695d23a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("unit", "RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D4U2DUnit_e4a434d61c", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D5U2DKind_a050e4e432 {
    @SerialName("cron") CRON,
}

@Serializable
data class RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D5_0a49efe270(
    @SerialName("expression") val expression: String,
    @SerialName("kind") val kind: RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D5U2DKind_a050e4e432,
    @SerialName("timeZone") val timeZone: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("expression", "String", true, false, null, null, 1, 120, null, null, null, null, listOf("schedule.cron", "string.trim")),
            RemoteFieldDescriptor("kind", "RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D5U2DKind_a050e4e432", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("timeZone", "String", true, false, null, null, 1, 128, null, null, null, null, listOf("schedule.time-zone", "string.trim")),
        ), listOf())
    }
}

@Serializable(with = RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrence_12f751ee47.Serializer::class)
sealed interface RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrence_12f751ee47 {
    data class Option1(val value: RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D1_a467b0ed1c) : RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrence_12f751ee47
    data class Option2(val value: RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D2_ac7865b2a5) : RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrence_12f751ee47
    data class Option3(val value: RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D3_d1c4cb16ae) : RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrence_12f751ee47
    data class Option4(val value: RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D4_84ccfb83d8) : RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrence_12f751ee47
    data class Option5(val value: RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D5_0a49efe270) : RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrence_12f751ee47
    object Serializer : KSerializer<RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrence_12f751ee47> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrence_12f751ee47")
        override fun deserialize(decoder: Decoder): RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrence_12f751ee47 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrence_12f751ee47 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrence_12f751ee47>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("hourly")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D1_a467b0ed1c>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("weekly")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D2_ac7865b2a5>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("once")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D3_d1c4cb16ae>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("interval")))) { Option4(jsonDecoder.json.decodeFromJsonElement<RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D4_84ccfb83d8>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("cron")))) { Option5(jsonDecoder.json.decodeFromJsonElement<RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D5_0a49efe270>(element)) }
            return RemoteUnionCodec.single("RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrence_12f751ee47", matches)
        }
        override fun serialize(encoder: Encoder, value: RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrence_12f751ee47) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrence_12f751ee47 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D1_a467b0ed1c>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D2_ac7865b2a5>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D3_d1c4cb16ae>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D4_84ccfb83d8>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D5_0a49efe270>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItem_14f6b52f84(
    @SerialName("agentKind") val agentKind: String,
    @SerialName("automation") val automation: RemoteField<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshot_fdddba9ec6> = RemoteField.Missing,
    @SerialName("config") val config: RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DConfig_f69100925f,
    @SerialName("createdAt") val createdAt: String,
    @SerialName("enabled") val enabled: Boolean,
    @SerialName("id") val id: String,
    @SerialName("iterationCount") val iterationCount: RemoteField<Long> = RemoteField.Missing,
    @SerialName("lastCompletedAt") val lastCompletedAt: RemoteField<String>,
    @SerialName("lastError") val lastError: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("lastResult") val lastResult: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("lastRunAt") val lastRunAt: RemoteField<String>,
    @SerialName("lastStatus") val lastStatus: RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DLastStatus_aa5449703b,
    @SerialName("name") val name: String,
    @SerialName("nextRunAt") val nextRunAt: RemoteField<String>,
    @SerialName("projectId") val projectId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("prompt") val prompt: String,
    @SerialName("recurrence") val recurrence: RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrence_12f751ee47,
    @SerialName("updatedAt") val updatedAt: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("automation", "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshot_fdddba9ec6", false, false, null, null, null, null, null, null, null, null, listOf("schedule.automation")),
            RemoteFieldDescriptor("config", "RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DConfig_f69100925f", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("createdAt", "String", true, false, null, null, null, null, null, null, "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", "date-time", listOf()),
            RemoteFieldDescriptor("enabled", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("iterationCount", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastCompletedAt", "String", true, true, null, null, null, null, null, null, "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", "date-time", listOf()),
            RemoteFieldDescriptor("lastError", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastResult", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastRunAt", "String", true, true, null, null, null, null, null, null, "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", "date-time", listOf()),
            RemoteFieldDescriptor("lastStatus", "RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DLastStatus_aa5449703b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, 120, null, null, null, null, listOf("string.trim")),
            RemoteFieldDescriptor("nextRunAt", "String", true, true, null, null, null, null, null, null, "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", "date-time", listOf()),
            RemoteFieldDescriptor("projectId", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prompt", "String", true, false, null, null, 1, 50000, null, null, null, null, listOf("string.trim")),
            RemoteFieldDescriptor("recurrence", "RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrence_12f751ee47", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("updatedAt", "String", true, false, null, null, null, null, null, null, "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", "date-time", listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteautomationsU2DSnapshotResponse_6d3a7935ec(
    @SerialName("runs") val runs: List<RouteautomationsU2DSnapshotResponseU2DRunsU2DItem_38754692c8>,
    @SerialName("schedules") val schedules: List<RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItem_14f6b52f84>,
    @SerialName("unreadCount") val unreadCount: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("runs", "List<RouteautomationsU2DSnapshotResponseU2DRunsU2DItem_38754692c8>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("schedules", "List<RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItem_14f6b52f84>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("unreadCount", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutebrowserU2DCommandRequestU2DOptionU2D1U2DKind_0138c350a1 {
    @SerialName("create-tab") CREATEU2DTAB,
}

@Serializable
data class RoutebrowserU2DCommandRequestU2DOptionU2D1_3328521e00(
    @SerialName("kind") val kind: RoutebrowserU2DCommandRequestU2DOptionU2D1U2DKind_0138c350a1,
    @SerialName("url") val url: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutebrowserU2DCommandRequestU2DOptionU2D1U2DKind_0138c350a1", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutebrowserU2DCommandRequestU2DOptionU2D2U2DKind_3df0ab0b4e {
    @SerialName("close-tab") CLOSEU2DTAB,
}

@Serializable
data class RoutebrowserU2DCommandRequestU2DOptionU2D2_51f2acb99e(
    @SerialName("kind") val kind: RoutebrowserU2DCommandRequestU2DOptionU2D2U2DKind_3df0ab0b4e,
    @SerialName("tabId") val tabId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutebrowserU2DCommandRequestU2DOptionU2D2U2DKind_3df0ab0b4e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tabId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutebrowserU2DCommandRequestU2DOptionU2D3U2DKind_c39ba2db20 {
    @SerialName("activate-tab") ACTIVATEU2DTAB,
}

@Serializable
data class RoutebrowserU2DCommandRequestU2DOptionU2D3_483d5aa44f(
    @SerialName("kind") val kind: RoutebrowserU2DCommandRequestU2DOptionU2D3U2DKind_c39ba2db20,
    @SerialName("tabId") val tabId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutebrowserU2DCommandRequestU2DOptionU2D3U2DKind_c39ba2db20", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tabId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutebrowserU2DCommandRequestU2DOptionU2D4U2DKind_ed1865d937 {
    @SerialName("move-tab") MOVEU2DTAB,
}

@Serializable
enum class RoutebrowserU2DCommandRequestU2DOptionU2D4U2DPosition_3512bd687e {
    @SerialName("before") BEFORE,
    @SerialName("after") AFTER,
}

@Serializable
data class RoutebrowserU2DCommandRequestU2DOptionU2D4_875b3bd940(
    @SerialName("kind") val kind: RoutebrowserU2DCommandRequestU2DOptionU2D4U2DKind_ed1865d937,
    @SerialName("position") val position: RoutebrowserU2DCommandRequestU2DOptionU2D4U2DPosition_3512bd687e,
    @SerialName("tabId") val tabId: String,
    @SerialName("targetTabId") val targetTabId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutebrowserU2DCommandRequestU2DOptionU2D4U2DKind_ed1865d937", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("position", "RoutebrowserU2DCommandRequestU2DOptionU2D4U2DPosition_3512bd687e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tabId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("targetTabId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutebrowserU2DCommandRequestU2DOptionU2D5U2DKind_9063020a6c {
    @SerialName("navigate") NAVIGATE,
}

@Serializable
data class RoutebrowserU2DCommandRequestU2DOptionU2D5_290453f28a(
    @SerialName("kind") val kind: RoutebrowserU2DCommandRequestU2DOptionU2D5U2DKind_9063020a6c,
    @SerialName("tabId") val tabId: String,
    @SerialName("url") val url: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutebrowserU2DCommandRequestU2DOptionU2D5U2DKind_9063020a6c", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tabId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutebrowserU2DCommandRequestU2DOptionU2D6U2DKind_6801e053c0 {
    @SerialName("back") BACK,
}

@Serializable
data class RoutebrowserU2DCommandRequestU2DOptionU2D6_82fdb78988(
    @SerialName("kind") val kind: RoutebrowserU2DCommandRequestU2DOptionU2D6U2DKind_6801e053c0,
    @SerialName("tabId") val tabId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutebrowserU2DCommandRequestU2DOptionU2D6U2DKind_6801e053c0", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tabId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutebrowserU2DCommandRequestU2DOptionU2D7U2DKind_3e68ba0d03 {
    @SerialName("forward") FORWARD,
}

@Serializable
data class RoutebrowserU2DCommandRequestU2DOptionU2D7_500ee37993(
    @SerialName("kind") val kind: RoutebrowserU2DCommandRequestU2DOptionU2D7U2DKind_3e68ba0d03,
    @SerialName("tabId") val tabId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutebrowserU2DCommandRequestU2DOptionU2D7U2DKind_3e68ba0d03", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tabId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutebrowserU2DCommandRequestU2DOptionU2D8U2DKind_41be750b56 {
    @SerialName("reload") RELOAD,
}
