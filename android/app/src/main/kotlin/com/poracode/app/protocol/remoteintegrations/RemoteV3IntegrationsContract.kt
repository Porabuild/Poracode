package com.poracode.app.protocol.remoteintegrations

import com.poracode.app.model.RemoteClientException
import com.poracode.app.protocol.GeneratedRemoteV3Contract
import com.poracode.remote.v3.generated.RemoteContractMetadata
import com.poracode.remote.v3.generated.RemoteRootCodec
import com.poracode.remote.v3.generated.RemoteRootCodecs
import com.poracode.remote.v3.generated.routeU2EHostU2DUpdateU2DCheckU2EResponse
import com.poracode.remote.v3.generated.routeU2EHostU2DUpdateU2DInstallU2EResponse
import com.poracode.remote.v3.generated.routeU2EHostU2DUpdateU2EResponse
import com.poracode.remote.v3.generated.routeU2EPrU2DWatchU2DCheckU2ERequest
import com.poracode.remote.v3.generated.routeU2EPrU2DWatchU2DCheckU2EResponse
import com.poracode.remote.v3.generated.routeU2EPrU2DWatchU2DAgentU2DSyncU2ERequest
import com.poracode.remote.v3.generated.routeU2EPrU2DWatchU2DAgentU2DSyncU2EResponse
import com.poracode.remote.v3.generated.routeU2EPrU2DWatchU2DDeleteU2ERequest
import com.poracode.remote.v3.generated.routeU2EPrU2DWatchU2DDeleteU2EResponse
import com.poracode.remote.v3.generated.routeU2EPrU2DWatchU2DReadU2EQuery
import com.poracode.remote.v3.generated.routeU2EPrU2DWatchU2DReadU2EResponse
import com.poracode.remote.v3.generated.routeU2EPrU2DWatchU2DUpsertU2ERequest
import com.poracode.remote.v3.generated.routeU2EPrU2DWatchU2DUpsertU2EResponse
import com.poracode.remote.v3.generated.routeU2ESchedulesU2DCommandU2ERequest
import com.poracode.remote.v3.generated.routeU2ESchedulesU2DCommandU2EResponse
import com.poracode.remote.v3.generated.routeU2ESchedulesU2DReadU2EResponse
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

enum class IntegrationRouteId(val wireId: String) {
    HostUpdate("host-update"),
    HostUpdateCheck("host-update-check"),
    HostUpdateInstall("host-update-install"),
    SchedulesRead("schedules-read"),
    SchedulesCommand("schedules-command"),
    PrWatchRead("pr-watch-read"),
    PrWatchCheck("pr-watch-check"),
    PrWatchAgentSync("pr-watch-agent-sync"),
    PrWatchUpsert("pr-watch-upsert"),
    PrWatchDelete("pr-watch-delete"),
}

data class IntegrationRoute(
    val id: IntegrationRouteId,
    val method: String,
    val path: String,
    val requiredScope: String,
    val expectedStatus: Int,
    val bodyKind: String,
)

/** Hash-free app facade over the generated remote-v3 route metadata and root codecs. */
object RemoteV3IntegrationsContract {
    private val routes = RemoteContractMetadata.routes.associateBy { it.id }

    init {
        GeneratedRemoteV3Contract.verifyRuntimeCompatibility()
        IntegrationRouteId.entries.forEach { id ->
            val route = checkNotNull(routes[id.wireId])
            check(route.auth == "bearer" && route.scopes.size == 1)
        }
    }

    fun route(id: IntegrationRouteId): IntegrationRoute {
        val route = checkNotNull(routes[id.wireId])
        return IntegrationRoute(
            id,
            route.method,
            route.path,
            route.scopes.single(),
            route.status,
            route.bodyKind,
        )
    }

    fun hostUpdateResponse(raw: String): JsonObject = canonicalObject(
        RemoteRootCodecs.routeU2EHostU2DUpdateU2EResponse,
        raw,
    )

    fun hostUpdateCheckResponse(raw: String): JsonObject = canonicalObject(
        RemoteRootCodecs.routeU2EHostU2DUpdateU2DCheckU2EResponse,
        raw,
    )

    fun hostUpdateInstallResponse(raw: String) = canonical(
        RemoteRootCodecs.routeU2EHostU2DUpdateU2DInstallU2EResponse,
        raw,
    )

    fun schedulesReadResponse(raw: String): JsonObject = canonicalObject(
        RemoteRootCodecs.routeU2ESchedulesU2DReadU2EResponse,
        raw,
    )

    fun scheduleCommandRequest(raw: String): String = canonical(
        RemoteRootCodecs.routeU2ESchedulesU2DCommandU2ERequest,
        raw,
    )

    fun scheduleCommandResponse(raw: String): JsonObject = canonicalObject(
        RemoteRootCodecs.routeU2ESchedulesU2DCommandU2EResponse,
        raw,
    )

    fun prWatchReadQuery(raw: String): JsonObject = canonicalObject(
        RemoteRootCodecs.routeU2EPrU2DWatchU2DReadU2EQuery,
        raw,
    )

    fun prWatchReadResponse(raw: String): JsonObject = canonicalObject(
        RemoteRootCodecs.routeU2EPrU2DWatchU2DReadU2EResponse,
        raw,
    )

    fun prWatchCheckRequest(raw: String): String = canonical(
        RemoteRootCodecs.routeU2EPrU2DWatchU2DCheckU2ERequest,
        raw,
    )

    fun prWatchCheckResponse(raw: String) = canonical(
        RemoteRootCodecs.routeU2EPrU2DWatchU2DCheckU2EResponse,
        raw,
    )

    fun prWatchAgentSyncRequest(raw: String): String = canonical(
        RemoteRootCodecs.routeU2EPrU2DWatchU2DAgentU2DSyncU2ERequest,
        raw,
    )

    fun prWatchAgentSyncResponse(raw: String) = canonical(
        RemoteRootCodecs.routeU2EPrU2DWatchU2DAgentU2DSyncU2EResponse,
        raw,
    )

    fun prWatchUpsertRequest(raw: String): String = canonical(
        RemoteRootCodecs.routeU2EPrU2DWatchU2DUpsertU2ERequest,
        raw,
    )

    fun prWatchUpsertResponse(raw: String): JsonObject = canonicalObject(
        RemoteRootCodecs.routeU2EPrU2DWatchU2DUpsertU2EResponse,
        raw,
    )

    fun prWatchDeleteRequest(raw: String): String = canonical(
        RemoteRootCodecs.routeU2EPrU2DWatchU2DDeleteU2ERequest,
        raw,
    )

    fun prWatchDeleteResponse(raw: String) = canonical(
        RemoteRootCodecs.routeU2EPrU2DWatchU2DDeleteU2EResponse,
        raw,
    )

    private fun canonicalObject(codec: RemoteRootCodec<*>, raw: String): JsonObject = try {
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
        RemoteClientException.invalidResponse("Remote integrations validation failed at $boundary.")
}
