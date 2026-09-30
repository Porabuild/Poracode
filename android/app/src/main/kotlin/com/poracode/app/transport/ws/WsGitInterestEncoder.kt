package com.poracode.app.transport.ws

import com.poracode.app.protocol.git.GitInterest
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Encodes the three v3 Git-interest variants (+ exact-empty clear) into the
 * `git-state-interests` client message. Matches the wire shape exercised by
 * `protocol/remote/v3/fixtures/git-state-stream.json`. Callers send it under
 * the same socket identity/lock as thread interests — there is no second socket
 * and no retry loop.
 */
object WsGitInterestEncoder {
    const val MESSAGE_TYPE = "git-state-interests"

    fun encode(interests: List<GitInterest>): JsonArray = buildJsonArray {
        interests.forEach { interest ->
            when (interest) {
                is GitInterest.Target -> add(
                    buildJsonObject {
                        put("kind", "target")
                        put("projectId", interest.projectId)
                        interest.worktreePath?.let { put("worktreePath", it) }
                        interest.branch?.let { put("branch", it) }
                        interest.includePrDetails?.let { put("includePrDetails", it) }
                    },
                )
                is GitInterest.PullRequest -> add(
                    buildJsonObject {
                        put("kind", "pull-request")
                        put("projectId", interest.projectId)
                        put("prNumber", JsonPrimitive(interest.prNumber))
                        interest.branch?.let { put("branch", it) }
                        interest.includeReviewBundle?.let { put("includeReviewBundle", it) }
                    },
                )
                is GitInterest.ProjectPullRequests -> add(
                    buildJsonObject {
                        put("kind", "project-pull-requests")
                        put("projectId", interest.projectId)
                    },
                )
            }
        }
    }

    /** Stable structural key for "unchanged" comparison (order-sensitive). */
    fun signature(interests: List<GitInterest>): String =
        interests.joinToString("\u0001") { signatureOf(it) }

    private fun signatureOf(interest: GitInterest): String = when (interest) {
        is GitInterest.Target ->
            "target|${interest.projectId}|${interest.worktreePath ?: ""}|${interest.branch ?: ""}|${interest.includePrDetails}"
        is GitInterest.PullRequest ->
            "pull-request|${interest.projectId}|${interest.prNumber}|${interest.branch ?: ""}|${interest.includeReviewBundle}"
        is GitInterest.ProjectPullRequests ->
            "project-pull-requests|${interest.projectId}"
    }
}
