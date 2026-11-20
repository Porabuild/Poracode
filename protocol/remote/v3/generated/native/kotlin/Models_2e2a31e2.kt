// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D4_f2e3da83f3(
    @SerialName("kind") val kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D4U2DKind_04569d9eea,
    @SerialName("result") val result: ProcedurewaitMcpServerOauthResult_51cc694dc5,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D4U2DKind_04569d9eea", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("result", "ProcedurewaitMcpServerOauthResult_51cc694dc5", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D5_540340cca9(
    @SerialName("kind") val kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D5U2DKind_7a17f4196c,
    @SerialName("result") val result: ProcedurewaitMcpServerOauthResult_51cc694dc5,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D5U2DKind_7a17f4196c", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("result", "ProcedurewaitMcpServerOauthResult_51cc694dc5", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D6_3ac3526f6a(
    @SerialName("kind") val kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D6U2DKind_61fc4b3eae,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D6U2DKind_61fc4b3eae", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RoutemcpU2DSettingsU2DOperationResponse_4ba08f8592.Serializer::class)
sealed interface RoutemcpU2DSettingsU2DOperationResponse_4ba08f8592 {
    data class Option1(val value: RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D1_bb3cd72cf9) : RoutemcpU2DSettingsU2DOperationResponse_4ba08f8592
    data class Option2(val value: RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D2_560a7abcaf) : RoutemcpU2DSettingsU2DOperationResponse_4ba08f8592
    data class Option3(val value: RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D3_2798cb9d2d) : RoutemcpU2DSettingsU2DOperationResponse_4ba08f8592
    data class Option4(val value: RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D4_f2e3da83f3) : RoutemcpU2DSettingsU2DOperationResponse_4ba08f8592
    data class Option5(val value: RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D5_540340cca9) : RoutemcpU2DSettingsU2DOperationResponse_4ba08f8592
    data class Option6(val value: RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D6_3ac3526f6a) : RoutemcpU2DSettingsU2DOperationResponse_4ba08f8592
    object Serializer : KSerializer<RoutemcpU2DSettingsU2DOperationResponse_4ba08f8592> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutemcpU2DSettingsU2DOperationResponse_4ba08f8592")
        override fun deserialize(decoder: Decoder): RoutemcpU2DSettingsU2DOperationResponse_4ba08f8592 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutemcpU2DSettingsU2DOperationResponse_4ba08f8592 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutemcpU2DSettingsU2DOperationResponse_4ba08f8592>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("probe")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D1_bb3cd72cf9>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("oauth-status")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D2_560a7abcaf>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("oauth-begin")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D3_2798cb9d2d>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("oauth-wait")))) { Option4(jsonDecoder.json.decodeFromJsonElement<RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D4_f2e3da83f3>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("oauth-complete")))) { Option5(jsonDecoder.json.decodeFromJsonElement<RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D5_540340cca9>(element)) }
            RemoteUnionCodec.tryOption(matches, 6, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("oauth-clear")))) { Option6(jsonDecoder.json.decodeFromJsonElement<RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D6_3ac3526f6a>(element)) }
            return RemoteUnionCodec.single("RoutemcpU2DSettingsU2DOperationResponse_4ba08f8592", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutemcpU2DSettingsU2DOperationResponse_4ba08f8592) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutemcpU2DSettingsU2DOperationResponse_4ba08f8592 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D1_bb3cd72cf9>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D2_560a7abcaf>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D3_2798cb9d2d>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D4_f2e3da83f3>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D5_540340cca9>(value.value)
                is Option6 -> jsonEncoder.json.encodeToJsonElement<RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D6_3ac3526f6a>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class RoutememoryU2DCatalogRequestU2DOptionU2D1_62b62e6153(
    @SerialName("action") val action: ProcedurehexVoiceRequestU2DOptionU2D10U2DAction_79cc8fd877,
    @SerialName("projectId") val projectId: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("action", "ProcedurehexVoiceRequestU2DOptionU2D10U2DAction_79cc8fd877", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutememoryU2DCatalogRequestU2DOptionU2D2_649f2dd010(
    @SerialName("action") val action: ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0,
    @SerialName("projectId") val projectId: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("action", "ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutememoryU2DCatalogRequestU2DOptionU2D3U2DAction_a2bcbae622 {
    @SerialName("save") SAVE,
}

@Serializable
enum class RoutememoryU2DCatalogRequestU2DOptionU2D3U2DEntryU2DCategory_e3c6a49a61 {
    @SerialName("user") USER,
    @SerialName("feedback") FEEDBACK,
    @SerialName("project") PROJECT,
    @SerialName("reference") REFERENCE,
}

@Serializable
enum class RoutememoryU2DCatalogRequestU2DOptionU2D3U2DEntryU2DPolarity_6c042b493a {
    @SerialName("positive") POSITIVE,
    @SerialName("negative") NEGATIVE,
    @SerialName("fact") FACT,
}

@Serializable
data class RoutememoryU2DCatalogRequestU2DOptionU2D3U2DEntry_3cbfa576c3(
    @SerialName("body") val body: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("category") val category: RoutememoryU2DCatalogRequestU2DOptionU2D3U2DEntryU2DCategory_e3c6a49a61,
    @SerialName("id") val id: RemoteField<String> = RemoteField.Missing,
    @SerialName("pinned") val pinned: Boolean,
    @SerialName("polarity") val polarity: RoutememoryU2DCatalogRequestU2DOptionU2D3U2DEntryU2DPolarity_6c042b493a,
    @SerialName("projectId") val projectId: RemoteField<String> = RemoteField.Missing,
    @SerialName("quote") val quote: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("scope") val scope: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11,
    @SerialName("summary") val summary: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("body", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("category", "RoutememoryU2DCatalogRequestU2DOptionU2D3U2DEntryU2DCategory_e3c6a49a61", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pinned", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("polarity", "RoutememoryU2DCatalogRequestU2DOptionU2D3U2DEntryU2DPolarity_6c042b493a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", false, true, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("quote", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scope", "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("summary", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutememoryU2DCatalogRequestU2DOptionU2D3_3fc597689b(
    @SerialName("action") val action: RoutememoryU2DCatalogRequestU2DOptionU2D3U2DAction_a2bcbae622,
    @SerialName("entry") val entry: RoutememoryU2DCatalogRequestU2DOptionU2D3U2DEntry_3cbfa576c3,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("action", "RoutememoryU2DCatalogRequestU2DOptionU2D3U2DAction_a2bcbae622", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("entry", "RoutememoryU2DCatalogRequestU2DOptionU2D3U2DEntry_3cbfa576c3", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutememoryU2DCatalogRequestU2DOptionU2D4U2DAction_4d5989d27d {
    @SerialName("delete") DELETE,
}

@Serializable
data class RoutememoryU2DCatalogRequestU2DOptionU2D4_46f2b301a5(
    @SerialName("action") val action: RoutememoryU2DCatalogRequestU2DOptionU2D4U2DAction_4d5989d27d,
    @SerialName("id") val id: String,
    @SerialName("projectId") val projectId: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("action", "RoutememoryU2DCatalogRequestU2DOptionU2D4U2DAction_4d5989d27d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RoutememoryU2DCatalogRequest_0eb986e669.Serializer::class)
sealed interface RoutememoryU2DCatalogRequest_0eb986e669 {
    data class Option1(val value: RoutememoryU2DCatalogRequestU2DOptionU2D1_62b62e6153) : RoutememoryU2DCatalogRequest_0eb986e669
    data class Option2(val value: RoutememoryU2DCatalogRequestU2DOptionU2D2_649f2dd010) : RoutememoryU2DCatalogRequest_0eb986e669
    data class Option3(val value: RoutememoryU2DCatalogRequestU2DOptionU2D3_3fc597689b) : RoutememoryU2DCatalogRequest_0eb986e669
    data class Option4(val value: RoutememoryU2DCatalogRequestU2DOptionU2D4_46f2b301a5) : RoutememoryU2DCatalogRequest_0eb986e669
    object Serializer : KSerializer<RoutememoryU2DCatalogRequest_0eb986e669> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutememoryU2DCatalogRequest_0eb986e669")
        override fun deserialize(decoder: Decoder): RoutememoryU2DCatalogRequest_0eb986e669 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutememoryU2DCatalogRequest_0eb986e669 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutememoryU2DCatalogRequest_0eb986e669>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("status")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutememoryU2DCatalogRequestU2DOptionU2D1_62b62e6153>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("list")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RoutememoryU2DCatalogRequestU2DOptionU2D2_649f2dd010>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("save")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RoutememoryU2DCatalogRequestU2DOptionU2D3_3fc597689b>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "action", listOf(JsonPrimitive("delete")))) { Option4(jsonDecoder.json.decodeFromJsonElement<RoutememoryU2DCatalogRequestU2DOptionU2D4_46f2b301a5>(element)) }
            return RemoteUnionCodec.single("RoutememoryU2DCatalogRequest_0eb986e669", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutememoryU2DCatalogRequest_0eb986e669) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutememoryU2DCatalogRequest_0eb986e669 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutememoryU2DCatalogRequestU2DOptionU2D1_62b62e6153>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RoutememoryU2DCatalogRequestU2DOptionU2D2_649f2dd010>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RoutememoryU2DCatalogRequestU2DOptionU2D3_3fc597689b>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<RoutememoryU2DCatalogRequestU2DOptionU2D4_46f2b301a5>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}
