package com.poracode.app.model

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/**
 * Stable JSON-backed decoder for the optional remote Git/PR fields, sitting
 * behind the generated root codec. Generated hash-derived field names are never
 * referenced here: records are carried as opaque [JsonElement]s keyed by the
 * stable [GitStateDomain] keys, and only the compact UI-facing projections
 * ([RemoteGitSummary], [AgentStatusEntry]) are strongly typed.
 */
object GitStateJsonAdapter {
    fun decodeSnapshot(raw: JsonElement?): GitStateSnapshot? {
        val obj = raw?.asObjectOrNull() ?: return null
        val revision = obj.int("revision") ?: return null
        return GitStateSnapshot(
            revision = revision,
            projects = obj.obj("projects")?.toOpaqueMap() ?: emptyMap(),
            targets = obj.obj("targets")?.toOpaqueMap() ?: emptyMap(),
            pullRequests = obj.obj("pullRequests")?.toOpaqueMap() ?: emptyMap(),
            pullRequestKeyByBranch = decodeStringMap(obj.obj("pullRequestKeyByBranch")),
            projectPullRequestLists = obj.obj("projectPullRequestLists")?.toOpaqueMap() ?: emptyMap(),
        )
    }

    fun decodePatch(raw: JsonElement?): GitStatePatch? {
        val obj = raw?.asObjectOrNull() ?: return null
        val revision = obj.int("revision") ?: return null
        if (revision <= 0) return null
        return GitStatePatch(
            revision = revision,
            projects = obj.obj("projects")?.toOpaqueMap(),
            targets = obj.obj("targets")?.toOpaqueMap(),
            pullRequests = obj.obj("pullRequests")?.toOpaqueMap(),
            pullRequestKeyByBranch = decodeNullableStringMap(obj.obj("pullRequestKeyByBranch")),
            projectPullRequestLists = obj.obj("projectPullRequestLists")?.toOpaqueMap(),
            removeProjects = decodeStringList(obj, "removeProjects"),
            removeTargets = decodeStringList(obj, "removeTargets"),
            removePullRequests = decodeStringList(obj, "removePullRequests"),
            removeProjectPullRequestLists = decodeStringList(obj, "removeProjectPullRequestLists"),
        )
    }

    fun decodeSummaries(raw: JsonElement?): Map<String, RemoteGitSummary> {
        val obj = raw?.asObjectOrNull() ?: return emptyMap()
        val out = LinkedHashMap<String, RemoteGitSummary>()
        for ((threadId, value) in obj) {
            val summary = value.asObjectOrNull()?.let(::decodeSummary) ?: continue
            out[threadId] = summary
        }
        return out
    }

    fun decodeSummary(obj: JsonObject): RemoteGitSummary? {
        val isRepo = obj["isRepo"]?.booleanOrNull() ?: return null
        return RemoteGitSummary(
            isRepo = isRepo,
            branch = obj.string("branch").orEmpty(),
            totalInsertions = obj.int("totalInsertions") ?: 0,
            totalDeletions = obj.int("totalDeletions") ?: 0,
            ahead = obj.int("ahead") ?: 0,
            behind = obj.int("behind") ?: 0,
            pr = decodePr(obj["pr"]),
        )
    }

    private fun decodePr(raw: JsonElement?): RemoteGitPrSummary? {
        val obj = raw?.asObjectOrNull() ?: return null
        val number = obj.int("number") ?: return null
        return RemoteGitPrSummary(
            number = number,
            state = obj.string("state").orEmpty(),
            title = obj.string("title").orEmpty(),
            url = obj.string("url").orEmpty(),
            isDraft = obj["isDraft"]?.booleanOrNull() ?: false,
            checksStatus = obj.string("checksStatus"),
        )
    }

    fun decodeAgentStatus(raw: JsonElement?): AgentStatusEntry? {
        val obj = raw?.asObjectOrNull() ?: return null
        val kind = obj.string("kind") ?: return null
        val envKind = obj.string("envKind").orEmpty()
        val envDistro = obj.string("envDistro").orEmpty()
        return AgentStatusEntry(
            identityKey = AgentStatusEntry.identityKey(kind, envKind, envDistro),
            kind = kind,
            label = obj.string("label").orEmpty(),
            installed = obj["installed"]?.booleanOrNull() ?: false,
            version = obj.string("version"),
            authState = obj.string("authState").orEmpty(),
            envKind = envKind,
            envDistro = envDistro,
        )
    }

    fun decodeAgentStatuses(raw: JsonElement?): List<AgentStatusEntry> {
        val arr = raw as? kotlinx.serialization.json.JsonArray ?: return emptyList()
        return arr.mapNotNull(::decodeAgentStatus)
    }

    private fun JsonObject.toOpaqueMap(): Map<String, JsonElement> {
        val out = LinkedHashMap<String, JsonElement>()
        for ((key, value) in this) out[key] = value
        return out
    }

    private fun decodeStringMap(obj: JsonObject?): Map<String, String> {
        if (obj == null) return emptyMap()
        val out = LinkedHashMap<String, String>()
        for ((key, value) in obj) {
            val s = value.stringOrNull() ?: continue
            out[key] = s
        }
        return out
    }

    private fun decodeNullableStringMap(obj: JsonObject?): Map<String, String?>? {
        if (obj == null) return null
        val out = LinkedHashMap<String, String?>()
        for ((key, value) in obj) {
            out[key] = if (value is kotlinx.serialization.json.JsonNull) null else value.stringOrNull()
        }
        return out
    }

    private fun decodeStringList(obj: JsonObject, key: String): List<String>? {
        val arr = obj.array(key) ?: return null
        return arr.mapNotNull { it.stringOrNull() }
    }
}

/** Compact per-thread Git/PR summary for thread-list and rich-chat headers. */
data class RemoteGitSummary(
    val isRepo: Boolean,
    val branch: String,
    val totalInsertions: Int,
    val totalDeletions: Int,
    val ahead: Int,
    val behind: Int,
    val pr: RemoteGitPrSummary?,
) {
    /** Whether there is any meaningful diff/PR signal worth showing. */
    val hasSignal: Boolean
        get() = isRepo && (totalInsertions != 0 || totalDeletions != 0 || ahead != 0 || behind != 0 || pr != null)
}

data class RemoteGitPrSummary(
    val number: Int,
    val state: String,
    val title: String,
    val url: String,
    val isDraft: Boolean,
    val checksStatus: String?,
)

/**
 * Agent status cache entry. Identity is the (kind, envKind, envDistro) triple —
 * matches the desktop supervisor cache and the parity-tape formula. A Windows
 * scan and a WSL scan never share identity, even for the same provider kind.
 */
data class AgentStatusEntry(
    val identityKey: String,
    val kind: String,
    val label: String,
    val installed: Boolean,
    val version: String?,
    val authState: String,
    val envKind: String,
    val envDistro: String,
) {
    companion object {
        const val ENV_WINDOWS = "windows"
        const val ENV_WSL = "wsl"
        const val ENV_POSIX = "posix"

        fun identityKey(kind: String, envKind: String, envDistro: String): String =
            "$kind|$envKind|$envDistro"
    }
}
