package com.poracode.app.transport.remoteintegrations

import com.poracode.app.model.remoteintegrations.HostUpdateState
import com.poracode.app.model.remoteintegrations.PrWatch
import com.poracode.app.model.remoteintegrations.PrWatchDraft
import com.poracode.app.model.remoteintegrations.PrWatchKey
import com.poracode.app.model.remoteintegrations.ScheduledTask
import com.poracode.app.protocol.remoteintegrations.IntegrationRouteId
import com.poracode.app.protocol.remoteintegrations.RemoteV3IntegrationsContract
import com.poracode.app.transport.ForegroundNetworkGate
import com.poracode.app.transport.RemoteApiClient
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody

/** Production, cancellation-aware HTTP client. Mutations are issued exactly once. */
class RemoteIntegrationsApiClient private constructor(
    private val http: RemoteApiClient,
) : RemoteIntegrationsGateway {
    constructor(
        endpoint: String,
        accessToken: String,
        client: OkHttpClient = RemoteApiClient.defaultClient(),
        networkGate: ForegroundNetworkGate = ForegroundNetworkGate.shared,
    ) : this(
        RemoteApiClient(
            endpoint = endpoint,
            accessToken = accessToken,
            client = client.newBuilder().retryOnConnectionFailure(false).build(),
            networkGate = networkGate,
        ),
    )

    override suspend fun hostUpdate(): HostUpdateState {
        val raw = read(IntegrationRouteId.HostUpdate)
        return RemoteIntegrationAdapters.hostUpdate(
            RemoteV3IntegrationsContract.hostUpdateResponse(raw),
        )
    }

    override suspend fun checkHostUpdate(): HostUpdateState {
        val raw = emptyMutation(IntegrationRouteId.HostUpdateCheck)
        return RemoteIntegrationAdapters.hostUpdate(
            RemoteV3IntegrationsContract.hostUpdateCheckResponse(raw),
        )
    }

    override suspend fun installHostUpdate() {
        val raw = emptyMutation(IntegrationRouteId.HostUpdateInstall)
        RemoteV3IntegrationsContract.hostUpdateInstallResponse(raw)
    }

    override suspend fun schedules(): List<ScheduledTask> =
        RemoteIntegrationAdapters.schedules(
            RemoteV3IntegrationsContract.schedulesReadResponse(
                read(IntegrationRouteId.SchedulesRead),
            ),
        )

    override suspend fun commandSchedule(command: ScheduleCommand): List<ScheduledTask> {
        val body = buildJsonObject {
            when (command) {
                is ScheduleCommand.Create -> {
                    put("kind", "create")
                    put("task", command.task.wireObject())
                }
                is ScheduleCommand.Update -> {
                    put("kind", "update")
                    put("id", command.id)
                    put("task", command.task.wireObject())
                }
                is ScheduleCommand.Delete -> {
                    put("kind", "delete")
                    put("id", command.id)
                }
                is ScheduleCommand.Run -> {
                    put("kind", "run")
                    put("id", command.id)
                }
            }
        }
        val canonical = RemoteV3IntegrationsContract.scheduleCommandRequest(body.toString())
        return RemoteIntegrationAdapters.schedules(
            RemoteV3IntegrationsContract.scheduleCommandResponse(
                jsonMutation(IntegrationRouteId.SchedulesCommand, canonical),
            ),
        )
    }

    override suspend fun prWatch(key: PrWatchKey): PrWatch? {
        val query = RemoteV3IntegrationsContract.prWatchReadQuery(key.wireObject().toString())
        val route = RemoteV3IntegrationsContract.route(IntegrationRouteId.PrWatchRead)
        check(route.method == "GET" && route.bodyKind == "empty")
        val raw = http.requestText(
            route.path,
            query = listOf(
                "projectId" to query.getValue("projectId").jsonPrimitive.content,
                "prNumber" to query.getValue("prNumber").jsonPrimitive.content,
            ),
        )
        return RemoteIntegrationAdapters.prWatch(
            RemoteV3IntegrationsContract.prWatchReadResponse(raw),
        )
    }

    override suspend fun checkPrWatch(key: PrWatchKey) {
        val body = RemoteV3IntegrationsContract.prWatchCheckRequest(key.wireObject().toString())
        val response = jsonMutation(IntegrationRouteId.PrWatchCheck, body)
        RemoteV3IntegrationsContract.prWatchCheckResponse(response)
    }

    override suspend fun upsertPrWatch(draft: PrWatchDraft): PrWatch {
        val body = RemoteV3IntegrationsContract.prWatchUpsertRequest(draft.wireObject().toString())
        val response = jsonMutation(IntegrationRouteId.PrWatchUpsert, body)
        return checkNotNull(
            RemoteIntegrationAdapters.prWatch(
                RemoteV3IntegrationsContract.prWatchUpsertResponse(response),
            ),
        )
    }

    override suspend fun deletePrWatch(key: PrWatchKey) {
        val body = RemoteV3IntegrationsContract.prWatchDeleteRequest(key.wireObject().toString())
        val response = jsonMutation(IntegrationRouteId.PrWatchDelete, body)
        RemoteV3IntegrationsContract.prWatchDeleteResponse(response)
    }

    private suspend fun read(id: IntegrationRouteId): String {
        val route = RemoteV3IntegrationsContract.route(id)
        check(route.method == "GET" && route.bodyKind == "empty")
        return http.requestText(route.path)
    }

    private suspend fun emptyMutation(id: IntegrationRouteId): String {
        val route = RemoteV3IntegrationsContract.route(id)
        check(route.method == "POST" && route.bodyKind == "empty")
        return http.requestRawText(
            route.path,
            route.method,
            body = ByteArray(0).toRequestBody(JSON_MEDIA),
            expectedStatus = route.expectedStatus,
        )
    }

    private suspend fun jsonMutation(id: IntegrationRouteId, body: String): String {
        val route = RemoteV3IntegrationsContract.route(id)
        check(route.bodyKind == "json" && route.method in setOf("POST", "DELETE"))
        return http.requestRawText(
            route.path,
            route.method,
            body = body.toRequestBody(JSON_MEDIA),
            extraHeaders = mapOf("Content-Type" to "application/json"),
            expectedStatus = route.expectedStatus,
        )
    }

    companion object {
        private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()
    }
}
