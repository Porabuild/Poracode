// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DChildIdentity_1b0d78a343(
    @SerialName("desktopId") val desktopId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("desktopId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DCredential_d06f3ce55d {
    @SerialName("configured") CONFIGURED,
    @SerialName("none") NONE,
}

@Serializable
enum class RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DDesired_abff99d05c {
    @SerialName("enabled") ENABLED,
    @SerialName("disabled") DISABLED,
}

@Serializable
enum class RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DLastErrorU2DCode_2fbfd962f5 {
    @SerialName("environment/not-found") ENVIRONMENTU2FNOTU2DFOUND,
    @SerialName("environment/revision-conflict") ENVIRONMENTU2FREVISIONU2DCONFLICT,
    @SerialName("environment/store-busy") ENVIRONMENTU2FSTOREU2DBUSY,
    @SerialName("environment/store-limit") ENVIRONMENTU2FSTOREU2DLIMIT,
    @SerialName("environment/store-unavailable") ENVIRONMENTU2FSTOREU2DUNAVAILABLE,
    @SerialName("environment/invalid-input") ENVIRONMENTU2FINVALIDU2DINPUT,
    @SerialName("environment/not-connected") ENVIRONMENTU2FNOTU2DCONNECTED,
    @SerialName("environment/trust-required") ENVIRONMENTU2FTRUSTU2DREQUIRED,
    @SerialName("environment/trust-changed") ENVIRONMENTU2FTRUSTU2DCHANGED,
    @SerialName("environment/trust-mismatch") ENVIRONMENTU2FTRUSTU2DMISMATCH,
    @SerialName("environment/hostkey-mismatch") ENVIRONMENTU2FHOSTKEYU2DMISMATCH,
    @SerialName("environment/identity-changed") ENVIRONMENTU2FIDENTITYU2DCHANGED,
    @SerialName("environment/credential-missing") ENVIRONMENTU2FCREDENTIALU2DMISSING,
    @SerialName("environment/owner-unverified") ENVIRONMENTU2FOWNERU2DUNVERIFIED,
    @SerialName("environment/owner-unresponsive") ENVIRONMENTU2FOWNERU2DUNRESPONSIVE,
    @SerialName("environment/owner-incompatible") ENVIRONMENTU2FOWNERU2DINCOMPATIBLE,
    @SerialName("environment/owner-busy") ENVIRONMENTU2FOWNERU2DBUSY,
    @SerialName("environment/owner-conflict") ENVIRONMENTU2FOWNERU2DCONFLICT,
    @SerialName("environment/launch-failed") ENVIRONMENTU2FLAUNCHU2DFAILED,
    @SerialName("environment/upgrade-unavailable") ENVIRONMENTU2FUPGRADEU2DUNAVAILABLE,
    @SerialName("environment/upgrade-refused") ENVIRONMENTU2FUPGRADEU2DREFUSED,
    @SerialName("environment/transport-error") ENVIRONMENTU2FTRANSPORTU2DERROR,
    @SerialName("environment/cancelled") ENVIRONMENTU2FCANCELLED,
    @SerialName("environment/internal-error") ENVIRONMENTU2FINTERNALU2DERROR,
    @SerialName("environment/not-authorized") ENVIRONMENTU2FNOTU2DAUTHORIZED,
}

@Serializable
data class RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DLastError_a03f50bc64(
    @SerialName("code") val code: RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DLastErrorU2DCode_2fbfd962f5,
    @SerialName("fingerprint") val fingerprint: RemoteField<String> = RemoteField.Missing,
    @SerialName("keyType") val keyType: RemoteField<String> = RemoteField.Missing,
    @SerialName("message") val message: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("code", "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DLastErrorU2DCode_2fbfd962f5", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fingerprint", "String", false, false, null, null, null, null, null, null, "^SHA256:[A-Za-z0-9+/]{43}$", null, listOf()),
            RemoteFieldDescriptor("keyType", "String", false, false, null, null, 1, 64, null, null, null, null, listOf("string.trim")),
            RemoteFieldDescriptor("message", "String", true, false, null, null, 1, 240, null, null, null, null, listOf("string.trim")),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DRuntime_83671e6428(
    @SerialName("appVersion") val appVersion: RemoteField<String> = RemoteField.Missing,
    @SerialName("hash") val hash: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("appVersion", "String", false, false, null, null, 1, 64, null, null, null, null, listOf("string.trim")),
            RemoteFieldDescriptor("hash", "String", true, false, null, null, null, null, null, null, "^[a-f0-9]{64}$", null, listOf()),
        ), listOf())
    }
}
