package com.poracode.app.ui.projects.workspace

import com.poracode.app.protocol.forge.ForgeReviewOperation
import com.poracode.app.session.projects.ForgeReviewEntry
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Review metadata projections (labels, requested reviewers, timeline) over the optional
 * `PrLabel`, `PrReviewer`, and `PrTimelineEvent` fields of `src/shared/contracts/github.ts`.
 * Every field is optional on the wire: a host without them yields empty lists.
 */
internal data class PullRequestLabelRow(val name: String, val color: String?, val description: String?)

internal data class PullRequestReviewerRow(
    val id: String,
    val login: String,
    val name: String?,
    val team: Boolean,
) {
    val displayName: String get() = name?.takeIf(String::isNotBlank) ?: login
}

internal data class PullRequestTimelineRow(
    val id: String,
    val kind: String,
    val createdAt: String,
    val actor: String?,
    val labelName: String?,
    val reviewer: String?,
    val fromRef: String?,
    val toRef: String?,
    val text: String?,
)

/** Timeline kinds the client renders; any other kind is skipped. */
internal val KNOWN_TIMELINE_KINDS = setOf(
    "opened", "closed", "reopened", "merged", "ready", "draft", "labeled", "unlabeled",
    "review-requested", "review-request-removed", "force-pushed", "base-changed", "renamed", "system",
)

private val HEX_COLOR = Regex("^[0-9a-fA-F]{6}$")

internal fun JsonObject.labelRows(name: String = "labels"): List<PullRequestLabelRow> =
    objects(name).take(MAX_GITHUB_ROWS).mapNotNull { it.labelRow() }

internal fun JsonObject.labelRow(): PullRequestLabelRow? {
    val name = stringOrNull("name") ?: return null
    return PullRequestLabelRow(name, stringOrNull("color")?.takeIf(HEX_COLOR::matches), stringOrNull("description"))
}

internal fun JsonObject.reviewerRows(name: String): List<PullRequestReviewerRow> =
    objects(name).take(MAX_GITHUB_ROWS).mapNotNull { it.reviewerRow() }

internal fun JsonObject.reviewerRow(): PullRequestReviewerRow? {
    val id = stringOrNull("id") ?: return null
    val login = stringOrNull("login") ?: return null
    return PullRequestReviewerRow(id, login, stringOrNull("name"), boolean("team"))
}

internal fun JsonObject.timelineRows(): List<PullRequestTimelineRow> =
    objects("timeline").take(MAX_GITHUB_ROWS).mapNotNull { event ->
        val id = event.stringOrNull("id") ?: return@mapNotNull null
        val kind = event.stringOrNull("kind")?.takeIf(KNOWN_TIMELINE_KINDS::contains) ?: return@mapNotNull null
        PullRequestTimelineRow(
            id = id,
            kind = kind,
            createdAt = event.string("createdAt"),
            actor = (event["actor"] as? JsonObject)?.stringOrNull("login"),
            labelName = (event["label"] as? JsonObject)?.stringOrNull("name"),
            reviewer = (event["reviewer"] as? JsonObject)?.reviewerRow()?.displayName,
            fromRef = event.stringOrNull("fromRef"),
            toRef = event.stringOrNull("toRef"),
            text = event.stringOrNull("text"),
        )
    }

/** Which review-metadata writes the live, open review offers; absent capability or state hides them. */
internal data class ReviewMetadataEditing(
    val labels: Boolean = false,
    val reviewRequests: Boolean = false,
    val convertToDraft: Boolean = false,
) {
    val any: Boolean get() = labels || reviewRequests || convertToDraft
}

/**
 * Editing needs the host capability, the live account-scoped review (never the offline cache), and an
 * open review. Transient loading and mutation only disable the controls ([ReviewMetadataActions.enabled]);
 * they never hide them, so an open editor survives its own refresh.
 */
internal fun reviewMetadataEditing(forge: ForgeReviewEntry?): ReviewMetadataEditing {
    if (forge == null || forge.isCached) return ReviewMetadataEditing()
    val pr = (forge.documents[ForgeReviewOperation.GetPrDetails] as? JsonObject)?.get("pr") as? JsonObject
        ?: return ReviewMetadataEditing()
    val state = pr.string("state")
    if (state != "open" && state != "draft") return ReviewMetadataEditing()
    val capabilities = forge.capabilities
    return ReviewMetadataEditing(
        labels = capabilities["labels"] == JsonPrimitive(true),
        reviewRequests = capabilities["reviewRequests"] == JsonPrimitive(true),
        convertToDraft = capabilities["convertToDraft"] == JsonPrimitive(true) && state == "open" && !pr.boolean("isDraft"),
    )
}

/** Editor callbacks for the review pane; [None] hides every metadata control. */
internal class ReviewMetadataActions(
    val editing: ReviewMetadataEditing = ReviewMetadataEditing(),
    val enabled: Boolean = false,
    val candidates: suspend (ForgeReviewOperation, Map<String, JsonElement>) -> JsonElement? = { _, _ -> null },
    val write: suspend (ForgeReviewOperation, Map<String, JsonElement>) -> Boolean = { _, _ -> false },
) {
    companion object { val None = ReviewMetadataActions() }
}

internal enum class ReviewMetadataSheet { Labels, Reviewers }

/** Label names to add and remove so [current] becomes [selected]; each list keeps its source order. */
internal fun labelDelta(current: List<String>, selected: Set<String>): Pair<List<String>, List<String>> =
    selected.filter { it !in current } to current.filter { it !in selected }

internal fun labelWriteFields(add: List<String>, remove: List<String>): Map<String, JsonElement> = mapOf(
    "add" to JsonArray(add.map(::JsonPrimitive)),
    "remove" to JsonArray(remove.map(::JsonPrimitive)),
)

internal fun reviewerWriteFields(add: List<PullRequestReviewerRow>, remove: List<PullRequestReviewerRow>): Map<String, JsonElement> = mapOf(
    "add" to reviewerRefs(add),
    "remove" to reviewerRefs(remove),
)

private fun reviewerRefs(rows: List<PullRequestReviewerRow>): JsonArray = buildJsonArray {
    rows.forEach { row ->
        add(buildJsonObject {
            put("id", row.id)
            if (row.team) put("team", true)
        })
    }
}

internal fun reviewerQueryFields(query: String): Map<String, JsonElement> =
    query.trim().take(MAX_REVIEWER_QUERY).takeIf(String::isNotEmpty)?.let { mapOf("query" to JsonPrimitive(it)) }.orEmpty()

internal fun JsonElement?.truncated(): Boolean = (this as? JsonObject)?.boolean("truncated") == true

internal const val MAX_REVIEWER_QUERY = 200
