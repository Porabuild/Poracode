// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
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
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
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
enum class RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D1U2DKind_ffc64b31e0 {
    @SerialName("update-state") UPDATEU2DSTATE,
}

@Serializable
data class RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D1U2DPayload_626f8596f7(
    @SerialName("archived") val archived: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("unread") val unread: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("archived", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("unread", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf("schedule.run-state"))
    }
}

@Serializable
data class RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D1_e510e581c4(
    @SerialName("kind") val kind: RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D1U2DKind_ffc64b31e0,
    @SerialName("payload") val payload: RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D1U2DPayload_626f8596f7,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D1U2DKind_ffc64b31e0", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("payload", "RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D1U2DPayload_626f8596f7", true, false, null, null, null, null, null, null, null, null, listOf("schedule.run-state")),
        ), listOf())
    }
}

@Serializable
enum class RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D2U2DKind_482c928271 {
    @SerialName("cancel") CANCEL,
}

@Serializable
data class RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D2_77c71c7315(
    @SerialName("id") val id: String,
    @SerialName("kind") val kind: RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D2U2DKind_482c928271,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("kind", "RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D2U2DKind_482c928271", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RoutescheduleU2DRunU2DCommandRequest_c4921dbeb3.Serializer::class)
sealed interface RoutescheduleU2DRunU2DCommandRequest_c4921dbeb3 {
    data class Option1(val value: RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D1_e510e581c4) : RoutescheduleU2DRunU2DCommandRequest_c4921dbeb3
    data class Option2(val value: RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D2_77c71c7315) : RoutescheduleU2DRunU2DCommandRequest_c4921dbeb3
    object Serializer : KSerializer<RoutescheduleU2DRunU2DCommandRequest_c4921dbeb3> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutescheduleU2DRunU2DCommandRequest_c4921dbeb3")
        override fun deserialize(decoder: Decoder): RoutescheduleU2DRunU2DCommandRequest_c4921dbeb3 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutescheduleU2DRunU2DCommandRequest_c4921dbeb3 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutescheduleU2DRunU2DCommandRequest_c4921dbeb3>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("update-state")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D1_e510e581c4>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("cancel")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D2_77c71c7315>(element)) }
            return RemoteUnionCodec.single("RoutescheduleU2DRunU2DCommandRequest_c4921dbeb3", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutescheduleU2DRunU2DCommandRequest_c4921dbeb3) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutescheduleU2DRunU2DCommandRequest_c4921dbeb3 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D1_e510e581c4>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D2_77c71c7315>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

typealias RoutescheduleU2DRunU2DCommandResponseU2DRun_b6411354a3 = RouteautomationsU2DSnapshotResponseU2DRunsU2DItem_38754692c8?

@Serializable
data class RoutescheduleU2DRunU2DCommandResponse_6f4c2b2449(
    @SerialName("cancelled") val cancelled: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("run") val run: RemoteField<RouteautomationsU2DSnapshotResponseU2DRunsU2DItem_38754692c8> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cancelled", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("run", "RouteautomationsU2DSnapshotResponseU2DRunsU2DItem_38754692c8", false, true, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutescheduleU2DRunU2DInboxResponse_d9b927ff80(
    @SerialName("runs") val runs: List<RouteautomationsU2DSnapshotResponseU2DRunsU2DItem_38754692c8>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("runs", "List<RouteautomationsU2DSnapshotResponseU2DRunsU2DItem_38754692c8>", true, false, null, null, null, null, null, null, null, null, listOf()),
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
