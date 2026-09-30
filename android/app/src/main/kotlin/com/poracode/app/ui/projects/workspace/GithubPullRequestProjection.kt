package com.poracode.app.ui.projects.workspace

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/**
 * Projects the canonical GitHub pull-request documents into flat rows the Compose panes render.
 *
 * The shapes mirror `src/shared/contracts/github.ts` (`PrDetails`, `PrFile`, `PrCheck`,
 * `PrComment`, `PrReviewSummary`, `PrReviewThread`) so the Android review surface shows the same
 * information as the iOS review page instead of a raw JSON dump.
 */

internal data class GithubAuthorRow(val login: String, val avatarUrl: String?)

internal data class PullRequestFileRow(
    val path: String,
    val additions: Long,
    val deletions: Long,
)

internal data class PullRequestCheckRow(
    val name: String,
    val state: String,
    val conclusion: String,
    val url: String?,
    val workflowName: String?,
) {
    val key: String get() = "${workflowName.orEmpty()}:$name"
}

internal data class PullRequestCommitRow(
    val oid: String,
    val abbreviatedOid: String,
    val headline: String,
)

internal data class PullRequestCommentRow(
    val id: String,
    val author: String,
    val body: String,
    val createdAt: String,
)

internal data class PullRequestReviewSummaryRow(
    val id: String,
    val author: String,
    val state: String,
    val body: String,
)

internal data class PullRequestThreadRow(
    val id: String,
    val isResolved: Boolean,
    val isOutdated: Boolean,
    val path: String?,
    val comments: List<PullRequestCommentRow>,
)

internal data class PullRequestDetailsRow(
    val number: Long,
    val title: String,
    val body: String,
    val author: GithubAuthorRow?,
    val baseBranch: String,
    val headBranch: String,
    val additions: Long,
    val deletions: Long,
    val changedFiles: Long,
    val commits: List<PullRequestCommitRow>,
    val comments: List<PullRequestCommentRow>,
    val reviews: List<PullRequestReviewSummaryRow>,
    val checks: List<PullRequestCheckRow>,
)

internal data class PullRequestConversationRows(
    val comments: List<PullRequestCommentRow>,
    val threads: List<PullRequestThreadRow>,
) {
    val isEmpty: Boolean get() = comments.isEmpty() && threads.isEmpty()
}

/** Semantic tone shared by pull-request checks and workflow run/job/step status. */
internal enum class GithubStatusTone { Success, Failure, Pending, Neutral }

private val SUCCESS_CONCLUSIONS = setOf("success", "neutral")
private val FAILURE_CONCLUSIONS = setOf(
    "failure",
    "timed_out",
    "cancelled",
    "action_required",
    "startup_failure",
)

internal fun githubStatusTone(status: String, conclusion: String): GithubStatusTone {
    val normalizedConclusion = conclusion.lowercase()
    return when {
        normalizedConclusion in FAILURE_CONCLUSIONS -> GithubStatusTone.Failure
        normalizedConclusion in SUCCESS_CONCLUSIONS -> GithubStatusTone.Success
        normalizedConclusion == "skipped" -> GithubStatusTone.Neutral
        status.lowercase() == "completed" -> GithubStatusTone.Neutral
        else -> GithubStatusTone.Pending
    }
}

internal fun JsonElement?.pullRequestDetails(): PullRequestDetailsRow? {
    val details = child("details") ?: return null
    val number = details.long("number") ?: return null
    return PullRequestDetailsRow(
        number = number,
        title = details.string("title"),
        body = details.string("body"),
        author = (details["author"] as? JsonObject)?.authorRow(),
        baseBranch = details.string("baseBranch"),
        headBranch = details.string("headBranch"),
        additions = details.long("additions") ?: 0L,
        deletions = details.long("deletions") ?: 0L,
        changedFiles = details.long("changedFiles") ?: 0L,
        commits = details.objects("commits").take(MAX_GITHUB_ROWS).mapNotNull(JsonObject::commitRow),
        comments = details.objects("comments").take(MAX_GITHUB_ROWS).mapNotNull(JsonObject::commentRow),
        reviews = details.objects("reviews").take(MAX_GITHUB_ROWS).mapNotNull(JsonObject::reviewRow),
        checks = details.objects("checks").take(MAX_GITHUB_ROWS).map(JsonObject::checkRow),
    )
}

