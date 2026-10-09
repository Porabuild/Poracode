// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
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

typealias RouteenvironmentU2DLegacyResponseU2DProtocolVersion_905aab80ce = Double

@Serializable
data class RouteenvironmentU2DLegacyResponse_bef078cd6b(
    @SerialName("appVersion") val appVersion: String,
    @SerialName("auth") val auth: RouteenvironmentU2DLegacyResponseU2DAuth_2a8bc62fab,
    @SerialName("capabilities") val capabilities: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilities_be2c1cee8c> = RemoteField.Missing,
    @SerialName("desktopId") val desktopId: String,
    @SerialName("endpoints") val endpoints: RouteenvironmentU2DLegacyResponseU2DEndpoints_17c2b8a253,
    @SerialName("hostMode") val hostMode: RemoteField<RouteenvironmentU2DLegacyResponseU2DHostMode_d1d1696e7d> = RemoteField.Missing,
    @SerialName("label") val label: String,
    @SerialName("platform") val platform: RemoteField<RouteenvironmentU2DLegacyResponseU2DPlatform_7583b8d37f> = RemoteField.Missing,
    @SerialName("protocolVersion") val protocolVersion: RouteenvironmentU2DLegacyResponseU2DProtocolVersion_905aab80ce,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("appVersion", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("auth", "RouteenvironmentU2DLegacyResponseU2DAuth_2a8bc62fab", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("capabilities", "RouteenvironmentU2DLegacyResponseU2DCapabilities_be2c1cee8c", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("desktopId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("endpoints", "RouteenvironmentU2DLegacyResponseU2DEndpoints_17c2b8a253", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("hostMode", "RouteenvironmentU2DLegacyResponseU2DHostMode_d1d1696e7d", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("platform", "RouteenvironmentU2DLegacyResponseU2DPlatform_7583b8d37f", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("protocolVersion", "RouteenvironmentU2DLegacyResponseU2DProtocolVersion_905aab80ce", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

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
