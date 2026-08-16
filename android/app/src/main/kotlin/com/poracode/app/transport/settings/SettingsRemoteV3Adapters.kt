package com.poracode.app.transport.settings

import com.poracode.app.model.settings.AgentStatusesSnapshot
import com.poracode.app.model.settings.HostSettingsSnapshot
import com.poracode.app.model.settings.ProfileCoreStatsSnapshot
import com.poracode.app.model.settings.ProfileDevicesSnapshot
import com.poracode.app.model.settings.ProfileIdentitySnapshot
import com.poracode.app.model.settings.ProfileTokenStatsSnapshot
import com.poracode.app.model.settings.ProviderUsageSnapshot
import kotlinx.serialization.json.JsonObject

internal object SettingsRemoteV3Adapters {
    fun agentStatuses(value: JsonObject) = AgentStatusesSnapshot(value)
    fun providerUsage(value: JsonObject) = ProviderUsageSnapshot(value)
    fun profileDevices(value: JsonObject) = ProfileDevicesSnapshot(value)
    fun profileCoreStats(value: JsonObject) = ProfileCoreStatsSnapshot(value)
    fun profileTokenStats(value: JsonObject) = ProfileTokenStatsSnapshot(value)
    fun profileIdentity(value: JsonObject) = ProfileIdentitySnapshot(value)
    fun settings(value: JsonObject) = HostSettingsSnapshot(value)
}
