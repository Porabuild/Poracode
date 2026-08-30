// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
enum class RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DIdU2DOptionU2D1_9fef93fbe5 {
    @SerialName("session-5h") SESSIONU2D5H,
    @SerialName("weekly") WEEKLY,
    @SerialName("weekly-opus") WEEKLYU2DOPUS,
    @SerialName("weekly-sonnet") WEEKLYU2DSONNET,
    @SerialName("weekly-fable") WEEKLYU2DFABLE,
    @SerialName("monthly") MONTHLY,
    @SerialName("extra-usage") EXTRAU2DUSAGE,
    @SerialName("cursor-auto") CURSORU2DAUTO,
    @SerialName("cursor-api") CURSORU2DAPI,
}

@Serializable(with = RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_7be168d0c0.Serializer::class)
sealed interface RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_7be168d0c0 {
    data class Option1(val value: RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DIdU2DOptionU2D1_9fef93fbe5) : RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_7be168d0c0
    data class Option2(val value: String) : RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_7be168d0c0
    data class Option3(val value: String) : RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_7be168d0c0
    data class Option4(val value: String) : RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_7be168d0c0
    data class Option5(val value: String) : RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_7be168d0c0
    object Serializer : KSerializer<RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_7be168d0c0> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_7be168d0c0")
        override fun deserialize(decoder: Decoder): RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_7be168d0c0 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_7be168d0c0 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_7be168d0c0>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesString(element, literals = listOf(JsonPrimitive("session-5h"), JsonPrimitive("weekly"), JsonPrimitive("weekly-opus"), JsonPrimitive("weekly-sonnet"), JsonPrimitive("weekly-fable"), JsonPrimitive("monthly"), JsonPrimitive("extra-usage"), JsonPrimitive("cursor-auto"), JsonPrimitive("cursor-api")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DIdU2DOptionU2D1_9fef93fbe5>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesString(element, pattern = "^gemini:.+")) { Option2(jsonDecoder.json.decodeFromJsonElement<String>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesString(element, pattern = "^codex:.+")) { Option3(jsonDecoder.json.decodeFromJsonElement<String>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesString(element, pattern = "^antigravity:.+")) { Option4(jsonDecoder.json.decodeFromJsonElement<String>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesString(element, pattern = "^factory:.+")) { Option5(jsonDecoder.json.decodeFromJsonElement<String>(element)) }
            return RemoteUnionCodec.first("RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_7be168d0c0", matches)
        }
        override fun serialize(encoder: Encoder, value: RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_7be168d0c0) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_7be168d0c0 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DIdU2DOptionU2D1_9fef93fbe5>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<String>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<String>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<String>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<String>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DUnit_c263982707 {
    @SerialName("percent") PERCENT,
    @SerialName("tokens") TOKENS,
    @SerialName("requests") REQUESTS,
    @SerialName("credits") CREDITS,
    @SerialName("usd") USD,
}

@Serializable
data class RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItem_ab58da84ea(
    @SerialName("currency") val currency: RemoteField<String> = RemoteField.Missing,
    @SerialName("id") val id: RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_7be168d0c0,
    @SerialName("label") val label: String,
    @SerialName("limit") val limit: RemoteField<Double> = RemoteField.Missing,
    @SerialName("resetsAt") val resetsAt: RemoteField<Long> = RemoteField.Missing,
    @SerialName("unit") val unit: RemoteField<RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DUnit_c263982707> = RemoteField.Missing,
    @SerialName("used") val used: RemoteField<Double> = RemoteField.Missing,
    @SerialName("usedPercent") val usedPercent: Double,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("currency", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_7be168d0c0", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("limit", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("resetsAt", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("unit", "RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DUnit_c263982707", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("used", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("usedPercent", "Double", true, false, 0.0, 100.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteproviderU2DUsageResponseU2DSnapshotsU2DItem_33b08544c9(
    @SerialName("authenticatedAs") val authenticatedAs: RemoteField<String> = RemoteField.Missing,
    @SerialName("cost") val cost: RemoteField<RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCost_4147389dac> = RemoteField.Missing,
    @SerialName("credits") val credits: RemoteField<RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCredits_a39dd04104> = RemoteField.Missing,
    @SerialName("error") val error: RemoteField<String> = RemoteField.Missing,
    @SerialName("fetchedAt") val fetchedAt: Long,
    @SerialName("plan") val plan: RemoteField<String> = RemoteField.Missing,
    @SerialName("providerId") val providerId: String,
    @SerialName("rateLimitedUntil") val rateLimitedUntil: RemoteField<Long> = RemoteField.Missing,
    @SerialName("status") val status: RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DStatus_3466b9b69c,
    @SerialName("tokens") val tokens: RemoteField<RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DTokens_36a14ea6cf> = RemoteField.Missing,
    @SerialName("windows") val windows: List<RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItem_ab58da84ea>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("authenticatedAs", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("cost", "RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCost_4147389dac", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("credits", "RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCredits_a39dd04104", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("error", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fetchedAt", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("plan", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("rateLimitedUntil", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DStatus_3466b9b69c", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tokens", "RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DTokens_36a14ea6cf", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("windows", "List<RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItem_ab58da84ea>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteproviderU2DUsageResponse_e3d7559a78(
    @SerialName("fromCache") val fromCache: Boolean,
    @SerialName("snapshots") val snapshots: List<RouteproviderU2DUsageResponseU2DSnapshotsU2DItem_33b08544c9>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("fromCache", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("snapshots", "List<RouteproviderU2DUsageResponseU2DSnapshotsU2DItem_33b08544c9>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutepushU2DConfigResponse_f0c513c014(
    @SerialName("publicKey") val publicKey: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("publicKey", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutepushU2DRegisterRequestU2DAlertPreferencesU2DStatuses_72130deafa(
    @SerialName("done") val done: Boolean,
    @SerialName("error") val error: Boolean,
    @SerialName("needsAttention") val needsAttention: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("done", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("error", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("needsAttention", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutepushU2DRegisterRequestU2DAlertPreferences_0534fb6201(
    @SerialName("sound") val sound: Boolean,
    @SerialName("statuses") val statuses: RoutepushU2DRegisterRequestU2DAlertPreferencesU2DStatuses_72130deafa,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("sound", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("statuses", "RoutepushU2DRegisterRequestU2DAlertPreferencesU2DStatuses_72130deafa", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutepushU2DRegisterRequestU2DPlatform_41d0cf6897 {
    @SerialName("ios") IOS,
    @SerialName("android") ANDROID,
    @SerialName("web") WEB,
}

@Serializable
data class RoutepushU2DRegisterRequestU2DRouting_a90fffdae1(
    @SerialName("clientConnectionId") val clientConnectionId: String,
    @SerialName("desktopId") val desktopId: String,
    @SerialName("version") val version: RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D2_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("clientConnectionId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("desktopId", "String", true, false, null, null, 1, 512, null, null, null, null, listOf("push.routing.identifier-no-controls")),
            RemoteFieldDescriptor("version", "RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D2_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

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
    @SerialName("version") val version: RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D2_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("version", "RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D2_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutepushU2DRegisterResponse_9633843f8b(
    @SerialName("ok") val ok: RouteportU2DUnforwardResponseU2DOk_d2dd3595e1,
    @SerialName("routing") val routing: RemoteField<RoutepushU2DRegisterResponseU2DRouting_fe73ac6ba6> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("ok", "RouteportU2DUnforwardResponseU2DOk_d2dd3595e1", true, false, null, null, null, null, null, null, null, null, listOf()),
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

@Serializable
data class RouterequestU2DResolvePath_09b78d9c1d(
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
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
    data class Option1(val value: String) : RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce
    data class Option2(val value: Long) : RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce
    object Serializer : KSerializer<RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce")
        override fun deserialize(decoder: Decoder): RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesString(element)) { Option1(jsonDecoder.json.decodeFromJsonElement<String>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesNumber(element, integer = true, minimum = -9007199254740991.0, maximum = 9007199254740991.0)) { Option2(jsonDecoder.json.decodeFromJsonElement<Long>(element)) }
            return RemoteUnionCodec.first("RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce", matches)
        }
        override fun serialize(encoder: Encoder, value: RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<String>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<Long>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class RouteruntimeU2DImageQuery_1dbbfc3a2e(
    @SerialName("access_token") val accessU5FToken: RemoteField<String> = RemoteField.Missing,
    @SerialName("path") val path: List<RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("access_token", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "List<RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce>", true, false, null, null, null, null, 1, 8, null, null, listOf()),
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

typealias RoutescheduleU2DRunsU2DReadResponseU2DRunsU2DItemU2DCompletedAt_01f7df3e67 = String?

@Serializable
enum class RoutescheduleU2DRunsU2DReadResponseU2DRunsU2DItemU2DStatus_d21b71d44d {
    @SerialName("running") RUNNING,
    @SerialName("succeeded") SUCCEEDED,
    @SerialName("failed") FAILED,
    @SerialName("interrupted") INTERRUPTED,
}

@Serializable
data class RoutescheduleU2DRunsU2DReadResponseU2DRunsU2DItem_b0c6bfbd3c(
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
            RemoteFieldDescriptor("completedAt", "String", true, true, null, null, null, null, null, null, "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$", "date-time", listOf()),
            RemoteFieldDescriptor("error", "String", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("scheduleId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("startedAt", "String", true, false, null, null, null, null, null, null, "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$", "date-time", listOf()),
            RemoteFieldDescriptor("status", "RoutescheduleU2DRunsU2DReadResponseU2DRunsU2DItemU2DStatus_d21b71d44d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("summary", "String", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutescheduleU2DRunsU2DReadResponse_7b9ef525e5(
    @SerialName("runs") val runs: List<RoutescheduleU2DRunsU2DReadResponseU2DRunsU2DItem_b0c6bfbd3c>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("runs", "List<RoutescheduleU2DRunsU2DReadResponseU2DRunsU2DItem_b0c6bfbd3c>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
