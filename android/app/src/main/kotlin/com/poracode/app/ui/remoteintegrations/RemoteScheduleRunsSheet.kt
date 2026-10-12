package com.poracode.app.ui.remoteintegrations

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Error
import androidx.compose.material.icons.outlined.HourglassTop
import androidx.compose.material.icons.outlined.PauseCircle
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.model.remoteintegrations.ScheduleHistoryStatus
import com.poracode.app.model.remoteintegrations.ScheduleRun
import com.poracode.app.model.remoteintegrations.ScheduledTask
import com.poracode.app.session.remoteintegrations.ScheduleRunsController
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun RemoteScheduleRunsSheet(
    task: ScheduledTask,
    controller: ScheduleRunsController,
    threads: List<ScheduleRunThreadTarget>,
    onOpenThread: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val state by controller.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    LaunchedEffect(task.id) {
        do {
            controller.load(task.id)
            val running = controller.state.value.runs.any {
                it.status == ScheduleHistoryStatus.Running
            }
            if (running) delay(2_000)
        } while (running)
    }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.padding(bottom = 24.dp)) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(task.draft.name, style = MaterialTheme.typography.titleLarge)
                    Text(
                        stringResource(R.string.remote_integrations_run_history),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                TextButton(onClick = onDismiss) {
                    Text(stringResource(R.string.remote_integrations_close))
                }
            }
            when {
                state.loading && state.runs.isEmpty() -> IntegrationLoading()
                state.failure != null -> IntegrationFailureView(state.failure) {
                    scope.launch { controller.load(task.id) }
                }
                state.runs.isEmpty() -> IntegrationSectionCard(
                    stringResource(R.string.remote_integrations_no_runs),
                ) {
                    Text(stringResource(R.string.remote_integrations_no_runs_message))
                }
                else -> LazyColumn {
                    items(state.runs, key = ScheduleRun::id) { run ->
                        val thread = threads.firstOrNull { it.threadId == run.threadId }
                        ScheduleRunRow(run, thread) {
                            thread?.let { onOpenThread(it.presentedId) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ScheduleRunRow(
    run: ScheduleRun,
    thread: ScheduleRunThreadTarget?,
    onOpenThread: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().clickable(enabled = thread != null, onClick = onOpenThread)
            .padding(horizontal = 20.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(run.status.icon(), contentDescription = null, tint = run.status.color())
        Column(Modifier.weight(1f)) {
            if (thread != null) {
                Text(thread.title, maxLines = 1)
                Text(
                    thread.model,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                historyStatusLabel(run.status),
                style = MaterialTheme.typography.labelMedium,
                color = if (run.hasError) {
                    MaterialTheme.colorScheme.error
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
            )
            Text(
                run.startedAt,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (thread != null) {
            Icon(
                Icons.AutoMirrored.Outlined.KeyboardArrowRight,
                stringResource(R.string.remote_integrations_open_thread),
            )
        }
    }
}

@Composable
private fun historyStatusLabel(status: ScheduleHistoryStatus): String = stringResource(
    when (status) {
        ScheduleHistoryStatus.Running -> R.string.remote_integrations_status_running
        ScheduleHistoryStatus.Succeeded -> R.string.remote_integrations_status_succeeded
        ScheduleHistoryStatus.Failed -> R.string.remote_integrations_status_failed
        ScheduleHistoryStatus.Interrupted -> R.string.remote_integrations_status_interrupted
    },
)

private fun ScheduleHistoryStatus.icon(): ImageVector = when (this) {
    ScheduleHistoryStatus.Running -> Icons.Outlined.HourglassTop
    ScheduleHistoryStatus.Succeeded -> Icons.Outlined.CheckCircle
    ScheduleHistoryStatus.Failed -> Icons.Outlined.Error
    ScheduleHistoryStatus.Interrupted -> Icons.Outlined.PauseCircle
}

@Composable
private fun ScheduleHistoryStatus.color() = when (this) {
    ScheduleHistoryStatus.Running -> MaterialTheme.colorScheme.primary
    ScheduleHistoryStatus.Succeeded -> MaterialTheme.colorScheme.tertiary
    ScheduleHistoryStatus.Failed -> MaterialTheme.colorScheme.error
    ScheduleHistoryStatus.Interrupted -> MaterialTheme.colorScheme.onSurfaceVariant
}
