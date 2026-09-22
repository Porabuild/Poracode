package com.poracode.app.transport.environments

import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteEnvironmentCreateRequest
import com.poracode.app.model.RemoteEnvironmentEnvelope
import com.poracode.app.model.RemoteEnvironmentListView
import com.poracode.app.model.RemoteEnvironmentPairing
import com.poracode.app.model.RemoteEnvironmentPairingEnvelope
import com.poracode.app.model.RemoteEnvironmentProjection
import com.poracode.app.model.RemoteEnvironmentTrustProbeResult
import com.poracode.app.model.RemoteEnvironmentUpdatePatch
import com.poracode.app.model.RemoteJson
import com.poracode.app.model.RemoteWebSocketTicketResult
import com.poracode.app.transport.RemoteApiClient
import com.poracode.remote.v3.generated.RemoteContractMetadata
import com.poracode.remote.v3.generated.RemoteRootCodec
import com.poracode.remote.v3.generated.RemoteRootCodecs
import com.poracode.remote.v3.generated.routeU2EEnvironmentU2DAdoptU2DLegacyU2ERequest
import com.poracode.remote.v3.generated.routeU2EEnvironmentU2DAdoptU2DLegacyU2EResponse
import com.poracode.remote.v3.generated.routeU2EEnvironmentU2DCreateU2ERequest
import com.poracode.remote.v3.generated.routeU2EEnvironmentU2DDeleteU2ERequest
import com.poracode.remote.v3.generated.routeU2EEnvironmentU2DDeleteU2EResponse
import com.poracode.remote.v3.generated.routeU2EEnvironmentU2DListU2EResponse
import com.poracode.remote.v3.generated.routeU2EEnvironmentU2DPairingU2EResponse
import com.poracode.remote.v3.generated.routeU2EEnvironmentU2DTrustU2DAcceptU2ERequest
import com.poracode.remote.v3.generated.routeU2EEnvironmentU2DTrustU2DProbeU2EResponse
import com.poracode.remote.v3.generated.routeU2EEnvironmentU2DUpdateU2ERequest
import com.poracode.remote.v3.generated.routeU2EEnvironmentU2DWebsocketU2DTicketU2EResponse
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * C1 management surface (ADR §5 route matrix), implemented as extensions on the
 * bound [RemoteApiClient] so management authority is exactly the client's
 * endpoint plus `Authorization` bearer:
 *
 * - a direct/ssh client manages its own host's environment registry;
 * - an environment client manages the child host's registry through the
 *   one-hop parent proxy under the child grant, and a child without manage
 *   scopes answers its own 403 `missing_scope` (R4).
 *
 * There is deliberately no blanket authority throw and no second proxied hop:
 * pairing refuses an environment parent, so a client can never be bound to a
 * grandchild proxy. All bodies/responses pass through the generated validation
 * codecs ("[GeneratedEnvironmentContract]"); no protocol type is hand-written.
 */
object GeneratedEnvironmentContract {
    /**
     * Verifies the generated route registry still carries every environment
     * management route with the expected method/path (and scopes where the
     * route is used for read gating). Validation deliberately matches by
     * method + path so this app-owned facade never embeds route ids: the native
     * parity ledger keeps the android entries planned until a real device
     * journey exists, and the planned-absence check scans this source tree.
     */
    init {
        requireRoute("GET", "/api/environments", listOf("session:read"))
        requireRoute("POST", "/api/environments")
        requireRoute("GET", "/api/environments/{environmentId}", listOf("session:read"))
        requireRoute("POST", "/api/environments/{environmentId}")
        requireRoute("POST", "/api/environments/{environmentId}/delete")
        requireRoute("POST", "/api/environments/{environmentId}/connect")
        requireRoute("POST", "/api/environments/{environmentId}/disconnect")
        requireRoute("POST", "/api/environments/{environmentId}/pairing")
        requireRoute("POST", "/api/environments/{environmentId}/upgrade")
        requireRoute("POST", "/api/environments/{environmentId}/websocket-ticket")
        requireRoute("POST", "/api/environments/{environmentId}/trust-probe")
        requireRoute("POST", "/api/environments/{environmentId}/trust-accept")
        requireRoute("POST", "/api/environments/{environmentId}/adopt-legacy")
    }

