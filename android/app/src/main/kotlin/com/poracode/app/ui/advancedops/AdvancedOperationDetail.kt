package com.poracode.app.ui.advancedops

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.model.RemoteProject
import com.poracode.app.protocol.advancedops.AdvancedFileStatus
import com.poracode.app.session.advancedops.AdvancedMutationOutcome
import com.poracode.app.session.advancedops.AdvancedOpsProductionComposition

@Composable
internal fun AdvancedOperationDetail(
    action: AdvancedAction,
    composition: AdvancedOpsProductionComposition,
    projects: List<RemoteProject>,
    selectedProjectId: String?,
    modifier: Modifier,
) {
    val state by composition.controller.state.collectAsStateWithLifecycle()
    var draft by remember(action) { mutableStateOf(AdvancedDraft()) }
    var parseFailure by remember(action) { mutableStateOf<AdvancedParseResult?>(null) }
    val gate = composition.controller.gate(action)

    LaunchedEffect(action) {
        composition.controller.clearResult()
        parseFailure = null
    }

    LazyColumn(
        modifier = modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text(
                actionLabel(action),
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.padding(top = 16.dp),
            )
        }
        item {
            AdvancedProjectPicker(projects, selectedProjectId, composition::selectProject)
        }
        gate?.let { failure ->
            item { AdvancedFailureCard(failure) }
        }
        action.fields.forEach { field ->
            item(key = field.name) {
                AdvancedFieldInput(
                    field,
                    draft.text(field),
                    draft.flag(field),
                    onText = { value -> draft = draft.copy(text = draft.text + (field to value)) },
                    onFlag = { enabled ->
                        draft = draft.copy(
                            flags = if (enabled) draft.flags + field else draft.flags - field,
                        )
                    },
                )
            }
        }
        if (parseFailure != null) {
            item { AdvancedParseFailure(parseFailure!!) }
        }
        state.failure?.let { failure -> item { AdvancedFailureCard(failure) } }
        state.output?.let { output -> item { AdvancedOutputCard(output) } }
        item {
            Button(
                onClick = {
                    when (val parsed = draft.parse(action)) {
                        is AdvancedParseResult.Valid -> {
                            parseFailure = null
                            composition.controller.submit(parsed.input)
                        }
                        else -> parseFailure = parsed
                    }
                },
                enabled = gate == null && !state.busy,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (state.busy) {
                    CircularProgressIndicator(
                        modifier = Modifier.padding(end = 8.dp),
                        strokeWidth = 2.dp,
                    )
                }
                Text(
                    stringResource(
                        if (action in DESTRUCTIVE_ACTIONS) {
                            R.string.advanced_ops_review_action
                        } else {
                            R.string.advanced_ops_run_action
                        },
                    ),
                )
            }
        }
        item { Spacer(Modifier.padding(bottom = 20.dp)) }
    }

    state.confirmation?.let { confirmation ->
        AlertDialog(
            onDismissRequest = composition.controller::dismissConfirmation,
            title = { Text(stringResource(R.string.advanced_ops_confirm_title)) },
            text = {
                Text(
                    stringResource(
                        R.string.advanced_ops_confirm_message,
                        actionLabel(confirmation.action),
                        confirmation.path,
                    ),
                )
            },
            confirmButton = {
                Button(onClick = composition.controller::confirm) {
                    Text(stringResource(R.string.advanced_ops_confirm))
                }
            },
            dismissButton = {
                TextButton(onClick = composition.controller::dismissConfirmation) {
                    Text(stringResource(R.string.advanced_ops_cancel))
                }
            },
        )
    }
}

