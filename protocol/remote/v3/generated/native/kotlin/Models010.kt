// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D6_c55a346c73(
    @SerialName("itemId") val itemId: String,
    @SerialName("payload") val payload: JsonElement,
    @SerialName("threadId") val threadId: String,
    @SerialName("type") val type: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D6U2DType_9189c3f251,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("itemId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("payload", "JsonElement", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D6U2DType_9189c3f251", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D7U2DType_ab52710489 {
    @SerialName("item.completed") ITEMU2ECOMPLETED,
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D7_1371f7bedc(
    @SerialName("itemId") val itemId: String,
    @SerialName("payload") val payload: RemoteField<JsonElement> = RemoteField.Missing,
    @SerialName("threadId") val threadId: String,
    @SerialName("type") val type: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D7U2DType_ab52710489,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("itemId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("payload", "JsonElement", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D7U2DType_ab52710489", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

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
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8_311561bc27(
    @SerialName("delta") val delta: String,
    @SerialName("itemId") val itemId: String,
    @SerialName("stream") val stream: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8U2DStream_b5c1f44eaf,
    @SerialName("threadId") val threadId: String,
    @SerialName("type") val type: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8U2DType_f30731ffd8,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("delta", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("itemId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("stream", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8U2DStream_b5c1f44eaf", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
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
    @SerialName("threadId") val threadId: String,
    @SerialName("type") val type: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DType_1fbc0e0d79,
    @SerialName("usage") val usage: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DType_1fbc0e0d79", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("usage", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProceduresubagentSubscribeResultU2DHistoryU2DItem_c6773b11bd.Serializer::class)
sealed interface ProceduresubagentSubscribeResultU2DHistoryU2DItem_c6773b11bd {
    data class Option1(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D1_2778fa8937) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_c6773b11bd
    data class Option2(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D2_66846085f3) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_c6773b11bd
    data class Option3(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D3_4244283735) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_c6773b11bd
    data class Option4(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D4_85d2dd31fd) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_c6773b11bd
    data class Option5(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5_fc5c2dcf18) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_c6773b11bd
    data class Option6(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D6_c55a346c73) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_c6773b11bd
    data class Option7(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D7_1371f7bedc) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_c6773b11bd
    data class Option8(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8_311561bc27) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_c6773b11bd
    data class Option9(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9_cdd89e732d) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_c6773b11bd
    data class Option10(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10_9b83e18a93) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_c6773b11bd
    data class Option11(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11_15179deb98) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_c6773b11bd
    data class Option12(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12_e011332682) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_c6773b11bd
    data class Option13(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D13_e9d3d0a9b8) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_c6773b11bd
    data class Option14(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D14_f7a8f76390) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_c6773b11bd
    object Serializer : KSerializer<ProceduresubagentSubscribeResultU2DHistoryU2DItem_c6773b11bd> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProceduresubagentSubscribeResultU2DHistoryU2DItem_c6773b11bd")
        override fun deserialize(decoder: Decoder): ProceduresubagentSubscribeResultU2DHistoryU2DItem_c6773b11bd {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProceduresubagentSubscribeResultU2DHistoryU2DItem_c6773b11bd supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProceduresubagentSubscribeResultU2DHistoryU2DItem_c6773b11bd>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("session.started")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D1_2778fa8937>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("session.exited")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D2_66846085f3>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("turn.started")))) { Option3(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D3_4244283735>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("turn.completed")))) { Option4(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D4_85d2dd31fd>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("item.started")))) { Option5(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5_fc5c2dcf18>(element)) }
            RemoteUnionCodec.tryOption(matches, 6, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("item.updated")))) { Option6(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D6_c55a346c73>(element)) }
            RemoteUnionCodec.tryOption(matches, 7, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("item.completed")))) { Option7(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D7_1371f7bedc>(element)) }
            RemoteUnionCodec.tryOption(matches, 8, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("content.delta")))) { Option8(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8_311561bc27>(element)) }
            RemoteUnionCodec.tryOption(matches, 9, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("context.updated")))) { Option9(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9_cdd89e732d>(element)) }
            RemoteUnionCodec.tryOption(matches, 10, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("usage.spent")))) { Option10(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10_9b83e18a93>(element)) }
            RemoteUnionCodec.tryOption(matches, 11, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("request.opened")))) { Option11(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11_15179deb98>(element)) }
            RemoteUnionCodec.tryOption(matches, 12, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("request.resolved")))) { Option12(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12_e011332682>(element)) }
            RemoteUnionCodec.tryOption(matches, 13, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("warning")))) { Option13(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D13_e9d3d0a9b8>(element)) }
            RemoteUnionCodec.tryOption(matches, 14, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("error")))) { Option14(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D14_f7a8f76390>(element)) }
            return RemoteUnionCodec.single("ProceduresubagentSubscribeResultU2DHistoryU2DItem_c6773b11bd", matches)
        }
        override fun serialize(encoder: Encoder, value: ProceduresubagentSubscribeResultU2DHistoryU2DItem_c6773b11bd) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProceduresubagentSubscribeResultU2DHistoryU2DItem_c6773b11bd supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D1_2778fa8937>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D2_66846085f3>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D3_4244283735>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D4_85d2dd31fd>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5_fc5c2dcf18>(value.value)
                is Option6 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D6_c55a346c73>(value.value)
                is Option7 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D7_1371f7bedc>(value.value)
                is Option8 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8_311561bc27>(value.value)
                is Option9 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9_cdd89e732d>(value.value)
                is Option10 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10_9b83e18a93>(value.value)
                is Option11 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11_15179deb98>(value.value)
                is Option12 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12_e011332682>(value.value)
                is Option13 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D13_e9d3d0a9b8>(value.value)
                is Option14 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D14_f7a8f76390>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class ProceduresubagentSubscribeResult_0f71d438c1(
    @SerialName("history") val history: List<ProceduresubagentSubscribeResultU2DHistoryU2DItem_c6773b11bd>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("history", "List<ProceduresubagentSubscribeResultU2DHistoryU2DItem_c6773b11bd>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurewaitMcpServerOauthRequest_e9df8b4f3d(
    @SerialName("flowId") val flowId: String,
    @SerialName("projectLocation") val projectLocation: RemoteField<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("flowId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedurewaitMcpServerOauthResult_51cc694dc5.Serializer::class)
sealed interface ProcedurewaitMcpServerOauthResult_51cc694dc5 {
    data class Option1(val value: ProcedurebeginMcpServerOauthResultU2DOptionU2D1_47fd370c6d) : ProcedurewaitMcpServerOauthResult_51cc694dc5
    data class Option2(val value: ProcedurebeginMcpServerOauthResultU2DOptionU2D3_43639d56ca) : ProcedurewaitMcpServerOauthResult_51cc694dc5
    object Serializer : KSerializer<ProcedurewaitMcpServerOauthResult_51cc694dc5> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedurewaitMcpServerOauthResult_51cc694dc5")
        override fun deserialize(decoder: Decoder): ProcedurewaitMcpServerOauthResult_51cc694dc5 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedurewaitMcpServerOauthResult_51cc694dc5 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedurewaitMcpServerOauthResult_51cc694dc5>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("authorized")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedurebeginMcpServerOauthResultU2DOptionU2D1_47fd370c6d>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("error")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedurebeginMcpServerOauthResultU2DOptionU2D3_43639d56ca>(element)) }
            return RemoteUnionCodec.single("ProcedurewaitMcpServerOauthResult_51cc694dc5", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedurewaitMcpServerOauthResult_51cc694dc5) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedurewaitMcpServerOauthResult_51cc694dc5 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedurebeginMcpServerOauthResultU2DOptionU2D1_47fd370c6d>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedurebeginMcpServerOauthResultU2DOptionU2D3_43639d56ca>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class ProcedureworkflowAgentChatRequest_014d2dfae8(
    @SerialName("agentFinished") val agentFinished: Boolean,
    @SerialName("agentId") val agentId: String,
    @SerialName("location") val location: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("threadId") val threadId: String,
    @SerialName("transcriptDir") val transcriptDir: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentFinished", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("agentId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("location", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("transcriptDir", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureworkflowAgentChatResult_a87d1660d6(
    @SerialName("events") val events: List<ProceduresubagentSubscribeResultU2DHistoryU2DItem_c6773b11bd>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("events", "List<ProceduresubagentSubscribeResultU2DHistoryU2DItem_c6773b11bd>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureworkflowGetRunRequest_13324e3fec(
    @SerialName("includeAgentChats") val includeAgentChats: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("location") val location: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("manifestPath") val manifestPath: String,
    @SerialName("transcriptDir") val transcriptDir: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("includeAgentChats", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("location", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("manifestPath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("transcriptDir", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItemU2DChatU2DItemU2DRole_7e386bfca4 {
    @SerialName("user") USER,
    @SerialName("assistant") ASSISTANT,
    @SerialName("tool") TOOL,
}

@Serializable
data class ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItemU2DChatU2DItem_4878a3657a(
    @SerialName("role") val role: ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItemU2DChatU2DItemU2DRole_7e386bfca4,
    @SerialName("text") val text: RemoteField<String> = RemoteField.Missing,
    @SerialName("timestamp") val timestamp: RemoteField<String> = RemoteField.Missing,
    @SerialName("title") val title: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("role", "ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItemU2DChatU2DItemU2DRole_7e386bfca4", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("text", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("timestamp", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItemU2DState_5a17efba35 {
    @SerialName("queued") QUEUED,
    @SerialName("running") RUNNING,
    @SerialName("done") DONE,
    @SerialName("failed") FAILED,
    @SerialName("cancelled") CANCELLED,
}

@Serializable
data class ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItem_da546ba4a0(
    @SerialName("agentId") val agentId: String,
    @SerialName("attempt") val attempt: RemoteField<Long> = RemoteField.Missing,
    @SerialName("chat") val chat: RemoteField<List<ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItemU2DChatU2DItem_4878a3657a>> = RemoteField.Missing,
    @SerialName("durationMs") val durationMs: RemoteField<Long> = RemoteField.Missing,
    @SerialName("label") val label: String,
    @SerialName("lastProgressAt") val lastProgressAt: RemoteField<Long> = RemoteField.Missing,
    @SerialName("lastToolName") val lastToolName: RemoteField<String> = RemoteField.Missing,
    @SerialName("model") val model: RemoteField<String> = RemoteField.Missing,
    @SerialName("phaseIndex") val phaseIndex: RemoteField<Long> = RemoteField.Missing,
    @SerialName("phaseTitle") val phaseTitle: RemoteField<String> = RemoteField.Missing,
    @SerialName("promptPreview") val promptPreview: RemoteField<String> = RemoteField.Missing,
    @SerialName("queuedAt") val queuedAt: RemoteField<Long> = RemoteField.Missing,
    @SerialName("resultPreview") val resultPreview: RemoteField<String> = RemoteField.Missing,
    @SerialName("startedAt") val startedAt: RemoteField<Long> = RemoteField.Missing,
    @SerialName("state") val state: RemoteField<ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItemU2DState_5a17efba35> = RemoteField.Missing,
    @SerialName("tokens") val tokens: RemoteField<Long> = RemoteField.Missing,
    @SerialName("toolCalls") val toolCalls: RemoteField<Long> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("attempt", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("chat", "List<ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItemU2DChatU2DItem_4878a3657a>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("durationMs", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastProgressAt", "Long", false, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("lastToolName", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("phaseIndex", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("phaseTitle", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("promptPreview", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("queuedAt", "Long", false, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("resultPreview", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("startedAt", "Long", false, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("state", "ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItemU2DState_5a17efba35", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("tokens", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("toolCalls", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItem_59cd628901(
    @SerialName("agents") val agents: List<ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItem_da546ba4a0>,
    @SerialName("detail") val detail: RemoteField<String> = RemoteField.Missing,
    @SerialName("title") val title: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agents", "List<ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItem_da546ba4a0>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("detail", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DStatus_3a008e3c40 {
    @SerialName("running") RUNNING,
    @SerialName("completed") COMPLETED,
    @SerialName("failed") FAILED,
    @SerialName("cancelled") CANCELLED,
    @SerialName("unknown") UNKNOWN,
}

@Serializable
data class ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1_f9da03570b(
    @SerialName("agentCount") val agentCount: Long,
    @SerialName("defaultModel") val defaultModel: RemoteField<String> = RemoteField.Missing,
    @SerialName("durationMs") val durationMs: RemoteField<Long> = RemoteField.Missing,
    @SerialName("phases") val phases: List<ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItem_59cd628901>,
    @SerialName("runId") val runId: String,
    @SerialName("scriptPath") val scriptPath: RemoteField<String> = RemoteField.Missing,
    @SerialName("startTime") val startTime: RemoteField<Long> = RemoteField.Missing,
    @SerialName("status") val status: ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DStatus_3a008e3c40,
    @SerialName("summary") val summary: RemoteField<String> = RemoteField.Missing,
    @SerialName("taskId") val taskId: RemoteField<String> = RemoteField.Missing,
    @SerialName("totalTokens") val totalTokens: RemoteField<Long> = RemoteField.Missing,
    @SerialName("totalToolCalls") val totalToolCalls: RemoteField<Long> = RemoteField.Missing,
    @SerialName("unphasedAgents") val unphasedAgents: List<ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItem_da546ba4a0>,
    @SerialName("workflowName") val workflowName: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentCount", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("defaultModel", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("durationMs", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("phases", "List<ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItem_59cd628901>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scriptPath", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("startTime", "Long", false, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DStatus_3a008e3c40", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("summary", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("taskId", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("totalTokens", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("totalToolCalls", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("unphasedAgents", "List<ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItem_da546ba4a0>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("workflowName", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedureworkflowGetRunResultU2DRun_74659b54c1 = ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1_f9da03570b?

@Serializable
data class ProcedureworkflowGetRunResult_965bd4463b(
    @SerialName("mtimeMs") val mtimeMs: RemoteField<Double> = RemoteField.Missing,
    @SerialName("run") val run: RemoteField<ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1_f9da03570b>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("mtimeMs", "Double", false, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("run", "ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1_f9da03570b", true, true, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
