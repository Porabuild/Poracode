package com.poracode.app.ui.remoteintegrations

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R

@Composable
internal fun ScheduleEditorDialog(
    initial: ScheduleEditorDraft,
    onDismiss: () -> Unit,
    onConfirm: (ScheduleEditorDraft) -> Unit,
) {
    var draft by remember(initial) { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(
            if (draft.id == null) R.string.remote_integrations_create_schedule
            else R.string.remote_integrations_edit_schedule,
        )) },
        text = {
            Column(
                Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                EditorField(draft.name, { draft = draft.copy(name = it) }, R.string.remote_integrations_name)
                EditorField(
                    draft.prompt,
                    { draft = draft.copy(prompt = it) },
                    R.string.remote_integrations_prompt,
                    minLines = 3,
                )
                EditorField(
                    draft.agentKind,
                    { draft = draft.copy(agentKind = it) },
                    R.string.remote_integrations_agent,
                )
                EditorField(draft.model, { draft = draft.copy(model = it) }, R.string.remote_integrations_model)
                EditorField(
                    draft.effort,
                    { draft = draft.copy(effort = it) },
                    R.string.remote_integrations_effort_optional,
                )
                EditorField(
                    draft.projectId,
                    { draft = draft.copy(projectId = it) },
                    R.string.remote_integrations_project_optional,
                )
                Text(stringResource(R.string.remote_integrations_recurrence))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    RecurrenceChip("hourly", draft.recurrenceKind) {
                        draft = draft.copy(recurrenceKind = it)
                    }
                    RecurrenceChip("weekly", draft.recurrenceKind) {
                        draft = draft.copy(recurrenceKind = it)
                    }
                    RecurrenceChip("once", draft.recurrenceKind) {
                        draft = draft.copy(recurrenceKind = it)
                    }
                }
                when (draft.recurrenceKind) {
                    "hourly" -> EditorField(
                        draft.minute,
                        { draft = draft.copy(minute = it) },
                        R.string.remote_integrations_minute,
                    )
                    "weekly" -> {
                        EditorField(
                            draft.days,
                            { draft = draft.copy(days = it) },
                            R.string.remote_integrations_weekdays,
                        )
                        EditorField(
                            draft.time,
                            { draft = draft.copy(time = it) },
                            R.string.remote_integrations_local_time,
                        )
                    }
                    else -> EditorField(
                        draft.runAt,
                        { draft = draft.copy(runAt = it) },
                        R.string.remote_integrations_run_at,
                    )
                }
                ToggleRow(R.string.remote_integrations_enabled, draft.enabled) {
                    draft = draft.copy(enabled = it)
                }
                ToggleRow(R.string.remote_integrations_fast_mode, draft.fast) {
                    draft = draft.copy(fast = it)
                }
                if (draft.domain() == null) {
                    Text(stringResource(R.string.remote_integrations_invalid_schedule))
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(draft) }, enabled = draft.domain() != null) {
                Text(stringResource(
                    if (draft.id == null) R.string.remote_integrations_create
                    else R.string.remote_integrations_save,
                ))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.remote_integrations_cancel)) }
        },
    )
}

@Composable
private fun EditorField(
    value: String,
    onValueChange: (String) -> Unit,
    label: Int,
    minLines: Int = 1,
) {
    OutlinedTextField(
        value,
        onValueChange,
        label = { Text(stringResource(label)) },
        modifier = Modifier.fillMaxWidth(),
        minLines = minLines,
        singleLine = minLines == 1,
    )
}

@Composable
private fun RecurrenceChip(kind: String, selected: String, onSelect: (String) -> Unit) {
    val label = when (kind) {
        "hourly" -> R.string.remote_integrations_hourly
        "weekly" -> R.string.remote_integrations_weekly
        else -> R.string.remote_integrations_once
    }
    FilterChip(
        selected = selected == kind,
        onClick = { onSelect(kind) },
        label = { Text(stringResource(label)) },
    )
}

@Composable
internal fun ToggleRow(label: Int, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(stringResource(label))
        Switch(checked, onCheckedChange)
    }
}
