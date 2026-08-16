package com.poracode.app.ui.projects.workspace

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
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
    val inputValues = remember(workflowId) { mutableStateMapOf<String, String>() }
    val inputs = remember(entry.workflowDefinition) {
        entry.workflowDefinition.workflowInputs().take(MAX_WORKFLOW_INPUTS)
    }
    val requiredInputsPresent = inputs.filter { it.required }.all { inputValues[it.name].orEmpty().isNotBlank() }
    val execute: (GithubProcedure, Map<String, JsonElement>) -> Unit = { procedure, fields ->
        scope.launch { controller.execute(target, GithubRequests.create(procedure, target.location, fields)) }
    }
    LazyColumn(modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
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
                            if (values.isNotEmpty()) put("inputs", values)
                        }
                        execute(GithubProcedure.DispatchWorkflow, fields)
                    },
                    R.string.github_rerun to {
                        execute(GithubProcedure.RerunWorkflowRun, mapOf("runId" to JsonPrimitive(runId)))
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
                    runId > 0,
                    runId > 0,
                ),
            )
        }
        githubJsonSection(R.string.github_workflow_definition, entry.workflowDefinition, "definition")
        githubJsonSection(R.string.github_run_details, entry.workflowRun, "run")
    }
}

private const val MAX_WORKFLOW_INPUTS = 50
