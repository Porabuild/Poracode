package com.poracode.app.ui

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import com.poracode.app.R
import com.poracode.app.push.PendingPushRoute

/**
 * Cross-host notification-tap confirmation. Names only the safe host display
 * label; cancel (including outside touch / back) leaves the current host and
 * thread unchanged.
 */
@Composable
fun PushRouteConfirmationDialog(
    pending: PendingPushRoute?,
    onConfirm: () -> Unit,
    onCancel: () -> Unit,
) {
    if (pending == null) return
    val a11yDescription = stringResource(R.string.push_route_confirm_description, pending.hostLabel)
    AlertDialog(
        onDismissRequest = onCancel,
        title = { Text(stringResource(R.string.push_route_confirm_title)) },
        text = {
            Text(
                stringResource(R.string.push_route_confirm_message, pending.hostLabel),
                modifier = Modifier.semantics { contentDescription = a11yDescription },
            )
        },
        confirmButton = {
            Button(onClick = onConfirm) {
                Text(stringResource(R.string.push_route_confirm_switch))
            }
        },
        dismissButton = {
            TextButton(onClick = onCancel) {
                Text(stringResource(R.string.push_route_confirm_cancel))
            }
        },
    )
}