internal fun JsonElement?.pullRequestFiles(): List<PullRequestFileRow> =
    arrayObjects("files").take(MAX_GITHUB_ROWS).mapNotNull { file ->
        val path = file.stringOrNull("path") ?: return@mapNotNull null
        PullRequestFileRow(path, file.long("additions") ?: 0L, file.long("deletions") ?: 0L)
    }

internal fun JsonElement?.pullRequestChecks(): List<PullRequestCheckRow> =
    arrayObjects("checks").take(MAX_GITHUB_ROWS).map(JsonObject::checkRow)

internal fun JsonElement?.pullRequestConversation(): PullRequestConversationRows =
    PullRequestConversationRows(
        comments = arrayObjects("comments").take(MAX_GITHUB_ROWS).mapNotNull(JsonObject::commentRow),
        threads = arrayObjects("threads").take(MAX_GITHUB_ROWS).mapNotNull { thread ->
            val id = thread.stringOrNull("id") ?: return@mapNotNull null
            PullRequestThreadRow(
                id = id,
                isResolved = thread.boolean("isResolved"),
                isOutdated = thread.boolean("isOutdated"),
                path = thread.stringOrNull("path"),
                comments = thread.objects("comments")
                    .take(MAX_GITHUB_ROWS)
                    .mapNotNull(JsonObject::commentRow),
            )
        },
    )

internal fun JsonElement?.pullRequestDiff(): String = childString("diff")

/**
 * Returns the `diff --git` section for [path], or the whole [diff] when the path has no section.
 * Mirrors `PullRequestUnifiedDiff.chunk(for:in:)` on iOS.
 */
internal fun unifiedDiffChunk(path: String, diff: String): String {
    if (diff.isEmpty()) return diff
    val chunks = mutableListOf<Pair<String?, MutableList<String>>>()
    var current: Pair<String?, MutableList<String>>? = null
    diff.split("\n").forEach { line ->
        if (line.startsWith(DIFF_HEADER_PREFIX)) {
            current?.let(chunks::add)
            current = diffHeaderPath(line) to mutableListOf(line)
        } else {
            current?.second?.add(line)
        }
    }
    current?.let(chunks::add)
    val match = chunks.firstOrNull { it.first == path } ?: return diff
    return match.second.joinToString("\n")
}

private fun diffHeaderPath(line: String): String? {
    val marker = line.indexOf(" b/")
    if (marker < 0) return null
    return line.substring(marker + " b/".length).trim('"').takeIf(String::isNotBlank)
}

private fun JsonObject.authorRow() = GithubAuthorRow(string("login"), stringOrNull("avatarUrl"))

private fun JsonObject.commitRow(): PullRequestCommitRow? {
    val oid = stringOrNull("oid") ?: return null
    return PullRequestCommitRow(
        oid = oid,
        abbreviatedOid = stringOrNull("abbreviatedOid") ?: oid.take(ABBREVIATED_OID_LENGTH),
        headline = string("messageHeadline"),
    )
}

private fun JsonObject.commentRow(): PullRequestCommentRow? {
    val id = stringOrNull("id") ?: return null
    return PullRequestCommentRow(
        id = id,
        author = (this["author"] as? JsonObject)?.string("login").orEmpty(),
        body = string("body"),
        createdAt = string("createdAt"),
    )
}

private fun JsonObject.reviewRow(): PullRequestReviewSummaryRow? {
    val id = stringOrNull("id") ?: return null
    return PullRequestReviewSummaryRow(
        id = id,
        author = (this["author"] as? JsonObject)?.string("login").orEmpty(),
        state = string("state"),
        body = string("body"),
    )
}

private fun JsonObject.checkRow() = PullRequestCheckRow(
    name = string("name"),
    state = string("state"),
    conclusion = string("conclusion"),
    url = stringOrNull("url"),
    workflowName = stringOrNull("workflowName"),
)

private const val DIFF_HEADER_PREFIX = "diff --git "
private const val ABBREVIATED_OID_LENGTH = 7
