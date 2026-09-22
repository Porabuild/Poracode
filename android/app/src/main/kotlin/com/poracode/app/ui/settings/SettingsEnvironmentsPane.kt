package com.poracode.app.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.RemoteEnvironmentProjection
import com.poracode.app.session.environments.EnvironmentManagementController
import com.poracode.app.session.environments.EnvironmentManagementController.EnvironmentUiState
import com.poracode.app.session.environments.EnvironmentManagementController.LoadState

/**
 * Host-owned environment management (C1). Every action is an explicit user
 * action; trust accept and owner upgrade open confirmation dialogs and are
 * never triggered automatically. Actions are hidden without the bound host's
 * capability and scopes, and the "host-owned environment" mode is named
 * explicitly so credentials and work locations are never ambiguous.
 */
@Composable
internal fun SettingsEnvironmentsPane(
    state: EnvironmentUiState,
    controller: EnvironmentManagementController,
    onUse: (ClientConnectionId) -> Unit,
    modifier: Modifier = Modifier,
) {
    var editor by remember { mutableStateOf<EnvironmentEditorTarget?>(null) }
    var deleting by remember { mutableStateOf<RemoteEnvironmentProjection?>(null) }
    var upgrading by remember { mutableStateOf<RemoteEnvironmentProjection?>(null) }
    var adopting by remember { mutableStateOf<RemoteEnvironmentProjection?>(null) }
    val busy = state.busy != null

    Column(modifier.fillMaxSize()) {
        EnvironmentHeaderCard(
            state = state,
            onCreate = { editor = EnvironmentEditorTarget.Create },
            enabled = !busy,
        )
        state.actionError?.let { error ->
            EnvironmentMessageCard(text = environmentCallErrorText(error), isError = true)
        }
        state.actionNotice?.let { notice ->
            EnvironmentMessageCard(text = environmentNoticeText(notice), isError = false)
        }
        when {
            !state.capabilityAvailable -> EnvironmentMessageCard(
                text = stringResource(R.string.environments_capability_missing),
                isError = false,
            )
            !state.access.canRead -> EnvironmentMessageCard(
                text = stringResource(R.string.environments_no_read_access),
                isError = true,
            )
            state.loadState == LoadState.Loading && state.environments.isEmpty() -> {
                Row(
                    Modifier.fillMaxWidth().padding(24.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CircularProgressIndicator()
                    Text(
                        stringResource(R.string.environments_loading),
                        Modifier.padding(start = 12.dp),
                    )
                }
            }
            state.environments.isEmpty() -> {
                Column(Modifier.fillMaxWidth().padding(24.dp)) {
                    Text(stringResource(R.string.environments_empty))
                    state.listError?.let {
                        Text(
                            environmentCallErrorText(it),
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                    }
                    TextButton(onClick = controller::refresh, enabled = !busy) {
                        Text(stringResource(R.string.settings_retry))
                    }
                }
            }
            else -> LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(state.environments, key = { it.environmentId }) { environment ->
                    EnvironmentCard(
                        state = state,
                        environment = environment,
                        controller = controller,
                        busy = busy,
                        onEdit = { editor = EnvironmentEditorTarget.Edit(environment) },
                        onDelete = { deleting = environment },
                        onUpgrade = { upgrading = environment },
                        onAdopt = { adopting = environment },
                        onUse = onUse,
                    )
                }
            }
        }
    }

    state.pendingTrust?.let { pending ->
        TrustAcceptDialog(
            pending = pending,
            onAccept = controller::acceptPendingTrust,
            onDismiss = controller::dismissPendingTrust,
        )
    }
    editor?.let { target ->
        EnvironmentEditorDialog(
            target = target,
            onDismiss = { editor = null },
            onCreate = { request ->
                editor = null
                controller.create(request)
            },
            onUpdate = { environment, patch ->
                editor = null
                controller.update(environment.environmentId, environment.revision, patch)
            },
        )
    }
    deleting?.let { environment ->
        EnvironmentConfirmDialog(
            title = stringResource(R.string.environments_delete_title, environment.label),
            message = stringResource(R.string.environments_delete_message),
            confirmLabel = stringResource(R.string.environments_delete_confirm),
            onConfirm = {
                deleting = null
                controller.delete(environment.environmentId, environment.revision)
            },
            onDismiss = { deleting = null },
        )
    }
    upgrading?.let { environment ->
        EnvironmentConfirmDialog(
            title = stringResource(R.string.environments_upgrade_title),
            message = stringResource(R.string.environments_upgrade_message),
            confirmLabel = stringResource(R.string.environments_upgrade_confirm),
            onConfirm = {
                upgrading = null
                controller.upgrade(environment.environmentId, environment.revision)
            },
            onDismiss = { upgrading = null },
        )
    }
    adopting?.let { environment ->
        AdoptLegacyDialog(
            onConfirm = { legacyConnectionId ->
                adopting = null
                controller.adoptLegacy(
                    environment.environmentId,
                    environment.revision,
                    legacyConnectionId,
                )
            },
            onDismiss = { adopting = null },
        )
    }
}

internal sealed class EnvironmentEditorTarget {
    data object Create : EnvironmentEditorTarget()
    data class Edit(val environment: RemoteEnvironmentProjection) : EnvironmentEditorTarget()
}

@Composable
private fun EnvironmentHeaderCard(
    state: EnvironmentUiState,
    onCreate: () -> Unit,
    enabled: Boolean,
) {
    Column(Modifier.fillMaxWidth().padding(16.dp)) {
        Text(
            stringResource(R.string.environments_mode_host_owned),
            style = MaterialTheme.typography.titleMedium,
        )
        state.hostLabel?.let {
            Text(
                stringResource(R.string.environments_header_host, it),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(
            stringResource(R.string.environments_mode_explanation),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (state.capabilityAvailable && state.access.canRead && state.access.canManage) {
            Button(
                onClick = onCreate,
                enabled = enabled,
                modifier = Modifier.padding(top = 8.dp).testTag("environment_add"),
            ) {
                Text(stringResource(R.string.environments_add))
            }
        }
    }
}

@Composable
private fun EnvironmentCard(
    state: EnvironmentUiState,
    environment: RemoteEnvironmentProjection,
    controller: EnvironmentManagementController,
    busy: Boolean,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onUpgrade: () -> Unit,
    onAdopt: () -> Unit,
    onUse: (ClientConnectionId) -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    val moreLabel = stringResource(R.string.environments_action_more, environment.label)
    val localConnectionId = state.localRecordFor(environment.environmentId)
    Row(
        Modifier
            .fillMaxWidth()
            .testTag("environment_row_${environment.environmentId}"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(environment.label, style = MaterialTheme.typography.titleMedium)
            Text(
                environment.target + (environment.port?.let { ":$it" } ?: ""),
                style = MaterialTheme.typography.bodySmall,
            )
            Text(
                stringResource(R.string.environments_mode_host_owned) + " · " +
                    environmentStateText(environment) + " · " + trustStateText(environment),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            val child = environment.childIdentity?.desktopId
            Text(
                if (child != null) {
                    stringResource(R.string.environments_child_label, child)
                } else {
                    stringResource(R.string.environments_child_unverified)
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Box {
            IconButton(
                onClick = { menuOpen = true },
                enabled = !busy,
                modifier = Modifier.semantics { contentDescription = moreLabel },
            ) {
                Icon(Icons.Outlined.MoreVert, contentDescription = null)
            }
            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                if (state.access.canUse) {
                    if (environment.connected) {
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.environments_action_disconnect)) },
                            onClick = {
                                menuOpen = false
                                controller.disconnect(environment.environmentId)
                            },
                        )
                    } else {
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.environments_action_connect)) },
                            onClick = {
                                menuOpen = false
                                controller.connect(environment.environmentId)
                            },
                        )
                    }
                    if (localConnectionId == null && state.directParent) {
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.environments_action_pair)) },
                            onClick = {
                                menuOpen = false
                                controller.pairDevice(environment)
                            },
                        )
                    }
                }
                if (localConnectionId != null) {
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.environments_action_use)) },
                        onClick = {
                            menuOpen = false
                            onUse(localConnectionId)
                        },
                    )
                }
                if (state.access.canManage) {
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.environments_action_edit)) },
                        onClick = { menuOpen = false; onEdit() },
                    )
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.environments_action_trust)) },
                        onClick = {
                            menuOpen = false
                            controller.probeTrust(environment.environmentId)
                        },
                    )
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.environments_action_adopt)) },
                        onClick = { menuOpen = false; onAdopt() },
                    )
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.environments_action_upgrade)) },
                        onClick = { menuOpen = false; onUpgrade() },
                    )
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.environments_action_delete)) },
                        onClick = { menuOpen = false; onDelete() },
                    )
                }
            }
        }
    }
}

