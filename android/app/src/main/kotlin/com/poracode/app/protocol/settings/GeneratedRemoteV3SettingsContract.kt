package com.poracode.app.protocol.settings

import com.poracode.app.model.RemoteClientException
import com.poracode.app.protocol.GeneratedRemoteV3Contract
import com.poracode.remote.v3.generated.RemoteContractMetadata
import com.poracode.remote.v3.generated.RemoteRootCodec
import com.poracode.remote.v3.generated.RemoteRootCodecs
import com.poracode.remote.v3.generated.routeU2EAgentU2DStatusesU2EResponse
import com.poracode.remote.v3.generated.routeU2EProfileU2DCoreU2DStatsU2ERequest
import com.poracode.remote.v3.generated.routeU2EProfileU2DCoreU2DStatsU2EResponse
import com.poracode.remote.v3.generated.routeU2EProfileU2DDevicesU2EResponse
import com.poracode.remote.v3.generated.routeU2EProfileU2DIdentityU2ERequest
import com.poracode.remote.v3.generated.routeU2EProfileU2DIdentityU2EResponse
import com.poracode.remote.v3.generated.routeU2EProfileU2DTokenU2DStatsU2ERequest
import com.poracode.remote.v3.generated.routeU2EProfileU2DTokenU2DStatsU2EResponse
import com.poracode.remote.v3.generated.routeU2EProviderU2DUsageU2EResponse
import com.poracode.remote.v3.generated.routeU2ESettingsU2DReadU2EResponse
import com.poracode.remote.v3.generated.routeU2ESettingsU2DWriteU2ERequest
import com.poracode.remote.v3.generated.routeU2ESettingsU2DWriteU2EResponse
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

enum class SettingsRouteId(val wireId: String) {
    AgentStatuses("agent-statuses"),
    ProviderUsage("provider-usage"),
    ProfileDevices("profile-devices"),
    ProfileCoreStats("profile-core-stats"),
    ProfileTokenStats("profile-token-stats"),
    ProfileIdentity("profile-identity"),
    SettingsRead("settings-read"),
    SettingsWrite("settings-write"),
}

data class SettingsRoute(
    val id: SettingsRouteId,
    val method: String,
    val path: String,
    val requiredScope: String,
)

/** Stable hash-free facade over generated remote-v3 settings roots and route metadata. */
object GeneratedRemoteV3SettingsContract {
    private val routesById = RemoteContractMetadata.routes.associateBy { it.id }

    init {
        GeneratedRemoteV3Contract.verifyRuntimeCompatibility()
        check(RemoteContractMetadata.portableTransformIds.contains("agent-settings.strip-sensitive"))
        SettingsRouteId.entries.forEach { id ->
            val route = checkNotNull(routesById[id.wireId])
            check(route.auth == "bearer" && route.status == 200 && route.scopes.size == 1)
        }
    }

    fun route(id: SettingsRouteId): SettingsRoute {
        val generated = checkNotNull(routesById[id.wireId])
        return SettingsRoute(id, generated.method, generated.path, generated.scopes.single())
    }

    fun agentStatusesResponse(raw: String): JsonObject = canonicalObject(
        RemoteRootCodecs.routeU2EAgentU2DStatusesU2EResponse,
        raw,
    )

    fun providerUsageResponse(raw: String): JsonObject = canonicalObject(
        RemoteRootCodecs.routeU2EProviderU2DUsageU2EResponse,
        raw,
    )

    fun profileDevicesResponse(raw: String): JsonObject = canonicalObject(
        RemoteRootCodecs.routeU2EProfileU2DDevicesU2EResponse,
        raw,
    )

    fun profileCoreStatsRequest(raw: String): String = canonical(
        RemoteRootCodecs.routeU2EProfileU2DCoreU2DStatsU2ERequest,
        raw,
    )

    fun profileCoreStatsResponse(raw: String): JsonObject = canonicalObject(
        RemoteRootCodecs.routeU2EProfileU2DCoreU2DStatsU2EResponse,
        raw,
    )

    fun profileTokenStatsRequest(raw: String): String = canonical(
        RemoteRootCodecs.routeU2EProfileU2DTokenU2DStatsU2ERequest,
        raw,
    )

    fun profileTokenStatsResponse(raw: String): JsonObject = canonicalObject(
        RemoteRootCodecs.routeU2EProfileU2DTokenU2DStatsU2EResponse,
        raw,
    )

    fun profileIdentityRequest(raw: String): String = canonical(
        RemoteRootCodecs.routeU2EProfileU2DIdentityU2ERequest,
        raw,
    )

    fun profileIdentityResponse(raw: String): JsonObject = canonicalObject(
        RemoteRootCodecs.routeU2EProfileU2DIdentityU2EResponse,
        raw,
    )

    fun settingsReadResponse(raw: String): JsonObject = canonicalObject(
        RemoteRootCodecs.routeU2ESettingsU2DReadU2EResponse,
        raw,
    )

    fun settingsWriteRequest(raw: String): String = canonical(
        RemoteRootCodecs.routeU2ESettingsU2DWriteU2ERequest,
        raw,
    )

    fun settingsWriteResponse(raw: String): JsonObject = canonicalObject(
        RemoteRootCodecs.routeU2ESettingsU2DWriteU2EResponse,
        raw,
    )

    private fun canonicalObject(codec: RemoteRootCodec<*>, raw: String): JsonObject =
        try {
            Json.parseToJsonElement(canonical(codec, raw)) as JsonObject
        } catch (error: RemoteClientException) {
            throw error
        } catch (_: Exception) {
            throw invalid(codec.id)
        }

    private fun canonical(codec: RemoteRootCodec<*>, raw: String): String = try {
        codec.decode(raw).validatedSnapshot.toString()
    } catch (_: Exception) {
        throw invalid(codec.id)
    }

    private fun invalid(boundary: String): RemoteClientException =
        RemoteClientException.invalidResponse(
            "Remote settings contract validation failed at $boundary.",
        )
}
