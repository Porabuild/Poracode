package com.poracode.app.transport.settings

import com.poracode.app.model.settings.AgentStatusesSnapshot
import com.poracode.app.model.settings.HostSettingsPatch
import com.poracode.app.model.settings.HostSettingsSnapshot
import com.poracode.app.model.settings.ProfileCoreStatsSnapshot
import com.poracode.app.model.settings.ProfileDevicesSnapshot
import com.poracode.app.model.settings.ProfileIdentityRequest
import com.poracode.app.model.settings.ProfileIdentitySnapshot
import com.poracode.app.model.settings.ProfileStatsRequest
import com.poracode.app.model.settings.ProfileTokenStatsSnapshot
import com.poracode.app.model.settings.ProviderUsageSnapshot
import com.poracode.app.protocol.settings.GeneratedRemoteV3SettingsContract
import com.poracode.app.protocol.settings.SettingsRouteId
import com.poracode.app.transport.ForegroundNetworkGate
import com.poracode.app.transport.RemoteApiClient
import okhttp3.OkHttpClient

/** Production client. Every body crosses its generated root codec exactly once per request. */
class SettingsRemoteApiClient private constructor(
    private val http: RemoteApiClient,
) : SettingsRemoteGateway {
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

    override suspend fun agentStatuses(): AgentStatusesSnapshot = get(
        SettingsRouteId.AgentStatuses,
        GeneratedRemoteV3SettingsContract::agentStatusesResponse,
        SettingsRemoteV3Adapters::agentStatuses,
    )

    override suspend fun providerUsage(): ProviderUsageSnapshot = get(
        SettingsRouteId.ProviderUsage,
        GeneratedRemoteV3SettingsContract::providerUsageResponse,
        SettingsRemoteV3Adapters::providerUsage,
    )

    override suspend fun profileDevices(): ProfileDevicesSnapshot = get(
        SettingsRouteId.ProfileDevices,
        GeneratedRemoteV3SettingsContract::profileDevicesResponse,
        SettingsRemoteV3Adapters::profileDevices,
    )

    override suspend fun profileCoreStats(
        request: ProfileStatsRequest,
    ): ProfileCoreStatsSnapshot = post(
        SettingsRouteId.ProfileCoreStats,
        GeneratedRemoteV3SettingsContract.profileCoreStatsRequest(request.wireObject().toString()),
        GeneratedRemoteV3SettingsContract::profileCoreStatsResponse,
        SettingsRemoteV3Adapters::profileCoreStats,
    )

    override suspend fun profileTokenStats(
        request: ProfileStatsRequest,
    ): ProfileTokenStatsSnapshot = post(
        SettingsRouteId.ProfileTokenStats,
        GeneratedRemoteV3SettingsContract.profileTokenStatsRequest(request.wireObject().toString()),
        GeneratedRemoteV3SettingsContract::profileTokenStatsResponse,
        SettingsRemoteV3Adapters::profileTokenStats,
    )

    override suspend fun updateProfileIdentity(
        request: ProfileIdentityRequest,
    ): ProfileIdentitySnapshot = post(
        SettingsRouteId.ProfileIdentity,
        GeneratedRemoteV3SettingsContract.profileIdentityRequest(request.wireObject().toString()),
        GeneratedRemoteV3SettingsContract::profileIdentityResponse,
        SettingsRemoteV3Adapters::profileIdentity,
    )

    override suspend fun readSettings(): HostSettingsSnapshot = get(
        SettingsRouteId.SettingsRead,
        GeneratedRemoteV3SettingsContract::settingsReadResponse,
        SettingsRemoteV3Adapters::settings,
    )

    override suspend fun writeSettings(patch: HostSettingsPatch): HostSettingsSnapshot = post(
        SettingsRouteId.SettingsWrite,
        GeneratedRemoteV3SettingsContract.settingsWriteRequest(patch.wireObject.toString()),
        GeneratedRemoteV3SettingsContract::settingsWriteResponse,
        SettingsRemoteV3Adapters::settings,
    )

    private suspend fun <T> get(
        routeId: SettingsRouteId,
        validate: (String) -> kotlinx.serialization.json.JsonObject,
        adapt: (kotlinx.serialization.json.JsonObject) -> T,
    ): T {
        val route = GeneratedRemoteV3SettingsContract.route(routeId)
        check(route.method == "GET")
        return adapt(validate(http.requestText(route.path)))
    }

    private suspend fun <T> post(
        routeId: SettingsRouteId,
        body: String,
        validate: (String) -> kotlinx.serialization.json.JsonObject,
        adapt: (kotlinx.serialization.json.JsonObject) -> T,
    ): T {
        val route = GeneratedRemoteV3SettingsContract.route(routeId)
        check(route.method == "POST")
        val response = http.requestText(route.path, method = route.method, jsonBody = body)
        return adapt(validate(response))
    }
}
