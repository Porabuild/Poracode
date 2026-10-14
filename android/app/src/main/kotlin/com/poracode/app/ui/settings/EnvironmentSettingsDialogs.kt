package com.poracode.app.ui.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.RemoteEnvironmentCreateRequest
import com.poracode.app.model.RemoteEnvironmentProjection
import com.poracode.app.model.RemoteEnvironmentUpdatePatch
import com.poracode.app.session.environments.EnvironmentManagementController.PendingTrust

@Composable
internal fun TrustAcceptDialog(
    pending: PendingTrust,
    onAccept: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.environments_trust_title)) },
        text = {
            Text(
                stringResource(
                    R.string.environments_trust_message,
                    pending.fingerprint,
                    pending.keyType,
                ),
            )
        },
        confirmButton = {
            Button(
                onClick = onAccept,
                modifier = Modifier.testTag("environment_trust_accept"),
            ) {
                Text(stringResource(R.string.environments_trust_accept))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.cancel_pair_button))
            }
        },
    )
}

@Composable
internal fun EnvironmentConfirmDialog(
    title: String,
    message: String,
    confirmLabel: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(message) },
        confirmButton = {
            Button(onClick = onConfirm, modifier = Modifier.testTag("environment_confirm")) {
                Text(confirmLabel)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.cancel_pair_button))
            }
        },
    )
}

@Composable
internal fun AdoptLegacyDialog(
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var value by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.environments_adopt_title)) },
        text = {
            Column {
                Text(stringResource(R.string.environments_adopt_message))
                OutlinedTextField(
                    value = value,
                    onValueChange = { value = it },
                    label = { Text(stringResource(R.string.environments_adopt_field)) },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp)
                        .testTag("environment_adopt_field"),
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onConfirm(value.trim()) },
                enabled = value.isNotBlank(),
                modifier = Modifier.testTag("environment_adopt_confirm"),
            ) {
                Text(stringResource(R.string.environments_adopt_confirm))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.cancel_pair_button))
            }
        },
    )
}

/**
 * Create/edit environment. Create sends the strict create body; edit computes a
 * minimal patch against the projection so unchanged fields are never resent.
 * Trust and owner upgrade are deliberately not offered here.
 */
@Composable
internal fun EnvironmentEditorDialog(
    target: EnvironmentEditorTarget,
    onDismiss: () -> Unit,
    onCreate: (RemoteEnvironmentCreateRequest) -> Unit,
    onUpdate: (RemoteEnvironmentProjection, RemoteEnvironmentUpdatePatch) -> Unit,
) {
    val editing = target as? EnvironmentEditorTarget.Edit
    var label by remember(target) { mutableStateOf(editing?.environment?.label.orEmpty()) }
    var targetValue by remember(target) { mutableStateOf(editing?.environment?.target.orEmpty()) }
    var port by remember(target) {
        mutableStateOf(editing?.environment?.port?.toString().orEmpty())
    }
    var credentialRef by remember(target) { mutableStateOf("") }
    var credentialTouched by remember(target) { mutableStateOf(false) }
    var desiredEnabled by remember(target) {
        mutableStateOf(editing?.environment?.desiredEnabled ?: true)
    }
    val portValue = port.trim().takeIf(String::isNotEmpty)?.toIntOrNull()
    val portInvalid = port.isNotBlank() && portValue == null
    val valid = label.isNotBlank() && targetValue.isNotBlank() && !portInvalid

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                stringResource(
                    if (editing == null) {
                        R.string.environments_create_title
                    } else {
                        R.string.environments_edit_title
                    },
                ),
            )
        },
        text = {
            Column {
                OutlinedTextField(
                    value = label,
                    onValueChange = { label = it },
                    label = { Text(stringResource(R.string.environments_field_label)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().testTag("environment_field_label"),
                )
                OutlinedTextField(
                    value = targetValue,
                    onValueChange = { targetValue = it },
                    label = { Text(stringResource(R.string.environments_field_target)) },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp)
                        .testTag("environment_field_target"),
                )
                OutlinedTextField(
                    value = port,
                    onValueChange = { port = it.filter(Char::isDigit) },
                    label = { Text(stringResource(R.string.environments_field_port)) },
                    singleLine = true,
                    isError = portInvalid,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp)
                        .testTag("environment_field_port"),
                )
                OutlinedTextField(
                    value = credentialRef,
                    onValueChange = {
                        credentialRef = it
                        credentialTouched = true
                    },
                    label = { Text(stringResource(R.string.environments_field_credential)) },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp)
                        .testTag("environment_field_credential"),
                )
                Text(
                    stringResource(R.string.environments_credentials_hint),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp),
                )
                androidx.compose.foundation.layout.Row(
                    Modifier.fillMaxWidth().padding(top = 8.dp),
                    verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
                ) {
                    Text(
                        stringResource(R.string.environments_field_enabled),
                        Modifier.weight(1f),
                    )
                    Switch(
                        checked = desiredEnabled,
                        onCheckedChange = { desiredEnabled = it },
                        modifier = Modifier.testTag("environment_field_enabled"),
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (editing == null) {
                        onCreate(
                            RemoteEnvironmentCreateRequest(
                                label = label.trim(),
                                target = targetValue.trim(),
                                port = portValue,
                                credentialRef = credentialRef.trim().takeIf(String::isNotEmpty),
                                desired = if (desiredEnabled) "enabled" else "disabled",
                            ),
                        )
                    } else {
                        onUpdate(
                            editing.environment,
                            buildPatch(
                                environment = editing.environment,
                                label = label.trim(),
                                target = targetValue.trim(),
                                port = portValue,
                                credentialRef = credentialRef.trim(),
                                credentialTouched = credentialTouched,
                                desiredEnabled = desiredEnabled,
                            ),
                        )
                    }
                },
                enabled = valid,
                modifier = Modifier.testTag("environment_editor_confirm"),
            ) {
                Text(
                    stringResource(
                        if (editing == null) {
                            R.string.environments_create_action
                        } else {
                            R.string.environments_save
                        },
                    ),
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.cancel_pair_button))
            }
        },
    )
}

private fun buildPatch(
    environment: RemoteEnvironmentProjection,
    label: String,
    target: String,
    port: Int?,
    credentialRef: String,
    credentialTouched: Boolean,
    desiredEnabled: Boolean,
): RemoteEnvironmentUpdatePatch {
    val desired = if (desiredEnabled) "enabled" else "disabled"
    return RemoteEnvironmentUpdatePatch(
        label = label.takeIf { it != environment.label },
        target = target.takeIf { it != environment.target },
        port = port?.takeIf { it != environment.port },
        clearPort = port == null && environment.port != null,
        credentialRef = credentialRef.takeIf { credentialTouched && it.isNotEmpty() },
        clearCredentialRef = credentialTouched &&
            credentialRef.isEmpty() &&
            environment.credentialConfigured,
        desired = desired.takeIf { it != environment.desired },
    )
}
