// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
typealias RoutepushU2DRegisterRequestU2DWebPushSubscriptionU2DExpirationTime_60e901bdbc = Long?

@Serializable
data class RoutepushU2DRegisterRequestU2DWebPushSubscriptionU2DKeys_29fba8fe9f(
    @SerialName("auth") val auth: String,
    @SerialName("p256dh") val p256dh: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("auth", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("p256dh", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutepushU2DRegisterRequestU2DWebPushSubscription_fd8574a70c(
    @SerialName("endpoint") val endpoint: String,
    @SerialName("expirationTime") val expirationTime: RemoteField<Long>,
    @SerialName("keys") val keys: RoutepushU2DRegisterRequestU2DWebPushSubscriptionU2DKeys_29fba8fe9f,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("endpoint", "String", true, false, null, null, null, null, null, null, null, "uri", listOf("push.web.endpoint-https")),
            RemoteFieldDescriptor("expirationTime", "Long", true, true, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("keys", "RoutepushU2DRegisterRequestU2DWebPushSubscriptionU2DKeys_29fba8fe9f", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutepushU2DRegisterRequest_98c9ef3e40(
    @SerialName("activityTokens") val activityTokens: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DSessionRuntimeRoutingU2DPrefixes_b84e449d1a> = RemoteField.Missing,
    @SerialName("alertPreferences") val alertPreferences: RemoteField<RoutepushU2DRegisterRequestU2DAlertPreferences_0534fb6201> = RemoteField.Missing,
    @SerialName("appVersion") val appVersion: RemoteField<String> = RemoteField.Missing,
    @SerialName("deviceId") val deviceId: String,
    @SerialName("deviceToken") val deviceToken: RemoteField<String> = RemoteField.Missing,
    @SerialName("platform") val platform: RoutepushU2DRegisterRequestU2DPlatform_41d0cf6897,
    @SerialName("pushToStartToken") val pushToStartToken: RemoteField<String> = RemoteField.Missing,
    @SerialName("routing") val routing: RemoteField<RoutepushU2DRegisterRequestU2DRouting_a90fffdae1> = RemoteField.Missing,
    @SerialName("webAppBasePath") val webAppBasePath: RemoteField<String> = RemoteField.Missing,
    @SerialName("webPushSubscription") val webPushSubscription: RemoteField<RoutepushU2DRegisterRequestU2DWebPushSubscription_fd8574a70c> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("activityTokens", "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DSessionRuntimeRoutingU2DPrefixes_b84e449d1a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("alertPreferences", "RoutepushU2DRegisterRequestU2DAlertPreferences_0534fb6201", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("appVersion", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("deviceId", "String", true, false, null, null, 8, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("deviceToken", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("platform", "RoutepushU2DRegisterRequestU2DPlatform_41d0cf6897", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pushToStartToken", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("routing", "RoutepushU2DRegisterRequestU2DRouting_a90fffdae1", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("webAppBasePath", "String", false, false, null, null, null, null, null, null, "^\\/(?!\\/)(?:[^?#]*)$", null, listOf()),
            RemoteFieldDescriptor("webPushSubscription", "RoutepushU2DRegisterRequestU2DWebPushSubscription_fd8574a70c", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf("push.registration.platform-fields"))
    }
}

@Serializable
data class RoutepushU2DRegisterResponseU2DRouting_fe73ac6ba6(
    @SerialName("version") val version: ProcedurecreateRevertAnchorResultU2DAnchorU2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("version", "ProcedurecreateRevertAnchorResultU2DAnchorU2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutepushU2DRegisterResponse_9633843f8b(
    @SerialName("ok") val ok: ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1,
    @SerialName("routing") val routing: RemoteField<RoutepushU2DRegisterResponseU2DRouting_fe73ac6ba6> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("ok", "ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("routing", "RoutepushU2DRegisterResponseU2DRouting_fe73ac6ba6", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutepushU2DUnregisterRequest_8f934fd77b(
    @SerialName("deviceId") val deviceId: String,
    @SerialName("routing") val routing: RemoteField<RoutepushU2DRegisterRequestU2DRouting_a90fffdae1> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("deviceId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("routing", "RoutepushU2DRegisterRequestU2DRouting_a90fffdae1", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RouterequestU2DResolveRequestU2DRequestId_a44865d83b.Serializer::class)
sealed interface RouterequestU2DResolveRequestU2DRequestId_a44865d83b {
    data class Option1(val value: String) : RouterequestU2DResolveRequestU2DRequestId_a44865d83b
    data class Option2(val value: Double) : RouterequestU2DResolveRequestU2DRequestId_a44865d83b
    object Serializer : KSerializer<RouterequestU2DResolveRequestU2DRequestId_a44865d83b> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouterequestU2DResolveRequestU2DRequestId_a44865d83b")
        override fun deserialize(decoder: Decoder): RouterequestU2DResolveRequestU2DRequestId_a44865d83b {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouterequestU2DResolveRequestU2DRequestId_a44865d83b supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouterequestU2DResolveRequestU2DRequestId_a44865d83b>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesString(element, minLength = 1)) { Option1(jsonDecoder.json.decodeFromJsonElement<String>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesNumber(element, integer = false)) { Option2(jsonDecoder.json.decodeFromJsonElement<Double>(element)) }
            return RemoteUnionCodec.first("RouterequestU2DResolveRequestU2DRequestId_a44865d83b", matches)
        }
        override fun serialize(encoder: Encoder, value: RouterequestU2DResolveRequestU2DRequestId_a44865d83b) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouterequestU2DResolveRequestU2DRequestId_a44865d83b supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<String>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<Double>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class RouterequestU2DResolveRequest_3df8195e90(
    @SerialName("method") val method: String,
    @SerialName("requestId") val requestId: RouterequestU2DResolveRequestU2DRequestId_a44865d83b,
    @SerialName("response") val response: JsonElement,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("method", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("requestId", "RouterequestU2DResolveRequestU2DRequestId_a44865d83b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("response", "JsonElement", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteruntimeU2DImagePath_815909fa96(
    @SerialName("itemId") val itemId: String,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("itemId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce.Serializer::class)
sealed interface RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce {
    data class Option1(val value: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b) : RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce
    data class Option2(val value: Long) : RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce
    object Serializer : KSerializer<RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce")
        override fun deserialize(decoder: Decoder): RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesString(element)) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesNumber(element, integer = true, minimum = -9007199254740991.0, maximum = 9007199254740991.0)) { Option2(jsonDecoder.json.decodeFromJsonElement<Long>(element)) }
            return RemoteUnionCodec.first("RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce", matches)
        }
        override fun serialize(encoder: Encoder, value: RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<Long>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class RouteruntimeU2DImageQuery_1de2de5621(
    @SerialName("path") val path: List<RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce>,
    @SerialName("ticket") val ticket: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("path", "List<RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce>", true, false, null, null, null, null, 1, 8, null, null, listOf()),
            RemoteFieldDescriptor("ticket", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

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
    @SerialName("error") val error: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("id") val id: String,
    @SerialName("scheduleId") val scheduleId: String,
    @SerialName("startedAt") val startedAt: String,
    @SerialName("status") val status: RoutescheduleU2DRunsU2DReadResponseU2DRunsU2DItemU2DStatus_d21b71d44d,
    @SerialName("summary") val summary: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("completedAt", "String", true, true, null, null, null, null, null, null, "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", "date-time", listOf()),
            RemoteFieldDescriptor("error", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("scheduleId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("startedAt", "String", true, false, null, null, null, null, null, null, "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", "date-time", listOf()),
            RemoteFieldDescriptor("status", "RoutescheduleU2DRunsU2DReadResponseU2DRunsU2DItemU2DStatus_d21b71d44d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("summary", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, true, null, null, null, null, null, null, null, null, listOf()),
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
    @SerialName("projectId") val projectId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("prompt") val prompt: String,
    @SerialName("recurrence") val recurrence: RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_370441a9f9,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("config", "RouteprU2DWatchU2DAgentU2DSyncRequestU2DConfig_048d1517dd", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("enabled", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, 120, null, null, null, null, listOf("string.trim")),
            RemoteFieldDescriptor("projectId", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, true, null, null, null, null, null, null, null, null, listOf()),
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
