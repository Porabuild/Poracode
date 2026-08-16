package com.poracode.app.session.settings

import com.poracode.app.model.ClientConnectionId
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
import com.poracode.app.transport.settings.SettingsRemoteGateway
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

internal val connectionA = ClientConnectionId("10000000-0000-4000-8000-000000000001")
internal val connectionB = ClientConnectionId("20000000-0000-4000-8000-000000000002")

internal fun lease(
    connectionId: ClientConnectionId = connectionA,
    generation: Long = 1,
    protocolVersion: Int = 3,
    scopes: Set<String> = setOf("session:read", "session:operate"),
    online: Boolean = true,
    ready: Boolean = true,
) = SettingsHostLease(connectionId, generation, protocolVersion, scopes, online, ready)

internal fun agentSnapshot(marker: String = "now") = AgentStatusesSnapshot(
    buildJsonObject {
        put("updatedAt", marker)
        put("windows", buildJsonArray {})
        put("wsl", buildJsonArray {})
    },
)

internal fun settingsSnapshot(fast: Boolean = false) = HostSettingsSnapshot(
    buildJsonObject {
        put("settings", buildJsonObject { put("titleGenFast", fast) })
    },
)

internal class FakeSettingsRemoteGateway : SettingsRemoteGateway {
    var settingsCalls = 0
    var writeCalls = 0
    var agentHandler: suspend () -> AgentStatusesSnapshot = { agentSnapshot() }
    var readHandler: suspend () -> HostSettingsSnapshot = { settingsSnapshot() }
    var writeHandler: suspend (HostSettingsPatch) -> HostSettingsSnapshot = { settingsSnapshot(true) }

    override suspend fun agentStatuses() = agentHandler()
    override suspend fun readSettings(): HostSettingsSnapshot {
        settingsCalls += 1
        return readHandler()
    }

    override suspend fun writeSettings(patch: HostSettingsPatch): HostSettingsSnapshot {
        writeCalls += 1
        return writeHandler(patch)
    }

    override suspend fun providerUsage() = ProviderUsageSnapshot(
        buildJsonObject {
            put("fromCache", false)
            put("snapshots", buildJsonArray {})
        },
    )

    override suspend fun profileDevices() = ProfileDevicesSnapshot(
        buildJsonObject {
            put("currentDeviceId", "device")
            put("devices", buildJsonArray {})
        },
    )

    override suspend fun profileCoreStats(request: ProfileStatsRequest) =
        ProfileCoreStatsSnapshot(profileBase())

    override suspend fun profileTokenStats(request: ProfileStatsRequest) =
        ProfileTokenStatsSnapshot(profileBase(available = false))

    override suspend fun updateProfileIdentity(request: ProfileIdentityRequest) =
        ProfileIdentitySnapshot(
            buildJsonObject {
                put("identity", buildJsonObject { put("handle", request.handle) })
                put("device", buildJsonObject { put("id", "device") })
            },
        )

    private fun profileBase(available: Boolean? = null): JsonObject = buildJsonObject {
        put("scope", "device")
        put("device", buildJsonObject { put("id", "device") })
        put("identity", buildJsonObject { put("handle", "fixture") })
        available?.let { put("available", it) }
    }
}

internal class FakeSettingsSessionGateway : SettingsSessionGateway {
    var agentHandler: suspend (SettingsHostLease) -> AgentStatusesSnapshot = { agentSnapshot() }
    var settingsHandler: suspend (SettingsHostLease) -> HostSettingsSnapshot = { settingsSnapshot() }
    var settingsWriteHandler: suspend (SettingsHostLease, HostSettingsPatch) -> HostSettingsSnapshot =
        { _, _ -> settingsSnapshot(true) }

    override suspend fun agentStatuses(lease: SettingsHostLease) = agentHandler(lease)
    override suspend fun readSettings(lease: SettingsHostLease) = settingsHandler(lease)
    override suspend fun writeSettings(lease: SettingsHostLease, patch: HostSettingsPatch) =
        settingsWriteHandler(lease, patch)

    override suspend fun providerUsage(lease: SettingsHostLease) =
        FakeSettingsRemoteGateway().providerUsage()

    override suspend fun profileDevices(lease: SettingsHostLease) =
        FakeSettingsRemoteGateway().profileDevices()

    override suspend fun profileCoreStats(lease: SettingsHostLease, request: ProfileStatsRequest) =
        FakeSettingsRemoteGateway().profileCoreStats(request)

    override suspend fun profileTokenStats(lease: SettingsHostLease, request: ProfileStatsRequest) =
        FakeSettingsRemoteGateway().profileTokenStats(request)

    override suspend fun updateProfileIdentity(
        lease: SettingsHostLease,
        request: ProfileIdentityRequest,
    ) = FakeSettingsRemoteGateway().updateProfileIdentity(request)
}
