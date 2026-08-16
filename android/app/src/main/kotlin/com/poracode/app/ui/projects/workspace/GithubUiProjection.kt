package com.poracode.app.ui.projects.workspace

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

internal data class PullRequestRow(
    val number: Long,
    val title: String,
    val branch: String,
    val state: String,
)

internal data class WorkflowRow(val id: Long, val name: String)
internal data class RunRow(val id: Long, val title: String, val status: String)
internal data class WorkflowInputRow(val name: String, val description: String, val required: Boolean)

internal data class GithubUiGate(val canRead: Boolean, val canMutate: Boolean)

internal fun githubUiGate(
    sessionCanRead: Boolean,
    sessionCanOperate: Boolean,
    available: Boolean?,
    loading: Boolean,
    busy: Boolean,
): GithubUiGate {
    val ready = available != false && !loading
    return GithubUiGate(
        canRead = sessionCanRead && ready,
        canMutate = sessionCanOperate && ready && !busy,
    )
}

internal fun JsonElement?.pullRequestRows(): List<PullRequestRow> =
    arrayObjects("pullRequests").mapNotNull { row ->
        val pr = row["pr"] as? JsonObject ?: return@mapNotNull null
        val number = pr.long("number") ?: return@mapNotNull null
        PullRequestRow(number, pr.string("title"), row.string("headBranch"), pr.string("state"))
    }

internal fun JsonElement?.workflowRows() = arrayObjects("workflows").mapNotNull {
    WorkflowRow(it.long("id") ?: return@mapNotNull null, it.string("name"))
}

internal fun JsonElement?.runRows() = arrayObjects("runs").mapNotNull {
    RunRow(it.long("id") ?: return@mapNotNull null, it.string("title"), it.string("status"))
}

internal fun JsonElement?.workflowInputs(): List<WorkflowInputRow> =
    ((this as? JsonObject)?.get("definition") as? JsonObject)
        ?.let { it["inputs"] as? JsonArray }
        ?.mapNotNull { element ->
            val input = element as? JsonObject ?: return@mapNotNull null
            val name = input.string("name").takeIf(String::isNotBlank) ?: return@mapNotNull null
            WorkflowInputRow(
                name,
                input.string("description"),
                (input["required"] as? JsonPrimitive)?.content?.toBooleanStrictOrNull() == true,
            )
        }.orEmpty()

internal fun JsonElement?.arrayObjects(name: String): List<JsonObject> =
    ((this as? JsonObject)?.get(name) as? JsonArray)?.mapNotNull { it as? JsonObject }.orEmpty()

internal fun JsonObject.string(name: String): String = (this[name] as? JsonPrimitive)?.content.orEmpty()
private fun JsonObject.long(name: String): Long? = (this[name] as? JsonPrimitive)?.content?.toLongOrNull()

internal const val MAX_GITHUB_ROWS = 100
internal const val MAX_GITHUB_TEXT = 20_000
