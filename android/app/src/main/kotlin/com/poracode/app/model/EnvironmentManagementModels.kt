package com.poracode.app.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * App-owned projections of the C1 environment management routes (ADR §5).
 *
 * The generated Kotlin bindings validate and canonicalize every response
 * [JsonElement] before these models see it, so this file only mirrors the
 * public shape and keeps generated hash-suffixed names out of the UI. No field
 * here carries a credential, a device-local path, a tunnel port, or a token.
 */
@Serializable
data class RemoteEnvironmentTrust(
    val state: String,
    val observedFingerprint: String? = null,
    val hostKeyFingerprint: String? = null,
)

@Serializable
data class RemoteEnvironmentRuntime(
    val hash: String,
    val appVersion: String? = null,
)

@Serializable
data class RemoteEnvironmentChildIdentity(
    val desktopId: String,
)

@Serializable
data class RemoteEnvironmentPublicError(
    val code: String,
    val message: String,
    val fingerprint: String? = null,
    val keyType: String? = null,
)

@Serializable
data class RemoteEnvironmentProjection(
    val environmentId: String,
    val revision: Int,
    val label: String,
    val target: String,
    val port: Int? = null,
    val trust: RemoteEnvironmentTrust,
    val runtime: RemoteEnvironmentRuntime,
    val credential: String,
    val childIdentity: RemoteEnvironmentChildIdentity? = null,
    val legacyConnectionIds: List<String> = emptyList(),
    val desired: String,
    val state: String,
    val lastError: RemoteEnvironmentPublicError? = null,
) {
    val credentialConfigured: Boolean get() = credential == "configured"
    val desiredEnabled: Boolean get() = desired == "enabled"
    val connected: Boolean get() = state == "connected"

    /** State categories the parent reports; a client presents them, never persists them. */
    val isRepairState: Boolean
        get() = state == "needs-repair" ||
            state == "identity-changed" ||
            state == "hostkey-mismatch" ||
            state == "credential-missing" ||
            state == "owner-unverified"
}
@Serializable
data class RemoteEnvironmentListView(
    val environments: List<RemoteEnvironmentProjection> = emptyList(),
)

@Serializable
data class RemoteEnvironmentEnvelope(
    val environment: RemoteEnvironmentProjection,
)

@Serializable
data class RemoteEnvironmentPairing(
    val environmentId: String,
    val endpoint: String,
    val pairingCredential: String,
    val childDesktopId: String,
)

@Serializable
data class RemoteEnvironmentPairingEnvelope(
    val pairing: RemoteEnvironmentPairing,
)

@Serializable
data class RemoteEnvironmentTrustProbeResult(
    val fingerprint: String,
    val keyType: String,
)

/** `POST /api/environments` body. Null fields are omitted, matching the strict wire schema. */
data class RemoteEnvironmentCreateRequest(
    val label: String,
    val target: String,
    val port: Int? = null,
    val credentialRef: String? = null,
    val desired: String? = null,
    val legacyConnectionId: String? = null,
) {
    fun toJson(): JsonObject = buildJsonObject {
        put("label", label)
        put("target", target)
        port?.let { put("port", it) }
        credentialRef?.let { put("credentialRef", it) }
        desired?.let { put("desired", it) }
        legacyConnectionId?.let { put("legacyConnectionId", it) }
    }
}

/**
 * `POST /api/environments/{id}` patch. Absent fields stay unchanged; `clearPort`
 * and `clearCredentialRef` send the explicit `null` the strict wire schema uses
 * to clear a durable field.
 */
data class RemoteEnvironmentUpdatePatch(
    val label: String? = null,
    val target: String? = null,
    val port: Int? = null,
    val clearPort: Boolean = false,
    val credentialRef: String? = null,
    val clearCredentialRef: Boolean = false,
    val desired: String? = null,
) {
    fun toJson(): JsonObject = buildJsonObject {
        label?.let { put("label", it) }
        target?.let { put("target", it) }
        when {
            clearPort -> put("port", JsonNull)
            port != null -> put("port", JsonPrimitive(port))
        }
        when {
            clearCredentialRef -> put("credentialRef", JsonNull)
            credentialRef != null -> put("credentialRef", JsonPrimitive(credentialRef))
        }
        desired?.let { put("desired", it) }
    }
}
