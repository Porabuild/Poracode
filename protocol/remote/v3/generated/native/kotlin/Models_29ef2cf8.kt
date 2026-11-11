// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable(with = ProcedurehexVoiceResult_46060d35e2.Serializer::class)
sealed interface ProcedurehexVoiceResult_46060d35e2 {
    data class Option1(val value: ProcedurehexVoiceResultU2DOptionU2D1_1a747af71d) : ProcedurehexVoiceResult_46060d35e2
    data class Option2(val value: ProcedurehexVoiceResultU2DOptionU2D2_a04ed36706) : ProcedurehexVoiceResult_46060d35e2
    data class Option3(val value: ProcedurehexVoiceResultU2DOptionU2D3_e6b4674777) : ProcedurehexVoiceResult_46060d35e2
    data class Option4(val value: ProcedurehexVoiceResultU2DOptionU2D4_fc3e1f61a4) : ProcedurehexVoiceResult_46060d35e2
    data class Option5(val value: ProcedurehexVoiceResultU2DOptionU2D5_812ec408f3) : ProcedurehexVoiceResult_46060d35e2
    object Serializer : KSerializer<ProcedurehexVoiceResult_46060d35e2> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedurehexVoiceResult_46060d35e2")
        override fun deserialize(decoder: Decoder): ProcedurehexVoiceResult_46060d35e2 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedurehexVoiceResult_46060d35e2 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedurehexVoiceResult_46060d35e2>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("setup")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedurehexVoiceResultU2DOptionU2D1_1a747af71d>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("catalog")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedurehexVoiceResultU2DOptionU2D2_a04ed36706>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("job")))) { Option3(jsonDecoder.json.decodeFromJsonElement<ProcedurehexVoiceResultU2DOptionU2D3_e6b4674777>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("cancelled")))) { Option4(jsonDecoder.json.decodeFromJsonElement<ProcedurehexVoiceResultU2DOptionU2D4_fc3e1f61a4>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("error")))) { Option5(jsonDecoder.json.decodeFromJsonElement<ProcedurehexVoiceResultU2DOptionU2D5_812ec408f3>(element)) }
            return RemoteUnionCodec.single("ProcedurehexVoiceResult_46060d35e2", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedurehexVoiceResult_46060d35e2) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedurehexVoiceResult_46060d35e2 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedurehexVoiceResultU2DOptionU2D1_1a747af71d>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedurehexVoiceResultU2DOptionU2D2_a04ed36706>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<ProcedurehexVoiceResultU2DOptionU2D3_e6b4674777>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<ProcedurehexVoiceResultU2DOptionU2D4_fc3e1f61a4>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<ProcedurehexVoiceResultU2DOptionU2D5_812ec408f3>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class ProcedureimportSkillsRequestU2DSkillsU2DItemU2DAvailability_9c8337f42f {
    @SerialName("shared") SHARED,
    @SerialName("poracode") PORACODE,
}

@Serializable
enum class ProcedureimportSkillsRequestU2DSkillsU2DItemU2DMode_aa2d0958d3 {
    @SerialName("copy") COPY,
    @SerialName("link") LINK,
}

@Serializable
data class ProcedureimportSkillsRequestU2DSkillsU2DItem_a02c812507(
    @SerialName("availability") val availability: RemoteField<ProcedureimportSkillsRequestU2DSkillsU2DItemU2DAvailability_9c8337f42f> = RemoteField.Missing,
    @SerialName("destinationScope") val destinationScope: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11,
    @SerialName("mode") val mode: ProcedureimportSkillsRequestU2DSkillsU2DItemU2DMode_aa2d0958d3,
    @SerialName("projectLocation") val projectLocation: RemoteField<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154> = RemoteField.Missing,
    @SerialName("replace") val replace: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("sourcePath") val sourcePath: String,
    @SerialName("sourceProjectLocation") val sourceProjectLocation: RemoteField<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154> = RemoteField.Missing,
    @SerialName("sourceWslDistro") val sourceWslDistro: RemoteField<String> = RemoteField.Missing,
    @SerialName("wslDistro") val wslDistro: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("availability", "ProcedureimportSkillsRequestU2DSkillsU2DItemU2DAvailability_9c8337f42f", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("destinationScope", "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mode", "ProcedureimportSkillsRequestU2DSkillsU2DItemU2DMode_aa2d0958d3", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("replace", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sourcePath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sourceProjectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sourceWslDistro", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslDistro", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
