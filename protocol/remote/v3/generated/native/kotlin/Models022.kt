// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
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

@Serializable
data class WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D2_d95fd60152(
    @SerialName("branch") val branch: RemoteField<String> = RemoteField.Missing,
    @SerialName("includeReviewBundle") val includeReviewBundle: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("kind") val kind: WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D2U2DKind_c975fc7daa,
    @SerialName("prNumber") val prNumber: Long,
    @SerialName("projectId") val projectId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("branch", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("includeReviewBundle", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D2U2DKind_c975fc7daa", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("prNumber", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D3U2DKind_6b98eaede5 {
    @SerialName("project-pull-requests") PROJECTU2DPULLU2DREQUESTS,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D3_591e7e71be(
    @SerialName("kind") val kind: WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D3U2DKind_6b98eaede5,
    @SerialName("projectId") val projectId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D3U2DKind_6b98eaede5", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItem_ad1d9fe8b3.Serializer::class)
sealed interface WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItem_ad1d9fe8b3 {
    data class Option1(val value: WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D1_e2d96ee09e) : WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItem_ad1d9fe8b3
    data class Option2(val value: WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D2_d95fd60152) : WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItem_ad1d9fe8b3
    data class Option3(val value: WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D3_591e7e71be) : WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItem_ad1d9fe8b3
    object Serializer : KSerializer<WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItem_ad1d9fe8b3> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItem_ad1d9fe8b3")
        override fun deserialize(decoder: Decoder): WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItem_ad1d9fe8b3 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItem_ad1d9fe8b3 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItem_ad1d9fe8b3>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("target")))) { Option1(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D1_e2d96ee09e>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("pull-request")))) { Option2(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D2_d95fd60152>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("project-pull-requests")))) { Option3(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D3_591e7e71be>(element)) }
            return RemoteUnionCodec.single("WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItem_ad1d9fe8b3", matches)
        }
        override fun serialize(encoder: Encoder, value: WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItem_ad1d9fe8b3) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItem_ad1d9fe8b3 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D1_e2d96ee09e>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D2_d95fd60152>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D3_591e7e71be>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D7U2DType_9f1edfda19 {
    @SerialName("git-state-interests") GITU2DSTATEU2DINTERESTS,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D7_d2299af726(
    @SerialName("interests") val interests: List<WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItem_ad1d9fe8b3>,
    @SerialName("type") val type: WebSocketClientMessageU2DOptionU2D7U2DType_9f1edfda19,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("interests", "List<WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItem_ad1d9fe8b3>", true, false, null, null, null, null, null, 500, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketClientMessageU2DOptionU2D7U2DType_9f1edfda19", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketClientMessageU2DOptionU2D8U2DType_25e47114d3 {
    @SerialName("thread-item-interests") THREADU2DITEMU2DINTERESTS,
}

@Serializable
data class WebSocketClientMessageU2DOptionU2D8_93bef3a552(
    @SerialName("threadIds") val threadIds: List<String>,
    @SerialName("type") val type: WebSocketClientMessageU2DOptionU2D8U2DType_25e47114d3,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("threadIds", "List<String>", true, false, null, null, null, null, null, 200, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketClientMessageU2DOptionU2D8U2DType_25e47114d3", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = WebSocketClientMessage_4dde56e240.Serializer::class)
sealed interface WebSocketClientMessage_4dde56e240 {
    data class Option1(val value: WebSocketClientMessageU2DOptionU2D1_1709690cf0) : WebSocketClientMessage_4dde56e240
    data class Option2(val value: WebSocketClientMessageU2DOptionU2D2_2b7b34c95b) : WebSocketClientMessage_4dde56e240
    data class Option3(val value: WebSocketClientMessageU2DOptionU2D3_0e8f58f429) : WebSocketClientMessage_4dde56e240
    data class Option4(val value: WebSocketClientMessageU2DOptionU2D4_d550ef9994) : WebSocketClientMessage_4dde56e240
    data class Option5(val value: WebSocketClientMessageU2DOptionU2D5_863be77948) : WebSocketClientMessage_4dde56e240
    data class Option6(val value: WebSocketClientMessageU2DOptionU2D6_5af10e67b4) : WebSocketClientMessage_4dde56e240
    data class Option7(val value: WebSocketClientMessageU2DOptionU2D7_d2299af726) : WebSocketClientMessage_4dde56e240
    data class Option8(val value: WebSocketClientMessageU2DOptionU2D8_93bef3a552) : WebSocketClientMessage_4dde56e240
    object Serializer : KSerializer<WebSocketClientMessage_4dde56e240> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("WebSocketClientMessage_4dde56e240")
        override fun deserialize(decoder: Decoder): WebSocketClientMessage_4dde56e240 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("WebSocketClientMessage_4dde56e240 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<WebSocketClientMessage_4dde56e240>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("ping")))) { Option1(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D1_1709690cf0>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("browser-watch")))) { Option2(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D2_2b7b34c95b>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("browser-unwatch")))) { Option3(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D3_0e8f58f429>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("browser-input")))) { Option4(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D4_d550ef9994>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("terminal-watch")))) { Option5(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D5_863be77948>(element)) }
            RemoteUnionCodec.tryOption(matches, 6, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("terminal-unwatch")))) { Option6(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D6_5af10e67b4>(element)) }
            RemoteUnionCodec.tryOption(matches, 7, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("git-state-interests")))) { Option7(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D7_d2299af726>(element)) }
            RemoteUnionCodec.tryOption(matches, 8, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("thread-item-interests")))) { Option8(jsonDecoder.json.decodeFromJsonElement<WebSocketClientMessageU2DOptionU2D8_93bef3a552>(element)) }
            return RemoteUnionCodec.single("WebSocketClientMessage_4dde56e240", matches)
        }
        override fun serialize(encoder: Encoder, value: WebSocketClientMessage_4dde56e240) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("WebSocketClientMessage_4dde56e240 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D1_1709690cf0>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D2_2b7b34c95b>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D3_0e8f58f429>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D4_d550ef9994>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D5_863be77948>(value.value)
                is Option6 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D6_5af10e67b4>(value.value)
                is Option7 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D7_d2299af726>(value.value)
                is Option8 -> jsonEncoder.json.encodeToJsonElement<WebSocketClientMessageU2DOptionU2D8_93bef3a552>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D1U2DType_0200f968d2 {
    @SerialName("ready") READY,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D1_13762c62f0(
    @SerialName("seq") val seq: Long,
    @SerialName("type") val type: WebSocketServerMessageU2DOptionU2D1U2DType_0200f968d2,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("seq", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketServerMessageU2DOptionU2D1U2DType_0200f968d2", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D2U2DType_1aa020e871 {
    @SerialName("event") EVENT,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D2_8f72d27346(
    @SerialName("event") val event: JsonElement,
    @SerialName("seq") val seq: Long,
    @SerialName("type") val type: WebSocketServerMessageU2DOptionU2D2U2DType_1aa020e871,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("event", "JsonElement", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("seq", "Long", true, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketServerMessageU2DOptionU2D2U2DType_1aa020e871", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D3U2DType_d9640543f6 {
    @SerialName("resync-required") RESYNCU2DREQUIRED,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D3_67185a3945(
    @SerialName("reason") val reason: String,
    @SerialName("seq") val seq: Long,
    @SerialName("type") val type: WebSocketServerMessageU2DOptionU2D3U2DType_d9640543f6,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("reason", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("seq", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketServerMessageU2DOptionU2D3U2DType_d9640543f6", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D4U2DType_d8768c073f {
    @SerialName("pong") PONG,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D4_17b50a5a25(
    @SerialName("id") val id: RemoteField<String> = RemoteField.Missing,
    @SerialName("receivedAt") val receivedAt: Double,
    @SerialName("sentAt") val sentAt: RemoteField<Double> = RemoteField.Missing,
    @SerialName("type") val type: WebSocketServerMessageU2DOptionU2D4U2DType_d8768c073f,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("receivedAt", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sentAt", "Double", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketServerMessageU2DOptionU2D4U2DType_d8768c073f", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D5U2DType_47e02a8368 {
    @SerialName("browser-state") BROWSERU2DSTATE,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D5_bd23acb1d6(
    @SerialName("state") val state: RoutebrowserU2DCommandResponseU2DState_ecc6edb616,
    @SerialName("type") val type: WebSocketServerMessageU2DOptionU2D5U2DType_47e02a8368,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("state", "RoutebrowserU2DCommandResponseU2DState_ecc6edb616", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketServerMessageU2DOptionU2D5U2DType_47e02a8368", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D6U2DMetadata_7d9e4e8a68(
    @SerialName("deviceHeight") val deviceHeight: Double,
    @SerialName("deviceWidth") val deviceWidth: Double,
    @SerialName("offsetTop") val offsetTop: Double,
    @SerialName("pageScaleFactor") val pageScaleFactor: Double,
    @SerialName("scrollOffsetX") val scrollOffsetX: Double,
    @SerialName("scrollOffsetY") val scrollOffsetY: Double,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("deviceHeight", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("deviceWidth", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("offsetTop", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pageScaleFactor", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scrollOffsetX", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scrollOffsetY", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D6U2DType_c2894654f1 {
    @SerialName("browser-frame") BROWSERU2DFRAME,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D6_8f58c1d1ac(
    @SerialName("data") val data: String,
    @SerialName("metadata") val metadata: WebSocketServerMessageU2DOptionU2D6U2DMetadata_7d9e4e8a68,
    @SerialName("tabId") val tabId: String,
    @SerialName("type") val type: WebSocketServerMessageU2DOptionU2D6U2DType_c2894654f1,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("data", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("metadata", "WebSocketServerMessageU2DOptionU2D6U2DMetadata_7d9e4e8a68", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tabId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "WebSocketServerMessageU2DOptionU2D6U2DType_c2894654f1", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D7U2DStatusU2DStatus_c1f357f1f8 {
    @SerialName("starting") STARTING,
    @SerialName("active") ACTIVE,
    @SerialName("unavailable") UNAVAILABLE,
}

@Serializable
data class WebSocketServerMessageU2DOptionU2D7U2DStatus_018e665246(
    @SerialName("reason") val reason: RemoteField<String> = RemoteField.Missing,
    @SerialName("status") val status: WebSocketServerMessageU2DOptionU2D7U2DStatusU2DStatus_c1f357f1f8,
    @SerialName("tabId") val tabId: RemoteField<String>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("reason", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "WebSocketServerMessageU2DOptionU2D7U2DStatusU2DStatus_c1f357f1f8", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tabId", "String", true, true, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class WebSocketServerMessageU2DOptionU2D7U2DType_ab6b873225 {
    @SerialName("browser-mirror-status") BROWSERU2DMIRRORU2DSTATUS,
}
