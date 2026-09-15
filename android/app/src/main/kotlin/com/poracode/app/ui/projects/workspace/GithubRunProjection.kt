package com.poracode.app.ui.projects.workspace

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/**
 * Projects `ghGetWorkflowRun` / `ghGetWorkflowDefinition` documents into rows, mirroring
 * `GitHubActionsRun`, `GitHubActionsJob`, `GitHubActionsStep` and `GitHubActionsWorkflow`
 * in `src/shared/contracts/github.ts`.
 */

internal data class WorkflowStepRow(
    val number: Long,
    val name: String,
    val status: String,
    val conclusion: String,
)

internal data class WorkflowJobRow(
    val id: Long,
    val name: String,
    val status: String,
    val conclusion: String,
    val url: String?,
    val steps: List<WorkflowStepRow>,
)

internal data class WorkflowRunDetailRow(
    val id: Long,
    val number: Long,
    val attempt: Long,
    val title: String,
    val workflowName: String,
    val event: String,
    val headBranch: String,
    val headSha: String,
    val status: String,
    val conclusion: String,
    val updatedAt: String,
    val url: String?,
    val jobs: List<WorkflowJobRow>,
) {
    val isCompleted: Boolean get() = status.equals("completed", ignoreCase = true)
    val isFailed: Boolean get() = githubStatusTone(status, conclusion) == GithubStatusTone.Failure
}

internal data class WorkflowDefinitionRow(
    val name: String,
    val path: String,
    val state: String,
    val defaultBranch: String,
    val dispatchable: Boolean,
    val inputs: List<WorkflowInputRow>,
)

internal fun JsonElement?.workflowRunDetail(): WorkflowRunDetailRow? {
    val run = child("run") ?: return null
    val id = run.long("id") ?: return null
    return WorkflowRunDetailRow(
        id = id,
        number = run.long("number") ?: 0L,
        attempt = run.long("attempt") ?: 0L,
        title = run.string("title"),
        workflowName = run.string("workflowName"),
        event = run.string("event"),
        headBranch = run.string("headBranch"),
        headSha = run.string("headSha"),
        status = run.string("status"),
        conclusion = run.string("conclusion"),
        updatedAt = run.string("updatedAt"),
        url = run.stringOrNull("url"),
        jobs = run.objects("jobs").take(MAX_GITHUB_ROWS).mapNotNull(JsonObject::jobRow),
    )
}

internal fun JsonElement?.workflowDefinition(): WorkflowDefinitionRow? {
    val definition = child("definition") ?: return null
    val name = definition.stringOrNull("name") ?: return null
    return WorkflowDefinitionRow(
        name = name,
        path = definition.string("path"),
        state = definition.string("state"),
        defaultBranch = definition.string("defaultBranch"),
        dispatchable = definition.boolean("dispatchable"),
        inputs = workflowInputs(),
    )
}

private fun JsonObject.jobRow(): WorkflowJobRow? {
    val id = long("id") ?: return null
    return WorkflowJobRow(
        id = id,
        name = string("name"),
        status = string("status"),
        conclusion = string("conclusion"),
        url = stringOrNull("url"),
        steps = objects("steps").take(MAX_GITHUB_ROWS).map { step ->
            WorkflowStepRow(
                number = step.long("number") ?: 0L,
                name = step.string("name"),
                status = step.string("status"),
                conclusion = step.string("conclusion"),
            )
        },
    )
}
