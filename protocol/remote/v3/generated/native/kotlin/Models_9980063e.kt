// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D10_14f3c332d5(
    @SerialName("applicationId") val applicationId: String,
    @SerialName("type") val type: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D10U2DType_bd9ee7d624,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("applicationId", "String", true, false, null, null, 3, 255, null, null, "^[A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z][A-Za-z0-9_]*)+$", null, listOf()),
            RemoteFieldDescriptor("type", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D10U2DType_bd9ee7d624", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D11U2DType_d585eadabc {
    @SerialName("powerOff") POWEROFF,
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D11_fd4fd2eb41(
    @SerialName("type") val type: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D11U2DType_d585eadabc,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("type", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D11U2DType_d585eadabc", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D1U2DType_6f5fd1f783 {
    @SerialName("read") READ,
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D1_9d4f8a22a3(
    @SerialName("type") val type: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D1U2DType_6f5fd1f783,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("type", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D1U2DType_6f5fd1f783", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D2U2DType_c5a25a4322 {
    @SerialName("appearance") APPEARANCE,
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D2U2DValue_8e9c16e558 {
    @SerialName("light") LIGHT,
    @SerialName("dark") DARK,
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D2_0b5555e2ca(
    @SerialName("type") val type: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D2U2DType_c5a25a4322,
    @SerialName("value") val value: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D2U2DValue_8e9c16e558,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("type", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D2U2DType_c5a25a4322", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("value", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D2U2DValue_8e9c16e558", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D3U2DType_c8c48a1118 {
    @SerialName("textSize") TEXTSIZE,
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D3U2DValue_f0f815c9ec {
    @SerialName("small") SMALL,
    @SerialName("standard") STANDARD,
    @SerialName("large") LARGE,
    @SerialName("extraLarge") EXTRALARGE,
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D3_72a4809a8d(
    @SerialName("type") val type: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D3U2DType_c8c48a1118,
    @SerialName("value") val value: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D3U2DValue_f0f815c9ec,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("type", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D3U2DType_c8c48a1118", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("value", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D3U2DValue_f0f815c9ec", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D4U2DType_4311a74add {
    @SerialName("orientation") ORIENTATION,
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D4U2DValue_d61b01c8cb {
    @SerialName("portrait") PORTRAIT,
    @SerialName("landscapeLeft") LANDSCAPELEFT,
    @SerialName("upsideDown") UPSIDEDOWN,
    @SerialName("landscapeRight") LANDSCAPERIGHT,
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D4_feff20c88b(
    @SerialName("type") val type: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D4U2DType_4311a74add,
    @SerialName("value") val value: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D4U2DValue_d61b01c8cb,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("type", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D4U2DType_4311a74add", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("value", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D4U2DValue_d61b01c8cb", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D5U2DType_3ac0e8087f {
    @SerialName("reduceMotion") REDUCEMOTION,
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D5_ca98effeea(
    @SerialName("enabled") val enabled: Boolean,
    @SerialName("type") val type: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D5U2DType_3ac0e8087f,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("enabled", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D5U2DType_3ac0e8087f", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D6U2DType_d4757acfcd {
    @SerialName("network") NETWORK,
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D6_596b826e91(
    @SerialName("enabled") val enabled: Boolean,
    @SerialName("type") val type: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D6U2DType_d4757acfcd,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("enabled", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D6U2DType_d4757acfcd", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D7U2DType_1a0723da99 {
    @SerialName("location") LOCATION,
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D7_dfbf83bd74(
    @SerialName("latitude") val latitude: Double,
    @SerialName("longitude") val longitude: Double,
    @SerialName("type") val type: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D7U2DType_1a0723da99,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("latitude", "Double", true, false, -90.0, 90.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("longitude", "Double", true, false, -180.0, 180.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D7U2DType_1a0723da99", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D8U2DDecision_ff4e0a6efa {
    @SerialName("grant") GRANT,
    @SerialName("revoke") REVOKE,
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D8U2DPermission_f6dd22a2a9 {
    @SerialName("camera") CAMERA,
    @SerialName("microphone") MICROPHONE,
    @SerialName("photos") PHOTOS,
    @SerialName("contacts") CONTACTS,
    @SerialName("calendar") CALENDAR,
    @SerialName("location") LOCATION,
    @SerialName("notifications") NOTIFICATIONS,
    @SerialName("motion") MOTION,
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D8U2DType_592634b895 {
    @SerialName("permission") PERMISSION,
}

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
