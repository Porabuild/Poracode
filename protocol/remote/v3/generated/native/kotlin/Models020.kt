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

typealias RoutescheduleU2DRunsU2DReadResponseU2DRunsU2DItemU2DCompletedAt_595da89b21 = String?

@Serializable
enum class RoutescheduleU2DRunsU2DReadResponseU2DRunsU2DItemU2DStatus_d21b71d44d {
    @SerialName("running") RUNNING,
    @SerialName("succeeded") SUCCEEDED,
    @SerialName("failed") FAILED,
    @SerialName("interrupted") INTERRUPTED,
}

@Serializable
data class RoutescheduleU2DRunsU2DReadResponseU2DRunsU2DItem_e5ba6e7ba5(
    @SerialName("completedAt") val completedAt: RemoteField<String>,
    @SerialName("error") val error: RemoteField<String>,
    @SerialName("id") val id: String,
    @SerialName("scheduleId") val scheduleId: String,
    @SerialName("startedAt") val startedAt: String,
    @SerialName("status") val status: RoutescheduleU2DRunsU2DReadResponseU2DRunsU2DItemU2DStatus_d21b71d44d,
    @SerialName("summary") val summary: RemoteField<String>,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("completedAt", "String", true, true, null, null, null, null, null, null, "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", "date-time", listOf()),
            RemoteFieldDescriptor("error", "String", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("scheduleId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("startedAt", "String", true, false, null, null, null, null, null, null, "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", "date-time", listOf()),
            RemoteFieldDescriptor("status", "RoutescheduleU2DRunsU2DReadResponseU2DRunsU2DItemU2DStatus_d21b71d44d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("summary", "String", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutescheduleU2DRunsU2DReadResponse_dc9dbbe080(
    @SerialName("runs") val runs: List<RoutescheduleU2DRunsU2DReadResponseU2DRunsU2DItem_e5ba6e7ba5>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("runs", "List<RoutescheduleU2DRunsU2DReadResponseU2DRunsU2DItem_e5ba6e7ba5>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D1U2DKind_6f5933af03 {
    @SerialName("hourly") HOURLY,
}

@Serializable
data class RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D1_a467b0ed1c(
    @SerialName("kind") val kind: RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D1U2DKind_6f5933af03,
    @SerialName("minute") val minute: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D1U2DKind_6f5933af03", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("minute", "Long", true, false, 0.0, 59.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D2U2DKind_475f91db7d {
    @SerialName("weekly") WEEKLY,
}

@Serializable
data class RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D2_056ce41be8(
    @SerialName("days") val days: List<Long>,
    @SerialName("kind") val kind: RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D2U2DKind_475f91db7d,
    @SerialName("time") val time: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("days", "List<Long>", true, false, null, null, null, null, 1, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D2U2DKind_475f91db7d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("time", "String", true, false, null, null, null, null, null, null, "^([01]\\d|2[0-3]):[0-5]\\d$", null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D3U2DKind_e5ee0a0722 {
    @SerialName("once") ONCE,
}

@Serializable
data class RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D3_d1c4cb16ae(
    @SerialName("kind") val kind: RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D3U2DKind_e5ee0a0722,
    @SerialName("runAt") val runAt: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D3U2DKind_e5ee0a0722", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runAt", "String", true, false, null, null, null, null, null, null, "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", "date-time", listOf()),
        ), listOf())
    }
}

@Serializable(with = RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_370441a9f9.Serializer::class)
sealed interface RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_370441a9f9 {
    data class Option1(val value: RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D1_a467b0ed1c) : RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_370441a9f9
    data class Option2(val value: RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D2_056ce41be8) : RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_370441a9f9
    data class Option3(val value: RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D3_d1c4cb16ae) : RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_370441a9f9
    object Serializer : KSerializer<RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_370441a9f9> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_370441a9f9")
        override fun deserialize(decoder: Decoder): RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_370441a9f9 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_370441a9f9 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_370441a9f9>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("hourly")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D1_a467b0ed1c>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("weekly")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D2_056ce41be8>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("once")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D3_d1c4cb16ae>(element)) }
            return RemoteUnionCodec.single("RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_370441a9f9", matches)
        }
        override fun serialize(encoder: Encoder, value: RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_370441a9f9) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_370441a9f9 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D1_a467b0ed1c>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D2_056ce41be8>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D3_d1c4cb16ae>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTask_4529714695(
    @SerialName("agentKind") val agentKind: String,
    @SerialName("config") val config: RouteprU2DWatchU2DAgentU2DSyncRequestU2DConfig_048d1517dd,
    @SerialName("enabled") val enabled: Boolean,
    @SerialName("name") val name: String,
    @SerialName("projectId") val projectId: RemoteField<String> = RemoteField.Missing,
    @SerialName("prompt") val prompt: String,
    @SerialName("recurrence") val recurrence: RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_370441a9f9,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("config", "RouteprU2DWatchU2DAgentU2DSyncRequestU2DConfig_048d1517dd", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("enabled", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, 120, null, null, null, null, listOf("string.trim")),
            RemoteFieldDescriptor("projectId", "String", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prompt", "String", true, false, null, null, 1, 50000, null, null, null, null, listOf("string.trim")),
            RemoteFieldDescriptor("recurrence", "RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_370441a9f9", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteschedulesU2DCommandRequestU2DOptionU2D1_0b430722c6(
    @SerialName("kind") val kind: RouteprojectU2DCommandRequestU2DOptionU2D2U2DKind_1f45188862,
    @SerialName("task") val task: RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTask_4529714695,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteprojectU2DCommandRequestU2DOptionU2D2U2DKind_1f45188862", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("task", "RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTask_4529714695", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteschedulesU2DCommandRequestU2DOptionU2D2_9278450827(
    @SerialName("id") val id: String,
    @SerialName("kind") val kind: RouteprojectU2DCommandRequestU2DOptionU2D4U2DKind_cbc64d1458,
    @SerialName("task") val task: RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTask_4529714695,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("kind", "RouteprojectU2DCommandRequestU2DOptionU2D4U2DKind_cbc64d1458", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("task", "RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTask_4529714695", true, false, null, null, null, null, null, null, null, null, listOf()),
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
    @SerialName("lastError") val lastError: RemoteField<String>,
    @SerialName("lastResult") val lastResult: RemoteField<String>,
    @SerialName("lastRunAt") val lastRunAt: RemoteField<String>,
    @SerialName("lastStatus") val lastStatus: RouteschedulesU2DCommandResponseU2DScheduleU2DLastStatus_aafa839556,
    @SerialName("name") val name: String,
    @SerialName("nextRunAt") val nextRunAt: RemoteField<String>,
    @SerialName("projectId") val projectId: RemoteField<String> = RemoteField.Missing,
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
            RemoteFieldDescriptor("lastError", "String", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastResult", "String", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastRunAt", "String", true, true, null, null, null, null, null, null, "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", "date-time", listOf()),
            RemoteFieldDescriptor("lastStatus", "RouteschedulesU2DCommandResponseU2DScheduleU2DLastStatus_aafa839556", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, 120, null, null, null, null, listOf("string.trim")),
            RemoteFieldDescriptor("nextRunAt", "String", true, true, null, null, null, null, null, null, "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", "date-time", listOf()),
            RemoteFieldDescriptor("projectId", "String", false, true, null, null, null, null, null, null, null, null, listOf()),
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

@Serializable
enum class RoutesettingsU2DReadResponseU2DSettingsU2DDisabledBuiltInMcpServersU2DPropertyU2DName_13f43aaaf5 {
    @SerialName("browser") BROWSER,
    @SerialName("crossagents") CROSSAGENTS,
    @SerialName("chrome") CHROME,
    @SerialName("computer-use") COMPUTERU2DUSE,
    @SerialName("app-controls") APPU2DCONTROLS,
}

typealias RoutesettingsU2DReadResponseU2DSettingsU2DDisabledBuiltInMcpServers_65899fb957 = Map<String, Boolean>

typealias RoutesettingsU2DReadResponseU2DSettingsU2DEnabledMcpServers_2d677fb041 = Map<String, Boolean>

@Serializable
enum class RoutesettingsU2DReadResponseU2DSettingsU2DFollowUpBehavior_6fcb1a55c0 {
    @SerialName("steer") STEER,
    @SerialName("queue") QUEUE,
}

typealias RoutesettingsU2DReadResponseU2DSettingsU2DHiddenModels_86d5d72e84 = Map<String, List<String>>

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
    @SerialName("collapsedProviders") val collapsedProviders: List<String>,
    @SerialName("disabledProviders") val disabledProviders: List<String>,
    @SerialName("providerOrder") val providerOrder: List<String>,
    @SerialName("providerRefreshIntervals") val providerRefreshIntervals: RoutesettingsU2DReadResponseU2DSettingsU2DUsageU2DProviderRefreshIntervals_ea08f63f22,
    @SerialName("refreshIntervalMinutes") val refreshIntervalMinutes: Long,
    @SerialName("selectedRingGroups") val selectedRingGroups: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986,
    @SerialName("showEstimatedCost") val showEstimatedCost: Boolean,
    @SerialName("showInSidebar") val showInSidebar: Boolean,
    @SerialName("sidebarHiddenProviders") val sidebarHiddenProviders: List<String>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("autoRefresh", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("collapsedProviders", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledProviders", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerOrder", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerRefreshIntervals", "RoutesettingsU2DReadResponseU2DSettingsU2DUsageU2DProviderRefreshIntervals_ea08f63f22", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("refreshIntervalMinutes", "Long", true, false, 2.0, 120.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("selectedRingGroups", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("showEstimatedCost", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("showInSidebar", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sidebarHiddenProviders", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
