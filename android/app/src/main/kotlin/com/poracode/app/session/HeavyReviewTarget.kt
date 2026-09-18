package com.poracode.app.session

import com.poracode.app.model.ClientConnectionId

/**
 * Target identity of a currently-visible heavy review surface, used to extend
 * the passive Git-target interest set with the authoritative PR/review variants.
 * The pull-request variant carries the review bundle; the project-list variant
 * requests a project's PR list. Both are bound to the exact host
 * ([connectionId]); the composer drops any target whose host no longer matches.
 */
sealed class HeavyReviewTarget {
    abstract val connectionId: ClientConnectionId
    abstract val projectId: String

    data class PullRequest(
        override val connectionId: ClientConnectionId,
        override val projectId: String,
        val prNumber: Int,
        val branch: String?,
    ) : HeavyReviewTarget()

    data class ProjectList(
        override val connectionId: ClientConnectionId,
        override val projectId: String,
    ) : HeavyReviewTarget()
}
