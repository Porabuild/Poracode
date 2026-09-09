// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RoutethreadU2DSendRequest_e88be6f845(
    @SerialName("config") val config: ProcedurerollbackThreadConversationRequestU2DConfig_023567f089,
    @SerialName("prompt") val prompt: String,
    @SerialName("segments") val segments: RemoteField<List<ProcedurestageThreadInputRequestU2DSegmentsU2DItem_a399fbc754>> = RemoteField.Missing,
    @SerialName("userMessageItemId") val userMessageItemId: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("config", "ProcedurerollbackThreadConversationRequestU2DConfig_023567f089", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prompt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("segments", "List<ProcedurestageThreadInputRequestU2DSegmentsU2DItem_a399fbc754>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("userMessageItemId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RoutethreadU2DStartU2DExistingRequestU2DDisabledBuiltInMcpTools_fdad254a8b = Map<String, List<String>>

@Serializable
data class RoutethreadU2DStartU2DExistingRequest_847ec48826(
    @SerialName("agentInstanceId") val agentInstanceId: RemoteField<String> = RemoteField.Missing,
    @SerialName("agentKind") val agentKind: String,
    @SerialName("config") val config: ProcedurerollbackThreadConversationRequestU2DConfig_023567f089,
    @SerialName("disabledBuiltInMcpServerIds") val disabledBuiltInMcpServerIds: RemoteField<List<RoutesettingsU2DReadResponseU2DSettingsU2DDisabledBuiltInMcpServersU2DPropertyU2DName_13f43aaaf5>> = RemoteField.Missing,
    @SerialName("disabledBuiltInMcpTools") val disabledBuiltInMcpTools: RemoteField<RoutethreadU2DStartU2DExistingRequestU2DDisabledBuiltInMcpTools_fdad254a8b> = RemoteField.Missing,
    @SerialName("ensureRunning") val ensureRunning: RemoteField<RouteportU2DUnforwardResponseU2DOk_d2dd3595e1> = RemoteField.Missing,
    @SerialName("initialSize") val initialSize: RouteterminalU2DResizeRequest_55ee222c09,
    @SerialName("invariantDisabledBuiltInMcpServerIds") val invariantDisabledBuiltInMcpServerIds: RemoteField<List<RoutesettingsU2DReadResponseU2DSettingsU2DDisabledBuiltInMcpServersU2DPropertyU2DName_13f43aaaf5>> = RemoteField.Missing,
    @SerialName("mcpServers") val mcpServers: RemoteField<List<ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1>> = RemoteField.Missing,
    @SerialName("mentionHandoff") val mentionHandoff: RemoteField<RouteportU2DUnforwardResponseU2DOk_d2dd3595e1> = RemoteField.Missing,
    @SerialName("presentationMode") val presentationMode: RemoteField<ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("prompt") val prompt: RemoteField<String> = RemoteField.Missing,
    @SerialName("providerSwitch") val providerSwitch: RemoteField<RoutethreadU2DCommandRequestU2DOptionU2D2U2DProviderSwitch_06461b1492> = RemoteField.Missing,
    @SerialName("segments") val segments: RemoteField<List<ProcedurestageThreadInputRequestU2DSegmentsU2DItem_a399fbc754>> = RemoteField.Missing,
    @SerialName("sessionRef") val sessionRef: RemoteField<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionRef_3b70e9f118> = RemoteField.Missing,
    @SerialName("threadId") val threadId: String,
    @SerialName("userMessageItemId") val userMessageItemId: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentInstanceId", "String", false, false, null, null, 1, 120, null, null, "^[a-z0-9][a-z0-9_\\-:.]*$", null, listOf()),
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("config", "ProcedurerollbackThreadConversationRequestU2DConfig_023567f089", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledBuiltInMcpServerIds", "List<RoutesettingsU2DReadResponseU2DSettingsU2DDisabledBuiltInMcpServersU2DPropertyU2DName_13f43aaaf5>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("disabledBuiltInMcpTools", "RoutethreadU2DStartU2DExistingRequestU2DDisabledBuiltInMcpTools_fdad254a8b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ensureRunning", "RouteportU2DUnforwardResponseU2DOk_d2dd3595e1", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("initialSize", "RouteterminalU2DResizeRequest_55ee222c09", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("invariantDisabledBuiltInMcpServerIds", "List<RoutesettingsU2DReadResponseU2DSettingsU2DDisabledBuiltInMcpServersU2DPropertyU2DName_13f43aaaf5>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mcpServers", "List<ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mentionHandoff", "RouteportU2DUnforwardResponseU2DOk_d2dd3595e1", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationMode", "ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prompt", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerSwitch", "RoutethreadU2DCommandRequestU2DOptionU2D2U2DProviderSwitch_06461b1492", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("segments", "List<ProcedurestageThreadInputRequestU2DSegmentsU2DItem_a399fbc754>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sessionRef", "RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionRef_3b70e9f118", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("userMessageItemId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DSteerU2DSetRequest_7b88ef93ea(
    @SerialName("config") val config: ProcedurerollbackThreadConversationRequestU2DConfig_023567f089,
    @SerialName("prompt") val prompt: String,
    @SerialName("segments") val segments: RemoteField<List<ProcedurestageThreadInputRequestU2DSegmentsU2DItem_a399fbc754>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("config", "ProcedurerollbackThreadConversationRequestU2DConfig_023567f089", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prompt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("segments", "List<ProcedurestageThreadInputRequestU2DSegmentsU2DItem_a399fbc754>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutetokenU2DExchangeRequestU2DClientU2DDeviceType_28ab534145 {
    @SerialName("desktop") DESKTOP,
    @SerialName("mobile") MOBILE,
    @SerialName("tablet") TABLET,
    @SerialName("browser") BROWSER,
    @SerialName("unknown") UNKNOWN,
}

@Serializable
data class RoutetokenU2DExchangeRequestU2DClient_6969170275(
    @SerialName("deviceType") val deviceType: RemoteField<RoutetokenU2DExchangeRequestU2DClientU2DDeviceType_28ab534145> = RemoteField.Missing,
    @SerialName("label") val label: RemoteField<String> = RemoteField.Missing,
    @SerialName("os") val os: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("deviceType", "RoutetokenU2DExchangeRequestU2DClientU2DDeviceType_28ab534145", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("os", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutetokenU2DExchangeRequestU2DGrantType_962b214fbc {
    @SerialName("pairing-token") PAIRINGU2DTOKEN,
}

@Serializable
enum class RoutetokenU2DExchangeRequestU2DScopesU2DItem_8f483f0889 {
    @SerialName("session:read") SESSIONU3AREAD,
    @SerialName("session:operate") SESSIONU3AOPERATE,
    @SerialName("terminal:read") TERMINALU3AREAD,
    @SerialName("terminal:operate") TERMINALU3AOPERATE,
    @SerialName("requests:resolve") REQUESTSU3ARESOLVE,
    @SerialName("projects:manage") PROJECTSU3AMANAGE,
    @SerialName("ports:forward") PORTSU3AFORWARD,
}

@Serializable
data class RoutetokenU2DExchangeRequest_8dfe4ead4e(
    @SerialName("client") val client: RemoteField<RoutetokenU2DExchangeRequestU2DClient_6969170275> = RemoteField.Missing,
    @SerialName("credential") val credential: String,
    @SerialName("grantType") val grantType: RoutetokenU2DExchangeRequestU2DGrantType_962b214fbc,
    @SerialName("scopes") val scopes: RemoteField<List<RoutetokenU2DExchangeRequestU2DScopesU2DItem_8f483f0889>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("client", "RoutetokenU2DExchangeRequestU2DClient_6969170275", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("credential", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("grantType", "RoutetokenU2DExchangeRequestU2DGrantType_962b214fbc", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scopes", "List<RoutetokenU2DExchangeRequestU2DScopesU2DItem_8f483f0889>", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutetokenU2DExchangeResponseU2DTokenType_7c8fd050dd {
    @SerialName("Bearer") BEARER,
}

@Serializable
data class RoutetokenU2DExchangeResponse_d15a69227c(
    @SerialName("accessToken") val accessToken: String,
    @SerialName("expiresAt") val expiresAt: String,
    @SerialName("scopes") val scopes: List<String>,
    @SerialName("tokenType") val tokenType: RoutetokenU2DExchangeResponseU2DTokenType_7c8fd050dd,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("accessToken", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("expiresAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scopes", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tokenType", "RoutetokenU2DExchangeResponseU2DTokenType_7c8fd050dd", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutewebsocketU2DTicketResponse_b9dfb5a053(
    @SerialName("expiresAt") val expiresAt: String,
    @SerialName("ticket") val ticket: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("expiresAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ticket", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D1U2DType_fe79d48b8a {
    @SerialName("ping") PING,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D1_1709690cf0(
    @SerialName("id") val id: RemoteField<String> = RemoteField.Missing,
    @SerialName("sentAt") val sentAt: RemoteField<Double> = RemoteField.Missing,
    @SerialName("type") val type: WebSocketClientMessageU2DOptionU2D1U2DType_fe79d48b8a,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sentAt", "Double", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketClientMessageU2DOptionU2D1U2DType_fe79d48b8a", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D2U2DType_3f5bcd72f9 {
    @SerialName("browser-watch") BROWSERU2DWATCH,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D2_2b7b34c95b(
    @SerialName("type") val type: WebSocketClientMessageU2DOptionU2D2U2DType_3f5bcd72f9,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("type", "WebSocketClientMessageU2DOptionU2D2U2DType_3f5bcd72f9", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D3U2DType_225e53f995 {
    @SerialName("browser-unwatch") BROWSERU2DUNWATCH,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D3_0e8f58f429(
    @SerialName("type") val type: WebSocketClientMessageU2DOptionU2D3U2DType_225e53f995,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("type", "WebSocketClientMessageU2DOptionU2D3U2DType_225e53f995", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D1U2DKind_ef917452dc {
    @SerialName("tap") TAP,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D1_75aa7b0623(
    @SerialName("kind") val kind: WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D1U2DKind_ef917452dc,
    @SerialName("x") val x: Double,
    @SerialName("y") val y: Double,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D1U2DKind_ef917452dc", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("x", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("y", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D2U2DKind_00ebeb8fef {
    @SerialName("scroll") SCROLL,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D2_41ffeb2050(
    @SerialName("deltaX") val deltaX: Double,
    @SerialName("deltaY") val deltaY: Double,
    @SerialName("kind") val kind: WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D2U2DKind_00ebeb8fef,
    @SerialName("x") val x: Double,
    @SerialName("y") val y: Double,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("deltaX", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("deltaY", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D2U2DKind_00ebeb8fef", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("x", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("y", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D3U2DKind_19030914d1 {
    @SerialName("insert-text") INSERTU2DTEXT,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D3_8906d017ba(
    @SerialName("kind") val kind: WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D3U2DKind_19030914d1,
    @SerialName("text") val text: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D3U2DKind_19030914d1", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("text", "String", true, false, null, null, 1, 1024, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D4U2DKey_7df0b39f18 {
    @SerialName("enter") ENTER,
    @SerialName("backspace") BACKSPACE,
    @SerialName("tab") TAB,
    @SerialName("escape") ESCAPE,
    @SerialName("arrow-up") ARROWU2DUP,
    @SerialName("arrow-down") ARROWU2DDOWN,
    @SerialName("arrow-left") ARROWU2DLEFT,
    @SerialName("arrow-right") ARROWU2DRIGHT,
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D4U2DKind_14221269d8 {
    @SerialName("key") KEY,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D4_9e169df36e(
    @SerialName("key") val key: WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D4U2DKey_7df0b39f18,
    @SerialName("kind") val kind: WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D4U2DKind_14221269d8,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("key", "WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D4U2DKey_7df0b39f18", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D4U2DKind_14221269d8", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = WebSocketClientMessageU2DOptionU2D4U2DInput_2c0b30d69c.Serializer::class)
sealed interface WebSocketClientMessageU2DOptionU2D4U2DInput_2c0b30d69c {
    data class Option1(val value: WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D1_75aa7b0623) : WebSocketClientMessageU2DOptionU2D4U2DInput_2c0b30d69c
    data class Option2(val value: WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D2_41ffeb2050) : WebSocketClientMessageU2DOptionU2D4U2DInput_2c0b30d69c
    data class Option3(val value: WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D3_8906d017ba) : WebSocketClientMessageU2DOptionU2D4U2DInput_2c0b30d69c
    data class Option4(val value: WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D4_9e169df36e) : WebSocketClientMessageU2DOptionU2D4U2DInput_2c0b30d69c
    object Serializer : KSerializer<WebSocketClientMessageU2DOptionU2D4U2DInput_2c0b30d69c> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("WebSocketClientMessageU2DOptionU2D4U2DInput_2c0b30d69c")
        override fun deserialize(decoder: Decoder): WebSocketClientMessageU2DOptionU2D4U2DInput_2c0b30d69c {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("WebSocketClientMessageU2DOptionU2D4U2DInput_2c0b30d69c supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<WebSocketClientMessageU2DOptionU2D4U2DInput_2c0b30d69c>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("tap")))) { Option1(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D1_75aa7b0623>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("scroll")))) { Option2(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D2_41ffeb2050>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("insert-text")))) { Option3(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D3_8906d017ba>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("key")))) { Option4(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D4_9e169df36e>(element)) }
            return RemoteUnionCodec.single("WebSocketClientMessageU2DOptionU2D4U2DInput_2c0b30d69c", matches)
        }
        override fun serialize(encoder: Encoder, value: WebSocketClientMessageU2DOptionU2D4U2DInput_2c0b30d69c) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("WebSocketClientMessageU2DOptionU2D4U2DInput_2c0b30d69c supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D1_75aa7b0623>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D2_41ffeb2050>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D3_8906d017ba>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D4_9e169df36e>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D4U2DType_64570e2249 {
    @SerialName("browser-input") BROWSERU2DINPUT,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D4_d550ef9994(
    @SerialName("input") val input: WebSocketClientMessageU2DOptionU2D4U2DInput_2c0b30d69c,
    @SerialName("type") val type: WebSocketClientMessageU2DOptionU2D4U2DType_64570e2249,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("input", "WebSocketClientMessageU2DOptionU2D4U2DInput_2c0b30d69c", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketClientMessageU2DOptionU2D4U2DType_64570e2249", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D5U2DCursorSync_f8dd0bcba7(
    @SerialName("version") val version: Long,
    @SerialName("watchId") val watchId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("version", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("watchId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D5U2DType_c64b38404f {
    @SerialName("terminal-watch") TERMINALU2DWATCH,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D5_863be77948(
    @SerialName("cursorSync") val cursorSync: RemoteField<WebSocketClientMessageU2DOptionU2D5U2DCursorSync_f8dd0bcba7> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("type") val type: WebSocketClientMessageU2DOptionU2D5U2DType_c64b38404f,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cursorSync", "WebSocketClientMessageU2DOptionU2D5U2DCursorSync_f8dd0bcba7", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketClientMessageU2DOptionU2D5U2DType_c64b38404f", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D6U2DType_af6b6f72d4 {
    @SerialName("terminal-unwatch") TERMINALU2DUNWATCH,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D6_5af10e67b4(
    @SerialName("id") val id: String,
    @SerialName("type") val type: WebSocketClientMessageU2DOptionU2D6U2DType_af6b6f72d4,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketClientMessageU2DOptionU2D6U2DType_af6b6f72d4", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D1U2DKind_fc779c522d {
    @SerialName("target") TARGET,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D1_e2d96ee09e(
    @SerialName("branch") val branch: RemoteField<String> = RemoteField.Missing,
    @SerialName("includePrDetails") val includePrDetails: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("kind") val kind: WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D1U2DKind_fc779c522d,
    @SerialName("projectId") val projectId: String,
    @SerialName("worktreePath") val worktreePath: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("branch", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("includePrDetails", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D1U2DKind_fc779c522d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D2U2DKind_c975fc7daa {
    @SerialName("pull-request") PULLU2DREQUEST,
}
