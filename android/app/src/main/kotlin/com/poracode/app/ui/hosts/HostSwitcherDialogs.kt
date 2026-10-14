package com.poracode.app.ui.hosts

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import com.poracode.app.R
import com.poracode.app.model.HostRecord
import com.poracode.app.storage.HostCatalog

/**
 * Local removal confirmation. A host-owned environment names its own removal;
 * removing the paired parent that still has dependent environment records warns
 * that the cascade forgets those local records and their child credentials
 * (the host-owned environments themselves are never touched).
 */
@Composable
internal fun HostRemovalDialog(
    host: HostRecord,
    dependents: Int,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.hosts_remove_confirm_title, host.label)) },
        text = {
            Text(
                when {
                    host.environment != null -> stringResource(
                        R.string.environments_remove_local_message,
                    )
                    dependents > 0 -> stringResource(
                        R.string.environments_remove_parent_message,
                        host.label,
                        dependents,
                    )
                    else -> stringResource(R.string.hosts_remove_confirm_message)
                },
            )
        },
        confirmButton = {
            Button(onClick = onConfirm) { Text(stringResource(R.string.hosts_remove_action)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.cancel_pair_button))
            }
        },
    )
}

@Composable
internal fun RenameHostDialog(
    host: HostRecord,
    onDismiss: () -> Unit,
    onRename: (String) -> Unit,
) {
    var label by remember(host.connectionId) { mutableStateOf(host.label) }
    val normalized = label.trim()
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.hosts_rename_title)) },
        text = {
            OutlinedTextField(
                value = label,
                onValueChange = { if (it.length <= HostCatalog.MAX_HOST_LABEL_LENGTH) label = it },
                label = { Text(stringResource(R.string.hosts_name_label)) },
                singleLine = true,
            )
        },
        confirmButton = {
            Button(
                onClick = { onRename(normalized) },
                enabled = normalized.isNotEmpty() && normalized != host.label,
            ) { Text(stringResource(R.string.hosts_rename_action)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.cancel_pair_button))
            }
        },
    )
}
