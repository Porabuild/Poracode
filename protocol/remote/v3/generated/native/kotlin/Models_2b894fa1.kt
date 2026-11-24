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
    @SerialName("delta") val delta: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("itemId") val itemId: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("replace") val replace: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("stream") val stream: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8U2DStream_b5c1f44eaf,
    @SerialName("threadId") val threadId: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("type") val type: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8U2DType_f30731ffd8,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("delta", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("itemId", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("replace", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("stream", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8U2DStream_b5c1f44eaf", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
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
    @SerialName("threadId") val threadId: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("type") val type: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DType_1fbc0e0d79,
    @SerialName("usage") val usage: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("threadId", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DType_1fbc0e0d79", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("usage", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProceduresubagentSubscribeResultU2DHistoryU2DItem_db70082117.Serializer::class)
sealed interface ProceduresubagentSubscribeResultU2DHistoryU2DItem_db70082117 {
    data class Option1(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D1_2778fa8937) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_db70082117
    data class Option2(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D2_66846085f3) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_db70082117
    data class Option3(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D3_4244283735) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_db70082117
    data class Option4(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D4_85d2dd31fd) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_db70082117
    data class Option5(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5_f92e78d240) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_db70082117
    data class Option6(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D6_c55a346c73) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_db70082117
    data class Option7(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D7_1371f7bedc) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_db70082117
    data class Option8(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8_996ce1c4e0) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_db70082117
    data class Option9(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9_cdd89e732d) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_db70082117
    data class Option10(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10_baf4f355dd) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_db70082117
    data class Option11(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11_7cccbb4b01) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_db70082117
    data class Option12(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12_15179deb98) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_db70082117
    data class Option13(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D13_e011332682) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_db70082117
    data class Option14(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D14_2a107f95a9) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_db70082117
    data class Option15(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D15_9da23fadb8) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_db70082117
    data class Option16(val value: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D16_d42bf49d95) : ProceduresubagentSubscribeResultU2DHistoryU2DItem_db70082117
    object Serializer : KSerializer<ProceduresubagentSubscribeResultU2DHistoryU2DItem_db70082117> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProceduresubagentSubscribeResultU2DHistoryU2DItem_db70082117")
        override fun deserialize(decoder: Decoder): ProceduresubagentSubscribeResultU2DHistoryU2DItem_db70082117 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProceduresubagentSubscribeResultU2DHistoryU2DItem_db70082117 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProceduresubagentSubscribeResultU2DHistoryU2DItem_db70082117>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("session.started")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D1_2778fa8937>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("session.exited")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D2_66846085f3>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("turn.started")))) { Option3(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D3_4244283735>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("turn.completed")))) { Option4(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D4_85d2dd31fd>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("item.started")))) { Option5(jsonDecoder.json.decodeFromJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5_f92e78d240>(element)) }
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
            return RemoteUnionCodec.single("ProceduresubagentSubscribeResultU2DHistoryU2DItem_db70082117", matches)
        }
        override fun serialize(encoder: Encoder, value: ProceduresubagentSubscribeResultU2DHistoryU2DItem_db70082117) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProceduresubagentSubscribeResultU2DHistoryU2DItem_db70082117 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D1_2778fa8937>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D2_66846085f3>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D3_4244283735>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D4_85d2dd31fd>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5_f92e78d240>(value.value)
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
data class ProceduresubagentSubscribeResult_1caa7842d1(
    @SerialName("history") val history: List<ProceduresubagentSubscribeResultU2DHistoryU2DItem_db70082117>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("history", "List<ProceduresubagentSubscribeResultU2DHistoryU2DItem_db70082117>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureupdateAgentBinaryRequest_580654e207(
    @SerialName("agentKind") val agentKind: String,
    @SerialName("envKind") val envKind: ProcedureauthenticateAcpAgentRequestU2DEnvKind_9eed5c4959,
    @SerialName("wslDistro") val wslDistro: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("envKind", "ProcedureauthenticateAcpAgentRequestU2DEnvKind_9eed5c4959", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslDistro", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureupdateAgentBinaryResultU2DStrategy_b82b9e494d {
    @SerialName("built-in") BUILTU2DIN,
    @SerialName("npm-global") NPMU2DGLOBAL,
    @SerialName("pnpm-global") PNPMU2DGLOBAL,
    @SerialName("bun-global") BUNU2DGLOBAL,
    @SerialName("brew") BREW,
    @SerialName("winget") WINGET,
    @SerialName("installer") INSTALLER,
    @SerialName("unsupported") UNSUPPORTED,
}

@Serializable
data class ProcedureupdateAgentBinaryResult_0d863fe350(
    @SerialName("ok") val ok: Boolean,
    @SerialName("output") val output: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("strategy") val strategy: RemoteField<ProcedureupdateAgentBinaryResultU2DStrategy_b82b9e494d> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("ok", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("output", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("strategy", "ProcedureupdateAgentBinaryResultU2DStrategy_b82b9e494d", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurewaitMcpServerOauthRequestU2DCallback_53db4bb96e(
    @SerialName("serverUrl") val serverUrl: String,
    @SerialName("url") val url: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("serverUrl", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "String", true, false, null, null, 1, 8192, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurewaitMcpServerOauthRequest_58cefff26a(
    @SerialName("callback") val callback: RemoteField<ProcedurewaitMcpServerOauthRequestU2DCallback_53db4bb96e> = RemoteField.Missing,
    @SerialName("flowId") val flowId: String,
    @SerialName("projectLocation") val projectLocation: RemoteField<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("callback", "ProcedurewaitMcpServerOauthRequestU2DCallback_53db4bb96e", false, false, null, null, null, null, null, null, null, null, listOf()),
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
