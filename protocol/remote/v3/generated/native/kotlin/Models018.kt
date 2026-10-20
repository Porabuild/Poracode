// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable(with = RoutebrowserU2DCommandRequest_80a9ff940d.Serializer::class)
sealed interface RoutebrowserU2DCommandRequest_80a9ff940d {
    data class Option1(val value: RoutebrowserU2DCommandRequestU2DOptionU2D1_3328521e00) : RoutebrowserU2DCommandRequest_80a9ff940d
    data class Option2(val value: RoutebrowserU2DCommandRequestU2DOptionU2D2_51f2acb99e) : RoutebrowserU2DCommandRequest_80a9ff940d
    data class Option3(val value: RoutebrowserU2DCommandRequestU2DOptionU2D3_483d5aa44f) : RoutebrowserU2DCommandRequest_80a9ff940d
    data class Option4(val value: RoutebrowserU2DCommandRequestU2DOptionU2D4_875b3bd940) : RoutebrowserU2DCommandRequest_80a9ff940d
    data class Option5(val value: RoutebrowserU2DCommandRequestU2DOptionU2D5_290453f28a) : RoutebrowserU2DCommandRequest_80a9ff940d
    data class Option6(val value: RoutebrowserU2DCommandRequestU2DOptionU2D6_82fdb78988) : RoutebrowserU2DCommandRequest_80a9ff940d
    data class Option7(val value: RoutebrowserU2DCommandRequestU2DOptionU2D7_500ee37993) : RoutebrowserU2DCommandRequest_80a9ff940d
    data class Option8(val value: RoutebrowserU2DCommandRequestU2DOptionU2D8_22c8bcdab9) : RoutebrowserU2DCommandRequest_80a9ff940d
    object Serializer : KSerializer<RoutebrowserU2DCommandRequest_80a9ff940d> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutebrowserU2DCommandRequest_80a9ff940d")
        override fun deserialize(decoder: Decoder): RoutebrowserU2DCommandRequest_80a9ff940d {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutebrowserU2DCommandRequest_80a9ff940d supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutebrowserU2DCommandRequest_80a9ff940d>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("create-tab")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutebrowserU2DCommandRequestU2DOptionU2D1_3328521e00>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("close-tab")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RoutebrowserU2DCommandRequestU2DOptionU2D2_51f2acb99e>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("activate-tab")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RoutebrowserU2DCommandRequestU2DOptionU2D3_483d5aa44f>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("move-tab")))) { Option4(jsonDecoder.json.decodeFromJsonElement<RoutebrowserU2DCommandRequestU2DOptionU2D4_875b3bd940>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("navigate")))) { Option5(jsonDecoder.json.decodeFromJsonElement<RoutebrowserU2DCommandRequestU2DOptionU2D5_290453f28a>(element)) }
            RemoteUnionCodec.tryOption(matches, 6, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("back")))) { Option6(jsonDecoder.json.decodeFromJsonElement<RoutebrowserU2DCommandRequestU2DOptionU2D6_82fdb78988>(element)) }
            RemoteUnionCodec.tryOption(matches, 7, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("forward")))) { Option7(jsonDecoder.json.decodeFromJsonElement<RoutebrowserU2DCommandRequestU2DOptionU2D7_500ee37993>(element)) }
            RemoteUnionCodec.tryOption(matches, 8, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("reload")))) { Option8(jsonDecoder.json.decodeFromJsonElement<RoutebrowserU2DCommandRequestU2DOptionU2D8_22c8bcdab9>(element)) }
            return RemoteUnionCodec.single("RoutebrowserU2DCommandRequest_80a9ff940d", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutebrowserU2DCommandRequest_80a9ff940d) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutebrowserU2DCommandRequest_80a9ff940d supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutebrowserU2DCommandRequestU2DOptionU2D1_3328521e00>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RoutebrowserU2DCommandRequestU2DOptionU2D2_51f2acb99e>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RoutebrowserU2DCommandRequestU2DOptionU2D3_483d5aa44f>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<RoutebrowserU2DCommandRequestU2DOptionU2D4_875b3bd940>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<RoutebrowserU2DCommandRequestU2DOptionU2D5_290453f28a>(value.value)
                is Option6 -> jsonEncoder.json.encodeToJsonElement<RoutebrowserU2DCommandRequestU2DOptionU2D6_82fdb78988>(value.value)
                is Option7 -> jsonEncoder.json.encodeToJsonElement<RoutebrowserU2DCommandRequestU2DOptionU2D7_500ee37993>(value.value)
                is Option8 -> jsonEncoder.json.encodeToJsonElement<RoutebrowserU2DCommandRequestU2DOptionU2D8_22c8bcdab9>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class RoutebrowserU2DCommandResponseU2DStateU2DTabsU2DItem_7a4831c3c0(
    @SerialName("canGoBack") val canGoBack: Boolean,
    @SerialName("canGoForward") val canGoForward: Boolean,
    @SerialName("faviconUrl") val faviconUrl: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("loading") val loading: Boolean,
    @SerialName("tabId") val tabId: String,
    @SerialName("title") val title: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("url") val url: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("canGoBack", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("canGoForward", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("faviconUrl", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("loading", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tabId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutebrowserU2DCommandResponseU2DState_ecc6edb616(
    @SerialName("activeTabId") val activeTabId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("tabs") val tabs: List<RoutebrowserU2DCommandResponseU2DStateU2DTabsU2DItem_7a4831c3c0>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("activeTabId", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tabs", "List<RoutebrowserU2DCommandResponseU2DStateU2DTabsU2DItem_7a4831c3c0>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutebrowserU2DCommandResponse_1b7f16955d(
    @SerialName("state") val state: RoutebrowserU2DCommandResponseU2DState_ecc6edb616,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("state", "RoutebrowserU2DCommandResponseU2DState_ecc6edb616", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutecatalogU2DMembershipRequest_2b8805d864(
    @SerialName("projectIds") val projectIds: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("threadIds") val threadIds: RemoteField<List<String>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("projectIds", "List<String>", false, false, null, null, null, null, null, 200, null, null, listOf()),
            RemoteFieldDescriptor("threadIds", "List<String>", false, false, null, null, null, null, null, 200, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutecatalogU2DMembershipResponse_afbf6761fa(
    @SerialName("existingProjectIds") val existingProjectIds: List<String>,
    @SerialName("existingThreadIds") val existingThreadIds: List<String>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("existingProjectIds", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("existingThreadIds", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutedeviceU2DActionPath_eef64882a7(
    @SerialName("sessionId") val sessionId: String,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("sessionId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D1U2DKind_ef917452dc {
    @SerialName("tap") TAP,
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D1_6ddf4b7dc1(
    @SerialName("frameId") val frameId: String,
    @SerialName("kind") val kind: RoutedeviceU2DActionRequestU2DOptionU2D1U2DKind_ef917452dc,
    @SerialName("x") val x: Double,
    @SerialName("y") val y: Double,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("frameId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("kind", "RoutedeviceU2DActionRequestU2DOptionU2D1U2DKind_ef917452dc", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("x", "Double", true, false, 0.0, 1.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("y", "Double", true, false, 0.0, 1.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D2U2DKind_0cdfc047b0 {
    @SerialName("swipe") SWIPE,
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D2_2c6061a21f(
    @SerialName("durationMs") val durationMs: Long,
    @SerialName("endX") val endX: Double,
    @SerialName("endY") val endY: Double,
    @SerialName("frameId") val frameId: String,
    @SerialName("kind") val kind: RoutedeviceU2DActionRequestU2DOptionU2D2U2DKind_0cdfc047b0,
    @SerialName("x") val x: Double,
    @SerialName("y") val y: Double,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("durationMs", "Long", true, false, 100.0, 2000.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("endX", "Double", true, false, 0.0, 1.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("endY", "Double", true, false, 0.0, 1.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("frameId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("kind", "RoutedeviceU2DActionRequestU2DOptionU2D2U2DKind_0cdfc047b0", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("x", "Double", true, false, 0.0, 1.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("y", "Double", true, false, 0.0, 1.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D3_8c04d0a06a(
    @SerialName("kind") val kind: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D1U2DKind_3ad514880d,
    @SerialName("text") val text: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("kind", "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D1U2DKind_3ad514880d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("text", "String", true, false, null, null, 1, 2000, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D4U2DKey_35c107fafb {
    @SerialName("home") HOME,
    @SerialName("back") BACK,
    @SerialName("enter") ENTER,
    @SerialName("backspace") BACKSPACE,
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D4U2DKind_14221269d8 {
    @SerialName("key") KEY,
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D4_83384e1a09(
    @SerialName("key") val key: RoutedeviceU2DActionRequestU2DOptionU2D4U2DKey_35c107fafb,
    @SerialName("kind") val kind: RoutedeviceU2DActionRequestU2DOptionU2D4U2DKind_14221269d8,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("key", "RoutedeviceU2DActionRequestU2DOptionU2D4U2DKey_35c107fafb", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutedeviceU2DActionRequestU2DOptionU2D4U2DKind_14221269d8", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D5U2DKind_60fc988aef {
    @SerialName("start") START,
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D5_a36830c34a(
    @SerialName("kind") val kind: RoutedeviceU2DActionRequestU2DOptionU2D5U2DKind_60fc988aef,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("kind", "RoutedeviceU2DActionRequestU2DOptionU2D5U2DKind_60fc988aef", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D10U2DType_bd9ee7d624 {
    @SerialName("launchApp") LAUNCHAPP,
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D10_14f3c332d5(
    @SerialName("applicationId") val applicationId: String,
    @SerialName("type") val type: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D10U2DType_bd9ee7d624,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("applicationId", "String", true, false, null, null, 3, 255, null, null, "^[A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z][A-Za-z0-9_]*)+$", null, listOf()),
            RemoteFieldDescriptor("type", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D10U2DType_bd9ee7d624", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D11U2DType_d585eadabc {
    @SerialName("powerOff") POWEROFF,
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D11_fd4fd2eb41(
    @SerialName("type") val type: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D11U2DType_d585eadabc,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("type", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D11U2DType_d585eadabc", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D1U2DType_6f5fd1f783 {
    @SerialName("read") READ,
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D1_9d4f8a22a3(
    @SerialName("type") val type: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D1U2DType_6f5fd1f783,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("type", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D1U2DType_6f5fd1f783", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D2U2DType_c5a25a4322 {
    @SerialName("appearance") APPEARANCE,
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D2U2DValue_8e9c16e558 {
    @SerialName("light") LIGHT,
    @SerialName("dark") DARK,
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D2_0b5555e2ca(
    @SerialName("type") val type: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D2U2DType_c5a25a4322,
    @SerialName("value") val value: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D2U2DValue_8e9c16e558,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("type", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D2U2DType_c5a25a4322", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("value", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D2U2DValue_8e9c16e558", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D3U2DType_c8c48a1118 {
    @SerialName("textSize") TEXTSIZE,
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D3U2DValue_f0f815c9ec {
    @SerialName("small") SMALL,
    @SerialName("standard") STANDARD,
    @SerialName("large") LARGE,
    @SerialName("extraLarge") EXTRALARGE,
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D3_72a4809a8d(
    @SerialName("type") val type: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D3U2DType_c8c48a1118,
    @SerialName("value") val value: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D3U2DValue_f0f815c9ec,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("type", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D3U2DType_c8c48a1118", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("value", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D3U2DValue_f0f815c9ec", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D4U2DType_4311a74add {
    @SerialName("orientation") ORIENTATION,
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D4U2DValue_d61b01c8cb {
    @SerialName("portrait") PORTRAIT,
    @SerialName("landscapeLeft") LANDSCAPELEFT,
    @SerialName("upsideDown") UPSIDEDOWN,
    @SerialName("landscapeRight") LANDSCAPERIGHT,
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D4_feff20c88b(
    @SerialName("type") val type: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D4U2DType_4311a74add,
    @SerialName("value") val value: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D4U2DValue_d61b01c8cb,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("type", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D4U2DType_4311a74add", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("value", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D4U2DValue_d61b01c8cb", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D5U2DType_3ac0e8087f {
    @SerialName("reduceMotion") REDUCEMOTION,
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D5_ca98effeea(
    @SerialName("enabled") val enabled: Boolean,
    @SerialName("type") val type: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D5U2DType_3ac0e8087f,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("enabled", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D5U2DType_3ac0e8087f", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D6U2DType_d4757acfcd {
    @SerialName("network") NETWORK,
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D6_596b826e91(
    @SerialName("enabled") val enabled: Boolean,
    @SerialName("type") val type: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D6U2DType_d4757acfcd,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("enabled", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D6U2DType_d4757acfcd", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D7U2DType_1a0723da99 {
    @SerialName("location") LOCATION,
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D7_dfbf83bd74(
    @SerialName("latitude") val latitude: Double,
    @SerialName("longitude") val longitude: Double,
    @SerialName("type") val type: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D7U2DType_1a0723da99,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("latitude", "Double", true, false, -90.0, 90.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("longitude", "Double", true, false, -180.0, 180.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D7U2DType_1a0723da99", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D8U2DDecision_ff4e0a6efa {
    @SerialName("grant") GRANT,
    @SerialName("revoke") REVOKE,
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D8U2DPermission_f6dd22a2a9 {
    @SerialName("camera") CAMERA,
    @SerialName("microphone") MICROPHONE,
    @SerialName("photos") PHOTOS,
    @SerialName("contacts") CONTACTS,
    @SerialName("calendar") CALENDAR,
    @SerialName("location") LOCATION,
    @SerialName("notifications") NOTIFICATIONS,
    @SerialName("motion") MOTION,
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D8U2DType_592634b895 {
    @SerialName("permission") PERMISSION,
}
