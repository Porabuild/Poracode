// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8U2DStream_b5c1f44eaf {
    @SerialName("assistant_text") ASSISTANTU5FTEXT,
    @SerialName("reasoning_text") REASONINGU5FTEXT,
    @SerialName("plan_text") PLANU5FTEXT,
    @SerialName("command_output") COMMANDU5FOUTPUT,
    @SerialName("file_change_output") FILEU5FCHANGEU5FOUTPUT,
}

@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8U2DType_f30731ffd8 {
    @SerialName("content.delta") CONTENTU2EDELTA,
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8_996ce1c4e0(
    @SerialName("delta") val delta: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("itemId") val itemId: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("replace") val replace: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("stream") val stream: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8U2DStream_b5c1f44eaf,
    @SerialName("threadId") val threadId: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("type") val type: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8U2DType_f30731ffd8,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("delta", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("itemId", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("replace", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("stream", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8U2DStream_b5c1f44eaf", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8U2DType_f30731ffd8", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DType_1fbc0e0d79 {
    @SerialName("context.updated") CONTEXTU2EUPDATED,
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsageU2DBreakdownU2DItem_1b3dc298a6(
    @SerialName("id") val id: String,
    @SerialName("label") val label: String,
    @SerialName("tokens") val tokens: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tokens", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b(
    @SerialName("breakdown") val breakdown: RemoteField<List<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsageU2DBreakdownU2DItem_1b3dc298a6>> = RemoteField.Missing,
    @SerialName("maxTokens") val maxTokens: RemoteField<Long> = RemoteField.Missing,
    @SerialName("usedTokens") val usedTokens: RemoteField<Long> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("breakdown", "List<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsageU2DBreakdownU2DItem_1b3dc298a6>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("maxTokens", "Long", false, false, null, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("usedTokens", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9_cdd89e732d(
    @SerialName("threadId") val threadId: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("type") val type: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DType_1fbc0e0d79,
    @SerialName("usage") val usage: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("threadId", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DType_1fbc0e0d79", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("usage", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProceduresubagentSubscribeResultU2DHistoryU2DItem_9262f6553e.Serializer::class)
sealed interface ProceduresubagentSubscribeResultU2DHistoryU2DItem_9262f6553e {
    data class Option1(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D1_2778fa8937) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_9262f6553e
    data class Option2(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D2_66846085f3) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_9262f6553e
    data class Option3(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D3_4244283735) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_9262f6553e
    data class Option4(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D4_85d2dd31fd) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_9262f6553e
    data class Option5(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5_fe7522595f) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_9262f6553e
    data class Option6(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D6_c55a346c73) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_9262f6553e
    data class Option7(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D7_1371f7bedc) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_9262f6553e
    data class Option8(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8_996ce1c4e0) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_9262f6553e
    data class Option9(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9_cdd89e732d) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_9262f6553e
    data class Option10(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10_baf4f355dd) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_9262f6553e
    data class Option11(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11_7cccbb4b01) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_9262f6553e
    data class Option12(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12_15179deb98) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_9262f6553e
    data class Option13(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D13_e011332682) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_9262f6553e
    data class Option14(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D14_2a107f95a9) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_9262f6553e
    data class Option15(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D15_9da23fadb8) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_9262f6553e
    data class Option16(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D16_d42bf49d95) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_9262f6553e
    object Serializer : KSerializer<ProceduresubagentSubscribeResultU2DHistoryU2DItem_9262f6553e> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProceduresubagentSubscribeResultU2DHistoryU2DItem_9262f6553e")
        override fun deserialize(decoder: Decoder): ProceduresubagentSubscribeResultU2DHistoryU2DItem_9262f6553e {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProceduresubagentSubscribeResultU2DHistoryU2DItem_9262f6553e supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProceduresubagentSubscribeResultU2DHistoryU2DItem_9262f6553e>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("session.started")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D1_2778fa8937>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("session.exited")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D2_66846085f3>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("turn.started")))) { Option3(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D3_4244283735>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("turn.completed")))) { Option4(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D4_85d2dd31fd>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("item.started")))) { Option5(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5_fe7522595f>(element)) }
            RemoteUnionCodec.tryOption(matches, 6, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("item.updated")))) { Option6(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D6_c55a346c73>(element)) }
            RemoteUnionCodec.tryOption(matches, 7, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("item.completed")))) { Option7(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D7_1371f7bedc>(element)) }
            RemoteUnionCodec.tryOption(matches, 8, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("content.delta")))) { Option8(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8_996ce1c4e0>(element)) }
            RemoteUnionCodec.tryOption(matches, 9, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("context.updated")))) { Option9(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9_cdd89e732d>(element)) }
            RemoteUnionCodec.tryOption(matches, 10, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("usage.spent")))) { Option10(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10_baf4f355dd>(element)) }
            RemoteUnionCodec.tryOption(matches, 11, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("background_tasks.changed")))) { Option11(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11_7cccbb4b01>(element)) }
            RemoteUnionCodec.tryOption(matches, 12, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("request.opened")))) { Option12(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12_15179deb98>(element)) }
            RemoteUnionCodec.tryOption(matches, 13, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("request.resolved")))) { Option13(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D13_e011332682>(element)) }
            RemoteUnionCodec.tryOption(matches, 14, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("runtime.truncated")))) { Option14(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D14_2a107f95a9>(element)) }
            RemoteUnionCodec.tryOption(matches, 15, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("warning")))) { Option15(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D15_9da23fadb8>(element)) }
            RemoteUnionCodec.tryOption(matches, 16, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("error")))) { Option16(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D16_d42bf49d95>(element)) }
            return RemoteUnionCodec.single("ProceduresubagentSubscribeResultU2DHistoryU2DItem_9262f6553e", matches)
        }
        override fun serialize(encoder: Encoder, value: ProceduresubagentSubscribeResultU2DHistoryU2DItem_9262f6553e) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProceduresubagentSubscribeResultU2DHistoryU2DItem_9262f6553e supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D1_2778fa8937>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D2_66846085f3>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D3_4244283735>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D4_85d2dd31fd>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5_fe7522595f>(value.value)
                is Option6 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D6_c55a346c73>(value.value)
                is Option7 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D7_1371f7bedc>(value.value)
                is Option8 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8_996ce1c4e0>(value.value)
                is Option9 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9_cdd89e732d>(value.value)
                is Option10 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10_baf4f355dd>(value.value)
                is Option11 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11_7cccbb4b01>(value.value)
                is Option12 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12_15179deb98>(value.value)
                is Option13 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D13_e011332682>(value.value)
                is Option14 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D14_2a107f95a9>(value.value)
                is Option15 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D15_9da23fadb8>(value.value)
                is Option16 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D16_d42bf49d95>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class ProceduresubagentSubscribeResult_d4ae5f8c2b(
    @SerialName("history") val history: List<ProceduresubagentSubscribeResultU2DHistoryU2DItem_9262f6553e>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("history", "List<ProceduresubagentSubscribeResultU2DHistoryU2DItem_9262f6553e>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
