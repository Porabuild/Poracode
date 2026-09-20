package com.poracode.app.ui

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.poracode.app.R
import com.poracode.app.protocol.LocalNetworkPermissionUi

@Composable
fun LocalNetworkPermissionDialog(
    ui: LocalNetworkPermissionUi,
    onContinue: () -> Unit,
    onDismiss: () -> Unit,
) {
    when (ui.status) {
        LocalNetworkPermissionUi.Status.Rationale -> AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text(stringResource(R.string.local_network_permission_title)) },
            text = {
                Text(
                    stringResource(
                        R.string.local_network_permission_rationale,
                        ui.sanitizedHost,
                    ),
                )
            },
            confirmButton = {
                Button(onClick = onContinue) {
                    Text(stringResource(R.string.local_network_permission_continue))
                }
            },
            dismissButton = {
                TextButton(onClick = onDismiss) {
                    Text(stringResource(R.string.local_network_permission_not_now))
                }
            },
        )
        LocalNetworkPermissionUi.Status.Denied -> AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text(stringResource(R.string.local_network_permission_denied_title)) },
            text = { Text(stringResource(R.string.local_network_permission_denied_message)) },
            confirmButton = {
                Button(onClick = onContinue) {
                    Text(stringResource(R.string.local_network_permission_try_again))
                }
            },
            dismissButton = {
                TextButton(onClick = onDismiss) {
                    Text(stringResource(R.string.local_network_permission_not_now))
                }
            },
        )
        LocalNetworkPermissionUi.Status.Idle,
        LocalNetworkPermissionUi.Status.Granted,
        -> Unit
    }
}