@Composable
private fun AdvancedFieldInput(
    field: AdvancedField,
    value: String,
    enabled: Boolean,
    onText: (String) -> Unit,
    onFlag: (Boolean) -> Unit,
) {
    if (field.kind == AdvancedField.Kind.Boolean) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(fieldLabel(field), modifier = Modifier.weight(1f))
            Switch(checked = enabled, onCheckedChange = onFlag)
        }
    } else {
        OutlinedTextField(
            value = value,
            onValueChange = onText,
            label = { Text(fieldLabel(field)) },
            supportingText = if (field.optional) {
                { Text(stringResource(R.string.advanced_ops_optional)) }
            } else {
                null
            },
            minLines = if (field.kind == AdvancedField.Kind.LongText) 3 else 1,
            keyboardOptions = KeyboardOptions(
                keyboardType = if (field.kind == AdvancedField.Kind.Decimal) {
                    KeyboardType.Decimal
                } else {
                    KeyboardType.Text
                },
            ),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun AdvancedOutputCard(output: AdvancedOutput) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                stringResource(R.string.advanced_ops_result),
                style = MaterialTheme.typography.titleMedium,
            )
            when (output) {
                is AdvancedOutput.Checkpoint -> {
                    Text(stringResource(R.string.advanced_ops_checkpoint_ref, output.value.ref))
                    Text(stringResource(R.string.advanced_ops_checkpoint_commit, output.value.commit))
                    Text(
                        stringResource(
                            R.string.advanced_ops_changed_files,
                            output.value.changedFiles.size,
                        ),
                    )
                }
                is AdvancedOutput.Events -> {
                    Text(stringResource(R.string.advanced_ops_event_count, output.values.size))
                    output.values.forEach { Text(it.toString()) }
                }
                is AdvancedOutput.WorkflowRun -> Text(
                    output.value.run?.toString()
                        ?: stringResource(R.string.advanced_ops_no_workflow_run),
                )
                is AdvancedOutput.WorkflowChat -> Text(
                    stringResource(R.string.advanced_ops_event_count, output.value.events.size),
                )
                is AdvancedOutput.AbsoluteFile -> {
                    Text(fileStatusLabel(output.value.status))
                    output.value.content?.let { Text(it) }
                }
                is AdvancedOutput.ExternalFile -> {
                    Text(output.value.path)
                    Text(fileStatusLabel(output.value.status))
                    output.value.content?.let { Text(it) }
                }
                is AdvancedOutput.Mutation -> Text(mutationLabel(output.outcome))
                is AdvancedOutput.GeneratedText -> {
                    output.title?.let { Text(it, style = MaterialTheme.typography.titleSmall) }
                    Text(output.body)
                }
            }
        }
    }
}

@Composable
private fun AdvancedFailureCard(failure: AdvancedSafeFailure) {
    Card(Modifier.fillMaxWidth()) {
        Text(
            failureLabel(failure),
            color = MaterialTheme.colorScheme.error,
            modifier = Modifier.padding(12.dp),
        )
    }
}

@Composable
private fun AdvancedParseFailure(result: AdvancedParseResult) {
    val message = when (result) {
        AdvancedParseResult.MissingRequired -> R.string.advanced_ops_missing_required
        AdvancedParseResult.InvalidNumber -> R.string.advanced_ops_invalid_number
        AdvancedParseResult.InvalidJsonArray -> R.string.advanced_ops_invalid_json_array
        is AdvancedParseResult.Valid -> return
    }
    Text(stringResource(message), color = MaterialTheme.colorScheme.error)
}

@Composable
private fun mutationLabel(outcome: AdvancedMutationOutcome): String = stringResource(
    when (outcome) {
        is AdvancedMutationOutcome.Applied -> R.string.advanced_ops_applied
        is AdvancedMutationOutcome.Reconciled -> R.string.advanced_ops_reconciled
        AdvancedMutationOutcome.Unknown -> R.string.advanced_ops_unknown_outcome
    },
)

@Composable
private fun fileStatusLabel(status: AdvancedFileStatus): String = stringResource(
    when (status) {
        AdvancedFileStatus.Ready -> R.string.advanced_ops_file_ready
        AdvancedFileStatus.Binary -> R.string.advanced_ops_file_binary
        AdvancedFileStatus.TooLarge -> R.string.advanced_ops_file_too_large
        AdvancedFileStatus.Unsupported -> R.string.advanced_ops_file_unsupported
        AdvancedFileStatus.Missing -> R.string.advanced_ops_file_missing
    },
)

private val DESTRUCTIVE_ACTIONS = setOf(
    AdvancedAction.WriteExternalFile,
    AdvancedAction.MoveProjectEntry,
    AdvancedAction.DeleteProjectEntry,
)
