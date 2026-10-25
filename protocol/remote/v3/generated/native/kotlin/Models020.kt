// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
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

@Serializable
data class RoutebrowserU2DCommandRequestU2DOptionU2D8_22c8bcdab9(
    @SerialName("kind") val kind: RoutebrowserU2DCommandRequestU2DOptionU2D8U2DKind_41be750b56,
    @SerialName("tabId") val tabId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutebrowserU2DCommandRequestU2DOptionU2D8U2DKind_41be750b56", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tabId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

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
enum class RouteconversationU2DSearchQueryU2DIncludeArchived_003a95dd16 {
    @SerialName("true") TRUE,
    @SerialName("false") FALSE,
}

@Serializable
enum class RouteconversationU2DSearchQueryU2DVersion_8795ea0289 {
    @SerialName("1") N1,
}

@Serializable
data class RouteconversationU2DSearchQuery_07b9b9802d(
    @SerialName("cursor") val cursor: RemoteField<String> = RemoteField.Missing,
    @SerialName("includeArchived") val includeArchived: RemoteField<RouteconversationU2DSearchQueryU2DIncludeArchived_003a95dd16> = RemoteField.Missing,
    @SerialName("limit") val limit: RemoteField<Long> = RemoteField.Missing,
    @SerialName("projectId") val projectId: RemoteField<String> = RemoteField.Missing,
    @SerialName("query") val query: String,
    @SerialName("version") val version: RouteconversationU2DSearchQueryU2DVersion_8795ea0289,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cursor", "String", false, false, null, null, null, 1024, null, null, null, null, listOf()),
            RemoteFieldDescriptor("includeArchived", "RouteconversationU2DSearchQueryU2DIncludeArchived_003a95dd16", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("limit", "Long", false, false, 1.0, 50.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", false, false, null, null, 1, 200, null, null, null, null, listOf()),
            RemoteFieldDescriptor("query", "String", true, false, null, null, 1, 500, null, null, null, null, listOf("string.trim")),
            RemoteFieldDescriptor("version", "RouteconversationU2DSearchQueryU2DVersion_8795ea0289", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteconversationU2DSearchResponseU2DEntriesU2DItemU2DRole_ff05783d57 {
    @SerialName("user") USER,
    @SerialName("assistant") ASSISTANT,
}

@Serializable
data class RouteconversationU2DSearchResponseU2DEntriesU2DItem_c52c624815(
    @SerialName("archived") val archived: Boolean,
    @SerialName("excerpt") val excerpt: String,
    @SerialName("itemId") val itemId: String,
    @SerialName("projectId") val projectId: String,
    @SerialName("projectName") val projectName: String,
    @SerialName("role") val role: RouteconversationU2DSearchResponseU2DEntriesU2DItemU2DRole_ff05783d57,
    @SerialName("threadId") val threadId: String,
    @SerialName("title") val title: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("archived", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("excerpt", "String", true, false, null, null, null, 320, null, null, null, null, listOf()),
            RemoteFieldDescriptor("itemId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectName", "String", true, false, null, null, null, 200, null, null, null, null, listOf()),
            RemoteFieldDescriptor("role", "RouteconversationU2DSearchResponseU2DEntriesU2DItemU2DRole_ff05783d57", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", true, false, null, null, null, 300, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteconversationU2DSearchResponseU2DNextCursor_e333e5cd97 = String?

@Serializable
data class RouteconversationU2DSearchResponse_ca8d08ed24(
    @SerialName("entries") val entries: List<RouteconversationU2DSearchResponseU2DEntriesU2DItem_c52c624815>,
    @SerialName("indexing") val indexing: Boolean,
    @SerialName("nextCursor") val nextCursor: RemoteField<String>,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("entries", "List<RouteconversationU2DSearchResponseU2DEntriesU2DItem_c52c624815>", true, false, null, null, null, null, null, 50, null, null, listOf()),
            RemoteFieldDescriptor("indexing", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("nextCursor", "String", true, true, null, null, null, 1024, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
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
