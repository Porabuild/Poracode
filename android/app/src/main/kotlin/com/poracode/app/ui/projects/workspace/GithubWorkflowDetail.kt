package com.poracode.app.ui.projects.workspace

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.GithubRequests
import com.poracode.app.model.ProjectWorkspaceTarget
import com.poracode.app.protocol.github.GithubProcedure
import com.poracode.app.session.projects.GithubOperationsController
import com.poracode.app.session.projects.GithubOperationsEntry
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Structured workflow detail: dispatch form plus a run summary with jobs and steps, matching the
 * iOS `GitHubWorkflowDispatchView` / `GitHubWorkflowRunDetailView` information density.
 */
@Composable
internal fun GithubWorkflowDetail(
    entry: GithubOperationsEntry,
    target: ProjectWorkspaceTarget,
    controller: GithubOperationsController,
    workflowId: Long,
    runId: Long,
    enabled: Boolean,
    modifier: Modifier,
) {
    val scope = rememberCoroutineScope()
    val definition = remember(entry.workflowDefinition) { entry.workflowDefinition.workflowDefinition() }
    val inputs = remember(definition) { definition?.inputs.orEmpty().take(MAX_WORKFLOW_INPUTS) }
    val run = remember(entry.workflowRun) { entry.workflowRun.workflowRunDetail() }
    val inputValues = remember(workflowId) { mutableStateMapOf<String, String>() }
    var ref by remember(workflowId, definition) { mutableStateOf(definition?.defaultBranch.orEmpty()) }
    val requiredInputsPresent = inputs.filter { it.required }.all { inputValues[it.name].orEmpty().isNotBlank() }
    val execute: (GithubProcedure, Map<String, JsonElement>) -> Unit = { procedure, fields ->
        scope.launch { controller.execute(target, GithubRequests.create(procedure, target.location, fields)) }
    }
    LazyColumn(
        modifier,
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (definition != null) {
            item("definition") {
                Column {
                    Text(definition.name, style = MaterialTheme.typography.titleMedium)
                    Text(
                        stringResource(R.string.github_workflow_summary, definition.path, definition.state),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            item("ref") {
                OutlinedTextField(
                    value = ref,
                    onValueChange = { ref = it },
                    label = { Text(stringResource(R.string.github_ref)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        items(inputs.size, key = { inputs[it].name }) { index ->
            val input = inputs[index]
            OutlinedTextField(
                value = inputValues[input.name].orEmpty(),
                onValueChange = { inputValues[input.name] = it },
                label = { Text(input.name) },
                supportingText = input.description.takeIf(String::isNotBlank)?.let { description ->
                    { Text(description) }
                },
                modifier = Modifier.fillMaxWidth(),
            )
        }
        item("actions") {
            GithubActionButtons(
                enabled,
                listOf(
                    R.string.github_dispatch to {
                        val values = JsonObject(
                            inputValues.filterValues(String::isNotBlank).mapValues { JsonPrimitive(it.value) },
                        )
                        val fields = buildMap<String, JsonElement> {
                            put("workflowId", JsonPrimitive(workflowId))
                            ref.trim().takeIf(String::isNotEmpty)?.let { put("ref", JsonPrimitive(it)) }
                            if (values.isNotEmpty()) put("inputs", values)
                        }
                        execute(GithubProcedure.DispatchWorkflow, fields)
                    },
                    R.string.github_rerun to {
                        execute(GithubProcedure.RerunWorkflowRun, mapOf("runId" to JsonPrimitive(runId)))
                    },
                    R.string.github_rerun_failed to {
                        execute(
                            GithubProcedure.RerunWorkflowRun,
                            mapOf(
                                "runId" to JsonPrimitive(runId),
                                "failedOnly" to JsonPrimitive(true),
                            ),
                        )
                    },
                    R.string.github_cancel_run to {
                        execute(GithubProcedure.CancelWorkflowRun, mapOf("runId" to JsonPrimitive(runId)))
                    },
                    R.string.github_delete_run to {
                        execute(GithubProcedure.DeleteWorkflowRun, mapOf("runId" to JsonPrimitive(runId)))
                    },
                ),
                validity = listOf(
                    workflowId > 0 && requiredInputsPresent,
                    runId > 0,
                    runId > 0 && run?.isFailed == true,
                    runId > 0,
                    runId > 0,
                ),
            )
        }
        workflowRunSection(run)
    }
}

private fun LazyListScope.workflowRunSection(run: WorkflowRunDetailRow?) {
    if (run == null) return
    item("run-summary") {
        HorizontalDivider(Modifier.padding(vertical = 8.dp))
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                GithubStatusIcon(run.status, run.conclusion, null)
                Text(
                    run.title.ifBlank { run.workflowName },
                    style = MaterialTheme.typography.titleSmall,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                stringResource(
                    R.string.github_run_summary,
                    run.number,
                    run.attempt,
                    run.event,
                    run.conclusion.ifBlank { run.status },
                ),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (run.headBranch.isNotBlank() || run.headSha.isNotBlank()) {
                Text(
                    stringResource(
                        R.string.github_run_revision,
                        run.headBranch,
                        run.headSha.take(ABBREVIATED_SHA_LENGTH),
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            run.url?.let { url ->
                val uriHandler = LocalUriHandler.current
                TextButton({ uriHandler.openUri(url) }) {
                    Text(stringResource(R.string.github_open_externally))
                }
            }
        }
    }
    run.jobs.forEach { job ->
        item("job-${job.id}") {
            Row(
                Modifier.fillMaxWidth().padding(top = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                GithubStatusIcon(job.status, job.conclusion, null)
                Text(
                    job.name,
                    Modifier.weight(1f),
                    style = MaterialTheme.typography.titleSmall,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        items(job.steps.size, key = { "s${job.id}-${job.steps[it].number}" }) { index ->
            val step = job.steps[index]
            Row(
                Modifier.fillMaxWidth().padding(start = 24.dp, top = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                GithubStatusIcon(step.status, step.conclusion, null)
                Text(
                    step.name,
                    Modifier.weight(1f),
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    step.number.toString(),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

private const val MAX_WORKFLOW_INPUTS = 50
private const val ABBREVIATED_SHA_LENGTH = 7
