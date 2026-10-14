package com.poracode.app.ui.richchat

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.poracode.app.R

/**
 * Confirm dialogs for the thread screen's destructive actions. The screen
 * owns the pending-action state and every confirm side effect; these wrappers
 * only render title/message/buttons and gate the confirm button while an
 * operation is in flight.
 */

@Composable
internal fun RichChatTruncateConfirmDialog(
    enabled: Boolean,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.rich_chat_truncate_title)) },
        text = { Text(stringResource(R.string.rich_chat_truncate_message)) },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.rich_chat_cancel))
            }
        },
        confirmButton = {
            Button(enabled = enabled, onClick = onConfirm) {
                Text(stringResource(R.string.rich_chat_truncate))
            }
        },
    )
}

@Composable
internal fun RichChatRevertConfirmDialog(
    enabled: Boolean,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.rich_chat_revert_title)) },
        text = { Text(stringResource(R.string.rich_chat_revert_message)) },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.rich_chat_cancel))
            }
        },
        confirmButton = {
            Button(enabled = enabled, onClick = onConfirm) {
                Text(stringResource(R.string.rich_chat_revert))
            }
        },
    )
}

@Composable
internal fun RichChatCloseThreadConfirmDialog(
    enabled: Boolean,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.rich_chat_close_thread_title)) },
        text = { Text(stringResource(R.string.rich_chat_close_thread_message)) },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.rich_chat_cancel))
            }
        },
        confirmButton = {
            Button(enabled = enabled, onClick = onConfirm) {
                Text(stringResource(R.string.rich_chat_close_thread_action))
            }
        },
    )
}
