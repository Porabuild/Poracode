// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RouteenvironmentU2DListResponse_700ee4302b(
    @SerialName("environments") val environments: List<RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironment_d832acd230>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("environments", "List<RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironment_d832acd230>", true, false, null, null, null, null, null, 1000, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DMediaU2DReleaseRequest_0e0641a133(
    @SerialName("ticket") val ticket: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("ticket", "String", true, false, null, null, null, null, null, null, "^pc_media_[A-Za-z0-9_-]{43}$", null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DMediaU2DRenewResponse_eaa8e54151(
    @SerialName("expiresAt") val expiresAt: String,
    @SerialName("ticket") val ticket: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("expiresAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("ticket", "String", true, false, null, null, null, null, null, null, "^pc_media_[A-Za-z0-9_-]{43}$", null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DMediaU2DTicketRequest_aa35b4044d(
    @SerialName("childTicket") val childTicket: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("childTicket", "String", true, false, null, null, null, null, null, null, "^pc_media_[A-Za-z0-9_-]{43}$", null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DPairingResponseU2DPairing_3f3680e577(
    @SerialName("childDesktopId") val childDesktopId: String,
    @SerialName("endpoint") val endpoint: String,
    @SerialName("environmentId") val environmentId: String,
    @SerialName("pairingCredential") val pairingCredential: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("childDesktopId", "String", true, false, null, null, 1, 256, null, null, null, null, listOf()),
            RemoteFieldDescriptor("endpoint", "String", true, false, null, null, 1, 512, null, null, null, null, listOf()),
            RemoteFieldDescriptor("environmentId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("pairingCredential", "String", true, false, null, null, 1, 512, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DPairingResponse_4a927b60e4(
    @SerialName("pairing") val pairing: RouteenvironmentU2DPairingResponseU2DPairing_3f3680e577,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("pairing", "RouteenvironmentU2DPairingResponseU2DPairing_3f3680e577", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DTrustU2DAcceptRequest_67373e1601(
    @SerialName("expectedRevision") val expectedRevision: Long,
    @SerialName("fingerprint") val fingerprint: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("expectedRevision", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fingerprint", "String", true, false, null, null, null, null, null, null, "^SHA256:[A-Za-z0-9+/]{43}$", null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DTrustU2DProbeResponse_45d8e163d2(
    @SerialName("fingerprint") val fingerprint: String,
    @SerialName("keyType") val keyType: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("fingerprint", "String", true, false, null, null, null, null, null, null, "^SHA256:[A-Za-z0-9+/]{43}$", null, listOf()),
            RemoteFieldDescriptor("keyType", "String", true, false, null, null, 1, 64, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias RouteenvironmentU2DUpdateRequestU2DPatchU2DCredentialRef_c223d7ef6a = String?

typealias RouteenvironmentU2DUpdateRequestU2DPatchU2DPort_6db9f33ca9 = Long?

@Serializable
data class RouteenvironmentU2DUpdateRequestU2DPatch_2a5c67603f(
    @SerialName("credentialRef") val credentialRef: RemoteField<String> = RemoteField.Missing,
    @SerialName("desired") val desired: RemoteField<RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DDesired_abff99d05c> = RemoteField.Missing,
    @SerialName("label") val label: RemoteField<String> = RemoteField.Missing,
    @SerialName("port") val port: RemoteField<Long> = RemoteField.Missing,
    @SerialName("target") val target: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("credentialRef", "String", false, true, null, null, 1, 128, null, null, "^(?!.*\\.\\.)[A-Za-z0-9][A-Za-z0-9._:-]*$", null, listOf()),
            RemoteFieldDescriptor("desired", "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DDesired_abff99d05c", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", false, false, null, null, 1, 100, null, null, null, null, listOf("string.trim")),
            RemoteFieldDescriptor("port", "Long", false, true, 1.0, 65535.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("target", "String", false, false, null, null, 1, 255, null, null, "^(?!-)(?:[^\\s@/:]+@)?[^\\s@/:]+$", null, listOf("string.trim")),
        ), listOf())
    }
}
