package com.poracode.app.session.settingsintegrations

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.protocol.settingsintegrations.SkillImportItem
import com.poracode.app.protocol.settingsintegrations.SkillOwner
import kotlinx.coroutines.flow.StateFlow

data class SettingsIntegrationsSessionKey(
    val connectionId: ClientConnectionId,
    val sessionGeneration: Long,
    val workGeneration: Long,
)

data class SettingsIntegrationsLease(
    val connectionId: ClientConnectionId,
    val sessionGeneration: Long,
    val workGeneration: Long,
    val protocolVersion: Int,
    val scopes: Set<String>,
    val online: Boolean,
    val ready: Boolean,
    val selectedProject: SkillOwner?,
) {
    val key = SettingsIntegrationsSessionKey(connectionId, sessionGeneration, workGeneration)
}

enum class SettingsIntegrationsCapability(val scope: String) {
    Read("session:read"),
    Operate("session:operate"),
}

sealed interface SettingsIntegrationsFailure {
    data object NoHost : SettingsIntegrationsFailure
    data object Offline : SettingsIntegrationsFailure
    data object NotReady : SettingsIntegrationsFailure
    data object ProtocolMismatch : SettingsIntegrationsFailure
    data object AuthenticationRequired : SettingsIntegrationsFailure
    data object StaleOwner : SettingsIntegrationsFailure
    data class PermissionDenied(val requiredScope: String) : SettingsIntegrationsFailure
    data class Remote(val code: String, val requestMayHaveCommitted: Boolean) : SettingsIntegrationsFailure
}

sealed interface SettingsIntegrationsResult<out T> {
    data class Success<T>(val value: T) : SettingsIntegrationsResult<T>
    data class Failed(val failure: SettingsIntegrationsFailure) : SettingsIntegrationsResult<Nothing>
    data object Stale : SettingsIntegrationsResult<Nothing>
}

internal fun StateFlow<SettingsIntegrationsLease?>.requireLease(
    capability: SettingsIntegrationsCapability,
): Pair<SettingsIntegrationsLease?, SettingsIntegrationsFailure?> {
    val lease = value ?: return null to SettingsIntegrationsFailure.NoHost
    if (lease.protocolVersion != 8) return lease to SettingsIntegrationsFailure.ProtocolMismatch
    if (!lease.ready) return lease to SettingsIntegrationsFailure.NotReady
    if (!lease.online) return lease to SettingsIntegrationsFailure.Offline
    if (capability.scope !in lease.scopes) {
        return lease to SettingsIntegrationsFailure.PermissionDenied(capability.scope)
    }
    return lease to null
}

internal fun StateFlow<SettingsIntegrationsLease?>.isCurrent(
    lease: SettingsIntegrationsLease,
): Boolean = value?.let {
    it.key == lease.key && it.protocolVersion == 8 && it.online && it.ready
} == true

internal fun SettingsIntegrationsLease.owns(owner: SkillOwner): Boolean =
    owner.isGlobal || selectedProject?.let {
        it.projectId == owner.projectId &&
            it.projectLocation == owner.projectLocation &&
            it.projectGeneration == owner.projectGeneration &&
            it.projectGeneration == workGeneration
    } == true

internal fun SettingsIntegrationsLease.owns(items: List<SkillImportItem>): Boolean =
    items.isNotEmpty() && items.all { owns(it.destinationOwner) && owns(it.sourceOwner) }
