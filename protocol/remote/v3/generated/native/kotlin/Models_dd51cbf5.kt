// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable(with = ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntry_29b593c001.Serializer::class)
sealed interface ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntry_29b593c001 {
    data class Option1(val value: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1_eb074c0332) : ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntry_29b593c001
    data class Option2(val value: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D2_2504426b50) : ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntry_29b593c001
    object Serializer : KSerializer<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntry_29b593c001> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntry_29b593c001")
        override fun deserialize(decoder: Decoder): ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntry_29b593c001 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntry_29b593c001 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntry_29b593c001>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("ready")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1_eb074c0332>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "status", listOf(JsonPrimitive("unavailable")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D2_2504426b50>(element)) }
            return RemoteUnionCodec.single("ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntry_29b593c001", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntry_29b593c001) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntry_29b593c001 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntryU2DOptionU2D1_eb074c0332>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D2_2504426b50>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

typealias ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DVersion_cf69e7793f = Double

@Serializable
data class ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3_d518d195e8(
    @SerialName("entry") val entry: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntry_29b593c001,
    @SerialName("version") val version: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DVersion_cf69e7793f,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("entry", "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntry_29b593c001", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DVersion_cf69e7793f", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItem_e6e7f052c9.Serializer::class)
sealed interface ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItem_e6e7f052c9 {
    data class Option1(val value: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1_3e32158939) : ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItem_e6e7f052c9
    data class Option2(val value: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D2_d8c5ceac03) : ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItem_e6e7f052c9
    data class Option3(val value: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3_d518d195e8) : ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItem_e6e7f052c9
    object Serializer : KSerializer<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItem_e6e7f052c9> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItem_e6e7f052c9")
        override fun deserialize(decoder: Decoder): ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItem_e6e7f052c9 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItem_e6e7f052c9 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItem_e6e7f052c9>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "version", listOf(JsonPrimitive(1.0)))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1_3e32158939>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "version", listOf(JsonPrimitive(2.0)))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D2_d8c5ceac03>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "version", listOf(JsonPrimitive(5.0)))) { Option3(jsonDecoder.json.decodeFromJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3_d518d195e8>(element)) }
            return RemoteUnionCodec.single("ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItem_e6e7f052c9", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItem_e6e7f052c9) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItem_e6e7f052c9 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1_3e32158939>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D2_d8c5ceac03>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3_d518d195e8>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1_225be4c662(
    @SerialName("items") val items: List<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItem_e6e7f052c9>,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("items", "List<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItem_e6e7f052c9>", true, false, null, null, null, null, null, 4096, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedureworkflowAgentChatResultU2DItemPresentations_ef4fe17bb3.Serializer::class)
sealed interface ProcedureworkflowAgentChatResultU2DItemPresentations_ef4fe17bb3 {
    data class Option1(val value: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1_225be4c662) : ProcedureworkflowAgentChatResultU2DItemPresentations_ef4fe17bb3
    data class Option2(val value: ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D3U2DArguments_e6958017da) : ProcedureworkflowAgentChatResultU2DItemPresentations_ef4fe17bb3
    object Serializer : KSerializer<ProcedureworkflowAgentChatResultU2DItemPresentations_ef4fe17bb3> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedureworkflowAgentChatResultU2DItemPresentations_ef4fe17bb3")
        override fun deserialize(decoder: Decoder): ProcedureworkflowAgentChatResultU2DItemPresentations_ef4fe17bb3 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedureworkflowAgentChatResultU2DItemPresentations_ef4fe17bb3 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedureworkflowAgentChatResultU2DItemPresentations_ef4fe17bb3>>()
            RemoteUnionCodec.tryOption(matches, 1, element is JsonObject) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1_225be4c662>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, element is JsonObject) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D3U2DArguments_e6958017da>(element)) }
            return RemoteUnionCodec.first("ProcedureworkflowAgentChatResultU2DItemPresentations_ef4fe17bb3", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedureworkflowAgentChatResultU2DItemPresentations_ef4fe17bb3) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedureworkflowAgentChatResultU2DItemPresentations_ef4fe17bb3 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1_225be4c662>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D3U2DArguments_e6958017da>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class ProcedureworkflowAgentChatResult_039f0a59e6(
    @SerialName("events") val events: List<ProceduresubagentSubscribeResultU2DHistoryU2DItem_db70082117>,
    @SerialName("itemPresentations") val itemPresentations: RemoteField<ProcedureworkflowAgentChatResultU2DItemPresentations_ef4fe17bb3> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("events", "List<ProceduresubagentSubscribeResultU2DHistoryU2DItem_db70082117>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("itemPresentations", "ProcedureworkflowAgentChatResultU2DItemPresentations_ef4fe17bb3", false, false, null, null, null, null, null, null, null, null, listOf()),
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
    @SerialName("text") val text: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("timestamp") val timestamp: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("title") val title: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("role", "ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItemU2DChatU2DItemU2DRole_7e386bfca4", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("text", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("timestamp", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
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
    @SerialName("lastToolName") val lastToolName: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("model") val model: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("phaseIndex") val phaseIndex: RemoteField<Long> = RemoteField.Missing,
    @SerialName("phaseTitle") val phaseTitle: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("promptPreview") val promptPreview: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("queuedAt") val queuedAt: RemoteField<Long> = RemoteField.Missing,
    @SerialName("resultPreview") val resultPreview: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
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
            RemoteFieldDescriptor("lastToolName", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("phaseIndex", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("phaseTitle", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("promptPreview", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("queuedAt", "Long", false, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("resultPreview", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
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
    @SerialName("detail") val detail: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("title") val title: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agents", "List<ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItem_da546ba4a0>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("detail", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
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
    @SerialName("defaultModel") val defaultModel: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("durationMs") val durationMs: RemoteField<Long> = RemoteField.Missing,
    @SerialName("phases") val phases: List<ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItem_59cd628901>,
    @SerialName("runId") val runId: String,
    @SerialName("scriptPath") val scriptPath: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("startTime") val startTime: RemoteField<Long> = RemoteField.Missing,
    @SerialName("status") val status: ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DStatus_3a008e3c40,
    @SerialName("summary") val summary: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("taskId") val taskId: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
    @SerialName("totalTokens") val totalTokens: RemoteField<Long> = RemoteField.Missing,
    @SerialName("totalToolCalls") val totalToolCalls: RemoteField<Long> = RemoteField.Missing,
    @SerialName("unphasedAgents") val unphasedAgents: List<ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItem_da546ba4a0>,
    @SerialName("workflowName") val workflowName: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentCount", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("defaultModel", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("durationMs", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("phases", "List<ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItem_59cd628901>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scriptPath", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("startTime", "Long", false, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DStatus_3a008e3c40", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("summary", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("taskId", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("totalTokens", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("totalToolCalls", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("unphasedAgents", "List<ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItem_da546ba4a0>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("workflowName", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
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

@Serializable
data class ProcedurewriteExternalFileRequest_551f784ecd(
    @SerialName("absolutePath") val absolutePath: String,
    @SerialName("baseModifiedAtMs") val baseModifiedAtMs: Double,
    @SerialName("content") val content: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("absolutePath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("baseModifiedAtMs", "Double", true, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("content", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurewriteExternalFileResult_c5c2ecebba(
    @SerialName("modifiedAtMs") val modifiedAtMs: Double,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("modifiedAtMs", "Double", true, false, 0.0, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurewriteProjectFileRequest_aba5d69bfd(
    @SerialName("baseModifiedAtMs") val baseModifiedAtMs: Double,
    @SerialName("content") val content: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
    @SerialName("path") val path: String,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("baseModifiedAtMs", "Double", true, false, 0.0, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("content", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D1U2DKind_1f45188862 {
    @SerialName("create") CREATE,
}

@Serializable
data class RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D1U2DPayloadU2DEnvironmentU2DValue_2bbb36b09a(
    @SerialName("sensitive") val sensitive: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("value") val value: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("sensitive", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("value", "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D1U2DPayloadU2DEnvironment_75c2889f6a = Map<String, RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D1U2DPayloadU2DEnvironmentU2DValue_2bbb36b09a>

@Serializable
data class RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D1U2DPayload_7d60d2630c(
    @SerialName("config") val config: RemoteField<JsonElement> = RemoteField.Missing,
    @SerialName("displayName") val displayName: String,
    @SerialName("driver") val driver: String,
    @SerialName("environment") val environment: RemoteField<RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D1U2DPayloadU2DEnvironment_75c2889f6a> = RemoteField.Missing,
    @SerialName("id") val id: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("config", "JsonElement", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("displayName", "String", true, false, null, null, 1, 120, null, null, null, null, listOf()),
            RemoteFieldDescriptor("driver", "String", true, false, null, null, 1, 64, null, null, null, null, listOf()),
            RemoteFieldDescriptor("environment", "RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D1U2DPayloadU2DEnvironment_75c2889f6a", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, 120, null, null, "^[a-z0-9][a-z0-9_\\-:.]*\$", null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D1_4093b2937e(
    @SerialName("kind") val kind: RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D1U2DKind_1f45188862,
    @SerialName("payload") val payload: RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D1U2DPayload_7d60d2630c,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D1U2DKind_1f45188862", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("payload", "RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D1U2DPayload_7d60d2630c", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D2U2DKind_cbc64d1458 {
    @SerialName("update") UPDATE,
}

@Serializable
data class RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D2_bc854d61f3(
    @SerialName("config") val config: RemoteField<JsonElement> = RemoteField.Missing,
    @SerialName("displayName") val displayName: RemoteField<String> = RemoteField.Missing,
    @SerialName("enabled") val enabled: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("instanceId") val instanceId: String,
    @SerialName("kind") val kind: RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D2U2DKind_cbc64d1458,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("config", "JsonElement", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("displayName", "String", false, false, null, null, 1, 120, null, null, null, null, listOf()),
            RemoteFieldDescriptor("enabled", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("instanceId", "String", true, false, null, null, 1, 120, null, null, "^[a-z0-9][a-z0-9_\\-:.]*\$", null, listOf()),
            RemoteFieldDescriptor("kind", "RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D2U2DKind_cbc64d1458", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D3U2DKind_0082f8bcef {
    @SerialName("set-environment") SETU2DENVIRONMENT,
}

@Serializable
data class RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D3_145d8a7cba(
    @SerialName("environment") val environment: RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D1U2DPayloadU2DEnvironment_75c2889f6a,
    @SerialName("instanceId") val instanceId: String,
    @SerialName("kind") val kind: RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D3U2DKind_0082f8bcef,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("environment", "RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D1U2DPayloadU2DEnvironment_75c2889f6a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("instanceId", "String", true, false, null, null, 1, 120, null, null, "^[a-z0-9][a-z0-9_\\-:.]*\$", null, listOf()),
            RemoteFieldDescriptor("kind", "RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D3U2DKind_0082f8bcef", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D4_7bae770a0e(
    @SerialName("instanceId") val instanceId: String,
    @SerialName("kind") val kind: ProceduremanageModelProvidersRequestU2DOptionU2D3U2DAction_034741cb26,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("instanceId", "String", true, false, null, null, 1, 120, null, null, "^[a-z0-9][a-z0-9_\\-:.]*\$", null, listOf()),
            RemoteFieldDescriptor("kind", "ProceduremanageModelProvidersRequestU2DOptionU2D3U2DAction_034741cb26", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
