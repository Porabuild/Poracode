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
import kotlinx.coroutines.flow.StateFlow

data class SettingsHostLease(
    val connectionId: ClientConnectionId,
    val generation: Long,
    val protocolVersion: Int,
    val scopes: Set<String>,
    val online: Boolean,
    val ready: Boolean,
) {
    val key: SettingsSessionKey get() = SettingsSessionKey(connectionId, generation)
}

data class SettingsSessionKey(
    val connectionId: ClientConnectionId,
    val generation: Long,
)

enum class SettingsCapability(val scope: String) {
    Read("session:read"),
    Operate("session:operate"),
}

sealed interface SettingsOperationFailure {
    data object NoSession : SettingsOperationFailure
    data object Offline : SettingsOperationFailure
    data object SessionNotReady : SettingsOperationFailure
    data object ProtocolMismatch : SettingsOperationFailure
    data object AuthenticationRequired : SettingsOperationFailure

    data class AuthorizationDenied(
        val requiredScope: String,
        val missingScope: Boolean,
    ) : SettingsOperationFailure

    data class Remote(
        val statusCode: Int?,
        val code: String?,
        val requestMayHaveCommitted: Boolean,
    ) : SettingsOperationFailure
}

class SettingsGatewayException(
    val statusCode: Int?,
    val code: String?,
    val requestMayHaveCommitted: Boolean,
    cause: Throwable? = null,
) : Exception("Remote settings request failed.", cause)

sealed interface SettingsOperationResult<out T> {
    data class Success<T>(val value: T) : SettingsOperationResult<T>
    data class Failed(val failure: SettingsOperationFailure) : SettingsOperationResult<Nothing>
    data object Stale : SettingsOperationResult<Nothing>
}

interface SettingsSessionGateway {
    suspend fun agentStatuses(lease: SettingsHostLease): AgentStatusesSnapshot
    suspend fun providerUsage(lease: SettingsHostLease): ProviderUsageSnapshot
    suspend fun profileDevices(lease: SettingsHostLease): ProfileDevicesSnapshot

    suspend fun profileCoreStats(
        lease: SettingsHostLease,
        request: ProfileStatsRequest,
    ): ProfileCoreStatsSnapshot

    suspend fun profileTokenStats(
        lease: SettingsHostLease,
        request: ProfileStatsRequest,
    ): ProfileTokenStatsSnapshot

    suspend fun updateProfileIdentity(
        lease: SettingsHostLease,
        request: ProfileIdentityRequest,
    ): ProfileIdentitySnapshot

    suspend fun readSettings(lease: SettingsHostLease): HostSettingsSnapshot

    suspend fun writeSettings(
        lease: SettingsHostLease,
        patch: HostSettingsPatch,
    ): HostSettingsSnapshot
}

internal fun StateFlow<SettingsHostLease?>.currentSettingsLease(
    capability: SettingsCapability,
): Pair<SettingsHostLease?, SettingsOperationFailure?> {
    val lease = value ?: return null to SettingsOperationFailure.NoSession
    if (lease.protocolVersion != 3) return lease to SettingsOperationFailure.ProtocolMismatch
    if (!lease.online) return lease to SettingsOperationFailure.Offline
    if (!lease.ready) return lease to SettingsOperationFailure.SessionNotReady
    if (capability.scope !in lease.scopes) {
        return lease to SettingsOperationFailure.AuthorizationDenied(capability.scope, true)
    }
    return lease to null
}

internal fun StateFlow<SettingsHostLease?>.isCurrent(lease: SettingsHostLease): Boolean {
    val current = value ?: return false
    return current.key == lease.key &&
        current.protocolVersion == 3 &&
        current.online &&
        current.ready
}

internal fun Throwable.asSettingsFailure(
    capability: SettingsCapability,
    mutation: Boolean,
): SettingsOperationFailure {
    val gateway = this as? SettingsGatewayException
    return when (gateway?.statusCode) {
        401 -> SettingsOperationFailure.AuthenticationRequired
        403 -> SettingsOperationFailure.AuthorizationDenied(
            capability.scope,
            gateway.code == "missing_scope",
        )
        else -> SettingsOperationFailure.Remote(
            gateway?.statusCode,
            gateway?.code,
            gateway?.requestMayHaveCommitted ?: mutation,
        )
    }
}
