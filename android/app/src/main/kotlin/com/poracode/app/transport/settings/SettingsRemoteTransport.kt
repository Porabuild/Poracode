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
import com.poracode.app.session.settings.SettingsHostLease

/** App-owned settings/host-information HTTP surface. */
interface SettingsRemoteGateway {
    suspend fun agentStatuses(): AgentStatusesSnapshot
    suspend fun providerUsage(): ProviderUsageSnapshot
    suspend fun profileDevices(): ProfileDevicesSnapshot
    suspend fun profileCoreStats(request: ProfileStatsRequest): ProfileCoreStatsSnapshot
    suspend fun profileTokenStats(request: ProfileStatsRequest): ProfileTokenStatsSnapshot
    suspend fun updateProfileIdentity(request: ProfileIdentityRequest): ProfileIdentitySnapshot
    suspend fun readSettings(): HostSettingsSnapshot
    suspend fun writeSettings(patch: HostSettingsPatch): HostSettingsSnapshot
}

fun interface SettingsRemoteGatewayProvider {
    suspend fun gatewayFor(lease: SettingsHostLease): SettingsRemoteGateway?
}

fun interface SettingsRemoteGatewayFactory {
    fun create(endpoint: String, accessToken: String): SettingsRemoteGateway
}
