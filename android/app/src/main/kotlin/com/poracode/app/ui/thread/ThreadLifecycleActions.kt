package com.poracode.app.ui.thread

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.vector.ImageVector
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
import com.poracode.app.ui.components.PoracodeSheet
import com.poracode.app.ui.components.PoracodeSheetAction
import com.poracode.app.ui.components.PoracodeSheetDivider
import com.poracode.app.ui.components.PoracodeTextField
import com.poracode.app.ui.components.PoracodeTone
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeTheme
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import androidx.compose.material3.FilledTonalButton

/** A screen-owned entry shown above the lifecycle actions in the thread actions drawer. */
data class ThreadSheetAction(
    val label: String,
    val icon: ImageVector,
    val enabled: Boolean = true,
    val tone: PoracodeTone = PoracodeTone.Neutral,
    val onClick: () -> Unit,
)

/**
 * Thread actions drawer (the PWA's long-press / "Thread actions" sheet): rename,
 * relaunch, pin, done, acknowledge, archive, and delete, plus any screen actions.
 * Confirmation and text-entry dialogs outlive the drawer that opened them.
 */
@Composable
fun ThreadLifecycleActionsSheet(
    thread: RemoteThread,
    projectLocation: ProjectLocation,
    controller: ThreadLifecycleController,
    enabled: Boolean,
    visible: Boolean,
    onDismiss: () -> Unit,
    onThreadRemoved: () -> Unit,
    contextActions: List<ThreadSheetAction> = emptyList(),
    nativeActions: List<ThreadSheetAction> = emptyList(),
) {
    val controllerState by controller.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var dialog by remember(thread.id) { mutableStateOf<ThreadActionDialog?>(null) }
    var failure by remember(thread.id) { mutableStateOf<ThreadOperationFailure?>(null) }
    val actionsEnabled = enabled && controllerState.active == null
    fun select(action: () -> Unit) {
        onDismiss()
        action()
    }

    if (visible) {
        PoracodeSheet(
            onDismissRequest = onDismiss,
            title = thread.title.ifBlank { stringResource(R.string.untitled_thread) },
        ) {
            PoracodeSheetAction(
                label = stringResource(R.string.thread_lifecycle_rename),
                icon = PoracodeIcons.Edit,
                enabled = actionsEnabled,
                onClick = { select { dialog = ThreadActionDialog.Rename(thread.title) } },
            )
            contextActions.forEach { action ->
                PoracodeSheetAction(
                    label = action.label,
                    icon = action.icon,
                    enabled = action.enabled,
                    tone = action.tone,
                    onClick = { select(action.onClick) },
                )
            }
            PoracodeSheetAction(
                label = stringResource(
                    if (thread.isDone) R.string.thread_lifecycle_not_done else R.string.thread_lifecycle_done,
                ),
                icon = PoracodeIcons.CheckCircle,
                enabled = actionsEnabled,
                onClick = {
                    select {
                        launch(scope, { failure = it }) {
                            controller.execute(ThreadLifecycleCommand.SetDone(thread.id, !thread.isDone))
                        }
                    }
                },
            )
            PoracodeSheetAction(
                label = stringResource(
                    if (thread.isStarred) {
                        R.string.thread_lifecycle_unpin
                    } else {
                        R.string.thread_lifecycle_pin_top
                    },
                ),
                icon = PoracodeIcons.Star,
                enabled = actionsEnabled,
                onClick = {
                    select {
                        launch(scope, { failure = it }) {
                            controller.execute(
                                ThreadLifecycleCommand.SetStarred(thread.id, !thread.isStarred),
                            )
                        }
                    }
                },
            )
            nativeActions.forEach { action ->
                PoracodeSheetAction(
                    label = action.label,
                    icon = action.icon,
                    enabled = action.enabled,
                    tone = action.tone,
                    onClick = { select(action.onClick) },
                )
            }
            PoracodeSheetAction(
                label = stringResource(R.string.thread_lifecycle_relaunch),
                icon = PoracodeIcons.PlayArrow,
                enabled = actionsEnabled,
                onClick = { select { dialog = ThreadActionDialog.Relaunch("") } },
            )
            PoracodeSheetAction(
                label = stringResource(R.string.thread_lifecycle_acknowledge),
                icon = PoracodeIcons.Check,
                enabled = actionsEnabled,
                onClick = {
                    select {
                        launch(scope, { failure = it }) {
                            controller.execute(ThreadLifecycleCommand.Acknowledge(thread.id))
                        }
                    }
                },
            )
            PoracodeSheetDivider()
            PoracodeSheetAction(
                label = stringResource(
                    if (thread.isArchived) {
                        R.string.thread_lifecycle_unarchive
                    } else {
                        R.string.thread_lifecycle_archive_thread
                    },
                ),
                icon = PoracodeIcons.Archive,
                tone = PoracodeTone.Warning,
                enabled = actionsEnabled,
                onClick = {
                    select {
                        if (thread.isArchived) {
                            launch(scope, { failure = it }) {
                                controller.execute(ThreadLifecycleCommand.Unarchive(thread.id))
                            }
                        } else {
                            dialog = ThreadActionDialog.Archive
                        }
                    }
                },
            )
            PoracodeSheetAction(
                label = stringResource(R.string.thread_lifecycle_delete_thread),
                icon = PoracodeIcons.Delete,
                tone = PoracodeTone.Danger,
                enabled = actionsEnabled,
                onClick = { select { dialog = ThreadActionDialog.Delete } },
            )
        }
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
                launch(scope, { failure = it }, onThreadRemoved) {
                    controller.execute(ThreadLifecycleCommand.Archive(thread.id))
                }
            },
        )
        ThreadActionDialog.Delete -> ConfirmationDialog(
            title = stringResource(R.string.thread_lifecycle_delete_confirmation),
            action = stringResource(R.string.thread_lifecycle_delete),
            destructive = true,
            onDismiss = { dialog = null },
            onConfirm = {
                dialog = null
                controller.requestDestructive(ThreadLifecycleCommand.Delete(thread.id))
                launch(scope, { failure = it }, onThreadRemoved) {
                    controller.confirmDestructive()
                }
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
                FilledTonalButton(onClick = { failure = null }) {
                    Text(stringResource(R.string.thread_lifecycle_close))
                }
            },
        )
    }
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
                PoracodeTextField(
                    value = value,
                    onValueChange = { value = it },
                    label = { Text(label) },
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.thread_lifecycle_cancel)) }
        },
        confirmButton = {
            FilledTonalButton(onClick = { onSubmit(normalized) }, enabled = normalized.isNotEmpty()) {
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
    destructive: Boolean = false,
) {
    val colors = PoracodeTheme.colors
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.thread_lifecycle_cancel)) }
        },
        confirmButton = {
            Button(
                onClick = onConfirm,
                colors = if (destructive) {
                    androidx.compose.material3.ButtonDefaults.buttonColors(
                        containerColor = colors.danger,
                        contentColor = colors.dangerForeground,
                    )
                } else {
                    androidx.compose.material3.ButtonDefaults.buttonColors()
                },
            ) { Text(action) }
        },
    )
}

private fun launch(
    scope: CoroutineScope,
    onFailure: (ThreadOperationFailure) -> Unit,
    onSuccess: () -> Unit = {},
    action: suspend () -> ThreadOperationResult<*>,
) {
    scope.launch {
        when (val result = action()) {
            is ThreadOperationResult.Failed -> onFailure(result.failure)
            is ThreadOperationResult.Success -> onSuccess()
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