    fun listResponse(raw: String): String = canonical(RemoteRootCodecs.routeU2EEnvironmentU2DListU2EResponse, raw)
    fun resultResponse(raw: String): String =
        canonical(RemoteRootCodecs.routeU2EEnvironmentU2DAdoptU2DLegacyU2EResponse, raw)
    fun deleteResponse(raw: String): String = canonical(RemoteRootCodecs.routeU2EEnvironmentU2DDeleteU2EResponse, raw)
    fun pairingResponse(raw: String): String = canonical(RemoteRootCodecs.routeU2EEnvironmentU2DPairingU2EResponse, raw)
    fun trustProbeResponse(raw: String): String = canonical(RemoteRootCodecs.routeU2EEnvironmentU2DTrustU2DProbeU2EResponse, raw)
    fun websocketTicketResponse(raw: String): String =
        canonical(RemoteRootCodecs.routeU2EEnvironmentU2DWebsocketU2DTicketU2EResponse, raw)

    fun createRequest(raw: String): String = canonical(RemoteRootCodecs.routeU2EEnvironmentU2DCreateU2ERequest, raw)
    fun updateRequest(raw: String): String = canonical(RemoteRootCodecs.routeU2EEnvironmentU2DUpdateU2ERequest, raw)
    fun trustAcceptRequest(raw: String): String =
        canonical(RemoteRootCodecs.routeU2EEnvironmentU2DTrustU2DAcceptU2ERequest, raw)
    fun adoptLegacyRequest(raw: String): String =
        canonical(RemoteRootCodecs.routeU2EEnvironmentU2DAdoptU2DLegacyU2ERequest, raw)
    fun expectedRevisionRequest(raw: String): String =
        canonical(RemoteRootCodecs.routeU2EEnvironmentU2DDeleteU2ERequest, raw)

    private fun canonical(codec: RemoteRootCodec<*>, raw: String): String = try {
        codec.decode(raw).validatedSnapshot.toString()
    } catch (_: Exception) {
        throw RemoteClientException.invalidResponse(
            "Remote environment contract validation failed at ${codec.id}.",
        )
    }

    private fun requireRoute(method: String, path: String, scopes: List<String>? = null) {
        val route = RemoteContractMetadata.routes.firstOrNull {
            it.method == method && it.path == path
        }
        require(route != null) {
            "Generated remote-v3 environment route metadata is incompatible: $method $path"
        }
        if (scopes != null) {
            check(route.scopes == scopes) {
                "Generated remote-v3 environment route scopes are incompatible: $path"
            }
        }
    }
}

suspend fun RemoteApiClient.listEnvironments(): List<RemoteEnvironmentProjection> {
    val raw = requestText(EnvironmentProtocol.MANAGEMENT_BASE_PATH)
    val canonical = GeneratedEnvironmentContract.listResponse(raw)
    return RemoteJson.decodeFromString<RemoteEnvironmentListView>(canonical).environments
}

suspend fun RemoteApiClient.getEnvironment(environmentId: String): RemoteEnvironmentProjection =
    environmentEnvelope(EnvironmentProtocol.managementPath(environmentId), "GET")

suspend fun RemoteApiClient.createEnvironment(
    body: RemoteEnvironmentCreateRequest,
): RemoteEnvironmentProjection {
    val canonical = GeneratedEnvironmentContract.createRequest(body.toJson().toString())
    return environmentEnvelope(EnvironmentProtocol.MANAGEMENT_BASE_PATH, "POST", canonical)
}

suspend fun RemoteApiClient.updateEnvironment(
    environmentId: String,
    expectedRevision: Int,
    patch: RemoteEnvironmentUpdatePatch,
): RemoteEnvironmentProjection {
    val body = buildJsonObject {
        put("expectedRevision", expectedRevision)
        put("patch", patch.toJson())
    }
    val canonical = GeneratedEnvironmentContract.updateRequest(body.toString())
    return environmentEnvelope(EnvironmentProtocol.managementPath(environmentId), "POST", canonical)
}

suspend fun RemoteApiClient.deleteEnvironment(environmentId: String, expectedRevision: Int) {
    val body = GeneratedEnvironmentContract.expectedRevisionRequest(
        expectedRevisionBody(expectedRevision),
    )
    val raw = requestText(
        EnvironmentProtocol.managementPath(environmentId, "delete"),
        method = "POST",
        jsonBody = body,
    )
    GeneratedEnvironmentContract.deleteResponse(raw)
}

