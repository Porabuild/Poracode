// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class WebSocketServerMessageU2DOptionU2D7_8f58c1d1ac(
    @SerialName("data") val data: String,
    @SerialName("metadata") val metadata: WebSocketServerMessageU2DOptionU2D7U2DMetadata_7d9e4e8a68,
    @SerialName("tabId") val tabId: String,
    @SerialName("type") val type: WebSocketServerMessageU2DOptionU2D7U2DType_c2894654f1,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("data", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("metadata", "WebSocketServerMessageU2DOptionU2D7U2DMetadata_7d9e4e8a68", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tabId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketServerMessageU2DOptionU2D7U2DType_c2894654f1", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D8U2DStatusU2DStatus_c1f357f1f8 {
    @SerialName("starting") STARTING,
    @SerialName("active") ACTIVE,
    @SerialName("unavailable") UNAVAILABLE,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D8U2DStatus_018e665246(
    @SerialName("reason") val reason: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("status") val status: WebSocketServerMessageU2DOptionU2D8U2DStatusU2DStatus_c1f357f1f8,
    @SerialName("tabId") val tabId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("reason", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "WebSocketServerMessageU2DOptionU2D8U2DStatusU2DStatus_c1f357f1f8", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tabId", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, true, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D8U2DType_ab6b873225 {
    @SerialName("browser-mirror-status") BROWSERU2DMIRRORU2DSTATUS,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D8_0ad133ee58(
    @SerialName("status") val status: WebSocketServerMessageU2DOptionU2D8U2DStatus_018e665246,
    @SerialName("type") val type: WebSocketServerMessageU2DOptionU2D8U2DType_ab6b873225,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("status", "WebSocketServerMessageU2DOptionU2D8U2DStatus_018e665246", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketServerMessageU2DOptionU2D8U2DType_ab6b873225", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D9U2DCursorSync_2cfe911595(
    @SerialName("fromCursor") val fromCursor: Long,
    @SerialName("generation") val generation: String,
    @SerialName("toCursor") val toCursor: Long,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72,
    @SerialName("watchId") val watchId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("fromCursor", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("generation", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("toCursor", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("watchId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf("terminal.cursor.output-range"))
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D9U2DType_d8b225d7de {
    @SerialName("terminal-output") TERMINALU2DOUTPUT,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D9_95d0adeb5b(
    @SerialName("cursorSync") val cursorSync: RemoteField<WebSocketServerMessageU2DOptionU2D9U2DCursorSync_2cfe911595> = RemoteField.Missing,
    @SerialName("data") val data: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("id") val id: String,
    @SerialName("type") val type: WebSocketServerMessageU2DOptionU2D9U2DType_d8b225d7de,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cursorSync", "WebSocketServerMessageU2DOptionU2D9U2DCursorSync_2cfe911595", false, false, null, null, null, null, null, null, null, null, listOf("terminal.cursor.output-range")),
            RemoteFieldDescriptor("data", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketServerMessageU2DOptionU2D9U2DType_d8b225d7de", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf("terminal.cursor.output-data-utf16"))
    }
}

@Serializable(with = WebSocketServerMessage_252e94a758.Serializer::class)
sealed interface WebSocketServerMessage_252e94a758 {
    data class Option1(val value: WebSocketServerMessageU2DOptionU2D1_48916cddaa) : WebSocketServerMessage_252e94a758
    data class Option2(val value: WebSocketServerMessageU2DOptionU2D2_13762c62f0) : WebSocketServerMessage_252e94a758
    data class Option3(val value: WebSocketServerMessageU2DOptionU2D3_3897f50212) : WebSocketServerMessage_252e94a758
    data class Option4(val value: WebSocketServerMessageU2DOptionU2D4_a633f9a256) : WebSocketServerMessage_252e94a758
    data class Option5(val value: WebSocketServerMessageU2DOptionU2D5_17b50a5a25) : WebSocketServerMessage_252e94a758
    data class Option6(val value: WebSocketServerMessageU2DOptionU2D6_bd23acb1d6) : WebSocketServerMessage_252e94a758
    data class Option7(val value: WebSocketServerMessageU2DOptionU2D7_8f58c1d1ac) : WebSocketServerMessage_252e94a758
    data class Option8(val value: WebSocketServerMessageU2DOptionU2D8_0ad133ee58) : WebSocketServerMessage_252e94a758
    data class Option9(val value: WebSocketServerMessageU2DOptionU2D9_95d0adeb5b) : WebSocketServerMessage_252e94a758
    data class Option10(val value: WebSocketServerMessageU2DOptionU2D10_4655073d71) : WebSocketServerMessage_252e94a758
    data class Option11(val value: WebSocketServerMessageU2DOptionU2D11_e65689e97e) : WebSocketServerMessage_252e94a758
    data class Option12(val value: WebSocketServerMessageU2DOptionU2D12_f1c1581e17) : WebSocketServerMessage_252e94a758
    object Serializer : KSerializer<WebSocketServerMessage_252e94a758> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("WebSocketServerMessage_252e94a758")
        override fun deserialize(decoder: Decoder): WebSocketServerMessage_252e94a758 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("WebSocketServerMessage_252e94a758 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<WebSocketServerMessage_252e94a758>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("agent-vision-frame")))) { Option1(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D1_48916cddaa>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("ready")))) { Option2(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D2_13762c62f0>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("event")))) { Option3(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D3_3897f50212>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("resync-required")))) { Option4(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D4_a633f9a256>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("pong")))) { Option5(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D5_17b50a5a25>(element)) }
            RemoteUnionCodec.tryOption(matches, 6, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("browser-state")))) { Option6(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D6_bd23acb1d6>(element)) }
            RemoteUnionCodec.tryOption(matches, 7, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("browser-frame")))) { Option7(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D7_8f58c1d1ac>(element)) }
            RemoteUnionCodec.tryOption(matches, 8, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("browser-mirror-status")))) { Option8(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D8_0ad133ee58>(element)) }
            RemoteUnionCodec.tryOption(matches, 9, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("terminal-output")))) { Option9(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D9_95d0adeb5b>(element)) }
            RemoteUnionCodec.tryOption(matches, 10, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("terminal-watch-result")))) { Option10(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D10_4655073d71>(element)) }
            RemoteUnionCodec.tryOption(matches, 11, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("terminal-watch-baseline-chunk")))) { Option11(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D11_e65689e97e>(element)) }
            RemoteUnionCodec.tryOption(matches, 12, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("desktop-event")))) { Option12(jsonDecoder.json.decodeFromJsonElement<WebSocketServerMessageU2DOptionU2D12_f1c1581e17>(element)) }
            return RemoteUnionCodec.single("WebSocketServerMessage_252e94a758", matches)
        }
        override fun serialize(encoder: Encoder, value: WebSocketServerMessage_252e94a758) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("WebSocketServerMessage_252e94a758 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D1_48916cddaa>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D2_13762c62f0>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D3_3897f50212>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D4_a633f9a256>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D5_17b50a5a25>(value.value)
                is Option6 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D6_bd23acb1d6>(value.value)
                is Option7 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D7_8f58c1d1ac>(value.value)
                is Option8 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D8_0ad133ee58>(value.value)
                is Option9 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D9_95d0adeb5b>(value.value)
                is Option10 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D10_4655073d71>(value.value)
                is Option11 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D11_e65689e97e>(value.value)
                is Option12 -> jsonEncoder.json.encodeToJsonElement<WebSocketServerMessageU2DOptionU2D12_f1c1581e17>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}
