package com.poracode.app.ui.projects.workspace

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.poracode.app.R
import com.poracode.app.model.ProjectWorkspaceTarget
import com.poracode.app.session.projects.ProjectEntryMutation

internal data class PendingProjectEntryMutation(
    val target: ProjectWorkspaceTarget,
    val mutation: ProjectEntryMutation,
    val editedPath: String,
)

@Composable
internal fun ProjectMutationDiscardDialog(
    pending: PendingProjectEntryMutation?,
    onConfirm: (PendingProjectEntryMutation) -> Unit,
    onDismiss: () -> Unit,
) {
    if (pending == null) return
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.workspace_discard_title)) },
        text = {
            Text(stringResource(R.string.workspace_discard_message, pending.editedPath))
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(pending) }) {
                Text(stringResource(R.string.workspace_discard))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.workspace_keep_editing))
            }
        },
    )
}