suspend fun RemoteApiClient.connectEnvironment(environmentId: String): RemoteEnvironmentProjection =
    environmentEnvelope(EnvironmentProtocol.managementPath(environmentId, "connect"), "POST")

suspend fun RemoteApiClient.disconnectEnvironment(environmentId: String): RemoteEnvironmentProjection =
    environmentEnvelope(EnvironmentProtocol.managementPath(environmentId, "disconnect"), "POST")

suspend fun RemoteApiClient.pairEnvironment(environmentId: String): RemoteEnvironmentPairing {
    val raw = requestText(
        EnvironmentProtocol.managementPath(environmentId, "pairing"),
        method = "POST",
    )
    val canonical = GeneratedEnvironmentContract.pairingResponse(raw)
    return RemoteJson.decodeFromString<RemoteEnvironmentPairingEnvelope>(canonical).pairing
}

suspend fun RemoteApiClient.upgradeEnvironment(
    environmentId: String,
    expectedRevision: Int,
): RemoteEnvironmentProjection {
    val body = GeneratedEnvironmentContract.expectedRevisionRequest(
        expectedRevisionBody(expectedRevision),
    )
    return environmentEnvelope(
        EnvironmentProtocol.managementPath(environmentId, "upgrade"),
        "POST",
        body,
    )
}

/** Mints the parent environment-bound one-use upgrade ticket (`parentTicket`). */
suspend fun RemoteApiClient.environmentWebSocketTicket(
    environmentId: String,
): RemoteWebSocketTicketResult {
    val raw = requestText(
        EnvironmentProtocol.managementPath(environmentId, "websocket-ticket"),
        method = "POST",
    )
    val canonical = GeneratedEnvironmentContract.websocketTicketResponse(raw)
    return RemoteJson.decodeFromString<RemoteWebSocketTicketResult>(canonical)
}

/** Opens a network dial but performs no install, exec, or store write. */
suspend fun RemoteApiClient.probeEnvironmentTrust(environmentId: String): RemoteEnvironmentTrustProbeResult {
    val raw = requestText(
        EnvironmentProtocol.managementPath(environmentId, "trust-probe"),
        method = "POST",
    )
    val canonical = GeneratedEnvironmentContract.trustProbeResponse(raw)
    return RemoteJson.decodeFromString<RemoteEnvironmentTrustProbeResult>(canonical)
}

suspend fun RemoteApiClient.acceptEnvironmentTrust(
    environmentId: String,
    expectedRevision: Int,
    fingerprint: String,
): RemoteEnvironmentProjection {
    val body = buildJsonObject {
        put("expectedRevision", expectedRevision)
        put("fingerprint", fingerprint)
    }
    val canonical = GeneratedEnvironmentContract.trustAcceptRequest(body.toString())
    return environmentEnvelope(
        EnvironmentProtocol.managementPath(environmentId, "trust-accept"),
        "POST",
        canonical,
    )
}

suspend fun RemoteApiClient.adoptLegacyEnvironment(
    environmentId: String,
    expectedRevision: Int,
    legacyConnectionId: String,
): RemoteEnvironmentProjection {
    val body = buildJsonObject {
        put("expectedRevision", expectedRevision)
        put("legacyConnectionId", legacyConnectionId)
    }
    val canonical = GeneratedEnvironmentContract.adoptLegacyRequest(body.toString())
    return environmentEnvelope(
        EnvironmentProtocol.managementPath(environmentId, "adopt-legacy"),
        "POST",
        canonical,
    )
}

private suspend fun RemoteApiClient.environmentEnvelope(
    path: String,
    method: String,
    jsonBody: String? = null,
): RemoteEnvironmentProjection {
    val raw = if (jsonBody == null) {
        requestText(path, method = method)
    } else {
        requestText(path, method = method, jsonBody = jsonBody)
    }
    val canonical = GeneratedEnvironmentContract.resultResponse(raw)
    return RemoteJson.decodeFromString<RemoteEnvironmentEnvelope>(canonical).environment
}

private fun expectedRevisionBody(expectedRevision: Int): String =
    JsonObject(mapOf("expectedRevision" to JsonPrimitive(expectedRevision))).toString()
