package com.poracode.app.ui.richchat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.chat.RichCheckpoint
import com.poracode.app.session.richchat.RichCheckpointState
import com.poracode.app.ui.theme.PoracodeIcons
import androidx.compose.material3.FilledTonalButton

private sealed interface PendingCheckpointAction {
    data class Restore(val checkpoint: RichCheckpoint) : PendingCheckpointAction
    data object Rollback : PendingCheckpointAction
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RichCheckpointControls(
    state: RichCheckpointState,
    canOperate: Boolean,
    interactionBusy: Boolean,
    onRefresh: () -> Unit,
    onRestore: (RichCheckpoint) -> Unit,
    onRollback: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var open by rememberSaveable { mutableStateOf(false) }
    var pending by remember { mutableStateOf<PendingCheckpointAction?>(null) }
    val busy = state.activeOperations.isNotEmpty()
    com.poracode.app.ui.components.PoracodeListRow(
        modifier = modifier,
        enabled = !busy,
        containerColor = com.poracode.app.ui.theme.PoracodeTheme.colors.paneCard,
        onClick = { open = true; onRefresh() },
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 12.dp),
    ) {
        Icon(
            PoracodeIcons.History,
            contentDescription = null,
            modifier = androidx.compose.ui.Modifier.size(16.dp),
            tint = com.poracode.app.ui.theme.PoracodeTheme.colors.muted,
        )
        Text(
            stringResource(R.string.rich_chat_checkpoints),
            style = com.poracode.app.ui.theme.PoracodeTextStyles.sheetTitle,
            color = com.poracode.app.ui.theme.PoracodeTheme.colors.foreground,
            modifier = Modifier.weight(1f),
        )
        Icon(
            PoracodeIcons.KeyboardArrowRight,
            contentDescription = null,
            modifier = androidx.compose.ui.Modifier.size(15.dp),
            tint = com.poracode.app.ui.theme.PoracodeTheme.colors.muted,
        )
    }
    if (open) {
        com.poracode.app.ui.components.PoracodeSheet(
            onDismissRequest = { if (!busy) open = false },
            title = stringResource(R.string.rich_chat_checkpoints),
        ) {
            Column(Modifier.padding(bottom = 12.dp)) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(bottom = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.End,
                ) {
                    com.poracode.app.ui.components.PoracodeActionButton(
                        label = stringResource(R.string.rich_chat_refresh_checkpoints),
                        icon = PoracodeIcons.Refresh,
                        variant = com.poracode.app.ui.components.PoracodeButtonVariant.Tonal,
                        enabled = !busy,
                        onClick = onRefresh,
                    )
                }
                state.failure?.let { failure ->
                    Text(
                        richChatFailureText(failure) ?: stringResource(R.string.rich_chat_request_failed),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                    )
                }
                val values = (state.turns + state.checkpoints)
                    .distinctBy(RichCheckpoint::checkpointItemId)
                    .sortedByDescending(RichCheckpoint::capturedAt)
                if (values.isEmpty()) {
                    Text(
                        stringResource(
                            if (busy) {
                                R.string.rich_chat_loading_checkpoints
                            } else {
                                R.string.rich_chat_no_checkpoints
                            },
                        ),
                        modifier = Modifier.padding(16.dp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    LazyColumn(Modifier.heightIn(max = 420.dp)) {
                        items(values, key = RichCheckpoint::checkpointItemId) { checkpoint ->
                            CheckpointRow(
                                checkpoint = checkpoint,
                                enabled = canOperate && !busy && !interactionBusy,
                                onRestore = {
                                    pending = PendingCheckpointAction.Restore(checkpoint)
                                },
                            )
                            HorizontalDivider()
                        }
                    }
                }
                FilledTonalButton(
                    onClick = { pending = PendingCheckpointAction.Rollback },
                    enabled = canOperate && !busy && !interactionBusy,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                ) {
                    Text(stringResource(R.string.rich_chat_rollback_one_turn))
                }
            }
        }
    }
    pending?.let { action ->
        val restoring = action is PendingCheckpointAction.Restore
        AlertDialog(
            onDismissRequest = { if (!busy) pending = null },
            title = {
                Text(
                    stringResource(
                        if (restoring) {
                            R.string.rich_chat_restore_checkpoint_title
                        } else {
                            R.string.rich_chat_rollback_title
                        },
                    ),
                )
            },
            text = {
                Text(
                    stringResource(
                        if (restoring) {
                            R.string.rich_chat_restore_checkpoint_message
                        } else {
                            R.string.rich_chat_rollback_message
                        },
                    ),
                )
            },
            confirmButton = {
                FilledTonalButton(
                    onClick = {
                        pending = null
                        when (action) {
                            is PendingCheckpointAction.Restore -> onRestore(action.checkpoint)
                            PendingCheckpointAction.Rollback -> onRollback()
                        }
                    },
                    enabled = !busy,
                ) {
                    Text(
                        stringResource(
                            if (restoring) {
                                R.string.rich_chat_restore_files
                            } else {
                                R.string.rich_chat_rollback
                            },
                        ),
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = { pending = null }, enabled = !busy) {
                    Text(stringResource(R.string.rich_chat_cancel))
                }
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CheckpointRow(
    checkpoint: RichCheckpoint,
    enabled: Boolean,
    onRestore: () -> Unit,
) {
    val restoreLabel = stringResource(R.string.rich_chat_restore_files)
    // Swipe-to-restore is an additional gesture; the trailing button stays so the action
    // remains discoverable and reachable without a swipe gesture (touch or accessibility).
    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            if (value == SwipeToDismissBoxValue.StartToEnd && enabled) onRestore()
            false
        },
    )
    SwipeToDismissBox(
        state = dismissState,
        enableDismissFromStartToEnd = enabled,
        enableDismissFromEndToStart = false,
        backgroundContent = {
            Row(
                Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.primaryContainer)
                    .padding(horizontal = 20.dp)
                    .semantics { contentDescription = restoreLabel },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(
                    PoracodeIcons.History,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onPrimaryContainer,
                )
                Text(restoreLabel, color = MaterialTheme.colorScheme.onPrimaryContainer)
            }
        },
    ) {
        ListItem(
            headlineContent = {
                Text(
                    stringResource(
                        if (checkpoint.isTurn) {
                            R.string.rich_chat_turn_checkpoint
                        } else {
                            R.string.rich_chat_file_checkpoint
                        },
                    ),
                )
            },
            supportingContent = {
                Text(
                    stringResource(
                        R.string.rich_chat_checkpoint_summary,
                        checkpoint.capturedAt,
                        checkpoint.changedFiles?.size ?: 0,
                    ),
                )
            },
            trailingContent = {
                TextButton(onClick = onRestore, enabled = enabled) {
                    Text(restoreLabel)
                }
            },
        )
    }
}
