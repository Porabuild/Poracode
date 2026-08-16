package com.poracode.app.ui.thread

import androidx.compose.foundation.layout.Column
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.RemoteThread
import com.poracode.app.model.threads.ThreadCommandId
import com.poracode.app.model.threads.ThreadLifecycleCommand
import com.poracode.app.session.threads.ThreadLifecycleController
import com.poracode.app.session.threads.ThreadOperationFailure
import com.poracode.app.session.threads.ThreadOperationResult
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

@Composable
fun ThreadLifecycleActions(
    thread: RemoteThread,
    projectLocation: ProjectLocation,
    controller: ThreadLifecycleController,
    enabled: Boolean,
) {
    val controllerState by controller.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var expanded by rememberSaveable(thread.id) { mutableStateOf(false) }
    var dialog by remember(thread.id) { mutableStateOf<ThreadActionDialog?>(null) }
    var failure by remember(thread.id) { mutableStateOf<ThreadOperationFailure?>(null) }

    IconButton(
        onClick = { expanded = true },
        enabled = enabled && controllerState.active == null,
    ) {
        Icon(
            Icons.Outlined.MoreVert,
            contentDescription = stringResource(R.string.thread_lifecycle_actions),
        )
    }
    DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
        actionItem(R.string.thread_lifecycle_rename) {
            dialog = ThreadActionDialog.Rename(thread.title)
        }
        actionItem(R.string.thread_lifecycle_relaunch) {
            dialog = ThreadActionDialog.Relaunch("")
        }
        actionItem(
            if (thread.isStarred) R.string.thread_lifecycle_unpin else R.string.thread_lifecycle_pin,
        ) {
            launch(scope, { failure = it }) {
                controller.execute(ThreadLifecycleCommand.SetStarred(thread.id, !thread.isStarred))
            }
        }
        actionItem(
            if (thread.isDone) R.string.thread_lifecycle_not_done else R.string.thread_lifecycle_done,
        ) {
            launch(scope, { failure = it }) {
                controller.execute(ThreadLifecycleCommand.SetDone(thread.id, !thread.isDone))
            }
        }
        actionItem(R.string.thread_lifecycle_acknowledge) {
            launch(scope, { failure = it }) {
                controller.execute(ThreadLifecycleCommand.Acknowledge(thread.id))
            }
        }
        actionItem(
            if (thread.isArchived) {
                R.string.thread_lifecycle_unarchive
            } else {
                R.string.thread_lifecycle_archive
            },
        ) {
            if (thread.isArchived) {
                launch(scope, { failure = it }) {
                    controller.execute(ThreadLifecycleCommand.Unarchive(thread.id))
                }
            } else {
                dialog = ThreadActionDialog.Archive
            }
        }
        actionItem(R.string.thread_lifecycle_delete) { dialog = ThreadActionDialog.Delete }
    }

    when (val current = dialog) {
        is ThreadActionDialog.Rename -> TextEntryDialog(
            title = stringResource(R.string.thread_lifecycle_rename),
            label = stringResource(R.string.thread_lifecycle_rename_prompt),
            initialValue = current.title,
            onDismiss = { dialog = null },
            onSubmit = { title ->
                dialog = null
                launch(scope, { failure = it }) {
                    controller.execute(ThreadLifecycleCommand.Rename(thread.id, title))
                }
            },
        )
        is ThreadActionDialog.Relaunch -> TextEntryDialog(
            title = stringResource(R.string.thread_lifecycle_relaunch),
            label = stringResource(R.string.thread_lifecycle_relaunch_prompt),
            initialValue = current.prompt,
            onDismiss = { dialog = null },
            onSubmit = { prompt ->
                dialog = null
                launch(scope, { failure = it }) {
                    controller.startExisting(
                        ThreadLifecycleUiLogic.startExistingRequest(
                            thread,
                            projectLocation,
                            prompt,
                            ThreadCommandId(UUID.randomUUID().toString()),
                        ),
                    )
                }
            },
        )
        ThreadActionDialog.Archive -> ConfirmationDialog(
            title = stringResource(R.string.thread_lifecycle_archive_confirmation),
            action = stringResource(R.string.thread_lifecycle_archive),
            onDismiss = { dialog = null },
            onConfirm = {
                dialog = null
                launch(scope, { failure = it }) {
                    controller.execute(ThreadLifecycleCommand.Archive(thread.id))
                }
            },
        )
        ThreadActionDialog.Delete -> ConfirmationDialog(
            title = stringResource(R.string.thread_lifecycle_delete_confirmation),
            action = stringResource(R.string.thread_lifecycle_delete),
            onDismiss = { dialog = null },
            onConfirm = {
                dialog = null
                controller.requestDestructive(ThreadLifecycleCommand.Delete(thread.id))
                launch(scope, { failure = it }) { controller.confirmDestructive() }
            },
        )
        null -> Unit
    }

    failure?.let { problem ->
        AlertDialog(
            onDismissRequest = { failure = null },
            title = { Text(stringResource(R.string.thread_lifecycle_failed)) },
            text = { Text(stringResource(ThreadLifecycleUiLogic.failureMessage(problem))) },
            confirmButton = {
                Button(onClick = { failure = null }) {
                    Text(stringResource(R.string.thread_lifecycle_close))
                }
            },
        )
    }
}

@Composable
private fun actionItem(label: Int, action: () -> Unit) {
    DropdownMenuItem(text = { Text(stringResource(label)) }, onClick = action)
}

@Composable
private fun TextEntryDialog(
    title: String,
    label: String,
    initialValue: String,
    onDismiss: () -> Unit,
    onSubmit: (String) -> Unit,
) {
    var value by rememberSaveable(title) { mutableStateOf(initialValue) }
    val normalized = value.trim()
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column {
                OutlinedTextField(
                    value = value,
                    onValueChange = { value = it },
                    label = { Text(label) },
                )
            }
        },
        dismissButton = {
            Button(onClick = onDismiss) { Text(stringResource(R.string.thread_lifecycle_cancel)) }
        },
        confirmButton = {
            Button(onClick = { onSubmit(normalized) }, enabled = normalized.isNotEmpty()) {
                Text(stringResource(R.string.thread_lifecycle_submit))
            }
        },
    )
}

@Composable
private fun ConfirmationDialog(
    title: String,
    action: String,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        dismissButton = {
            Button(onClick = onDismiss) { Text(stringResource(R.string.thread_lifecycle_cancel)) }
        },
        confirmButton = { Button(onClick = onConfirm) { Text(action) } },
    )
}

private fun launch(
    scope: CoroutineScope,
    onFailure: (ThreadOperationFailure) -> Unit,
    action: suspend () -> ThreadOperationResult<*>,
) {
    scope.launch {
        when (val result = action()) {
            is ThreadOperationResult.Failed -> onFailure(result.failure)
            else -> Unit
        }
    }
}

private sealed interface ThreadActionDialog {
    data class Rename(val title: String) : ThreadActionDialog
    data class Relaunch(val prompt: String) : ThreadActionDialog
    data object Archive : ThreadActionDialog
    data object Delete : ThreadActionDialog
}
