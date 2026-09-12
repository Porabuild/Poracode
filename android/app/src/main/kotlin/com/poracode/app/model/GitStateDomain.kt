package com.poracode.app.model

import kotlinx.serialization.json.JsonElement

/**
 * Android domain for the remote Git/PR state stream — a faithful, JSON-backed
 * port of `src/shared/gitState.ts`. The desktop gitStore is the authority; this
 * model only mirrors key derivation and patch semantics so the client can apply
 * server-authored [GitStatePatch]es and serve compact UI projections.
 *
 * Values are carried as opaque [JsonElement]s (decoded by [GitStateJsonAdapter]
 * at the boundary) so the wire shape — including any generated hash-derived
 * field names — never leaks into the stable domain. Only key encoding and the
 * removals-before-upserts / null-deletes / omitted-preserves patch rules are
 * first-class here, matching `applyGitStatePatch` exactly.
 */
object GitStateDomain {
    const val KEY_SEPARATOR = "\u0000"

    private fun encodeKeyPart(value: String): String = "${value.length}:$value"

    fun joinKey(kind: String, parts: List<String>): String =
        (listOf(kind) + parts.map(::encodeKeyPart)).joinToString(KEY_SEPARATOR)

    fun gitProjectKey(hostId: String, projectId: String): String =
        joinKey("project", listOf(hostId, projectId))

    fun gitTargetKey(hostId: String, projectId: String, worktreePath: String?): String =
        joinKey("target", listOf(hostId, projectId, worktreePath ?: ""))

    fun pullRequestKey(hostId: String, projectId: String, prNumber: Int): String =
        joinKey("pr", listOf(hostId, projectId, prNumber.toString()))

    fun pullRequestBranchKey(hostId: String, projectId: String, branch: String): String =
        joinKey("pr-branch", listOf(hostId, projectId, branch))
}

/**
 * Normalized host-owned Git/PR state. Records are opaque JSON keyed by the
 * stable [GitStateDomain] keys. `revision` is the only scalar the client
 * reasons about; it is strictly increasing across accepted patches.
 */
data class GitStateSnapshot(
    val revision: Int,
    val projects: Map<String, JsonElement> = emptyMap(),
    val targets: Map<String, JsonElement> = emptyMap(),
    val pullRequests: Map<String, JsonElement> = emptyMap(),
    val pullRequestKeyByBranch: Map<String, String> = emptyMap(),
    val projectPullRequestLists: Map<String, JsonElement> = emptyMap(),
) {
    companion object {
        val EMPTY: GitStateSnapshot = GitStateSnapshot(revision = 0)
    }
}

/**
 * Server-authored patch. Omitted optional maps preserve the prior state; a
 * `null` value in [pullRequestKeyByBranch] deletes the branch mapping.
 */
data class GitStatePatch(
    val revision: Int,
    val projects: Map<String, JsonElement>? = null,
    val targets: Map<String, JsonElement>? = null,
    val pullRequests: Map<String, JsonElement>? = null,
    val pullRequestKeyByBranch: Map<String, String?>? = null,
    val projectPullRequestLists: Map<String, JsonElement>? = null,
    val removeProjects: List<String>? = null,
    val removeTargets: List<String>? = null,
    val removePullRequests: List<String>? = null,
    val removeProjectPullRequestLists: List<String>? = null,
)

/** Strict-increasing revision check; lower/duplicate revisions are ignored. */
fun applyGitStatePatch(current: GitStateSnapshot, patch: GitStatePatch): GitStateSnapshot {
    if (patch.revision <= current.revision) return current
    return GitStateSnapshot(
        revision = patch.revision,
        projects = mergeRecords(omitKeys(current.projects, patch.removeProjects), patch.projects),
        targets = mergeRecords(omitKeys(current.targets, patch.removeTargets), patch.targets),
        pullRequests = mergeRecords(
            omitKeys(current.pullRequests, patch.removePullRequests),
            patch.pullRequests,
        ),
        pullRequestKeyByBranch = mergeNullableRecords(
            current.pullRequestKeyByBranch,
            patch.pullRequestKeyByBranch,
        ),
        projectPullRequestLists = mergeRecords(
            omitKeys(current.projectPullRequestLists, patch.removeProjectPullRequestLists),
            patch.projectPullRequestLists,
        ),
    )
}

private fun <T> omitKeys(
    source: Map<String, T>,
    keys: List<String>?,
): Map<String, T> {
    if (keys.isNullOrEmpty()) return source
    val removed = keys.toHashSet()
    val next = LinkedHashMap<String, T>()
    var changed = false
    for ((key, value) in source) {
        if (key in removed) {
            changed = true
            continue
        }
        next[key] = value
    }
    return if (changed) next else source
}

private fun <T> mergeRecords(
    current: Map<String, T>,
    patch: Map<String, T>?,
): Map<String, T> {
    if (patch.isNullOrEmpty()) return current
    val next = LinkedHashMap(current)
    next.putAll(patch)
    return next
}

private fun mergeNullableRecords(
    current: Map<String, String>,
    patch: Map<String, String?>?,
): Map<String, String> {
    if (patch.isNullOrEmpty()) return current
    val next = LinkedHashMap(current)
    for ((key, value) in patch) {
        if (value == null) {
            next.remove(key)
        } else {
            next[key] = value
        }
    }
    return next
}