@Composable
internal fun EnvironmentMessageCard(text: String, isError: Boolean) {
    Text(
        text,
        color = if (isError) {
            MaterialTheme.colorScheme.error
        } else {
            MaterialTheme.colorScheme.onSurfaceVariant
        },
        style = MaterialTheme.typography.bodyMedium,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
    )
}

@Composable
private fun environmentStateText(environment: RemoteEnvironmentProjection): String =
    stringResource(
        when (environment.state) {
            "connecting" -> R.string.environments_state_connecting
            "connected" -> R.string.environments_state_connected
            "error" -> R.string.environments_state_error
            "credential-missing" -> R.string.environments_state_credential_missing
            "owner-unverified" -> R.string.environments_state_owner_unverified
            "identity-changed" -> R.string.environments_state_identity_changed
            "hostkey-mismatch" -> R.string.environments_state_hostkey_mismatch
            "needs-repair" -> R.string.environments_state_needs_repair
            "trust-required" -> R.string.environments_state_trust_required
            else -> R.string.environments_state_disconnected
        },
    )

@Composable
private fun trustStateText(environment: RemoteEnvironmentProjection): String =
    stringResource(
        when (environment.trust.state) {
            "pinned" -> R.string.environments_trust_pinned
            "observed" -> R.string.environments_trust_observed
            else -> R.string.environments_trust_unknown
        },
    )

