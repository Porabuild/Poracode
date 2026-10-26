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
    val source: JsonObject? = null,
    val labels: List<PullRequestLabelRow> = emptyList(),
    val author: String? = null,
    val additions: Long = 0L,
    val deletions: Long = 0L,
    val checksStatus: String? = null,
    val reviewRequested: Boolean = false,
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

internal data class PullRequestActionAvailability(
    val review: Boolean,
    val merge: Boolean,
    val ready: Boolean,
    val updateBranch: Boolean,
    val convertToDraft: Boolean,
    val close: Boolean,
    val reopen: Boolean,
)

internal fun pullRequestActionAvailability(state: String, isDraft: Boolean): PullRequestActionAvailability {
    val active = state == "open" || state == "draft"
    return PullRequestActionAvailability(
        review = active,
        merge = active,
        ready = active && (isDraft || state == "draft"),
        updateBranch = active,
        convertToDraft = active,
        close = active,
        reopen = state == "closed",
    )
}

internal fun JsonElement?.pullRequestRows(): List<PullRequestRow> =
    arrayObjects("pullRequests").mapNotNull { row ->
        val pr = row["pr"] as? JsonObject ?: return@mapNotNull null
        val number = pr.long("number") ?: return@mapNotNull null
        PullRequestRow(
            number,
            pr.string("title"),
            row.string("headBranch"),
            pr.string("state"),
            pr["source"] as? JsonObject,
            row.labelRows(),
            author = row.child("author")?.stringOrNull("login"),
            additions = row.long("additions") ?: 0L,
            deletions = row.long("deletions") ?: 0L,
            checksStatus = pr.stringOrNull("checksStatus"),
            reviewRequested = row.boolean("reviewRequested"),
        )
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

internal fun JsonObject.stringOrNull(name: String): String? =
    (this[name] as? JsonPrimitive)?.content?.takeIf(String::isNotBlank)

internal fun JsonObject.long(name: String): Long? = (this[name] as? JsonPrimitive)?.content?.toLongOrNull()

internal fun JsonObject.boolean(name: String): Boolean =
    (this[name] as? JsonPrimitive)?.content?.toBooleanStrictOrNull() == true

internal fun JsonElement?.child(name: String): JsonObject? = (this as? JsonObject)?.get(name) as? JsonObject

internal fun JsonElement?.childString(name: String): String =
    ((this as? JsonObject)?.get(name) as? JsonPrimitive)?.content.orEmpty()

internal fun JsonObject.objects(name: String): List<JsonObject> =
    (this[name] as? JsonArray)?.mapNotNull { it as? JsonObject }.orEmpty()

internal const val MAX_GITHUB_ROWS = 100
internal const val MAX_GITHUB_TEXT = 20_000
