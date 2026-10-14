package com.poracode.app.ui.remoteintegrations

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.model.remoteintegrations.ScheduleRun
import com.poracode.app.model.remoteintegrations.ScheduleRunStatus
import com.poracode.app.session.remoteintegrations.AutomationsController
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun AutomationResultsSheet(
    controller: AutomationsController,
    threads: List<ScheduleRunThreadTarget>,
    canOperate: Boolean,
    onOpenThread: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val state by controller.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var filter by remember { mutableStateOf("unread") }
    var search by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf<ScheduleRun?>(null) }
    LaunchedEffect(selected?.id) {
        val run = selected ?: return@LaunchedEffect
        while (controller.state.value.latestRunStates[run.id]?.canCancel ?: run.canCancel) {
            delay(2_000); controller.refreshRun(run)
        }
    }
    LaunchedEffect(filter, search, state.busy) {
        if (!state.busy) { delay(250); controller.load(filter, search) }
    }
    LaunchedEffect(filter, search) {
        while (true) {
            delay(if (controller.state.value.runs.any(ScheduleRun::canCancel)) 2_000 else 15_000)
            controller.load(filter, search)
        }
    }
    ModalBottomSheet(onDismissRequest = onDismiss, modifier = Modifier.fillMaxHeight(0.95f)) {
        Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(stringResource(R.string.automations_results), style = MaterialTheme.typography.titleLarge)
                TextButton(onClick = onDismiss) { Text(stringResource(R.string.remote_integrations_close)) }
            }
            val current = selected?.let { state.latestRunStates[it.id] ?: it }
            if (current != null) {
                TextButton(onClick = { selected = null }) { Text(stringResource(R.string.automations_results)) }
                ScheduleResultDetails(
                    current, threads.firstOrNull { it.threadId == current.threadId },
                    onOpenThread = onOpenThread,
                    modifier = Modifier.weight(1f).verticalScroll(rememberScrollState()),
                )
                if (canOperate) {
                    Row {
                        TextButton(enabled = !state.busy, onClick = { scope.launch { controller.mark(current, unread = !current.unread) } }) {
                            Text(stringResource(if (current.unread) R.string.automations_mark_read else R.string.automations_mark_unread))
                        }
                        TextButton(enabled = !state.busy, onClick = { scope.launch { controller.mark(current, archived = !current.archived) } }) {
                            Text(stringResource(if (current.archived) R.string.automations_restore else R.string.automations_archive))
                        }
                    }
                    if (current.canCancel) {
                        TextButton(enabled = !state.busy, onClick = { scope.launch { controller.cancel(current) } }) {
                            Text(stringResource(R.string.automations_cancel_run), color = MaterialTheme.colorScheme.error)
                        }
                    } else if (state.schedules.any { it.id == current.scheduleId && it.lastStatus !in setOf(ScheduleRunStatus.Running, ScheduleRunStatus.Waiting) }) {
                        TextButton(enabled = !state.busy, onClick = { scope.launch { controller.runAgain(current.scheduleId) } }) {
                            Text(stringResource(R.string.automations_run_again))
                        }
                    }
                }
            } else {
                OutlinedTextField(search, { search = it }, modifier = Modifier.fillMaxWidth(),
                    label = { Text(stringResource(R.string.automations_search_results)) }, singleLine = true)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("unread" to R.string.automations_unread, "all" to R.string.automations_all, "archived" to R.string.automations_archived).forEach { (id, label) ->
                        FilterChip(selected = filter == id, enabled = !state.busy, onClick = { filter = id }, label = { Text(stringResource(label)) })
                    }
                }
                if (state.loading && state.runs.isEmpty()) IntegrationLoading()
                IntegrationFailureView(state.failure) { scope.launch { controller.load(filter, search) } }
                if (!state.loading && state.runs.isEmpty() && state.failure == null) Text(stringResource(R.string.automations_no_results))
                LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(state.runs, key = ScheduleRun::id) { run ->
                        Column(Modifier.fillMaxWidth().clickable {
                            selected = run
                            if (run.unread && canOperate) scope.launch { controller.mark(run, unread = false) }
                        }.padding(vertical = 8.dp)) {
                            Text(state.schedules.firstOrNull { it.id == run.scheduleId }?.draft?.name ?: stringResource(R.string.automations_result), style = MaterialTheme.typography.titleMedium)
                            Text(historyStatusLabel(run.status), color = MaterialTheme.colorScheme.onSurfaceVariant)
                            if (run.unread) Text(stringResource(R.string.automations_unread), style = MaterialTheme.typography.labelSmall)
                            (run.result.text("summary") ?: run.summary)?.let { Text(it, maxLines = 3) }
                            Text(run.startedAt, style = MaterialTheme.typography.labelSmall)
                        }
                    }
                    if (state.hasMore) item {
                        TextButton(enabled = !state.loading && !state.busy, onClick = { scope.launch { controller.load(filter, search, more = true) } }) {
                            Text(stringResource(R.string.automations_load_more))
                        }
                    }
                }
            }
            IntegrationFailureView(state.mutationFailure) { scope.launch { controller.load(filter, search) } }
        }
    }
}

@Composable
internal fun ScheduleResultDetails(
    run: ScheduleRun,
    thread: ScheduleRunThreadTarget?,
    onOpenThread: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(historyStatusLabel(run.status), style = MaterialTheme.typography.titleMedium)
        Text("${stringResource(R.string.automations_attempts)}: ${run.attempt} · ${stringResource(R.string.automations_iteration)}: ${run.iteration}")
        (run.result.text("summary") ?: run.summary)?.let { Text(it) }
        if (run.hasError) Text(stringResource(R.string.automations_safe_error), color = MaterialTheme.colorScheme.error)
        val reasonLabel = when(run.stopReason) {
            "completion-condition" -> R.string.automations_condition_met
            "retry-pending" -> R.string.automations_retry_pending
            "retry-cancelled" -> R.string.automations_retry_cancelled
            "time-limit" -> R.string.automations_time_limit_reached
            "cancelled" -> R.string.automations_cancelled
            "interrupted", "supervisor-reset", "host-shutdown" -> R.string.automations_host_restarted
            "misfire-policy" -> R.string.automations_skipped
            "iteration-limit" -> R.string.automations_run_limit_reached
            else -> null
        }
        reasonLabel?.let { Text(stringResource(it)) }
        val evaluation = run.result?.get("completionEvaluation") as? JsonObject
        if (evaluation != null) {
            Text(stringResource(R.string.automations_stop_condition), style = MaterialTheme.typography.titleSmall)
            evaluation.text("condition")?.let { Text(it) }
            evaluation.text("reason")?.let { Text(it) }
            evaluation.text("confidence")?.let { Text("${stringResource(R.string.automations_confidence)}: $it") }
        }
        val files = (run.result?.get("changedFiles") as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.content }.orEmpty()
        if (files.isNotEmpty()) {
            Text(stringResource(R.string.automations_changed_files), style = MaterialTheme.typography.titleSmall)
            files.forEach { Text(it, style = MaterialTheme.typography.bodySmall) }
        }
        if (thread != null) TextButton(onClick = { onOpenThread(thread.presentedId) }) { Text(stringResource(R.string.automations_open_conversation)) }
    }
}

private fun JsonObject?.text(key: String): String? = (this?.get(key) as? JsonPrimitive)?.takeUnless { it.content == "null" }?.content
