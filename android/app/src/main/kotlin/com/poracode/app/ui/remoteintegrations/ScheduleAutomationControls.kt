package com.poracode.app.ui.remoteintegrations

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.poracode.app.R

@Composable
internal fun AutomationChoice(label: Int, value: String, choices: List<Pair<String, String>>, onChange: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Column {
        Text(stringResource(label))
        OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth()) {
            Text(choices.firstOrNull { it.first == value }?.second ?: value)
        }
        DropdownMenu(expanded, { expanded = false }) {
            choices.forEach { (id, title) -> DropdownMenuItem(text = { Text(title) }, onClick = { expanded = false; onChange(id) }) }
        }
    }
}

@Composable
internal fun ScheduleAutomationControls(
    draft: ScheduleAutomationDraft,
    supportsCompletionCheck: Boolean,
    threads: List<ScheduleRunThreadTarget>,
    onChange: (ScheduleAutomationDraft) -> Unit,
) {
    AutomationChoice(R.string.automations_execution, draft.mode, listOf(
        "new-thread" to stringResource(R.string.automations_new_conversation),
        "heartbeat" to stringResource(R.string.automations_existing_conversation),
    )) { onChange(draft.copy(mode = it)) }
    if (draft.mode == "heartbeat") {
        AutomationChoice(R.string.automations_conversation, draft.targetThreadId,
            listOf("" to stringResource(R.string.automations_choose_conversation)) + threads.map { it.threadId to it.title }) {
            onChange(draft.copy(targetThreadId = it))
        }
        ToggleRow(R.string.automations_stop_when_done, draft.evaluate, enabled = supportsCompletionCheck || draft.evaluate) { onChange(draft.copy(evaluate = it)) }
        if (!supportsCompletionCheck) Text(stringResource(R.string.automations_completion_unavailable))
        if (draft.evaluate) {
            ScheduleField(draft.condition, { onChange(draft.copy(condition = it)) }, R.string.automations_stop_condition, minLines = 2)
            ScheduleField(draft.confidence, { onChange(draft.copy(confidence = it)) }, R.string.automations_confidence)
        }
    }
    var expanded by remember { mutableStateOf(false) }
    OutlinedButton(onClick = { expanded = !expanded }, modifier = Modifier.fillMaxWidth()) {
        Text(stringResource(R.string.automations_limits_and_retries))
    }
    if (expanded) {
        ScheduleField(draft.runtime, { onChange(draft.copy(runtime = it)) }, R.string.automations_runtime_seconds)
        ScheduleField(draft.runLimit, { onChange(draft.copy(runLimit = it)) }, R.string.automations_run_limit)
        ToggleRow(R.string.automations_stop_on_error, draft.stopOnError) { onChange(draft.copy(stopOnError = it)) }
        AutomationChoice(R.string.automations_missed_runs, draft.misfire, listOf(
            "coalesce" to stringResource(R.string.automations_coalesce),
            "skip" to stringResource(R.string.automations_skip),
            "run-latest" to stringResource(R.string.automations_run_latest),
        )) { onChange(draft.copy(misfire = it)) }
        AutomationChoice(R.string.automations_retries, draft.retryKind, listOf(
            "none" to stringResource(R.string.automations_no_retries),
            "fixed" to stringResource(R.string.automations_fixed_delay),
            "exponential" to stringResource(R.string.automations_exponential_delay),
        )) { onChange(draft.copy(retryKind = it)) }
        if (draft.retryKind != "none") {
            ScheduleField(draft.attempts, { onChange(draft.copy(attempts = it)) }, R.string.automations_attempts)
            ScheduleField(draft.delay, { onChange(draft.copy(delay = it)) }, R.string.automations_retry_seconds)
            if (draft.retryKind == "exponential") ScheduleField(draft.maximumDelay, { onChange(draft.copy(maximumDelay = it)) }, R.string.automations_maximum_delay)
        }
    }
}
