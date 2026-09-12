package com.poracode.app.ui.richchat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.KeyboardArrowUp
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.chat.RichFollowUpQueue
import com.poracode.app.chat.RichPendingSteer
import com.poracode.app.chat.toJsonArrayOrNull
import com.poracode.app.session.richchat.RichChatOperationResult
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.session.richchat.editQueuedFollowUp
import com.poracode.app.session.richchat.pauseFollowUps
import com.poracode.app.session.richchat.removeQueuedFollowUp
import com.poracode.app.session.richchat.reorderQueuedFollowUp
import com.poracode.app.session.richchat.resumeFollowUps
import com.poracode.app.session.richchat.steerQueuedFollowUp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Follow-up queue section docked above the composer. All mutations go through
 * the chat controller and settle on the authoritative `thread-follow-up-queue`
 * broadcast — no optimistic removals or reorders.
 */
@Composable
internal fun RichFollowUpQueueSection(
    runtime: RichChatSessionRuntime,
    queue: RichFollowUpQueue,
    enabled: Boolean,
    modifier: Modifier = Modifier,
) {
    if (queue.items.isEmpty() && !queue.paused) return
    val scope = rememberCoroutineScope()
    var editing by remember { mutableStateOf<RichPendingSteer?>(null) }

    Surface(tonalElevation = 2.dp, modifier = modifier.fillMaxWidth()) {
        Column(Modifier.padding(horizontal = 12.dp, vertical = 6.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    stringResource(R.string.rich_chat_queue_title, queue.items.size),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (queue.paused) {
                    TextButton(enabled = enabled, onClick = {
                        scope.launch { runtime.chat.resumeFollowUps() }
                    }) {
                        Text(stringResource(R.string.rich_chat_queue_resume))
                    }
                }
            }
            queue.items.forEachIndexed { index, item ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        item.prompt,
                        maxLines = 2,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.weight(1f),
                    )
                    IconButton(
                        enabled = enabled && index > 0,
                        onClick = { reorder(scope, runtime, queue, index, up = true) },
                    ) {
                        Icon(
                            Icons.Outlined.KeyboardArrowUp,
                            contentDescription = stringResource(R.string.rich_chat_queue_move_up),
                        )
                    }
                    IconButton(
                        enabled = enabled && index < queue.items.lastIndex,
                        onClick = { reorder(scope, runtime, queue, index, up = false) },
                    ) {
                        Icon(
                            Icons.Outlined.KeyboardArrowDown,
                            contentDescription = stringResource(R.string.rich_chat_queue_move_down),
                        )
                    }
                    IconButton(
                        enabled = enabled,
                        onClick = {
                            // Desktop parity: pause delivery first and only
                            // open the editor once the pause is confirmed —
                            // the server rejects an expectedStagedAt edit on
                            // an unpaused record.
                            val captured = item
                            scope.launch {
                                if (
                                    runtime.chat.pauseFollowUps(captured.id) is
                                    RichChatOperationResult.Success
                                ) {
                                    editing = captured
                                }
                            }
                        },
                    ) {
                        Icon(
                            Icons.Outlined.Edit,
                            contentDescription = stringResource(R.string.rich_chat_queue_edit),
                        )
                    }
                    IconButton(
                        enabled = enabled,
                        onClick = {
                            scope.launch { runtime.chat.removeQueuedFollowUp(item.id) }
                        },
                    ) {
                        Icon(
                            Icons.Outlined.Close,
                            contentDescription = stringResource(R.string.rich_chat_queue_remove),
                        )
                    }
                    IconButton(
                        enabled = enabled,
                        onClick = {
                            scope.launch { runtime.chat.steerQueuedFollowUp(item.id) }
                        },
                    ) {
                        Icon(
                            Icons.Outlined.PlayArrow,
                            contentDescription = stringResource(R.string.rich_chat_queue_steer_now),
                        )
                    }
                }
            }
            if (queue.paused && queue.items.isNotEmpty()) {
                Text(
                    stringResource(R.string.rich_chat_queue_paused),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.tertiary,
                )
            }
            HorizontalDivider(Modifier.padding(top = 4.dp))
        }
    }

    editing?.let { item ->
        var draft by remember(item.id) { mutableStateOf(item.prompt) }
        AlertDialog(
            onDismissRequest = { editing = null },
            title = { Text(stringResource(R.string.rich_chat_queue_edit_title)) },
            text = {
                OutlinedTextField(
                    value = draft,
                    onValueChange = { draft = it },
                    modifier = Modifier.fillMaxWidth(),
                    maxLines = 6,
                )
            },
            dismissButton = {
                TextButton(onClick = { editing = null }) {
                    Text(stringResource(R.string.rich_chat_cancel))
                }
            },
            confirmButton = {
                Button(
                    enabled = enabled && draft.isNotBlank(),
                    onClick = {
                        val captured = item
                        val trimmed = draft.trim()
                        editing = null
                        scope.launch {
                            when (
                                runtime.chat.editQueuedFollowUp(
                                    buildJsonObject {
                                        put("id", captured.id)
                                        put("expectedStagedAt", captured.stagedAtEpochMs.toLong())
                                        put("prompt", trimmed)
                                        // The server rebuilds the item from
                                        // this payload alone; without the
                                        // existing segments an edit would
                                        // silently drop attachments/mentions.
                                        captured.segments?.toJsonArrayOrNull()?.let {
                                            put("segments", it)
                                        }
                                    },
                                )
                            ) {
                                is RichChatOperationResult.Success -> Unit
                                else -> Unit
                            }
                        }
                    },
                ) { Text(stringResource(R.string.rich_chat_queue_save)) }
            },
        )
    }
}

private fun reorder(
    scope: kotlinx.coroutines.CoroutineScope,
    runtime: RichChatSessionRuntime,
    queue: RichFollowUpQueue,
    index: Int,
    up: Boolean,
) {
    val items = queue.items
    val target = if (up) queueMoveUpTarget(items, index) else queueMoveDownTarget(items, index)
    val beforeId = when (target) {
        is QueueReorderTarget.Before -> target.id
        QueueReorderTarget.Tail -> null
        QueueReorderTarget.None -> return
    }
    scope.launch { runtime.chat.reorderQueuedFollowUp(items[index].id, beforeId) }
}