@Composable
internal fun environmentCallErrorText(
    error: EnvironmentManagementController.EnvironmentCallError,
): String = stringResource(
    when (error.code) {
        "environment_parent_needs_repair" -> R.string.environments_error_parent_repair
        "environment_parent_missing" -> R.string.environments_error_parent_missing
        "environment_authority_conflict" -> R.string.environments_error_authority_conflict
        "environment_nested_parent_unsupported" -> R.string.environments_error_nested_parent
        "missing_scope", "environment/not-authorized" -> R.string.environments_error_missing_scope
        "environment/identity-changed" -> R.string.environments_error_identity_changed
        "environment/trust-required" -> R.string.environments_error_trust_required
        "environment/trust-changed",
        "environment/trust-mismatch",
        "environment/hostkey-mismatch",
        -> R.string.environments_error_trust_changed
        "environment/credential-missing" -> R.string.environments_error_credential_missing
        "environment/not-connected" -> R.string.environments_error_not_connected
        "protocol_version_mismatch" -> R.string.environments_error_protocol
        "pairing_failed" -> R.string.environments_error_paired
        else -> R.string.environments_error_generic
    },
)

@Composable
internal fun environmentNoticeText(code: String): String = stringResource(
    when (code) {
        "environment_paired" -> R.string.environments_notice_paired
        else -> R.string.environments_notice_applied
    },
)
