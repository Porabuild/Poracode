// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
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
data class WebSocketClientMessageU2DOptionU2D5U2DCursorSyncU2DResume_9997128f83(
    @SerialName("cursor") val cursor: Long,
    @SerialName("generation") val generation: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cursor", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("generation", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D5U2DCursorSync_3975ceeb37(
    @SerialName("maxChunkBytes") val maxChunkBytes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("maxWindowBytes") val maxWindowBytes: RemoteField<Long> = RemoteField.Missing,
    @SerialName("resume") val resume: RemoteField<WebSocketClientMessageU2DOptionU2D5U2DCursorSyncU2DResume_9997128f83> = RemoteField.Missing,
    @SerialName("version") val version: Long,
    @SerialName("watchId") val watchId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("maxChunkBytes", "Long", false, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxWindowBytes", "Long", false, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("resume", "WebSocketClientMessageU2DOptionU2D5U2DCursorSyncU2DResume_9997128f83", false, false, null, null, null, null, null, null, null, null, listOf()),
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
data class WebSocketClientMessageU2DOptionU2D5_838adcbcaf(
    @SerialName("cursorSync") val cursorSync: RemoteField<WebSocketClientMessageU2DOptionU2D5U2DCursorSync_3975ceeb37> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("type") val type: WebSocketClientMessageU2DOptionU2D5U2DType_c64b38404f,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cursorSync", "WebSocketClientMessageU2DOptionU2D5U2DCursorSync_3975ceeb37", false, false, null, null, null, null, null, null, null, null, listOf()),
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
data class WebSocketClientMessageU2DOptionU2D7U2DCursorSync_23a1c447c0(
    @SerialName("throughCursor") val throughCursor: Long,
    @SerialName("version") val version: RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D3_f8ba039a2f,
    @SerialName("watchId") val watchId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("throughCursor", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D3_f8ba039a2f", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("watchId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D7U2DType_740c7dc82a {
    @SerialName("terminal-watch-baseline-ack") TERMINALU2DWATCHU2DBASELINEU2DACK,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D7_3f58316dbb(
    @SerialName("cursorSync") val cursorSync: WebSocketClientMessageU2DOptionU2D7U2DCursorSync_23a1c447c0,
    @SerialName("id") val id: String,
    @SerialName("type") val type: WebSocketClientMessageU2DOptionU2D7U2DType_740c7dc82a,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cursorSync", "WebSocketClientMessageU2DOptionU2D7U2DCursorSync_23a1c447c0", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketClientMessageU2DOptionU2D7U2DType_740c7dc82a", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D1U2DKind_fc779c522d {
    @SerialName("target") TARGET,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D1_e2d96ee09e(
    @SerialName("branch") val branch: RemoteField<String> = RemoteField.Missing,
    @SerialName("includePrDetails") val includePrDetails: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("kind") val kind: WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D1U2DKind_fc779c522d,
    @SerialName("projectId") val projectId: String,
    @SerialName("worktreePath") val worktreePath: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("branch", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("includePrDetails", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D1U2DKind_fc779c522d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("worktreePath", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D2U2DKind_c975fc7daa {
    @SerialName("pull-request") PULLU2DREQUEST,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D2_d95fd60152(
    @SerialName("branch") val branch: RemoteField<String> = RemoteField.Missing,
    @SerialName("includeReviewBundle") val includeReviewBundle: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("kind") val kind: WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D2U2DKind_c975fc7daa,
    @SerialName("prNumber") val prNumber: Long,
    @SerialName("projectId") val projectId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("branch", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("includeReviewBundle", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D2U2DKind_c975fc7daa", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prNumber", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D3U2DKind_6b98eaede5 {
    @SerialName("project-pull-requests") PROJECTU2DPULLU2DREQUESTS,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D3_591e7e71be(
    @SerialName("kind") val kind: WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D3U2DKind_6b98eaede5,
    @SerialName("projectId") val projectId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D3U2DKind_6b98eaede5", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3.Serializer::class)
sealed interface WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3 {
    data class Option1(val value: WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D1_e2d96ee09e) : WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3
    data class Option2(val value: WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D2_d95fd60152) : WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3
    data class Option3(val value: WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D3_591e7e71be) : WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3
    object Serializer : KSerializer<WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3")
        override fun deserialize(decoder: Decoder): WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("target")))) { Option1(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D1_e2d96ee09e>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("pull-request")))) { Option2(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D2_d95fd60152>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("project-pull-requests")))) { Option3(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D3_591e7e71be>(element)) }
            return RemoteUnionCodec.single("WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3", matches)
        }
        override fun serialize(encoder: Encoder, value: WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D1_e2d96ee09e>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D2_d95fd60152>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D3_591e7e71be>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}
