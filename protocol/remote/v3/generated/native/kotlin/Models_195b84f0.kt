// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class WebSocketClientMessageU2DOptionU2D3_1709690cf0(
    @SerialName("id") val id: RemoteField<String> = RemoteField.Missing,
    @SerialName("sentAt") val sentAt: RemoteField<Double> = RemoteField.Missing,
    @SerialName("type") val type: WebSocketClientMessageU2DOptionU2D3U2DType_fe79d48b8a,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sentAt", "Double", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketClientMessageU2DOptionU2D3U2DType_fe79d48b8a", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D4U2DType_3f5bcd72f9 {
    @SerialName("browser-watch") BROWSERU2DWATCH,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D4_2b7b34c95b(
    @SerialName("type") val type: WebSocketClientMessageU2DOptionU2D4U2DType_3f5bcd72f9,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("type", "WebSocketClientMessageU2DOptionU2D4U2DType_3f5bcd72f9", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D5U2DType_225e53f995 {
    @SerialName("browser-unwatch") BROWSERU2DUNWATCH,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D5_0e8f58f429(
    @SerialName("type") val type: WebSocketClientMessageU2DOptionU2D5U2DType_225e53f995,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("type", "WebSocketClientMessageU2DOptionU2D5U2DType_225e53f995", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D1_75aa7b0623(
    @SerialName("kind") val kind: RoutedeviceU2DActionRequestU2DOptionU2D1U2DKind_ef917452dc,
    @SerialName("x") val x: Double,
    @SerialName("y") val y: Double,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutedeviceU2DActionRequestU2DOptionU2D1U2DKind_ef917452dc", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("x", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("y", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D2U2DKind_00ebeb8fef {
    @SerialName("scroll") SCROLL,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D2_41ffeb2050(
    @SerialName("deltaX") val deltaX: Double,
    @SerialName("deltaY") val deltaY: Double,
    @SerialName("kind") val kind: WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D2U2DKind_00ebeb8fef,
    @SerialName("x") val x: Double,
    @SerialName("y") val y: Double,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("deltaX", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("deltaY", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D2U2DKind_00ebeb8fef", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("x", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("y", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D3U2DKind_19030914d1 {
    @SerialName("insert-text") INSERTU2DTEXT,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D3_8906d017ba(
    @SerialName("kind") val kind: WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D3U2DKind_19030914d1,
    @SerialName("text") val text: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D3U2DKind_19030914d1", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("text", "String", true, false, null, null, 1, 1024, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D4U2DKey_7df0b39f18 {
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
data class WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D4_9e169df36e(
    @SerialName("key") val key: WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D4U2DKey_7df0b39f18,
    @SerialName("kind") val kind: RoutedeviceU2DActionRequestU2DOptionU2D4U2DKind_14221269d8,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("key", "WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D4U2DKey_7df0b39f18", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutedeviceU2DActionRequestU2DOptionU2D4U2DKind_14221269d8", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = WebSocketClientMessageU2DOptionU2D6U2DInput_2c0b30d69c.Serializer::class)
sealed interface WebSocketClientMessageU2DOptionU2D6U2DInput_2c0b30d69c {
    data class Option1(val value: WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D1_75aa7b0623) : WebSocketClientMessageU2DOptionU2D6U2DInput_2c0b30d69c
    data class Option2(val value: WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D2_41ffeb2050) : WebSocketClientMessageU2DOptionU2D6U2DInput_2c0b30d69c
    data class Option3(val value: WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D3_8906d017ba) : WebSocketClientMessageU2DOptionU2D6U2DInput_2c0b30d69c
    data class Option4(val value: WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D4_9e169df36e) : WebSocketClientMessageU2DOptionU2D6U2DInput_2c0b30d69c
    object Serializer : KSerializer<WebSocketClientMessageU2DOptionU2D6U2DInput_2c0b30d69c> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("WebSocketClientMessageU2DOptionU2D6U2DInput_2c0b30d69c")
        override fun deserialize(decoder: Decoder): WebSocketClientMessageU2DOptionU2D6U2DInput_2c0b30d69c {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("WebSocketClientMessageU2DOptionU2D6U2DInput_2c0b30d69c supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<WebSocketClientMessageU2DOptionU2D6U2DInput_2c0b30d69c>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("tap")))) { Option1(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D1_75aa7b0623>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("scroll")))) { Option2(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D2_41ffeb2050>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("insert-text")))) { Option3(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D3_8906d017ba>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("key")))) { Option4(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D4_9e169df36e>(element)) }
            return RemoteUnionCodec.single("WebSocketClientMessageU2DOptionU2D6U2DInput_2c0b30d69c", matches)
        }
        override fun serialize(encoder: Encoder, value: WebSocketClientMessageU2DOptionU2D6U2DInput_2c0b30d69c) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("WebSocketClientMessageU2DOptionU2D6U2DInput_2c0b30d69c supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D1_75aa7b0623>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D2_41ffeb2050>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D3_8906d017ba>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D4_9e169df36e>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D6U2DType_64570e2249 {
    @SerialName("browser-input") BROWSERU2DINPUT,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D6_d550ef9994(
    @SerialName("input") val input: WebSocketClientMessageU2DOptionU2D6U2DInput_2c0b30d69c,
    @SerialName("type") val type: WebSocketClientMessageU2DOptionU2D6U2DType_64570e2249,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("input", "WebSocketClientMessageU2DOptionU2D6U2DInput_2c0b30d69c", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketClientMessageU2DOptionU2D6U2DType_64570e2249", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
