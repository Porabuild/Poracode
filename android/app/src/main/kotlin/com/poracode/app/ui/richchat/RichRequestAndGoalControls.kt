package com.poracode.app.ui.richchat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.chat.RichOpenRequest
import com.poracode.app.chat.RichPendingSteer
import com.poracode.app.chat.RichRequestOption
import com.poracode.app.chat.RichRuntimeItem
import com.poracode.app.transport.richchat.RequestResolution
import com.poracode.app.transport.richchat.ThreadGoalUpdate

@Composable
fun RichRequestCards(
    requests: List<RichOpenRequest>,
    resolving: Boolean,
    enabled: Boolean,
    onResolve: (RequestResolution) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (requests.isEmpty()) return
    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            stringResource(R.string.rich_chat_requests_title),
            style = MaterialTheme.typography.titleSmall,
        )
        if (!enabled) {
            Text(
                stringResource(R.string.rich_chat_permission_denied),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        requests.forEach { request ->
            RichRequestCard(request, resolving || !enabled, onResolve)
        }
    }
}

@Composable
private fun RichRequestCard(
    request: RichOpenRequest,
    resolving: Boolean,
    onResolve: (RequestResolution) -> Unit,
) {
    var showDetails by rememberSaveable(request.id.identityKey) { mutableStateOf(false) }
    val options = request.payload.options ?: listOf(
        RichRequestOption("allow", stringResource(R.string.rich_chat_allow)),
        RichRequestOption("deny", stringResource(R.string.rich_chat_deny)),
    )
    val multiSelect = request.payload.multiSelect == true
    var selectedOptionIds by rememberSaveable(
        request.id.identityKey,
        options.map(RichRequestOption::optionId),
        stateSaver = requestOptionSetSaver,
    ) { mutableStateOf(emptySet()) }
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.tertiaryContainer,
        ),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(request.payload.summary, style = MaterialTheme.typography.titleSmall)
            if (request.payload.details != null) {
                TextButton(onClick = { showDetails = !showDetails }) {
                    Text(
                        stringResource(
                            if (showDetails) {
                                R.string.rich_chat_hide_details
                            } else {
                                R.string.rich_chat_show_details
                            },
                        ),
                    )
                }
                if (showDetails) {
                    Text(
                        request.payload.details.toString().take(MAX_DETAILS_CHARS),
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (multiSelect) {
                    options.forEach { option ->
                        FilterChip(
                            selected = option.optionId in selectedOptionIds,
                            onClick = {
                                selectedOptionIds = if (option.optionId in selectedOptionIds) {
                                    selectedOptionIds - option.optionId
                                } else {
                                    selectedOptionIds + option.optionId
                                }
                            },
                            enabled = !resolving,
                            label = { Text(option.label) },
                        )
                    }
                    Button(
                        onClick = {
                            onResolve(
                                RichChatUiLogic.requestResolution(
                                    request.id.jsonValue,
                                    options.map(RichRequestOption::optionId)
                                        .filter(selectedOptionIds::contains),
                                ),
                            )
                        },
                        enabled = !resolving && selectedOptionIds.isNotEmpty(),
                    ) {
                        Text(stringResource(R.string.rich_chat_submit))
                    }
                } else {
                    options.forEachIndexed { index, option ->
                        val action = {
                            onResolve(
                                RichChatUiLogic.requestResolution(
                                    request.id.jsonValue,
                                    option.optionId,
                                ),
                            )
                        }
                        if (index == 0) {
                            Button(onClick = action, enabled = !resolving) { Text(option.label) }
                        } else {
                            OutlinedButton(onClick = action, enabled = !resolving) {
                                Text(option.label)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun RichGoalCard(
    items: List<RichRuntimeItem>,
    busy: Boolean,
    onUpdate: (ThreadGoalUpdate) -> Unit,
    modifier: Modifier = Modifier,
) {
    val goal = RichChatUiLogic.latestGoal(items) ?: return
    var editing by rememberSaveable(goal.objective) { mutableStateOf(false) }
    var draft by rememberSaveable(goal.objective) { mutableStateOf(goal.objective) }
    Card(modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(stringResource(R.string.rich_chat_goal), style = MaterialTheme.typography.titleSmall)
                Text(
                    goalStatusLabel(goal.status),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(goal.objective, style = MaterialTheme.typography.bodyMedium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if ("edit" in goal.availableActions) {
                    TextButton(onClick = { draft = goal.objective; editing = true }, enabled = !busy) {
                        Text(stringResource(R.string.rich_chat_edit_goal))
                    }
                }
                if ("pause" in goal.availableActions) {
                    TextButton(onClick = { onUpdate(ThreadGoalUpdate.Pause) }, enabled = !busy) {
                        Text(stringResource(R.string.rich_chat_pause_goal))
                    }
                }
                if ("resume" in goal.availableActions) {
                    TextButton(onClick = { onUpdate(ThreadGoalUpdate.Resume) }, enabled = !busy) {
                        Text(stringResource(R.string.rich_chat_resume_goal))
                    }
                }
                if ("clear" in goal.availableActions) {
                    TextButton(onClick = { onUpdate(ThreadGoalUpdate.Clear) }, enabled = !busy) {
                        Text(stringResource(R.string.rich_chat_clear_goal))
                    }
                }
            }
        }
    }
    if (editing) {
        AlertDialog(
            onDismissRequest = { if (!busy) editing = false },
            title = { Text(stringResource(R.string.rich_chat_edit_goal)) },
            text = {
                OutlinedTextField(
                    value = draft,
                    onValueChange = { if (it.length <= MAX_GOAL_LENGTH) draft = it },
                    label = { Text(stringResource(R.string.rich_chat_goal_objective)) },
                    minLines = 3,
                    maxLines = 8,
                )
            },
            confirmButton = {
                Button(
                    onClick = { onUpdate(ThreadGoalUpdate.Edit(draft.trim())) },
                    enabled = !busy && draft.isNotBlank() && draft.trim() != goal.objective,
                ) { Text(stringResource(R.string.rich_chat_save)) }
            },
            dismissButton = {
                TextButton(onClick = { editing = false }, enabled = !busy) {
                    Text(stringResource(R.string.rich_chat_cancel))
                }
            },
        )
    }
}

@Composable
fun RichPendingSteerCard(
    pending: RichPendingSteer?,
    busy: Boolean,
    onSet: (String) -> Unit,
    onClear: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var editing by rememberSaveable(pending?.id) { mutableStateOf(false) }
    var draft by rememberSaveable(pending?.id) { mutableStateOf(pending?.prompt.orEmpty()) }
    Card(modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                stringResource(R.string.rich_chat_pending_steer),
                style = MaterialTheme.typography.titleSmall,
            )
            if (pending == null) {
                Text(
                    stringResource(R.string.rich_chat_no_pending_steer),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                Text(pending.prompt, style = MaterialTheme.typography.bodyMedium)
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                TextButton(
                    onClick = { draft = pending?.prompt.orEmpty(); editing = true },
                    enabled = !busy,
                ) {
                    Text(
                        stringResource(
                            if (pending == null) {
                                R.string.rich_chat_add_steer
                            } else {
                                R.string.rich_chat_edit_steer
                            },
                        ),
                    )
                }
                if (pending != null) {
                    TextButton(onClick = onClear, enabled = !busy) {
                        Text(stringResource(R.string.rich_chat_clear_steer))
                    }
                }
            }
        }
    }
    if (editing) {
        AlertDialog(
            onDismissRequest = { if (!busy) editing = false },
            title = { Text(stringResource(R.string.rich_chat_edit_steer)) },
            text = {
                OutlinedTextField(
                    value = draft,
                    onValueChange = { draft = it },
                    label = { Text(stringResource(R.string.rich_chat_steer_message)) },
                    minLines = 3,
                    maxLines = 8,
                )
            },
            confirmButton = {
                Button(
                    onClick = { onSet(draft.trim()) },
                    enabled = !busy && draft.isNotBlank(),
                ) { Text(stringResource(R.string.rich_chat_save)) }
            },
            dismissButton = {
                TextButton(onClick = { editing = false }, enabled = !busy) {
                    Text(stringResource(R.string.rich_chat_cancel))
                }
            },
        )
    }
}

private const val MAX_DETAILS_CHARS = 2_000
private const val MAX_GOAL_LENGTH = 4_000
private val requestOptionSetSaver = listSaver<Set<String>, String>(
    save = { values -> values.toList() },
    restore = { values -> values.toSet() },
)

@Composable
private fun goalStatusLabel(status: String): String = stringResource(
    when (status) {
        "paused" -> R.string.rich_chat_goal_status_paused
        "budget_limited" -> R.string.rich_chat_goal_status_budget_limited
        "complete" -> R.string.rich_chat_goal_status_complete
        "failed" -> R.string.rich_chat_goal_status_failed
        "cancelled" -> R.string.rich_chat_goal_status_cancelled
        else -> R.string.rich_chat_goal_status_active
    },
)
