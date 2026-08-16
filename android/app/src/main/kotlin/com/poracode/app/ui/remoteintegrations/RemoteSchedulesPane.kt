package com.poracode.app.ui.remoteintegrations

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.remoteintegrations.ScheduleRecurrence
import com.poracode.app.model.remoteintegrations.ScheduleRunStatus
import com.poracode.app.model.remoteintegrations.ScheduledTask
import com.poracode.app.session.remoteintegrations.IntegrationSlot
import com.poracode.app.session.remoteintegrations.RemoteIntegrationsState

private sealed interface ScheduleConfirmation {
    data class Run(val task: ScheduledTask) : ScheduleConfirmation
    data class Delete(val task: ScheduledTask) : ScheduleConfirmation
}

@Composable
internal fun RemoteSchedulesPane(
    state: RemoteIntegrationsState,
    access: RemoteIntegrationsAccess,
    composition: RemoteIntegrationsComposition,
    modifier: Modifier = Modifier,
) {
    var editor by remember { mutableStateOf<ScheduleEditorDraft?>(null) }
    var confirmation by remember { mutableStateOf<ScheduleConfirmation?>(null) }
    val loading = IntegrationSlot.Schedules in state.loading
    LazyColumn(
        modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    stringResource(R.string.remote_integrations_schedules),
                    style = MaterialTheme.typography.headlineSmall,
                    modifier = Modifier.semantics { heading() },
                )
                if (access.canOperate) {
                    FloatingActionButton(
                        onClick = { editor = ScheduleEditorDraft() },
                        modifier = Modifier.semantics(mergeDescendants = true) {},
                    ) {
                        Icon(Icons.Outlined.Add, stringResource(R.string.remote_integrations_create_schedule))
                    }
                }
            }
        }
        if (loading && state.schedules.isEmpty()) item { IntegrationLoading() }
        if (!loading && state.schedules.isEmpty() && state.failures[IntegrationSlot.Schedules] == null) {
            item {
                IntegrationSectionCard(stringResource(R.string.remote_integrations_no_schedules)) {
                    Text(stringResource(R.string.remote_integrations_no_schedules_message))
                }
            }
        }
        items(state.schedules, key = ScheduledTask::id) { task ->
            ScheduleCard(
                task,
                enabled = access.canOperate && !loading,
                onEdit = { editor = ScheduleEditorDraft.from(task) },
                onRun = { confirmation = ScheduleConfirmation.Run(task) },
                onDelete = { confirmation = ScheduleConfirmation.Delete(task) },
            )
        }
        item {
            IntegrationFailureView(state.failures[IntegrationSlot.Schedules]) {
                composition.refresh(RemoteIntegrationsSection.Schedules)
            }
            IntegrationMutationMessage(state.mutation)
        }
    }

    editor?.let { draft ->
        ScheduleEditorDialog(
            initial = draft,
            onDismiss = { editor = null },
            onConfirm = { completed ->
                editor = null
                if (completed.id == null) composition.createSchedule(checkNotNull(completed.domain()))
                else composition.updateSchedule(completed.id, checkNotNull(completed.domain()))
            },
        )
    }
    confirmation?.let { pending ->
        val delete = pending is ScheduleConfirmation.Delete
        val task = when (pending) {
            is ScheduleConfirmation.Run -> pending.task
            is ScheduleConfirmation.Delete -> pending.task
        }
        AlertDialog(
            onDismissRequest = { confirmation = null },
            title = { Text(stringResource(
                if (delete) R.string.remote_integrations_delete_schedule_title
                else R.string.remote_integrations_run_schedule_title,
            )) },
            text = { Text(stringResource(
                if (delete) R.string.remote_integrations_delete_schedule_message
                else R.string.remote_integrations_run_schedule_message,
                task.draft.name,
            )) },
            confirmButton = {
                Button(onClick = {
                    confirmation = null
                    if (delete) composition.deleteSchedule(task.id) else composition.runSchedule(task.id)
                }) { Text(stringResource(
                    if (delete) R.string.remote_integrations_delete
                    else R.string.remote_integrations_run_now,
                )) }
            },
            dismissButton = {
                TextButton(onClick = { confirmation = null }) {
                    Text(stringResource(R.string.remote_integrations_cancel))
                }
            },
        )
    }
}

@Composable
private fun ScheduleCard(
    task: ScheduledTask,
    enabled: Boolean,
    onEdit: () -> Unit,
    onRun: () -> Unit,
    onDelete: () -> Unit,
) {
    IntegrationSectionCard(task.draft.name) {
        Text(scheduleRecurrenceLabel(task.draft.recurrence))
        Text(scheduleStatusLabel(task.lastStatus), color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (!task.draft.enabled) Text(stringResource(R.string.remote_integrations_disabled))
        if (task.hasLastError) {
            Text(
                stringResource(R.string.remote_integrations_schedule_failed_safe),
                color = MaterialTheme.colorScheme.error,
            )
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            IconButton(onClick = onEdit, enabled = enabled) {
                Icon(Icons.Outlined.Edit, stringResource(R.string.remote_integrations_edit_schedule))
            }
            IconButton(onClick = onRun, enabled = enabled) {
                Icon(Icons.Outlined.PlayArrow, stringResource(R.string.remote_integrations_run_now))
            }
            IconButton(onClick = onDelete, enabled = enabled) {
                Icon(Icons.Outlined.Delete, stringResource(R.string.remote_integrations_delete_schedule))
            }
        }
    }
}

@Composable
private fun scheduleRecurrenceLabel(recurrence: ScheduleRecurrence): String = when (recurrence) {
    is ScheduleRecurrence.Hourly -> stringResource(
        R.string.remote_integrations_recurrence_hourly_value,
        recurrence.minute,
    )
    is ScheduleRecurrence.Weekly -> stringResource(
        R.string.remote_integrations_recurrence_weekly_value,
        recurrence.days.sorted().joinToString(),
        recurrence.time,
    )
    is ScheduleRecurrence.Once -> stringResource(
        R.string.remote_integrations_recurrence_once_value,
        recurrence.runAt,
    )
}

@Composable
private fun scheduleStatusLabel(status: ScheduleRunStatus): String = stringResource(
    when (status) {
        ScheduleRunStatus.Never -> R.string.remote_integrations_status_never
        ScheduleRunStatus.Running -> R.string.remote_integrations_status_running
        ScheduleRunStatus.Succeeded -> R.string.remote_integrations_status_succeeded
        ScheduleRunStatus.Failed -> R.string.remote_integrations_status_failed
    },
)
