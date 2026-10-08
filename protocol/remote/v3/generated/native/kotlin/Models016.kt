// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class RoutebrowserU2DCommandResponse_1b7f16955d(
    @SerialName("state") val state: RoutebrowserU2DCommandResponseU2DState_ecc6edb616,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("state", "RoutebrowserU2DCommandResponseU2DState_ecc6edb616", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutecatalogU2DMembershipRequest_2b8805d864(
    @SerialName("projectIds") val projectIds: RemoteField<List<String>> = RemoteField.Missing,
    @SerialName("threadIds") val threadIds: RemoteField<List<String>> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("projectIds", "List<String>", false, false, null, null, null, null, null, 200, null, null, listOf()),
            RemoteFieldDescriptor("threadIds", "List<String>", false, false, null, null, null, null, null, 200, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutecatalogU2DMembershipResponse_afbf6761fa(
    @SerialName("existingProjectIds") val existingProjectIds: List<String>,
    @SerialName("existingThreadIds") val existingThreadIds: List<String>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("existingProjectIds", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("existingThreadIds", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DAdoptU2DLegacyPath_149c9d9dd2(
    @SerialName("environmentId") val environmentId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("environmentId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DAdoptU2DLegacyRequest_399c72fc19(
    @SerialName("expectedRevision") val expectedRevision: Long,
    @SerialName("legacyConnectionId") val legacyConnectionId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("expectedRevision", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("legacyConnectionId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
        ), listOf())
    }
}

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

@Serializable
enum class RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DState_2c13d2fc1c {
    @SerialName("disconnected") DISCONNECTED,
    @SerialName("connecting") CONNECTING,
    @SerialName("connected") CONNECTED,
    @SerialName("error") ERROR,
    @SerialName("credential-missing") CREDENTIALU2DMISSING,
    @SerialName("owner-unverified") OWNERU2DUNVERIFIED,
    @SerialName("identity-changed") IDENTITYU2DCHANGED,
    @SerialName("hostkey-mismatch") HOSTKEYU2DMISMATCH,
    @SerialName("needs-repair") NEEDSU2DREPAIR,
    @SerialName("trust-required") TRUSTU2DREQUIRED,
}

@Serializable
enum class RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D1U2DState_7ee0d4255f {
    @SerialName("unknown") UNKNOWN,
}

@Serializable
data class RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D1_1fb6f9ae5f(
    @SerialName("state") val state: RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D1U2DState_7ee0d4255f,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("state", "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D1U2DState_7ee0d4255f", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D2U2DState_f6c555fb5f {
    @SerialName("observed") OBSERVED,
}

@Serializable
data class RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D2_6f5cce5ce1(
    @SerialName("observedFingerprint") val observedFingerprint: String,
    @SerialName("state") val state: RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D2U2DState_f6c555fb5f,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("observedFingerprint", "String", true, false, null, null, null, null, null, null, "^SHA256:[A-Za-z0-9+/]{43}$", null, listOf()),
            RemoteFieldDescriptor("state", "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D2U2DState_f6c555fb5f", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D3U2DState_eaed5114fa {
    @SerialName("pinned") PINNED,
}

@Serializable
data class RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D3_e213e5cbde(
    @SerialName("hostKeyFingerprint") val hostKeyFingerprint: String,
    @SerialName("observedFingerprint") val observedFingerprint: RemoteField<String> = RemoteField.Missing,
    @SerialName("state") val state: RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D3U2DState_eaed5114fa,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("hostKeyFingerprint", "String", true, false, null, null, null, null, null, null, "^SHA256:[A-Za-z0-9+/]{43}$", null, listOf()),
            RemoteFieldDescriptor("observedFingerprint", "String", false, false, null, null, null, null, null, null, "^SHA256:[A-Za-z0-9+/]{43}$", null, listOf()),
            RemoteFieldDescriptor("state", "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D3U2DState_eaed5114fa", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrust_ecde1f3c1f.Serializer::class)
sealed interface RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrust_ecde1f3c1f {
    data class Option1(val value: RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D1_1fb6f9ae5f) : RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrust_ecde1f3c1f
    data class Option2(val value: RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D2_6f5cce5ce1) : RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrust_ecde1f3c1f
    data class Option3(val value: RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D3_e213e5cbde) : RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrust_ecde1f3c1f
    object Serializer : KSerializer<RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrust_ecde1f3c1f> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrust_ecde1f3c1f")
        override fun deserialize(decoder: Decoder): RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrust_ecde1f3c1f {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrust_ecde1f3c1f supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrust_ecde1f3c1f>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "state", listOf(JsonPrimitive("unknown")))) { Option1(jsonDecoder.json.decodeFromJsonElement<RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D1_1fb6f9ae5f>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "state", listOf(JsonPrimitive("observed")))) { Option2(jsonDecoder.json.decodeFromJsonElement<RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D2_6f5cce5ce1>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, RemoteUnionCodec.matchesProperty(element, "state", listOf(JsonPrimitive("pinned")))) { Option3(jsonDecoder.json.decodeFromJsonElement<RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D3_e213e5cbde>(element)) }
            return RemoteUnionCodec.single("RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrust_ecde1f3c1f", matches)
        }
        override fun serialize(encoder: Encoder, value: RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrust_ecde1f3c1f) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrust_ecde1f3c1f supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D1_1fb6f9ae5f>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D2_6f5cce5ce1>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D3_e213e5cbde>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironment_d832acd230(
    @SerialName("childIdentity") val childIdentity: RemoteField<RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DChildIdentity_1b0d78a343> = RemoteField.Missing,
    @SerialName("createdAt") val createdAt: Long,
    @SerialName("credential") val credential: RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DCredential_d06f3ce55d,
    @SerialName("desired") val desired: RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DDesired_abff99d05c,
    @SerialName("environmentId") val environmentId: String,
    @SerialName("label") val label: String,
    @SerialName("lastError") val lastError: RemoteField<RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DLastError_a03f50bc64> = RemoteField.Missing,
    @SerialName("legacyConnectionIds") val legacyConnectionIds: List<String>,
    @SerialName("port") val port: RemoteField<Long> = RemoteField.Missing,
    @SerialName("revision") val revision: Long,
    @SerialName("runtime") val runtime: RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DRuntime_83671e6428,
    @SerialName("state") val state: RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DState_2c13d2fc1c,
    @SerialName("target") val target: String,
    @SerialName("trust") val trust: RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrust_ecde1f3c1f,
    @SerialName("updatedAt") val updatedAt: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("childIdentity", "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DChildIdentity_1b0d78a343", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("createdAt", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("credential", "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DCredential_d06f3ce55d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("desired", "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DDesired_abff99d05c", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("environmentId", "String", true, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, 1, 100, null, null, null, null, listOf("string.trim")),
            RemoteFieldDescriptor("lastError", "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DLastError_a03f50bc64", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("legacyConnectionIds", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("port", "Long", false, false, 1.0, 65535.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("revision", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtime", "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DRuntime_83671e6428", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("state", "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DState_2c13d2fc1c", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("target", "String", true, false, null, null, 1, 255, null, null, "^(?!-)(?:[^\\s@/:]+@)?[^\\s@/:]+$", null, listOf("string.trim")),
            RemoteFieldDescriptor("trust", "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrust_ecde1f3c1f", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("updatedAt", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DAdoptU2DLegacyResponse_8428abfcec(
    @SerialName("environment") val environment: RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironment_d832acd230,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("environment", "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironment_d832acd230", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DCreateRequest_ccc27289c7(
    @SerialName("credentialRef") val credentialRef: RemoteField<String> = RemoteField.Missing,
    @SerialName("desired") val desired: RemoteField<RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DDesired_abff99d05c> = RemoteField.Missing,
    @SerialName("label") val label: String,
    @SerialName("legacyConnectionId") val legacyConnectionId: RemoteField<String> = RemoteField.Missing,
    @SerialName("port") val port: RemoteField<Long> = RemoteField.Missing,
    @SerialName("target") val target: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("credentialRef", "String", false, false, null, null, 1, 128, null, null, "^(?!.*\\.\\.)[A-Za-z0-9][A-Za-z0-9._:-]*$", null, listOf()),
            RemoteFieldDescriptor("desired", "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DDesired_abff99d05c", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, 1, 100, null, null, null, null, listOf("string.trim")),
            RemoteFieldDescriptor("legacyConnectionId", "String", false, false, null, null, null, null, null, null, "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", "uuid", listOf()),
            RemoteFieldDescriptor("port", "Long", false, false, 1.0, 65535.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("target", "String", true, false, null, null, 1, 255, null, null, "^(?!-)(?:[^\\s@/:]+@)?[^\\s@/:]+$", null, listOf("string.trim")),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DDeleteRequest_939b432562(
    @SerialName("expectedRevision") val expectedRevision: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("expectedRevision", "Long", true, false, 1.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DDeleteResponse_badd682f35(
    @SerialName("ok") val ok: ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("ok", "ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteenvironmentU2DLegacyResponseU2DAuthU2DBootstrapMethodsU2DItem_0dd86a486b {
    @SerialName("one-time-token") ONEU2DTIMEU2DTOKEN,
}

@Serializable
enum class RouteenvironmentU2DLegacyResponseU2DAuthU2DPolicy_995ee3e349 {
    @SerialName("remote-reachable") REMOTEU2DREACHABLE,
}

@Serializable
enum class RouteenvironmentU2DLegacyResponseU2DAuthU2DSessionMethodsU2DItem_b5e66c2e96 {
    @SerialName("bearer-access-token") BEARERU2DACCESSU2DTOKEN,
}

@Serializable
data class RouteenvironmentU2DLegacyResponseU2DAuth_2a8bc62fab(
    @SerialName("bootstrapMethods") val bootstrapMethods: List<RouteenvironmentU2DLegacyResponseU2DAuthU2DBootstrapMethodsU2DItem_0dd86a486b>,
    @SerialName("policy") val policy: RouteenvironmentU2DLegacyResponseU2DAuthU2DPolicy_995ee3e349,
    @SerialName("scopes") val scopes: List<String>,
    @SerialName("sessionMethods") val sessionMethods: List<RouteenvironmentU2DLegacyResponseU2DAuthU2DSessionMethodsU2DItem_b5e66c2e96>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("bootstrapMethods", "List<RouteenvironmentU2DLegacyResponseU2DAuthU2DBootstrapMethodsU2DItem_0dd86a486b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("policy", "RouteenvironmentU2DLegacyResponseU2DAuthU2DPolicy_995ee3e349", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scopes", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sessionMethods", "List<RouteenvironmentU2DLegacyResponseU2DAuthU2DSessionMethodsU2DItem_b5e66c2e96>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574(
    @SerialName("versions") val versions: List<Long>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("versions", "List<Long>", true, false, null, null, null, null, 1, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DLegacyResponseU2DCapabilities_be2c1cee8c(
    @SerialName("boundedCatalogChanges") val boundedCatalogChanges: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = RemoteField.Missing,
    @SerialName("browserForward") val browserForward: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = RemoteField.Missing,
    @SerialName("catalogMutations") val catalogMutations: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = RemoteField.Missing,
    @SerialName("experiments") val experiments: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = RemoteField.Missing,
    @SerialName("projectCommandResults") val projectCommandResults: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = RemoteField.Missing,
    @SerialName("pushRouting") val pushRouting: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = RemoteField.Missing,
    @SerialName("runtimeHistoryNotices") val runtimeHistoryNotices: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = RemoteField.Missing,
    @SerialName("sshEnvironments") val sshEnvironments: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = RemoteField.Missing,
    @SerialName("terminalCursorSync") val terminalCursorSync: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = RemoteField.Missing,
    @SerialName("threadLaunchMetadata") val threadLaunchMetadata: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("boundedCatalogChanges", "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("browserForward", "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("catalogMutations", "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("experiments", "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectCommandResults", "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pushRouting", "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("runtimeHistoryNotices", "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sshEnvironments", "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("terminalCursorSync", "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadLaunchMetadata", "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RouteenvironmentU2DLegacyResponseU2DEndpoints_17c2b8a253(
    @SerialName("httpBaseUrl") val httpBaseUrl: String,
    @SerialName("wsBaseUrl") val wsBaseUrl: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("httpBaseUrl", "String", true, false, null, null, null, null, null, null, null, "uri", listOf()),
            RemoteFieldDescriptor("wsBaseUrl", "String", true, false, null, null, null, null, null, null, null, "uri", listOf()),
        ), listOf())
    }
}

@Serializable
enum class RouteenvironmentU2DLegacyResponseU2DHostMode_d1d1696e7d {
    @SerialName("desktop") DESKTOP,
    @SerialName("helper") HELPER,
}

@Serializable
enum class RouteenvironmentU2DLegacyResponseU2DPlatform_7583b8d37f {
    @SerialName("win32") WIN32,
    @SerialName("darwin") DARWIN,
    @SerialName("linux") LINUX,
}

typealias RouteenvironmentU2DLegacyResponseU2DProtocolVersion_1f7ce34362 = Double
