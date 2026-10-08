// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable(with = WebSocketServerMessage_d613617e76.Serializer::class)
sealed interface WebSocketServerMessage_d613617e76 {
    data class Option1(val value: WebSocketServerMessageU2DOptionU2D1_13762c62f0) : WebSocketServerMessage_d613617e76
    data class Option2(val value: WebSocketServerMessageU2DOptionU2D2_19e09b36c5) : WebSocketServerMessage_d613617e76
    data class Option3(val value: WebSocketServerMessageU2DOptionU2D3_a633f9a256) : WebSocketServerMessage_d613617e76
    data class Option4(val value: WebSocketServerMessageU2DOptionU2D4_17b50a5a25) : WebSocketServerMessage_d613617e76
    data class Option5(val value: WebSocketServerMessageU2DOptionU2D5_bd23acb1d6) : WebSocketServerMessage_d613617e76
    data class Option6(val value: WebSocketServerMessageU2DOptionU2D6_8f58c1d1ac) : WebSocketServerMessage_d613617e76
    data class Option7(val value: WebSocketServerMessageU2DOptionU2D7_0ad133ee58) : WebSocketServerMessage_d613617e76
    data class Option8(val value: WebSocketServerMessageU2DOptionU2D8_95d0adeb5b) : WebSocketServerMessage_d613617e76
    data class Option9(val value: WebSocketServerMessageU2DOptionU2D9_4655073d71) : WebSocketServerMessage_d613617e76
    data class Option10(val value: WebSocketServerMessageU2DOptionU2D10_e65689e97e) : WebSocketServerMessage_d613617e76
    data class Option11(val value: WebSocketServerMessageU2DOptionU2D11_f1c1581e17) : WebSocketServerMessage_d613617e76
    object Serializer : KSerializer<WebSocketServerMessage_d613617e76> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("WebSocketServerMessage_d613617e76")
        override fun deserialize(decoder: Decoder): WebSocketServerMessage_d613617e76 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("WebSocketServerMessage_d613617e76 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<WebSocketServerMessage_d613617e76>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("ready")))) { Option1(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D1_13762c62f0>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("event")))) { Option2(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D2_19e09b36c5>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("resync-required")))) { Option3(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D3_a633f9a256>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("pong")))) { Option4(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D4_17b50a5a25>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("browser-state")))) { Option5(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D5_bd23acb1d6>(element)) }
            RemoteUnionCodec.tryOption(matches, 6, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("browser-frame")))) { Option6(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D6_8f58c1d1ac>(element)) }
            RemoteUnionCodec.tryOption(matches, 7, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("browser-mirror-status")))) { Option7(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D7_0ad133ee58>(element)) }
            RemoteUnionCodec.tryOption(matches, 8, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("terminal-output")))) { Option8(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D8_95d0adeb5b>(element)) }
            RemoteUnionCodec.tryOption(matches, 9, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("terminal-watch-result")))) { Option9(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D9_4655073d71>(element)) }
            RemoteUnionCodec.tryOption(matches, 10, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("terminal-watch-baseline-chunk")))) { Option10(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D10_e65689e97e>(element)) }
            RemoteUnionCodec.tryOption(matches, 11, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("desktop-event")))) { Option11(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D11_f1c1581e17>(element)) }
            return RemoteUnionCodec.single("WebSocketServerMessage_d613617e76", matches)
        }
        override fun serialize(encoder: Encoder, value: WebSocketServerMessage_d613617e76) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("WebSocketServerMessage_d613617e76 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D1_13762c62f0>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D2_19e09b36c5>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D3_a633f9a256>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D4_17b50a5a25>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D5_bd23acb1d6>(value.value)
                is Option6 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D6_8f58c1d1ac>(value.value)
                is Option7 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D7_0ad133ee58>(value.value)
                is Option8 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D8_95d0adeb5b>(value.value)
                is Option9 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D9_4655073d71>(value.value)
                is Option10 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D10_e65689e97e>(value.value)
                is Option11 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D11_f1c1581e17>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}
