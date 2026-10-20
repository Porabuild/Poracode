// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D8_861b7e521a(
    @SerialName("applicationId") val applicationId: String,
    @SerialName("decision") val decision: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D8U2DDecision_ff4e0a6efa,
    @SerialName("permission") val permission: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D8U2DPermission_f6dd22a2a9,
    @SerialName("type") val type: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D8U2DType_592634b895,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("applicationId", "String", true, false, null, null, 3, 255, null, null, "^[A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z][A-Za-z0-9_]*)+$", null, listOf()),
            RemoteFieldDescriptor("decision", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D8U2DDecision_ff4e0a6efa", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("permission", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D8U2DPermission_f6dd22a2a9", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D8U2DType_592634b895", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D9U2DType_921834989f {
    @SerialName("openUrl") OPENURL,
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D9_3935a65be8(
    @SerialName("type") val type: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D9U2DType_921834989f,
    @SerialName("url") val url: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("type", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D9U2DType_921834989f", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "String", true, false, null, null, 1, 4096, null, null, "^(?!(?:javascript|data|file|content|intent|about):)[A-Za-z][A-Za-z0-9+.-]*:\\/\\/[^\\s]+$", null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863.Serializer::class)
sealed interface RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863 {
    data class Option1(val value: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D1_9d4f8a22a3) : RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863
    data class Option2(val value: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D2_0b5555e2ca) : RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863
    data class Option3(val value: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D3_72a4809a8d) : RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863
    data class Option4(val value: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D4_feff20c88b) : RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863
    data class Option5(val value: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D5_ca98effeea) : RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863
    data class Option6(val value: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D6_596b826e91) : RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863
    data class Option7(val value: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D7_dfbf83bd74) : RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863
    data class Option8(val value: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D8_861b7e521a) : RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863
    data class Option9(val value: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D9_3935a65be8) : RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863
    data class Option10(val value: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D10_14f3c332d5) : RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863
    data class Option11(val value: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D11_fd4fd2eb41) : RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863
    object Serializer : KSerializer<RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863")
        override fun deserialize(decoder: Decoder): RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("read")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D1_9d4f8a22a3>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("appearance")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D2_0b5555e2ca>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("textSize")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D3_72a4809a8d>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("orientation")))) { Option4(jsonDecoder.json.decodeFromJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D4_feff20c88b>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("reduceMotion")))) { Option5(jsonDecoder.json.decodeFromJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D5_ca98effeea>(element)) }
            RemoteUnionCodec.tryOption(matches, 6, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("network")))) { Option6(jsonDecoder.json.decodeFromJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D6_596b826e91>(element)) }
            RemoteUnionCodec.tryOption(matches, 7, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("location")))) { Option7(jsonDecoder.json.decodeFromJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D7_dfbf83bd74>(element)) }
            RemoteUnionCodec.tryOption(matches, 8, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("permission")))) { Option8(jsonDecoder.json.decodeFromJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D8_861b7e521a>(element)) }
            RemoteUnionCodec.tryOption(matches, 9, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("openUrl")))) { Option9(jsonDecoder.json.decodeFromJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D9_3935a65be8>(element)) }
            RemoteUnionCodec.tryOption(matches, 10, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("launchApp")))) { Option10(jsonDecoder.json.decodeFromJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D10_14f3c332d5>(element)) }
            RemoteUnionCodec.tryOption(matches, 11, RemoteUnionCodec.matchesProperty(element, "type", listOf(JsonPrimitive("powerOff")))) { Option11(jsonDecoder.json.decodeFromJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D11_fd4fd2eb41>(element)) }
            return RemoteUnionCodec.single("RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D1_9d4f8a22a3>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D2_0b5555e2ca>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D3_72a4809a8d>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D4_feff20c88b>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D5_ca98effeea>(value.value)
                is Option6 -> jsonEncoder.json.encodeToJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D6_596b826e91>(value.value)
                is Option7 -> jsonEncoder.json.encodeToJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D7_dfbf83bd74>(value.value)
                is Option8 -> jsonEncoder.json.encodeToJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D8_861b7e521a>(value.value)
                is Option9 -> jsonEncoder.json.encodeToJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D9_3935a65be8>(value.value)
                is Option10 -> jsonEncoder.json.encodeToJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D10_14f3c332d5>(value.value)
                is Option11 -> jsonEncoder.json.encodeToJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D11_fd4fd2eb41>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D6U2DKind_6eed5e1fa2 {
    @SerialName("control") CONTROL,
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D6_0b2ba27512(
    @SerialName("control") val control: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863,
    @SerialName("kind") val kind: RoutedeviceU2DActionRequestU2DOptionU2D6U2DKind_6eed5e1fa2,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("control", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DKind_6eed5e1fa2", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RoutedeviceU2DActionRequest_c37d7c3aee.Serializer::class)
sealed interface RoutedeviceU2DActionRequest_c37d7c3aee {
    data class Option1(val value: RoutedeviceU2DActionRequestU2DOptionU2D1_6ddf4b7dc1) : RoutedeviceU2DActionRequest_c37d7c3aee
    data class Option2(val value: RoutedeviceU2DActionRequestU2DOptionU2D2_2c6061a21f) : RoutedeviceU2DActionRequest_c37d7c3aee
    data class Option3(val value: RoutedeviceU2DActionRequestU2DOptionU2D3_8c04d0a06a) : RoutedeviceU2DActionRequest_c37d7c3aee
    data class Option4(val value: RoutedeviceU2DActionRequestU2DOptionU2D4_83384e1a09) : RoutedeviceU2DActionRequest_c37d7c3aee
    data class Option5(val value: RoutedeviceU2DActionRequestU2DOptionU2D5_a36830c34a) : RoutedeviceU2DActionRequest_c37d7c3aee
    data class Option6(val value: RoutedeviceU2DActionRequestU2DOptionU2D6_0b2ba27512) : RoutedeviceU2DActionRequest_c37d7c3aee
    object Serializer : KSerializer<RoutedeviceU2DActionRequest_c37d7c3aee> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RoutedeviceU2DActionRequest_c37d7c3aee")
        override fun deserialize(decoder: Decoder): RoutedeviceU2DActionRequest_c37d7c3aee {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RoutedeviceU2DActionRequest_c37d7c3aee supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RoutedeviceU2DActionRequest_c37d7c3aee>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("tap")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D1_6ddf4b7dc1>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("swipe")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D2_2c6061a21f>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("text")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D3_8c04d0a06a>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("key")))) { Option4(jsonDecoder.json.decodeFromJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D4_83384e1a09>(element)) }
            RemoteUnionCodec.tryOption(matches, 5, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("start")))) { Option5(jsonDecoder.json.decodeFromJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D5_a36830c34a>(element)) }
            RemoteUnionCodec.tryOption(matches, 6, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("control")))) { Option6(jsonDecoder.json.decodeFromJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D6_0b2ba27512>(element)) }
            return RemoteUnionCodec.single("RoutedeviceU2DActionRequest_c37d7c3aee", matches)
        }
        override fun serialize(encoder: Encoder, value: RoutedeviceU2DActionRequest_c37d7c3aee) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RoutedeviceU2DActionRequest_c37d7c3aee supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D1_6ddf4b7dc1>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D2_2c6061a21f>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D3_8c04d0a06a>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D4_83384e1a09>(value.value)
                is Option5 -> jsonEncoder.json.encodeToJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D5_a36830c34a>(value.value)
                is Option6 -> jsonEncoder.json.encodeToJsonElement<RoutedeviceU2DActionRequestU2DOptionU2D6_0b2ba27512>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class RoutedeviceU2DActionResponseU2DControlsU2DAppearance_9ea58f9bfc {
    @SerialName("light") LIGHT,
    @SerialName("dark") DARK,
    @SerialName("system") SYSTEM,
}

