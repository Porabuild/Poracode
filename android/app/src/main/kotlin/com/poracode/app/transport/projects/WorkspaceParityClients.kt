package com.poracode.app.transport.projects

import com.poracode.app.transport.RemoteApiClient
import com.poracode.app.transport.settings.HostParityClients
import java.net.URLEncoder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Native Android workspace parity clients covering:
 * - Editor & Environment Media leases (`file-media-ticket`, `file-media`, `file-media-release`,
 *   `file-media-renew`, `environment-media-ticket`, `environment-media-release`, `environment-media-renew`)
 * - Scoped PR/Forge operations (`forgeListPullRequestsInState`, `forgeGetPrCommitDiff`,
 *   `forgeSetPrReaction`, `forgeSubmitPrReviewDraft`, `ghPollPullRequests`, `pr-watch-scoped-upsert`)
 */
object WorkspaceParityClients {
    private val json = Json { ignoreUnknownKeys = true }

    val MEDIA_LEASE_ROUTE_IDS: List<String> = listOf(
        "file-media-ticket",
        "file-media",
        "file-media-release",
        "file-media-renew",
        "environment-media-ticket",
        "environment-media-release",
        "environment-media-renew",
    )

    const val PR_WATCH_SCOPED_UPSERT_ROUTE_ID = "pr-watch-scoped-upsert"

    suspend fun mintFileMediaTicket(path: String, projectLocation: JsonObject, api: RemoteApiClient): JsonObject {
        val body = buildJsonObject { put("path", path); put("projectLocation", projectLocation) }.toString()
        return parseObj(api.requestText("/api/files/media/ticket", method = "POST", jsonBody = body))
    }

    suspend fun renewFileMediaTicket(ticket: String, api: RemoteApiClient): JsonObject {
        val body = buildJsonObject { put("ticket", ticket) }.toString()
        return parseObj(api.requestText("/api/files/media/renew", method = "POST", jsonBody = body))
    }

    suspend fun releaseFileMediaTicket(ticket: String, api: RemoteApiClient) {
        val body = buildJsonObject { put("ticket", ticket) }.toString()
        api.requestText("/api/files/media/release", method = "POST", jsonBody = body)
    }

    suspend fun mintEnvironmentMediaTicket(environmentId: String, path: String, api: RemoteApiClient): JsonObject {
        val encoded = URLEncoder.encode(environmentId, "UTF-8")
        val body = buildJsonObject { put("path", path) }.toString()
        return parseObj(api.requestText("/api/environments/$encoded/media/ticket", method = "POST", jsonBody = body))
    }

    suspend fun renewEnvironmentMediaTicket(environmentId: String, ticket: String, api: RemoteApiClient): JsonObject {
        val encoded = URLEncoder.encode(environmentId, "UTF-8")
        val body = buildJsonObject { put("ticket", ticket) }.toString()
        return parseObj(api.requestText("/api/environments/$encoded/media/renew", method = "POST", jsonBody = body))
    }

    suspend fun releaseEnvironmentMediaTicket(environmentId: String, ticket: String, api: RemoteApiClient) {
        val encoded = URLEncoder.encode(environmentId, "UTF-8")
        val body = buildJsonObject { put("ticket", ticket) }.toString()
        api.requestText("/api/environments/$encoded/media/release", method = "POST", jsonBody = body)
    }

    // Scoped PR/Forge operations
    suspend fun forgeListPullRequestsInState(
        projectLocation: JsonObject,
        state: String,
        api: RemoteApiClient,
    ): JsonObject = HostParityClients.callProcedure(
        "forgeListPullRequestsInState",
        buildJsonObject { put("projectLocation", projectLocation); put("state", state) },
        api,
    )

    suspend fun forgeGetPrCommitDiff(
        projectLocation: JsonObject,
        prNumber: Int,
        commitSha: String,
        api: RemoteApiClient,
    ): JsonObject = HostParityClients.callProcedure(
        "forgeGetPrCommitDiff",
        buildJsonObject {
            put("projectLocation", projectLocation)
            put("number", prNumber)
            put("sha", commitSha)
        },
        api,
    )

    suspend fun forgeSetPrReaction(
        projectLocation: JsonObject,
        commentId: String,
        reaction: String,
        active: Boolean,
        api: RemoteApiClient,
    ): JsonObject = HostParityClients.callProcedure(
        "forgeSetPrReaction",
        buildJsonObject {
            put("projectLocation", projectLocation)
            put("commentId", commentId)
            put("reaction", reaction)
            put("active", active)
        },
        api,
    )

    suspend fun forgeSubmitPrReviewDraft(
        projectLocation: JsonObject,
        prNumber: Int,
        event: String,
        body: String,
        comments: JsonArray,
        api: RemoteApiClient,
    ): JsonObject = HostParityClients.callProcedure(
        "forgeSubmitPrReviewDraft",
        buildJsonObject {
            put("projectLocation", projectLocation)
            put("number", prNumber)
            put("event", event)
            put("body", body)
            put("comments", comments)
        },
        api,
    )

    suspend fun ghPollPullRequests(projectLocation: JsonObject, api: RemoteApiClient): JsonObject =
        HostParityClients.callProcedure(
            "ghPollPullRequests",
            buildJsonObject { put("projectLocation", projectLocation) },
            api,
        )

    suspend fun upsertScopedPrWatch(payload: JsonObject, api: RemoteApiClient): JsonObject =
        parseObj(api.requestText("/api/pr-watch/scoped", method = "POST", jsonBody = payload.toString()))

    private fun parseObj(raw: String): JsonObject =
        runCatching { json.parseToJsonElement(raw) as? JsonObject }.getOrNull() ?: buildJsonObject {}
}
