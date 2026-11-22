// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D6_452106e10e(
    @SerialName("angle") val angle: Long,
    @SerialName("kind") val kind: RoutedeviceU2DActionRequestU2DOptionU2D6U2DKind_6c7cb6fb41,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("angle", "Long", true, false, 0.0, 180.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DKind_6c7cb6fb41", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D10U2DType_bd9ee7d624 {
    @SerialName("launchApp") LAUNCHAPP,
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D10_14f3c332d5(
    @SerialName("applicationId") val applicationId: String,
    @SerialName("type") val type: RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D10U2DType_bd9ee7d624,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("applicationId", "String", true, false, null, null, 3, 255, null, null, "^[A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z][A-Za-z0-9_]*)+\$", null, listOf()),
            RemoteFieldDescriptor("type", "RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D10U2DType_bd9ee7d624", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D11U2DType_d585eadabc {
    @SerialName("powerOff") POWEROFF,
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D11_fd4fd2eb41(
    @SerialName("type") val type: RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D11U2DType_d585eadabc,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("type", "RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D11U2DType_d585eadabc", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D12_4d5808c99a(
    @SerialName("angle") val angle: Long,
    @SerialName("type") val type: RoutedeviceU2DActionRequestU2DOptionU2D6U2DKind_6c7cb6fb41,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("angle", "Long", true, false, 0.0, 180.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "RoutedeviceU2DActionRequestU2DOptionU2D6U2DKind_6c7cb6fb41", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D1U2DType_6f5fd1f783 {
    @SerialName("read") READ,
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D1_9d4f8a22a3(
    @SerialName("type") val type: RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D1U2DType_6f5fd1f783,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("type", "RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D1U2DType_6f5fd1f783", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D2U2DType_c5a25a4322 {
    @SerialName("appearance") APPEARANCE,
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D2U2DValue_8e9c16e558 {
    @SerialName("light") LIGHT,
    @SerialName("dark") DARK,
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D2_0b5555e2ca(
    @SerialName("type") val type: RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D2U2DType_c5a25a4322,
    @SerialName("value") val value: RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D2U2DValue_8e9c16e558,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("type", "RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D2U2DType_c5a25a4322", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("value", "RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D2U2DValue_8e9c16e558", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D3U2DType_c8c48a1118 {
    @SerialName("textSize") TEXTSIZE,
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D3U2DValue_f0f815c9ec {
    @SerialName("small") SMALL,
    @SerialName("standard") STANDARD,
    @SerialName("large") LARGE,
    @SerialName("extraLarge") EXTRALARGE,
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D3_72a4809a8d(
    @SerialName("type") val type: RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D3U2DType_c8c48a1118,
    @SerialName("value") val value: RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D3U2DValue_f0f815c9ec,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("type", "RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D3U2DType_c8c48a1118", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("value", "RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D3U2DValue_f0f815c9ec", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D4U2DType_4311a74add {
    @SerialName("orientation") ORIENTATION,
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D4U2DValue_d61b01c8cb {
    @SerialName("portrait") PORTRAIT,
    @SerialName("landscapeLeft") LANDSCAPELEFT,
    @SerialName("upsideDown") UPSIDEDOWN,
    @SerialName("landscapeRight") LANDSCAPERIGHT,
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D4_feff20c88b(
    @SerialName("type") val type: RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D4U2DType_4311a74add,
    @SerialName("value") val value: RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D4U2DValue_d61b01c8cb,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("type", "RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D4U2DType_4311a74add", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("value", "RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D4U2DValue_d61b01c8cb", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D5U2DType_3ac0e8087f {
    @SerialName("reduceMotion") REDUCEMOTION,
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D5_ca98effeea(
    @SerialName("enabled") val enabled: Boolean,
    @SerialName("type") val type: RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D5U2DType_3ac0e8087f,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("enabled", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D5U2DType_3ac0e8087f", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D6U2DType_d4757acfcd {
    @SerialName("network") NETWORK,
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D6_596b826e91(
    @SerialName("enabled") val enabled: Boolean,
    @SerialName("type") val type: RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D6U2DType_d4757acfcd,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("enabled", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D6U2DType_d4757acfcd", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D7U2DType_1a0723da99 {
    @SerialName("location") LOCATION,
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D7_dfbf83bd74(
    @SerialName("latitude") val latitude: Double,
    @SerialName("longitude") val longitude: Double,
    @SerialName("type") val type: RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D7U2DType_1a0723da99,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("latitude", "Double", true, false, -90.0, 90.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("longitude", "Double", true, false, -180.0, 180.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D7U2DType_1a0723da99", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D8U2DDecision_ff4e0a6efa {
    @SerialName("grant") GRANT,
    @SerialName("revoke") REVOKE,
}

@Serializable
enum class RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D8U2DPermission_f6dd22a2a9 {
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
enum class RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D8U2DType_592634b895 {
    @SerialName("permission") PERMISSION,
}

@Serializable
data class RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D8_861b7e521a(
    @SerialName("applicationId") val applicationId: String,
    @SerialName("decision") val decision: RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D8U2DDecision_ff4e0a6efa,
    @SerialName("permission") val permission: RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D8U2DPermission_f6dd22a2a9,
    @SerialName("type") val type: RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D8U2DType_592634b895,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("applicationId", "String", true, false, null, null, 3, 255, null, null, "^[A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z][A-Za-z0-9_]*)+\$", null, listOf()),
            RemoteFieldDescriptor("decision", "RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D8U2DDecision_ff4e0a6efa", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("permission", "RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D8U2DPermission_f6dd22a2a9", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D8U2DType_592634b895", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
