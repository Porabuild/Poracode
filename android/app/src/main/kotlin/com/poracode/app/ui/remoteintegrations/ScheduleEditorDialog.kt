package com.poracode.app.ui.remoteintegrations

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLocale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import java.text.DateFormatSymbols
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

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
                    "hourly" -> MinuteStepper(draft.minute) { draft = draft.copy(minute = it) }
                    "weekly" -> {
                        WeekdaySelector(draft.days) { draft = draft.copy(days = it) }
                        TimeField(draft.time) { draft = draft.copy(time = it) }
                    }
                    else -> RunAtField(draft.runAt) { draft = draft.copy(runAt = it) }
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

@Composable
private fun MinuteStepper(value: String, onValueChange: (String) -> Unit) {
    val minute = value.toIntOrNull()?.coerceIn(0, 59) ?: 0
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(stringResource(R.string.remote_integrations_minute))
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(onClick = { onValueChange(((minute + 59) % 60).toString()) }) {
                Text("−")
            }
            Text(
                "%02d".format(minute),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.wrapContentWidth(),
            )
            OutlinedButton(onClick = { onValueChange(((minute + 1) % 60).toString()) }) {
                Text("+")
            }
        }
    }
}

@Composable
private fun WeekdaySelector(value: String, onValueChange: (String) -> Unit) {
    val selected = value.split(',').mapNotNull { it.trim().toIntOrNull() }.toSet()
    val shortWeekdays =
        DateFormatSymbols(Locale.forLanguageTag(LocalLocale.current.toLanguageTag())).shortWeekdays
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(stringResource(R.string.remote_integrations_weekdays))
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            for (day in 0..6) {
                val label = shortWeekdays.getOrNull(day + 1).orEmpty()
                FilterChip(
                    selected = day in selected,
                    onClick = {
                        val updated = if (day in selected) selected - day else selected + day
                        onValueChange(updated.sorted().joinToString(","))
                    },
                    label = { Text(label) },
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TimeField(value: String, onValueChange: (String) -> Unit) {
    var showPicker by remember { mutableStateOf(false) }
    val (initHour, initMinute) = parseHourMinute(value)
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(stringResource(R.string.remote_integrations_local_time))
        OutlinedButton(onClick = { showPicker = true }) {
            Text(value)
        }
    }
    if (showPicker) {
        val state = rememberTimePickerState(initialHour = initHour, initialMinute = initMinute, is24Hour = true)
        AlertDialog(
            onDismissRequest = { showPicker = false },
            title = { Text(stringResource(R.string.remote_integrations_choose_time)) },
            text = { TimePicker(state = state) },
            confirmButton = {
                TextButton(onClick = {
                    onValueChange("%02d:%02d".format(state.hour, state.minute))
                    showPicker = false
                }) { Text(stringResource(R.string.remote_integrations_save)) }
            },
            dismissButton = {
                TextButton(onClick = { showPicker = false }) {
                    Text(stringResource(R.string.remote_integrations_cancel))
                }
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RunAtField(value: String, onValueChange: (String) -> Unit) {
    var showDatePicker by remember { mutableStateOf(false) }
    var showTimePicker by remember { mutableStateOf(false) }
    var pendingEpochDay by remember { mutableStateOf<Long?>(null) }
    val instant = parseInstant(value)
    val zone = ZoneId.systemDefault()
    val displayFormatter = remember {
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm").withZone(zone)
    }
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(stringResource(R.string.remote_integrations_run_at))
        OutlinedButton(onClick = { showDatePicker = true }) {
            Text(instant?.let(displayFormatter::format) ?: stringResource(R.string.remote_integrations_choose_date_time))
        }
    }
    if (showDatePicker) {
        val initialMillis = (instant ?: Instant.now()).toEpochMilli()
        val state = rememberDatePickerState(initialSelectedDateMillis = initialMillis)
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    val millis = state.selectedDateMillis
                    if (millis != null) {
                        pendingEpochDay = Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate().toEpochDay()
                        showDatePicker = false
                        showTimePicker = true
                    } else {
                        showDatePicker = false
                    }
                }) { Text(stringResource(R.string.remote_integrations_save)) }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) {
                    Text(stringResource(R.string.remote_integrations_cancel))
                }
            },
        ) { DatePicker(state = state) }
    }
    if (showTimePicker) {
        val (initHour, initMinute) = instant?.let { parseHourMinute(it, zone) } ?: (12 to 0)
        val state = rememberTimePickerState(initialHour = initHour, initialMinute = initMinute, is24Hour = true)
        AlertDialog(
            onDismissRequest = { showTimePicker = false },
            title = { Text(stringResource(R.string.remote_integrations_choose_time)) },
            text = { TimePicker(state = state) },
            confirmButton = {
                TextButton(onClick = {
                    val epochDay = pendingEpochDay
                    if (epochDay != null) {
                        val date = LocalDate.ofEpochDay(epochDay)
                        val localTime = LocalTime.of(state.hour, state.minute)
                        val result = date.atTime(localTime).atZone(zone).toInstant()
                        onValueChange(isoFormatter.format(result))
                    }
                    showTimePicker = false
                }) { Text(stringResource(R.string.remote_integrations_save)) }
            },
            dismissButton = {
                TextButton(onClick = { showTimePicker = false }) {
                    Text(stringResource(R.string.remote_integrations_cancel))
                }
            },
        )
    }
}

private val isoFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC)

private fun parseHourMinute(value: String): Pair<Int, Int> {
    val parts = value.split(':')
    val hour = parts.getOrNull(0)?.toIntOrNull()?.coerceIn(0, 23) ?: 9
    val minute = parts.getOrNull(1)?.toIntOrNull()?.coerceIn(0, 59) ?: 0
    return hour to minute
}

private fun parseHourMinute(instant: Instant, zone: ZoneId): Pair<Int, Int> {
    val time = instant.atZone(zone).toLocalTime()
    return time.hour to time.minute
}

private fun parseInstant(value: String): Instant? = runCatching { Instant.parse(value) }.getOrNull()
    ?: runCatching { java.time.OffsetDateTime.parse(value).toInstant() }.getOrNull()
