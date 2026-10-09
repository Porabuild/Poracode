// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable(with = ProcedurecloneRepoRequestU2DSource_76b2c94b29.Serializer::class)
sealed interface ProcedurecloneRepoRequestU2DSource_76b2c94b29 {
    data class Option1(val value: ProcedurecloneRepoRequestU2DSourceU2DOptionU2D1_06735b175e) : ProcedurecloneRepoRequestU2DSource_76b2c94b29
    data class Option2(val value: ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2_f97770a7e3) : ProcedurecloneRepoRequestU2DSource_76b2c94b29
    object Serializer : KSerializer<ProcedurecloneRepoRequestU2DSource_76b2c94b29> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedurecloneRepoRequestU2DSource_76b2c94b29")
        override fun deserialize(decoder: Decoder): ProcedurecloneRepoRequestU2DSource_76b2c94b29 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedurecloneRepoRequestU2DSource_76b2c94b29 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedurecloneRepoRequestU2DSource_76b2c94b29>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("url")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedurecloneRepoRequestU2DSourceU2DOptionU2D1_06735b175e>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("github")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2_f97770a7e3>(element)) }
            return RemoteUnionCodec.single("ProcedurecloneRepoRequestU2DSource_76b2c94b29", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedurecloneRepoRequestU2DSource_76b2c94b29) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedurecloneRepoRequestU2DSource_76b2c94b29 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedurecloneRepoRequestU2DSourceU2DOptionU2D1_06735b175e>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2_f97770a7e3>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class ProcedurecloneRepoRequest_482895ec91(
    @SerialName("name") val name: String,
    @SerialName("parentLocation") val parentLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("source") val source: ProcedurecloneRepoRequestU2DSource_76b2c94b29,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("parentLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("source", "ProcedurecloneRepoRequestU2DSource_76b2c94b29", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurecloneRepoResult_6a0c18e639(
    @SerialName("path") val path: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureconnectThreadVoiceRequestU2DConfigU2DExecutionEnvironment_4cd2587996(
    @SerialName("distro") val distro: String,
    @SerialName("kind") val kind: ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D2U2DKind_2d8274eae5,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("distro", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D2U2DKind_2d8274eae5", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureconnectThreadVoiceRequestU2DConfigU2DMode_01e21946e9 {
    @SerialName("agent") AGENT,
    @SerialName("plan") PLAN,
    @SerialName("autopilot") AUTOPILOT,
}

@Serializable
data class ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D1_adaa80878b(
    @SerialName("contextSize") val contextSize: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("effort") val effort: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("fast") val fast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("thinking") val thinking: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("contextSize", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("effort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("thinking", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D2_d1624ea0ec(
    @SerialName("contextSize") val contextSize: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("effort") val effort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("fast") val fast: Boolean,
    @SerialName("thinking") val thinking: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("contextSize", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("effort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fast", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("thinking", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D3_2840caeaed(
    @SerialName("contextSize") val contextSize: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("effort") val effort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("fast") val fast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("thinking") val thinking: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("contextSize", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("effort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("thinking", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D4_94dda13e1c(
    @SerialName("contextSize") val contextSize: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("effort") val effort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("fast") val fast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("thinking") val thinking: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("contextSize", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("effort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("thinking", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc.Serializer::class)
sealed interface ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc {
    data class Option1(val value: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D1_adaa80878b) : ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc
    data class Option2(val value: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D2_d1624ea0ec) : ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc
    data class Option3(val value: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D3_2840caeaed) : ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc
    data class Option4(val value: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D4_94dda13e1c) : ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc
    object Serializer : KSerializer<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc")
        override fun deserialize(decoder: Decoder): ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc>>()
            RemoteUnionCodec.tryOption(matches, 1, element is JsonObject) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D1_adaa80878b>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, element is JsonObject) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D2_d1624ea0ec>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, element is JsonObject) { Option3(jsonDecoder.json.decodeFromJsonElement<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D3_2840caeaed>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, element is JsonObject) { Option4(jsonDecoder.json.decodeFromJsonElement<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D4_94dda13e1c>(element)) }
            return RemoteUnionCodec.first("ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D1_adaa80878b>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D2_d1624ea0ec>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D3_2840caeaed>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D4_94dda13e1c>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DKind_452e07a326 {
    @SerialName("family-member") FAMILYU2DMEMBER,
}

@Serializable
enum class ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6 {
    @SerialName("terminal") TERMINAL,
    @SerialName("gui") GUI,
}

@Serializable
data class ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwner_a8eb5a0e02(
    @SerialName("agentInstanceId") val agentInstanceId: RemoteField<String> = RemoteField.Missing,
    @SerialName("agentKind") val agentKind: String,
    @SerialName("presentationMode") val presentationMode: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("agentInstanceId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationMode", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72 = Double

@Serializable
data class ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBinding_a11ab76af3(
    @SerialName("inertValues") val inertValues: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc,
    @SerialName("kind") val kind: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DKind_452e07a326,
    @SerialName("model") val model: String,
    @SerialName("owner") val owner: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwner_a8eb5a0e02,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("inertValues", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DKind_452e07a326", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("owner", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwner_a8eb5a0e02", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureconnectThreadVoiceRequestU2DConfig_c721e8abc0(
    @SerialName("approvalPolicy") val approvalPolicy: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("approvalsReviewer") val approvalsReviewer: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("browserMcp") val browserMcp: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("chromeMcp") val chromeMcp: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("computerUse") val computerUse: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("contextSize") val contextSize: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("crossagentMcp") val crossagentMcp: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("effort") val effort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("executionEnvironment") val executionEnvironment: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DExecutionEnvironment_4cd2587996> = RemoteField.Missing,
    @SerialName("fast") val fast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("mode") val mode: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DMode_01e21946e9> = RemoteField.Missing,
    @SerialName("model") val model: String,
    @SerialName("sandboxMode") val sandboxMode: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("selectionBinding") val selectionBinding: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBinding_a11ab76af3> = RemoteField.Missing,
    @SerialName("thinking") val thinking: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("approvalPolicy", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("approvalsReviewer", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("browserMcp", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("chromeMcp", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("computerUse", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("contextSize", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("crossagentMcp", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("effort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("executionEnvironment", "ProcedureconnectThreadVoiceRequestU2DConfigU2DExecutionEnvironment_4cd2587996", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mode", "ProcedureconnectThreadVoiceRequestU2DConfigU2DMode_01e21946e9", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sandboxMode", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("selectionBinding", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBinding_a11ab76af3", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("thinking", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureconnectThreadVoiceRequest_4bb9a58c89(
    @SerialName("config") val config: ProcedureconnectThreadVoiceRequestU2DConfig_c721e8abc0,
    @SerialName("connectionId") val connectionId: String,
    @SerialName("offerSdp") val offerSdp: String,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("config", "ProcedureconnectThreadVoiceRequestU2DConfig_c721e8abc0", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("connectionId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("offerSdp", "String", true, false, null, null, 1, 64000, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureconnectThreadVoiceResult_871fe12f7d(
    @SerialName("answerSdp") val answerSdp: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("answerSdp", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurecreateFileCheckpointRequest_412fb1bbf4(
    @SerialName("checkpointItemId") val checkpointItemId: String,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("checkpointItemId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurecreateFileCheckpointResultU2DCheckpoint_938414fbfa(
    @SerialName("capturedAt") val capturedAt: String,
    @SerialName("checkpointItemId") val checkpointItemId: String,
    @SerialName("commit") val commit: String,
    @SerialName("ref") val ref: String,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("capturedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("checkpointItemId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("commit", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ref", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurecreateFileCheckpointResult_012b6b31ad(
    @SerialName("checkpoint") val checkpoint: ProcedurecreateFileCheckpointResultU2DCheckpoint_938414fbfa,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("checkpoint", "ProcedurecreateFileCheckpointResultU2DCheckpoint_938414fbfa", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurecreateProjectEntryRequest_5027b509e8(
    @SerialName("path") val path: String,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("type") val type: ProcedurebrowseHostDirectoryResultU2DEntriesU2DItemU2DType_8d3732b59a,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurebrowseHostDirectoryResultU2DEntriesU2DItemU2DType_8d3732b59a", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurecreateRevertAnchorRequest_f517019a44(
    @SerialName("config") val config: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfig_c721e8abc0> = RemoteField.Missing,
    @SerialName("numTurns") val numTurns: Long,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("config", "ProcedureconnectThreadVoiceRequestU2DConfig_c721e8abc0", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("numTurns", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurecreateRevertAnchorResultU2DAnchor_98ef330d70(
    @SerialName("data") val data: JsonElement,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("data", "JsonElement", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurecreateRevertAnchorResult_8d15f7f900(
    @SerialName("anchor") val anchor: ProcedurecreateRevertAnchorResultU2DAnchor_98ef330d70,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("anchor", "ProcedurecreateRevertAnchorResultU2DAnchor_98ef330d70", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduredeleteProjectEntryRequest_56df8e6416(
    @SerialName("path") val path: String,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduredeleteSkillRequest_3df4f14bf2(
    @SerialName("absolutePath") val absolutePath: String,
    @SerialName("projectLocation") val projectLocation: RemoteField<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154> = RemoteField.Missing,
    @SerialName("wslDistro") val wslDistro: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("absolutePath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslDistro", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduredetectSetupScriptRequest_5e3a19fb85(
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduredetectSetupScriptResult_18b29df576(
    @SerialName("setupScript") val setupScript: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("setupScript", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
