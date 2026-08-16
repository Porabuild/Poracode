package com.poracode.app.ui.richchat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Refresh
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
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.chat.RichCheckpoint
import com.poracode.app.session.richchat.RichCheckpointState

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
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        OutlinedButton(
            onClick = { open = true; onRefresh() },
            enabled = !busy,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Icon(Icons.Outlined.History, contentDescription = null)
            Text(
                stringResource(R.string.rich_chat_checkpoints),
                modifier = Modifier.padding(start = 8.dp),
            )
        }
    }
    if (open) {
        ModalBottomSheet(onDismissRequest = { if (!busy) open = false }) {
            Column(Modifier.padding(bottom = 24.dp)) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                ) {
                    Text(
                        stringResource(R.string.rich_chat_checkpoints),
                        style = MaterialTheme.typography.titleLarge,
                        modifier = Modifier.weight(1f),
                    )
                    IconButton(onClick = onRefresh, enabled = !busy) {
                        Icon(
                            Icons.Outlined.Refresh,
                            contentDescription = stringResource(R.string.rich_chat_refresh_checkpoints),
                        )
                    }
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
                Button(
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
                Button(
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

@Composable
private fun CheckpointRow(
    checkpoint: RichCheckpoint,
    enabled: Boolean,
    onRestore: () -> Unit,
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
                Text(stringResource(R.string.rich_chat_restore_files))
            }
        },
    )
}