@Serializable
data class RoutedeviceU2DActionResponseU2DControls_8971fe1e2b(
    @SerialName("appearance") val appearance: RemoteField<RoutedeviceU2DActionResponseU2DControlsU2DAppearance_9ea58f9bfc> = RemoteField.Missing,
    @SerialName("fontScale") val fontScale: RemoteField<Double> = RemoteField.Missing,
    @SerialName("networkEnabled") val networkEnabled: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("reduceMotion") val reduceMotion: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("appearance", "RoutedeviceU2DActionResponseU2DControlsU2DAppearance_9ea58f9bfc", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fontScale", "Double", false, false, null, 10.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("networkEnabled", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("reduceMotion", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutedeviceU2DActionResponse_64ba4037c0(
    @SerialName("controls") val controls: RemoteField<RoutedeviceU2DActionResponseU2DControls_8971fe1e2b> = RemoteField.Missing,
    @SerialName("delivered") val delivered: ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("controls", "RoutedeviceU2DActionResponseU2DControls_8971fe1e2b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("delivered", "ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DAttachRequestU2DAccess_9ca4aec6d4 {
    @SerialName("view") VIEW,
    @SerialName("control") CONTROL,
}

@Serializable
enum class RoutedeviceU2DAttachRequestU2DAgentAccess_e6bc2fd97b {
    @SerialName("none") NONE,
    @SerialName("view") VIEW,
    @SerialName("control") CONTROL,
}

@Serializable
data class RoutedeviceU2DAttachRequest_77bd08fa0d(
    @SerialName("access") val access: RoutedeviceU2DAttachRequestU2DAccess_9ca4aec6d4,
    @SerialName("agentAccess") val agentAccess: RoutedeviceU2DAttachRequestU2DAgentAccess_e6bc2fd97b,
    @SerialName("deviceId") val deviceId: String,
    @SerialName("generation") val generation: String,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("access", "RoutedeviceU2DAttachRequestU2DAccess_9ca4aec6d4", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("agentAccess", "RoutedeviceU2DAttachRequestU2DAgentAccess_e6bc2fd97b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("deviceId", "String", true, false, null, null, 1, 256, null, null, null, null, listOf()),
            RemoteFieldDescriptor("generation", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DAttachResponseU2DDeviceU2DControlsU2DActionsU2DItem_a76106fec0 {
    @SerialName("read") READ,
    @SerialName("appearance") APPEARANCE,
    @SerialName("textSize") TEXTSIZE,
    @SerialName("orientation") ORIENTATION,
    @SerialName("reduceMotion") REDUCEMOTION,
    @SerialName("network") NETWORK,
    @SerialName("location") LOCATION,
    @SerialName("permission") PERMISSION,
    @SerialName("openUrl") OPENURL,
    @SerialName("launchApp") LAUNCHAPP,
    @SerialName("powerOff") POWEROFF,
}

@Serializable
data class RoutedeviceU2DAttachResponseU2DDeviceU2DControls_edaad5a427(
    @SerialName("actions") val actions: List<RoutedeviceU2DAttachResponseU2DDeviceU2DControlsU2DActionsU2DItem_a76106fec0>,
    @SerialName("bootId") val bootId: String,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("actions", "List<RoutedeviceU2DAttachResponseU2DDeviceU2DControlsU2DActionsU2DItem_a76106fec0>", true, false, null, null, null, null, null, 16, null, null, listOf()),
            RemoteFieldDescriptor("bootId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DAttachResponseU2DDeviceU2DPlatform_61e54b5f67 {
    @SerialName("ios") IOS,
    @SerialName("android") ANDROID,
}

@Serializable
enum class RoutedeviceU2DAttachResponseU2DDeviceU2DState_51b8dd6450 {
    @SerialName("running") RUNNING,
    @SerialName("stopped") STOPPED,
    @SerialName("starting") STARTING,
}

@Serializable
data class RoutedeviceU2DAttachResponseU2DDevice_4b43828b17(
    @SerialName("accessibility") val accessibility: Boolean,
    @SerialName("controls") val controls: RemoteField<RoutedeviceU2DAttachResponseU2DDeviceU2DControls_edaad5a427> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("input") val input: Boolean,
    @SerialName("name") val name: String,
    @SerialName("platform") val platform: RoutedeviceU2DAttachResponseU2DDeviceU2DPlatform_61e54b5f67,
    @SerialName("state") val state: RoutedeviceU2DAttachResponseU2DDeviceU2DState_51b8dd6450,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("accessibility", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("controls", "RoutedeviceU2DAttachResponseU2DDeviceU2DControls_edaad5a427", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, 256, null, null, null, null, listOf()),
            RemoteFieldDescriptor("input", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, null, 256, null, null, null, null, listOf()),
            RemoteFieldDescriptor("platform", "RoutedeviceU2DAttachResponseU2DDeviceU2DPlatform_61e54b5f67", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("state", "RoutedeviceU2DAttachResponseU2DDeviceU2DState_51b8dd6450", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutedeviceU2DAttachResponse_11e04e93bd(
    @SerialName("access") val access: RoutedeviceU2DAttachRequestU2DAccess_9ca4aec6d4,
    @SerialName("agentAccess") val agentAccess: RoutedeviceU2DAttachRequestU2DAgentAccess_e6bc2fd97b,
    @SerialName("device") val device: RoutedeviceU2DAttachResponseU2DDevice_4b43828b17,
    @SerialName("expiresAt") val expiresAt: Double,
    @SerialName("generation") val generation: String,
    @SerialName("id") val id: String,
    @SerialName("threadId") val threadId: String,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("access", "RoutedeviceU2DAttachRequestU2DAccess_9ca4aec6d4", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("agentAccess", "RoutedeviceU2DAttachRequestU2DAgentAccess_e6bc2fd97b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("device", "RoutedeviceU2DAttachResponseU2DDevice_4b43828b17", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("expiresAt", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("generation", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutedeviceU2DDetachResponse_badd682f35(
    @SerialName("ok") val ok: ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("ok", "ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DFrameResponseU2DMimeType_262f4ae537 {
    @SerialName("image/jpeg") IMAGEU2FJPEG,
}

@Serializable
data class RoutedeviceU2DFrameResponse_605d108f87(
    @SerialName("base64") val base64: String,
    @SerialName("capturedAt") val capturedAt: Double,
    @SerialName("height") val height: Long,
    @SerialName("id") val id: String,
    @SerialName("mimeType") val mimeType: RoutedeviceU2DFrameResponseU2DMimeType_262f4ae537,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72,
    @SerialName("width") val width: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("base64", "String", true, false, null, null, null, 349528, null, null, null, null, listOf()),
            RemoteFieldDescriptor("capturedAt", "Double", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("height", "Long", true, false, null, 2048.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("mimeType", "RoutedeviceU2DFrameResponseU2DMimeType_262f4ae537", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("width", "Long", true, false, null, 2048.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DInspectResponseU2DFormat_f1ccd99fb2 {
    @SerialName("android-uiautomator-xml") ANDROIDU2DUIAUTOMATORU2DXML,
    @SerialName("ios-idb-json") IOSU2DIDBU2DJSON,
}

@Serializable
data class RoutedeviceU2DInspectResponse_b664e76046(
    @SerialName("format") val format: RoutedeviceU2DInspectResponseU2DFormat_f1ccd99fb2,
    @SerialName("text") val text: String,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("format", "RoutedeviceU2DInspectResponseU2DFormat_f1ccd99fb2", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("text", "String", true, false, null, null, null, 128000, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DInventoryResponseU2DPlatformsU2DItemU2DStatus_9ab386636c {
    @SerialName("ready") READY,
    @SerialName("unsupported_host") UNSUPPORTEDU5FHOST,
    @SerialName("missing_sdk") MISSINGU5FSDK,
    @SerialName("missing_xcode") MISSINGU5FXCODE,
    @SerialName("missing_idb") MISSINGU5FIDB,
    @SerialName("unavailable") UNAVAILABLE,
}

@Serializable
data class RoutedeviceU2DInventoryResponseU2DPlatformsU2DItem_97a2308a40(
    @SerialName("diagnostic") val diagnostic: RemoteField<String> = RemoteField.Missing,
    @SerialName("platform") val platform: RoutedeviceU2DAttachResponseU2DDeviceU2DPlatform_61e54b5f67,
    @SerialName("status") val status: RoutedeviceU2DInventoryResponseU2DPlatformsU2DItemU2DStatus_9ab386636c,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("diagnostic", "String", false, false, null, null, null, 2000, null, null, null, null, listOf()),
            RemoteFieldDescriptor("platform", "RoutedeviceU2DAttachResponseU2DDeviceU2DPlatform_61e54b5f67", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("status", "RoutedeviceU2DInventoryResponseU2DPlatformsU2DItemU2DStatus_9ab386636c", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutedeviceU2DInventoryResponse_32a902996b(
    @SerialName("devices") val devices: List<RoutedeviceU2DAttachResponseU2DDevice_4b43828b17>,
    @SerialName("generation") val generation: String,
    @SerialName("platforms") val platforms: List<RoutedeviceU2DInventoryResponseU2DPlatformsU2DItem_97a2308a40>,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("devices", "List<RoutedeviceU2DAttachResponseU2DDevice_4b43828b17>", true, false, null, null, null, null, null, 128, null, null, listOf()),
            RemoteFieldDescriptor("generation", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("platforms", "List<RoutedeviceU2DInventoryResponseU2DPlatformsU2DItem_97a2308a40>", true, false, null, null, null, null, null, 2, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutedeviceU2DPreviewU2DAndroidU2DApiQuery_bb755d8d8c(
    @SerialName("device") val device: RemoteField<String> = RemoteField.Missing,
    @SerialName("previewId") val previewId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("device", "String", false, false, null, null, 1, 256, null, null, null, null, listOf()),
            RemoteFieldDescriptor("previewId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutedeviceU2DPreviewU2DAndroidU2DApiResponseU2DSize_ece1ba6d7e(
    @SerialName("height") val height: Long,
    @SerialName("width") val width: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("height", "Long", true, false, 1.0, 16384.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("width", "Long", true, false, 1.0, 16384.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DPreviewU2DAndroidU2DApiResponseU2DStreamU2DTransport_e37012a6e5 {
    @SerialName("websocket") WEBSOCKET,
}
