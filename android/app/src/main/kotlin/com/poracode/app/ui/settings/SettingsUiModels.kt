package com.poracode.app.ui.settings

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.session.settings.SettingsHostLease
import com.poracode.app.session.settings.SettingsOperationFailure

enum class SettingsPane {
    Host,
    Agents,
    Usage,
    Profile,
    Preferences,
    Workspace,
}

data class SettingsUiAccess(
    val hasSelection: Boolean,
    val compatible: Boolean,
    val online: Boolean,
    val ready: Boolean,
    val canRead: Boolean,
    val canWrite: Boolean,
    val canManageProjects: Boolean,
) {
    companion object {
        fun from(lease: SettingsHostLease?): SettingsUiAccess {
            val compatible = lease?.protocolVersion == ProtocolConstants.REMOTE_PROTOCOL_VERSION
            val online = lease?.online == true
            val ready = lease?.ready == true
            return SettingsUiAccess(
                hasSelection = lease != null,
                compatible = compatible,
                online = online,
                ready = ready,
                canRead = compatible && online && ready && "session:read" in lease!!.scopes,
                canWrite = compatible && online && ready && "session:operate" in lease!!.scopes,
                canManageProjects = compatible && online && ready && "projects:manage" in lease.scopes,
            )
        }
    }
}

data class SettingsHostMetadata(
    val connectionId: ClientConnectionId,
    val label: String,
    val appVersion: String,
    val platform: String?,
    val hostMode: String?,
)

sealed interface SettingsMutationOutcome {
    data object Applied : SettingsMutationOutcome
    data object Stale : SettingsMutationOutcome
    data class Failed(
        val failure: SettingsOperationFailure,
        val refreshedAfterAmbiguousResult: Boolean,
    ) : SettingsMutationOutcome
}

data class SettingsMutationState(
    val profileSaving: Boolean = false,
    val settingsSaving: Boolean = false,
    val profileOutcome: SettingsMutationOutcome? = null,
    val settingsOutcome: SettingsMutationOutcome? = null,
)

internal fun SettingsOperationFailure.isAmbiguousMutation(): Boolean =
    this is SettingsOperationFailure.Remote && requestMayHaveCommitted
